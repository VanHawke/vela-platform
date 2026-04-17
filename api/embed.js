// api/embed.js — Generate and store vector embeddings for semantic search (RAG)
// Uses OpenAI text-embedding-3-small (1536 dims) to embed knowledge, deals, contacts.
// Called by: (1) cron to embed knowledge domains nightly, (2) on-demand for search queries.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export const config = { maxDuration: 60 };

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`OpenAI embedding error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

// Chunk text into ~500 word segments with overlap
function chunkText(text, maxChars = 2000, overlap = 200) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  return chunks;
}

export default async function handler(req, res) {
  try {
    // POST mode 1: Embed knowledge domains (cron/batch)
    // POST mode 2: Search by query (returns matching chunks)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { mode = 'search', query, domains } = body;

    if (mode === 'search' && query) {
      // Semantic search — embed query, find nearest chunks
      const queryEmbedding = await getEmbedding(query);
      const { data, error } = await supabase.rpc('match_embeddings', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 5,
        match_threshold: 0.65,
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ results: data || [] });
    }

    if (mode === 'embed') {
      // Embed knowledge domains into vector store
      const targetDomains = domains || null;
      const { data: knowledge } = await supabase.from('kiko_knowledge').select('domain, content');
      if (!knowledge) return res.json({ embedded: 0 });

      const toEmbed = targetDomains
        ? knowledge.filter(k => targetDomains.includes(k.domain))
        : knowledge;

      let embedded = 0;
      for (const k of toEmbed) {
        if (!k.content || k.content.length < 50) continue;
        const chunks = chunkText(k.content);
        // Delete old embeddings for this domain
        await supabase.from('kiko_embeddings').delete().eq('source_type', 'knowledge').eq('source_id', k.domain);

        for (let i = 0; i < chunks.length; i++) {
          try {
            const embedding = await getEmbedding(chunks[i]);
            await supabase.from('kiko_embeddings').insert({
              org_id: ORG_ID,
              source_type: 'knowledge',
              source_id: k.domain,
              chunk_text: chunks[i],
              embedding: JSON.stringify(embedding),
              metadata: { chunk_index: i, total_chunks: chunks.length, domain: k.domain },
            });
            embedded++;
          } catch (err) {
            console.error(`[embed] ${k.domain} chunk ${i} failed:`, err.message);
          }
        }
      }
      return res.json({ embedded, domains: toEmbed.length });
    }

    return res.status(400).json({ error: 'mode must be "search" or "embed"' });
  } catch (err) {
    console.error('[embed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
