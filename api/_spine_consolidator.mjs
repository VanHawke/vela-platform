// Knowledge Spine Consolidator — Learning Loop Phases 2+3. KIKO-NATIVE: synthesis uses her own
// Opus brain; a deterministic auditor gates every output (citation-or-rejection). Hard-capped.
// Usage: node api/_spine_consolidator.mjs ingest | synthesize
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = "35975d96-c2c9-4b6c-b4d4-bb947ae817d5";
const MODE = process.argv[2] || "ingest";
const MAX_ENTITIES_PER_RUN = 8, MIN_ROWS_FOR_SYNTH = 5, MAX_OUT_TOKENS = 1200;

async function insertRow(row) {
  const { error } = await sb.from("kiko_knowledge_spine").insert(row);
  if (error && !String(error.message).includes("duplicate")) console.log("INSERT_ERR", error.message.slice(0, 80));
  return !error;
}

async function ingest() {
  const { data: r } = await sb.rpc("spine_ingest");
  console.log("DB_INGEST", JSON.stringify(r));
  // Phase 3: KIKO_MEMORY.md sections -> digest rows (deterministic, idempotent)
  let added = 0;
  try {
    const mem = readFileSync("/home/kiko/kiko-worker/api/data/KIKO_MEMORY.md", "utf8");
    const sections = mem.split(/^## /m).slice(1);
    for (const s of sections) {
      const header = s.split("\n")[0].trim();
      const body = s.slice(header.length).trim();
      if (body.length < 40) continue;
      const ok = await insertRow({ org_id: ORG, entity_type: "session", entity_key: header.toLowerCase().slice(0, 120),
        fact_type: "digest", content: body.slice(0, 6000), source: "memory:" + header.slice(0, 60), confidence: "verified" });
      if (ok) added++;
    }
  } catch (e) { console.log("MEMORY_PARSE_ERR", e.message); }
  console.log("MEMORY_DIGESTS_ADDED", added);
}

async function synthesize() {
  // Run-frequency guard: max 1 synthesis run / 20h
  const { data: st } = await sb.from("kiko_knowledge_spine").select("id, content").eq("entity_key", "_synth_state").limit(1);
  if (st?.length && (Date.now() - new Date(st[0].content) < 20 * 3600 * 1000)) { console.log("GUARD: ran <20h ago, exiting"); return; }
  if (st?.length) await sb.from("kiko_knowledge_spine").update({ content: new Date().toISOString() }).eq("id", st[0].id);
  else await insertRow({ org_id: ORG, entity_type: "method", entity_key: "_synth_state", fact_type: "digest", content: new Date().toISOString(), source: "consolidator" });

  // Candidates: entities with enough fresh, unconsolidated knowledge
  const { data: rows } = await sb.from("kiko_knowledge_spine")
    .select("id, entity_key, fact_type, content")
    .eq("org_id", ORG).eq("status", "active")
    .in("fact_type", ["fact", "decision", "open_thread"])
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).limit(3000);
  const byEntity = {};
  for (const r of (rows || [])) { if (r.entity_key === "general") continue; (byEntity[r.entity_key] ||= []).push(r); }
  const targets = Object.entries(byEntity).filter(([, v]) => v.length >= MIN_ROWS_FOR_SYNTH)
    .sort((a, b) => b[1].length - a[1].length).slice(0, MAX_ENTITIES_PER_RUN);
  console.log("SYNTH_TARGETS", targets.map(([k, v]) => k + ":" + v.length).join(", ") || "none");

  for (const [entity, items] of targets) {
    const input = items.map(i => ({ id: i.id, type: i.fact_type, content: i.content.slice(0, 400) }));
    const body = {
      model: process.env.KIKO_BRAIN_MODEL || "claude-opus-4-8", max_tokens: MAX_OUT_TOKENS, temperature: 0,
      messages: [{ role: "user", content:
        `You are consolidating your own knowledge about "${entity}". Input items (JSON): ${JSON.stringify(input)}\n\nProduce at most 3 durable knowledge statements that merge duplicates and supersede stale items. STRICT RULES: respond ONLY with a JSON array like [{"content":"...","cites":[<input ids>]}]. Every statement MUST cite the input ids it derives from. You may NOT introduce any fact not present in the inputs. No prose, no markdown.` }],
    };
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      });
      const j = await resp.json();
      const txt = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("").replace(/```json|```/g, "").trim();
      let entries; try { entries = JSON.parse(txt); } catch { console.log("AUDIT_REJECT", entity, "non-JSON output"); continue; }
      const validIds = new Set(input.map(i => i.id));
      let written = 0;
      for (const e of (Array.isArray(entries) ? entries.slice(0, 3) : [])) {
        // DETERMINISTIC AUDITOR: citation-or-rejection
        if (!e?.content || typeof e.content !== "string" || e.content.length < 20 || e.content.length > 1200) { console.log("AUDIT_REJECT", entity, "bad content"); continue; }
        if (!Array.isArray(e.cites) || e.cites.length === 0 || !e.cites.every(c => validIds.has(c))) { console.log("AUDIT_REJECT", entity, "citation failure"); continue; }
        const ok = await insertRow({ org_id: ORG, entity_type: "topic", entity_key: entity, fact_type: "consolidated",
          content: e.content, source: "synthesis:" + new Date().toISOString().slice(0, 10) + " cites:" + e.cites.join(","), confidence: "promoted" });
        if (ok) written++;
      }
      console.log("ENTITY_DONE", entity, "written:", written);
    } catch (err) { console.log("SYNTH_ERR", entity, err.message.slice(0, 80)); }
  }
}

if (MODE === "synthesize") await synthesize(); else if (MODE === "ingest") await ingest();
if (MODE === "ingest" || MODE === "synthesize") console.log("CONSOLIDATOR COMPLETE mode=" + MODE);

// ── CLAUDE EXPORT INGESTION ──────────────────────────────────────────────
// Usage: node api/_spine_consolidator.mjs claude_export /path/to/conversations.json <USER_ID>
// Parses Anthropic data export, chunks every conversation, redacts secrets, RINGFENCES to one user_id.
async function claudeExport(path, userId) {
  if (!userId || userId.length < 30) { console.log("REFUSING: a user_id is required to ringfence this import to one person."); process.exit(1); }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const convos = Array.isArray(raw) ? raw : (raw.conversations || []);
  const REDACT = [/sk-ant-[A-Za-z0-9_-]{4,}/g, /eyJ[A-Za-z0-9_-]{20,}/g, /(password|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi];
  // Robust text extraction across Claude export schema variants (top-level text OR content[] blocks):
  const msgText = (m) => {
    if (typeof m.text === "string" && m.text.trim()) return m.text.trim();
    if (Array.isArray(m.content)) return m.content.map(b => (b && b.text) || "").filter(Boolean).join("\n").trim();
    return "";
  };
  const who = (m) => (m.sender === "human" || m.role === "user") ? "SUNNY" : "ASSISTANT";
  // Batched upsert (ignore duplicates via unique index) — fast for large histories.
  let batch = [];
  let chunks = 0;
  const flushBatch = async (force) => {
    if (batch.length >= 400 || (force && batch.length)) {
      const rows = batch; batch = [];
      const { error } = await sb.from("kiko_knowledge_spine")
        .upsert(rows, { onConflict: "org_id,entity_key,fact_type,content_hash", ignoreDuplicates: true });
      if (error) console.log("BATCH_ERR", error.message.slice(0, 120));
      else chunks += rows.length;
    }
  };
  let convosDone = 0, skipped = 0;
  for (const c of convos) {
    const name = (c.name || "untitled").toLowerCase().slice(0, 100);
    const msgs = (c.chat_messages || c.messages || []).map(m => { const t = msgText(m); return t ? `[${who(m)}] ${t}` : ""; }).filter(Boolean);
    if (!msgs.length) { skipped++; continue; }
    let buf = "";
    const flush = async (n) => {
      if (buf.length < 60) return;
      let content = buf; for (const r of REDACT) content = content.replace(r, "[REDACTED]");
      batch.push({ org_id: ORG, user_id: userId, entity_type: "session", entity_key: name, fact_type: "transcript",
        content, source: `claude_export:${(c.uuid || name).slice(0, 36)}#${n}`, confidence: "recorded",
        created_at: c.created_at || undefined });
      await flushBatch(false);
      buf = "";
    };
    let n = 0;
    for (const m of msgs) {
      if (buf.length + m.length > 3800) { await flush(n++); }
      buf += m.slice(0, 3800) + "\n";
    }
    await flush(n);
    convosDone++;
    if (convosDone % 10 === 0) console.log("PROGRESS", convosDone, "/", convos.length, "convos,", chunks, "chunks written");
  }
  await flushBatch(true);
  console.log(`CLAUDE_EXPORT_DONE user=${userId} conversations:${convosDone} chunks:${chunks} skipped:${skipped}`);
}
if (MODE === "claude_export") await claudeExport(process.argv[3], process.argv[4]);
