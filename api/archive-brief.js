// api/archive-brief.js
// POST /api/archive/brief  body: { dealId, generate? }
//   generate=true  -> generate/refresh the brief (Opus, ~45s) and cache it
//   generate falsy -> return the cached brief (or { brief: null }) without generating
// Behind requireAuth: identity from the verified, stamped req.body.userEmail.
import { buildBrief, readBrief } from './lib/archive-brief.js';

export default async function handler(req, res) {
  try {
    const dealId = req.body?.dealId;
    const viewerEmail = req.body?.userEmail; // verified + stamped by requireAuth
    const generate = !!req.body?.generate;
    if (!dealId) return res.status(400).json({ error: 'dealId required' });
    if (!viewerEmail) return res.status(401).json({ error: 'no verified identity' });
    const result = generate
      ? await buildBrief({ dealId, viewerEmail })
      : await readBrief({ dealId, viewerEmail });
    if (result.error === 'unauthorized') return res.status(403).json(result);
    if (result.error === 'deal_not_found') return res.status(404).json(result);
    return res.json(result);
  } catch (e) {
    console.error('[archive-brief] error', e);
    return res.status(500).json({ error: 'brief_failed', detail: String(e?.message || e) });
  }
}
