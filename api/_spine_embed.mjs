// api/_spine_embed.mjs — Backfill embeddings for kiko_knowledge_spine.
// Resumable: only embeds rows where embedding IS NULL. Safe to re-run.
// Usage: node api/_spine_embed.mjs [maxRows]
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
                        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
                        { auth: { persistSession: false } });
const OPENAI_KEY = process.env.OPENAI_KEY;
const MAX = parseInt(process.argv[2] || "999999", 10);
const PAGE = 100;          // rows fetched per loop
const EMBED_BATCH = 96;    // OpenAI allows many inputs per call; keep margin

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts.map(t => t.slice(0, 6000)) }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0,200)}`);
  const j = await res.json();
  return j.data.map(d => d.embedding);
}

let done = 0, failed = 0;
const startTotal = (await sb.from("kiko_knowledge_spine").select("id", { count: "exact", head: true }).is("embedding", null)).count;
console.log(`START: ${startTotal} rows need embedding (cap ${MAX})`);

while (done < MAX) {
  const { data: rows, error } = await sb.from("kiko_knowledge_spine")
    .select("id, content").is("embedding", null).limit(PAGE);
  if (error) { console.log("FETCH_ERR", error.message); break; }
  if (!rows || rows.length === 0) { console.log("NO MORE ROWS — complete"); break; }

  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const slice = rows.slice(i, i + EMBED_BATCH);
    try {
      const embs = await embedBatch(slice.map(r => r.content || ""));
      // Write back individually (Supabase update per id); could be optimised but reliable.
      await Promise.all(slice.map((r, k) =>
        sb.from("kiko_knowledge_spine").update({ embedding: JSON.stringify(embs[k]) }).eq("id", r.id)
      ));
      done += slice.length;
    } catch (e) {
      failed += slice.length;
      console.log("BATCH_FAIL", e.message.slice(0, 120));
      await new Promise(r => setTimeout(r, 2000)); // backoff then continue
    }
    if (done % 500 < EMBED_BATCH) console.log(`PROGRESS embedded=${done} failed=${failed}`);
    if (done >= MAX) break;
  }
}
console.log(`EMBED_DONE embedded=${done} failed=${failed}`);
