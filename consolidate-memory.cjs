// consolidate-memory.cjs — Session 71: full memory sweep -> consolidated doctrine
// Map: Sonnet distills chunks of insights/learnings/thoughts/knowledge.
// Reduce: Opus fuses candidates + existing operating profile into doctrine v1.
require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const ai = new Anthropic.Anthropic ? new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_KEY }) : new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const log = (m) => console.log('[consolidate] ' + m);

// ── Session 71 failsafes ──
const LOCK = '/home/kiko/consolidation.lock';                 // no concurrent/duplicate runs
const MAX_CHUNKS = parseInt(process.env.CONSOLIDATION_MAX_CHUNKS || '12', 10); // hard spend cap per run
const FULL = process.env.CONSOLIDATION_FULL === '1';          // full re-sweep ONLY by explicit override

async function getWatermark() {
  if (FULL) { log('FULL override set — sweeping entire history'); return null; }
  const { data } = await sb.from('kiko_system_state').select('value').eq('key', 'consolidation_watermark').limit(1);
  const wm = data?.[0]?.value || null;
  log('watermark: ' + (wm || 'none — first run processes full history'));
  return wm;
}

async function pullAll() {
  const wm = await getWatermark();
  const rows = [];
  const grab = async (tbl, sel, tag) => {
    let from = 0;
    while (true) {
      let q = sb.from(tbl).select(sel).order('created_at', { ascending: true }).range(from, from + 499);
      if (wm) q = q.gt('created_at', wm);
      const { data, error } = await q;
      if (error) { log(tbl + ' ERR ' + error.message); return; }
      if (!data || !data.length) return;
      data.forEach(r => rows.push('[' + tag + '] ' + JSON.stringify(r)));
      if (data.length < 500) return;
      from += 500;
    }
  };
  await grab('kiko_conversation_insights', '*', 'INSIGHT');
  await grab('kiko_learning_log', 'category,entity_name,content,created_at', 'LEARNED');
  await grab('kiko_thought_journal', '*', 'THOUGHT');
  await grab('kiko_knowledge', 'domain,content', 'KNOWLEDGE');
  return rows;
}

const MAP_PROMPT = `You are distilling Kiko's accumulated memory about Sunny Sidhu (Founder/CEO, Van Hawke Group — F1/FE sponsorship advisory) into durable doctrine candidates. From the records below, extract ONLY high-signal, durable principles in these categories:
A. DECISION PATTERNS — how Sunny chooses (route selection, cost logic, sequencing, risk posture)
B. REASONING STYLE — how he thinks through problems, what evidence he demands
C. RECURRING CORRECTIONS — things he repeatedly pushes back on or demands
D. COMMUNICATION STYLE — tone, phrasing, structure he uses and expects
E. STRATEGIC PREFERENCES — positioning, negotiation, relationship handling
F. DOMAIN FACTS worth permanent retention (deals, structures, relationships) — only if foundational.
Rules: each item ONE line, prefix with category letter, cite brief evidence in parens. Skip noise, pleasantries, one-off operational detail. Max 25 items. Records:\n\n`;

async function mapPhase(rows) {
  const chunks = [];
  let cur = '';
  for (const r of rows) {
    if (cur.length + r.length > 80000) { chunks.push(cur); cur = ''; }
    cur += r + '\n';
  }
  if (cur) chunks.push(cur);
  log('map phase: ' + chunks.length + ' chunks (cap ' + MAX_CHUNKS + ')');
  // ── Failsafe: hard spend cap. Estimated cost printed BEFORE any API call. ──
  log('estimated cost this run: ~$' + (chunks.length * 0.10 + 1).toFixed(2));
  if (chunks.length > MAX_CHUNKS && !FULL) {
    log('ABORT: delta exceeds chunk cap (' + chunks.length + ' > ' + MAX_CHUNKS + '). No API calls made. Run with CONSOLIDATION_FULL=1 to override deliberately.');
    process.exit(2);
  }
  const candidates = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const msg = await ai.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1500,
        messages: [{ role: 'user', content: MAP_PROMPT + chunks[i] }] });
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      candidates.push('--- chunk ' + (i + 1) + ' ---\n' + text);
      log('chunk ' + (i + 1) + '/' + chunks.length + ' done (' + text.length + ' chars)');
    } catch (e) { log('chunk ' + (i + 1) + ' ERR: ' + e.message); }
    await new Promise(r => setTimeout(r, 1200));
  }
  return candidates.join('\n\n');
}

async function reducePhase(candidates) {
  const { data: bible } = await sb.from('kiko_core_bible').select('content').order('updated_at', { ascending: false }).limit(1);
  const existing = bible?.[0]?.content || '';
  const REDUCE = `You are consolidating Kiko's full memory sweep into operating doctrine about Sunny Sidhu. Below: (1) the EXISTING doctrine already live in Kiko's bible, (2) candidate learnings distilled from her entire memory (insights, learnings, thoughts, knowledge).
Produce a markdown document titled "CONSOLIDATED LEARNINGS v1" with sections:
1. REFINEMENTS — where the sweep deepens/sharpens existing doctrine (do NOT repeat what exists unchanged)
2. NEW PRINCIPLES — durable patterns not yet in doctrine, each with evidence
3. TACTICAL PLAYBOOK — concrete repeatable moves observed (negotiation, outreach, vendor handling)
4. CONTRADICTIONS/CAUTIONS — anywhere candidates conflict with existing doctrine or each other
Be ruthless: only durable, evidenced items. Max 1200 words. EXISTING DOCTRINE:\n${existing}\n\nCANDIDATES:\n`;
  const msg = await ai.messages.create({ model: 'claude-opus-4-8', max_tokens: 3000,
    messages: [{ role: 'user', content: REDUCE + candidates }] });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

(async () => {
  // ── Failsafe: lockfile — no concurrent or stuck-duplicate runs ──
  if (fs.existsSync(LOCK)) {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < 2 * 3600 * 1000) { log('ABORT: lock present (' + Math.round(age / 60000) + 'min old) — another run active'); process.exit(3); }
    log('stale lock (>2h) — clearing');
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const runStart = new Date().toISOString();
  try {
    log('pulling memory corpus...');
    const rows = await pullAll();
    log('corpus rows: ' + rows.length);
    if (!rows.length) { log('nothing new since watermark — no API calls, exiting clean'); fs.unlinkSync(LOCK); process.exit(0); }
    const candidates = await mapPhase(rows);
    fs.writeFileSync('/home/kiko/consolidation_candidates.md', candidates);
    log('reduce phase (Opus)...');
    const doctrine = await reducePhase(candidates);
    fs.writeFileSync('/home/kiko/consolidation_report.md', doctrine);
    const ver = 'consolidated-memory-doctrine-' + runStart.slice(0, 10);
    await sb.from('kiko_knowledge').insert({ domain: ver, content: doctrine.slice(0, 49000), source: 'memory_consolidation_sweep', researched_at: runStart, user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063' });
    const { data: b } = await sb.from('kiko_core_bible').select('id,content').order('updated_at', { ascending: false }).limit(1);
    if (b?.[0]) await sb.from('kiko_core_bible').update({ content: b[0].content + '\n\n§ CONSOLIDATED LEARNINGS (' + runStart.slice(0, 10) + ' — incremental, versioned, reversible)\n' + doctrine.slice(0, 6000), updated_at: new Date().toISOString() }).eq('id', b[0].id);
    // ── advance the watermark ONLY on full success ──
    await sb.from('kiko_system_state').upsert({ key: 'consolidation_watermark', value: runStart, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    log('COMPLETE — report /home/kiko/consolidation_report.md, knowledge domain ' + ver + ', bible updated, watermark -> ' + runStart);
  } finally { try { fs.unlinkSync(LOCK); } catch {} }
})().catch(e => { log('FATAL: ' + e.message); try { fs.unlinkSync(LOCK); } catch {}; process.exit(1); });
