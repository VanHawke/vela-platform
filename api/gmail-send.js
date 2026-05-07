// api/gmail-send.js — Send email directly via Gmail API (not draft)
import { getGoogleToken } from './cron-utils.js';
import { sbFetch } from './kiko-tools.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { to, subject, body, sender = 'sunny', cc, thread_id } = req.body || {};
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

  try {
    // Determine sender — accept full email or shorthand
    const senderRaw = (sender || 'sunny').toLowerCase()
    const isMatt = senderRaw.includes('matt')
    // Token lookup uses .com (how Google tokens are stored in user_tokens)
    const tokenEmail = isMatt ? 'matt.smith@vanhawke.com' : 'sunny@vanhawke.com'
    // From header uses .agency (the business email)
    const fromEmail = isMatt ? 'matt.smith@vanhawke.agency' : 'sunny@vanhawke.agency'
    
    const token = await getGoogleToken(tokenEmail);
    if (!token) return res.status(401).json({ error: `No Gmail token for ${tokenEmail}` });

    // Load signature
    const cfgRes = await sbFetch(`kiko_user_config?select=email_signature_html&limit=1`);
    const signature = cfgRes?.[0]?.email_signature_html || '';

    // Build MIME message
    const fullBody = body + (signature ? `\n\n${signature}` : '');
    const headers = [
      `To: ${to}`,
      `From: ${fromEmail}`,
      `Subject: ${subject || '(no subject)'}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    
    const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + fullBody.replace(/\n/g, '<br>'))
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sendBody = { raw };
    if (thread_id) sendBody.threadId = thread_id;

    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sendBody),
    });
    const result = await gmailRes.json();

    if (!gmailRes.ok) return res.status(500).json({ error: result.error?.message || 'Gmail send failed' });

    // Track the send
    await sbFetch('kiko_email_tracking', { method: 'POST', body: JSON.stringify({
      sender_email: fromEmail,
      recipient_email: to,
      subject: subject || '',
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId,
      source: 'direct_send',
      sent_at: new Date().toISOString(),
      follow_up_due: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }) }).catch(() => {});

    return res.status(200).json({ success: true, messageId: result.id, threadId: result.threadId });
  } catch (e) {
    console.error('[gmail-send] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
