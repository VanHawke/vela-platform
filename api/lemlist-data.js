// api/lemlist-data.js — Lemlist data endpoint for the Lemlist page UI
const LEMLIST_KEY = process.env.LEMLIST_KEY
const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${LEMLIST_KEY}`).toString('base64')}` }

async function fetchJSON(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Lemlist ${res.status}`)
  return res.json()
}

export default async function handler(req, res) {
  const { action, campaign_id, lead_email, sequence_id } = req.query
  try {
    if (action === 'campaigns') {
      const campaigns = await fetchJSON('https://api.lemlist.com/api/campaigns')
      return res.json(campaigns || [])
    }
    if (action === 'activities') {
      let url = 'https://api.lemlist.com/api/activities?limit=100'
      if (campaign_id) url += `&campaignId=${campaign_id}`
      if (lead_email) url = `https://api.lemlist.com/api/activities?leadId=${encodeURIComponent(lead_email)}&limit=100`
      const activities = await fetchJSON(url)
      return res.json(activities || [])
    }
    if (action === 'stats' && campaign_id) {
      const stats = await fetchJSON(`https://api.lemlist.com/api/campaigns/${campaign_id}/export/statistics`)
      return res.json(stats || {})
    }
    if (action === 'leads' && campaign_id) {
      const leads = await fetchJSON(`https://api.lemlist.com/api/campaigns/${campaign_id}/leads?limit=100`)
      return res.json(leads || [])
    }
    if (action === 'campaign_detail' && campaign_id) {
      const detail = await fetchJSON(`https://api.lemlist.com/api/campaigns/${campaign_id}`)
      return res.json(detail || {})
    }
    if (action === 'sequence_steps' && sequence_id) {
      const steps = await fetchJSON(`https://api.lemlist.com/api/sequences/${sequence_id}/steps`)
      return res.json(steps || [])
    }
    return res.status(400).json({ error: 'action required: campaigns | activities | stats | leads | campaign_detail | sequence_steps' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
