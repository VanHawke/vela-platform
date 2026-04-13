// api/cron-sequence-sender.js — Sequence Email Sender
// Runs every 30min Mon-Fri 8am-6pm. Picks up queued emails and sends via Gmail.
// Max 5 per run to stay under Gmail rate limits. 30/day hard cap.
// STANDALONE — if this fails, emails just wait for the next run.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';
import { loadUserSignatures, buildMimeWithInlineImages } from './lib/email-format.js';

export const config = { maxDuration: 30 };

const TRACK_BASE = 'https://kiko.vanhawke.agency/api/track';

// Inject open pixel + wrap all http(s) links with click tracker.
// Recipient sees a normal email; we get open + click telemetry.
function instrumentHtml(html, queueId) {
  if (!html || !queueId) return html;
  let out = html;
  // 1. Wrap links: <a href="https://..."> → <a href="https://.../api/track?t=c&q=ID&u=BASE64URL">
  // Skip mailto:, tel:, anchors, and links already pointing to our tracker
  out = out.replace(/<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi, (match, pre, quote, url, post) => {
    if (url.includes('/api/track?')) return match;
    const b64 = Buffer.from(url, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tracked = `${TRACK_BASE}?t=c&q=${queueId}&u=${b64}`;
    return `<a ${pre}href=${quote}${tracked}${quote}${post}>`;
  });
  // 2. Inject open pixel at the very end of the body (after sign-off)
  const pixel = `<img src="${TRACK_BASE}?t=o&q=${queueId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  if (/<\/div>\s*$/.test(out)) {
    out = out.replace(/<\/div>\s*$/, pixel + '</div>');
  } else {
    out = out + pixel;
  }
  return out;
}

function buildRawEmail({ from, to, subject, bodyHtml, bodyPlain, threadId }) {
  const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  // Clean subject: × → x for email compatibility, encode non-ASCII
  const cleanSubj = (subject || '').replace(/\u00D7/g, 'x').replace(/[\u2014\u2013\u2015]/g, '-');
  const encodedSubj = /^[\x20-\x7E]*$/.test(cleanSubj) ? cleanSubj : `=?UTF-8?B?${Buffer.from(cleanSubj).toString('base64')}?=`;
  // Signature is now injected by wrapEmailBody at enqueue time — DO NOT double-append.
  // (Previously this function appended a hardcoded "Sunny Sidhu, CEO" sig, causing duplicates
  // and bypassing the user's actual signature from Settings. Removed 2026-04-07.)
  const plainWithSig = bodyPlain || '';
  const htmlWithSig = bodyHtml || '';
  let mime = `From: Sunny Sidhu <${from}>\r\nTo: ${to}\r\nSubject: ${encodedSubj}\r\n`;
  mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n`;
  if (threadId) mime += `In-Reply-To: ${threadId}\r\nReferences: ${threadId}\r\n`;
  mime += `\r\n--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${plainWithSig}\r\n`;
  mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlWithSig}\r\n`;
  mime += `--${boundary}--`;
  return Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-sequence-sender', 'started');
  try {
    const now = new Date();
    // Daily send limit: check how many sent today
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const sentToday = await sbFetch(`kiko_outreach_queue?status=eq.sent&sent_at=gte.${todayStart.toISOString()}&select=id`);
    const dailyCount = Array.isArray(sentToday) ? sentToday.length : 0;
    if (dailyCount >= 30) {
      await cronHeartbeat('cron-sequence-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: `Daily limit reached (${dailyCount}/30)`, sent: 0 });
    }

    // Get queued emails ready to send
    const queued = await sbFetch(`kiko_outreach_queue?status=eq.queued&channel=eq.email&scheduled_for=lte.${now.toISOString()}&order=scheduled_for&limit=5`);
    const safe = Array.isArray(queued) ? queued : [];
    if (!safe.length) {
      await cronHeartbeat('cron-sequence-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No emails to send', sent: 0 });
    }

    // Multi-user send-as: resolve Gmail token per-sequence via send_from_user_id
    // Group queued emails by their enrollment's sequence to resolve sender
    let sent = 0;
    const tokenCache = new Map(); // email → token
    const sigCache = new Map(); // email → { inlineImages }

    for (const email of safe) {
      try {
        // Resolve send-from user for this email's sequence
        let fromEmail = 'sunny@vanhawke.agency'; // fallback
        let token = null;
        let inlineImages = [];
        if (email.enrollment_id) {
          try {
            const enr = await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}&select=sequence_id&limit=1`);
            if (enr?.[0]?.sequence_id) {
              const seqRow = await sbFetch(`kiko_sequences?id=eq.${enr[0].sequence_id}&select=send_from_user_id&limit=1`);
              const sendFromUserId = seqRow?.[0]?.send_from_user_id;
              if (sendFromUserId) {
                const cfg = await sbFetch(`kiko_user_config?user_id=eq.${sendFromUserId}&select=email&limit=1`);
                if (cfg?.[0]?.email) fromEmail = cfg[0].email;
              }
            }
          } catch (e) { console.warn('[SeqSender] send-from lookup error:', e.message); }
        }
        // Get Gmail token for the resolved sender (cached per email address)
        if (!tokenCache.has(fromEmail)) {
          const t = await getGoogleToken(fromEmail);
          tokenCache.set(fromEmail, t);
        }
        token = tokenCache.get(fromEmail);
        if (!token) {
          // Fallback: try any active user's token
          const users = await getActiveUsers();
          for (const u of users) { token = await getGoogleToken(u.email); if (token) { fromEmail = u.email; break; } }
        }
        if (!token) {
          await sbFetch(`kiko_outreach_queue?id=eq.${email.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: `Send-as user (${fromEmail}) has no Gmail OAuth tokens` }) });
          continue;
        }
        // Load signature for this sender (cached)
        if (!sigCache.has(fromEmail)) {
          try { const sigs = await loadUserSignatures(sbFetch, null, token, fromEmail); sigCache.set(fromEmail, sigs.inlineImages || []); }
          catch { sigCache.set(fromEmail, []); }
        }
        inlineImages = sigCache.get(fromEmail);

        // Get previous thread ID for Re: threading
        let threadId = null;
        if (email.step_number > 1 && email.enrollment_id) {
          const prev = await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${email.enrollment_id}&status=eq.sent&step_number=lt.${email.step_number}&order=step_number.desc&limit=1`);
          threadId = prev?.[0]?.gmail_thread_id;
        }

        // Build raw MIME with inline signature images attached as multipart/related parts.
        // Without this, cid: refs in the signature HTML render as broken images.
        const raw = buildMimeWithInlineImages({
          from: fromEmail,
          to: email.to_email,
          subject: email.subject,
          htmlBody: instrumentHtml(email.body_html, email.id),
          plainBody: email.body_plain,
          threadId,
          inlineImages,
        });

        // Send via Gmail API
        const sendBody = threadId ? { raw, threadId } : { raw };
        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sendBody)
        });
        const result = await gmailRes.json();

        if (!gmailRes.ok) {
          await sbFetch(`kiko_outreach_queue?id=eq.${email.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: result.error?.message || 'Gmail API error' }) });
          continue;
        }

        // Mark as sent
        await sbFetch(`kiko_outreach_queue?id=eq.${email.id}`, { method: 'PATCH', body: JSON.stringify({
          status: 'sent', gmail_message_id: result.id, gmail_thread_id: result.threadId, sent_at: now.toISOString()
        }) });

        // Update enrollment current_step
        if (email.enrollment_id) {
          const enrollment = await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}&limit=1`);
          if (enrollment?.[0]) {
            const seq = await sbFetch(`kiko_sequences?id=eq.${enrollment[0].sequence_id}&limit=1`);
            const steps = seq?.[0]?.steps || [];
            const nextStep = steps.find(s => s.step === enrollment[0].current_step + 1);
            await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}`, { method: 'PATCH', body: JSON.stringify({
              current_step: enrollment[0].current_step + 1,
              next_send_at: nextStep ? new Date(now.getTime() + (nextStep.delay_days || 3) * 86400000).toISOString() : null,
              status: nextStep ? 'active' : 'completed',
              completed_at: nextStep ? null : now.toISOString()
            }) });
          }
        }

        // Track in draft_tracking for edit-delta learning
        await sbFetch('kiko_draft_tracking', { method: 'POST', body: JSON.stringify({
          gmail_message_id: result.id, original_content: email.body_plain?.slice(0, 2000),
          recipient: email.to_email, subject: email.subject, status: 'drafted'
        }) }).catch(() => {});

        sent++;
      } catch (err) { console.error(`[SeqSender] ❌ ${email.to_email}:`, err.message); }
    }

    await cronHeartbeat('cron-sequence-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sent });

    // ─── Notification (v0.0.39) ───
    // Write a notification row per active user when emails are sent so the
    // frontend (subscribed via Supabase realtime) can pop a toast.
    if (sent > 0) {
      try {
        const activeUsers = await sbFetch('user_settings?select=user_id&limit=20');
        for (const u of (activeUsers || [])) {
          await sbFetch('kiko_notifications', { method: 'POST', body: JSON.stringify({
            user_id: u.user_id,
            type: 'sequence_send',
            title: `${sent} ${sent === 1 ? 'email' : 'emails'} sent`,
            body: `Kiko just sent ${sent} sequence ${sent === 1 ? 'email' : 'emails'} from your active campaigns. Daily total: ${dailyCount + sent}/30.`,
            link: '/campaigns',
            metadata: { sent, daily_total: dailyCount + sent },
          })}).catch(() => {});
        }
      } catch (notifErr) { console.warn('[SeqSender] notification write failed:', notifErr?.message); }
    }

    return res.status(200).json({ ok: true, checked: safe.length, sent, daily_total: dailyCount + sent });
  } catch (err) {
    console.error('[SeqSender] Fatal:', err.message);
    await cronHeartbeat('cron-sequence-sender', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
