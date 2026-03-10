// api/documents.js — document processing, embedding, and search for Kiko

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

async function extractText(storagePath, fileType, publicUrl) {
  const fileRes = await fetch(publicUrl)
  if (!fileRes.ok) throw new Error(`Failed to download file from storage: ${fileRes.status}`)

  const isImage = fileType?.includes('image') || /\.(png|jpg|jpeg|webp|gif)$/i.test(storagePath)
  const isPDF = fileType === 'application/pdf' || storagePath.endsWith('.pdf')
  const isDOCX = fileType?.includes('wordprocessingml') || storagePath.endsWith('.docx')

  if (isImage) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
    const buffer = await fileRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mt = (fileType && fileType.startsWith('image/')) ? fileType : 'image/jpeg'
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mt, data: base64 } }, { type: 'text', text: 'Extract all text visible in this image. If minimal text, describe the image content in full detail. Be comprehensive.' }] }],
    })
    return r.content[0]?.text || ''
  }

  if (isPDF) {
    const buffer = await fileRes.arrayBuffer()
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
    const data = await pdfParse(Buffer.from(buffer))
    return data.text || ''
  }

  if (isDOCX) {
    const buffer = await fileRes.arrayBuffer()
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value || ''
  }

  return await fileRes.text()
}

function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = []
  const clean = text.replace(/\s+/g, ' ').trim()
  let start = 0
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length)
    const chunk = clean.slice(start, end).trim()
    if (chunk.length > 50) chunks.push(chunk)
    start += chunkSize - overlap
    if (start >= clean.length) break
  }
  return chunks
}

async function embedText(text) {
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
  return r.data[0].embedding
}

async function summarise(text) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: `Summarise this document in 1-2 sentences. Be specific:\n\n${text.slice(0, 3000)}` }],
  })
  return r.content[0]?.text || ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { action, storagePath, publicUrl, fileName, fileType, accessLevel, userEmail, query } = req.body
  const SB = process.env.VITE_SUPABASE_URL
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!SB || !SK) return res.status(500).json({ error: 'Supabase not configured' })

  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

  // ── PROCESS: extract → summarise → store → chunk → embed ──
  if (action === 'process') {
    if (!storagePath || !fileName || !userEmail) return res.status(400).json({ error: 'storagePath, fileName, userEmail required' })
    try {
      console.log(`[Documents] Processing: ${fileName}`)

      const text = await extractText(storagePath, fileType, publicUrl)
      if (!text || text.trim().length < 10) return res.status(422).json({ error: 'Could not extract meaningful text from document' })
      console.log(`[Documents] Extracted ${text.length} chars`)

      const summary = await summarise(text)

      const docRes = await fetch(`${SB}/rest/v1/documents`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_email: userEmail,
          name: fileName,
          doc_type: fileType || 'text/plain',
          summary,
          content: text.slice(0, 10000),
          storage_path: storagePath,
          access_level: accessLevel || 'private',
          created_at: new Date().toISOString(),
        }),
      })
      const docData = await docRes.json()
      const documentId = Array.isArray(docData) ? docData[0]?.id : docData?.id
      if (!documentId) {
        console.error('[Documents] Failed to create document record:', JSON.stringify(docData))
        return res.status(500).json({ error: 'Failed to store document record' })
      }
      console.log(`[Documents] Record created: ${documentId}`)

      const chunks = chunkText(text)
      console.log(`[Documents] Embedding ${chunks.length} chunks`)

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embedText(chunks[i])
        await fetch(`${SB}/rest/v1/document_chunks`, {
          method: 'POST',
          headers: { ...h, Prefer: 'return=minimal' },
          body: JSON.stringify({
            document_id: documentId,
            content: chunks[i],
            chunk_index: i,
            embedding: JSON.stringify(embedding),
            created_at: new Date().toISOString(),
          }),
        })
      }
      console.log(`[Documents] All ${chunks.length} chunks stored`)

      const memKey = process.env.MEM0_API_KEY
      if (memKey && summary) {
        fetch('https://api.mem0.ai/v1/memories/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Token ${memKey}` },
          body: JSON.stringify({
            messages: [{ role: 'system', content: `Document uploaded: "${fileName}" — ${summary} [access: ${accessLevel || 'private'}] [doc_id: ${documentId}]` }],
            user_id: 'sunny',
          }),
        }).catch(() => {})
      }

      return res.status(200).json({ success: true, documentId, chunks: chunks.length, summary })
    } catch (err) {
      console.error('[Documents] Process error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── SEARCH: embed query → match chunks → return context ──
  if (action === 'search') {
    if (!query || !userEmail) return res.status(400).json({ error: 'query and userEmail required' })
    try {
      const embedding = await embedText(query)
      const rpcRes = await fetch(`${SB}/rest/v1/rpc/match_document_chunks`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ query_embedding: embedding, match_threshold: 0.65, match_count: 5, p_user_email: userEmail }),
      })
      const results = await rpcRes.json()
      if (!Array.isArray(results)) {
        console.error('[Documents] RPC error:', results)
        return res.status(500).json({ error: 'Search RPC failed', details: results })
      }
      const docIds = [...new Set(results.map(r => r.document_id))].filter(Boolean)
      let docMap = {}
      if (docIds.length > 0) {
        const docsRes = await fetch(`${SB}/rest/v1/documents?id=in.(${docIds.join(',')})&select=id,name,access_level`, { headers: h })
        const docs = await docsRes.json()
        docMap = Object.fromEntries((Array.isArray(docs) ? docs : []).map(d => [d.id, d]))
      }
      return res.status(200).json({
        results: results.map(r => ({
          content: r.content,
          similarity: r.similarity,
          documentName: docMap[r.document_id]?.name || 'Unknown document',
          documentId: r.document_id,
        })),
      })
    } catch (err) {
      console.error('[Documents] Search error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use process or search.' })
}
