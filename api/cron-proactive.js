// api/cron-proactive.js — Proactive Intelligence Engine (Phase 11)
// Runs daily at 7:00 AM UK. Cross-references 5 data streams via Haiku.
// Writes convergence alerts to kiko_alerts.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

// Quick Win: Email notification for high-severity alerts
async function sendAlertEmail(alerts, userEmail) {
  const highAlerts = alerts.filter(a => a.severity === 'high');
  if (!highAlerts.length) return;
  try {
    const token = await getGoogleToken(userEmail);
    if (!token) return;
    const subject = `Kiko Alert: ${highAlerts.length} high-priority convergence${highAlerts.length > 1 ? 's' : ''} detected`;
    const body = highAlerts.map(a => `■ ${a.entity || 'Unknown'}: ${a.title}\n${a.detail}\n→ ${a.action || 'Review in Vela'}`).join('\n\n---\n\n');
    const htmlBody = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:14px;color:#333">
      <h2 style="color:#7C5CFC;margin-bottom:16px">Kiko Intelligence Alert</h2>
      ${highAlerts.map(a => `<div style="margin-bottom:20px;padding:16px;border-left:4px solid #FF4444;background:#fafafa;border-radius:4px">
        <strong style="font-size:15px">${a.entity || 'Unknown'}: ${a.title}</strong>
        <p style="margin:8px 0;color:#555">${a.detail}</p>
        <p style="color:#7C5CFC;font-weight:600">→ ${a.action || 'Review in Vela'}</p>
      </div>`).join('')}
      <p style="margin-top:24px;color:#999;font-size:12px">Open <a href="https://vela-platform-one.vercel.app">Vela</a> and say "brief me" for full context.</p>
    </div>`;
    const boundary = `b_${Date.now()}`;
    let mime = `To: ${userEmail}\r\nFrom: ${userEmail}\r\nSubject: ${subject}\r\n`;
    mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody}\r\n`;
    mime += `--${boundary}--`;
    const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    console.log(`[Proactive] Sent email alert for ${highAlerts.length} high-severity convergences`);
  } catch (err) { console.error('[Proactive] Email notification failed:', err.message); }
}

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('cron-proactive', 'started');
    try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Pull 5 data streams in parallel (safe array conversion)
    const safe = (v) => Array.isArray(v) ? v : [];
    const [newsSignals_, outreachReplies_, stageChanges_, upcomingTasks_, staleDeals_, upcomingRaces_] = await Promise.all([
      sbFetch(`news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gt.${oneDayAgo}&select=title,matched_companies,published_at&order=published_at.desc&limit=20`).catch(() => []),
      sbFetch(`outreach_scores?outcome=eq.replied&sent_at=gt.${oneDayAgo}&select=recipient_name,recipient_email,company,sent_at&order=sent_at.desc&limit=20`).catch(() => []),
      sbFetch(`deal_stage_history?changed_at=gt.${oneDayAgo}&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc&limit=20`).catch(() => []),
      sbFetch(`tasks?select=data&order=updated_at.desc&limit=30`).catch(() => []),
      sbFetch(`deals?select=data&data->>status=eq.active&limit=200`).catch(() => []),
      sbFetch(`race_calendar?date=gt.${now.toISOString().split('T')[0]}&order=date&limit=5&select=name,date,circuit,series`).catch(() => []),
    ]);
    const newsSignals = safe(newsSignals_);
    const outreachReplies = safe(outreachReplies_);
    const stageChanges = safe(stageChanges_);
    const upcomingTasks = safe(upcomingTasks_);
    const staleDeals = safe(staleDeals_);
    const upcomingRaces = safe(upcomingRaces_);

    // Race proximity analysis — identify outreach windows
    const raceWindows = upcomingRaces.map(r => {
      const daysTo = Math.ceil((new Date(r.date) - now) / 86400000);
      return { name: r.name, series: r.series, circuit: r.circuit, daysTo, date: r.date,
        urgency: daysTo <= 14 ? 'critical' : daysTo <= 30 ? 'high' : 'normal' };
    });


    // Filter tasks
    const allTasks = upcomingTasks;
    const outstanding = allTasks.filter(t => !t.data?.completed);
    const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);
    const dueSoon = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date(nextDay) && new Date(t.data.dueDate) >= now);

    // Find stale deals (crossing 7d, 14d, 30d thresholds)
    const stale = [];
    for (const d of staleDeals) {
      const data = d.data || {};
      const last = data.lastActivity ? new Date(data.lastActivity) : null;
      if (!last) continue;
      const daysSince = Math.floor((now - last) / 86400000);
      if (daysSince >= 7) stale.push({ company: data.company, daysSince, stage: data.stage, contact: data.contactName });
    }

    // Build data summary for Haiku cross-referencing
    const dataPayload = JSON.stringify({
      newsSignals: newsSignals.map(n => ({ title: n.title, companies: (n.matched_companies||[]).map(c => c.name||c) })),
      outreachReplies: outreachReplies.map(r => ({ name: r.recipient_name, company: r.company })),
      stageChanges: stageChanges.map(s => ({ from: s.from_stage, to: s.to_stage })),
      overdueTasks: overdue.slice(0, 5).map(t => ({ type: t.data.type, notes: t.data.notes, company: t.data.company })),
      dueSoonTasks: dueSoon.slice(0, 5).map(t => ({ type: t.data.type, notes: t.data.notes, company: t.data.company })),
      staleDeals: stale.slice(0, 10).map(s => ({ company: s.company, daysSince: s.daysSince, stage: s.stage })),
      raceWindows: raceWindows.filter(r => r.daysTo <= 45),
    });


    // Skip if no data worth cross-referencing
    const hasData = newsSignals.length + outreachReplies.length + stale.length + overdue.length + raceWindows.filter(r => r.urgency !== 'normal').length;
    if (hasData === 0) {
      await cronHeartbeat('cron-proactive', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No signals to cross-reference', alerts: 0 });
    }

    // Cross-reference via Haiku — identify convergence moments
    const crossRef = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `You identify CONVERGENCE MOMENTS in business data — where multiple signals point to the same company or opportunity. You also identify RACE WINDOW URGENCY — when upcoming race weekends (F1, MotoGP, WEC, Formula E) create natural outreach deadlines for sponsorship deals. Stale deals within 30 days of a race are high-priority. Return ONLY valid JSON array. Each item: { "entity": "Company Name", "severity": "high|medium|low", "title": "Short alert title", "detail": "2-3 sentence explanation of why these signals converge", "action": "Specific recommended next step, e.g. 'Draft authority follow-up email referencing their funding announcement'" }. If no convergence found, return empty array []. Maximum 5 alerts. ALWAYS include an action for each alert.`,
      messages: [{ role: 'user', content: `Cross-reference these 6 data streams from the last 24 hours. Find companies appearing in 2+ streams, urgent patterns, or stale deals that need outreach before an upcoming race weekend:\n\n${dataPayload}` }],
    });

    const rawText = crossRef.content[0]?.text || '[]';
    let alerts = [];
    try {
      alerts = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[Proactive] Failed to parse Haiku response:', rawText.slice(0, 200));
      await cronHeartbeat('cron-proactive', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'Cross-reference ran but parse failed', raw: rawText.slice(0, 200) });
    }

    if (!Array.isArray(alerts) || !alerts.length) {
      await cronHeartbeat('cron-proactive', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No convergence detected', alerts: 0 });
    }


    // Write convergence alerts + draft actions to kiko_alerts and kiko_draft_actions
    let written = 0;
    let drafts = 0;
    for (const alert of alerts.slice(0, 5)) {
      try {
        const { data: alertRow } = await sbFetch('kiko_alerts', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            type: 'convergence',
            severity: alert.severity || 'medium',
            title: (alert.title || '').slice(0, 200),
            detail: (alert.detail || '').slice(0, 500),
            entity_name: (alert.entity || '').slice(0, 100),
            dismissed: false,
            expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          })
        });
        written++;

        // Phase 14: Create draft action if alert has a suggested action
        if (alert.action && alert.entity) {
          try {
            const alertId = Array.isArray(alertRow) ? alertRow[0]?.id : alertRow?.id;
            await sbFetch('kiko_draft_actions', {
              method: 'POST',
              body: JSON.stringify({
                alert_id: alertId || null,
                action_type: 'follow_up',
                payload: {
                  entity: alert.entity,
                  suggested_action: alert.action,
                  context: (alert.detail || '').slice(0, 300),
                },
                status: 'pending',
              })
            });
            drafts++;
          } catch {}
        }
      } catch (err) {
        console.error('[Proactive] Failed to write alert:', err.message);
      }
    }

    // Send email notification for high-severity alerts to all active users
    const users = await getActiveUsers();
    for (const u of users) { try { await sendAlertEmail(alerts, u.email); } catch {} }

    await cronHeartbeat('cron-proactive', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: written });
    return res.status(200).json({ ok: true, alerts: written, drafts, total_signals: hasData });
  } catch (err) {
    console.error('[Proactive] Engine error:', err.message);
    await cronHeartbeat('cron-proactive', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart });
    return res.status(200).json({ ok: false, error: err.message }); // 200 so Vercel cron doesn't retry
  }
}
