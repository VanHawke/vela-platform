// api/kiko-task-stream.js — SSE endpoint for streaming background task output
// GET ?id=<uuid>
// Polls kiko_background_tasks.streaming_progress every 300ms, sends deltas as SSE events.
// Closes when task status transitions to done/error/cancelled or after 5 min timeout.
import { sbFetch } from './kiko-tools.js';


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = req.query?.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'valid id required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();

  let lastLen = 0;
  const startTime = Date.now();
  const MAX_DURATION = 5 * 60 * 1000; // 5 minutes

  const poll = async () => {
    try {
      const rows = await sbFetch(`kiko_background_tasks?id=eq.${id}&select=status,streaming_progress,result_text,error_message&limit=1`);
      if (!rows?.length) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'task not found' })}\n\n`);
        res.end();
        return true;
      }
      const task = rows[0];
      const progress = task.streaming_progress || '';

      // Send new delta if progress has grown
      if (progress.length > lastLen) {
        const delta = progress.slice(lastLen);
        lastLen = progress.length;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
      }

      // Check for completion
      if (['done', 'error', 'cancelled'].includes(task.status)) {
        res.write(`data: ${JSON.stringify({ type: 'complete', status: task.status, result_text: task.result_text || progress, error_message: task.error_message })}\n\n`);
        res.end();
        return true;
      }

      // Timeout guard
      if (Date.now() - startTime > MAX_DURATION) {
        res.write(`data: ${JSON.stringify({ type: 'timeout', message: 'stream timed out after 5 minutes' })}\n\n`);
        res.end();
        return true;
      }

      return false;
    } catch (err) {
      try { res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`); } catch {}
      try { res.end(); } catch {}
      return true;
    }
  };

  // Initial check
  if (await poll()) return;

  // Poll every 300ms
  const interval = setInterval(async () => {
    if (await poll()) clearInterval(interval);
  }, 300);

  // Cleanup on client disconnect
  req.on('close', () => clearInterval(interval));
}
