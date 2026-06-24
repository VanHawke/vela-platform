// api/lib/resolve-voice-context.js
//
// Slice 2a of the dynamic, per-user, relationship-aware voice system.
//
// PURE resolver. Given an operator (userId) and a recipient email, it classifies the
// relationship REGISTER from the operator's REAL prior correspondence in
// kiko_email_tracking, and returns enough context for a caller to ground a draft
// WITHOUT imposing a single templated voice:
//
//   { register: 'warm' | 'peer' | 'cold',
//     signal:   'reply' | 'personal_thread' | 'none',
//     priorBodies: [ { subject, sent, theirReply, sentAt, repliedAt } ],  // 0-3, personal only
//     traits:   <operator voice profile or null>,   // from shared loadVoiceProfile
//     behaviouralLens: '' }                          // Step 4 fills this (register-conditioned)
//
// Register rules, grounded in the columns kiko_email_tracking actually has:
//   warm  — a reply was received from this recipient on a personal-source thread.
//   peer  — personal correspondence exists to this recipient but no reply on record.
//   cold  — only campaign blasts, or no history at all. THIS IS THE DEFAULT, and it
//           means "register-neutral professional", NOT the campaign category-pitch.
//
// No side effects, no callers yet — built to be verified against real data before
// 2b wires it into the draft + rewrite paths.

import { loadVoiceProfile, mergeTraits } from './email-format.js';

const PERSONAL_SOURCES = ['gmail', 'gmail_sync', 'direct_send'];

// Register → drafting guidance. Routing only (Step 2b); the behavioural-science layer is Step 4.
// cold is deliberately NEUTRAL-PROFESSIONAL, never the campaign "category ownership" pitch.
export const REGISTER_GUIDANCE = {
  warm: 'This is a warm contact the sender already has a real relationship with (prior correspondence and replies on record). Keep it warm, personal and relaxed.',
  peer: 'This is a professional peer the sender has corresponded with before. Keep it collegial, direct and respectful.',
  cold: 'This is a new or cold contact with no prior relationship on record. Keep it professionally neutral and courteous. Do NOT use sales-pitch, "category ownership", or "participation" framing.',
};

// Step 4 — register-conditioned behavioural framing. This SHAPES how the already-written content is
// phrased, emphasised and ordered; it never adds content. It is strictly subordinate to the hard
// guards, which is why every block ends with the same literal subordination clause (a model obeys the
// instruction in front of it more reliably than a global rule). cold's lens is deliberately SUBTRACTIVE
// — a brevity-and-relevance constraint, not a persuasion technique — because "no guidance" defaults the
// model to its own generic-salesy register, and cold is exactly where the old cold-pitch bug lived.
// Consumed via the behaviouralLens field by BOTH alignBodyVoice and rewrite-email (one source, no drift).
const LENS_GUARD = ' Frame and emphasise only what is already written. Add no argument, claim, CTA, or category framing. Alter no stated fact.';
export const BEHAVIOURAL_LENS = {
  warm: 'BEHAVIOURAL FRAMING: Lean on the relationship that already exists between the sender and this recipient. Let warmth and shared history carry the message. Reference only history already present in the body, keep the ask low-stakes and mutual, and let familiarity stand in for formality.' + LENS_GUARD,
  peer: 'BEHAVIOURAL FRAMING: Address the recipient as a respected equal. Be concrete and direct, do not over-explain or justify, and assume competence. Make the next step that is already in the body easy to act on.' + LENS_GUARD,
  cold: 'BEHAVIOURAL FRAMING (this is a constraint, not a pitch): Lead with the single most relevant point already in the body. Add no relationship language, urgency, scarcity, or flattery of your own. Prefer brevity, but apply it only to framing: you may drop a whole sentence of pure throat-clearing, never drop or generalise a stated fact, number, named offer, or specific ask.' + LENS_GUARD,
};

// The two operators. Voice is keyed on the SENDER (the email goes out as them), so a caller that only
// knows the sender address resolves the operator's user_id through here. Mirrors the tracking backfill.
const SENDER_TO_USER = {
  'sunny@vanhawke.agency': '9f486437-4bf5-4111-abfe-fe19bfa76063',
  'sunny@vanhawke.com': '9f486437-4bf5-4111-abfe-fe19bfa76063',
  'matt.smith@vanhawke.agency': 'f1cb67ee-2917-44a3-affe-e8779ede3851',
  'matt.smith@vanhawke.com': 'f1cb67ee-2917-44a3-affe-e8779ede3851',
};
export function userIdForSender(email) {
  return SENDER_TO_USER[(email || '').trim().toLowerCase()] || '9f486437-4bf5-4111-abfe-fe19bfa76063';
}

// Self-contained Supabase REST GET (keeps this module standalone / importable in isolation).
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const sbGet = async (path) => {
  try {
    const res = await fetch(`${SB()}/rest/v1/${path}`, {
      headers: { apikey: SK(), Authorization: `Bearer ${SK()}` },
    });
    const text = await res.text();
    if (!text || !text.trim()) return [];
    return JSON.parse(text);
  } catch { return []; }
};

// Merge of base + active register (forbidden unionised) lives in email-format.js as `mergeTraits`,
// the single definition shared with voiceProfileToPrompt. Imported above.

export async function resolveVoiceContext({ userId, recipientEmail } = {}) {
  const out = {
    register: 'cold',
    signal: 'none',
    priorBodies: [],
    traits: null,
    behaviouralLens: '',
  };

  // Load the operator's raw profile (user-scoped); traits are resolved against the register below.
  let profile = null;
  try { profile = await loadVoiceProfile(sbGet, userId); } catch {}

  const email = (recipientEmail || '').trim();
  if (!email) { out.traits = mergeTraits(profile, out.register); out.behaviouralLens = BEHAVIOURAL_LENS[out.register]; return out; }

  const uf = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : '';
  const rows = await sbGet(
    `kiko_email_tracking?recipient_email=ilike.${encodeURIComponent(email)}${uf}` +
    `&source=in.(gmail,gmail_sync,direct_send)` +  // personal-only at the SQL level: campaign text physically cannot reach priorBodies
    `&select=source,subject,snippet,reply_snippet,sent_at,replied_at&order=sent_at.desc&limit=25`
  );
  if (!Array.isArray(rows) || rows.length === 0) { out.traits = mergeTraits(profile, out.register); out.behaviouralLens = BEHAVIOURAL_LENS[out.register]; return out; }

  const personal = rows.filter(r => PERSONAL_SOURCES.includes((r.source || '').toLowerCase()));
  const replied = personal.filter(r => r.replied_at);

  if (replied.length > 0) { out.register = 'warm'; out.signal = 'reply'; }
  else if (personal.length > 0) { out.register = 'peer'; out.signal = 'personal_thread'; }
  // else: cold default (campaign-only or nothing) — register-neutral, never the campaign pitch.

  // Ground only in REAL personal exchanges (never campaign), newest first, max 3.
  out.priorBodies = personal.slice(0, 3).map(r => ({
    subject: r.subject || '',
    sent: r.snippet || '',
    theirReply: r.reply_snippet || '',
    sentAt: r.sent_at || null,
    repliedAt: r.replied_at || null,
  }));

  out.traits = mergeTraits(profile, out.register);
  out.behaviouralLens = BEHAVIOURAL_LENS[out.register];
  return out;
}

export default resolveVoiceContext;
