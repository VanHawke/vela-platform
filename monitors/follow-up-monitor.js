// monitors/follow-up-monitor.js — Checks for overdue follow-ups and detects replies
// Runs every 2 hours weekdays. Creates alerts for overdue items + auto-generates follow-up drafts.

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

export async function runFollowUpMonitor() {
  console.log('[follow-up-monitor] Checking for overdue follow-ups...');
  try {
    // Get all follow-ups awaiting reply
    const pending = await sbFetch('kiko_follow_ups?status=eq.awaiting_reply&select=*');
    if (!Array.isArray(pending) || !pending.length) { console.log('[follow-up-monitor] No pending follow-ups'); return; }

    const now = new Date();
    let repliesDetected = 0, overdueAlerts = 0;

    for (const fu of pending) {
      // Step 1: Check if reply was received
      const token = await getToken(fu.sender_email);
      if (token) {
        const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
        const query = `from:${fu.recipient_email} newer_than:7d`;
        const searchRes = await fetch(`${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=3`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => ({}));

        if (searchRes.messages?.length > 0) {
          // Reply detected — update status
          await sbFetch(`kiko_follow_ups?id=eq.${fu.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'replied', reply_detected_at: now.toISOString(), updated_at: now.toISOString() }),
          });
          // Create alert
          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              id: crypto.randomUUID(), type: 'follow_up_reply', severity: 'high',
              title: `Reply received from ${fu.recipient_name || fu.recipient_email}${fu.company ? ` (${fu.company})` : ''}`,
              detail: `Original subject: "${fu.subject}". Reply detected in ${fu.sender_email.split('@')[0]}'s inbox.`,
              entity_type: 'follow_up', entity_id: fu.id, entity_name: fu.recipient_name || fu.recipient_email,
              metadata: { original_subject: fu.subject, sender: fu.sender_email, recipient: fu.recipient_email },
              user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', dismissed: false, created_at: now.toISOString(),
              expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
            }),
          });
          repliesDetected++;
          console.log(`[follow-up-monitor] Reply detected: ${fu.recipient_name} (${fu.company})`);
          continue;
        }
      }

      // Step 2: Check if follow-up is overdue
      if (fu.follow_up_due_at && new Date(fu.follow_up_due_at) < now) {
        // Check we haven't already alerted for this
        const existing = await sbFetch(`kiko_alerts?type=eq.follow_up_due&entity_id=eq.${fu.id}&dismissed=eq.false&select=id&limit=1`);
        if (Array.isArray(existing) && existing.length > 0) continue;

        // Create overdue alert
        const daysSince = Math.floor((now.getTime() - new Date(fu.sent_at).getTime()) / 86400000);
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(), type: 'follow_up_due', severity: 'high',
            title: `No reply from ${fu.recipient_name || fu.recipient_email} — ${daysSince} days`,
            detail: `Original: "${fu.subject}" sent ${daysSince} days ago from ${fu.sender_email.split('@')[0]}. Follow-up recommended.`,
            entity_type: 'follow_up', entity_id: fu.id, entity_name: fu.recipient_name || fu.recipient_email,
            metadata: { original_subject: fu.subject, sender: fu.sender_email, recipient: fu.recipient_email, company: fu.company, days_since: daysSince },
            user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', dismissed: false, created_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
          }),
        });
        overdueAlerts++;
        console.log(`[follow-up-monitor] Overdue: ${fu.recipient_name} (${fu.company}) — ${daysSince} days`);
      }
    }

    console.log(`[follow-up-monitor] Complete. ${pending.length} checked, ${repliesDetected} replies, ${overdueAlerts} overdue.`);
  } catch (err) { console.error('[follow-up-monitor] Error:', err.message); }
}
