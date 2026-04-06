// api/cron-sequence-reply-detect.js — Reply & Bounce Detection
// Runs every 2 hours Mon-Fri. Checks Gmail for replies to sequenced emails.
// Stops sequence on reply. Flags bounces. Creates alerts.
// STANDALONE — if this fails, sequences just keep running (safe default).
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 30 };
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-sequence-reply-detect', 'started');
  try {
    const users = await getActiveUsers();
    let token = null;
    for (const u of users) { token = await getGoogleToken(u.email); if (token) break; }
    if (!token) {
      await cronHeartbeat('cron-sequence-reply-detect', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: false, error: 'No Google token' });
    }

    // Get active enrollments that have at least 1 sent email
    const enrollments = await sbFetch('kiko_sequence_enrollments?status=eq.active&current_step=gt.1&limit=30');
    const safe = Array.isArray(enrollments) ? enrollments : [];
    let replies = 0, bounces = 0;

    for (const enrollment of safe) {
      try {
        const email = enrollment.contact_email;
        if (!email) continue;

        // Search for replies from this contact
        const q = `from:${email} newer_than:7d`;
        const searchRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=3`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (searchData.messages?.length) {
          // Reply detected — stop the sequence
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
            status: 'replied', reply_detected_at: new Date().toISOString()
          }) });
          // Cancel all queued emails for this enrollment
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });

          // Create alert
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
            org_id: ORG_ID, type: 'sequence_reply', entity: enrollment.company,
            severity: 'high', title: `REPLY: ${enrollment.contact_name || email} responded`,
            detail: `${enrollment.contact_name} at ${enrollment.company} replied to sequence step ${enrollment.current_step - 1}. Sequence auto-stopped.`,
            action: `Read the reply and respond personally. This is a warm lead — move to In Dialogue stage.`,
            created_at: new Date().toISOString()
          }) });
          // Attribution
          await sbFetch('kiko_deal_attribution', { method: 'POST', body: JSON.stringify({
            deal_company: enrollment.company, event_type: 'reply_received',
            event_detail: `Reply to automated sequence step ${enrollment.current_step - 1}`,
            source: 'sequence_engine', kiko_contributed: true, kiko_action: `Sequence email triggered reply`
          }) });
          // Learning log
          await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
            org_id: ORG_ID, category: 'sequence_outcome', entity_name: enrollment.company,
            content: `REPLY at step ${enrollment.current_step - 1}. Sequence: auto-stopped. Contact: ${enrollment.contact_name}. This validates the approach used.`
          }) });
          replies++;
        }

        // Check for bounces
        const bounceQ = `from:mailer-daemon ${email} newer_than:7d`;
        const bounceRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(bounceQ)}&maxResults=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const bounceData = await bounceRes.json();
        if (bounceData.messages?.length) {
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
            status: 'bounced', bounce_detected_at: new Date().toISOString()
          }) });
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
          bounces++;
        }
      } catch (err) { console.error(`[ReplyDetect] ❌ ${enrollment.company}:`, err.message); }
    }

    await cronHeartbeat('cron-sequence-reply-detect', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: replies + bounces });
    return res.status(200).json({ ok: true, checked: safe.length, replies, bounces });
  } catch (err) {
    console.error('[ReplyDetect] Fatal:', err.message);
    await cronHeartbeat('cron-sequence-reply-detect', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
