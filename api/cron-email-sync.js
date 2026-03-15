// api/cron-email-sync.js — Runs every 5 minutes to sync Gmail for all connected users
// Inlines sync logic directly — no internal HTTP calls that break on Vercel

import { createClient } from '@supabase/supabase-js';
import { getGoogleToken } from './google-token.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
  const results = [];

  const { data: tokens } = await supabase
    .from('user_tokens').select('user_email').eq('provider', 'google');

  for (const t of (tokens || [])) {
    try {
      const token = await getGoogleToken(t.user_email);
      const headers = { Authorization: `Bearer ${token}` };

      // Get org_id for RLS
      const { data: orgRow } = await supabase.from('emails').select('org_id').eq('user_email', t.user_email).limit(1).single();
      const orgId = orgRow?.org_id || '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

      // Check sync state
      const { data: syncState } = await supabase
        .from('email_sync_state').select('*').eq('user_email', t.user_email).single();

      let messageIds = [];
      if (syncState?.full_sync_done && syncState?.history_id) {
        // Incremental sync
        const histRes = await fetch(
          `${GMAIL_BASE}/history?startHistoryId=${syncState.history_id}&historyTypes=messageAdded`, { headers });
        const histData = await histRes.json();
        if (histData.history) {
          for (const h of histData.history) {
            if (h.messagesAdded) messageIds.push(...h.messagesAdded.map(m => m.message.id));
          }
        }
        if (histData.historyId) {
          await supabase.from('email_sync_state').update({
            history_id: histData.historyId, last_synced_at: new Date().toISOString(),
          }).eq('user_email', t.user_email);
        }
      } else {
        // Full sync — last 100
        const listRes = await fetch(`${GMAIL_BASE}/messages?maxResults=100`, { headers });
        const listData = await listRes.json();
        messageIds = (listData.messages || []).map(m => m.id);
      }

      let synced = 0, latestHistoryId = null;
      for (const msgId of messageIds.slice(0, 30)) {
        try {
          const msgRes = await fetch(`${GMAIL_BASE}/messages/${msgId}?format=full`, { headers });
          const msg = await msgRes.json();
          if (!msg.id) continue;
          if (msg.historyId) latestHistoryId = msg.historyId;
          const mh = msg.payload?.headers || [];
          const getH = (n) => mh.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
          let bodyHtml = '', bodyText = '';
          function extractBody(part) {
            if (!part) return;
            if (part.mimeType === 'text/html' && part.body?.data) {
              bodyHtml = Buffer.from(part.body.data.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/plain' && part.body?.data) {
              bodyText = Buffer.from(part.body.data.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8');
            }
            if (part.parts) part.parts.forEach(extractBody);
          }
          extractBody(msg.payload);
          const from = getH('From'), to = getH('To').split(',').map(s => s.trim()).filter(Boolean);
          const cc = getH('Cc').split(',').map(s => s.trim()).filter(Boolean);
          const date = getH('Date');
          await supabase.from('emails').upsert({
            gmail_id: msg.id, thread_id: msg.threadId, user_email: t.user_email, org_id: orgId,
            from_address: from, to_addresses: to, cc_addresses: cc.length ? cc : null,
            subject: getH('Subject'), snippet: msg.snippet || '',
            body_html: bodyHtml, body_text: bodyText,
            labels: msg.labelIds || [],
            is_read: !(msg.labelIds || []).includes('UNREAD'),
            is_starred: (msg.labelIds || []).includes('STARRED'),
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            has_attachments: JSON.stringify(msg.payload).includes('"filename"'),
          }, { onConflict: 'user_email,gmail_id' });
          synced++;
        } catch {}
      }

      await supabase.from('email_sync_state').upsert({
        user_email: t.user_email,
        history_id: latestHistoryId || syncState?.history_id,
        last_synced_at: new Date().toISOString(),
        full_sync_done: true,
      }, { onConflict: 'user_email' });

      results.push({ email: t.user_email, synced, total: messageIds.length });
    } catch (e) {
      results.push({ email: t.user_email, error: e.message });
    }
  }

  return res.json({ status: 'complete', timestamp: new Date().toISOString(), users: results.length, results });
}
