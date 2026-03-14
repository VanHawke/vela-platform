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

      const prompt = `You are a B2B sponsorship sales data analyst working for a Formula 1 sponsorship advisory firm. These contacts are decision-makers at technology companies who were sourced as potential F1 sponsorship prospects. They are typically senior marketing, partnerships, C-suite, or business development leaders.

For each contact, provide your BEST ESTIMATE of their job title. You MUST provide a title for every contact — never say "Unknown".

Format: one line per contact, exactly:
ID|JOB_TITLE

Rules:
- These are sponsorship decision-makers: titles are typically CMO, VP Marketing, Head of Partnerships, Director of Brand, VP Business Development, Chief Revenue Officer, CEO, CFO, Head of Sponsorships, Director of Strategic Alliances, SVP Marketing, Global Head of Marketing, Chief Marketing Officer, VP Corporate Development, Head of Communications
- Use the company name to inform seniority. Larger/well-known companies = more specific titles (VP, Director). Smaller/startups = broader titles (Head of Marketing, CMO)
- If you recognise the person's name and company from your knowledge, use their actual title
- If email is provided, the domain confirms the company. If "undefined", ignore it
- If LinkedIn URL is provided, use any clues from it
- ALWAYS provide a reasonable estimate. If minimal info, default to "Head of Marketing" or "VP of Marketing" as these are the most common roles for sponsorship prospects
- One line per ID, nothing else

Contacts (format: ID|Name|Company|Email|LinkedIn):
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

  // FIND-DOMAINS: infer company website domains from names via Claude
  if (action === 'find-domains') {
    try {
      const { data: companies } = await supabase.from('companies').select('id, data')
        .or('data->>website.is.null,data->>website.eq.')
        .not('data->>name', 'is', null).not('data->>name', 'eq', '')
        .order('id', { ascending: true }).range(OFFSET, OFFSET + BATCH - 1)

      if (!companies || companies.length === 0) {
        return res.json({ done: true, message: 'No more companies need domains', offset: OFFSET })
      }

      const list = companies.map(c => `${c.id}|${c.data?.name || ''}`).join('\n')

      const prompt = `You are a business domain lookup specialist. For each company name, provide the most likely primary website domain.

Format: one line per company:
ID|DOMAIN

Rules:
- DOMAIN should be the bare domain with no protocol (e.g. "enfusion.com", "sentry.io", "zuora.com", "servicetitan.com")
- Use the most common/official domain. For example: Sentry → sentry.io, Zuora → zuora.com, ServiceTitan → servicetitan.com
- For well-known companies use their real domain
- For lesser-known companies, use the most logical domain (companyname.com or companyname.io)
- If the company name has spaces, the domain usually removes them (e.g. "Big Bear" → bigbear.ai or bigbear.com)
- If genuinely impossible to determine, use "unknown"
- One line per ID, nothing else

Companies:
${list}`

      const response = await askClaude(prompt)
      const lines = response.trim().split('\n').filter(l => l.includes('|'))
      let enriched = 0

      for (const line of lines) {
        const [id, domain] = line.split('|').map(s => s.trim())
        if (!domain || domain === 'unknown') continue
        const company = companies.find(c => c.id === id)
        if (!company) continue

        const existing = { ...company.data }
        if (!existing.website) {
          existing.website = domain
          await supabase.from('companies').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', id)
          enriched++
        }
      }

      const nextOffset = OFFSET + companies.length
      return res.json({ done: companies.length < BATCH, processed: companies.length, enriched, nextOffset })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ENRICH-FUNDING: populate funding/revenue intelligence via Claude
  if (action === 'enrich-funding') {
    try {
      const { data: companies } = await supabase.from('companies').select('id, data')
        .or('data->>lastRound.is.null,data->>lastRound.eq.')
        .not('data->>name', 'is', null).not('data->>name', 'eq', '')
        .order('id', { ascending: true }).range(OFFSET, OFFSET + BATCH - 1)

      if (!companies || companies.length === 0) {
        return res.json({ done: true, message: 'No more companies need funding data', offset: OFFSET })
      }

      const list = companies.map(c => `${c.id}|${c.data?.name || ''}|${c.data?.industry || ''}|${c.data?.country || ''}`).join('\n')

      const prompt = `You are a venture capital and business intelligence analyst. For each company, provide funding and business intelligence data from your knowledge.

Format: one line per company:
ID|LAST_ROUND|TOTAL_FUNDING|VALUATION|EMPLOYEES|REVENUE_EST|FOUNDED

Rules:
- LAST_ROUND: Most recent funding round (e.g. "Series C - $200M (2024)", "Series B - $50M (2023)", "IPO (2021)", "Bootstrapped", "Unknown")
- TOTAL_FUNDING: Estimated total raised (e.g. "$350M", "$1.2B", "Bootstrapped", "Unknown")
- VALUATION: Last known valuation if available (e.g. "$2B", "$500M", "Public - $10B market cap", "Unknown")
- EMPLOYEES: Approximate headcount (e.g. "500-1000", "50-200", "1000-5000", "Unknown")
- REVENUE_EST: Annual revenue estimate if known (e.g. "$50M ARR", "$200M+", "Pre-revenue", "Unknown")
- FOUNDED: Year founded (e.g. "2019", "2015", "Unknown")
- Use "Unknown" for any field you genuinely cannot determine
- One line per company, nothing else

Companies:
${list}`

      const response = await askClaude(prompt)
      const lines = response.trim().split('\n').filter(l => l.includes('|'))
      let enriched = 0

      for (const line of lines) {
        const parts = line.split('|').map(s => s.trim())
        if (parts.length < 7) continue
        const [id, lastRound, totalFunding, valuation, employees, revenueEst, founded] = parts
        const company = companies.find(c => c.id === id)
        if (!company) continue

        const existing = { ...company.data }
        let changed = false
        if (lastRound && lastRound !== 'Unknown') { existing.lastRound = lastRound; changed = true }
        if (totalFunding && totalFunding !== 'Unknown') { existing.totalFunding = totalFunding; changed = true }
        if (valuation && valuation !== 'Unknown') { existing.valuation = valuation; changed = true }
        if (employees && employees !== 'Unknown') { existing.employees = employees; changed = true }
        if (revenueEst && revenueEst !== 'Unknown') { existing.revenueEst = revenueEst; changed = true }
        if (founded && founded !== 'Unknown') { existing.founded = founded; changed = true }

        if (changed) {
          await supabase.from('companies').update({ data: existing, updated_at: new Date().toISOString() }).eq('id', id)
          enriched++
        }
      }

      const nextOffset = OFFSET + companies.length
      return res.json({ done: companies.length < BATCH, processed: companies.length, enriched, nextOffset })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Use "status", "enrich-contacts", "enrich-companies", "find-domains", or "enrich-funding"' })
}
