// api/rewrite-email.js — Lightweight email rewrite using Claude directly (no tools/memory)
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { prompt, body } = req.body || {}
  if (!body) return res.status(400).json({ error: 'Missing body' })

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${prompt || 'Rewrite this email body to be shorter.'}\n\nOutput ONLY the rewritten email body paragraphs. No subject line, no "Dear X", no sign-off, no name, no analysis, no commentary. Just the body paragraphs:\n\n${body}`
      }]
    })
    const rewritten = (message.content[0]?.text || '')
      .replace(/\*\*/g, '')
      .replace(/^Dear\s+\w+,?\s*/i, '')
      .replace(/(Best regards|Kind regards|Regards|Sincerely|Cheers|Warm regards),?\s*/gi, '')
      .replace(/Sunny\s*Sidhu/gi, '')
      .replace(/Van\s*Hawke[^\n]*/gi, '')
      .trim()
    return res.status(200).json({ success: true, body: rewritten })
  } catch (e) {
    console.error('[rewrite-email] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
