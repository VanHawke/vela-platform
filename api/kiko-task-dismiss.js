// api/kiko-task-dismiss.js — Delete background tasks (single or bulk)
// DELETE ?id=<uuid>           → delete single task
// DELETE ?ids=uuid1,uuid2,... → delete up to 200 tasks (mirrors memory-tab.js bulk pattern)
// RLS handles user_id check — only the task owner can delete their own tasks.
import { sbFetch } from './kiko-tools.js';


function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'DELETE only' });

  try {
    const id = req.query?.id;
    const idsParam = req.query?.ids;

    if (idsParam) {
      const ids = String(idsParam).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return res.status(400).json({ error: 'no ids provided' });
      if (ids.length > 200) return res.status(400).json({ error: 'max 200 ids per bulk delete' });
      if (!ids.every(isUuid)) return res.status(400).json({ error: 'all ids must be valid uuids' });
      const idList = ids.join(',');
      await sbFetch(`kiko_background_tasks?id=in.(${idList})`, { method: 'DELETE' });
      return res.status(200).json({ ok: true, deleted: ids.length });
    }

    if (!isUuid(id)) return res.status(400).json({ error: 'valid id required' });
    await sbFetch(`kiko_background_tasks?id=eq.${id}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true, deleted: 1 });
  } catch (err) {
    console.error('[kiko-task-dismiss] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
