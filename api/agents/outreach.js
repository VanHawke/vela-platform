// api/agents/outreach.js — Outreach Agent
// Email drafting, campaigns, follow-ups, recipient analysis.
// Uses voice profile learned from user's actual sent emails + global signature wrapper.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';
import { generateFollowup, getFollowupQueue } from '../kiko-followup.js';
import { wrapEmailBody, loadUserSignatures, loadVoiceProfile, voiceProfileToPrompt } from '../lib/email-format.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Gmail Draft (voice-aware, signature-wrapped) ──
async function draftEmail({ to, subject, body, cc, thread_id, contact_status = 'cold' }, userEmail, userId) {
  try {
    const { getGoogleToken } = await import('../google-token.js');
    const token = await getGoogleToken(userEmail);

    // Load voice + signatures (signatures come from Gmail API native sendAs)
    const [signatures, voiceProfile] = await Promise.all([
      loadUserSignatures(sbFetch, userId, token),
      loadVoiceProfile(sbFetch, userId),
    ]);

    // Voice alignment, register-PRESERVING. This Gmail-draft path is always an INDIVIDUAL/personal
    // draft, never a campaign blast (campaigns run through cron-sequence-enqueue), so it must NEVER
    // impose the campaign "category ownership" cold voice. Preserve the body's own register and only
    // strip the user's forbidden phrases. (Step 1 of the dynamic-voice rebuild; the shared
    // resolveVoiceContext resolver will later SHAPE register from real prior correspondence.)
    let finalBody = body;
    if (voiceProfile && body && body.length > 40) {
      try {
        const forbidden = voiceProfile?.forbidden_phrases?.length
          ? `\n\nAvoid these phrases entirely (filler / AI-tells): ${voiceProfile.forbidden_phrases.join(', ')}.`
          : '';
        const alignRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{ role: 'user', content: `Lightly polish this email body. Preserve its meaning, length, and relationship register EXACTLY: if it reads warm and personal, keep it warm and personal; if it reads as a formal business note, keep it formal. Do NOT add arguments, pitches, calls to action, or "category / participation / strategic positioning" framing that is not already present. Do NOT impose a sales or outreach voice on a personal note.${forbidden}\n\nReturn ONLY the email body — no commentary, no subject line.\n\nEmail:\n${body}` }],
        });
        const rewritten = alignRes.content[0]?.text?.trim();
        if (rewritten && rewritten.length > 40) finalBody = rewritten;
      } catch {}
    }

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
    try { await sbFetch('activities', { method: 'POST', body: JSON.stringify({ type: 'email_drafted', entity_name: to, subject: subject || 'No subject', status: 'draft', metadata: { to, subject, draft_id: draft?.id, voice_applied: !!voiceProfile, contact_status } }) }); } catch {}
    try { await sbFetch('kiko_draft_tracking', { method: 'POST', body: JSON.stringify({ user_id: userId, gmail_draft_id: draft?.id, gmail_message_id: draft?.message?.id, original_content: finalBody.slice(0, 2000), recipient: to, subject: subject || '', status: 'drafted' }) }); } catch {}
    return `Draft created. To: ${to}${subject ? `, Subject: "${subject}"` : ''}. Saved in Gmail Drafts. ${voiceProfile ? '[voice-matched]' : '[no voice profile — run cron-email-voice-learning]'}`;
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
