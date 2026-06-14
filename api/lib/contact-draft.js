// Contact outreach / re-engagement draft engine.
// Grounds every draft in: (1) the REAL correspondence with this person (emails +
// outreach ledger), (2) the REAL Van Hawke voice (kiko_email_style_reference — actual
// sent emails), (3) the company's enriched intelligence. Opus then writes in the
// demonstrated house style, honest about the relationship stage (no fabricated
// "circling back" when there was no prior contact).

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { BRAIN } from './models.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const dayKey = (d) => (d || '').toString().slice(0, 10);
const firstNameOf = (name) => (name || '').trim().split(/\s+/)[0] || 'there';

async function gatherCorrespondence(email) {
  if (!email) return [];
  const e = email.toLowerCase();
  const [fromRes, toRes, outRes] = await Promise.all([
    supabase.from('emails').select('subject, snippet, date').ilike('from_address', `%${e}%`).order('date', { ascending: false }).limit(15),
    supabase.from('emails').select('subject, snippet, date').contains('to_addresses', [email]).order('date', { ascending: false }).limit(15),
    supabase.from('kiko_outreach_queue').select('subject, body_plain, sent_at, channel, step_number, reply_type, reply_snippet').ilike('to_email', `%${e}%`).order('sent_at', { ascending: false }).limit(15),
  ]).catch(() => [{ data: [] }, { data: [] }, { data: [] }]);
  const items = [];
  for (const r of (fromRes.data || [])) items.push({ dir: 'in', date: r.date, subject: r.subject, snippet: r.snippet });
  for (const r of (toRes.data || [])) items.push({ dir: 'out', date: r.date, subject: r.subject, snippet: r.snippet });
  for (const r of (outRes.data || [])) items.push({ dir: 'out', date: r.sent_at, subject: r.subject, snippet: (r.body_plain || '').slice(0, 160), channel: r.channel, step: r.step_number, replied: !!r.reply_type, replySnippet: r.reply_snippet });
  items.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return items;
}

async function gatherIntel(company) {
  if (!company) return null;
  // Pull BOTH the deep-enrichment table (company_intelligence, sparse ~30 cos) AND the
  // firmographic shell (companies.data jsonb, ~2,168 cos). Merge: deep wins, shell fills gaps.
  const [ciRes, coRes] = await Promise.all([
    supabase.from('company_intelligence')
      .select('funding_total, last_funding_round, last_funding_amount, revenue_estimate, employee_count, employee_growth, industry, sub_sector, business_model, key_products, competitors, existing_sponsorships, marketing_budget_signal, ceo, cmo')
      .ilike('company_name', company).limit(1),
    supabase.from('companies').select('data').ilike('data->>name', company).limit(1),
  ]).catch(() => [{ data: [] }, { data: [] }]);
  const deep = ciRes?.data?.[0] || null;
  const shell = coRes?.data?.[0]?.data || null;
  if (!deep && !shell) return null;
  const comp = deep?.competitors || (Array.isArray(shell?.competitors)
    ? shell.competitors.map(c => (c && c.name) ? (c.threat ? `${c.name} (${c.threat})` : c.name) : null).filter(Boolean).join(', ')
    : (shell?.competitors || null));
  return {
    funding_total: deep?.funding_total || shell?.totalFunding,
    last_funding_round: deep?.last_funding_round || shell?.lastRound,
    last_funding_amount: deep?.last_funding_amount,
    revenue_estimate: deep?.revenue_estimate || shell?.revenueEst,
    employee_count: deep?.employee_count || shell?.employees,
    employee_growth: deep?.employee_growth,
    industry: deep?.industry || shell?.industry || shell?.sector,
    sub_sector: deep?.sub_sector,
    business_model: deep?.business_model,
    valuation: shell?.valuation,
    founded: shell?.founded,
    key_products: deep?.key_products,
    competitors: comp,
    existing_sponsorships: deep?.existing_sponsorships,
    marketing_budget_signal: deep?.marketing_budget_signal,
    ceo: deep?.ceo,
    cmo: deep?.cmo,
  };
}

async function gatherStyleExamples() {
  const { data } = await supabase.from('kiko_email_style_reference')
    .select('category, subject, body, approach')
    .eq('channel', 'email').limit(3);
  return data || [];
}

function draftPrompt({ email, name, title, company, sector, corr, intel, examples }) {
  const ex = (examples || []).map((e, i) =>
    `--- EXAMPLE ${i + 1} (${e.category}, ${e.approach || 'authority-led'}) ---\nSubject: ${e.subject}\n\n${e.body}`
  ).join('\n\n') || '(no style references on file - default to a precise, authority-led register)';

  const intelLines = intel ? (Object.entries({
    'Funding total': intel.funding_total, 'Last round': intel.last_funding_round, 'Last round amount': intel.last_funding_amount,
    'Valuation': intel.valuation, 'Revenue estimate': intel.revenue_estimate, 'Headcount': intel.employee_count,
    'Founded': intel.founded, 'Headcount growth': intel.employee_growth,
    'Industry': intel.industry, 'Sub-sector': intel.sub_sector, 'Business model': intel.business_model,
    'Key products': intel.key_products, 'Competitors': intel.competitors, 'Existing sponsorships': intel.existing_sponsorships,
    'Marketing budget signal': intel.marketing_budget_signal, 'CEO': intel.ceo, 'CMO': intel.cmo,
  }).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (no enriched company intelligence on file)')
    : '- (no enriched company intelligence on file for this company)';

  const history = corr.length
    ? corr.map(c => `- ${dayKey(c.date)} · ${c.dir === 'out' ? 'Van Hawke sent' : 'They sent'}${c.channel ? ` (${c.channel}${c.step ? ` step ${c.step}` : ''})` : ''}: "${c.subject || '(no subject)'}"${c.snippet ? ` - ${c.snippet}` : ''}${c.replied ? ` [THEY REPLIED${c.replySnippet ? `: "${c.replySnippet}"` : ''}]` : ''}`).join('\n')
    : 'NONE on record. There is no logged correspondence with this person in the system. Treat this as a first substantive outreach. Do NOT fabricate or imply prior conversations, follow-ups, "circling back", or "as discussed" - none of that happened. The honest framing is a considered first approach.';

  return `You are writing ONE outreach email AS Sunny Sidhu, Founder & CEO of Van Hawke Group - a commercial advisory firm that structures CATEGORY-EXCLUSIVE partnerships in Formula 1 and elite motorsport for enterprise brands.

Below are REAL emails Van Hawke has sent. Study the voice, structure, sentence cadence, and restraint. Your draft MUST read as if it came from the same hand. Do not drift into generic SaaS-sales phrasing or hype.

=== REAL VAN HAWKE EMAILS (your voice - match this exactly) ===
${ex}

=== THIS PROSPECT ===
Name: ${name || '(unknown)'}
First name: ${firstNameOf(name)}
Title: ${title || '(unknown)'}
Company: ${company || '(unknown)'}
Sector: ${sector || '(unknown)'}

=== COMPANY INTELLIGENCE (use the specifics; do not invent figures) ===
${intelLines}

=== RELATIONSHIP HISTORY (oldest to newest) ===
${history}

=== TASK ===
Write ONE email to ${firstNameOf(name)} that:
1. Matches the Van Hawke voice above EXACTLY - authority-led, precise, unhurried, zero hedging. Banned phrases: "just checking in", "touching base", "circling back", "I hope this finds you well", "I wanted to reach out", "excited to", "synergy", "leverage", "game-changer".
2. Is specific to ${company}. Use the real company intelligence only where it is on file. Name the category a company of THEIR kind would hold (the exclusive partner position relevant to their sector), not a generic pitch. If no intelligence is on file, do not fabricate figures - lead on positioning instead.
3. Respects the relationship stage above. If there is prior correspondence, reference it honestly and move it forward. If there is none, open with a strategic frame appropriate to a first, considered approach - never imply a relationship that does not exist.
4. Frames Formula 1 as a board-level commercial platform and a single category-exclusive appointment: one partner holds the position; competitors do not. Never use sub-2M-dollar language. UK English. Avoid stacking em-dashes.
5. Closes with a specific, confident next step (e.g. offering to outline the structure and commercial framework), never "let me know if interested".
6. Under 160 words. Greeting "Dear ${firstNameOf(name)},". Sign off as Sunny Sidhu, Van Hawke Group.

Return ONLY valid JSON, no markdown fences, no preamble:
{"subject": "<subject line>", "body": "<full email body, greeting through sign-off>"}`;
}

function parseDraft(res) {
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { const o = JSON.parse(m[0]); if (o.subject || o.body) return { subject: o.subject || '', body: o.body || '' }; } catch {} }
  return { subject: '', body: text };
}

export async function buildContactDraft({ email, name, title, company, sector }) {
  const [corr, intel, examples] = await Promise.all([
    gatherCorrespondence(email),
    gatherIntel(company),
    gatherStyleExamples(),
  ]);
  const res = await anthropic.messages.create({
    model: BRAIN,
    max_tokens: 1200,
    messages: [{ role: 'user', content: draftPrompt({ email, name, title, company, sector, corr, intel, examples }) }],
  });
  const draft = parseDraft(res);
  return { ...draft, to: email || '', had_correspondence: corr.length > 0, correspondence_count: corr.length, intel_found: !!intel };
}
