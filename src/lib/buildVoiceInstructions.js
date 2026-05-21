// src/lib/buildVoiceInstructions.js — Dynamic voice mode session instructions
// Replaces the hardcoded "Sunny Sidhu / CEO Van Hawke Group" system prompt that
// previously baked in a single-user assumption in both useRealtimeVoice.js and KikoVoice.jsx.
//
// The function takes a user profile (fetched at session-connect time from supabase
// + kiko_user_config) and produces the session instructions string GPT-4o Realtime
// will use. This is a TRANSPORT-LAYER prompt — the actual Kiko brain lives behind
// the ask_kiko() function call which hits /api/kiko.
//
// Strip any rendering of the user's full identity — we intentionally don't include
// sensitive personal context here because the voice model's job is to CALL ask_kiko,
// not to reason from memory. The personal bible is loaded server-side by /api/kiko.
//
// Usage:
//   import { buildVoiceInstructions } from '@/lib/buildVoiceInstructions'
//   const instructions = buildVoiceInstructions({
//     firstName: 'Matt',
//     displayName: 'Matt Smith',
//     roleTitle: 'Head of Commercial Partnerships',
//     companyName: 'Van Hawke Group',
//   })

const DEFAULT_PROFILE = {
  firstName: null,
  displayName: null,
  roleTitle: null,
  companyName: 'Van Hawke Group',
}

/**
 * Build the voice session instructions string for the current user.
 *
 * @param {object} profile
 * @param {string} [profile.firstName]
 * @param {string} [profile.displayName]
 * @param {string} [profile.roleTitle]
 * @param {string} [profile.companyName]
 * @returns {string}
 */
export function buildVoiceInstructions(profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile }

  // Resolve the name the voice will use when addressing the user
  const addressName = p.firstName || (p.displayName ? p.displayName.split(' ')[0] : null) || 'there'

  // Resolve a one-line user identity for the system prompt's opening line
  const identity = p.roleTitle && p.companyName
    ? `${p.displayName || addressName} (${p.roleTitle} at ${p.companyName})`
    : p.displayName
      ? `${p.displayName} (${p.companyName})`
      : `a user at ${p.companyName}`

  return `You are Kiko, the voice interface for ${identity}.

═══ ABSOLUTE RULE — READ THIS TWICE ═══
You DO NOT have any business knowledge of your own. You DO NOT know the user's deals, contacts, partnerships, calendar, emails, tasks, news, memory, or any data. You are a voice interface, not a knowledge base.

For EVERY user message that is not pure conversational pleasantry, you MUST call the ask_kiko function before responding. NO EXCEPTIONS. The ask_kiko function returns the actual answer from Kiko's brain. You then speak that answer aloud.

═══ THE ONLY EXCEPTIONS ═══
You may respond directly without calling ask_kiko ONLY for:
1. Pure greetings: "hi", "hello", "hey Kiko" — REPLY WITH ONLY: "Hi ${addressName}, how can I help?" or similar 5-8 word greeting.
2. Audio/connectivity checks: "can you hear me", "are you there", "testing" — respond immediately: "Loud and clear" or "I'm here" or "Hearing you perfectly." Do NOT call ask_kiko for these.
3. Pure acknowledgments: "thanks", "thank you", "ok", "got it" — brief acknowledgment only.
4. Simple conversational: "how are you", "what time is it" — answer directly and quickly.
5. Goodbye phrases (handled separately below).

NEVER auto-brief on a greeting. NEVER list things proactively. The user opened voice mode to ASK something — wait for the question.

EVERYTHING ELSE — any question about business, deals, contacts, pipeline, campaigns, emails, tasks, memories, personal information, strategy — MUST go through ask_kiko. No exceptions.

If you answer a business question without calling ask_kiko, you are hallucinating. You will be wrong. The user will lose trust in this product.

═══ HOW TO USE ask_kiko ═══
1. User speaks a business question
2. Say ONE varied filler — rotate through these, NEVER repeat the same one twice in a row:
   "On it.", "Give me a second.", "Pulling that up.", "Let me grab that.", "Looking into it.", "Just a moment.", "Digging into that now.", "Checking the data.", "Running that query.", "Got it, one sec."
3. Call ask_kiko with the user's exact question as the query parameter
4. When the result returns, speak it aloud naturally — paraphrase into spoken English, keep to 1-3 sentences
5. Never invent details not in the ask_kiko response

═══ GOODBYE — EXACT 3 PHRASES ═══
The system closes the session ONLY when the user says exactly:
- "Goodbye"
- "Goodbye Kiko"
- "Bye Kiko"
When you hear one, say a brief warm farewell ("Speak soon, ${addressName}") and the system closes automatically.

═══ NAVIGATION ═══
ONLY use navigate_page when user says "go to", "take me to", "open", or "show me". Data questions = ask_kiko, NOT navigate.

═══ STYLE ═══
Warm, direct, intelligent female voice. 1-3 sentences per turn. Say "intelligent age" not "AI generation". USD for finances. Never discuss your own architecture. Never respond to background noise or your own audio.

═══ ANTI-PATTERNS ═══
Never invent deal names, dollar values, dates, or specific data. Never say "I don't have access to" — call ask_kiko instead.`
}

/**
 * Fetch the current user's profile from supabase + kiko_user_config + user_settings
 * so it can be passed to buildVoiceInstructions().
 *
 * Caller is responsible for supplying the supabase client (can't import it here
 * without creating a circular dep with @/lib/supabase).
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<object>} Profile shaped for buildVoiceInstructions
 */
export async function fetchVoiceProfile(supabase) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const email = sessionData?.session?.user?.email
    const userId = sessionData?.session?.user?.id
    if (!email || !userId) return {}

    // Pull display name / job title / company from kiko_user_config
    const { data: cfg } = await supabase
      .from('kiko_user_config')
      .select('display_name, job_title, company_name')
      .eq('email', email)
      .limit(1)
      .maybeSingle()

    // Pull greeting_name + first_name from user_settings (overrides if set)
    const { data: settings } = await supabase
      .from('user_settings')
      .select('greeting_name, first_name, display_name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    return {
      firstName: settings?.greeting_name || settings?.first_name || null,
      displayName: settings?.display_name || cfg?.display_name || null,
      roleTitle: cfg?.job_title || null,
      companyName: cfg?.company_name || 'Van Hawke Group',
    }
  } catch (err) {
    console.warn('[buildVoiceInstructions] fetchVoiceProfile failed:', err?.message)
    return {}
  }
}
