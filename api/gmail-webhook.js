// api/gmail-webhook.js — Receives Gmail push notifications via Google Cloud Pub/Sub
// When a new email arrives or is sent, Google pushes a notification here instantly
// instead of waiting for the 15-minute polling cron.

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
  if (!rows?.[0]?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
  });
  return (await res.json()).access_token || null;
}

// Gmail users to watch for push notifications
const WATCHED_EMAILS = ['sunny@vanhawke.com', 'matt.smith@vanhawke.com'];

export default async function handler(req, res) {
  // Pub/Sub sends POST with base64-encoded message
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  try {
    const message = req.body?.message;
    if (!message?.data) { return res.status(200).json({ ok: true, skipped: 'no data' }); }
    
    // Decode Pub/Sub message
    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
    const { emailAddress, historyId } = decoded;
    console.log(`[gmail-webhook] Push notification: ${emailAddress} historyId=${historyId}`);
    
    if (!emailAddress) return res.status(200).json({ ok: true, skipped: 'no email' });
    
    // Get token for this user
    const token = await getToken(emailAddress);
    if (!token) { console.error(`[gmail-webhook] No token for ${emailAddress}`); return res.status(200).json({ ok: true, skipped: 'no token' }); }
    
    // Fetch recent messages since last historyId
    const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
    
    // Check for new replies from tracked follow-ups
    const followUps = await sbFetch(`kiko_follow_ups?status=eq.awaiting_reply&sender_email=eq.${encodeURIComponent(emailAddress)}&select=*`);
    
    if (Array.isArray(followUps) && followUps.length > 0) {
      for (const fu of followUps) {
        const query = `from:${fu.recipient_email} newer_than:1d`;
        const searchRes = await fetch(`${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=1`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => ({}));
        
        if (searchRes.messages?.length > 0) {
          // Reply detected — update follow-up status
          const now = new Date().toISOString();
          await sbFetch(`kiko_follow_ups?id=eq.${fu.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'replied', reply_detected_at: now, updated_at: now }),
          });
          // Create instant alert
          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              id: crypto.randomUUID(), type: 'follow_up_reply', severity: 'high',
              title: `Reply received from ${fu.recipient_name || fu.recipient_email}${fu.company ? ` (${fu.company})` : ''}`,
              detail: `Original: "${fu.subject}". Reply detected instantly via push notification.`,
              entity_type: 'follow_up', entity_id: fu.id, entity_name: fu.recipient_name || fu.recipient_email,
              metadata: { original_subject: fu.subject, sender: fu.sender_email, recipient: fu.recipient_email },
              user_id: null, dismissed: false, created_at: now,
              expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            }),
          });
          console.log(`[gmail-webhook] REPLY DETECTED: ${fu.recipient_name} (${fu.company}) → instant alert created`);
        }
      }
    }
    
    return res.status(200).json({ ok: true, email: emailAddress, followUpsChecked: followUps?.length || 0 });
  } catch (err) {
    console.error('[gmail-webhook] Error:', err.message);
    return res.status(200).json({ ok: true, error: err.message }); // Always 200 to prevent Pub/Sub retries
  }
}

// Register Gmail watch — call this once per user to start push notifications
// Must be re-registered every 7 days (handled by a cron)
export async function registerGmailWatch(email, topicName) {
  const token = await getToken(email);
  if (!token) return { error: `No token for ${email}` };
  
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName, labelIds: ['INBOX'] }),
  });
  const data = await res.json();
  console.log(`[gmail-webhook] Watch registered for ${email}:`, JSON.stringify(data));
  return data;
}
