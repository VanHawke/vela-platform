// api/lemlist-data.js — Lemlist data endpoint for the Lemlist page UI
const LEMLIST_KEY = process.env.LEMLIST_API_KEY
const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${LEMLIST_KEY}`).toString('base64')}` }

async function fetchJSON(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Lemlist ${res.status}`)
  return res.json()
}

export default async function handler(req, res) {
  const { action, campaign_id } = req.query
  try {
    if (action === 'campaigns') {
      const campaigns = await fetchJSON('https://api.lemlist.com/api/campaigns')
      return res.json(campaigns || [])
    }
    if (action === 'activities') {
      let url = 'https://api.lemlist.com/api/activities?limit=50'
      if (campaign_id) url += `&campaignId=${campaign_id}`
      const activities = await fetchJSON(url)
      return res.json(activities || [])
    }
    if (action === 'stats' && campaign_id) {
      const stats = await fetchJSON(`https://api.lemlist.com/api/campaigns/${campaign_id}/export/statistics`)
      return res.json(stats || {})
    }
    return res.status(400).json({ error: 'action required: campaigns | activities | stats' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
