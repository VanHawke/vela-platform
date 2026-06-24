// api/rewrite-email.js — Tone-refine for the EmailDraft composer (Warmer / Sharper / Shorter).
// Per-user, relationship-aware: the register and the voice traits are the SENDER's, resolved from
// real prior correspondence with the recipient. This replaces the old private, UNSCOPED profile
// loader that returned a nondeterministic row (cross-user bleed) and pasted the cold F1 outreach
// templates back verbatim (the "Warmer button produces a cold pitch" bug). Step 2b of the rebuild.
import Anthropic from '@anthropic-ai/sdk'
import { resolveVoiceContext, userIdForSender, REGISTER_GUIDANCE } from './lib/resolve-voice-context.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { prompt, body, recipientEmail, senderEmail } = req.body || {}
  if (!body) return res.status(400).json({ error: 'Missing body' })

  // Voice is keyed on the sender (the email goes out as them). Resolve register + the sender's
  // forbidden phrases from real correspondence with this recipient. Never imposes a campaign voice.
  const userId = userIdForSender(senderEmail)
  const voiceCtx = await resolveVoiceContext({ userId, recipientEmail })
  const register = voiceCtx?.register || 'cold'
  const forbiddenList = voiceCtx?.traits?.forbidden_phrases || []
  const avoid = forbiddenList.length
    ? `\n\nAvoid these phrases entirely (they read as filler or AI-generated): ${forbiddenList.join(', ')}.`
    : ''

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6', // Sonnet — email quality
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are adjusting the TONE of an existing email. Apply ONLY the change requested below; otherwise leave the email as it is.\n\n${REGISTER_GUIDANCE[register] || REGISTER_GUIDANCE.cold}\n\nHard rules:\n- Preserve the email's meaning, intent, and approximate length. A one-line note stays a one-line note.\n- Do NOT add new arguments, offers, pitches, calls to action, or "category / participation / strategic positioning" framing that is not already in the email.\n- Do NOT turn a short personal message into a formal pitch.${avoid}\n\nCHANGE REQUESTED: ${prompt || 'Make this email body shorter.'}\n\nOutput ONLY the rewritten email body paragraphs. No subject line, no greeting, no sign-off, no name, no analysis, no commentary. Just the body:\n\n${body}`
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
