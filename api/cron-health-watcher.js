// api/cron-health-watcher.js — Daily cron health monitoring
// Runs at 6am MF. Scans kiko_cron_heartbeats for two failure modes:
//   1. HUNG: status='started' AND duration_ms IS NULL AND age > 10min
//      (function was killed mid-execution before catch block could fire)
//   2. ERRORED: status='error' within last 24 hours
// Creates high-severity rows in kiko_alerts so silent failures become visible.
//
// This is the long-term protection against bugs like the news-agent timeout
// that ran undetected for 6+ days. Now any cron going dark for >10min
// triggers an alert within 24 hours guaranteed.

import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat, logError } from './kiko-tools.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-health-watcher', 'started');
  try {
    // Pull last 24h of heartbeats grouped by cron
    const { data: heartbeats, error: hbErr } = await supabase
      .from('kiko_cron_heartbeats')
      .select('cron_name, status, started_at, duration_ms, error_message')
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('started_at', { ascending: false });
    if (hbErr) throw new Error(`Heartbeat query failed: ${hbErr.message}`);

    // Bucket by cron_name and find latest state for each
    const cronStates = {};
    for (const hb of (heartbeats || [])) {
      if (!cronStates[hb.cron_name]) cronStates[hb.cron_name] = { latest: hb, errors24h: 0, hungRows: [] };
      if (hb.status === 'error') cronStates[hb.cron_name].errors24h += 1;
      // Detect hung: started but never finished, age >10min
      const ageMs = Date.now() - new Date(hb.started_at).getTime();
      if (hb.status === 'started' && hb.duration_ms === null && ageMs > 10 * 60 * 1000) {
        cronStates[hb.cron_name].hungRows.push(hb);
      }
    }

    // Build alert payload — one alert per broken cron
    const alertsToCreate = [];
    for (const [cronName, state] of Object.entries(cronStates)) {
      const hungCount = state.hungRows.length;
      const errCount = state.errors24h;
      if (hungCount === 0 && errCount === 0) continue;

      const issues = [];
      if (hungCount > 0) issues.push(`${hungCount} hung run${hungCount > 1 ? 's' : ''} (started, never finished)`);
      if (errCount > 0) issues.push(`${errCount} error${errCount > 1 ? 's' : ''} in last 24h`);

      const lastError = state.latest?.error_message;
      const detail = `${cronName} is unhealthy: ${issues.join('; ')}.${lastError ? ` Last error: ${lastError.slice(0, 200)}` : ''} Check Vercel logs at vercel.com/sunny-9526s-projects/vela-platform/logs?search=route:/api/${cronName}`;

      alertsToCreate.push({
        type: 'cron_health',
        severity: hungCount > 0 ? 'high' : 'medium',
        title: `Broken cron: ${cronName}`,
        detail,
        entity_type: 'cron',
        entity_name: cronName,
        metadata: {
          cron_name: cronName,
          hung_count: hungCount,
          errors_24h: errCount,
          last_status: state.latest?.status,
          last_started_at: state.latest?.started_at,
          last_error: lastError,
        },
        // Auto-expire after 7 days so resolved alerts clear themselves
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Dedupe against existing open alerts so we don't spam the same broken cron daily
    let inserted = 0;
    if (alertsToCreate.length > 0) {
      const cronNames = alertsToCreate.map(a => a.entity_name);
      const { data: existing } = await supabase
        .from('kiko_alerts')
        .select('entity_name')
        .eq('type', 'cron_health')
        .in('entity_name', cronNames)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const existingSet = new Set((existing || []).map(e => e.entity_name));
      const fresh = alertsToCreate.filter(a => !existingSet.has(a.entity_name));
      if (fresh.length > 0) {
        const { error: insErr } = await supabase.from('kiko_alerts').insert(fresh);
        if (insErr) throw new Error(`Alert insert failed: ${insErr.message}`);
        inserted = fresh.length;
      }
    }

    const summary = {
      crons_monitored: Object.keys(cronStates).length,
      crons_unhealthy: alertsToCreate.length,
      alerts_inserted: inserted,
      alerts_skipped_dedup: alertsToCreate.length - inserted,
    };

    await cronHeartbeat('cron-health-watcher', 'finished', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      recordsProcessed: inserted,
    });
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('[HealthWatcher] Fatal:', err.message);
    await cronHeartbeat('cron-health-watcher', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-health-watcher', err.message).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
