// api/push-subscribe.js — Register/unregister push notification subscriptions
import webpush from 'web-push'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

webpush.setVapidDetails(
  'mailto:sunny@vanhawke.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=minimal',
      ...opts.headers,
    },
  })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  if (opts.method === 'POST' || opts.method === 'PATCH' || opts.method === 'DELETE') return null
  return res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  
  try {
    const { action, subscription, userId, userEmail, deviceInfo } = req.body
    
    if (action === 'subscribe') {
      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ error: 'Missing subscription data' })
      }
      // Upsert subscription
      await sbFetch('push_subscriptions', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: userId,
          user_email: userEmail,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          device_info: deviceInfo || 'unknown',
          active: true,
          updated_at: new Date().toISOString(),
        })
      })
      return res.json({ ok: true, message: 'Subscribed' })
    }
    
    if (action === 'unsubscribe') {
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing endpoint' })
      await sbFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
      })
      return res.json({ ok: true, message: 'Unsubscribed' })
    }
    
    // Get VAPID public key
    if (action === 'vapid-key') {
      return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
    }
    
    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('[Push] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
