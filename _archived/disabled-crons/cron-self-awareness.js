// api/cron-self-awareness.js — Nightly behavioural feedback loop
// Scans kiko_learning_log for repetition loops and contradictions.
// Writes meta-learning records that get injected into the next system prompt.
// This is what closes the loop on the "Cloudflare 160 times" problem.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';


// Normalize a question into a signature for fuzzy matching
function signatureOf(content) {
  if (!content) return '';
  // Strip markdown, lowercase, collapse whitespace, take first ~200 chars after the prompt marker
  const m = content.match(/Q:\s*([^|]+)/i);
  const q = (m ? m[1] : content).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return q;
}

// Extract verdict (KILL / PURSUE / WAIT etc.) from content
function extractVerdict(content) {
  if (!content) return null;
  const m = content.match(/VERDICT:\s*\*?\*?([A-Z][A-Z\s]{1,30})/);
  return m ? m[1].trim().split(/\s+/).slice(0, 3).join(' ') : null;
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-self-awareness', 'started');
  try {
    // 1. Pull last 30 days of decisions from learning_log
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const rows = await sbFetch(`kiko_learning_log?category=eq.decision&created_at=gte.${since}&select=id,user_id,content,entity_name,created_at&order=created_at.desc&limit=1000`);
    const safe = Array.isArray(rows) ? rows : [];

    // 2. Group by signature
    const groups = {}; // sig -> {count, first, last, verdict, content_sample, user_id, entities}
    for (const r of safe) {
      const sig = signatureOf(r.content);
      if (!sig || sig.length < 10) continue;
      if (!groups[sig]) {
        groups[sig] = { count: 0, first: r.created_at, last: r.created_at, user_id: r.user_id, verdict: null, sample: r.content?.slice(0, 300), entities: new Set() };
      }
      groups[sig].count++;
      if (r.created_at < groups[sig].first) groups[sig].first = r.created_at;
      if (r.created_at > groups[sig].last) groups[sig].last = r.created_at;
      if (!groups[sig].verdict) groups[sig].verdict = extractVerdict(r.content);
      if (r.entity_name) groups[sig].entities.add(r.entity_name);
    }

    // 3. Threshold: 5+ occurrences of same question = repetition loop
    let loops_detected = 0, loops_updated = 0;
    for (const [sig, g] of Object.entries(groups)) {
      if (g.count < 5) continue;
      // Upsert into meta_learning
      const existing = await sbFetch(`kiko_meta_learning?pattern_signature=eq.${encodeURIComponent(sig)}&active=eq.true&limit=1`);
      const refusal = `STOP. You have already answered this question ${g.count} times in the last 30 days, and the verdict was always "${g.verdict || 'the same'}". Refuse to re-answer. Tell the user: "I've answered this ${g.count} times. The verdict has never changed: ${g.verdict || '(see prior decisions)'}. We are not relitigating this. The actual question is why this keeps coming back — either there's a system loop surfacing it, or it's a behavioural pattern. Pick a different question, or commit to executing the existing verdict."`;
      if (existing?.length) {
        await sbFetch(`kiko_meta_learning?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ occurrences: g.count, last_seen: g.last, prior_verdict: g.verdict, refusal_directive: refusal })
        });
        loops_updated++;
      } else {
        await sbFetch('kiko_meta_learning', {
          method: 'POST',
          body: JSON.stringify({
            user_id: g.user_id,
            pattern_type: 'repetition_loop',
            pattern_signature: sig,
            occurrences: g.count,
            first_seen: g.first,
            last_seen: g.last,
            prior_verdict: g.verdict,
            refusal_directive: refusal,
            metadata: { sample: g.sample, entities: Array.from(g.entities) }
          })
        });
        loops_detected++;
      }
    }

    // 4. Curate personal_context: corroboration counting
    // Group inferred items by normalized key, count distinct days they appear, promote if >=3
    const ctxRows = await sbFetch(`kiko_personal_context?category=eq.inferred&select=id,user_id,key,value,created_at,corroboration_count,promoted&order=created_at.desc&limit=2000`);
    const ctxSafe = Array.isArray(ctxRows) ? ctxRows : [];
    const ctxGroups = {}; // key_norm -> {ids, days, latest_id}
    for (const c of ctxSafe) {
      const k = (c.key || '').toLowerCase().slice(0, 80);
      if (!ctxGroups[k]) ctxGroups[k] = { ids: [], days: new Set(), latest: c.id, user_id: c.user_id };
      ctxGroups[k].ids.push(c.id);
      ctxGroups[k].days.add(c.created_at?.slice(0, 10));
    }
    let promoted = 0;
    for (const [k, g] of Object.entries(ctxGroups)) {
      if (g.days.size >= 3) {
        await sbFetch(`kiko_personal_context?id=eq.${g.latest}`, {
          method: 'PATCH',
          body: JSON.stringify({ promoted: true, corroboration_count: g.days.size, last_corroborated_at: new Date().toISOString() })
        });
        promoted++;
      }
    }

    await cronHeartbeat('cron-self-awareness', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: loops_detected + loops_updated + promoted });
    return res.status(200).json({ ok: true, loops_detected, loops_updated, context_promoted: promoted, groups_scanned: Object.keys(groups).length });
  } catch (err) {
    console.error('[SelfAwareness] Fatal:', err.message);
    await cronHeartbeat('cron-self-awareness', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
