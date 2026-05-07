// api/cron-proactive-recommendations.js — Kiko's proactive intelligence engine
// Analyses patterns across pipeline, contacts, campaigns and generates specific actionable recommendations
// Runs daily at 7:30am Mon-Fri
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-proactive-recommendations', 'started');
  
  try {
    const recommendations = [];
    const now = new Date();

    // 1. OPENED BUT NO REPLY — prospects who opened emails but never replied (warm leads)
    const openedNoReply = await sbFetch(
      `kiko_outreach_queue?status=eq.sent&opened_at=not.is.null&select=to_name,to_email,company,subject,opened_at,enrollment_id&order=opened_at.desc&limit=20`
    );
    if (openedNoReply?.length) {
      for (const p of openedNoReply.slice(0, 5)) {
        // Check if this person has already been flagged
        const existing = await sbFetch(`kiko_alerts?type=eq.proactive_recommendation&entity_name=eq.${encodeURIComponent(p.to_name)}&dismissed=eq.false&limit=1`);
        if (!existing?.length) {
          recommendations.push({
            type: 'proactive_recommendation',
            severity: 'high',
            title: `🎯 ${p.to_name} opened your email but hasn't replied — follow up now`,
            detail: `${p.to_name} at ${p.company} opened "${p.subject}" on ${new Date(p.opened_at).toLocaleDateString('en-GB')}. They're interested enough to open but haven't acted. Send a short, direct follow-up referencing the category opportunity. Don't ask if they received it — assume they did and advance the conversation.`,
            entity_name: p.to_name,
          });
        }
      }
    }

    // 2. STALE DEALS — deals with no activity in 14+ days
    const staleDeals = await sbFetch(
      `deals?select=id,data&order=updated_at.asc&limit=10`
    );
    if (staleDeals?.length) {
      for (const d of staleDeals) {
        const dd = d.data || {};
        if (dd.status === 'won' || dd.status === 'lost') continue;
        const lastActivity = dd.lastActivityDate ? new Date(dd.lastActivityDate) : new Date(d.updated_at || 0);
        const daysSince = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
        if (daysSince >= 14) {
          const existing = await sbFetch(`kiko_alerts?type=eq.proactive_recommendation&entity_name=eq.${encodeURIComponent(dd.title || dd.company)}&dismissed=eq.false&limit=1`);
          if (!existing?.length) {
            recommendations.push({
              type: 'proactive_recommendation',
              severity: daysSince > 30 ? 'high' : 'medium',
              title: `⏰ ${dd.title || dd.company} — ${daysSince} days since last contact`,
              detail: `Deal "${dd.title}" at ${dd.stage || 'unknown'} stage has had no activity for ${daysSince} days. Contact: ${dd.contact || 'unknown'}. Action: Send a re-engagement email with a new angle — reference a recent industry development or upcoming race to create urgency.`,
              entity_name: dd.title || dd.company,
            });
          }
        }
      }
    }

    // 3. FOLLOW-UP OVERDUE — emails sent 5+ days ago with no reply
    const overdueFollowUps = await sbFetch(
      `kiko_email_tracking?follow_up_due=lt.${now.toISOString()}&select=recipient_name,recipient_email,company,subject,sent_at,follow_up_due&order=sent_at.asc&limit=20`
    );
    if (overdueFollowUps?.length) {
      // Check which ones don't already have alerts
      for (const f of overdueFollowUps.slice(0, 5)) {
        if (!f.recipient_name) continue;
        const existing = await sbFetch(`kiko_alerts?type=eq.follow_up_overdue&entity_name=eq.${encodeURIComponent(f.recipient_name)}&dismissed=eq.false&limit=1`);
        if (!existing?.length) {
          recommendations.push({
            type: 'follow_up_overdue',
            severity: 'medium',
            title: `Chase: ${f.recipient_name} (${f.company || 'Unknown'})`,
            detail: `Email "${f.subject}" sent ${new Date(f.sent_at).toLocaleDateString('en-GB')} — no reply in ${Math.floor((now - new Date(f.sent_at)) / (1000 * 60 * 60 * 24))} days. Follow up with a different angle.`,
            entity_name: f.recipient_name,
          });
        }
      }
    }

    // 4. CAMPAIGN MOMENTUM — if open rate drops below 50%, flag it
    const recentSends = await sbFetch(`kiko_outreach_queue?status=eq.sent&select=opened_at&order=sent_at.desc&limit=50`);
    if (recentSends?.length >= 10) {
      const opened = recentSends.filter(s => s.opened_at).length;
      const openRate = (opened / recentSends.length) * 100;
      if (openRate < 50) {
        recommendations.push({
          type: 'proactive_recommendation',
          severity: 'high',
          title: `📉 Campaign open rate dropped to ${Math.round(openRate)}% — subject lines may need refreshing`,
          detail: `Last ${recentSends.length} emails: ${opened} opened (${Math.round(openRate)}%). Consider A/B testing new subject lines or adjusting send times. Current best performing window: 9:30-11:30 AM local time.`,
          entity_name: 'Campaign Health',
        });
      }
    }

    // 5. Insert all recommendations
    for (const rec of recommendations) {
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify(rec) });
    }

    // Log to activities
    if (recommendations.length > 0) {
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({
        type: 'kiko_cron_action', entity_name: 'Proactive Intelligence',
        subject: `Kiko generated ${recommendations.length} proactive recommendation${recommendations.length > 1 ? 's' : ''}`,
        status: 'completed',
        metadata: { count: recommendations.length, types: recommendations.map(r => r.type) }
      }) }).catch(() => {});
    }

    console.log(`[ProactiveRecs] Generated ${recommendations.length} recommendations`);
    await cronHeartbeat('cron-proactive-recommendations', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: recommendations.length });
    return res.status(200).json({ ok: true, recommendations: recommendations.length });
  } catch (e) {
    console.error('[ProactiveRecs] Error:', e);
    await cronHeartbeat('cron-proactive-recommendations', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, error: e.message });
    return res.status(500).json({ error: e.message });
  }
}
