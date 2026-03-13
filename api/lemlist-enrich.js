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
  if (!r.ok) throw new Error(`Lemlist ${r.status}: ${await r.text()}`)
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { action } = req.body || {}

  // Action: sample — pull 10 contacts and show what fields Lemlist has
  if (action === 'sample') {
    try {
      const contacts = await lemlistFetch('/contacts?limit=10&version=v2')
      const summary = contacts.map(c => ({
        email: c.email,
        fullName: c.fullName,
        jobTitle: c.fields?.jobTitle || null,
        linkedin: c.fields?.linkedinUrl || c.fields?.linkedin || null,
        phone: c.fields?.phone || null,
        companyName: c.fields?.companyName || c.fields?.company || null,
        industry: c.fields?.industry || null,
        lastCampaign: c.fields?.lastCampaign || null,
        leadStatus: c.fields?.leadStatus || null,
        allFieldKeys: Object.keys(c.fields || {}),
      }))
      return res.json({ count: contacts.length, contacts: summary })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // Action: enrich — pull all Lemlist contacts and backfill Supabase
  if (action === 'enrich') {
    try {
      let offset = 0
      const limit = 100
      let enriched = 0
      let total = 0
      let hasMore = true

      while (hasMore) {
        const contacts = await lemlistFetch(`/contacts?limit=${limit}&offset=${offset}&version=v2`)
        if (!contacts || contacts.length === 0) { hasMore = false; break }
        total += contacts.length

        for (const c of contacts) {
          if (!c.email) continue
          const jobTitle = c.fields?.jobTitle || ''
          const linkedin = c.fields?.linkedinUrl || c.fields?.linkedin || ''
          const phone = c.fields?.phone || ''

          // Only update if Lemlist has data we're missing
          if (!jobTitle && !linkedin && !phone) continue

          // Find matching contact in Supabase by email
          const { data: rows } = await supabase
            .from('contacts')
            .select('id, data')
            .filter('data->>email', 'eq', c.email)
            .limit(1)

          if (!rows || rows.length === 0) continue

          const row = rows[0]
          const existing = row.data || {}
          let changed = false

          if (jobTitle && !existing.title) { existing.title = jobTitle; changed = true }
          if (linkedin && !existing.linkedin) { existing.linkedin = linkedin; changed = true }
          if (phone && !existing.phone) { existing.phone = phone; changed = true }

          if (changed) {
            await supabase.from('contacts').update({
              data: existing,
              updated_at: new Date().toISOString()
            }).eq('id', row.id)
            enriched++
          }
        }

        offset += limit
        if (contacts.length < limit) hasMore = false

        // Rate limit: 20 req / 2s — we're doing 1 per contact + 1 list, so pause between pages
        await new Promise(r => setTimeout(r, 1000))
      }

      return res.json({ success: true, total_lemlist: total, enriched })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use "sample" or "enrich"' })
}
