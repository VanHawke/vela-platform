// api/kiko-task-status.js — Lightweight status check for background tasks
// GET ?id=<uuid>
// Returns: id, status, started_at, completed_at, elapsed_seconds, error_message
// No result_text (use kiko-task-result.js for that)
import { sbFetch } from './kiko-tools.js';


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = req.query?.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'valid id required' });
  }

  try {
    const rows = await sbFetch(`kiko_background_tasks?id=eq.${id}&select=id,status,query,started_at,completed_at,elapsed_seconds,error_message&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    const task = rows[0];
    // Compute live elapsed for running tasks
    if (task.status === 'running' && task.started_at) {
      task.elapsed_seconds = Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000);
    }
    return res.status(200).json(task);
  } catch (err) {
    console.error('[kiko-task-status] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
