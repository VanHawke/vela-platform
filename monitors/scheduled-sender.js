// monitors/scheduled-sender.js — Sends emails at their scheduled time
// Runs every 5 minutes, checks for emails due to send, sends via Gmail API

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

async function getToken(email) {
  const rows = await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(email)}&provider=eq.google&select=refresh_token&limit=1`);
  if (!Array.isArray(rows) || !rows[0]?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  return data.access_token || null;
}

const SEND_AS_ALIAS = {
  'sunny@vanhawke.com': 'sunny@vanhawke.agency',
  'matt.smith@vanhawke.com': 'matt.smith@vanhawke.agency',
};

async function getGmailSignature(token, email) {
  const alias = SEND_AS_ALIAS[email] || email;
  try {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(alias)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { signature: data.signature || '', sendAs: alias };
  } catch { return { signature: '', sendAs: alias }; }
}

export async function runScheduledSender() {
  console.log('[scheduled-sender] Checking for emails to send...');
  try {
    const now = new Date().toISOString();
    const due = await sbFetch(`kiko_scheduled_emails?status=eq.scheduled&scheduled_for=lte.${now}&select=*&order=scheduled_for.asc&limit=5`);
    if (!Array.isArray(due) || !due.length) { console.log('[scheduled-sender] No emails due'); return; }

    let sent = 0, failed = 0;

    for (const email of due) {
      try {
        const token = await getToken(email.sender_email);
        if (!token) throw new Error(`Token refresh failed for ${email.sender_email}`);

        // Get signature
        const { signature, sendAs } = await getGmailSignature(token, email.sender_email);

        // Build RFC 2822 message
        const bodyHtml = email.body.replace(/\n/g, '<br/>');
        const emailContent = signature ? `${bodyHtml}<br/><br/>${signature}` : bodyHtml;
        const encodedSubject = `=?UTF-8?B?${Buffer.from(email.subject).toString('base64')}?=`;

        const raw = [
          `From: ${sendAs}`,
          `To: ${email.recipient_email}`,
          `Subject: ${encodedSubject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=utf-8',
          'Content-Transfer-Encoding: base64',
        ].join('\r\n') + '\r\n\r\n' + Buffer.from(emailContent, 'utf-8').toString('base64');

        // Send via Gmail API (messages.send, NOT drafts.create)
        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
        });
        const sendData = await sendRes.json();

        if (sendData.id) {
          await sbFetch(`kiko_scheduled_emails?id=eq.${email.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString(), gmail_message_id: sendData.id, updated_at: new Date().toISOString() }),
          });
          // Auto-track for follow-up
          sbFetch('kiko_follow_ups', {
            method: 'POST',
            body: JSON.stringify({ sender_email: email.sender_email, recipient_email: email.recipient_email, recipient_name: email.recipient_name, subject: email.subject, sent_at: new Date().toISOString(), follow_up_after_days: 5 }),
          }).catch(() => {});
          console.log(`[scheduled-sender] SENT: "${email.subject}" → ${email.recipient_email} from ${email.sender_email}`);
          sent++;
        } else {
          throw new Error(sendData.error?.message || 'Gmail send failed');
        }
      } catch (err) {
        await sbFetch(`kiko_scheduled_emails?id=eq.${email.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', error: err.message, updated_at: new Date().toISOString() }),
        });
        console.error(`[scheduled-sender] FAILED: "${email.subject}" — ${err.message}`);
        failed++;
      }
    }

    console.log(`[scheduled-sender] Complete. ${sent} sent, ${failed} failed.`);
  } catch (err) { console.error('[scheduled-sender] Error:', err.message); }
}
