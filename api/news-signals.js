const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { company, industry, country } = req.body || {}
  if (!company) return res.status(400).json({ error: 'Provide company name' })

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{
          role: 'user',
          content: `Find the most recent and significant news about "${company}"${industry ? ` (${industry})` : ''}${country ? ` based in ${country}` : ''}. Focus on: funding rounds, acquisitions, partnerships, leadership changes, product launches, or major business developments from the last 6 months.

Return a JSON array of 1-4 news items. Each item: {"headline": "...", "summary": "1-2 sentence summary", "date": "YYYY-MM-DD or approximate", "type": "funding|partnership|product|leadership|acquisition|expansion|other"}

If no recent news exists, return an empty array: []
Return ONLY the JSON array, no other text.`
        }],
      }),
    })

    if (!r.ok) return res.status(500).json({ error: `API ${r.status}` })

    const data = await r.json()
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')

    let signals = []
    try {
      const cleaned = text.replace(/```json\s*|```/g, '').trim()
      signals = JSON.parse(cleaned)
      if (!Array.isArray(signals)) signals = []
    } catch (e) {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) { try { signals = JSON.parse(match[0]) } catch (e2) {} }
    }

    return res.json({ company, signals })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
