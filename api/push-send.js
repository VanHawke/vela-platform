// api/push-send.js — Push notifications.
// Two modes: (1) action:'call' sends an incoming-call web-push synchronously to the CALLEE's
// active subscriptions (Messenger calls, so a frozen/closed tab still rings); (2) default logs an
// alert intent into push_notification_log (legacy Kiko-alert queue).
import webpush from 'web-push'

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

let vapidReady = false
async function ensureVapid() {
  if (vapidReady) return true
  const rows = await sbFetch('platform_config?key=in.(VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY)&select=key,value')
  const pub = rows?.find((r) => r.key === 'VAPID_PUBLIC_KEY')?.value
  const priv = rows?.find((r) => r.key === 'VAPID_PRIVATE_KEY')?.value
  if (!pub || !priv) return false
  webpush.setVapidDetails('mailto:notifications@vanhawke.agency', pub, priv)
  vapidReady = true
  return true
}

// Send an incoming-call web-push to the CALLEE's active subscriptions only. Never the caller.
// Short TTL + high urgency so a missed call is not delivered late as noise. Prunes dead endpoints.
async function sendCallPush({ toUserId, toEmail, callerName, callId }) {
  if (!(await ensureVapid())) return { sent: 0, error: 'vapid-missing' }
  let filter = 'active=eq.true'
  if (toUserId) filter += `&user_id=eq.${toUserId}`
  else if (toEmail) filter += `&user_email=eq.${encodeURIComponent(toEmail)}`
  else return { sent: 0, error: 'no-target' }
  const subs = await sbFetch(`push_subscriptions?${filter}&select=id,endpoint,keys`)
  if (!subs?.length) return { sent: 0, subs: 0 }
  const payload = JSON.stringify({
    title: 'Incoming call',
    body: `${callerName || 'Someone'} is calling`,
    icon: '/kiko-icon-192.png',
    tag: `kiko-call-${callId || 'x'}`,
    url: '/messages',
    type: 'call',
    actions: [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }],
  })
  const opts = { TTL: 30, urgency: 'high' }
  let sent = 0, pruned = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, opts)
      sent++
    } catch (err) {
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        await sbFetch(`push_subscriptions?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) }).catch(() => {})
        pruned++
      }
    }
  }))
  return { sent, subs: subs.length, pruned }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  
  try {
    const body0 = req.body || {}
    // Incoming-call push (Messenger calls). Targets the callee only; returns send/prune counts.
    if (body0.action === 'call') {
      const result = await sendCallPush(body0)
      return res.json({ ok: true, ...result })
    }
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
