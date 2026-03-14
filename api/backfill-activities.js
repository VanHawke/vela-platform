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
  if (!r.ok) return null
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const BATCH = Math.min(reqBatch || 25, 50)
  const OFFSET = reqOffset || 0

  if (action === 'backfill') {
    try {
      // Get contacts that have Lemlist campaigns and real emails
      const { data: contacts } = await supabase.from('contacts').select('id, data')
        .not('data->>lastCampaign', 'is', null).not('data->>lastCampaign', 'eq', '')
        .not('data->>email', 'is', null).not('data->>email', 'eq', '').not('data->>email', 'eq', 'undefined')
        .order('id', { ascending: true })
        .range(OFFSET, OFFSET + BATCH - 1)

      if (!contacts || contacts.length === 0) {
        return res.json({ done: true, message: 'No more contacts', offset: OFFSET })
      }

      let totalActivities = 0, enriched = 0

      for (const c of contacts) {
        const email = c.data?.email
        if (!email || email === 'undefined') continue

        try {
          // Get all lead data including activities
          const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`)
          if (!leads) continue

          const leadArr = Array.isArray(leads) ? leads : [leads]
          const activities = []

          for (const lead of leadArr) {
            if (lead.activities && Array.isArray(lead.activities)) {
              for (const act of lead.activities) {
                activities.push({
                  contact_id: c.id,
                  type: act.type || 'unknown',
                  campaign_name: lead.campaign?.name || null,
                  campaign_id: lead.campaign?.id || null,
                  sequence_step: act.sequenceStep ?? null,
                  email_subject: act.emailSubject || act.subject || null,
                  details: JSON.stringify({
                    sendUserEmail: act.sendUserEmail,
                    isFirst: act.isFirst,
                  }),
                  created_at: act.createdAt || act.date || new Date().toISOString(),
                })
              }
            }
          }

          if (activities.length > 0) {
            // Insert in batches of 50
            for (let i = 0; i < activities.length; i += 50) {
              const batch = activities.slice(i, i + 50)
              await supabase.from('contact_activities').insert(batch)
            }
            totalActivities += activities.length
            enriched++
          }
        } catch (e) { /* skip individual errors */ }

        // Rate limit
        await new Promise(r => setTimeout(r, 150))
      }

      const nextOffset = OFFSET + contacts.length
      return res.json({
        done: contacts.length < BATCH,
        processed: contacts.length,
        enriched,
        activitiesLogged: totalActivities,
        nextOffset,
        message: contacts.length < BATCH ? 'All done' : `Call again with offset: ${nextOffset}`
      })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  if (action === 'status') {
    const { count: total } = await supabase.from('contact_activities').select('id', { count: 'exact', head: true })
    const { count: contacts } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
      .not('data->>lastCampaign', 'is', null).not('data->>lastCampaign', 'eq', '')
      .not('data->>email', 'is', null).not('data->>email', 'eq', '').not('data->>email', 'eq', 'undefined')
    return res.json({ activitiesInTable: total, eligibleContacts: contacts })
  }

  return res.status(400).json({ error: 'Use "backfill" or "status"' })
}
