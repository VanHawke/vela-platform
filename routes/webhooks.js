// routes/webhooks.js — Webhook receiver framework
// Gmail push notifications via Google Pub/Sub + future integrations
import { Router } from 'express';
import 'dotenv/config';

const router = Router();
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
}

router.post('/gmail', async (req, res) => {
  try {
    const message = req.body?.message;
    if (!message?.data) return res.status(200).send('OK');
    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
    const { emailAddress, historyId } = decoded;
    console.log(`[webhook/gmail] Notification for ${emailAddress}, historyId: ${historyId}`);

    const rows = await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(emailAddress)}&provider=eq.google&select=refresh_token&limit=1`);
    if (!Array.isArray(rows) || !rows[0]?.refresh_token) return res.status(200).send('OK');
    const tRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
    });
    const tData = await tRes.json();
    if (!tData.access_token) return res.status(200).send('OK');
    const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
    const msgList = await fetch(`${GMAIL}/messages?q=is:inbox newer_than:5m&maxResults=3`, { headers: { Authorization: `Bearer ${tData.access_token}` } }).then(r => r.json());
    if (!msgList.messages?.length) return res.status(200).send('OK');
    const contacts = await sbFetch('contacts?select=id,data&limit=500');
    const contactMap = {};
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        const email = c.data?.email?.toLowerCase();
        if (email) contactMap[email] = { name: `${c.data.firstName || ''} ${c.data.lastName || ''}`.trim(), company: c.data.company, id: c.id };
      }
    }
    for (const msg of msgList.messages) {
      const detail = await fetch(`${GMAIL}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${tData.access_token}` } }).then(r => r.json());
      const hdrs = detail.payload?.headers || [];
      const from = hdrs.find(h => h.name === 'From')?.value || '';
      const subject = hdrs.find(h => h.name === 'Subject')?.value || '';
      const emailMatch = from.match(/<([^>]+)>/);
      const senderEmail = (emailMatch ? emailMatch[1] : from).toLowerCase().trim();
      const senderName = from.split('<')[0].trim().replace(/"/g, '');
      const contact = contactMap[senderEmail];
      if (contact) {
        const existing = await sbFetch(`kiko_alerts?type=eq.email_reply&entity_id=eq.${encodeURIComponent(contact.id)}&dismissed=eq.false&select=id&limit=1`);
        if (Array.isArray(existing) && existing.length > 0) continue;
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({ id: crypto.randomUUID(), type: 'email_reply', severity: 'medium',
            title: `Reply from ${contact.name || senderName}${contact.company ? ` (${contact.company})` : ''}`,
            detail: `Subject: ${subject}. Received in ${emailAddress.split('@')[0]}'s inbox.`,
            entity_type: 'contact', entity_id: contact.id, entity_name: contact.name || senderName,
            metadata: { from: senderEmail, subject, inbox: emailAddress.split('@')[0], message_id: msg.id, source: 'webhook' },
            user_id: null, dismissed: false, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          }),
        });
        console.log(`[webhook/gmail] Alert: Reply from ${contact.name} (${contact.company})`);
      }
    }
    res.status(200).send('OK');
  } catch (err) { console.error('[webhook/gmail]', err.message); res.status(200).send('OK'); }
});

router.get('/status', (req, res) => res.json({ ok: true, webhooks: ['gmail'], timestamp: new Date().toISOString() }));

export default router;
