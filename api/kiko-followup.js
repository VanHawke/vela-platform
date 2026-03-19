// api/kiko-followup.js — Follow-up generation and queue handlers for Kiko
import Anthropic from '@anthropic-ai/sdk';

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

async function sbFetch(path, opts = {}) {
  const url = `${SB_URL}/rest/v1/${path}`;
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

export async function generateFollowup(input, userEmail) {
  const { contact_email, deal_name, context: extraContext } = input;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

    // ── 1. Relationship score ──────────────────────────────
    const scores = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&contact_email=eq.${encodeURIComponent(contact_email)}&limit=1`);
    const score = scores?.[0] || {};

    // ── 2. Deal context ───────────────────────────────────
    let dealCtx = '';
    if (deal_name) {
      const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(deal_name)}*&limit=1`);
      if (deals?.[0]?.data) {
        const d = deals[0].data;
        dealCtx = `Pipeline: ${d.pipeline || '?'}, Stage: ${d.stage || '?'}, Contact: ${d.contactName || '?'}.`;
      }
    }

    // ── 3. Pull actual thread content from Gmail ──────────
    // Gets real email bodies not just snippets
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken(userEmail);

    function extractBody(payload) {
      if (!payload) return '';
      if (payload.mimeType === 'text/plain' && payload.body?.data)
        return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
      if (payload.parts) {
        const plain = payload.parts.find(p => p.mimeType === 'text/plain');
        if (plain?.body?.data) return Buffer.from(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
        for (const part of payload.parts) { const n = extractBody(part); if (n) return n; }
      }
      return '';
    }

    // Search for threads involving this contact
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`to:${contact_email} OR from:${contact_email}`)}&maxResults=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    const msgIds = (searchData.messages || []).map(m => m.id).slice(0, 6);

    const threadMessages = [];
    for (const id of msgIds) {
      try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        const msg = await msgRes.json();
        const h = msg.payload?.headers || [];
        const getH = n => h.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
        const body = extractBody(msg.payload)
          .split('\n').filter(l => !l.trim().startsWith('>') && !l.match(/^On .+ wrote:$/))
          .join('\n').trim().slice(0, 400);
        const isFromMe = getH('From').toLowerCase().includes(userEmail.toLowerCase().split('@')[0]);
        if (body.length > 20) threadMessages.push({
          dir: isFromMe ? 'SENT' : 'RECEIVED',
          from: getH('From'), date: getH('Date') ? new Date(getH('Date')).toLocaleDateString('en-GB') : '?',
          subject: getH('Subject'), body
        });
      } catch {}
    }

    // ── 4. Recipient style analysis (last 8 replies from them) ──
    const recipientMsgs = threadMessages.filter(m => m.dir === 'RECEIVED');
    let styleProfile = '';
    if (recipientMsgs.length >= 2) {
      const styleRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 300,
        messages: [{ role: 'user', content: `Analyse this person's writing style in 3 sentences. Focus on: formality level, typical length, how they signal interest vs disinterest, and what tone to match when writing back to them.

Their emails:
${recipientMsgs.map(m => m.body).join('\n\n---\n\n')}

Return only 3 plain sentences. No bullet points. No JSON.` }]
      });
      styleProfile = styleRes.content?.[0]?.text?.trim() || '';
    }

    // ── 5. Outreach pattern context ───────────────────────
    const patternRes = await fetch(
      `${SB_URL}/rest/v1/outreach_scores?org_id=eq.${ORG_ID}&outcome=eq.replied&order=sent_at.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const patterns = await patternRes.json();
    const bestApproach = patterns?.[0]?.messaging_approach || 'value-led';
    const bestCta = patterns?.[0]?.cta_type || 'reply-ask';
    const avgWords = patterns?.length
      ? Math.round(patterns.reduce((a, s) => a + (s.body_word_count || 120), 0) / patterns.length)
      : 120;

    // ── 6. Generate draft ─────────────────────────────────
    const threadSummary = threadMessages.length
      ? threadMessages.map(m => `[${m.dir}] ${m.date} — ${m.body.slice(0, 200)}`).join('\n\n')
      : 'No prior email history found.';

    const draftRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 800,
      system: `You are drafting a follow-up email for Sunny Sidhu, CEO of Van Hawke Group — an F1/Formula E sponsorship advisory firm.

SUNNY'S STYLE (always match this):
- Direct, commercial, board-level
- No "hope you're well", no "circling back", no filler
- Lead with the most relevant commercial point
- Under ${avgWords} words total
- Always end with one specific, low-friction CTA
- Best performing approach: ${bestApproach}
- Best performing CTA type: ${bestCta}

RECIPIENT STYLE (adapt your tone to match how they write):
${styleProfile || 'Style not yet analysed — use professional default.'}`,
      messages: [{ role: 'user', content: `Write a follow-up email to this contact.

Contact: ${score.contact_name || contact_email} <${contact_email}>
${dealCtx ? `Commercial context: ${dealCtx}` : ''}
Relationship: ${score.days_since_last_contact || '?'} days since last contact | Health: ${score.relationship_health || '?'}/100 | Momentum: ${score.momentum || 'unknown'}
${extraContext ? `Specific instruction: ${extraContext}` : ''}

Full email history:
${threadSummary}

Return ONLY the email body text. No subject line. No "Hi [name]" greeting — start with the first substantive sentence. End with one clear CTA.` }],
    });

    const draftBody = draftRes.content?.[0]?.text || 'Draft generation failed.';
    const subject = deal_name ? `Re: ${deal_name}` : `Follow-up — Van Hawke Group`;

    // Save to queue
    try {
      await sbFetch('followup_queue', { method: 'POST', body: JSON.stringify({
        org_id: ORG_ID, user_email: userEmail,
        contact_email, contact_name: score.contact_name || contact_email,
        company: score.company || '', deal_name: deal_name || '',
        subject, draft_html: draftBody, draft_text: draftBody,
        status: 'pending_review', priority: score.staleness_score > 70 ? 'high' : 'normal',
        source: 'kiko',
        context: { styleProfile, bestApproach, bestCta, threadCount: threadMessages.length, staleness: score.staleness_score },
      })});
    } catch {}

    let out = `**Draft follow-up — ${score.contact_name || contact_email}**\n`
    out += `To: ${contact_email} | Subject: ${subject}\n`
    if (styleProfile) out += `\n_Style adapted to: ${styleProfile.slice(0, 100)}..._\n`
    out += `\n---\n${draftBody}\n---\n`
    out += `\n_Saved to follow-up queue. Say "send this" to create a Gmail draft, or "adjust [instruction]" to refine._`
    return out;
  } catch(e) { return `Follow-up generation error: ${e.message}`; }
}

export async function getFollowupQueue(input, userEmail) {
  const status = input.status || 'pending_review';
  const filter = status === 'all' ? '' : `&status=eq.${status}`;
  const items = await sbFetch(`followup_queue?user_email=eq.${encodeURIComponent(userEmail)}${filter}&order=created_at.desc&limit=20`);
  if (!items?.length) return `No follow-ups with status "${status}".`;
  let out = `${items.length} follow-up${items.length > 1 ? 's' : ''} (${status}):\n`;
  for (const item of items) {
    out += `\n• **${item.contact_name}**${item.deal_name ? ` — ${item.deal_name}` : ''}\n`;
    out += `  Subject: ${item.subject}\n`;
    out += `  Priority: ${item.priority} | Created: ${new Date(item.created_at).toLocaleDateString('en-GB')}\n`;
    out += `  Preview: ${(item.draft_text || '').slice(0, 100)}...\n`;
  }
  return out;
}
