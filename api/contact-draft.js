import { buildContactDraft } from './lib/contact-draft.js';

export default async function contactDraft(req, res) {
  try {
    const { email, name, title, company, sector } = req.body || {};
    if (!name && !email && !company) return res.status(400).json({ error: 'need at least a name, email, or company' });
    const draft = await buildContactDraft({ email, name, title, company, sector });
    return res.json(draft);
  } catch (e) {
    console.error('[contact-draft] error:', e);
    return res.status(500).json({ error: 'draft_failed', detail: String(e?.message || e) });
  }
}
