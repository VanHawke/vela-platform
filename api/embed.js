// api/embed.js — Vector embedding pipeline for semantic search (RAG)
// Uses OpenAI text-embedding-3-small (1536 dims).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export const config = { maxDuration: 60 };

async function getEmbedding(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => 'no body');
    throw new Error(`OpenAI ${r.status}: ${errText.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

function chunkText(text, max = 2000) {
  if (text.length <= max) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += max - 200) {
    chunks.push(text.slice(i, i + max));
  }
  return chunks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { mode = 'search', query, domains } = body;

    // Health check
    if (mode === 'health') {
      return res.json({ ok: true, hasKey: !!process.env.OPENAI_KEY });
    }

    // Semantic search
    if (mode === 'search' && query) {
      const emb = await getEmbedding(query);
      const { data, error } = await supabase.rpc('match_embeddings', {
        query_embedding: `[${emb.join(',')}]`,
        match_count: 5,
        match_threshold: 0.25,
      });
      if (error) return res.status(500).json({ error: error.message, hint: 'RPC call failed' });
      return res.json({ results: data || [], query_dims: emb.length });
    }

    // Embed knowledge domains
    if (mode === 'embed') {
      const { data: knowledge } = await supabase.from('kiko_knowledge').select('domain, content');
      if (!knowledge) return res.json({ embedded: 0 });
      const toEmbed = domains ? knowledge.filter(k => domains.includes(k.domain)) : knowledge;
      let embedded = 0;

      for (const k of toEmbed) {
        if (!k.content || k.content.length < 50) continue;
        const chunks = chunkText(k.content);
        await supabase.from('kiko_embeddings').delete()
          .eq('source_type', 'knowledge').eq('source_id', k.domain);

        for (let i = 0; i < chunks.length; i++) {
          try {
            const emb = await getEmbedding(chunks[i]);
            const { error } = await supabase.from('kiko_embeddings').insert({
              org_id: ORG_ID,
              source_type: 'knowledge',
              source_id: k.domain,
              chunk_text: chunks[i],
              embedding: `[${emb.join(',')}]`,
              metadata: { chunk_index: i, total_chunks: chunks.length },
            });
            if (error) throw new Error(error.message);
            embedded++;
          } catch (e) {
            console.error(`[embed] ${k.domain}[${i}]:`, e.message);
          }
        }
      }
      return res.json({ embedded, domains: toEmbed.length });
    }

    return res.status(400).json({ error: 'mode: health|search|embed' });
  } catch (err) {
    console.error('[embed] Fatal:', err.message, err.stack?.slice(0, 300));
    return res.status(500).json({ error: err.message });
  }
}
