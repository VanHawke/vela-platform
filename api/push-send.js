// api/push-send.js — Queue push notifications (actual sending done by Hetzner worker)
// Simplified: no crypto dependency — stores notification intent, Hetzner dispatches

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=minimal', ...opts.headers },
  })
  if (!res.ok && !opts.ignoreError) throw new Error(`Supabase: ${res.status}`)
  if (opts.method === 'POST' || opts.method === 'PATCH') return null
  return res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  
  try {
    const { userId, userEmail, title, body, url, alertId } = req.body
    if (!title) return res.status(400).json({ error: 'Missing title' })
    
    // Log the notification intent — actual push delivery handled by Hetzner worker
    await sbFetch('push_notification_log', {
      method: 'POST',
      body: JSON.stringify({
        alert_id: alertId || null,
        title,
        body: (body || '').slice(0, 500),
        status: 'queued',
      })
    })
    
    return res.json({ ok: true, queued: true, title })
  } catch (err) {
    console.error('[Push] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
