// relearn-voice.cjs — Step 3 of the dynamic voice system. Triggered manually, NEVER a cron.
//
// Re-learns each operator's voice into the {base, registers:{warm,peer,cold}} shape (Kiko's lock):
//   base            — register-invariant mechanics, EXTRACTED from the existing flat profile
//   registers.peer  — LEARNED from real sent emails to peer contacts (Gmail), sampled + stripped
//   registers.warm  — a light AUTHORED bend off peer (warmer, less formal); NOT statistically learned
//                     (warm data is too thin); real warmth comes from draft-time thread-grounding
//   registers.cold  — authored NEUTRAL-PROFESSIONAL default; NEVER the campaign pitch
//   relationship_awareness — dropped (a flat-profile artefact)
//
// DRY RUN by default: prints the composed shape per operator, writes NOTHING. Set WRITE=1 to persist.
// Failsafe (consolidate-memory pattern): lockfile, cost printed before any API call, per-operator.

require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const ai = new Anthropic.Anthropic ? new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_KEY }) : new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const log = (m) => console.log('[relearn-voice] ' + m);

const LOCK = '/home/kiko/relearn-voice.lock';
const WRITE = process.env.WRITE === '1';
const PEER_CAP = 40; // sent bodies per operator for the peer register

const OPERATORS = [
  { name: 'Sunny', userId: '9f486437-4bf5-4111-abfe-fe19bfa76063', email: 'sunny@vanhawke.agency' },
  { name: 'Matt',  userId: 'f1cb67ee-2917-44a3-affe-e8779ede3851', email: 'matt.smith@vanhawke.agency' },
];

const BASE_FIELDS = ['forbidden_phrases', 'punctuation_style', 'signature_style', 'sentence_structure', 'paragraph_rhythm', 'avg_length'];

// House style overrides observed usage on punctuation (Sunny's firm rule), applied to outbound drafts.
const HOUSE_PUNCT = 'HOUSE RULE (overrides any observed usage): never use em-dashes or en-dashes; use commas, full stops, or restructure instead. No Oxford comma before "and".';

// Authored cold-PERSONAL register: a measured first note to a stranger. NEVER the campaign pitch.
const COLD_REGISTER = {
  tone: 'measured, neutral, professional',
  formality: 'formal',
  opening_patterns: ['A direct, courteous opening that states the reason for writing without preamble or flattery.'],
  closing_patterns: ['A brief professional close that leaves the next step open without applying pressure.'],
  preferred_phrases: [],
};

function extractBase(profile) {
  const base = {};
  for (const f of BASE_FIELDS) if (profile && profile[f] != null) base[f] = profile[f];
  return base;
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return Buffer.from(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    for (const part of payload.parts) { const n = extractBody(part); if (n) return n; }
  }
  return '';
}

// Strip quoted history and signature so the model only sees what the operator actually wrote.
function stripBody(raw) {
  if (!raw) return '';
  let lines = raw.split('\n');
  const cut = lines.findIndex(l => /^On .+wrote:$/.test(l.trim()) || l.trim().startsWith('>') || /^-{2,}\s*Original Message/i.test(l) || /^From:\s/.test(l) || /^Sent from my /i.test(l));
  if (cut > 0) lines = lines.slice(0, cut);
  const sig = lines.findIndex(l => l.trim() === '--' || l.trim() === '—' || /^Van Hawke/i.test(l.trim()));
  if (sig > 0) lines = lines.slice(0, sig);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 800);
}

async function getPeerContacts(userId) {
  const { data } = await sb.from('kiko_email_tracking')
    .select('recipient_email, replied_at')
    .eq('user_id', userId)
    .in('source', ['gmail', 'gmail_sync', 'direct_send'])
    .limit(3000);
  const byContact = {};
  for (const r of (data || [])) {
    const e = (r.recipient_email || '').toLowerCase().trim(); if (!e) continue;
    if (!byContact[e]) byContact[e] = false;
    if (r.replied_at) byContact[e] = true; // replied => warm, exclude from peer
  }
  return Object.keys(byContact).filter(e => !byContact[e]); // peer = personal contact, no reply
}

async function fetchPeerBodies(opEmail, contacts, cap) {
  const { getGoogleToken } = await import('./api/google-token.js');
  const token = await getGoogleToken(opEmail);
  const shuffled = contacts.sort(() => Math.random() - 0.5);
  const bodies = [];
  for (const contact of shuffled) {
    if (bodies.length >= cap) break;
    try {
      const sr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('in:sent to:' + contact)}&maxResults=2`, { headers: { Authorization: `Bearer ${token}` } });
      const sd = await sr.json();
      for (const m of (sd.messages || []).slice(0, 2)) {
        if (bodies.length >= cap) break;
        const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        const msg = await mr.json();
        const body = stripBody(extractBody(msg.payload));
        if (body && body.length > 40) bodies.push(body);
      }
    } catch {}
  }
  return bodies;
}

async function learnRegisters(name, bodies) {
  const prompt = `These are ${bodies.length} real emails ${name} SENT to professional contacts they have an ongoing working relationship with. Learn their actual voice — generalise patterns, never fabricate a voice they do not show, and never introduce sponsorship/"category ownership" pitch language.

Return ONLY valid JSON, no prose:
{
  "peer": {
    "tone": "short description of their tone to known professional contacts",
    "formality": "formal|semi-formal|casual",
    "opening_patterns": ["3-5 generalised ways they OPEN (not verbatim quotes)"],
    "closing_patterns": ["3-5 generalised ways they CLOSE"],
    "preferred_phrases": ["distinctive words/phrases they genuinely use"]
  },
  "warm": {
    "tone": "a warmer version of the peer tone",
    "formality": "one notch less formal than peer",
    "opening_patterns": ["the peer openings made warmer; permit first-name address; DROP any reframe/'at this stage' style opener"],
    "closing_patterns": ["warmer, more direct closes; permit a personal sign-off"],
    "preferred_phrases": ["the peer phrases that still fit a warm, personal note"]
  }
}

Emails:

${bodies.map((b, i) => `[${i + 1}]\n${b}`).join('\n\n---\n\n')}`;
  const res = await ai.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] });
  const raw = res.content[0]?.text || '{}';
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch (e) { log('JSON parse failed: ' + raw.slice(0, 200)); return null; }
}

async function main() {
  if (fs.existsSync(LOCK)) { log('lock present at ' + LOCK + ' — another run in progress, abort'); process.exit(2); }
  fs.writeFileSync(LOCK, String(Date.now()));
  try {
    log('estimated cost this run: ~$' + (OPERATORS.length * 0.05).toFixed(2) + ' (one Sonnet pass per operator)');
    log(WRITE ? 'WRITE mode — profiles WILL be persisted' : 'DRY RUN — nothing will be written (set WRITE=1 to persist)');
    for (const op of OPERATORS) {
      log('===== ' + op.name + ' =====');
      const { data: cfg } = await sb.from('kiko_user_config')
        .select('email_voice_profile').eq('user_id', op.userId).eq('email', op.email).limit(1);
      const flat = cfg?.[0]?.email_voice_profile || {};
      const base = extractBase(flat);
      base.punctuation_style = (base.punctuation_style ? base.punctuation_style + ' ' : '') + HOUSE_PUNCT;
      log('base extracted: [' + Object.keys(base).join(', ') + ']');
      const contacts = await getPeerContacts(op.userId);
      log('peer contacts: ' + contacts.length);
      const bodies = await fetchPeerBodies(op.email, contacts, PEER_CAP);
      log('sent bodies fetched + stripped: ' + bodies.length);
      if (bodies.length < 5) { log('TOO FEW bodies (<5) — skipping ' + op.name); continue; }
      const learned = await learnRegisters(op.name, bodies);
      if (!learned?.peer) { log('learn failed for ' + op.name + ' — skipping'); continue; }
      const profile = { base, registers: { warm: learned.warm || {}, peer: learned.peer, cold: COLD_REGISTER } };
      log('COMPOSED {base, registers} for ' + op.name + ':\n' + JSON.stringify(profile, null, 2));
      if (WRITE) {
        const { error } = await sb.from('kiko_user_config')
          .update({ email_voice_profile: profile, voice_last_learned: new Date().toISOString() })
          .eq('user_id', op.userId).eq('email', op.email);
        log(error ? 'WRITE ERROR: ' + error.message : 'WRITTEN to ' + op.email + ' ✓');
      }
    }
  } finally {
    try { fs.unlinkSync(LOCK); } catch {}
  }
}

main().then(() => process.exit(0)).catch(e => { log('FATAL ' + e.message); try { fs.unlinkSync(LOCK); } catch {} process.exit(1); });
