import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { companyId, companyName, industry, country, forceRefresh } = req.body || {}
  if (!companyName) return res.status(400).json({ error: 'companyName required' })

  // Return cached if exists and not forcing refresh
  if (companyId && !forceRefresh) {
    const { data } = await sb.from('companies').select('data').eq('id', companyId).single()
    if (data?.data?.competitors?.length > 0) {
      return res.json({ competitors: data.data.competitors, cached: true })
    }
  }

  try {
    const prompt = `Research the top 5 direct and adjacent competitors to "${companyName}"${industry ? ` (${industry})` : ''}${country ? `, based in ${country}` : ''}.

Return ONLY a JSON array with exactly this structure — no other text, no markdown:
[
  {
    "name": "Company Name",
    "industry": "Specific sector",
    "stage": "Series B / IPO / Public / Private / Bootstrapped",
    "funding": "$200M raised",
    "employees": "500-2000",
    "website": "company.com",
    "threat": "direct",
    "reason": "One sentence: why they compete"
  }
]

Rules:
- "threat" must be exactly one of: "direct", "adjacent", "indirect"
- direct = same product/market, same buyers
- adjacent = related space, overlapping buyers or use cases
- indirect = different approach but same budget/problem being solved
- Sort by threat level: direct first, then adjacent, then indirect
- Use real, accurate data — these companies exist
- If unsure of exact funding, give best estimate
- "stage" should be the most recent known round or status`

    // Use Sonnet with web search for accurate, current data
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })

    // Extract text from response (may include tool use blocks)
    const textBlocks = (response.content || []).filter(b => b.type === 'text')
    const rawText = textBlocks.map(b => b.text).join('')

    // Parse JSON — strip any markdown fences
    const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = clean.indexOf('[')
    const jsonEnd = clean.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON array in response')

    const competitors = JSON.parse(clean.slice(jsonStart, jsonEnd + 1))

    // Cache in Supabase if we have a companyId
    if (companyId) {
      const { data: existing } = await sb.from('companies').select('data').eq('id', companyId).single()
      const updated = { ...(existing?.data || {}), competitors, competitorsUpdatedAt: new Date().toISOString() }
      await sb.from('companies').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', companyId)
    }

    return res.json({ competitors, cached: false })
  } catch (err) {
    console.error('[competitor-research]', err)
    return res.status(500).json({ error: err.message })
  }
}
