// api/documents.js — Document Intelligence: extract, analyse, embed, link to CRM

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

async function extractText(storagePath, fileType, publicUrl) {
  console.log(`[Documents] Downloading: ${publicUrl?.slice(0, 100)}`)
  const fileRes = await fetch(publicUrl)
  if (!fileRes.ok) throw new Error(`Download failed (${fileRes.status}). Check the file URL is accessible.`)

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  console.log(`[Documents] Downloaded ${buffer.length} bytes, type: ${fileType}, path: ${storagePath}`)
  
  const ext = (storagePath || '').split('.').pop()?.toLowerCase()
  const isImage = fileType?.includes('image') || ['png','jpg','jpeg','webp','gif'].includes(ext)
  const isPPTX = fileType?.includes('presentation') || ext === 'pptx'
  const isPDF = fileType === 'application/pdf' || ext === 'pdf'
  const isDOCX = fileType?.includes('wordprocessingml') || ext === 'docx' || ext === 'doc'

  // Images → Claude vision
  if (isImage) {
    console.log('[Documents] Using Claude vision for image')
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
    const base64 = buffer.toString('base64')
    const mt = (fileType && fileType.startsWith('image/')) ? fileType : 'image/jpeg'
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 2048,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: 'Extract ALL text visible in this image. If minimal text, describe the image content comprehensively. Include numbers, stats, logos, and brand names.' }
      ] }],
    })
    return r.content[0]?.text || ''
  }

  // PPTX → try officeparser, fallback to ZIP XML extraction
  if (isPPTX) {
    // Method 1: officeparser
    try {
      console.log('[Documents] Trying officeparser for PPTX')
      const { parseOffice } = await import('officeparser')
      const ast = await parseOffice(buffer)
      const text = ast.toText?.() || ''
      if (text.trim().length > 20) { console.log(`[Documents] officeparser OK: ${text.length} chars`); return text }
    } catch (e) { console.log('[Documents] officeparser failed:', e.message) }
    
    // Method 2: ZIP-based XML extraction (PPTX is a ZIP of XMLs)
    try {
      console.log('[Documents] Trying ZIP XML extraction for PPTX')
      const JSZip = (await import('jszip')).default || (await import('jszip'))
      const zip = await JSZip.loadAsync(buffer)
      let allText = ''
      const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml/)).sort()
      for (const sf of slideFiles) {
        const xml = await zip.files[sf].async('text')
        const texts = xml.match(/<a:t>([^<]*)<\/a:t>/g)?.map(m => m.replace(/<\/?a:t>/g, '')) || []
        allText += texts.join(' ') + '\n'
      }
      if (allText.trim().length > 20) { console.log(`[Documents] ZIP extraction OK: ${allText.length} chars`); return allText }
    } catch (e) { console.log('[Documents] ZIP extraction failed:', e.message) }
    
    // Method 3: Claude vision on first few KB (last resort)
    console.log('[Documents] All PPTX methods failed, returning raw text filter')
    return buffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // PDF → multiple fallbacks
  if (isPDF) {
    // Method 1: pdf-parse (standard import)
    try {
      console.log('[Documents] Trying pdf-parse for PDF')
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)
      if (data.text?.trim().length > 20) { console.log(`[Documents] pdf-parse OK: ${data.text.length} chars`); return data.text }
    } catch (e) { console.log('[Documents] pdf-parse standard import failed:', e.message) }

    // Method 2: pdf-parse deep import
    try {
      console.log('[Documents] Trying pdf-parse deep import')
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(buffer)
      if (data.text?.trim().length > 20) { console.log(`[Documents] pdf-parse deep OK: ${data.text.length} chars`); return data.text }
    } catch (e) { console.log('[Documents] pdf-parse deep import failed:', e.message) }

    // Method 3: officeparser (handles PDF too)
    try {
      console.log('[Documents] Trying officeparser for PDF')
      const { parseOffice } = await import('officeparser')
      const ast = await parseOffice(buffer)
      const text = ast.toText?.() || ''
      if (text.trim().length > 20) { console.log(`[Documents] officeparser PDF OK: ${text.length} chars`); return text }
    } catch (e) { console.log('[Documents] officeparser PDF failed:', e.message) }

    // Method 4: Claude vision (convert PDF concept to image-based extraction)
    console.log('[Documents] All PDF parsers failed, using Claude vision on raw content')
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
    const base64 = buffer.toString('base64')
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Extract ALL text from this PDF document. Include every heading, paragraph, number, statistic, and data point. Be comprehensive.' }
      ] }],
    })
    return r.content[0]?.text || ''
  }

  // DOCX → mammoth
  if (isDOCX) {
    try {
      console.log('[Documents] Using mammoth for DOCX')
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value || ''
    } catch (e) {
      console.log('[Documents] mammoth failed:', e.message)
      throw new Error(`DOCX parsing failed: ${e.message}`)
    }
  }

  // Plain text fallback
  console.log('[Documents] Using plain text extraction')
  return buffer.toString('utf-8')
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

async function deepAnalysis(text, fileName) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
  const r = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 2000,
    messages: [{ role: 'user', content: `You are analysing a business document. The document is titled "${fileName}".

This could be from any industry — F1, Formula E, other motorsports, technology, luxury, finance, consulting, or any other business. Analyse it universally.

Extract the following as JSON (no markdown, no backticks, just raw JSON):
{
  "summary": "2-3 sentence summary of the document",
  "key_stats": ["array of specific numbers, metrics, financial figures mentioned"],
  "messaging_tone": "describe the tone and communication style in one phrase",
  "positioning": "how does this entity position itself in one sentence",
  "value_propositions": ["array of key value props or selling points"],
  "target_audience": "who is this document aimed at",
  "talking_points": ["array of notable claims, achievements, or angles"],
  "partner_benefits": ["array of partnership/sponsorship/commercial benefits mentioned"],
  "unique_angles": ["what makes this entity distinctive"],
  "detected_context": "one of: f1, formula_e, motorsport, sport, technology, luxury, finance, consulting, media, general",
  "detected_entity": "the primary organisation, team, brand, or company this document is about — or null",
  "detected_team": "if this relates to an F1 team specifically, which one (Alpine, Aston Martin, Audi, Cadillac, Ferrari, Haas, McLaren, Mercedes, Racing Bulls, Red Bull Racing, Williams) — or null",
  "detected_company": "company or organisation name mentioned — or null",
  "suggested_category": "one of: deck, proposal, contract, brief, report, media_kit, research, playbook, other"
}

Be specific. Extract real numbers. If data isn't present, use null or empty arrays.

Document text:
${text.slice(0, 12000)}` }],
  })
  try {
    const raw = r.content[0]?.text || '{}'
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```/g, '').trim())
  } catch {
    return { summary: r.content[0]?.text?.slice(0, 200) || 'Analysis failed', key_stats: [], messaging_tone: null, positioning: null, value_propositions: [], target_audience: null, talking_points: [], partner_benefits: [], unique_angles: [], detected_team: null, detected_company: null, suggested_category: 'other' }
  }
}

async function autoLink(intelligence, SB, h) {
  const result = { linked_company_id: null, linked_team: null }
  // Match F1 team
  if (intelligence.detected_team) {
    const teamRes = await fetch(`${SB}/rest/v1/f1_teams?name=ilike.*${encodeURIComponent(intelligence.detected_team)}*&select=name&limit=1`, { headers: h })
    const teams = await teamRes.json()
    if (Array.isArray(teams) && teams[0]) result.linked_team = teams[0].name
  }
  // Match company
  if (intelligence.detected_company) {
    const compRes = await fetch(`${SB}/rest/v1/companies?data->>name=ilike.*${encodeURIComponent(intelligence.detected_company)}*&select=id&limit=1`, { headers: h })
    const comps = await compRes.json()
    if (Array.isArray(comps) && comps[0]) result.linked_company_id = comps[0].id
  }
  return result
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, storagePath, publicUrl, fileName, fileType, accessLevel, userEmail, query, team, category, documentId, linkedCompanyId, linkedDealId, linkedTeam } = req.body
  const SB = process.env.VITE_SUPABASE_URL
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!SB || !SK) return res.status(500).json({ error: 'Supabase not configured' })
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

  // ── PROCESS: extract → deep analyse → auto-link → store → chunk → embed → mem0 ──
  if (action === 'process') {
    if (!storagePath || !fileName || !userEmail) return res.status(400).json({ error: 'storagePath, fileName, userEmail required' })
    try {
      console.log(`[Documents] Processing: ${fileName}`)
      const text = await extractText(storagePath, fileType, publicUrl)
      if (!text || text.trim().length < 10) return res.status(422).json({ error: 'Could not extract meaningful text' })
      console.log(`[Documents] Extracted ${text.length} chars`)

      // Deep analysis via Sonnet
      console.log(`[Documents] Running deep analysis...`)
      const intelligence = await deepAnalysis(text, fileName)
      console.log(`[Documents] Analysis complete. Team: ${intelligence.detected_team}, Category: ${intelligence.suggested_category}`)

      // Auto-link to CRM
      const links = await autoLink(intelligence, SB, h)

      // Store document record
      const docPayload = {
        user_email: userEmail, name: fileName, doc_type: fileType || 'text/plain',
        summary: intelligence.summary || '', content: text.slice(0, 15000),
        storage_path: storagePath, access_level: accessLevel || 'private',
        org_id: ORG_ID, intelligence, scan_status: 'complete',
        last_scanned_at: new Date().toISOString(), scan_version: 1,
        category: category || intelligence.suggested_category || 'other',
        context: intelligence.detected_context || 'general',
        linked_entity: intelligence.detected_entity || null,
        linked_team: linkedTeam || links.linked_team, linked_company_id: linkedCompanyId || links.linked_company_id,
        linked_deal_id: linkedDealId || null,
        source: 'upload', created_at: new Date().toISOString(),
      }
      const docRes = await fetch(`${SB}/rest/v1/documents`, {
        method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(docPayload),
      })
      const docData = await docRes.json()
      const docId = Array.isArray(docData) ? docData[0]?.id : docData?.id
      if (!docId) {
        console.error('[Documents] Failed to create record:', JSON.stringify(docData))
        return res.status(500).json({ error: 'Failed to store document' })
      }
      console.log(`[Documents] Record created: ${docId}`)

      // Chunk and embed
      const chunks = chunkText(text)
      console.log(`[Documents] Embedding ${chunks.length} chunks`)
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embedText(chunks[i])
        await fetch(`${SB}/rest/v1/document_chunks`, {
          method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
          body: JSON.stringify({ document_id: docId, content: chunks[i], chunk_index: i, embedding: JSON.stringify(embedding), org_id: ORG_ID, created_at: new Date().toISOString() }),
        })
      }

      // Commit to Mem0 — structured intelligence, not just summary
      const memKey = process.env.MEM0_API_KEY
      if (memKey && intelligence) {
        const teamLabel = intelligence.detected_team ? ` (${intelligence.detected_team})` : ''
        const stats = (intelligence.key_stats || []).join(', ')
        const points = (intelligence.talking_points || []).join(', ')
        const benefits = (intelligence.partner_benefits || []).join(', ')
        const memContent = `[DOCUMENT INTELLIGENCE] ${fileName}${teamLabel}: ${intelligence.summary || ''} | Key stats: ${stats} | Tone: ${intelligence.messaging_tone || 'N/A'} | Positioning: ${intelligence.positioning || 'N/A'} | Talking points: ${points} | Partner benefits: ${benefits} | Unique angles: ${(intelligence.unique_angles || []).join(', ')}`
        fetch('https://api.mem0.ai/v1/memories/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Token ${memKey}` },
          body: JSON.stringify({ messages: [{ role: 'system', content: memContent.slice(0, 2000) }], user_id: 'sunny' }),
        }).catch(() => {})
      }
      console.log(`[Documents] Complete: ${chunks.length} chunks, team=${links.linked_team}`)
      return res.status(200).json({ success: true, documentId: docId, chunks: chunks.length, summary: intelligence.summary, intelligence, links })
    } catch (err) {
      console.error('[Documents] Process error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── SEARCH: embed query → match chunks → return with intelligence context ──
  if (action === 'search') {
    if (!query) return res.status(400).json({ error: 'query required' })
    try {
      const embedding = await embedText(query)
      console.log(`[Documents] Search query: "${query}", embedding dims: ${embedding.length}`)

      // Method 1: RPC vector search (pass embedding as string for Supabase)
      let results = []
      try {
        const embeddingStr = `[${embedding.join(',')}]`
        const rpcRes = await fetch(`${SB}/rest/v1/rpc/match_document_chunks`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ query_embedding: embeddingStr, match_threshold: 0.5, match_count: 8, p_user_email: userEmail || 'sunny@vanhawke.com' }),
        })
        const rpcData = await rpcRes.json()
        console.log(`[Documents] RPC response: ${rpcRes.status}, results: ${Array.isArray(rpcData) ? rpcData.length : 'not array'}, data: ${JSON.stringify(rpcData).slice(0, 200)}`)
        if (Array.isArray(rpcData) && rpcData.length > 0) results = rpcData
      } catch (e) { console.log('[Documents] RPC search failed:', e.message) }

      // Method 2: Fallback — direct text search on document content if vector search returns nothing
      if (results.length === 0) {
        console.log('[Documents] Vector search returned 0 results, falling back to text search')
        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 3)
        const textFilter = words.map(w => `content.ilike.*${encodeURIComponent(w)}*`).join('&')
        const textRes = await fetch(`${SB}/rest/v1/documents?${textFilter}&select=id,name,linked_team,category,context,linked_entity,intelligence,summary,content&limit=5`, { headers: h })
        const textDocs = await textRes.json()
        console.log(`[Documents] Text fallback: ${Array.isArray(textDocs) ? textDocs.length : 0} docs`)
        if (Array.isArray(textDocs) && textDocs.length > 0) {
          return res.status(200).json({
            results: textDocs.map(d => ({
              content: d.content?.slice(0, 500) || d.summary || '', similarity: 0.8,
              documentId: d.id, documentName: d.name, team: d.linked_team,
              category: d.category, intelligence: d.intelligence,
            })),
          })
        }
      }

      if (!results.length) return res.status(200).json({ results: [] })

      // Enrich with document metadata + intelligence
      const docIds = [...new Set(results.map(r => r.document_id))].filter(Boolean)
      let docMap = {}
      if (docIds.length > 0) {
        let filter = `id=in.(${docIds.join(',')})`
        if (team) filter += `&linked_team=ilike.*${encodeURIComponent(team)}*`
        if (category) filter += `&category=eq.${encodeURIComponent(category)}`
        const docsRes = await fetch(`${SB}/rest/v1/documents?${filter}&select=id,name,linked_team,category,intelligence,summary`, { headers: h })
        const docs = await docsRes.json()
        docMap = Object.fromEntries((Array.isArray(docs) ? docs : []).map(d => [d.id, d]))
      }
      return res.status(200).json({
        results: results.filter(r => docMap[r.document_id]).map(r => ({
          content: r.content, similarity: r.similarity, documentId: r.document_id,
          documentName: docMap[r.document_id]?.name, team: docMap[r.document_id]?.linked_team,
          category: docMap[r.document_id]?.category, intelligence: docMap[r.document_id]?.intelligence,
        })),
      })
    } catch (err) {
      console.error('[Documents] Search error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── LIST: get documents with filters ──
  if (action === 'list') {
    const { context: ctx } = req.body
    let filter = `org_id=eq.${ORG_ID}`
    if (team) filter += `&linked_team=ilike.*${encodeURIComponent(team)}*`
    if (category) filter += `&category=eq.${encodeURIComponent(category)}`
    if (ctx && ctx !== 'all') filter += `&context=eq.${encodeURIComponent(ctx)}`
    const docsRes = await fetch(`${SB}/rest/v1/documents?${filter}&order=created_at.desc&select=id,name,doc_type,summary,tags,category,context,linked_team,linked_entity,linked_company_id,intelligence,scan_status,last_scanned_at,access_level,created_at,storage_path`, { headers: h })
    const docs = await docsRes.json()
    return res.status(200).json({ documents: Array.isArray(docs) ? docs : [] })
  }

  // ── RESCAN: re-analyse existing document ──
  if (action === 'rescan') {
    if (!documentId) return res.status(400).json({ error: 'documentId required' })
    try {
      // Get existing document
      const docRes = await fetch(`${SB}/rest/v1/documents?id=eq.${documentId}&select=*`, { headers: h })
      const docs = await docRes.json()
      const doc = Array.isArray(docs) ? docs[0] : null
      if (!doc) return res.status(404).json({ error: 'Document not found' })

      // Update status
      await fetch(`${SB}/rest/v1/documents?id=eq.${documentId}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ scan_status: 'scanning' }) })

      // Re-extract if we have storage path
      let text = doc.content || ''
      if (doc.storage_path) {
        const { data: { publicUrl } } = await (await import('@supabase/supabase-js')).createClient(SB, SK).storage.from('vela-assets').getPublicUrl(doc.storage_path)
        if (publicUrl) text = await extractText(doc.storage_path, doc.doc_type, publicUrl)
      }

      // Re-analyse
      const intelligence = await deepAnalysis(text, doc.name)
      const links = await autoLink(intelligence, SB, h)

      // Update document
      await fetch(`${SB}/rest/v1/documents?id=eq.${documentId}`, {
        method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ intelligence, scan_status: 'complete', last_scanned_at: new Date().toISOString(), scan_version: (doc.scan_version || 0) + 1, linked_team: links.linked_team || doc.linked_team, linked_company_id: links.linked_company_id || doc.linked_company_id, category: intelligence.suggested_category || doc.category, summary: intelligence.summary || doc.summary }),
      })
      return res.status(200).json({ success: true, intelligence, links })
    } catch (err) {
      await fetch(`${SB}/rest/v1/documents?id=eq.${documentId}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ scan_status: 'error' }) })
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: process, search, list, rescan' })
}
