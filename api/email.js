// api/email.js — Full email operations via Gmail API + Supabase cache
// Routes determined by req.body.action or req.method + req.query

import { createClient } from '@supabase/supabase-js';
import { getGoogleToken } from './google-token.js';
import { parseGmailMessage, buildMimeMessage } from './email-helpers.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const email = req.query?.email || req.body?.email;
  if (!email) return res.status(400).json({ error: 'email (user_email) required' });

  let token;
  try {
    token = await getGoogleToken(email);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const action = req.body?.action || req.query?.action;

  // Get org_id for this user (required for email inserts)
  const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'; // Van Hawke — multi-tenant lookup added later
  const orgId = ORG_ID;

  try {
    // LIST emails from Supabase cache
    if (req.method === 'GET' && !action) {
      const folder = req.query?.folder || 'INBOX';
      const page = parseInt(req.query?.page || '1');
      const limit = 50;
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('emails')
        .select('id, gmail_id, thread_id, from_address, to_addresses, subject, snippet, labels, is_read, is_starred, date, has_attachments, kiko_summary, kiko_category, kiko_action', { count: 'exact' })
        .eq('user_email', email)
        .contains('labels', [folder])
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });

      // Count unread
      const { count: unreadCount } = await supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('user_email', email)
        .contains('labels', ['INBOX'])
        .eq('is_read', false);

      return res.status(200).json({ emails: data || [], total: count || 0, unread: unreadCount || 0, page });
    }

    // GET single email
    if (action === 'get') {
      const emailId = req.query?.id || req.body?.id;
      const { data } = await supabase
        .from('emails')
        .select('*')
        .eq('user_email', email)
        .eq('gmail_id', emailId)
        .single();
      return res.status(200).json(data || {});
    }

    // LABELS — fetch all Gmail labels
    if (action === 'labels') {
      const labelsRes = await fetch(`${GMAIL_BASE}/labels`, { headers });
      const labelsData = await labelsRes.json();
      const labels = (labelsData.labels || []).filter(l => l.type === 'user' && l.labelListVisibility !== 'labelHide')
        .map(l => ({ id: l.id, name: l.name }));
      return res.status(200).json({ labels });
    }

    // ATTACHMENT — download a specific attachment
    if (action === 'attachment') {
      const messageId = req.query?.messageId || req.body?.messageId;
      const attachmentId = req.query?.attachmentId || req.body?.attachmentId;
      const filename = req.query?.filename || req.body?.filename || 'attachment';
      if (!messageId || !attachmentId) return res.status(400).json({ error: 'messageId and attachmentId required' });

      const attRes = await fetch(`${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`, { headers });
      if (!attRes.ok) return res.status(attRes.status).json({ error: 'Attachment fetch failed' });
      const attData = await attRes.json();
      const data = attData.data.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(data, 'base64');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).end(buffer);
    }

    // SYNC — fetch from Gmail and cache
    if (action === 'sync') {
      return await syncEmails(email, token, orgId, res);
    }

    // SEND email
    if (action === 'send') {
      const { to, cc, bcc, subject, body_html, in_reply_to, thread_id, attachments } = req.body;
      if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

      const raw = buildMimeMessage({ to, cc, bcc, subject, body_html, in_reply_to, attachments });
      const sendBody = { raw };
      if (thread_id) sendBody.threadId = thread_id;

      const gmailRes = await fetch(`${GMAIL_BASE}/messages/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody),
      });
      const result = await gmailRes.json();
      if (!gmailRes.ok) return res.status(gmailRes.status).json(result);
      return res.status(200).json({ ok: true, messageId: result.id });
    }

    // REPLY
    if (action === 'reply' || action === 'reply-all') {
      const { id, body_html } = req.body;
      // Fetch original email
      const { data: original } = await supabase
        .from('emails')
        .select('*')
        .eq('user_email', email)
        .eq('gmail_id', id)
        .single();

      if (!original) return res.status(404).json({ error: 'Original email not found' });

      const to = action === 'reply-all'
        ? [original.from_address, ...(original.to_addresses || [])].filter(a => a !== email).join(', ')
        : original.from_address;
      const subject = original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;

      const raw = buildMimeMessage({
        to,
        subject,
        body_html,
        in_reply_to: original.gmail_id,
      });

      const gmailRes = await fetch(`${GMAIL_BASE}/messages/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw, threadId: original.thread_id }),
      });
      const result = await gmailRes.json();
      if (!gmailRes.ok) return res.status(gmailRes.status).json(result);
      return res.status(200).json({ ok: true, messageId: result.id });
    }

    // MARK READ/UNREAD
    if (action === 'read') {
      const { id, is_read } = req.body;
      const addLabels = is_read ? [] : ['UNREAD'];
      const removeLabels = is_read ? ['UNREAD'] : [];

      await fetch(`${GMAIL_BASE}/messages/${id}/modify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ addLabelIds: addLabels, removeLabelIds: removeLabels }),
      });

      await supabase.from('emails').update({ is_read }).eq('user_email', email).eq('gmail_id', id);
      return res.status(200).json({ ok: true });
    }

    // STAR/UNSTAR
    if (action === 'star') {
      const { id, is_starred } = req.body;
      const addLabels = is_starred ? ['STARRED'] : [];
      const removeLabels = is_starred ? [] : ['STARRED'];

      await fetch(`${GMAIL_BASE}/messages/${id}/modify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ addLabelIds: addLabels, removeLabelIds: removeLabels }),
      });

      await supabase.from('emails').update({ is_starred }).eq('user_email', email).eq('gmail_id', id);
      return res.status(200).json({ ok: true });
    }

    // MOVE / LABEL
    if (action === 'labels') {
      const { id, add, remove } = req.body;
      await fetch(`${GMAIL_BASE}/messages/${id}/modify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ addLabelIds: add || [], removeLabelIds: remove || [] }),
      });
      // Re-fetch labels
      const msgRes = await fetch(`${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=Labels`, { headers });
      const msgData = await msgRes.json();
      await supabase.from('emails').update({ labels: msgData.labelIds || [] }).eq('user_email', email).eq('gmail_id', id);
      return res.status(200).json({ ok: true });
    }

    // TRASH
    if (action === 'trash') {
      const { id } = req.body;
      await fetch(`${GMAIL_BASE}/messages/${id}/trash`, { method: 'POST', headers });
      await supabase.from('emails').update({ labels: ['TRASH'] }).eq('user_email', email).eq('gmail_id', id);
      return res.status(200).json({ ok: true });
    }

    // THREAD-CACHED — read thread from Supabase cache (instant)
    if (action === 'thread-cached') {
      const threadId = req.query?.threadId || req.body?.threadId;
      if (!threadId) return res.status(400).json({ error: 'threadId required' });
      const { data } = await supabase
        .from('emails')
        .select('*')
        .eq('user_email', email)
        .eq('thread_id', threadId)
        .order('date', { ascending: true });
      return res.status(200).json({ threadId, messages: data || [] });
    }

    // THREAD — fetch full thread from Gmail API (real-time, not cached)
    if (action === 'thread') {
      const threadId = req.query?.threadId || req.body?.threadId;
      if (!threadId) return res.status(400).json({ error: 'threadId required' });

      const threadRes = await fetch(`${GMAIL_BASE}/threads/${threadId}?format=full`, { headers });
      if (!threadRes.ok) {
        const err = await threadRes.text();
        return res.status(threadRes.status).json({ error: err });
      }
      const thread = await threadRes.json();
      const messages = (thread.messages || []).map(msg => {
        const parsed = parseGmailMessage(msg);
        return parsed;
      });
      // Cache to Supabase (fire-and-forget)
      for (const m of messages) {
        supabase.from('emails').upsert({ ...m, user_email: email, org_id: orgId }, { onConflict: 'user_email,gmail_id' }).then(() => {});
      }
      return res.status(200).json({ threadId: thread.id, messages });
    }

    // LIST-LIVE — fetch inbox directly from Gmail API (real-time)
    if (action === 'list-live') {
      const label = req.query?.label || req.body?.label || 'INBOX';
      const maxResults = parseInt(req.query?.maxResults || req.body?.maxResults || '50');
      const pageToken = req.query?.pageToken || req.body?.pageToken || '';
      const q = req.query?.q || req.body?.q || '';

      let url = `${GMAIL_BASE}/messages?maxResults=${maxResults}&labelIds=${label}`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      if (q) url += `&q=${encodeURIComponent(q)}`;

      const listRes = await fetch(url, { headers });
      const listData = await listRes.json();
      if (!listRes.ok) return res.status(listRes.status).json(listData);

      const messageIds = (listData.messages || []).map(m => m.id);
      if (messageIds.length === 0) {
        return res.status(200).json({ emails: [], nextPageToken: null, resultSizeEstimate: 0 });
      }

      // Fetch metadata for each message (minimal format for speed)
      const emails = [];
      for (const msgId of messageIds) {
        try {
          const msgRes = await fetch(`${GMAIL_BASE}/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`, { headers });
          const msg = await msgRes.json();
          const msgHeaders = msg.payload?.headers || [];
          const getH = (n) => msgHeaders.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
          emails.push({
            gmail_id: msg.id,
            thread_id: msg.threadId,
            from_address: getH('From'),
            to_addresses: getH('To'),
            subject: getH('Subject'),
            snippet: msg.snippet || '',
            labels: msg.labelIds || [],
            is_read: !(msg.labelIds || []).includes('UNREAD'),
            is_starred: (msg.labelIds || []).includes('STARRED'),
            date: getH('Date') ? new Date(getH('Date')).toISOString() : null,
          });
        } catch {}
      }

      return res.status(200).json({
        emails,
        nextPageToken: listData.nextPageToken || null,
        resultSizeEstimate: listData.resultSizeEstimate || emails.length,
      });
    }

    // SEARCH via Gmail API
    if (action === 'search') {
      const q = req.query?.q || req.body?.q;
      if (!q) return res.status(400).json({ error: 'q (query) required' });

      const searchRes = await fetch(`${GMAIL_BASE}/messages?q=${encodeURIComponent(q)}&maxResults=20`, { headers });
      const searchData = await searchRes.json();
      const messageIds = (searchData.messages || []).map(m => m.id);

      if (messageIds.length === 0) return res.status(200).json({ emails: [] });

      // Fetch from cache first, then Gmail for missing
      const { data: cached } = await supabase
        .from('emails')
        .select('*')
        .eq('user_email', email)
        .in('gmail_id', messageIds);

      return res.status(200).json({ emails: cached || [] });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[Email] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// --- Sync emails from Gmail ---
async function syncEmails(userEmail, token, orgId, res) {
  const headers = { Authorization: `Bearer ${token}` };

  // Check sync state
  const { data: syncState } = await supabase
    .from('email_sync_state')
    .select('*')
    .eq('user_email', userEmail)
    .single();

  let messageIds = [];

  if (syncState?.full_sync_done && syncState?.history_id) {
    // Incremental sync via history
    console.log('[EmailSync] Incremental sync from historyId:', syncState.history_id);
    try {
      const histRes = await fetch(
        `${GMAIL_BASE}/history?startHistoryId=${syncState.history_id}&historyTypes=messageAdded&historyTypes=messageDeleted&historyTypes=labelAdded&historyTypes=labelRemoved`,
        { headers }
      );
      const histData = await histRes.json();

      if (histData.history) {
        for (const h of histData.history) {
          if (h.messagesAdded) messageIds.push(...h.messagesAdded.map(m => m.message.id));
        }
      }

      // Update history ID
      if (histData.historyId) {
        await supabase.from('email_sync_state').update({
          history_id: histData.historyId,
          last_synced_at: new Date().toISOString(),
        }).eq('user_email', userEmail);
      }
    } catch (err) {
      console.error('[EmailSync] History sync error:', err.message);
    }
  } else {
    // Full sync — fetch last 200 message IDs
    console.log('[EmailSync] Full sync');
    const listRes = await fetch(`${GMAIL_BASE}/messages?maxResults=500`, { headers });
    const listData = await listRes.json();
    messageIds = (listData.messages || []).map(m => m.id);
  }

  if (messageIds.length === 0) {
    return res.status(200).json({ synced: 0, message: 'Already up to date' });
  }

  // Filter out already-cached messages to avoid re-fetching
  const { data: existingIds } = await supabase
    .from('emails')
    .select('gmail_id')
    .eq('user_email', userEmail)
    .in('gmail_id', messageIds.slice(0, 500));
  const cachedSet = new Set((existingIds || []).map(e => e.gmail_id));
  const uncached = messageIds.filter(id => !cachedSet.has(id));

  if (uncached.length === 0) {
    // All messages already cached, just update sync state
    await supabase.from('email_sync_state').upsert({
      user_email: userEmail, last_synced_at: new Date().toISOString(), full_sync_done: true,
    }, { onConflict: 'user_email' });
    return res.status(200).json({ synced: 0, message: 'All cached', total: messageIds.length, cached: cachedSet.size });
  }

  const batchSize = 100;
  const toFetch = uncached.slice(0, batchSize);
  let synced = 0;
  let latestHistoryId = null;
  const syncStart = Date.now();

  for (const msgId of toFetch) {
    if (Date.now() - syncStart > 50000) break; // Stop before Vercel 60s timeout
    try {
      const msgRes = await fetch(`${GMAIL_BASE}/messages/${msgId}?format=full`, { headers });
      const msg = await msgRes.json();

      if (!msg.id) continue;
      if (msg.historyId) latestHistoryId = msg.historyId;

      const parsed = parseGmailMessage(msg);
      parsed.user_email = userEmail;
      parsed.org_id = orgId;

      const { error: upsertErr } = await supabase.from('emails').upsert(parsed, { onConflict: 'user_email,gmail_id' });
      if (upsertErr) console.error('[EmailSync] Upsert error:', msgId, upsertErr.message, upsertErr.details);
      else synced++;
    } catch (err) {
      console.error('[EmailSync] Message fetch error:', msgId, err.message);
    }
  }

  // Update sync state — only mark full_sync_done when all messages are cached
  const allCached = synced >= uncached.length
  await supabase.from('email_sync_state').upsert({
    user_email: userEmail,
    history_id: latestHistoryId || syncState?.history_id,
    last_synced_at: new Date().toISOString(),
    full_sync_done: allCached,
  }, { onConflict: 'user_email' });

  return res.status(200).json({ synced, total: messageIds.length, remaining: uncached.length - synced });
}
