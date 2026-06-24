// api/capture-correction.js — PersonaMail-style correction capture
// When user edits an AI draft, this extracts patterns and stores them
import Anthropic from '@anthropic-ai/sdk'
import { sbFetch } from './kiko-tools.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

// Strict sender -> user_id via kiko_user_config (the source of truth). FAIL-CLOSED: an unknown or
// missing sender resolves to null and therefore never writes to anyone's profile. Voice is keyed on
// the SENDER (the draft goes out as them), the same model the draft + rewrite paths use. Resolves the
// .com/.agency pair so either address form finds the same user.
async function resolveUserIdByEmail(email) {
  if (!email || typeof email !== 'string') return null
  const e = email.trim().toLowerCase()
  const variants = e.endsWith('@vanhawke.com') ? [e, e.replace('@vanhawke.com', '@vanhawke.agency')]
    : e.endsWith('@vanhawke.agency') ? [e, e.replace('@vanhawke.agency', '@vanhawke.com')]
    : [e]
  for (const v of variants) {
    try {
      const rows = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(v)}&select=user_id&limit=1`)
      if (rows?.[0]?.user_id) return rows[0].user_id
    } catch {}
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { original, edited, recipient, subject, senderEmail } = req.body || {}
  if (!original || !edited) return res.status(400).json({ error: 'Missing original or edited' })
  if (original.trim() === edited.trim()) return res.status(200).json({ ok: true, message: 'No changes detected' })

  // Resolve the sender to a real user once. Used for BOTH the stored correction and any profile write.
  // We deliberately do NOT trust a client-supplied user_id — the write target comes from the sender.
  const resolvedUserId = await resolveUserIdByEmail(senderEmail)

  try {
    // Use Haiku to extract correction patterns (fast + cheap)
    const analysis = await client.messages.create({
      model: 'claude-opus-4-8', // OPUS — correction detection drives self-improvement
      max_tokens: 512,
      messages: [{ role: 'user', content: `Analyze the difference between an AI-generated email draft and the user's edited version. Extract correction patterns.

ORIGINAL (AI wrote this):
${original}

EDITED (user changed it to this):
${edited}

Return ONLY valid JSON with these fields:
{
  "removed_phrases": ["phrases the user deleted"],
  "added_phrases": ["phrases the user added"],
  "tone_shift": "more_direct|warmer|shorter|more_formal|more_casual|no_change",
  "structural_changes": "description of any structural changes",
  "key_correction": "one-sentence summary of the main correction pattern"
}` }]
    })

    let patterns = {}
    try {
      patterns = JSON.parse((analysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim())
    } catch { patterns = { key_correction: 'Could not parse patterns' } }

    // Store the correction
    await sbFetch('kiko_email_corrections', { method: 'POST', body: JSON.stringify({
      user_id: resolvedUserId,
      original_body: original,
      edited_body: edited,
      recipient_email: recipient || null,
      recipient_name: null,
      subject: subject || null,
      correction_type: patterns.tone_shift || 'unknown',
      patterns_extracted: patterns,
    }) })

    // Auto-update voice profile: add the phrases the user DELETED to their forbidden list.
    // SCOPED to the resolved sender's own populated profile row, and written to base.forbidden_phrases
    // so the ban applies across ALL registers (mergeTraits unions base ∪ register). FAIL-CLOSED: with
    // no resolved user there is no write, so a correction can never edit another user's profile
    // (Matt's edit can never touch Sunny's voice, and vice versa).
    if (resolvedUserId && patterns.removed_phrases?.length > 0) {
      try {
        const rows = await sbFetch(`kiko_user_config?user_id=eq.${resolvedUserId}&select=email,email_voice_profile,voice_last_learned&order=voice_last_learned.desc.nullslast&limit=1`)
        const row = rows?.[0]
        if (row?.email_voice_profile && Object.keys(row.email_voice_profile).length > 0) {
          const profile = row.email_voice_profile
          if (profile.registers && typeof profile.registers === 'object') {
            // {base, registers} shape — ban lives in base so every register inherits it.
            profile.base = profile.base || {}
            profile.base.forbidden_phrases = [...new Set([...(profile.base.forbidden_phrases || []), ...patterns.removed_phrases])]
          } else {
            // Legacy flat profile — backward-compatible.
            profile.forbidden_phrases = [...new Set([...(profile.forbidden_phrases || []), ...patterns.removed_phrases])]
          }
          await sbFetch(`kiko_user_config?user_id=eq.${resolvedUserId}&email=eq.${encodeURIComponent(row.email)}`, {
            method: 'PATCH', body: JSON.stringify({ email_voice_profile: profile })
          })
          console.log(`[Correction] user ${resolvedUserId}: +${patterns.removed_phrases.length} forbidden (base.forbidden_phrases): ${patterns.removed_phrases.join(', ')}`)
        }
      } catch (e) { console.error('[Correction] Voice profile update failed:', e.message) }
    } else if (!resolvedUserId && patterns.removed_phrases?.length > 0) {
      console.warn('[Correction] Unknown/missing senderEmail — correction stored but profile NOT updated (fail-closed)')
    }

    return res.status(200).json({ ok: true, patterns })
  } catch (e) {
    console.error('[capture-correction] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
