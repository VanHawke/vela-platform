import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LEMLIST_KEY = process.env.LEMLIST_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const BATCH = Math.min(reqBatch || 10, 20)
  const OFFSET = reqOffset || 0
  const auth = Buffer.from(':' + LEMLIST_KEY).toString('base64')

  if (action === 'status') {
    const { count: total } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
    const { count: noEmail } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
      .or('data->>email.is.null,data->>email.eq.')
    const { count: noLinkedin } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
      .or('data->>linkedin.is.null,data->>linkedin.eq.')
    return res.json({ total, noEmail, noLinkedin })
  }

  if (action === 'find') {
    try {
      // Get contacts missing email that have name + company
      const { data: contactList } = await supabase.from('contacts').select('id, data')
        .or('data->>email.is.null,data->>email.eq.')
        .not('data->>firstName', 'is', null).not('data->>firstName', 'eq', '')
        .not('data->>company', 'is', null).not('data->>company', 'eq', '')
        .order('id', { ascending: true })
        .range(OFFSET, OFFSET + BATCH - 1)

      if (!contactList || contactList.length === 0) {
        return res.json({ done: true, message: 'No more contacts', offset: OFFSET })
      }

      let found = 0, notFound = 0

      for (const c of contactList) {
        const d = c.data || {}
        const firstName = d.firstName || ''
        const lastName = d.lastName || ''
        const company = d.company || ''

        if (!firstName || !company) continue

        // Get company domain
        const { data: orgs } = await supabase.from('companies').select('data->>website')
          .filter('data->>name', 'eq', company).limit(1)
        const domain = orgs?.[0]?.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

        if (!domain) { notFound++; continue }

        try {
          // Lemlist email finder API
          const r = await fetch('https://api.lemlist.com/api/email-finder', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, companyDomain: domain })
          })

          if (!r.ok) {
            if (r.status === 402) return res.json({ error: 'Lemlist credits exhausted', found, notFound, offset: OFFSET })
            notFound++
            continue
          }

          const result = await r.json()
          const existing = { ...d }
          let changed = false

          if (result.email && !existing.email) {
            existing.email = result.email
            changed = true
          }
          if (result.linkedinUrl && !existing.linkedin) {
            existing.linkedin = result.linkedinUrl
            changed = true
          }
          if (result.phone && !existing.phone) {
            existing.phone = result.phone
            changed = true
          }

          if (changed) {
            await supabase.from('contacts').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', c.id)
            found++
          } else { notFound++ }
        } catch (e) { notFound++ }

        // Rate limit — Lemlist enforces limits
        await new Promise(r => setTimeout(r, 500))
      }

      const nextOffset = OFFSET + contactList.length
      return res.json({ done: contactList.length < BATCH, processed: contactList.length, found, notFound, nextOffset })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Use "find" or "status"' })
}
