// api/cron-sequence-sender.js — Sequence Email Sender
// Runs every 5min Mon-Fri 8am-6pm. Picks up queued emails and sends via Gmail.
// Reads DAILY_EMAIL_LIMIT and EMAIL_BATCH_SIZE from platform_config table.
// STANDALONE — if this fails, emails just wait for the next run.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';
import { loadUserSignatures, buildMimeWithInlineImages } from './lib/email-format.js';


const TRACK_BASE = 'https://api.vanhawke.agency/api/track';

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
  const DISPLAY_NAMES = { 'sunny@vanhawke.agency': 'Sunny Sidhu', 'matt.smith@vanhawke.agency': 'Matt Smith', 'sunny@vanhawke.com': 'Sunny Sidhu', 'matt.smith@vanhawke.com': 'Matt Smith' };
  const senderName = DISPLAY_NAMES[from] || from.split('@')[0];
  const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const cleanSubj = (subject || '').replace(/\u00D7/g, 'x').replace(/[\u2014\u2013\u2015]/g, '-');
  const encodedSubj = /^[\x20-\x7E]*$/.test(cleanSubj) ? cleanSubj : `=?UTF-8?B?${Buffer.from(cleanSubj).toString('base64')}?=`;
  const plainWithSig = bodyPlain || '';
  const htmlWithSig = bodyHtml || '';
  let mime = `From: ${senderName} <${from}>\r\nTo: ${to}\r\nSubject: ${encodedSubj}\r\n`;
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
    // Read config from database (defaults: 100/day, 15/batch)
    const configRows = await sbFetch('platform_config?key=in.(DAILY_EMAIL_LIMIT,EMAIL_BATCH_SIZE)&select=key,value').catch(() => []);
    const cfg = {};
    if (Array.isArray(configRows)) configRows.forEach(r => { cfg[r.key] = parseInt(r.value) || 0; });
    const DAILY_LIMIT = cfg.DAILY_EMAIL_LIMIT || 100;
    const BATCH_SIZE = cfg.EMAIL_BATCH_SIZE || 15;

    if (dailyCount >= DAILY_LIMIT) {
      await cronHeartbeat('cron-sequence-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: `Daily limit reached (${dailyCount}/${DAILY_LIMIT})`, sent: 0 });
    }

    // Get queued emails ready to send
    const queued = await sbFetch(`kiko_outreach_queue?status=eq.queued&channel=eq.email&scheduled_for=lte.${now.toISOString()}&order=scheduled_for&limit=100`);
    const safe = Array.isArray(queued) ? queued : [];
    if (!safe.length) {
      await cronHeartbeat('cron-sequence-sender', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No emails to send', sent: 0 });
    }

    // Multi-user send-as: resolve Gmail token per-sequence via send_from_user_id
    // Also check send_days and send_window per sequence
    let sent = 0;
    const tokenCache = new Map(); // email → token
    const sigCache = new Map(); // email → { inlineImages }
    const seqCache = new Map(); // sequence_id → sequence row

    // Timezone offset map — maps location keywords to UTC offset hours
    // Based on research: optimal B2B email send times are 9-11am local (Tue-Thu peak)
    const TZ_MAP = {
      // Americas
      'new york': -4, 'boston': -4, 'washington': -4, 'miami': -4, 'atlanta': -4, 'charlotte': -4, 'philadelphia': -4, 'detroit': -4, 'pittsburgh': -4, 'eastern': -4, 'est': -4, 'edt': -4,
      'chicago': -5, 'houston': -5, 'dallas': -5, 'austin': -5, 'nashville': -5, 'central': -5, 'cst': -5, 'cdt': -5, 'minneapolis': -5, 'milwaukee': -5,
      'denver': -6, 'salt lake': -6, 'phoenix': -7, 'mountain': -6, 'mst': -6, 'mdt': -6,
      'los angeles': -7, 'san francisco': -7, 'seattle': -7, 'portland': -7, 'pacific': -7, 'pst': -7, 'pdt': -7, 'silicon valley': -7, 'bay area': -7, 'san jose': -7, 'san diego': -7,
      'toronto': -4, 'montreal': -4, 'vancouver': -7, 'calgary': -6, 'canada': -5,
      'mexico city': -6, 'brazil': -3, 'sao paulo': -3, 'bogota': -5, 'buenos aires': -3,
      // Europe
      'london': 1, 'united kingdom': 1, 'uk': 1, 'england': 1, 'scotland': 1, 'wales': 1, 'ireland': 1, 'dublin': 1, 'manchester': 1, 'birmingham': 1, 'edinburgh': 1, 'gmt': 0, 'bst': 1,
      'paris': 2, 'france': 2, 'berlin': 2, 'germany': 2, 'amsterdam': 2, 'netherlands': 2, 'brussels': 2, 'belgium': 2, 'zurich': 2, 'switzerland': 2, 'madrid': 2, 'spain': 2, 'rome': 2, 'italy': 2, 'milan': 2, 'vienna': 2, 'austria': 2, 'stockholm': 2, 'sweden': 2, 'oslo': 2, 'norway': 2, 'copenhagen': 2, 'denmark': 2, 'helsinki': 3, 'finland': 3, 'warsaw': 2, 'poland': 2, 'prague': 2, 'lisbon': 1, 'portugal': 1, 'cet': 2, 'cest': 2,
      // Middle East & Africa
      'dubai': 4, 'uae': 4, 'abu dhabi': 4, 'riyadh': 3, 'saudi': 3, 'qatar': 3, 'doha': 3, 'bahrain': 3, 'kuwait': 3, 'tel aviv': 3, 'israel': 3, 'johannesburg': 2, 'south africa': 2, 'cairo': 2, 'lagos': 1, 'nairobi': 3,
      // Asia Pacific
      'mumbai': 5.5, 'india': 5.5, 'delhi': 5.5, 'bangalore': 5.5, 'singapore': 8, 'hong kong': 8, 'shanghai': 8, 'beijing': 8, 'china': 8, 'tokyo': 9, 'japan': 9, 'seoul': 9, 'korea': 9, 'sydney': 11, 'melbourne': 11, 'australia': 11, 'auckland': 13, 'new zealand': 13, 'bangkok': 7, 'jakarta': 7,
    };

    function getTimezoneOffset(location) {
      if (!location) return 0; // default UTC (UK-ish)
      const loc = location.toLowerCase();
      for (const [keyword, offset] of Object.entries(TZ_MAP)) {
        if (loc.includes(keyword)) return offset;
      }
      // Fallback: if location contains "United States" but no city match, assume ET
      if (loc.includes('united states') || loc.includes('usa')) return -4;
      return 0; // default to UTC
    }

    // Helper: check if now is within the sequence's send window
    const dayMap = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
    const currentDay = dayMap[now.getUTCDay()];

    for (const email of safe) {
      try {
        // Resolve sequence config (cached)
        let seqConfig = null;
        let seqId = null;
        if (email.enrollment_id) {
          const enr = await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}&select=sequence_id,contact_id&limit=1`).catch(() => []);
          seqId = enr?.[0]?.sequence_id;
          if (seqId) {
            if (!seqCache.has(seqId)) {
              const row = await sbFetch(`kiko_sequences?id=eq.${seqId}&select=send_from_user_id,send_days,send_window_start,send_window_end,auto_timezone&limit=1`).catch(() => []);
              seqCache.set(seqId, row?.[0] || {});
            }
            seqConfig = seqCache.get(seqId);
          }

          // Resolve prospect timezone if auto_timezone is on
          let tzOffset = 0;
          if (seqConfig?.auto_timezone !== false && enr?.[0]?.contact_id) {
            try {
              const contact = await sbFetch(`contacts?id=eq.${enr[0].contact_id}&select=data&limit=1`).catch(() => []);
              const loc = contact?.[0]?.data?.location || '';
              tzOffset = getTimezoneOffset(loc);
            } catch {}
          }

          // Calculate prospect's local time
          const prospectHour = (now.getUTCHours() + tzOffset + 24) % 24;
          const prospectMinute = now.getUTCMinutes();
          const prospectTimeStr = `${String(Math.floor(prospectHour)).padStart(2, '0')}:${String(prospectMinute).padStart(2, '0')}`;

          // Check send_days
          if (seqConfig?.send_days?.length > 0 && !seqConfig.send_days.includes(currentDay)) {
            continue;
          }

          // Check send_window in prospect's local time
          const windowStart = seqConfig?.send_window_start || '09:00';
          const windowEnd = seqConfig?.send_window_end || '17:00';
          if (prospectTimeStr < windowStart || prospectTimeStr > windowEnd) {
            continue;
          }
        }
        // Resolve send-from user for this email's sequence (use cached seqConfig)
        let fromEmail = 'sunny@vanhawke.agency'; // fallback
        let token = null;
        let inlineImages = [];
        const sendFromUserId = seqConfig?.send_from_user_id;
        if (sendFromUserId) {
          try {
            const cfg = await sbFetch(`kiko_user_config?user_id=eq.${sendFromUserId}&select=email&limit=1`);
            if (cfg?.[0]?.email) fromEmail = cfg[0].email;
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

        // Track in kiko_email_tracking for follow-up detection
        try {
          await sbFetch('kiko_email_tracking', { method: 'POST', body: JSON.stringify({
            sender_email: fromEmail,
            recipient_email: email.to_email,
            recipient_name: email.to_name || '',
            company: email.company || '',
            subject: email.subject || '',
            gmail_message_id: result.id,
            gmail_thread_id: result.threadId,
            source: 'campaign',
            sent_at: now.toISOString(),
            follow_up_due: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            enrollment_id: email.enrollment_id,
          }) });
        } catch (trackErr) { console.error('[Sender] tracking insert failed:', trackErr.message); }

        // Update enrollment current_step
        if (email.enrollment_id) {
          const enrollment = await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}&limit=1`);
          if (enrollment?.[0]) {
            const seq = await sbFetch(`kiko_sequences?id=eq.${enrollment[0].sequence_id}&limit=1`);
            const steps = seq?.[0]?.steps || [];
            const nextStep = steps.find(s => s.step === enrollment[0].current_step + 1);
            
            // ── STEP ADVANCEMENT ENGINE (v2) ──
            // Handles both old model (condition branches with yes_steps/no_steps)
            // and new model (flat steps with condition field on LinkedIn steps)
            
            if (nextStep && nextStep.type === 'condition') {
              // ══ OLD MODEL: Condition branch with yes_steps/no_steps ══
              let conditionMet = false;
              
              if (nextStep.condition_type === 'connection_accepted') {
                const directMsg = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&action=eq.message&status=eq.sent&limit=1`);
                if (directMsg?.length > 0) { conditionMet = true; }
                else {
                  const accepted = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&action=eq.invite&result=eq.accepted&limit=1`);
                  if (accepted?.length > 0) { conditionMet = true; }
                  else {
                    const alreadyConn = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&result=eq.already_connected&limit=1`);
                    conditionMet = alreadyConn?.length > 0;
                  }
                }
              } else if (nextStep.condition_type === 'has_linkedin') { conditionMet = !!enrollment[0].linkedin_url; }
              else if (nextStep.condition_type === 'has_email') { conditionMet = !!enrollment[0].contact_email; }
              else if (nextStep.condition_type === 'no_reply') { conditionMet = enrollment[0].status !== 'replied'; }
              
              const branchSteps = conditionMet ? (nextStep.yes_steps || []) : (nextStep.no_steps || []);
              if (branchSteps.length > 0) {
                const branchStep = branchSteps[0];
                const queueTable = branchStep.channel === 'linkedin' ? 'kiko_linkedin_queue' : 'kiko_outreach_queue';
                await sbFetch(queueTable, { method: 'POST', body: JSON.stringify({
                  enrollment_id: email.enrollment_id, sequence_id: enrollment[0].sequence_id,
                  to_email: enrollment[0].contact_email, contact_name: enrollment[0].contact_name,
                  company: enrollment[0].company, channel: branchStep.channel || 'email',
                  action: branchStep.action || (branchStep.channel === 'linkedin' ? 'message' : 'send'),
                  step_number: nextStep.step, subject: branchStep.subject || '',
                  body_plain: branchStep.template || '', status: 'pending',
                  scheduled_for: new Date(now.getTime() + (branchStep.delay_days || 1) * 86400000).toISOString(),
                }) }).catch(() => {});
              }
              const afterCondition = steps.find(s => s.step === nextStep.step + 1);
              await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}`, { method: 'PATCH', body: JSON.stringify({
                current_step: nextStep.step + 1,
                next_send_at: afterCondition ? new Date(now.getTime() + (afterCondition.delay_days || 3) * 86400000).toISOString() : null,
                status: afterCondition ? 'active' : 'completed',
                completed_at: afterCondition ? null : now.toISOString(),
                condition_branch: conditionMet ? 'yes' : 'no',
              }) });
              
            } else if (nextStep && nextStep.channel === 'linkedin') {
              // ══ NEW MODEL: LinkedIn step (may be conditional) ══
              let shouldQueue = true;
              
              if (nextStep.condition === 'connection_accepted') {
                // Check if prospect is connected on LinkedIn
                const accepted = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&action=eq.invite&result=eq.accepted&limit=1`);
                const alreadyConn = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&result=eq.already_connected&limit=1`);
                const isConnected = (accepted?.length > 0) || (alreadyConn?.length > 0);
                
                if (!isConnected) {
                  // Not connected — SKIP this LinkedIn step, advance to next
                  shouldQueue = false;
                  console.log(`[seq-sender] Skipping LinkedIn step ${nextStep.step} — not connected (enrollment ${email.enrollment_id})`);
                }
              }
              
              if (shouldQueue) {
                // Queue LinkedIn action
                await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
                  enrollment_id: email.enrollment_id, sequence_id: enrollment[0].sequence_id,
                  contact_name: enrollment[0].contact_name, company: enrollment[0].company,
                  linkedin_url: enrollment[0].linkedin_url || '',
                  action: nextStep.action || 'message',
                  message: nextStep.template || '', step_number: nextStep.step,
                  status: 'queued',
                  scheduled_for: new Date(now.getTime() + (nextStep.delay_days || 1) * 86400000).toISOString(),
                }) }).catch(() => {});
              }
              
              // Advance past this LinkedIn step to the next one
              // (LinkedIn steps don't block email progression — find next email step)
              let advanceToStep = nextStep.step + 1;
              let advanceTarget = steps.find(s => s.step === advanceToStep);
              // If the next step is ALSO a conditional LinkedIn step, check and skip chain
              while (advanceTarget && advanceTarget.channel === 'linkedin' && advanceTarget.condition === 'connection_accepted') {
                // Check connection for this step too
                const acc = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&action=eq.invite&result=eq.accepted&limit=1`);
                const alrConn = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${email.enrollment_id}&result=eq.already_connected&limit=1`);
                if ((acc?.length > 0) || (alrConn?.length > 0)) {
                  await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
                    enrollment_id: email.enrollment_id, sequence_id: enrollment[0].sequence_id,
                    contact_name: enrollment[0].contact_name, company: enrollment[0].company,
                    linkedin_url: enrollment[0].linkedin_url || '',
                    action: advanceTarget.action || 'message', message: advanceTarget.template || '',
                    step_number: advanceTarget.step, status: 'queued',
                    scheduled_for: new Date(now.getTime() + (advanceTarget.delay_days || 1) * 86400000).toISOString(),
                  }) }).catch(() => {});
                }
                advanceToStep++;
                advanceTarget = steps.find(s => s.step === advanceToStep);
              }
              
              await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}`, { method: 'PATCH', body: JSON.stringify({
                current_step: advanceToStep,
                next_send_at: advanceTarget ? new Date(now.getTime() + (advanceTarget.delay_days || 3) * 86400000).toISOString() : null,
                status: advanceTarget ? 'active' : 'completed',
                completed_at: advanceTarget ? null : now.toISOString(),
              }) });
              
            } else {
              // ══ NORMAL: Regular email step advancement ══
              await sbFetch(`kiko_sequence_enrollments?id=eq.${email.enrollment_id}`, { method: 'PATCH', body: JSON.stringify({
                current_step: enrollment[0].current_step + 1,
                next_send_at: nextStep ? new Date(now.getTime() + (nextStep.delay_days || 3) * 86400000).toISOString() : null,
                status: nextStep ? 'active' : 'completed',
                completed_at: nextStep ? null : now.toISOString()
              }) });
            }
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
            body: `Kiko just sent ${sent} sequence ${sent === 1 ? 'email' : 'emails'} from your active campaigns. Daily total: ${dailyCount + sent}/${DAILY_LIMIT}.`,
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
