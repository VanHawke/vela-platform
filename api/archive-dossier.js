// api/archive-dossier.js
// POST /api/archive/dossier  body: { dealId }
// Mounted behind requireAuth: req.body.userEmail is the VERIFIED identity, stamped
// from the Supabase token by _auth.js. Never trust a raw body identity here.
import { buildDossier } from './lib/dossier.js';

export default async function handler(req, res) {
  try {
    const dealId = req.body?.dealId;
    const viewerEmail = req.body?.userEmail; // verified + stamped by requireAuth
    if (!dealId) return res.status(400).json({ error: 'dealId required' });
    if (!viewerEmail) return res.status(401).json({ error: 'no verified identity' });
    const result = await buildDossier({ dealId, viewerEmail });
    if (result.error === 'unauthorized') return res.status(403).json(result);
    if (result.error === 'deal_not_found') return res.status(404).json(result);
    return res.json(result);
  } catch (e) {
    console.error('[archive-dossier] error', e);
    return res.status(500).json({ error: 'dossier_failed', detail: String(e?.message || e) });
  }
}
