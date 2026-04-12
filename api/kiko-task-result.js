// api/kiko-task-result.js — Full result for completed background tasks
// GET ?id=<uuid>
// Returns full row including result_text + tools_used
// Only returns data if status IN ('done','error')
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = req.query?.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'valid id required' });
  }

  try {
    const rows = await sbFetch(`kiko_background_tasks?id=eq.${id}&select=*&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    const task = rows[0];
    if (!['done', 'error'].includes(task.status)) {
      return res.status(202).json({ id: task.id, status: task.status, message: 'task still in progress' });
    }
    return res.status(200).json(task);
  } catch (err) {
    console.error('[kiko-task-result] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
