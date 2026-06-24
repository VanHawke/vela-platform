// api/rewrite-email.js — Tone-refine for the EmailDraft composer (Warmer / Sharper / Shorter).
// Per-user, relationship-aware: the register and the voice traits are the SENDER's, resolved from
// real prior correspondence with the recipient. This replaces the old private, UNSCOPED profile
// loader that returned a nondeterministic row (cross-user bleed) and pasted the cold F1 outreach
// templates back verbatim (the "Warmer button produces a cold pitch" bug). Step 2b of the rebuild.
import Anthropic from '@anthropic-ai/sdk'
import { resolveVoiceContext, userIdForSender, REGISTER_GUIDANCE } from './lib/resolve-voice-context.js'
import { enforceHouseStyle } from './lib/email-format.js'

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
  // Step 4 — register-conditioned behavioural framing (subordinate to the requested change; precedence
  // is stated in the prompt). The lens text itself ends with the hard-guard subordination clause.
  const lens = voiceCtx?.behaviouralLens || ''
  // Sender's preferred phrasings: additive-optional, gated on BOTH the requested change AND the
  // register (never inserted mechanically). openings/closings are excluded — rewrite returns body only.
  const preferred = voiceCtx?.traits?.preferred_phrases || []
  const preferredLine = preferred.length
    ? `\n\nYou MAY echo these of the sender's own phrasings ONLY where they fit both the requested change and this relationship, never inserted to add content: ${preferred.slice(0, 6).join(', ')}.`
    : ''

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6', // Sonnet — email quality
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are adjusting the TONE of an existing email. Apply ONLY the change requested below; otherwise leave the email as it is.\n\n${REGISTER_GUIDANCE[register] || REGISTER_GUIDANCE.cold}${lens ? ' ' + lens : ''}${preferredLine}\n\nPRECEDENCE (resolve any conflict in this order): the CHANGE REQUESTED is supreme and overrides everything below it; then the relationship and behavioural framing; then the optional preferred phrasing. If the requested change pulls against the framing or a preferred phrase, the requested change wins.\n\nHard rules:\n- Preserve the email's meaning, intent, and approximate length. A one-line note stays a one-line note.\n- Unless the requested change is explicitly to shorten or cut, keep every stated fact, number, named offer, and specific ask as written; warming or sharpening the tone never licenses dropping, generalising, or rewording a claim.\n- Do NOT add new arguments, offers, pitches, calls to action, or "category / participation / strategic positioning" framing that is not already in the email.\n- Do NOT turn a short personal message into a formal pitch.\n- Never use em-dashes or en-dashes.${avoid}\n\nCHANGE REQUESTED: ${prompt || 'Make this email body shorter.'}\n\nOutput ONLY the rewritten email body paragraphs. No subject line, no greeting, no sign-off, no name, no analysis, no commentary. Just the body:\n\n${body}`
      }]
    })
    // Deterministic guard runs LAST on this path too (Kiko Step-4 lock): strip markdown/greeting/
    // sign-off/name, then enforceHouseStyle (em/en dashes -> commas, strip any name placeholder).
    const rewritten = enforceHouseStyle(
      (message.content[0]?.text || '')
        .replace(/\*\*/g, '')
        .replace(/^Dear\s+\w+,?\s*/i, '')
        .replace(/(Best regards|Kind regards|Regards|Sincerely|Cheers|Warm regards),?\s*/gi, '')
        .replace(/Sunny\s*Sidhu/gi, '')
        .replace(/Van\s*Hawke[^\n]*/gi, '')
        .trim()
    )
    return res.status(200).json({ success: true, body: rewritten })
  } catch (e) {
    console.error('[rewrite-email] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
