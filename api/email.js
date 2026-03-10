// api/email.js — Full email operations via Gmail API + Supabase cache
// Routes determined by req.body.action or req.method + req.query

import { createClient } from '@supabase/supabase-js';
import { getGoogleToken } from './google-token.js';

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

    // SYNC — fetch from Gmail and cache
    if (action === 'sync') {
      return await syncEmails(email, token, res);
    }

    // SEND email
    if (action === 'send') {
      const { to, cc, bcc, subject, body_html, in_reply_to, thread_id } = req.body;
      if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

      const raw = buildMimeMessage({ to, cc, bcc, subject, body_html, in_reply_to });
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
async function syncEmails(userEmail, token, res) {
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
    const listRes = await fetch(`${GMAIL_BASE}/messages?maxResults=200`, { headers });
    const listData = await listRes.json();
    messageIds = (listData.messages || []).map(m => m.id);
  }

  if (messageIds.length === 0) {
    return res.status(200).json({ synced: 0, message: 'Already up to date' });
  }

  // Batch fetch message details (max 50 at a time to stay within timeout)
  const batchSize = 50;
  const toFetch = messageIds.slice(0, batchSize);
  let synced = 0;
  let latestHistoryId = null;

  for (const msgId of toFetch) {
    try {
      const msgRes = await fetch(`${GMAIL_BASE}/messages/${msgId}?format=full`, { headers });
      const msg = await msgRes.json();

      if (!msg.id) continue;
      if (msg.historyId) latestHistoryId = msg.historyId;

      const parsed = parseGmailMessage(msg);
      parsed.user_email = userEmail;

      await supabase.from('emails').upsert(parsed, { onConflict: 'user_email,gmail_id' });
      synced++;
    } catch (err) {
      console.error('[EmailSync] Message fetch error:', msgId, err.message);
    }
  }

  // Update sync state
  await supabase.from('email_sync_state').upsert({
    user_email: userEmail,
    history_id: latestHistoryId || syncState?.history_id,
    last_synced_at: new Date().toISOString(),
    full_sync_done: true,
  }, { onConflict: 'user_email' });

  return res.status(200).json({ synced, total: messageIds.length });
}

// --- Parse Gmail message into our schema ---
function parseGmailMessage(msg) {
  const headers = msg.payload?.headers || [];
  const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const from = getHeader('From');
  const to = getHeader('To').split(',').map(s => s.trim()).filter(Boolean);
  const cc = getHeader('Cc').split(',').map(s => s.trim()).filter(Boolean);
  const subject = getHeader('Subject');
  const date = getHeader('Date');

  // Extract body
  let bodyHtml = '';
  let bodyText = '';
  extractBody(msg.payload, (html, text) => { bodyHtml = html; bodyText = text; });

  return {
    gmail_id: msg.id,
    thread_id: msg.threadId,
    from_address: from,
    to_addresses: to,
    cc_addresses: cc.length > 0 ? cc : null,
    subject,
    snippet: msg.snippet || '',
    body_html: bodyHtml,
    body_text: bodyText,
    labels: msg.labelIds || [],
    is_read: !(msg.labelIds || []).includes('UNREAD'),
    is_starred: (msg.labelIds || []).includes('STARRED'),
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    has_attachments: hasAttachments(msg.payload),
  };
}

function extractBody(part, cb) {
  if (!part) return;
  if (part.mimeType === 'text/html' && part.body?.data) {
    cb(base64UrlDecode(part.body.data), '');
    return;
  }
  if (part.mimeType === 'text/plain' && part.body?.data) {
    cb('', base64UrlDecode(part.body.data));
    return;
  }
  if (part.parts) {
    let html = '', text = '';
    for (const p of part.parts) {
      extractBody(p, (h, t) => { if (h) html = h; if (t) text = t; });
    }
    cb(html, text);
  }
}

function hasAttachments(part) {
  if (!part) return false;
  if (part.filename && part.filename.length > 0) return true;
  if (part.parts) return part.parts.some(p => hasAttachments(p));
  return false;
}

function base64UrlDecode(data) {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function buildMimeMessage({ to, cc, bcc, subject, body_html, in_reply_to }) {
  const boundary = `boundary_${Date.now()}`;
  let mime = '';
  mime += `To: ${to}\r\n`;
  if (cc) mime += `Cc: ${cc}\r\n`;
  if (bcc) mime += `Bcc: ${bcc}\r\n`;
  mime += `Subject: ${subject}\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  if (in_reply_to) {
    mime += `In-Reply-To: <${in_reply_to}>\r\n`;
    mime += `References: <${in_reply_to}>\r\n`;
  }
  mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
  // Plain text fallback
  const plainText = (body_html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  mime += `--${boundary}\r\n`;
  mime += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
  mime += `${plainText}\r\n`;
  // HTML
  mime += `--${boundary}\r\n`;
  mime += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
  mime += `${body_html || ''}\r\n`;
  mime += `--${boundary}--`;

  return Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
