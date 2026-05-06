// api/cron-sequence-reply-detect.js — Reply & Bounce Detection
// Runs every 2 hours Mon-Fri. Checks Gmail for replies to sequenced emails.
// Stops sequence on reply. Flags bounces. Creates alerts.
// STANDALONE — if this fails, sequences just keep running (safe default).
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 30 };
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';


// === Out-of-Office Detection ===
function isOutOfOffice(snippet) {
  if (!snippet) return { isOOO: false };
  const lower = snippet.toLowerCase();
  const patterns = [
    'out of office', 'out of the office', 'on leave', 'on vacation', 'on holiday',
    'away from the office', 'away from my desk', 'currently out', 'currently away',
    'auto-reply', 'auto reply', 'automatic reply', 'autoreply', 'automated response',
    'will be back', 'will return', 'returning on', 'return to the office',
    'limited access to email', 'with limited access', 'no access to email',
    'i am out', 'i will be out', "i'm out", "i'm away", 'i am away',
    'please contact', 'in my absence', 'until further notice',
    'maternity leave', 'paternity leave', 'sabbatical',
  ];
  const isOOO = patterns.some(p => lower.includes(p));
  if (!isOOO) return { isOOO: false };
  // Try to extract return date
  let returnDate = null;
  const m = snippet.match(/(?:back|return|until|through)\s+(?:on\s+)?(\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*(?:\s+\d{2,4})?)/i);
  if (m) returnDate = m[1].trim();
  return { isOOO: true, returnDate };
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-sequence-reply-detect', 'started');
  try {
    const users = await getActiveUsers();
    // Build token cache: user_id → { token, email }
    const tokenCache = {};
    for (const u of users) {
      const t = await getGoogleToken(u.email);
      if (t) tokenCache[u.id] = { token: t, email: u.email };
    }
    if (Object.keys(tokenCache).length === 0) {
      await cronHeartbeat('cron-sequence-reply-detect', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: false, error: 'No Google tokens' });
    }
    // Default fallback token (first available)
    const fallbackUserId = Object.keys(tokenCache)[0];

    // Get active enrollments that have at least 1 sent email
    const enrollments = await sbFetch('kiko_sequence_enrollments?status=eq.active&current_step=gt.1&limit=30');
    const safe = Array.isArray(enrollments) ? enrollments : [];
    // Pre-fetch send_from_user_id for each sequence (cached)
    const seqSenderCache = {};
    let replies = 0, bounces = 0;

    for (const enrollment of safe) {
      try {
        const email = enrollment.contact_email;
        if (!email) continue;

        // Resolve which user's inbox to check for this enrollment
        let senderId = fallbackUserId;
        if (enrollment.sequence_id) {
          if (!seqSenderCache[enrollment.sequence_id]) {
            const seqRow = await sbFetch(`kiko_sequences?id=eq.${enrollment.sequence_id}&select=send_from_user_id&limit=1`);
            seqSenderCache[enrollment.sequence_id] = seqRow?.[0]?.send_from_user_id || null;
          }
          const seqSender = seqSenderCache[enrollment.sequence_id];
          if (seqSender && tokenCache[seqSender]) senderId = seqSender;
        }
        const { token, email: senderEmail } = tokenCache[senderId] || tokenCache[fallbackUserId];
        const tokenUserId = senderId;

        // Search for replies from this contact in the SENDER's inbox
        const q = `from:${email} newer_than:7d`;
        const searchRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=3`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (searchData.messages?.length) {
          // ═══ Backfill the outreach queue row with reply metadata for the Inbox UI ═══
          // Fetch the first matched message for thread ID + snippet
          let threadId = null, snippet = null, msgId = null;
          try {
            const firstMsg = searchData.messages[0];
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${firstMsg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const detail = await detailRes.json();
            threadId = detail.threadId;
            snippet = detail.snippet;
            const headers = (detail.payload?.headers || []).reduce((acc, h) => { acc[h.name.toLowerCase()] = h.value; return acc; }, {});
            msgId = headers['message-id'];
          } catch {}

          // Update the most recent sent queue row for this enrollment with the thread/snippet
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.sent&order=sent_at.desc&limit=1`, {
            method: 'PATCH',
            body: JSON.stringify({
              gmail_thread_id: threadId,
              gmail_message_id: msgId,
              reply_received_at: new Date().toISOString(),
              reply_snippet: snippet || '',
            }),
          }).catch(() => {});

          // Reply detected — stop the sequence
          // === Check if this is an out-of-office auto-reply ===
          const ooo = isOutOfOffice(snippet);
          if (ooo.isOOO) {
            console.log(`[reply-detect] OOO detected for ${enrollment.contact_name}: ${snippet?.slice(0, 100)}`);
            if (ooo.returnDate) {
              try {
                const returnMs = Date.parse(ooo.returnDate);
                if (!isNaN(returnMs) && returnMs > Date.now()) {
                  await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
                    next_send_at: new Date(returnMs + 24 * 60 * 60 * 1000).toISOString()
                  }) });
                }
              } catch {}
            }
            await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
              type: 'ooo_detected', severity: 'low',
              title: `OOO: ${enrollment.contact_name} (${enrollment.company})`,
              detail: `${enrollment.contact_name} is out of office. ${ooo.returnDate ? 'Returns: ' + ooo.returnDate + '.' : ''} Sequence continues. Snippet: ${(snippet || '').slice(0, 200)}`,
              entity_type: 'contact', entity_name: enrollment.contact_name || email,
              user_id: tokenUserId, created_at: new Date().toISOString()
            }) });
            oooCount++;
            continue;
          }

          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
            status: 'replied', reply_detected_at: new Date().toISOString()
          }) });
          // Cancel all queued emails for this enrollment
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });

          // Create alert — schema-correct (type=reply_from_prospect to match Command Centre + Sequences UI queries)
          const alertRes = await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
            type: 'reply_from_prospect',
            severity: 'high',
            title: `Reply: ${enrollment.contact_name || email}`,
            detail: `${enrollment.contact_name} at ${enrollment.company} replied to sequence step ${enrollment.current_step - 1}. Sequence auto-stopped. Snippet: ${(snippet || '').slice(0, 200)}`,
            entity_type: 'contact',
            entity_name: enrollment.contact_name || email,
            entity_id: enrollment.contact_id || null,
            user_id: tokenUserId,
            metadata: { gmail_id: msgId, thread_id: threadId, sequence_id: enrollment.sequence_id, enrollment_id: enrollment.id, source: 'sequence_reply_detect' },
            created_at: new Date().toISOString()
          }) });
          if (alertRes?.code) console.error('[reply-detect] Alert insert failed:', JSON.stringify(alertRes));
          // Attribution
          await sbFetch('kiko_deal_attribution', { method: 'POST', body: JSON.stringify({
            deal_company: enrollment.company, event_type: 'reply_received',
            event_detail: `Reply to automated sequence step ${enrollment.current_step - 1}`,
            source: 'sequence_engine', kiko_contributed: true, kiko_action: `Sequence email triggered reply`
          }) });
          // ═══ REPLY → PIPELINE BRIDGE: Create/update CRM deal ═══
          try {
            // Check if deal already exists for this company
            const existingDeals = await sbFetch(`deals?select=id,data&data->>company=ilike.*${encodeURIComponent(enrollment.company)}*&limit=1`);
            if (existingDeals?.length) {
              // Update existing deal to "Contact made" stage
              const deal = existingDeals[0];
              const updatedData = { ...deal.data, status: 'active', stage: 'Contact made', last_activity: `Reply received from ${enrollment.contact_name || email} via automated sequence`, updated_at: new Date().toISOString() };
              await sbFetch(`deals?id=eq.${deal.id}`, { method: 'PATCH', body: JSON.stringify({ data: updatedData }) });
            } else {
              // Create new deal
              await sbFetch('deals', { method: 'POST', body: JSON.stringify({
                org_id: ORG_ID,
                data: { company: enrollment.company, contact: enrollment.contact_name || email, status: 'active', stage: 'Contact made', value: null, source: 'Kiko Sequence Engine', notes: `Auto-created: ${enrollment.contact_name} replied to outreach sequence step ${enrollment.current_step - 1}`, created_at: new Date().toISOString() }
              }) });
            }
          } catch (dealErr) { console.error(`[ReplyDetect] Deal bridge error for ${enrollment.company}:`, dealErr.message); }
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

    // ── LinkedIn reply scan ──
    // GUARDED v0.0.70: LinkedIn voyager from Vercel is CONFIRMED IMPOSSIBLE — Cloudflare/LinkedIn
    // bot detection kills sessions within seconds (see KIKO_MASTER_LOG 14 Apr 2026).
    // Block is parked behind LINKEDIN_BACKEND_ENABLED env var. When a working LinkedIn backend
    // is selected (Unipile / HeyReach / proxy / etc), set LINKEDIN_BACKEND_ENABLED=true in Vercel
    // env vars to re-enable. Until then this entire block is skipped — Gmail scan above still runs.
    if (process.env.LINKEDIN_BACKEND_ENABLED !== 'true') {
      // explicit no-op — do not call linkedinGetConversations from Vercel
    } else try {
      const { linkedinGetConversations } = await import('./linkedin-client.js');
      const conversations = await linkedinGetConversations({ limit: 30 });
      for (const conv of (conversations || [])) {
        if (!conv.unreadCount || conv.unreadCount <= 0) continue;
        for (const pid of (conv.participants || [])) {
          const url = `https://www.linkedin.com/in/${pid}/`;
          const matching = await sbFetch(`kiko_sequence_enrollments?status=eq.active&linkedin_url=eq.${encodeURIComponent(url)}&select=id,company,contact_name,contact_email&limit=1`);
          if (!matching?.length) continue;
          const enrollment = matching[0];
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'replied', reply_detected_at: new Date().toISOString() }) });
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
          await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${enrollment.id}&status=eq.pending`, { method: 'PATCH', body: JSON.stringify({ status: 'skipped', actioned_at: new Date().toISOString() }) });
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({ type: 'reply_from_prospect', severity: 'high', title: `LinkedIn reply: ${enrollment.contact_name}`, detail: `${enrollment.contact_name} at ${enrollment.company} replied via LinkedIn. Sequence auto-stopped.`, entity_type: 'contact', entity_name: enrollment.contact_name, user_id: tokenUserId, metadata: { source: 'linkedin_reply_detect', conversation_urn: conv.conversationUrn }, created_at: new Date().toISOString() }) });
          replies++;
        }
      }
    } catch (linkedinErr) {
      console.error('[ReplyDetect] LinkedIn scan failed:', linkedinErr.message);
    }

    await cronHeartbeat('cron-sequence-reply-detect', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: replies + bounces });
    return res.status(200).json({ ok: true, checked: safe.length, replies, bounces });
  } catch (err) {
    console.error('[ReplyDetect] Fatal:', err.message);
    await cronHeartbeat('cron-sequence-reply-detect', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
