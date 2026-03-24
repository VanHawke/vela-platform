// api/agents/outreach.js — Outreach Agent
// Email drafting, Lemlist campaigns, follow-ups, recipient analysis.
// Absorbs all outbound communication tools from kiko-tools.js.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';
import { generateFollowup, getFollowupQueue } from '../kiko-followup.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Gmail Draft ──
async function draftEmail({ to, subject, body, cc, thread_id }, userEmail) {
  try {
    const { getGoogleToken } = await import('../google-token.js');
    const token = await getGoogleToken(userEmail);
    let sig = '';
    try {
      const sigRows = await sbFetch('user_settings?select=email_signature&limit=1');
      if (sigRows?.[0]?.email_signature) sig = `<br><div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0">${sigRows[0].email_signature}</div>`;
    } catch {}
    const htmlBody = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:14px">${body.replace(/\n/g, '<br>')}${sig}</div>`;
    const boundary = `b_${Date.now()}`;
    let mime = `To: ${to}\r\nFrom: ${userEmail}\r\n`;
    if (cc) mime += `Cc: ${cc}\r\n`;
    if (subject) mime += `Subject: ${subject}\r\n`;
    mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}\r\n`;
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
    try { await sbFetch('activities', { method: 'POST', body: JSON.stringify({ type: 'email_drafted', entity_name: to, subject: subject || 'No subject', status: 'draft', metadata: { to, subject, draft_id: draft?.id } }) }); } catch {}
    return `Draft created. To: ${to}${subject ? `, Subject: "${subject}"` : ''}. Saved in Gmail Drafts.`;
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
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
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

// ── Lemlist ──
const lemlistHeaders = () => {
  const key = process.env.LEMLIST_KEY;
  return { Authorization: `Basic ${Buffer.from(`:${key}`).toString('base64')}`, 'Content-Type': 'application/json' };
};

async function lemlistListCampaigns() {
  const res = await fetch('https://api.lemlist.com/api/campaigns', { headers: lemlistHeaders() });
  if (!res.ok) return `Lemlist API error: ${res.status}`;
  const campaigns = await res.json();
  if (!campaigns?.length) return 'No Lemlist campaigns found.';
  return `LEMLIST CAMPAIGNS (${campaigns.length}):\n\n${campaigns.map(c => `• ${c.name} (ID: ${c._id}) — ${c.status || 'unknown'}`).join('\n')}`;
}

async function lemlistAddLead({ campaign_id, email, first_name, last_name, company_name, job_title }) {
  const body = { email, firstName: first_name };
  if (last_name) body.lastName = last_name;
  if (company_name) body.companyName = company_name;
  if (job_title) body.jobTitle = job_title;
  const res = await fetch(`https://api.lemlist.com/api/campaigns/${campaign_id}/leads/`, { method: 'POST', headers: lemlistHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.text(); return `Lemlist add lead failed (${res.status}): ${err}`; }
  const result = await res.json();
  return `Lead added: ${first_name} ${last_name || ''} (${email}) to campaign "${result.campaignName || campaign_id}".`;
}

async function lemlistGetActivities({ campaign_id, type }) {
  let url = 'https://api.lemlist.com/api/activities?limit=25';
  if (campaign_id) url += `&campaignId=${campaign_id}`;
  if (type) url += `&type=${type}`;
  const res = await fetch(url, { headers: lemlistHeaders() });
  if (!res.ok) return `Lemlist API error: ${res.status}`;
  const activities = await res.json();
  if (!activities?.length) return 'No recent Lemlist activities.';
  let out = `LEMLIST ACTIVITIES (${activities.length}):\n\n`;
  for (const a of activities) {
    const date = new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    out += `${date} — ${a.type}: ${a.firstName || ''} ${a.lastName || ''} (${a.email || '?'})${a.campaignName ? ` [${a.campaignName}]` : ''}\n`;
  }
  return out;
}

// ── Main Dispatch ──
export async function callOutreachAgent(operation, params = {}, userEmail = 'sunny@vanhawke.com') {
  try {
    switch (operation) {
      case 'draft_email': return await draftEmail(params, userEmail);
      case 'recipient_style': return await getRecipientStyle(params, userEmail);
      case 'generate_followup': return await generateFollowup(params, userEmail);
      case 'get_followup_queue': return await getFollowupQueue(params, userEmail);
      case 'lemlist_campaigns': return await lemlistListCampaigns();
      case 'lemlist_add_lead': return await lemlistAddLead(params);
      case 'lemlist_activities': return await lemlistGetActivities(params);
      default: return `Unknown outreach operation: ${operation}. Available: draft_email, recipient_style, generate_followup, get_followup_queue, lemlist_campaigns, lemlist_add_lead, lemlist_activities`;
    }
  } catch (err) {
    return `Outreach Agent error (${operation}): ${err.message}`;
  }
}
