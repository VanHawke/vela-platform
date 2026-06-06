// api/rewrite-email.js — Email rewrite with Van Hawke voice profile enforcement
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

// Load voice profile from Supabase
async function loadVoiceProfile() {
  try {
    const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/kiko_user_config?select=email_voice_profile&limit=1`
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      }
    })
    const data = await res.json()
    return data?.[0]?.email_voice_profile || null
  } catch { return null }
}

function voiceRules(profile) {
  if (!profile) return ''
  const lines = ['\nVOICE PROFILE (match EXACTLY — learned from real sent emails):']
  if (profile.formality) lines.push(`Formality: ${profile.formality}`)
  if (profile.tone) lines.push(`Tone: ${profile.tone}`)
  if (profile.forbidden_phrases?.length) lines.push(`NEVER use: ${profile.forbidden_phrases.join(', ')}`)
  if (profile.preferred_phrases?.length) lines.push(`USE these: ${profile.preferred_phrases.slice(0, 8).join(', ')}`)
  if (profile.opening_patterns?.length) lines.push(`Opening style: ${profile.opening_patterns.slice(0, 3).join(' / ')}`)
  if (profile.closing_patterns?.length) lines.push(`Closing style: ${profile.closing_patterns.slice(0, 3).join(' / ')}`)
  if (profile.paragraph_rhythm) lines.push(`Paragraph rhythm: ${profile.paragraph_rhythm}`)
  if (profile.sentence_structure) lines.push(`Sentence structure: ${profile.sentence_structure}`)
  if (profile.punctuation_style) lines.push(`Punctuation: ${profile.punctuation_style}`)
  if (profile.relationship_awareness) lines.push(`Relationship awareness: ${profile.relationship_awareness}`)
  return lines.join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { prompt, body } = req.body || {}
  if (!body) return res.status(400).json({ error: 'Missing body' })

  // Load voice profile for every rewrite — ensures Van Hawke voice is preserved
  const profile = await loadVoiceProfile()
  const voiceContext = voiceRules(profile)

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514', // Sonnet — email quality
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${prompt || 'Rewrite this email body to be shorter.'}\n${voiceContext}\n\nCRITICAL: Match the voice profile above EXACTLY. Never use any forbidden phrases. Use preferred phrases where natural. Write like a senior F1 sponsorship dealmaker — authoritative, precise, zero filler.\n\nOutput ONLY the rewritten email body paragraphs. No subject line, no "Dear X", no sign-off, no name, no analysis, no commentary. Just the body paragraphs:\n\n${body}`
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
