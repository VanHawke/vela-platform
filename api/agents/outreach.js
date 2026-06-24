// api/agents/outreach.js — Outreach Agent
// Email drafting, campaigns, follow-ups, recipient analysis.
// Uses voice profile learned from user's actual sent emails + global signature wrapper.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';
import { generateFollowup, getFollowupQueue } from '../kiko-followup.js';
import { wrapEmailBody, loadUserSignatures, enforceHouseStyle } from '../lib/email-format.js';
import { resolveVoiceContext, REGISTER_GUIDANCE } from '../lib/resolve-voice-context.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Polish an email body into the SENDER's own voice for the resolved register. The register voice is
// applied to TONE and PHRASING only, never to content (Kiko's Step-3 lock):
//   - openings/closings: STRUCTURAL-ONLY (guidance for if the greeting/sign-off is adjusted; never a
//     new sentence of content)
//   - preferred_phrases + punctuation: ADDITIVE-OPTIONAL ("echo where they already fit naturally")
//   - every hard guard kept verbatim (no new arguments/pitches/CTAs/category framing; preserve
//     meaning, claims and length). It is ONE generative pass, not two.
// Exported so it has a single definition the tests exercise directly (no prompt duplication).
export async function alignBodyVoice(body, voiceCtx) {
  if (!body || body.length <= 40) return body;
  const register = voiceCtx?.register || 'cold';
  const t = voiceCtx?.traits || {};
  // Step 4 — register-conditioned behavioural framing (shapes phrasing/emphasis of existing content
  // only; the lens text itself ends with the hard-guard subordination clause).
  const lens = voiceCtx?.behaviouralLens ? ` ${voiceCtx.behaviouralLens}` : '';
  const forbiddenList = t.forbidden_phrases || [];
  const forbidden = forbiddenList.length ? `\n\nAvoid these phrases entirely (filler / AI-tells): ${forbiddenList.join(', ')}.` : '';
  const vlines = [];
  if (t.tone) vlines.push(`Tone for this relationship: ${t.tone}.`);
  if (t.formality) vlines.push(`Formality: ${t.formality}.`);
  if (t.opening_patterns?.length) vlines.push(`If the email ALREADY has a greeting, you may shape it toward how the sender opens: ${t.opening_patterns.slice(0, 2).join(' / ')} (structural only). Never introduce a greeting, a recipient name, or a [First name] placeholder where none exists; if the body has no greeting, leave it without one.`);
  if (t.closing_patterns?.length) vlines.push(`If the sign-off is adjusted, they tend to close like: ${t.closing_patterns.slice(0, 2).join(' / ')} (structural only).`);
  if (t.preferred_phrases?.length) vlines.push(`You MAY echo these of the sender's own phrasings where they ALREADY fit naturally, but never insert them to add new content: ${t.preferred_phrases.slice(0, 6).join(', ')}.`);
  if (t.punctuation_style) vlines.push(`Punctuation: ${t.punctuation_style}`);
  const voiceGuidance = vlines.length ? `\n\nVOICE (apply to tone and phrasing ONLY, never to content):\n- ${vlines.join('\n- ')}` : '';
  try {
    const alignRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Lightly polish this email body so it reads in the sender's own voice for this relationship. ${REGISTER_GUIDANCE[register] || REGISTER_GUIDANCE.cold}${lens}${voiceGuidance}\n\nHARD RULES (do not break):\n- Preserve the email's meaning and approximate length. Do NOT add arguments, pitches, calls to action, or "category / participation / strategic positioning" framing that is not already present.\n- Keep every stated fact, number, name, date, amount, and commitment EXACTLY as written. Warmth and register live in the greeting, the transitions, and the sign-off, never in the facts. Do not paraphrase, soften, or re-word any claim, even to sound warmer.\n- The behavioural framing shapes emphasis and phrasing only; it NEVER licenses dropping, softening, or rewording a stated fact, number, offer, or commitment. Where the framing (for example "cut what is not load-bearing" or "no scarcity") would remove or alter a claim, keep the claim verbatim and let the framing yield.\n- The voice notes adjust tone and phrasing only. If a register opening, closing, or preferred phrase cannot be applied without adding a sentence or altering a claim, do NOT apply it.\n- Never use em-dashes or en-dashes.${forbidden}\n\nReturn ONLY the email body — no commentary, no subject line.\n\nEmail:\n${body}` }],
    });
    let rewritten = alignRes.content[0]?.text?.trim();
    if (rewritten && rewritten.length > 40) {
      // Deterministic guards run LAST (Kiko Step-4 lock; never rely on the model obeying): do not let
      // the polish SYNTHESISE a greeting where the body had none, then enforce house style (em/en
      // dashes -> commas, strip any literal name placeholder) via the shared guard.
      const GREETING = /^\s*(Dear|Hi|Hello|Hey|Greetings|Good (?:morning|afternoon|evening))\b[^\n]*\r?\n+/i;
      if (!GREETING.test(body)) rewritten = rewritten.replace(GREETING, '').trim();
      rewritten = enforceHouseStyle(rewritten);
      if (rewritten.length > 40) return rewritten;
    }
  } catch {}
  return body;
}

// ── Gmail Draft (voice-aware, signature-wrapped) ──
async function draftEmail({ to, subject, body, cc, thread_id, contact_status = 'cold' }, userEmail, userId) {
  try {
    const { getGoogleToken } = await import('../google-token.js');
    const token = await getGoogleToken(userEmail);

    // Voice + signatures. resolveVoiceContext classifies the register (warm/peer/cold) from REAL prior
    // correspondence with this recipient and returns the sender's forbidden phrases. This Gmail-draft
    // path is always INDIVIDUAL/personal (campaigns run through cron-sequence-enqueue), so cold here
    // means register-neutral professional, never the campaign "category ownership" voice. (Step 2b.)
    const [signatures, voiceCtx] = await Promise.all([
      loadUserSignatures(sbFetch, userId, token),
      resolveVoiceContext({ userId, recipientEmail: to }),
    ]);

    // Polish into the sender's voice for the resolved register (single pass; tone + phrasing only).
    const finalBody = await alignBodyVoice(body, voiceCtx);

    // Clean subject
    const cleanSubject = (subject || '')
      .replace(/[\u2014\u2013\u2015\u2012\u2010\u2011]/g, '-')
      .replace(/â€"/g, '-');

    // Wrap body with global format (Helvetica 12 + signature)
    const { html: htmlBody, text: plainBody } = wrapEmailBody(finalBody, { contactStatus: contact_status, signature: signatures.signature, coldSignature: signatures.coldSignature });

    const boundary = `b_${Date.now()}`;
    const fromAddr = userEmail.includes('vanhawke') ? userEmail.replace('vanhawke.com', 'vanhawke.agency') : userEmail;
    let mime = `To: ${to}\r\nFrom: ${fromAddr}\r\n`;
    if (cc) mime += `Cc: ${cc}\r\n`;
    if (subject) mime += `Subject: ${cleanSubject}\r\n`;
    mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${plainBody}\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody}\r\n`;
    mime += `--${boundary}--`;
    const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const draftBody = { message: { raw } };
    if (thread_id) draftBody.message.threadId = thread_id;
    const draftRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(draftBody)
    });
    const draft = await draftRes.json();
    if (!draftRes.ok) return `Failed to create draft: ${JSON.stringify(draft)}`;
    try { await sbFetch('activities', { method: 'POST', body: JSON.stringify({ type: 'email_drafted', entity_name: to, subject: subject || 'No subject', status: 'draft', metadata: { to, subject, draft_id: draft?.id, voice_applied: !!voiceCtx, contact_status } }) }); } catch {}
    try { await sbFetch('kiko_draft_tracking', { method: 'POST', body: JSON.stringify({ user_id: userId, gmail_draft_id: draft?.id, gmail_message_id: draft?.message?.id, original_content: finalBody.slice(0, 2000), recipient: to, subject: subject || '', status: 'drafted' }) }); } catch {}
    return `Draft created. To: ${to}${subject ? `, Subject: "${subject}"` : ''}. Saved in Gmail Drafts. ${voiceCtx?.traits ? '[voice-matched]' : '[no voice profile — run cron-email-voice-learning]'}`;
  } catch (e) { return `Draft error: ${e.message}`; }
}

// ── Recipient Style Analysis ──
async function getRecipientStyle({ email, name: recipientName }, userEmail) {
  try {
    const { getGoogleToken } = await import('../google-token.js');
    const token = await getGoogleToken(userEmail);
    const query = email ? `from:${email}` : `from:${recipientName}`;
    const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`, { headers: { Authorization: `Bearer ${token}` } });
    const searchData = await searchRes.json();
    const ids = (searchData.messages || []).map(m => m.id);
    if (!ids.length) return `No emails found from ${email || recipientName}.`;
    function extractBody(payload) {
      if (!payload) return '';
      if (payload.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
      if (payload.parts) { const plain = payload.parts.find(p => p.mimeType === 'text/plain'); if (plain?.body?.data) return Buffer.from(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim(); for (const part of payload.parts) { const n = extractBody(part); if (n) return n; } }
      return '';
    }
    const bodies = [];
    for (const id of ids.slice(0, 12)) {
      try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        const msg = await msgRes.json();
        const body = extractBody(msg.payload);
        if (body?.length > 20) { const clean = body.split('\n').filter(l => !l.trim().startsWith('>') && !l.match(/^On .+ wrote:$/)).join('\n').trim().slice(0, 600); if (clean.length > 30) bodies.push(clean); }
      } catch {}
    }
    if (!bodies.length) return `Found emails from ${email || recipientName} but could not extract body text.`;
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', // Upgraded — outreach needs quality
      max_tokens: 600,
      messages: [{ role: 'user', content: `Analyse the writing style of this person based on their emails. Return ONLY valid JSON.\n\nEmails (${bodies.length}):\n${bodies.map((b, i) => `[${i + 1}] ${b}`).join('\n\n---\n\n')}\n\nReturn JSON: { "formality": "formal|semi-formal|casual", "avg_length": "brief|medium|detailed", "tone": "warm|neutral|direct|terse|enthusiastic|guarded", "key_phrases": ["..."], "emotional_warmth": "high|medium|low", "draft_instructions": "2-3 sentence instruction on how to write TO this person" }` }]
    });
    const raw = res.content[0]?.text || '{}';
    let style = {};
    try { style = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch {}
    let out = `RECIPIENT STYLE: ${email || recipientName} (${bodies.length} emails analysed)\n`;
    out += `Formality: ${style.formality || '?'} | Tone: ${style.tone || '?'} | Warmth: ${style.emotional_warmth || '?'}\n`;
    if (style.key_phrases?.length) out += `Key phrases: ${style.key_phrases.join(', ')}\n`;
    if (style.draft_instructions) out += `\nHow to write to them: ${style.draft_instructions}`;
    return out;
  } catch (e) { return `Style analysis error: ${e.message}`; }
}




// ── Main Dispatch ──
export async function callOutreachAgent(operation, params = {}, userEmail = 'sunny@vanhawke.com', userId = null) {
  try {
    switch (operation) {
      case 'draft_email': return await draftEmail(params, userEmail, userId);
      case 'recipient_style': return await getRecipientStyle(params, userEmail);
      case 'generate_followup': return await generateFollowup(params, userEmail);
      case 'get_followup_queue': return await getFollowupQueue(params, userEmail);
      default: return `Unknown outreach operation: ${operation}. Available: draft_email, recipient_style, generate_followup, get_followup_queue`;
    }
  } catch (err) {
    return `Outreach Agent error (${operation}): ${err.message}`;
  }
}
