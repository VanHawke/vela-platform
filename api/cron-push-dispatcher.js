// api/cron-push-dispatcher.js — Send push notifications for recent alerts
// Runs every 5 minutes, checks kiko_alerts for unprocessed items, sends push to subscribed users
// Decoupled from alert-creating crons to avoid modifying existing stable code

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = 'https://kiko.vanhawke.agency'

// Alert types that should trigger mobile push notifications
const PUSH_TYPES = [
  'reply_from_prospect',
  'linkedin_connection_accepted',
  'bounce_detected',
  'new_partnership',
  'new_user_joined',
  'task_due',
]

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=minimal', ...opts.headers },
  })
  if (!res.ok && !opts.ignoreError) throw new Error(`Supabase: ${res.status} ${await res.text()}`)
  if (opts.method === 'POST' || opts.method === 'PATCH') return null
  return res.json()
}

export default async function handler(req, res) {
  try {
    // Get alerts from last 6 minutes that haven't been push-notified
    const since = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    const alerts = await sbFetch(
      `kiko_alerts?created_at=gt.${since}&type=in.(${PUSH_TYPES.join(',')})&select=id,type,title,detail,user_id,created_at&order=created_at.desc&limit=10`
    )

    if (!alerts?.length) {
      return res.json({ ok: true, message: 'No new alerts to push', checked: 0 })
    }

    // Check which alerts already have push log entries
    const alertIds = alerts.map(a => a.id)
    const existing = await sbFetch(
      `push_notification_log?alert_id=in.(${alertIds.join(',')})&select=alert_id`
    ).catch(() => [])
    const alreadySent = new Set((existing || []).map(e => e.alert_id))

    // Filter to unsent
    const toSend = alerts.filter(a => !alreadySent.has(a.id))
    if (!toSend.length) {
      return res.json({ ok: true, message: 'All alerts already pushed', checked: alerts.length })
    }

    // Send push for each alert
    let sent = 0
    for (const alert of toSend) {
      try {
        const pushRes = await fetch(`${BASE_URL}/api/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: alert.user_id,
            title: alert.title || 'Kiko Alert',
            body: (alert.detail || '').slice(0, 200),
            url: '/command-centre',
            alertId: alert.id,
          })
        })
        const result = await pushRes.json()
        sent += result.sent || 0
      } catch (e) {
        console.error(`[PushDispatcher] Failed for alert ${alert.id}:`, e.message)
      }
    }

    return res.json({ ok: true, sent, alerts: toSend.length, total: alerts.length })
  } catch (err) {
    console.error('[PushDispatcher]', err)
    return res.status(500).json({ error: err.message })
  }
}
