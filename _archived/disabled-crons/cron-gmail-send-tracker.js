// api/cron-gmail-send-tracker.js — Gmail Send Monitoring
// Tracks ALL emails sent from Gmail to CRM contacts.
// Creates follow-up reminders. Detects replies.
// Runs every 30 minutes during business hours.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-gmail-send-tracker', 'started');
  try {
    const users = await getActiveUsers();
    let tracked = 0, replies = 0;

    for (const user of users) {
      const token = await getGoogleToken(user.email);
      if (!token) continue;

      // Fetch last 50 sent emails (configurable window)
      const backfillDays = req.body?.backfill_days || 1;
      const since = new Date(Date.now() - backfillDays * 24 * 60 * 60 * 1000);
      const query = `in:sent after:${Math.floor(since.getTime() / 1000)}`;
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const messageIds = (searchData.messages || []).map(m => m.id);
      if (!messageIds.length) continue;

      // Check which we've already tracked
      const existing = await sbFetch(
        `kiko_email_tracking?gmail_message_id=in.(${messageIds.join(',')})&select=gmail_message_id`
      ).catch(() => []);
      const existingIds = new Set((existing || []).map(e => e.gmail_message_id));

      // Also check campaign outreach queue (don't double-track campaign emails)
      const campaignIds = await sbFetch(
        `kiko_outreach_queue?gmail_message_id=in.(${messageIds.join(',')})&select=gmail_message_id`
      ).catch(() => []);
      const campaignSet = new Set((campaignIds || []).map(e => e.gmail_message_id));

      // Get all CRM contact emails for matching
      const contacts = await sbFetch('contacts?select=id,data&limit=2000').catch(() => []);
      const contactMap = new Map();
      for (const c of (contacts || [])) {
        const email = (c.data?.email || '').toLowerCase();
        if (email) contactMap.set(email, { id: c.id, name: `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.trim(), company: c.data?.company || '' });
      }

      // Process new sent emails
      for (const msgId of messageIds) {
        if (existingIds.has(msgId) || campaignSet.has(msgId)) continue;

        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const msg = await msgRes.json();
          const headers = msg.payload?.headers || [];
          const to = (headers.find(h => h.name === 'To')?.value || '').toLowerCase();
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const dateStr = headers.find(h => h.name === 'Date')?.value;

          // Extract email address from "Name <email>" format
          const emailMatch = to.match(/<([^>]+)>/) || [null, to.split(',')[0].trim()];
          const recipientEmail = (emailMatch[1] || '').toLowerCase().trim();
          if (!recipientEmail || !recipientEmail.includes('@')) continue;

          // Check if recipient is a CRM contact
          const contact = contactMap.get(recipientEmail);
          if (!contact) continue; // Not a CRM contact, skip

          // Calculate follow-up due (3 business days from send)
          const sentAt = dateStr ? new Date(dateStr) : new Date();
          const followUpDue = addBusinessDays(sentAt, 3);

          // Create tracking record — use direct Supabase REST with error checking
          const trackPayload = {
            user_id: user.user_id,
            sender_email: user.email,
            recipient_email: recipientEmail,
            recipient_name: contact.name,
            company: contact.company,
            subject,
            snippet: msg.snippet || '',
            gmail_message_id: msgId,
            gmail_thread_id: msg.threadId,
            source: 'gmail',
            sent_at: sentAt.toISOString(),
            follow_up_due: followUpDue.toISOString(),
          };
          const trackRes = await sbFetch('kiko_email_tracking', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(trackPayload),
          });
          if (trackRes?.code || trackRes?.message) {
            console.error(`[gmail-tracker] INSERT FAILED for ${contact.name}:`, JSON.stringify(trackRes));
          } else {
            console.log(`[gmail-tracker] Tracked: ${contact.name} (${contact.company})`);
          }

          // Create Command Centre alert
          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              type: 'email_sent_manual',
              severity: 'low',
              title: `Email sent to ${contact.name}`,
              detail: `${user.email.split('@')[0]} emailed ${contact.name} (${contact.company}). Subject: "${subject}". Follow-up due ${followUpDue.toLocaleDateString()}.`,
              entity_type: 'contact',
              entity_name: contact.name,
              user_id: user.user_id,
            }),
          });

          tracked++;
        } catch (err) {
          console.error(`[gmail-tracker] Error processing msg ${msgId}:`, err.message);
        }
      }

      // Check for replies to tracked emails (no reply yet, thread has new messages)
      const pendingFollowups = await sbFetch(
        `kiko_email_tracking?sender_email=eq.${encodeURIComponent(user.email)}&replied_at=is.null&follow_up_dismissed=eq.false&select=id,gmail_thread_id,recipient_email,recipient_name,company,subject`
      ).catch(() => []);

      for (const tracked_email of (pendingFollowups || [])) {
        if (!tracked_email.gmail_thread_id) continue;
        try {
          const threadRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tracked_email.gmail_thread_id}?format=metadata&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const thread = await threadRes.json();
          const messages = thread.messages || [];
          
          // Check if any message in the thread is FROM the recipient (= a reply)
          const replyMsg = messages.find(m => {
            const from = (m.payload?.headers?.find(h => h.name === 'From')?.value || '').toLowerCase();
            return from.includes(tracked_email.recipient_email);
          });

          if (replyMsg) {
            await sbFetch(`kiko_email_tracking?id=eq.${tracked_email.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                replied_at: new Date().toISOString(),
                reply_snippet: replyMsg.snippet || '',
                follow_up_dismissed: true, // Auto-dismiss: reply received = follow-up no longer needed
              }),
            });
            // Also mark any related tasks as completed
            try {
              const tasks = await sbFetch(`tasks?select=id,data&limit=5`);
              for (const t of (tasks || [])) {
                if (t.data?.contact?.toLowerCase()?.includes(tracked_email.recipient_name?.toLowerCase()) && t.data?.completed === false) {
                  await sbFetch(`tasks?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ data: { ...t.data, completed: true, completedAt: new Date().toISOString() } }) });
                }
              }
            } catch {}


            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: 'email_reply_manual',
                severity: 'high',
                title: `Reply from ${tracked_email.recipient_name}!`,
                detail: `${tracked_email.recipient_name} (${tracked_email.company}) replied to "${tracked_email.subject}". Snippet: ${(replyMsg.snippet || '').slice(0, 200)}`,
                entity_type: 'contact',
                entity_name: tracked_email.recipient_name,
                user_id: user.user_id,
                metadata: { subject: tracked_email.subject, from: tracked_email.recipient_email, company: tracked_email.company },
              }),
            });
            replies++;
          }
        } catch (err) {
          console.error(`[gmail-tracker] Reply check error:`, err.message);
        }
      }
    }

    // Check for overdue follow-ups and create alerts
    const overdue = await sbFetch(
      `kiko_email_tracking?follow_up_due=lt.${new Date().toISOString()}&replied_at=is.null&follow_up_dismissed=eq.false&select=id,recipient_name,company,subject,sent_at,sender_email`
    ).catch(() => []);

    for (const od of (overdue || [])) {
      // Check if alert already exists for this email
      const existingAlert = await sbFetch(
        `kiko_alerts?type=eq.follow_up_overdue&entity_name=eq.${encodeURIComponent(od.recipient_name)}&created_at=gt.${new Date(Date.now() - 24*60*60*1000).toISOString()}&select=id&limit=1`
      ).catch(() => []);
      
      if (!existingAlert?.length) {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'follow_up_overdue',
            severity: 'high',
            title: `Chase: ${od.recipient_name} (${od.company})`,
            detail: `Email "${od.subject}" sent ${new Date(od.sent_at).toLocaleDateString()} with no reply. Time to follow up.`,
            entity_type: 'contact',
            entity_name: od.recipient_name,
            user_id: od.user_id,
          }),
        });
      }
    }

    await cronHeartbeat('cron-gmail-send-tracker', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: tracked + replies,
    });

    return res.json({ ok: true, tracked, replies, overdue: (overdue || []).length });
  } catch (err) {
    console.error('[gmail-tracker] Fatal:', err.message);
    await cronHeartbeat('cron-gmail-send-tracker', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart, errorMessage: err.message,
    });
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}
