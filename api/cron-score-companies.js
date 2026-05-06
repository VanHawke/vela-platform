// api/cron-score-companies.js — Daily SponsorSignal scoring sweep
// Runs at 5am MF. Scores companies that have no score or scored >7 days ago.
// Imports scoreCompanyById directly (no HTTP) to avoid the auth issue that
// affects cron-news-classify. Heartbeats so health-watcher can catch failures.
import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat, logError } from './kiko-tools.js';
import { scoreCompanyById } from './score.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-score-companies', 'started');
  try {
    // Find companies needing scores (no score or stale >7 days)
    const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: scored } = await supabase
      .from('kiko_company_scores')
      .select('company_id, scored_at');
    const recentSet = new Set(
      (scored || []).filter(s => s.scored_at > staleCutoff).map(s => s.company_id)
    );

    const { data: companies } = await supabase
      .from('companies')
      .select('id')
      .limit(500);

    const candidates = (companies || []).filter(c => !recentSet.has(c.id)).slice(0, 25);

    let succeeded = 0, failed = 0;
    for (const c of candidates) {
      try {
        await scoreCompanyById(c.id);
        succeeded++;
      } catch (e) {
        console.error(`[ScoreCron] ${c.id} failed:`, e.message);
        failed++;
      }
      // Soft time guard — leave headroom before maxDuration
      if (Date.now() - __hbStart > 50000) break;
    }

    await cronHeartbeat('cron-score-companies', 'finished', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      recordsProcessed: succeeded,
    });
    return res.status(200).json({ ok: true, scored: succeeded, failed, candidates: candidates.length });
  } catch (err) {
    console.error('[ScoreCron] Fatal:', err.message);
    await cronHeartbeat('cron-score-companies', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-score-companies', err.message).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
