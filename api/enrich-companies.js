import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { action, offset: reqOffset, batchSize: reqBatch } = req.body || {}
  const BATCH = Math.min(reqBatch || 40, 80)
  const OFFSET = reqOffset || 0

  if (action === 'status') {
    const { data } = await supabase.rpc('', undefined).catch(() => ({}))
    const result = await supabase.from('companies').select('id', { count: 'exact', head: true })
    const filled = await supabase.from('companies').select('id', { count: 'exact', head: true })
      .not('data->>industry', 'is', null).not('data->>industry', 'eq', '')
    return res.json({ total: result.count, withIndustry: filled.count })
  }

  if (action === 'enrich') {
    try {
      // Get companies missing industry
      const { data: companies } = await supabase.from('companies').select('id, data')
        .or('data->>industry.is.null,data->>industry.eq.')
        .not('data->>name', 'is', null).not('data->>name', 'eq', '')
        .order('id', { ascending: true })
        .range(OFFSET, OFFSET + BATCH - 1)

      if (!companies || companies.length === 0) {
        return res.json({ done: true, message: 'No more companies to enrich', offset: OFFSET })
      }

      // Build prompt with all company names + domains
      const companyList = companies.map(c => {
        const name = c.data?.name || ''
        const domain = c.data?.website || ''
        return `${c.id}|${name}|${domain}`
      }).join('\n')

      const prompt = `You are a business data analyst. For each company below, provide the industry/sector and country of HQ.

Format your response as one line per company, exactly like:
ID|INDUSTRY|COUNTRY

Rules:
- INDUSTRY should be specific (e.g. "Cybersecurity", "Cloud Infrastructure", "FinTech", "Audio Technology", "AI/ML", "SaaS", "E-commerce", "Blockchain", "HealthTech", "EdTech", "MarTech", "Supply Chain", "Automotive", "Gaming", "Media & Entertainment", "Telecommunications", "Energy", "Real Estate Tech", "Legal Tech", "HR Tech", "DevOps", "Data Analytics")
- COUNTRY should be the HQ country (e.g. "United States", "United Kingdom", "Israel", "Germany", "France")
- If you cannot determine with confidence, use "Unknown" for that field
- Do NOT include any other text, headers, or explanations
- One line per company, nothing else

Companies:
${companyList}`

      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!claudeResp.ok) {
        const err = await claudeResp.text()
        return res.status(500).json({ error: `Claude API ${claudeResp.status}: ${err}` })
      }

      const claudeData = await claudeResp.json()
      const responseText = claudeData.content?.[0]?.text || ''

      // Parse response
      const lines = responseText.trim().split('\n').filter(l => l.includes('|'))
      let enriched = 0

      for (const line of lines) {
        const parts = line.split('|').map(s => s.trim())
        if (parts.length < 3) continue
        const [compId, industry, country] = parts

        const company = companies.find(c => c.id === compId)
        if (!company) continue

        const existing = { ...company.data }
        let changed = false

        if (industry && industry !== 'Unknown' && !existing.industry) {
          existing.industry = industry
          changed = true
        }
        if (country && country !== 'Unknown' && !existing.country) {
          existing.country = country
          changed = true
        }

        if (changed) {
          await supabase.from('companies').update({
            data: existing,
            updated_at: new Date().toISOString()
          }).eq('id', compId)
          enriched++
        }
      }

      const nextOffset = OFFSET + companies.length
      return res.json({
        done: companies.length < BATCH,
        processed: companies.length,
        enriched,
        parsed: lines.length,
        nextOffset,
        message: companies.length < BATCH ? 'All done' : `Call again with offset: ${nextOffset}`
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'Use "enrich" or "status"' })
}
