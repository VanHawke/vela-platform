// api/cron-gmail-sync.js — Full Gmail Activity Sync
// Scans sent folder + inbox for ALL email activity, not just Kiko-initiated.
// Updates contacts, dismisses follow-ups, creates tracking records.
// Runs every 30 minutes.

import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(token, path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-gmail-sync', 'started');
  try {
    const users = await getActiveUsers();
    let totalSynced = 0;

    for (const user of users) {
      const token = await getGoogleToken(user.email);
      if (!token) continue;

      // ═══ PART 1: Scan SENT folder for outgoing emails in last 2 hours ═══
      const twoHoursAgo = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
      const sentQuery = encodeURIComponent(`in:sent after:${twoHoursAgo}`);
      const sentList = await gmailFetch(token, `/messages?q=${sentQuery}&maxResults=20`);

      for (const msg of (sentList?.messages || [])) {
        try {
          const full = await gmailFetch(token, `/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
          if (!full) continue;

          const toHeader = full.payload?.headers?.find(h => h.name === 'To')?.value || '';
          const subject = full.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
          const recipientEmail = toHeader.match(/<([^>]+)>/)?.[1] || toHeader.split(',')[0]?.trim();
          if (!recipientEmail || recipientEmail.includes('vanhawke')) continue; // Skip internal
          // Skip automated/system emails
          const skipDomains = ['customer.io', 'mailchimp', 'sendgrid', 'noreply', 'no-reply', 'notifications', 'unsubscribe', 'support', 'billing', 'mailer-daemon', 'postmaster', 'google.com', 'github.com', 'stripe.com', 'slack.com', 'notion.so', 'vercel.com', 'supabase.io', 'anthropic.com'];
          const skipSubjects = ['unsubscribe', 'auto-reply', 'out of office', 'automatic reply', 'delivery status', 'mailer-daemon'];
          if (skipDomains.some(d => recipientEmail.toLowerCase().includes(d))) continue;
          if (skipSubjects.some(s => subject.toLowerCase().includes(s))) continue;

          // Check if already tracked
          const existing = await sbFetch(`kiko_email_tracking?gmail_message_id=eq.${msg.id}&limit=1`);
          if (existing?.length > 0) continue; // Already tracked

          // Find contact in CRM
          const contacts = await sbFetch(`contacts?select=id,data&limit=5`);
          const contact = (contacts || []).find(c => {
            const email = (c.data?.email || '').toLowerCase();
            return email === recipientEmail.toLowerCase();
          });
          const contactName = contact?.data?.name || contact?.data?.firstName || recipientEmail.split('@')[0];
          const company = contact?.data?.company || '';

          // Create tracking record
          await sbFetch('kiko_email_tracking', {
            method: 'POST',
            body: JSON.stringify({
              sender_email: user.email,
              recipient_email: recipientEmail,
              recipient_name: contactName,
              company,
              subject,
              gmail_message_id: msg.id,
              gmail_thread_id: full.threadId,
              source: 'gmail_sync',
              sent_at: new Date(parseInt(full.internalDate)).toISOString(),
              follow_up_due: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              contact_id: contact?.id || null,
            }),
          }).catch(() => {});

          // Dismiss any existing overdue follow-ups for this recipient
          await sbFetch(`kiko_email_tracking?recipient_email=eq.${encodeURIComponent(recipientEmail)}&follow_up_dismissed=eq.false&follow_up_due=lt.${new Date().toISOString()}&id=neq.${msg.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ follow_up_dismissed: true }),
          }).catch(() => {});
          // Also dismiss old entries in kiko_follow_ups
          await sbFetch(`kiko_follow_ups?recipient_email=eq.${encodeURIComponent(recipientEmail)}&status=eq.awaiting_reply&follow_up_due_at=lt.${new Date().toISOString()}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'followed_up', updated_at: new Date().toISOString() }),
          }).catch(() => {});

          // Mark related tasks as completed
          const tasks = await sbFetch(`tasks?select=id,data&limit=50`);
          for (const t of (tasks || [])) {
            if (t.data?.completed === false && contactName &&
                (t.data?.contact || '').toLowerCase().includes(contactName.toLowerCase())) {
              await sbFetch(`tasks?id=eq.${t.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ data: { ...t.data, completed: true, completedAt: new Date().toISOString() } }),
              }).catch(() => {});
            }
          }

          // Update contact last_contacted_at
          if (contact?.id) {
            const updatedData = { ...contact.data, last_contacted_at: new Date().toISOString() };
            await sbFetch(`contacts?id=eq.${contact.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ data: updatedData }),
            }).catch(() => {});
          }

          totalSynced++;
          console.log(`[gmail-sync] Tracked sent: ${user.email} → ${recipientEmail} "${subject.slice(0, 40)}"`);
        } catch (e) { console.warn(`[gmail-sync] Error processing sent msg:`, e.message); }
      }

      // ═══ PART 2: Scan INBOX for inbound from known contacts (last 2 hours) ═══
      const inboxQuery = encodeURIComponent(`in:inbox is:unread after:${twoHoursAgo}`);
      const inboxList = await gmailFetch(token, `/messages?q=${inboxQuery}&maxResults=20`);

      for (const msg of (inboxList?.messages || [])) {
        try {
          const full = await gmailFetch(token, `/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
          if (!full) continue;

          const fromHeader = full.payload?.headers?.find(h => h.name === 'From')?.value || '';
          const senderEmail = fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader.split('<')[0]?.trim();
          if (!senderEmail || senderEmail.includes('vanhawke')) continue;

          // Check if this is a reply to a tracked thread
          const tracked = await sbFetch(`kiko_email_tracking?gmail_thread_id=eq.${full.threadId}&replied_at=is.null&limit=1`);
          if (tracked?.length > 0) {
            const t = tracked[0];
            
            // ── BOUNCE DETECTION ──
            const snippet = (full.snippet || '').toLowerCase();
            const fromLower = fromHeader.toLowerCase();
            const bounceSignals = ['mailer-daemon', 'postmaster', 'delivery status', 'mail delivery', 'undeliverable'];
            const bounceSnippets = ['address not found', 'delivery failed', 'undeliverable', 'user unknown', 'mailbox not found', 'does not exist', 'unable to receive', 'rejected', 'permanent failure', 'hard bounce', 'address rejected'];
            const isBounce = bounceSignals.some(s => fromLower.includes(s)) || bounceSnippets.some(s => snippet.includes(s));

            if (isBounce) {
              // Mark as BOUNCED, not replied
              await sbFetch(`kiko_email_tracking?id=eq.${t.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ bounced_at: new Date().toISOString(), bounce_reason: snippet.slice(0, 500), follow_up_dismissed: true }),
              });
              // Pause the sequence enrollment
              if (t.contact_id || t.recipient_email) {
                const enrollments = await sbFetch(`kiko_sequence_enrollments?contact_email=eq.${encodeURIComponent(t.recipient_email)}&status=eq.active&limit=1`);
                if (enrollments?.[0]) {
                  await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollments[0].id}`, {
                    method: 'PATCH', body: JSON.stringify({ status: 'bounced', paused_reason: 'Email address bounced' }),
                  });
                }
              }
              // Create bounce alert (not reply alert)
              await sbFetch('kiko_alerts', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'email_bounce', severity: 'medium',
                  title: `Email bounced: ${t.recipient_name}`,
                  detail: `Email to ${t.recipient_name} (${t.recipient_email}) bounced. ${snippet.slice(0, 200)}`,
                  entity_type: 'contact', entity_name: t.recipient_name, dismissed: false,
                }),
              }).catch(() => {});
              totalSynced++;
              console.log(`[gmail-sync] BOUNCE detected: ${t.recipient_email} — ${snippet.slice(0, 80)}`);
              continue; // Skip reply processing
            }

            // This is a REAL reply to a tracked email
            await sbFetch(`kiko_email_tracking?id=eq.${t.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                replied_at: new Date().toISOString(),
                reply_snippet: full.snippet || '',
                follow_up_dismissed: true,
              }),
            });

            // Create high-priority alert
            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: 'email_reply',
                severity: 'high',
                title: `Reply from ${t.recipient_name}!`,
                detail: `${t.recipient_name} (${t.company}) replied to "${t.subject}". ${(full.snippet || '').slice(0, 200)}`,
                entity_type: 'contact',
                entity_name: t.recipient_name,
                dismissed: false,
              }),
            }).catch(() => {});

            // Mark related tasks as completed
            const tasks = await sbFetch(`tasks?select=id,data&limit=50`);
            for (const tk of (tasks || [])) {
              if (tk.data?.completed === false && t.recipient_name &&
                  (tk.data?.contact || '').toLowerCase().includes(t.recipient_name.toLowerCase())) {
                await sbFetch(`tasks?id=eq.${tk.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ data: { ...tk.data, completed: true, completedAt: new Date().toISOString() } }),
                }).catch(() => {});
              }
            }

            totalSynced++;
            console.log(`[gmail-sync] Reply detected: ${senderEmail} replied to "${t.subject?.slice(0, 40)}"`);
          }
        } catch (e) { console.warn(`[gmail-sync] Error processing inbox msg:`, e.message); }
      }
    }

    await cronHeartbeat('cron-gmail-sync', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: totalSynced });
    return res.json({ ok: true, synced: totalSynced, duration_ms: Date.now() - __hbStart });
  } catch (err) {
    console.error('[gmail-sync] Fatal:', err.message);
    await cronHeartbeat('cron-gmail-sync', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}