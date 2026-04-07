// api/cron-email-voice-learning.js — reads Sunny's Gmail Sent folder, learns his voice
// Runs weekly Sunday. Analyses last 50 sent emails (excluding promotional/auto-replies),
// extracts voice patterns via Sonnet, writes email_voice_profile JSONB to kiko_user_config.

import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
  }
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return Buffer.from(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
    for (const part of payload.parts) { const n = extractBody(part); if (n) return n; }
  }
  return '';
}

async function learnForUser(userId, email, token) {
  // Fetch last 100 sent messages to filter down to ~50 usable ones
  const searchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent -category:promotions -category:social&maxResults=100', { headers: { Authorization: `Bearer ${token}` } });
  const searchData = await searchRes.json();
  const ids = (searchData.messages || []).map(m => m.id);
  if (!ids.length) return { ok: false, error: 'no sent emails' };

  // Get already-analysed ids
  const existing = await sbFetch(`kiko_sent_email_analysis?user_id=eq.${userId}&select=gmail_message_id&limit=500`);
  const analysed = new Set((existing || []).map(r => r.gmail_message_id));

  const fresh = ids.filter(id => !analysed.has(id)).slice(0, 50);
  if (!fresh.length && analysed.size < 20) return { ok: false, error: 'no fresh emails and insufficient history' };

  const emails = [];
  for (const id of fresh.slice(0, 40)) {
    try {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const to = (headers.find(h => h.name === 'To') || {}).value || '';
      const subject = (headers.find(h => h.name === 'Subject') || {}).value || '';
      const dateHeader = (headers.find(h => h.name === 'Date') || {}).value || '';
      const body = extractBody(msg.payload);
      const isReply = /^re:/i.test(subject);
      if (!body || body.length < 40) continue;
      // Strip quoted reply content
      const clean = body.split('\n').filter(l => !l.trim().startsWith('>') && !l.match(/^On .+ wrote:$/)).join('\n').trim();
      if (clean.length < 40) continue;
      const wordCount = clean.split(/\s+/).length;
      emails.push({ id, to, subject, body: clean.slice(0, 1500), isReply, wordCount, sentAt: dateHeader });
      // Record that we've seen this email
      try {
        await sbFetch('kiko_sent_email_analysis', {
          method: 'POST',
          body: JSON.stringify({ user_id: userId, gmail_message_id: id, thread_id: msg.threadId, recipient_email: to.slice(0, 200), subject: subject.slice(0, 200), body_excerpt: clean.slice(0, 500), is_reply: isReply, word_count: wordCount, sent_at: dateHeader ? new Date(dateHeader).toISOString() : null }),
        });
      } catch {}
    } catch {}
  }

  if (!emails.length) return { ok: false, error: 'could not extract any email bodies' };

  // Build voice profile via Sonnet
  const prompt = `You are analysing Sunny Sidhu's real sent emails to build a voice profile that another AI will use to draft emails in his exact style.

Analyse these ${emails.length} real emails he has sent:

${emails.map((e, i) => `[${i + 1}] To: ${e.to}\nSubject: ${e.subject}\nReply: ${e.isReply ? 'yes' : 'no'}\n---\n${e.body}\n---`).join('\n\n')}

Extract his voice profile and return ONLY valid JSON in this exact shape:
{
  "formality": "formal|semi-formal|casual|mixed",
  "tone": "direct|warm|terse|authoritative|diplomatic|mixed",
  "avg_length": "brief|medium|detailed",
  "sentence_structure": "one-line description of typical sentence pattern",
  "opening_patterns": ["3-5 real opening phrases he uses"],
  "closing_patterns": ["3-5 real closing phrases he uses"],
  "signature_style": "brief description of how he signs off",
  "preferred_phrases": ["8-12 phrases/words he uses often"],
  "forbidden_phrases": ["phrases he NEVER uses that AI drafts often include, e.g. 'hope you're well', 'circle back', 'I think', 'maybe', 'hopefully'"],
  "punctuation_style": "brief note on em-dashes, semicolons, etc",
  "paragraph_rhythm": "brief note on how paragraphs flow",
  "key_themes": ["5-8 recurring business topics in his sent emails"],
  "relationship_awareness": "brief note on how tone changes between cold prospects vs warm contacts"
}

Be specific. Use REAL observations from the emails above, not generic templates. If he uses a specific phrase repeatedly, include it verbatim.`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = res.content[0]?.text || '{}';
  let profile = {};
  try { profile = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { return { ok: false, error: 'could not parse voice profile JSON' }; }

  // Save to user config
  try {
    await sbFetch(`kiko_user_config?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ email_voice_profile: profile, voice_last_learned: new Date().toISOString(), sent_emails_analyzed: (analysed.size + emails.length) }),
    });
  } catch (err) {
    return { ok: false, error: `save failed: ${err.message}` };
  }

  return { ok: true, analysed: emails.length, totalKnown: analysed.size + emails.length, formality: profile.formality, tone: profile.tone };
}

export default async function handler(req, res) {
  const hbStart = Date.now();
  const hbId = await cronHeartbeat('cron-email-voice-learning', 'started');
  const results = [];
  try {
    const users = await getActiveUsers();
    for (const u of users) {
      try {
        const token = await getGoogleToken(u.email);
        if (!token) { results.push({ user: u.email, ok: false, error: 'no token' }); continue; }
        const r = await learnForUser(u.user_id, u.email, token);
        results.push({ user: u.email, ...r });
      } catch (e) {
        results.push({ user: u.email, ok: false, error: e.message });
      }
    }
    await cronHeartbeat('cron-email-voice-learning', 'finished', { heartbeatId: hbId, durationMs: Date.now() - hbStart, recordsProcessed: results.length });
    return res.status(200).json({ ok: true, users: results });
  } catch (err) {
    await logError('cron:email-voice-learning', err.message);
    await cronHeartbeat('cron-email-voice-learning', 'error', { heartbeatId: hbId, errorMessage: err.message });
    return res.status(200).json({ ok: false, error: err.message });
  }
}
