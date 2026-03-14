import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LEMLIST_KEY = process.env.LEMLIST_KEY || ''

async function lemlistFetch(path) {
  const auth = Buffer.from(':' + LEMLIST_KEY).toString('base64')
  const r = await fetch(`https://api.lemlist.com/api${path}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  })
  if (!r.ok) {
    if (r.status === 404) return null
    return null // skip errors silently
  }
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const BATCH = Math.min(reqBatch || 50, 100)
  const OFFSET = reqOffset || 0

  // BACKFILL: pull campaign + last activity data from Lemlist for each contact
  if (action === 'backfill') {
    try {
      const { data: contacts } = await supabase.from('contacts').select('id, data')
        .not('data->>email', 'eq', '').not('data->>email', 'is', null)
        .not('data->>email', 'eq', 'undefined')
        .order('id', { ascending: true })
        .range(OFFSET, OFFSET + BATCH - 1)

      if (!contacts || contacts.length === 0) {
        return res.json({ done: true, message: 'No more contacts', offset: OFFSET })
      }

      let enriched = 0, notFound = 0

      for (const c of contacts) {
        const email = c.data?.email
        if (!email) continue

        try {
          const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`)
          if (!leads || (Array.isArray(leads) && leads.length === 0)) { notFound++; continue }

          const leadArr = Array.isArray(leads) ? leads : [leads]
          const existing = { ...c.data }
          let changed = false

          // Collect all campaigns this contact is in
          const campaigns = leadArr
            .filter(l => l.campaign?.name)
            .map(l => ({
              id: l.campaign.id,
              name: l.campaign.name,
              status: l.campaign.status,
              leadStatus: l.status,
              leadState: l.state,
            }))

          if (campaigns.length > 0) {
            existing.lemlistCampaigns = campaigns
            existing.lastCampaign = campaigns[0].name
            existing.lemlistCampaignId = campaigns[0].id
            // Derive outreach status from lead status
            const statuses = leadArr.map(l => l.status).filter(Boolean)
            if (statuses.includes('interested')) existing.outreachStatus = 'Interested'
            else if (statuses.includes('notInterested')) existing.outreachStatus = 'Not Interested'
            else if (statuses.includes('review')) existing.outreachStatus = 'In Review'
            changed = true
          }

          if (changed) {
            await supabase.from('contacts').update({
              data: existing,
              updated_at: new Date().toISOString()
            }).eq('id', c.id)
            enriched++
          }
        } catch (e) { /* skip */ }
        await new Promise(r => setTimeout(r, 120))
      }

      const nextOffset = OFFSET + contacts.length
      return res.json({
        done: contacts.length < BATCH,
        processed: contacts.length,
        enriched, notFound, nextOffset,
        message: contacts.length < BATCH ? 'All done' : `Call again with offset: ${nextOffset}`
      })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // STATUS: check how many contacts have campaign data
  if (action === 'status') {
    const { count: total } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
    const { count: withCampaign } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
      .not('data->>lastCampaign', 'is', null).not('data->>lastCampaign', 'eq', '')
    return res.json({ total, withCampaign })
  }

  return res.status(400).json({ error: 'Use "backfill" or "status"' })
}
