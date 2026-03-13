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
    const text = await r.text()
    if (r.status === 404) return null
    throw new Error(`Lemlist ${r.status}: ${text}`)
  }
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, apiKey } = req.body || {}
  const key = apiKey || LEMLIST_KEY

  if (action === 'sample') {
    try {
      const team = await lemlistFetch('/team', key)
      if (!team) return res.status(401).json({ error: 'Invalid Lemlist API key' })

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, data')
        .not('data->>email', 'eq', '')
        .not('data->>email', 'is', null)
        .not('data->>email', 'eq', 'undefined')
        .limit(10)

      const results = []
      for (const c of (contacts || [])) {
        const email = c.data?.email
        if (!email) continue
        try {
          const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`, key)
          if (!leads) { results.push({ email, found: false }); continue }
          const lead = Array.isArray(leads) ? leads[0] : leads
          const vars = lead?.variables || {}
          results.push({
            email, found: true,
            firstName: vars.firstName || null,
            lastName: vars.lastName || null,
            jobTitle: vars.jobTitle || vars.job_title || null,
            companyName: vars.companyName || vars.company || null,
            linkedin: vars.linkedinUrl || vars.linkedin || vars.linkedInUrl || null,
            phone: vars.phone || null,
            allVariableKeys: Object.keys(vars),
            campaignName: lead?.campaign?.name || null,
            leadStatus: lead?.status || null,
          })
        } catch (e) {
          results.push({ email, found: false, error: e.message })
        }
        await new Promise(r => setTimeout(r, 150))
      }
      return res.json({ team: team.name, count: results.length, results })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (action === 'enrich') {
    try {
      const batchSize = 50
      let offset = 0, enriched = 0, notFound = 0, total = 0, hasMore = true
      while (hasMore) {
        const { data: contacts } = await supabase
          .from('contacts').select('id, data')
          .not('data->>email', 'eq', '').not('data->>email', 'is', null)
          .not('data->>email', 'eq', 'undefined')
          .order('updated_at', { ascending: false })
          .range(offset, offset + batchSize - 1)
        if (!contacts || contacts.length === 0) { hasMore = false; break }
        total += contacts.length
        for (const c of contacts) {
          const email = c.data?.email
          if (!email) continue
          try {
            const leads = await lemlistFetch(`/leads/${encodeURIComponent(email)}?version=v2`, key)
            if (!leads) { notFound++; continue }
            const lead = Array.isArray(leads) ? leads[0] : leads
            const vars = lead?.variables || {}
            const jobTitle = vars.jobTitle || vars.job_title || ''
            const linkedin = vars.linkedinUrl || vars.linkedin || vars.linkedInUrl || ''
            const phone = vars.phone || ''
            if (!jobTitle && !linkedin && !phone) continue
            const existing = c.data || {}
            let changed = false
            if (jobTitle && !existing.title) { existing.title = jobTitle; changed = true }
            if (linkedin && !existing.linkedin) { existing.linkedin = linkedin; changed = true }
            if (phone && !existing.phone) { existing.phone = phone; changed = true }
            if (changed) {
              await supabase.from('contacts').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', c.id)
              enriched++
            }
          } catch (e) { /* skip */ }
          await new Promise(r => setTimeout(r, 150))
        }
        offset += batchSize
        if (contacts.length < batchSize) hasMore = false
      }
      return res.json({ success: true, total_checked: total, enriched, not_found: notFound })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use "sample" or "enrich"' })
}
