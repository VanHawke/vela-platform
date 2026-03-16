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
    const scores = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&contact_email=eq.${encodeURIComponent(contact_email)}&limit=1`);
    const score = scores?.[0] || {};
    const emails = await sbFetch(`emails?user_email=eq.${encodeURIComponent(userEmail)}&or=(from_address.ilike.*${encodeURIComponent(contact_email)}*,to_addresses.cs.{${contact_email}})&order=date.desc&limit=5&select=subject,snippet,date,from_address`);
    let dealCtx = '';
    if (deal_name) {
      const deals = await sbFetch(`deals?select=data&data->>title=ilike.*${encodeURIComponent(deal_name)}*&limit=1`);
      if (deals?.[0]?.data) { const d = deals[0].data; dealCtx = `Deal: ${d.title}, Stage: ${d.stage}, Value: ${d.value || 'TBD'}, Pipeline: ${d.pipeline || 'Unknown'}. `; }
    }
    const recentEmails = (emails || []).map(e => `${new Date(e.date).toLocaleDateString('en-GB')}: "${e.subject}" — ${e.snippet?.slice(0, 80)}`).join('\n');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
    const draftRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1000,
      system: `You are drafting a follow-up email for Sunny Sidhu, CEO of Van Hawke Group.
Van Hawke is a sponsorship advisory firm working with Haas F1, Alpine F1, and Formula E.
Tone: Sharp, professional, concise. Commercial edge. No fluff. No "hope you're well." No "circling back."
Keep under 150 words. Lead with value. Reference the last interaction specifically.`,
      messages: [{ role: 'user', content: `Draft a follow-up email to ${score.contact_name || contact_email}.
${dealCtx}
Relationship: Health ${score.relationship_health}/100, ${score.days_since_last_contact || '?'} days since last contact, momentum: ${score.momentum || 'unknown'}.
${extraContext ? `Additional context: ${extraContext}` : ''}
Recent email history:\n${recentEmails || 'No recent emails found.'}
Return ONLY the email body (no subject line, no greeting — just the content). End with a clear CTA.` }],
    });

    const draftBody = draftRes.content?.[0]?.text || 'Draft generation failed.';
    const subject = deal_name ? `Re: ${deal_name} — Van Hawke Follow-Up` : `Follow-Up — Van Hawke Group`;
    await sbFetch('followup_queue', { method: 'POST', body: JSON.stringify({
      org_id: ORG_ID, user_email: userEmail,
      contact_email, contact_name: score.contact_name || contact_email,
      company: score.company || '', deal_name: deal_name || '',
      subject, draft_html: draftBody, draft_text: draftBody,
      status: 'pending_review', priority: score.staleness_score > 70 ? 'high' : 'normal',
      source: 'kiko', context: { dealCtx, recentEmails, staleness: score.staleness_score, health: score.relationship_health },
    })});
    return `Follow-up draft queued for review:\n\n**To:** ${contact_email}\n**Subject:** ${subject}\n\n${draftBody}\n\n---\n_Status: Pending review. Use "show follow-up queue" to manage._`;
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
