// api/cron-deal-attribution.js — Deal Attribution Engine
// Runs daily at 10:30pm. Tracks deal stage changes, correlates with
// Kiko activities (emails sent, alerts created, enrichment done).
// Builds attribution loop: Kiko action → deal progression → feedback.
// STANDALONE — if this fails, nothing else breaks.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 30 };
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-deal-attribution', 'started');
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now - 2 * 86400000).toISOString();

    // 1. Get recent deal stage changes
    const stageChanges = await sbFetch(`deal_stage_history?changed_at=gt.${twoDaysAgo}&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc&limit=20`);
    const changes = Array.isArray(stageChanges) ? stageChanges : [];

    // 2. Get recent Kiko activities for correlation
    const [recentAlerts, recentDrafts, recentScores] = await Promise.all([
      sbFetch(`kiko_alerts?created_at=gt.${twoDaysAgo}&select=entity,title,type,created_at&limit=30`).catch(() => []),
      sbFetch(`kiko_draft_tracking?created_at=gt.${twoDaysAgo}&select=recipient,subject,status,created_at&limit=20`).catch(() => []),
      sbFetch(`outreach_scores?sent_at=gt.${twoDaysAgo}&select=company,outcome,messaging_approach,sent_at&limit=30`).catch(() => []),
    ]);
    const alerts = Array.isArray(recentAlerts) ? recentAlerts : [];
    const drafts = Array.isArray(recentDrafts) ? recentDrafts : [];
    const scores = Array.isArray(recentScores) ? recentScores : [];

    let attributed = 0;
    for (const change of changes) {
      // Get the deal details
      const deal = await sbFetch(`deals?id=eq.${change.deal_id}&select=data&limit=1`);
      const company = deal?.[0]?.data?.company;
      if (!company) continue;
      const companyLower = company.toLowerCase();

      // Check if Kiko had any activity related to this company recently
      const kikoAlert = alerts.find(a => a.entity?.toLowerCase().includes(companyLower));
      const kikoDraft = drafts.find(d => d.recipient?.toLowerCase().includes(companyLower) || d.subject?.toLowerCase().includes(companyLower));
      const kikoScore = scores.find(s => s.company?.toLowerCase().includes(companyLower));
      const kikoContributed = !!(kikoAlert || kikoDraft || kikoScore);
      const kikoAction = kikoAlert ? `Alert: ${kikoAlert.title}` : kikoDraft ? `Email drafted: ${kikoDraft.subject}` : kikoScore ? `Outreach scored: ${kikoScore.messaging_approach}` : null;

      // Determine event type based on stage progression
      const progressionMap = {
        'To Revisit→Contact Made': 'first_contact',
        'Contact Made→In Dialogue': 'engagement',
        'In Dialogue→Qualified': 'qualification',
        'Qualified→Meeting Arranged': 'meeting_booked',
        'Meeting Arranged→Proposal Sent': 'proposal_sent',
        'Proposal Sent→Closed Won': 'deal_closed',
      };
      const key = `${change.from_stage}→${change.to_stage}`;
      const eventType = progressionMap[key] || `stage_change_${change.from_stage}_to_${change.to_stage}`;

      await sbFetch('kiko_deal_attribution', {
        method: 'POST',
        body: JSON.stringify({
          deal_company: company,
          event_type: eventType,
          event_detail: `${change.from_stage} → ${change.to_stage}`,
          source: 'deal_stage_history',
          kiko_contributed: kikoContributed,
          kiko_action: kikoAction,
        })
      });
      attributed++;

      // If Kiko contributed, save to learning log
      if (kikoContributed) {
        await sbFetch('kiko_learning_log', {
          method: 'POST',
          body: JSON.stringify({
            org_id: ORG_ID,
            category: 'deal_attribution',
            entity_name: company,
            content: `DEAL PROGRESSION: ${company} moved ${change.from_stage} → ${change.to_stage}. Kiko contributed via: ${kikoAction}. This validates the approach used.`
          })
        });
      }
    }

    // 3. Also track email replies as attribution events
    for (const score of scores.filter(s => s.outcome === 'replied')) {
      const existingAttr = await sbFetch(`kiko_deal_attribution?deal_company=ilike.*${encodeURIComponent(score.company || '')}*&event_type=eq.reply_received&created_at=gt.${twoDaysAgo}&limit=1`);
      if (!existingAttr?.length && score.company) {
        await sbFetch('kiko_deal_attribution', {
          method: 'POST',
          body: JSON.stringify({
            deal_company: score.company,
            event_type: 'reply_received',
            event_detail: `Reply to ${score.messaging_approach} approach`,
            source: 'outreach_scores',
            kiko_contributed: true,
            kiko_action: `Outreach scored as ${score.messaging_approach}`,
          })
        });
        attributed++;
      }
    }

    await cronHeartbeat('cron-deal-attribution', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: attributed });
    return res.status(200).json({ ok: true, stage_changes: changes.length, attributed });
  } catch (err) {
    console.error('[DealAttribution] Fatal:', err.message);
    await cronHeartbeat('cron-deal-attribution', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
