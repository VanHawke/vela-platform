// api/cron-selfcheck-watcher.js — Hourly selfcheck monitor with auto-alert
//
// Runs every hour, calls /api/selfcheck, and:
//   1. Creates a kiko_alerts row for any check that newly FAILs
//   2. Auto-dismisses alerts for checks that recovered (PASS again)
//   3. Writes cronHeartbeat for visibility in /admin/system
//
// Idempotent: won't double-alert. One active alert per check name at a time.

import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Auth — Vercel cron header or manual ?force=1
  const authHeader = req.headers.authorization || req.headers['x-vercel-cron'];
  if (!authHeader && req.query?.force !== '1') {
    return res.status(401).json({ error: 'unauthorised — add ?force=1 to run manually' });
  }

  const heartbeatId = await cronHeartbeat('cron-selfcheck-watcher', 'started');
  const startedAt = Date.now();

  try {
    // 1. Call selfcheck — production alias is stable
    const baseUrl = process.env.VERCEL_ENV === 'production'
      ? 'https://vela-platform-one.vercel.app'
      : `https://${process.env.VERCEL_URL || 'vela-platform-one.vercel.app'}`;

    const selfRes = await fetch(`${baseUrl}/api/selfcheck`, { cache: 'no-store' });
    if (!selfRes.ok) throw new Error(`selfcheck returned ${selfRes.status}`);
    const selfData = await selfRes.json();
    const allChecks = selfData.checks || [];
    const failed = allChecks.filter(c => c.status !== 'PASS');
    const passed = allChecks.filter(c => c.status === 'PASS');

    // 2. Get currently active selfcheck alerts (not dismissed)
    const { data: existingAlerts } = await supabase
      .from('kiko_alerts')
      .select('id, entity_id, dismissed')
      .eq('type', 'selfcheck_fail')
      .eq('dismissed', false);
    const activeByCheck = new Map((existingAlerts || []).map(a => [a.entity_id, a.id]));

    let alertsCreated = 0;
    let alertsResolved = 0;

    // Diagnostic-only checks that should NEVER create alerts (real data scarcity, not bugs)
    const NO_ALERT_CHECKS = new Set([
      'category_coverage',  // 3 thin categories — real-world data, not actionable
    ]);

    // 3. Create alerts for newly failing checks
    for (const failCheck of failed) {
      if (NO_ALERT_CHECKS.has(failCheck.name)) continue;
      if (activeByCheck.has(failCheck.name)) continue;  // already alerted

      const { error: insertErr } = await supabase.from('kiko_alerts').insert({
        type: 'selfcheck_fail',
        severity: 'high',
        title: `System check failing: ${failCheck.name}`,
        detail: `Selfcheck invariant '${failCheck.name}' has flipped to FAIL. ${failCheck.actual ? `Current value: ${String(failCheck.actual).slice(0, 200)}.` : ''} Open /admin/system to investigate.`,
        entity_type: 'selfcheck',
        entity_id: failCheck.name,
        entity_name: failCheck.name,
        dismissed: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),  // expires in 7 days
        metadata: {
          check_name: failCheck.name,
          check_status: failCheck.status,
          check_actual: failCheck.actual ?? null,
          detected_at: new Date().toISOString(),
          source: 'cron-selfcheck-watcher',
        },
      });
      if (!insertErr) alertsCreated++;
    }

    // 4. Auto-resolve alerts for checks that are now passing
    const passedNames = new Set(passed.map(c => c.name));
    for (const [checkName, alertId] of activeByCheck.entries()) {
      if (passedNames.has(checkName)) {
        const { error: updErr } = await supabase
          .from('kiko_alerts')
          .update({
            dismissed: true,
            metadata: { resolved_at: new Date().toISOString(), resolved_by: 'cron-selfcheck-watcher', auto_resolved: true },
          })
          .eq('id', alertId);
        if (!updErr) alertsResolved++;
      }
    }

    const summary = {
      ok: true,
      duration_ms: Date.now() - startedAt,
      checks_total: allChecks.length,
      checks_passed: passed.length,
      checks_failed: failed.length,
      alerts_created: alertsCreated,
      alerts_resolved: alertsResolved,
      failing_checks: failed.map(f => f.name),
      timestamp: new Date().toISOString(),
    };

    await cronHeartbeat('cron-selfcheck-watcher', 'finished', {
      heartbeatId,
      durationMs: summary.duration_ms,
      recordsProcessed: alertsCreated + alertsResolved,
    });

    return res.status(200).json(summary);
  } catch (err) {
    await cronHeartbeat('cron-selfcheck-watcher', 'error', {
      heartbeatId,
      durationMs: Date.now() - startedAt,
      errorMessage: err.message || String(err),
    });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
