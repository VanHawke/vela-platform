// api/cron-job-cleanup.js — Sweep stale rows from kiko_active_jobs
// Sunny spec 2026-04-12 v0.0.39: kiko_active_jobs writes ~1 row per build
// + 6 stage updates. Without cleanup these accumulate forever.
// Strategy: keep recent rows for diagnostics, prune old completed/failed.
//
// Schedule: weekly Sunday 04:00 UTC (in vercel.json)
// Cost: ~1 invocation/week, negligible

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const startedAt = new Date().toISOString();
  const result = { started_at: startedAt, deleted: { completed_old: 0, failed_old: 0, stuck_running: 0 } };

  try {
    // 1. Delete completed jobs older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const completedDel = await sbFetch(
      `kiko_active_jobs?status=eq.completed&completed_at=lt.${sevenDaysAgo}`,
      { method: 'DELETE', headers: { Prefer: 'return=representation' } }
    );
    result.deleted.completed_old = Array.isArray(completedDel) ? completedDel.length : 0;

    // 2. Delete failed jobs older than 14 days (keep failures longer for debugging)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
    const failedDel = await sbFetch(
      `kiko_active_jobs?status=eq.failed&updated_at=lt.${fourteenDaysAgo}`,
      { method: 'DELETE', headers: { Prefer: 'return=representation' } }
    );
    result.deleted.failed_old = Array.isArray(failedDel) ? failedDel.length : 0;

    // 3. Mark stuck "running" jobs (>10 min old, no updates) as failed
    // build-campaign maxDuration is well under 10 min, so anything older is stuck
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const stuckDel = await sbFetch(
      `kiko_active_jobs?status=eq.running&updated_at=lt.${tenMinAgo}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'failed',
          error: 'Stuck in running state — auto-marked failed by cron-job-cleanup',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );
    result.deleted.stuck_running = Array.isArray(stuckDel) ? stuckDel.length : 0;

    result.completed_at = new Date().toISOString();
    result.duration_ms = Date.now() - new Date(startedAt).getTime();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron-job-cleanup] error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'unknown', ...result });
  }
}
