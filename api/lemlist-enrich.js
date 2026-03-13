import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LEMLIST_KEY = process.env.LEMLIST_KEY || ''

async function lemlistFetch(path, apiKey) {
  const key = apiKey || LEMLIST_KEY
  if (!key) throw new Error('No Lemlist API key')
  const auth = Buffer.from(':' + key).toString('base64')
  const r = await fetch(`https://api.lemlist.com/api${path}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  })
  if (!r.ok) {
    if (r.status === 404) return null
    const text = await r.text()
    throw new Error(`Lemlist ${r.status}: ${text}`)
  }
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, apiKey, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const key = apiKey || LEMLIST_KEY
  const BATCH = Math.min(reqBatch || 200, 500)
  const OFFSET = reqOffset || 0

  // SAMPLE: look up 10 contacts
  if (action === 'sample') {
    try {
      const team = await lemlistFetch('/team', key)
      const { data: contacts } = await supabase.from('contacts').select('id, data')
        .not('data->>email', 'eq', '').not('data->>email', 'is', null)
        .not('data->>email', 'eq', 'undefined').limit(10)
      const results = []
      for (const c of (contacts || [])) {
        const email = c.data?.email
        if (!email) continue
        try {
          const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`, key)
          if (!leads) { results.push({ email, found: false }); continue }
          const lead = Array.isArray(leads) ? leads[0] : leads
          const vars = lead?.variables || {}
          results.push({ email, found: true, jobTitle: vars.jobTitle || null,
            linkedin: vars.linkedinUrl || null, phone: vars.phone || null,
            allVariableKeys: Object.keys(vars), campaignName: lead?.campaign?.name || null })
        } catch (e) { results.push({ email, found: false, error: e.message }) }
        await new Promise(r => setTimeout(r, 120))
      }
      return res.json({ team: team?.name, count: results.length, results })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ENRICH: process BATCH contacts starting at OFFSET
  if (action === 'enrich') {
    try {
      // Get contacts that still need enrichment (title is empty)
      const { data: contacts } = await supabase.from('contacts').select('id, data')
        .not('data->>email', 'eq', '').not('data->>email', 'is', null)
        .not('data->>email', 'eq', 'undefined')
        .or('data->>title.is.null,data->>title.eq.')
        .order('id', { ascending: true })
        .range(OFFSET, OFFSET + BATCH - 1)

      if (!contacts || contacts.length === 0) {
        return res.json({ done: true, message: 'No more contacts to enrich', offset: OFFSET })
      }

      let enriched = 0, notFound = 0, noData = 0

      for (const c of contacts) {
        const email = c.data?.email
        if (!email) continue
        try {
          const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`, key)
          if (!leads) { notFound++; continue }
          const lead = Array.isArray(leads) ? leads[0] : leads
          const vars = lead?.variables || {}
          const jobTitle = vars.jobTitle || vars.job_title || ''
          const linkedin = vars.linkedinUrl || vars.linkedin || ''
          const phone = vars.phone || ''
          const picture = vars.picture || ''
          const companyLinkedin = vars.companyLinkedinUrl || ''

          if (!jobTitle && !linkedin && !phone) { noData++; continue }

          const existing = { ...c.data }
          let changed = false
          if (jobTitle && !existing.title) { existing.title = jobTitle; changed = true }
          if (linkedin && !existing.linkedin) { existing.linkedin = linkedin; changed = true }
          if (phone && !existing.phone) { existing.phone = phone; changed = true }
          if (picture && !existing.picture) { existing.picture = picture; changed = true }
          if (companyLinkedin && !existing.companyLinkedin) { existing.companyLinkedin = companyLinkedin; changed = true }

          if (changed) {
            await supabase.from('contacts').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', c.id)
            enriched++
          }
        } catch (e) { /* skip */ }
        await new Promise(r => setTimeout(r, 120))
      }

      const nextOffset = OFFSET + contacts.length
      return res.json({
        done: contacts.length < BATCH,
        processed: contacts.length,
        enriched, notFound, noData,
        nextOffset,
        message: contacts.length < BATCH ? 'All done' : `Call again with offset: ${nextOffset}`
      })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Use "sample" or "enrich"' })
}
