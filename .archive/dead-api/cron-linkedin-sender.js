// api/cron-linkedin-sender.js — LinkedIn Sequence Action Sender
// Runs every 30min Mon-Fri 8am-5pm UTC. Picks up pending LinkedIn actions
// from kiko_linkedin_queue and executes via Layer 1 tools.
// Daily cap enforced inside linkedin-client.js (graduated 25→40).
// Random 30-90s delays between actions in same batch.
// STANDALONE — if this fails, actions stay 'pending' until next run.

import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { linkedinSendInvite, linkedinSendMessage, LinkedInKillSwitchEngagedError, LinkedInQuotaExceededError } from './linkedin-client.js';

export const config = { maxDuration: 300 };

const BATCH_SIZE = 3;
const MIN_DELAY_MS = 30000;
const MAX_DELAY_MS = 90000;

function randomDelay() { return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-sender', 'started');
  try {
    const pending = await sbFetch(`kiko_linkedin_queue?status=eq.pending&order=priority.desc,created_at.asc&limit=${BATCH_SIZE}`);
    const safe = Array.isArray(pending) ? pending : [];
    if (!safe.length) {
      await cronHeartbeat('cron-linkedin-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No pending LinkedIn actions', sent: 0 });
    }

    let sent = 0, failed = 0, killSwitchHit = false, quotaHit = false;

    for (const row of safe) {
      try {
        let linkedinUrl = row.linkedin_url;
        if (!linkedinUrl && row.enrollment_id) {
          const enr = await sbFetch(`kiko_sequence_enrollments?id=eq.${row.enrollment_id}&select=linkedin_url&limit=1`);
          linkedinUrl = enr?.[0]?.linkedin_url || null;
        }
        if (!linkedinUrl) {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }) });
          await logError('cron-linkedin-sender', `No linkedin_url for queue row ${row.id}`, `contact: ${row.contact_name} at ${row.company}`, 'warning');
          failed++;
          continue;
        }

        if (row.message_type === 'connection' || row.message_type === 'invite') {
          await linkedinSendInvite(linkedinUrl, (row.message || '').slice(0, 200), 'cron-linkedin-sender');
        } else if (row.message_type === 'message' || row.message_type === 'dm') {
          await linkedinSendMessage(linkedinUrl, row.message || '', 'cron-linkedin-sender');
        } else if (row.message_type === 'engage') {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'skipped', actioned_at: new Date().toISOString() }) });
          continue;
        } else {
          throw new Error(`Unknown message_type: ${row.message_type}`);
        }

        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', actioned_at: new Date().toISOString() }) });
        sent++;
        if (sent + failed < safe.length) await sleep(randomDelay());
      } catch (err) {
        if (err instanceof LinkedInKillSwitchEngagedError) { killSwitchHit = true; break; }
        if (err instanceof LinkedInQuotaExceededError) { quotaHit = true; break; }
        if (err.message?.includes('LinkedIn auth failed') || err.message?.includes('401') || err.message?.includes('403')) {
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({ type: 'linkedin_auth_failed', severity: 'high', title: '🚨 LinkedIn auth failed — cookies need re-extraction', detail: 'cron-linkedin-sender hit a 401/403 on LinkedIn voyager API.', entity_type: 'system', entity_name: 'LinkedIn Auth', created_at: new Date().toISOString() }) }).catch(() => {});
          break;
        }
        console.error(`[LinkedInSender] row ${row.id} failed:`, err.message);
        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }) });
        await logError('cron-linkedin-sender', err.message, `row ${row.id} (${row.contact_name} at ${row.company})`, 'error');
        failed++;
      }
    }

    // Auto-pause check: >3 failures in last 30min
    try {
      const recentFailures = await sbFetch(`kiko_linkedin_audit?status=eq.failed&created_at=gte.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}&select=id`);
      if (Array.isArray(recentFailures) && recentFailures.length >= 3) {
        await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({ type: 'linkedin_failure_burst', severity: 'high', title: '⚠️ LinkedIn burst-failure detected', detail: `${recentFailures.length} LinkedIn failures in last 30 min.`, entity_type: 'system', entity_name: 'LinkedIn Sender', created_at: new Date().toISOString() }) }).catch(() => {});
      }
    } catch {}

    await cronHeartbeat('cron-linkedin-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sent + failed });
    return res.status(200).json({ ok: true, sent, failed, killSwitchHit, quotaHit });
  } catch (err) {
    console.error('[LinkedInSender] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-sender', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
