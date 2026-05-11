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
      ? 'https://kiko.vanhawke.agency'
      : `https://${process.env.VERCEL_URL || 'kiko.vanhawke.agency'}`;

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

    // ── DATA QUALITY SCAN — Kiko catches her own mistakes ──
    let dqIssues = 0;
    try {
      // 1. Check outreach queue for name/email mismatches
      const queued = await supabase.from('kiko_outreach_queue')
        .select('id, to_name, to_email')
        .in('status', ['queued', 'pending'])
        .limit(100);
      for (const row of (queued.data || [])) {
        if (!row.to_name || !row.to_email) continue;
        const nameParts = row.to_name.toLowerCase().split(/\s+/);
        const emailLocal = row.to_email.split('@')[0].toLowerCase().replace(/[._\-]/g, ' ');
        const matches = nameParts.some(part => part.length > 2 && emailLocal.includes(part));
        if (!matches) {
          dqIssues++;
          // Auto-block and alert
          await supabase.from('kiko_outreach_queue').update({ status: 'failed', error: `Name/email mismatch: "${row.to_name}" vs "${row.to_email}"` }).eq('id', row.id);
          const existingAlert = await supabase.from('kiko_alerts').select('id').eq('type', 'data_quality').ilike('title', `%${row.to_name}%`).eq('dismissed', false).limit(1);
          if (!existingAlert.data?.length) {
            await supabase.from('kiko_alerts').insert({
              type: 'data_quality', severity: 'high',
              title: `⚠️ Kiko blocked: ${row.to_name} / ${row.to_email} mismatch`,
              detail: `I caught a name/email mismatch in the outreach queue. "${row.to_name}" was about to receive an email at ${row.to_email} which belongs to someone else. I've blocked it. The enrollment data needs correcting.`,
              entity_name: row.to_name,
            });
          }
        }
      }
      // 2. Check for duplicate emails in active enrollments
      const enrollments = await supabase.from('kiko_sequence_enrollments')
        .select('contact_email, contact_name, sequence_id')
        .eq('status', 'active');
      const emailMap = {};
      for (const e of (enrollments.data || [])) {
        const key = `${e.contact_email}:${e.sequence_id}`;
        if (emailMap[key] && emailMap[key] !== e.contact_name) {
          dqIssues++;
          const existingAlert = await supabase.from('kiko_alerts').select('id').eq('type', 'data_quality').ilike('title', `%${e.contact_email}%`).eq('dismissed', false).limit(1);
          if (!existingAlert.data?.length) {
            await supabase.from('kiko_alerts').insert({
              type: 'data_quality', severity: 'high',
              title: `⚠️ Duplicate email: ${e.contact_email} enrolled for multiple people`,
              detail: `I found ${e.contact_email} enrolled for both "${emailMap[key]}" and "${e.contact_name}" in the same sequence. One of these is wrong.`,
              entity_name: e.contact_name,
            });
          }
        }
        emailMap[key] = e.contact_name;
      }
    } catch (dqErr) { console.warn('[selfcheck] Data quality scan error:', dqErr.message); }

    const summary = {
      ok: true,
      duration_ms: Date.now() - startedAt,
      checks_total: allChecks.length,
      checks_passed: passed.length,
      checks_failed: failed.length,
      alerts_created: alertsCreated,
      alerts_resolved: alertsResolved,
      data_quality_issues: dqIssues,
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
