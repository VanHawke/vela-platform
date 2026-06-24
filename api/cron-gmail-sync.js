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

          // Find contact in CRM by the actual recipient email
          const _cm = await sbFetch(`contacts?data->>email=ilike.${encodeURIComponent(recipientEmail)}&select=id,data&limit=1`).catch(() => []);
          const contact = _cm?.[0] || null;
          const contactName = contact?.data?.name || [contact?.data?.firstName, contact?.data?.lastName].filter(Boolean).join(' ') || recipientEmail.split('@')[0];
          const company = contact?.data?.company || '';

          // Create tracking record
          await sbFetch('kiko_email_tracking', {
            method: 'POST',
            body: JSON.stringify({
              sender_email: user.email,
              user_id: user.user_id, // attribute synced sends to the mailbox owner (getActiveUsers selects user_id) — stops null re-accumulation
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

      // ═══ PART 2: Scan INBOX for inbound from known contacts ═══
      // FIX: Removed is:unread (drops replies read on phone before cron runs)
      // FIX: Use high-water-mark from last successful sync instead of sliding 2h window
      // FIX: Dedup by gmail_message_id to prevent double-processing
      let inboxAfter = twoHoursAgo; // fallback
      try {
        const lastSync = await sbFetch('kiko_cron_heartbeats?cron_name=eq.cron-gmail-sync-inbox&select=last_success_at&limit=1');
        if (lastSync?.[0]?.last_success_at) {
          // Use last successful sync minus 5min buffer for overlap safety
          inboxAfter = Math.floor((new Date(lastSync[0].last_success_at).getTime() - 5 * 60 * 1000) / 1000);
        } else {
          // First run or no record: look back 24 hours to catch anything missed
          inboxAfter = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        }
      } catch {} // fallback to twoHoursAgo
      const inboxQuery = encodeURIComponent(`in:inbox after:${inboxAfter}`);
      const inboxList = await gmailFetch(token, `/messages?q=${inboxQuery}&maxResults=20`);

      for (const msg of (inboxList?.messages || [])) {
        try {
          const full = await gmailFetch(token, `/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
          if (!full) continue;

          const fromHeader = full.payload?.headers?.find(h => h.name === 'From')?.value || '';
          const senderEmail = fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader.split('<')[0]?.trim();
          if (!senderEmail || senderEmail.includes('vanhawke')) continue;

          // Dedup: skip if we've already processed this exact message
          const alreadyProcessed = await sbFetch(`kiko_email_tracking?gmail_message_id=eq.${msg.id}&limit=1`);
          if (alreadyProcessed?.length > 0) continue;

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

              // AUTO: Record bounce outcome
              try {
                const { recordOutcome } = await import('./lib/outcome-recorder.js');
                await recordOutcome(
                  `Email bounced for ${t.recipient_name} (${t.recipient_email})`,
                  'negative',
                  { what_failed: `Invalid email address: ${t.recipient_email}`, next_adjustment: 'Re-enrich this contact with correct email' },
                  'Alpine'
                );
              } catch (e) { /* silent */ }

              totalSynced++;
              console.log(`[gmail-sync] BOUNCE detected: ${t.recipient_email} — ${snippet.slice(0, 80)}`);
              continue; // Skip reply processing
            }

            // This is a reply to a tracked email — check if OOO or real
            const snippetLower = (full.snippet || '').toLowerCase();
            const isOOO = /\b(out of office|on leave|on vacation|on holiday|away from|auto.?reply|automatic reply|i.?m away|currently (out|away|unavailable)|will (return|be back)|annual leave|maternity|paternity)\b/i.test(snippetLower);
            const replyType = isOOO ? 'ooo' : 'reply';

            await sbFetch(`kiko_email_tracking?id=eq.${t.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                replied_at: new Date().toISOString(),
                reply_snippet: full.snippet || '',
                follow_up_dismissed: isOOO ? false : true, // Don't dismiss follow-up for OOO
              }),
            });

            // Also set reply_type in outreach queue if applicable
            await sbFetch(`kiko_outreach_queue?to_email=eq.${encodeURIComponent(t.recipient_email)}&reply_received_at=is.null&limit=1`, {
              method: 'PATCH',
              body: JSON.stringify({ reply_received_at: new Date().toISOString(), reply_snippet: full.snippet || '', reply_type: replyType }),
            }).catch(() => {});

            // Create alert — different for OOO vs real reply
            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: isOOO ? 'email_ooo' : 'email_reply',
                severity: isOOO ? 'low' : 'high',
                title: isOOO ? `OOO auto-reply from ${t.recipient_name}` : `REPLY from ${t.recipient_name}!`,
                detail: isOOO 
                  ? `${t.recipient_name} (${t.company}) sent an out-of-office reply. This is NOT a real engagement. ${(full.snippet || '').slice(0, 200)}. Follow-up NOT dismissed — needs re-contact after their return.`
                  : `${t.recipient_name} (${t.company}) replied to "${t.subject}". ${(full.snippet || '').slice(0, 200)}`,
                entity_type: 'contact',
                entity_name: t.recipient_name,
                dismissed: false,
              }),
            }).catch(() => {});

            // AUTO: Record outcome for the learning loop
            try {
              const { recordOutcome } = await import('./lib/outcome-recorder.js');
              await recordOutcome(
                isOOO 
                  ? `OOO auto-reply from ${t.recipient_name} (${t.company}) — not a real engagement`
                  : `Email reply from ${t.recipient_name} (${t.company}) to "${t.subject}"`,
                isOOO ? 'neutral' : 'positive',
                {
                  what_worked: isOOO ? null : `Subject: "${t.subject}" — prospect engaged and replied`,
                  next_adjustment: isOOO ? `Re-contact ${t.recipient_name} after their return from leave` : 'Analyse what made this prospect respond vs others who didn\'t'
                },
                'Alpine' // keyword to match campaign goal
              );
            } catch (e) { console.warn('[gmail-sync] Outcome recording failed:', e.message); }

            // REAL-TIME: Evaluate this signal against goals immediately
            try {
              const { evaluateSignal } = await import('./signal-evaluator.js');
              await evaluateSignal(
                `Email reply from ${t.recipient_name} (${t.company}) to "${t.subject}": ${(full.snippet || '').slice(0, 100)}`,
                'gmail',
                { contact: t.recipient_name, company: t.company }
              );
            } catch (e) { /* silent — don't break sync */ }

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

    // Write high-water-mark for inbox sync so next run starts from here
    try {
      await sbFetch('kiko_cron_heartbeats', {
        method: 'POST',
        body: JSON.stringify({ cron_name: 'cron-gmail-sync-inbox', status: 'finished', last_success_at: new Date().toISOString() }),
      });
    } catch {
      // If insert fails (duplicate), update instead
      await sbFetch('kiko_cron_heartbeats?cron_name=eq.cron-gmail-sync-inbox', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'finished', last_success_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    await cronHeartbeat('cron-gmail-sync', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: totalSynced });
    return res.json({ ok: true, synced: totalSynced, duration_ms: Date.now() - __hbStart });
  } catch (err) {
    console.error('[gmail-sync] Fatal:', err.message);
    await cronHeartbeat('cron-gmail-sync', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}