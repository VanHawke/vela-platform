// api/capture-correction.js — PersonaMail-style correction capture
// When user edits an AI draft, this extracts patterns and stores them
import Anthropic from '@anthropic-ai/sdk'
import { sbFetch } from './kiko-tools.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { original, edited, recipient, subject, userId } = req.body || {}
  if (!original || !edited) return res.status(400).json({ error: 'Missing original or edited' })
  if (original.trim() === edited.trim()) return res.status(200).json({ ok: true, message: 'No changes detected' })

  try {
    // Use Haiku to extract correction patterns (fast + cheap)
    const analysis = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
      user_id: userId || null,
      original_body: original,
      edited_body: edited,
      recipient_email: recipient || null,
      recipient_name: null,
      subject: subject || null,
      correction_type: patterns.tone_shift || 'unknown',
      patterns_extracted: patterns,
    }) })

    // Auto-update voice profile: add removed phrases to forbidden list
    if (patterns.removed_phrases?.length > 0) {
      try {
        const cfg = await sbFetch('kiko_user_config?select=email_voice_profile&limit=1')
        if (cfg?.[0]?.email_voice_profile) {
          const profile = cfg[0].email_voice_profile
          const existing = profile.forbidden_phrases || []
          const newForbidden = [...new Set([...existing, ...patterns.removed_phrases])]
          profile.forbidden_phrases = newForbidden
          await sbFetch('kiko_user_config?limit=1', { method: 'PATCH', body: JSON.stringify({
            email_voice_profile: profile
          }) })
          console.log(`[Correction] Added ${patterns.removed_phrases.length} phrases to forbidden list: ${patterns.removed_phrases.join(', ')}`)
        }
      } catch (e) { console.error('[Correction] Voice profile update failed:', e.message) }
    }

    return res.status(200).json({ ok: true, patterns })
  } catch (e) {
    console.error('[capture-correction] Error:', e)
    return res.status(500).json({ error: e.message })
  }
}
