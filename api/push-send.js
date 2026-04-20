// api/push-send.js — Send push notifications to subscribed users
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let vapidReady = false
async function ensureVapid() {
  if (vapidReady) return
  try {
    let pub = process.env.VAPID_PUBLIC_KEY
    let priv = process.env.VAPID_PRIVATE_KEY
    if (!pub || !priv) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/platform_config?key=in.(VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY)&select=key,value`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      })
      const rows = await res.json()
      pub = rows.find(r => r.key === 'VAPID_PUBLIC_KEY')?.value
      priv = rows.find(r => r.key === 'VAPID_PRIVATE_KEY')?.value
    }
    if (pub && priv) {
      webpush.setVapidDetails('mailto:sunny@vanhawke.com', pub, priv)
      vapidReady = true
    }
  } catch (e) { console.error('[Push] VAPID init error:', e) }
}

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
    await ensureVapid()
    const { userId, userEmail, title, body, url, alertId } = req.body
    if (!title) return res.status(400).json({ error: 'Missing title' })
    
    // Get active subscriptions for this user (or all users if no userId specified)
    let query = 'push_subscriptions?active=eq.true&select=id,endpoint,keys,user_email'
    if (userId) query += `&user_id=eq.${userId}`
    if (userEmail) query += `&user_email=eq.${encodeURIComponent(userEmail)}`
    
    const subs = await sbFetch(query)
    if (!subs?.length) return res.json({ sent: 0, message: 'No active subscriptions' })
    
    const payload = JSON.stringify({
      title,
      body: body || '',
      icon: '/kiko-icon-192.png',
      badge: '/kiko-icon-192.png',
      url: url || '/',
      timestamp: Date.now(),
    })
    
    let sent = 0, failed = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
        sent++
        // Log
        await sbFetch('push_notification_log', {
          method: 'POST',
          body: JSON.stringify({ subscription_id: sub.id, alert_id: alertId, title, body, status: 'sent' })
        })
      } catch (err) {
        failed++
        console.error(`[Push] Failed for ${sub.user_email}:`, err.statusCode || err.message)
        // Deactivate expired subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sbFetch(`push_subscriptions?id=eq.${sub.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }), ignoreError: true })
        }
      }
    }
    
    return res.json({ sent, failed, total: subs.length })
  } catch (err) {
    console.error('[Push] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
