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

  // Load voice profile ONLY to harvest its forbidden phrases (filler / AI-tells to avoid).
  // We deliberately do NOT impose the full profile here: it was learned from cold F1 sponsorship
  // outreach (tone "authoritative", no warm register), so forcing it onto a tone-refine turns warm
  // personal notes into cold pitches. Tone buttons must adjust tone and PRESERVE the email.
  const profile = await loadVoiceProfile()
  const avoid = profile?.forbidden_phrases?.length
    ? `\n\nAvoid these phrases entirely (they read as filler or AI-generated): ${profile.forbidden_phrases.join(', ')}.`
    : ''

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6', // Sonnet — email quality
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are adjusting the TONE of an existing email. Apply ONLY the change requested below; otherwise leave the email as it is.\n\nHard rules:\n- Preserve the email's meaning, intent, and approximate length. A one-line note stays a one-line note.\n- Preserve the relationship register: if it reads as a warm, personal message to someone the sender knows, keep it warm and personal; if it reads as a formal business approach, keep it formal.\n- Do NOT add new arguments, offers, pitches, calls to action, or "category / participation / strategic positioning" framing that is not already in the email.\n- Do NOT turn a short personal message into a formal pitch.${avoid}\n\nCHANGE REQUESTED: ${prompt || 'Make this email body shorter.'}\n\nOutput ONLY the rewritten email body paragraphs. No subject line, no greeting, no sign-off, no name, no analysis, no commentary. Just the body:\n\n${body}`
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
