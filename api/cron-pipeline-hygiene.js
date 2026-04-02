// api/cron-pipeline-hygiene.js — Pipeline Hygiene Engine
// Runs weekly (Sun 6:30am). Flags stale deals, suggests archival,
// identifies pipeline health issues. Writes alerts to kiko_alerts.
// STANDALONE — if this fails, nothing else breaks.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 30 };
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-pipeline-hygiene', 'started');
  try {
    const now = new Date();
    const deals = await sbFetch('deals?select=data&or=(data->>status.eq.active,data->>status.eq.open,data->>status.is.null)&limit=200');
    const safe = Array.isArray(deals) ? deals : [];
    let alerts = 0;

    for (const d of safe) {
      const data = d.data || {};
      const last = data.lastActivity ? new Date(data.lastActivity) : null;
      if (!last) continue;
      const daysSince = Math.floor((now - last) / 86400000);
      const company = data.company || 'Unknown';
      const stage = data.stage || 'unknown';
      const contact = data.contactName || 'no contact';

      // 90+ days inactive — suggest archival
      if (daysSince >= 90) {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            org_id: ORG_ID, type: 'pipeline_hygiene', entity: company,
            severity: 'medium',
            title: `ARCHIVE CANDIDATE: ${company}`,
            detail: `${daysSince} days inactive. Stage: ${stage}. Contact: ${contact}. No engagement detected. Consider archiving or running a pattern-interrupt re-engagement.`,
            action: `Either archive ${company} or send a completely new angle email to a different stakeholder`,
            created_at: now.toISOString()
          })
        });
        alerts++;
      }
      // 30-89 days — warn and recommend action
      else if (daysSince >= 30) {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            org_id: ORG_ID, type: 'pipeline_hygiene', entity: company,
            severity: daysSince >= 60 ? 'high' : 'low',
            title: `STALE DEAL: ${company} (${daysSince}d)`,
            detail: `${daysSince} days since last activity. Stage: ${stage}. Contact: ${contact}.`,
            action: daysSince >= 60
              ? `Urgent: ${company} is going cold. Send re-engagement or escalate to different contact`
              : `Schedule follow-up with ${contact} at ${company} this week`,
            created_at: now.toISOString()
          })
        });
        alerts++;
      }
    }

    await cronHeartbeat('cron-pipeline-hygiene', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: alerts });
    return res.status(200).json({ ok: true, deals_checked: safe.length, alerts_created: alerts });
  } catch (err) {
    console.error('[PipelineHygiene] Fatal:', err.message);
    await cronHeartbeat('cron-pipeline-hygiene', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
