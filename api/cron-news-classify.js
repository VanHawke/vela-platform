// api/cron-news-classify.js — Standalone classifier cron
// Runs at 8:15am Mon-Fri (15min after news-agent fetches feeds).
// Pulls unprocessed articles, runs Haiku classification, updates with intel.
// Split from news-agent.js because the combined fetch+classify path
// was timing out at 300s. Each step now gets its own 300s budget.
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-news-classify', 'started');
  try {
    // Forward to news-agent's classify action (which already has all the
    // partnership detection + alert logic). Internal call avoids duplicating ~200 lines.
    const baseUrl = `https://${req.headers.host || 'vela-platform-one.vercel.app'}`;
    const r = await fetch(`${baseUrl}/api/news-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'classify', limit: 25 }),
    });
    const result = await r.json();
    await cronHeartbeat('cron-news-classify', 'finished', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      recordsProcessed: result?.classified || 0,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[NewsClassify] Fatal:', err.message);
    await cronHeartbeat('cron-news-classify', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-news-classify', err.message).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
