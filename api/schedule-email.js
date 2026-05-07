// api/schedule-email.js — Schedule an email to send at a specific time
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { to, subject, body, sender, scheduledFor, recipientName } = req.body;
  if (!to || !subject || !body || !scheduledFor) return res.status(400).json({ error: 'to, subject, body, and scheduledFor required' });

  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const res2 = await fetch(`${SB_URL}/rest/v1/kiko_scheduled_emails`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        sender_email: sender || 'sunny@vanhawke.agency',
        recipient_email: to,
        recipient_name: recipientName || null,
        subject,
        body,
        scheduled_for: scheduledFor,
        created_by: sender || 'sunny@vanhawke.agency',
      }),
    });
    const data = await res2.json();
    if (Array.isArray(data) && data[0]?.id) {
      const scheduled = new Date(scheduledFor);
      return res.json({ ok: true, id: data[0].id, scheduledFor: scheduled.toISOString(), 
        display: `${scheduled.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${scheduled.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` });
    }
    return res.status(500).json({ error: 'Failed to schedule' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}
