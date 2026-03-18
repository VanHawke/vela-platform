import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.VITE_SUPABASE_URL || 'https://dwiywqeleyckzcxbwrlb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

const BATCH = 15 // companies per Haiku call
const DELAY = 600 // ms between batches

async function getCompetitors(companies) {
  const list = companies.map(c => `${c.id}|${c.name}|${c.industry || 'Unknown'}|${c.country || ''}`).join('\n')
  const prompt = `You are a competitive intelligence analyst. For each company, identify the top 5 competitors.

Return ONLY a valid JSON object. No text before or after. No markdown:
{
  "ID1": [{"name":"X","industry":"Y","stage":"Series B","funding":"$200M","website":"x.com","threat":"direct","reason":"Same product same buyers"},{"name":"Y",...}],
  "ID2": [...]
}

"threat" must be exactly: "direct", "adjacent", or "indirect"
- direct = same product, same buyers
- adjacent = related space, overlapping buyers
- indirect = same budget/problem, different approach
Sort: direct first, then adjacent, then indirect.
5 competitors per company. Use real companies. Keep reason under 10 words.

Companies (ID|Name|Industry|Country):
${list}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = res.content?.[0]?.text || ''
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON: ' + raw.slice(0, 100))
  return JSON.parse(raw.slice(start, end + 1))
}

async function run() {
  // Fetch all companies without competitors
  let allCompanies = [], from = 0
  console.log('Fetching companies...')
  while (true) {
    const { data, error } = await sb.from('companies').select('id, data')
      .not('data->>name', 'is', null).not('data->>name', 'eq', '')
      .order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) break
    allCompanies = allCompanies.concat(data.map(r => ({ id: r.id, ...r.data })))
    if (data.length < 1000) break
    from += 1000
  }

  const toProcess = allCompanies.filter(c => !c.competitors?.length)
  console.log(`Total: ${allCompanies.length} | Needs enrichment: ${toProcess.length}\n`)

  let enriched = 0, failed = 0, batchNum = 0
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH)
    batchNum++
    process.stdout.write(`Batch ${batchNum} (${i+1}-${Math.min(i+BATCH, toProcess.length)}/${toProcess.length})... `)

    try {
      const result = await getCompetitors(batch)
      for (const company of batch) {
        const competitors = result[company.id]
        if (!competitors?.length) { failed++; continue }
        const updated = { ...company, competitors, competitorsUpdatedAt: new Date().toISOString() }
        delete updated.id
        await sb.from('companies').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', company.id)
        enriched++
      }
      console.log(`✓ ${enriched} total enriched`)
    } catch (err) {
      console.log(`✗ Error: ${err.message.slice(0, 80)}`)
      failed += batch.length
    }

    if (i + BATCH < toProcess.length) await new Promise(r => setTimeout(r, DELAY))
  }

  console.log(`\n✅ Done. Enriched: ${enriched} | Failed: ${failed}`)
}

run().catch(console.error)
