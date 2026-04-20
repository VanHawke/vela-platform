// api/push-send.js — Send push notifications using Web Push protocol (no web-push package)
import crypto from 'crypto'

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

async function getVapidKeys() {
  const rows = await sbFetch('platform_config?key=in.(VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY)&select=key,value')
  return {
    publicKey: rows.find(r => r.key === 'VAPID_PUBLIC_KEY')?.value,
    privateKey: rows.find(r => r.key === 'VAPID_PRIVATE_KEY')?.value,
  }
}

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url')
}

function createVapidJwt(audience, vapidKeys) {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:sunny@vanhawke.com',
  }
  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const unsigned = `${headerB64}.${payloadB64}`
  
  const key = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex'),
      Buffer.from(vapidKeys.privateKey, 'base64url'),
    ]),
    format: 'der',
    type: 'pkcs8',
  })
  const sig = crypto.sign(null, Buffer.from(unsigned), key)
  return `${unsigned}.${base64urlEncode(sig)}`
}

async function sendPushNotification(sub, payload, vapidKeys) {
  const endpoint = new URL(sub.endpoint)
  const audience = `${endpoint.protocol}//${endpoint.host}`
  const jwt = createVapidJwt(audience, vapidKeys)
  
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${vapidKeys.publicKey}`,
    },
    body: payload,
  })
  if (!res.ok && res.status !== 201) {
    throw { statusCode: res.status, message: await res.text() }
  }
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  
  try {
    const { userId, userEmail, title, body, url, alertId } = req.body
    if (!title) return res.status(400).json({ error: 'Missing title' })
    
    const vapidKeys = await getVapidKeys()
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      return res.status(500).json({ error: 'VAPID keys not configured' })
    }
    
    let query = 'push_subscriptions?active=eq.true&select=id,endpoint,keys,user_email'
    if (userId) query += `&user_id=eq.${userId}`
    if (userEmail) query += `&user_email=eq.${encodeURIComponent(userEmail)}`
    
    const subs = await sbFetch(query)
    if (!subs?.length) return res.json({ sent: 0, message: 'No active subscriptions' })
    
    const payload = JSON.stringify({ title, body: body || '', icon: '/kiko-icon-192.png', badge: '/kiko-icon-192.png', url: url || '/' })
    
    let sent = 0, failed = 0
    for (const sub of subs) {
      try {
        await sendPushNotification(sub, payload, vapidKeys)
        sent++
        await sbFetch('push_notification_log', {
          method: 'POST',
          body: JSON.stringify({ subscription_id: sub.id, alert_id: alertId, title, body, status: 'sent' })
        })
      } catch (err) {
        failed++
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
