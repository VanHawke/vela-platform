import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ''

async function askClaude(prompt, maxTokens = 4096) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  })
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${await r.text()}`)
  const data = await r.json()
  return data.content?.[0]?.text || ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const BATCH = Math.min(reqBatch || 30, 60)
  const OFFSET = reqOffset || 0

  // STATUS: show all gaps
  if (action === 'status') {
    const contacts = await supabase.from('contacts').select('id', { count: 'exact', head: true })
    const noTitle = await supabase.from('contacts').select('id', { count: 'exact', head: true })
      .or('data->>title.is.null,data->>title.eq.')
    const companies = await supabase.from('companies').select('id', { count: 'exact', head: true })
    const noIndustry = await supabase.from('companies').select('id', { count: 'exact', head: true })
      .or('data->>industry.is.null,data->>industry.eq.')
    const noCountry = await supabase.from('companies').select('id', { count: 'exact', head: true })
      .or('data->>country.is.null,data->>country.eq.')
    const noLinkedin = await supabase.from('companies').select('id', { count: 'exact', head: true })
      .or('data->>linkedin.is.null,data->>linkedin.eq.')
    return res.json({
      contacts: { total: contacts.count, missingTitle: noTitle.count },
      companies: { total: companies.count, missingIndustry: noIndustry.count, missingCountry: noCountry.count, missingLinkedin: noLinkedin.count }
    })
  }

  // ENRICH CONTACTS: fill missing job titles using Claude + company + name
  if (action === 'enrich-contacts') {
    try {
      const { data: contacts } = await supabase.from('contacts').select('id, data')
        .or('data->>title.is.null,data->>title.eq.')
        .not('data->>firstName', 'is', null).not('data->>firstName', 'eq', '')
        .not('data->>company', 'is', null).not('data->>company', 'eq', '')
        .order('id', { ascending: true }).range(OFFSET, OFFSET + BATCH - 1)

      if (!contacts || contacts.length === 0) {
        return res.json({ done: true, message: 'No more contacts to enrich', offset: OFFSET })
      }

      const list = contacts.map(c => {
        const d = c.data || {}
        return `${c.id}|${d.firstName || ''} ${d.lastName || ''}|${d.company || ''}|${d.email || ''}|${d.linkedin || ''}`
      }).join('\n')

      const prompt = `You are a B2B sales data analyst. For each contact below, infer their most likely job title based on their name, company, email, and LinkedIn URL pattern.

Format: one line per contact, exactly:
ID|JOB_TITLE

Rules:
- Be specific: "VP of Marketing", "Chief Technology Officer", "Head of Partnerships", "Director of Business Development"
- Use the email domain and company to inform the seniority level
- If the LinkedIn URL contains clues (e.g., /in/john-cto), use them
- If genuinely impossible to determine, use "Unknown"
- One line per ID, nothing else

Contacts:
${list}`

      const response = await askClaude(prompt)
      const lines = response.trim().split('\n').filter(l => l.includes('|'))
      let enriched = 0

      for (const line of lines) {
        const [id, title] = line.split('|').map(s => s.trim())
        if (!title || title === 'Unknown') continue
        const contact = contacts.find(c => c.id === id)
        if (!contact) continue

        const existing = { ...contact.data, title }
        await supabase.from('contacts').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', id)
        enriched++
      }

      const nextOffset = OFFSET + contacts.length
      return res.json({ done: contacts.length < BATCH, processed: contacts.length, enriched, nextOffset })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ENRICH COMPANIES: fill missing industry + country
  if (action === 'enrich-companies') {
    try {
      const { data: companies } = await supabase.from('companies').select('id, data')
        .or('data->>industry.is.null,data->>industry.eq.,data->>country.is.null,data->>country.eq.')
        .not('data->>name', 'is', null).not('data->>name', 'eq', '')
        .order('id', { ascending: true }).range(OFFSET, OFFSET + BATCH - 1)

      if (!companies || companies.length === 0) {
        return res.json({ done: true, message: 'No more companies to enrich', offset: OFFSET })
      }

      const list = companies.map(c => `${c.id}|${c.data?.name || ''}|${c.data?.website || ''}`).join('\n')

      const prompt = `You are a business intelligence analyst. For each company, provide industry/sector and country HQ.

Format: one line per company:
ID|INDUSTRY|COUNTRY

Rules:
- INDUSTRY: specific sectors like Cybersecurity, Cloud Infrastructure, FinTech, AI/ML, SaaS, E-commerce, MarTech, HealthTech, DevOps, Data Analytics, Gaming, Telecommunications, Automotive, Supply Chain, HR Tech, Legal Tech, Energy, Real Estate Tech, Media & Entertainment, Consumer Electronics, Aerospace, Biotechnology, Robotics, Quantum Computing, Blockchain, Insurance Tech, Travel Tech, AgriTech, CleanTech, Construction Tech, Food Tech, Sports Tech, Defense Tech
- COUNTRY: full name like "United States", "United Kingdom", "Israel", "Germany"
- If unknown, use "Unknown"
- One line per company

Companies:
${list}`

      const response = await askClaude(prompt)
      const lines = response.trim().split('\n').filter(l => l.includes('|'))
      let enriched = 0

      for (const line of lines) {
        const parts = line.split('|').map(s => s.trim())
        if (parts.length < 3) continue
        const [id, industry, country] = parts
        const company = companies.find(c => c.id === id)
        if (!company) continue

        const existing = { ...company.data }
        let changed = false
        if (industry && industry !== 'Unknown' && !existing.industry) { existing.industry = industry; changed = true }
        if (country && country !== 'Unknown' && !existing.country) { existing.country = country; changed = true }

        if (changed) {
          await supabase.from('companies').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', id)
          enriched++
        }
      }

      const nextOffset = OFFSET + companies.length
      return res.json({ done: companies.length < BATCH, processed: companies.length, enriched, nextOffset })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Use "status", "enrich-contacts", or "enrich-companies"' })
}
