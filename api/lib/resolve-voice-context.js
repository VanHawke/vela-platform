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

import { loadVoiceProfile } from './email-format.js';

const PERSONAL_SOURCES = ['gmail', 'gmail_sync', 'direct_send'];

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

export async function resolveVoiceContext({ userId, recipientEmail } = {}) {
  const out = {
    register: 'cold',
    signal: 'none',
    priorBodies: [],
    traits: null,
    behaviouralLens: '',
  };

  // Operator voice traits, user-scoped. Used for forbidden_phrases / mechanics only,
  // NOT to impose a voice. Tolerates userId being absent.
  try { out.traits = await loadVoiceProfile(sbGet, userId); } catch {}

  const email = (recipientEmail || '').trim();
  if (!email) return out;

  const uf = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : '';
  const rows = await sbGet(
    `kiko_email_tracking?recipient_email=ilike.${encodeURIComponent(email)}${uf}` +
    `&select=source,subject,snippet,reply_snippet,sent_at,replied_at&order=sent_at.desc&limit=25`
  );
  if (!Array.isArray(rows) || rows.length === 0) return out;

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

  return out;
}

export default resolveVoiceContext;
