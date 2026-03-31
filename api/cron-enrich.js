// Vercel Cron Job — runs daily to fill data gaps
import { cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers } from './cron-utils.js';
// Add to vercel.json: { "crons": [{ "path": "/api/cron-enrich", "schedule": "0 6 * * *" }] }

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-enrich', 'started');
  try {
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

  // 6. Email sync handled by dedicated cron-email-sync.js (runs every 5 min)
  results.emails = { note: 'handled by cron-email-sync' }

  // 7. Email intelligence — analyse unprocessed emails and update contact scores
  try {
    const { processUnanalysedEmails } = await import('./email-intelligence.js')
    const users = await getActiveUsers();
    const intelResults = [];
    for (const u of users) { try { intelResults.push(await processUnanalysedEmails(u.email, 30)); } catch {} }
    results.intelligence = intelResults
  } catch (e) { results.intelligence = { error: e.message } }

  await cronHeartbeat('cron-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: Object.keys(results).length });
  return res.json({ status: 'complete', timestamp: new Date().toISOString(), results })
  } catch (__hbErr) {
    await cronHeartbeat('cron-enrich', 'error', { heartbeatId: __hbId, errorMessage: __hbErr?.message || 'unknown' });
    return res.status(200).json({ ok: false, error: __hbErr?.message });
  }
}
