// api/cron-background-task-cleanup.js — Frequent cleanup of background tasks
// Schedule: */10 * * * * (every 10 minutes)
// - Delete done tasks > 24 hours old
// - Mark running tasks > 5 min as error (timeout)
// - Delete error tasks > 30 days old
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const results = { deleted_done: 0, timed_out: 0, deleted_error: 0 };

  try {
    // 1. Delete done tasks > 24 hours
    const fourteenDaysAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const deleted = await sbFetch(`kiko_background_tasks?status=eq.done&completed_at=lt.${fourteenDaysAgo}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      results.deleted_done = Array.isArray(deleted) ? deleted.length : 0;
    } catch {}

    // 2. Mark running tasks > 5 min as error
    const tenMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    try {
      const timedOut = await sbFetch(`kiko_background_tasks?status=eq.running&started_at=lt.${tenMinAgo}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'error',
          error_message: 'Task exceeded 5 minute timeout',
          completed_at: new Date().toISOString(),
        }),
      });
      results.timed_out = Array.isArray(timedOut) ? timedOut.length : 0;
    } catch {}

    // 3. Delete error tasks > 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const deleted = await sbFetch(`kiko_background_tasks?status=eq.error&completed_at=lt.${thirtyDaysAgo}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      results.deleted_error = Array.isArray(deleted) ? deleted.length : 0;
    } catch {}

    // Heartbeat
    try {
      await sbFetch('cron_heartbeats', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ cron_name: 'background-task-cleanup', last_run: new Date().toISOString(), status: 'ok', detail: JSON.stringify(results) }),
      });
    } catch {}

    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[cron-background-task-cleanup] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
