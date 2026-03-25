// api/cron-proactive.js — Proactive Intelligence Engine (Phase 11)
// Runs daily at 7:00 AM UK. Cross-references 5 data streams via Haiku.
// Writes convergence alerts to kiko_alerts.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Pull 5 data streams in parallel (safe array conversion)
    const safe = (v) => Array.isArray(v) ? v : [];
    const [newsSignals_, outreachReplies_, stageChanges_, upcomingTasks_, staleDeals_] = await Promise.all([
      sbFetch(`news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gt.${oneDayAgo}&select=title,matched_companies,published_at&order=published_at.desc&limit=20`).catch(() => []),
      sbFetch(`outreach_scores?outcome=eq.replied&sent_at=gt.${oneDayAgo}&select=recipient_name,recipient_email,company,sent_at&order=sent_at.desc&limit=20`).catch(() => []),
      sbFetch(`deal_stage_history?changed_at=gt.${oneDayAgo}&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc&limit=20`).catch(() => []),
      sbFetch(`tasks?select=data&order=updated_at.desc&limit=30`).catch(() => []),
      sbFetch(`deals?select=data&data->>status=eq.active&limit=200`).catch(() => []),
    ]);
    const newsSignals = safe(newsSignals_);
    const outreachReplies = safe(outreachReplies_);
    const stageChanges = safe(stageChanges_);
    const upcomingTasks = safe(upcomingTasks_);
    const staleDeals = safe(staleDeals_);


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
    });


    // Skip if no data worth cross-referencing
    const hasData = newsSignals.length + outreachReplies.length + stale.length + overdue.length;
    if (hasData === 0) {
      return res.status(200).json({ ok: true, message: 'No signals to cross-reference', alerts: 0 });
    }

    // Cross-reference via Haiku — identify convergence moments
    const crossRef = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `You identify CONVERGENCE MOMENTS in business data — where multiple signals point to the same company or opportunity. Return ONLY valid JSON array. Each item: { "entity": "Company Name", "severity": "high|medium|low", "title": "Short alert title", "detail": "2-3 sentence explanation of why these signals converge", "action": "Specific recommended action" }. If no convergence found, return empty array []. Maximum 5 alerts.`,
      messages: [{ role: 'user', content: `Cross-reference these data streams from the last 24 hours. Find companies appearing in 2+ streams, or urgent patterns:\n\n${dataPayload}` }],
    });

    const rawText = crossRef.content[0]?.text || '[]';
    let alerts = [];
    try {
      alerts = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[Proactive] Failed to parse Haiku response:', rawText.slice(0, 200));
      return res.status(200).json({ ok: true, message: 'Cross-reference ran but parse failed', raw: rawText.slice(0, 200) });
    }

    if (!Array.isArray(alerts) || !alerts.length) {
      return res.status(200).json({ ok: true, message: 'No convergence detected', alerts: 0 });
    }


    // Write convergence alerts to kiko_alerts
    let written = 0;
    for (const alert of alerts.slice(0, 5)) {
      try {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'convergence',
            severity: alert.severity || 'medium',
            title: (alert.title || '').slice(0, 200),
            detail: (alert.detail || '').slice(0, 500),
            entity_name: (alert.entity || '').slice(0, 100),
            dismissed: false,
            expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(), // 48h expiry
          })
        });
        written++;
      } catch (err) {
        console.error('[Proactive] Failed to write alert:', err.message);
      }
    }

    return res.status(200).json({ ok: true, alerts: written, total_signals: hasData });
  } catch (err) {
    console.error('[Proactive] Engine error:', err.message);
    return res.status(200).json({ ok: false, error: err.message }); // 200 so Vercel cron doesn't retry
  }
}
