// Vercel Cron Job — runs daily to fill data gaps
// Add to vercel.json: { "crons": [{ "path": "/api/cron-enrich", "schedule": "0 6 * * *" }] }

export default async function handler(req, res) {
  // Vercel cron sends GET requests
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' })

  const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app'
  const results = {}

  async function callEndpoint(url, body) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return await r.json()
    } catch (e) { return { error: e.message } }
  }

  // 1. Enrich companies missing industry/country (up to 60)
  let compOffset = 0, compTotal = 0
  for (let i = 0; i < 2; i++) {
    const r = await callEndpoint(`${BASE}/api/enrichment-agent`, { action: 'enrich-companies', offset: compOffset, batchSize: 30 })
    compTotal += r.enriched || 0
    if (r.done || !r.nextOffset) break
    compOffset = r.nextOffset
  }
  results.companies = { enriched: compTotal }

  // 2. Enrich contacts missing titles (up to 60)
  let ctOffset = 0, ctTotal = 0
  for (let i = 0; i < 2; i++) {
    const r = await callEndpoint(`${BASE}/api/enrichment-agent`, { action: 'enrich-contacts', offset: ctOffset, batchSize: 30 })
    ctTotal += r.enriched || 0
    if (r.done || !r.nextOffset) break
    ctOffset = r.nextOffset
  }
  results.contacts = { enriched: ctTotal }

  // 3. Backfill campaigns for new contacts (up to 30)
  const campResult = await callEndpoint(`${BASE}/api/backfill-campaigns`, { action: 'backfill', offset: 0, batchSize: 30 })
  results.campaigns = { enriched: campResult.enriched || 0 }

  // 4. Backfill activities for contacts missing them (up to 30)
  const actResult = await callEndpoint(`${BASE}/api/backfill-activities`, { action: 'backfill', offset: 0, batchSize: 30 })
  results.activities = { logged: actResult.activitiesLogged || 0 }

  // 5. Scan for proactive intelligence alerts
  const alertResult = await callEndpoint(`${BASE}/api/kiko-alerts`, { action: 'scan' })
  results.alerts = { generated: alertResult.alertsGenerated || 0 }

  return res.json({ status: 'complete', timestamp: new Date().toISOString(), results })
}
