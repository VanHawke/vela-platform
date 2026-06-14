// api/lib/archive-brief.js
// Archive v2: Kiko's holistic re-engagement brief.
// Fuses the RING-FENCED correspondence (buildDossier) + company_intelligence + a live
// web check into one Opus-synthesised recommendation, weighted to messaging.
// Cached per (deal_id, user_id) so the ring-fence holds and the Opus call is one-time.
// Exposed by BOTH /api/archive/brief and Kiko's chat tool (same buildBrief function).

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { BRAIN } from './models.js';
import { buildDossier, resolveViewer } from './dossier.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';
const dayKey = (d) => (d || '').toString().slice(0, 10);

function formatTimeline(tl) {
  if (!tl || !tl.length) return '(no correspondence on record)';
  return tl.map(i => {
    const sub = i.subject ? ` "${i.subject}"` : '';
    const snip = i.snippet ? ` - ${i.snippet.slice(0, 160)}` : '';
    return `- ${dayKey(i.date)} [${i.channel}/${i.direction}${i.step ? ' step ' + i.step : ''}]${sub}${snip}`;
  }).join('\n');
}

function formatIntel(intel) {
  if (!intel) return 'No enriched intelligence on file for this company.';
  const lines = [
    intel.funding_total && `Funding total: ${intel.funding_total}`,
    (intel.last_funding_round || intel.last_funding_amount) && `Last round: ${[intel.last_funding_round, intel.last_funding_amount, intel.last_funding_date].filter(Boolean).join(' ')}`,
    intel.revenue_estimate && `Revenue estimate: ${intel.revenue_estimate}`,
    intel.employee_count && `Headcount: ${intel.employee_count}${intel.employee_growth ? ` (growth ${intel.employee_growth})` : ''}`,
    (intel.ceo || intel.cmo || intel.cfo) && `Leadership: ${[intel.ceo && 'CEO ' + intel.ceo, intel.cmo && 'CMO ' + intel.cmo, intel.cfo && 'CFO ' + intel.cfo].filter(Boolean).join(', ')}`,
    intel.industry && `Industry: ${intel.industry}${intel.sub_sector ? ' / ' + intel.sub_sector : ''}`,
    intel.business_model && `Business model: ${intel.business_model}`,
    intel.key_products && `Key products: ${intel.key_products}`,
    intel.existing_sponsorships && `Existing sponsorships: ${intel.existing_sponsorships}`,
    intel.recent_acquisitions && `Recent M&A: ${intel.recent_acquisitions}`,
    intel.marketing_budget_signal && `Marketing budget signal: ${intel.marketing_budget_signal}`,
    intel.sponsorship_fit_score != null && `Sponsorship fit score: ${intel.sponsorship_fit_score}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : 'Intelligence record exists but is sparse.';
}

function briefPrompt(deal, prospect, dossier, intel) {
  return `You are the Chief Revenue strategist for Van Hawke Group - a commercial advisory firm operating at the intersection of sport, culture and capital (Formula 1, Formula E, MotoGP, E1). Decide whether to RE-ENGAGE a dormant prospect relationship, and with what message.

Register: authority-led. Category control, decision density, board-level. Van Hawke operates at principal level; partnerships are board-level capital-allocation decisions ($3M-$40M annually, category-exclusive). Never soft, never junior, never "I think / maybe / hopefully".

DEAL
- Company: ${prospect.company || deal.company || '-'}
- Counterpart: ${prospect.name || deal.contact || '-'}
- Value: ${deal.value ? '$' + deal.value : '-'}
- Stage when archived: ${deal.stage || '-'}
- Why archived: ${deal.archiveReason || '-'}
- Dormant since: ${dayKey(deal.archivedAt) || '-'}

FULL CORRESPONDENCE (oldest first; ${dossier.counts?.total || 0} touches, ${dossier.counts?.replies || 0} inbound):
${formatTimeline(dossier.timeline)}

COMPANY INTELLIGENCE
${formatIntel(intel)}

Use web_search to find any RECENT (last ~6 months) moves by ${prospect.company || deal.company} relevant to a sponsorship/partnership re-engagement: new funding, leadership changes, product launches, new sponsorships/brand deals, market expansion. Be specific and current; do not speculate.

Then return a re-engagement brief as a SINGLE JSON object - no prose, no markdown fences - with EXACTLY these keys:
{
  "verdict": one of "warm_reopen" | "cool_hold" | "do_not_reopen",
  "headline": a single decisive line, max ~15 words,
  "counterpart_read": 2-3 sentences on the counterpart's behaviour from the correspondence - engagement level, what resonated, where and why they went quiet,
  "company_context": 2-3 sentences fusing the intelligence and your web findings - funding, sponsorship posture, current market moves,
  "recommendation": 2-3 sentences - reopen or hold, and the commercial frame to lead with,
  "suggested_angle": one specific, sharp hook for the actual re-engagement message (the angle itself, not generic advice),
  "timing": one line on when to move and how warm to go
}
Return ONLY the JSON object.`;
}

function parseBrief(res) {
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (e) { /* fall through */ }
  return { verdict: 'cool_hold', headline: 'Brief could not be parsed - retry.', counterpart_read: '', company_context: '', recommendation: '', suggested_angle: '', timing: '', _unparsed: text.slice(0, 600) };
}

async function gatherIntel(company) {
  if (!company) return null;
  const { data } = await supabase.from('company_intelligence').select('*').ilike('company_name', company).limit(1).maybeSingle();
  return data || null;
}

function inputsSummary(dossier, intel) {
  const tl = dossier.timeline || [];
  return {
    correspondence_count: dossier.counts?.total || 0,
    last_correspondence_at: tl.length ? tl[tl.length - 1].date : null,
    intel_enriched_at: intel?.enriched_at || null,
  };
}

function isStale(prev, curr) {
  if (!prev) return false;
  return prev.correspondence_count !== curr.correspondence_count
    || prev.last_correspondence_at !== curr.last_correspondence_at
    || prev.intel_enriched_at !== curr.intel_enriched_at;
}

// Read the cached brief (no generation). { brief, generated_at, stale } or { brief: null }.
export async function readBrief({ dealId, viewerEmail }) {
  const viewer = await resolveViewer(viewerEmail);
  if (!viewer) return { error: 'unauthorized' };
  const { data: cached } = await supabase
    .from('kiko_archive_briefs').select('brief, inputs_summary, generated_at, model')
    .eq('deal_id', dealId).eq('user_id', viewer.userId).maybeSingle();
  if (!cached) return { brief: null };
  const dossier = await buildDossier({ dealId, viewerEmail });
  const intel = await gatherIntel(dossier.prospect?.company);
  return { brief: cached.brief, generated_at: cached.generated_at, model: cached.model, stale: isStale(cached.inputs_summary, inputsSummary(dossier, intel)) };
}

// Generate (or regenerate), cache per (deal_id, user_id), return.
export async function buildBrief({ dealId, viewerEmail }) {
  const viewer = await resolveViewer(viewerEmail);
  if (!viewer) return { error: 'unauthorized' };
  const dossier = await buildDossier({ dealId, viewerEmail });
  if (dossier.error) return { error: dossier.error };
  const intel = await gatherIntel(dossier.prospect?.company);

  let res;
  try {
    res = await anthropic.messages.create({
      model: BRAIN, max_tokens: 2500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: briefPrompt(dossier.deal, dossier.prospect, dossier, intel) }],
    });
  } catch (e) {
    // Generation failed (Anthropic/web_search error). Fall back to an existing
    // cached brief for THIS viewer rather than 500-ing and losing it.
    const { data: cached } = await supabase
      .from('kiko_archive_briefs').select('brief, generated_at, model')
      .eq('deal_id', dealId).eq('user_id', viewer.userId).maybeSingle();
    if (cached) return { brief: cached.brief, generated_at: cached.generated_at, model: cached.model, stale: true, generation_failed: true };
    return { error: 'generation_failed', detail: String(e?.message || e) };
  }
  const brief = parseBrief(res);
  const inputs = inputsSummary(dossier, intel);

  await supabase.from('kiko_archive_briefs').upsert({
    deal_id: dealId, user_id: viewer.userId, org_id: ORG_ID,
    brief, inputs_summary: inputs, model: BRAIN,
    generated_by: viewer.userId, generated_at: new Date().toISOString(),
  }, { onConflict: 'deal_id,user_id' });

  return { brief, generated_at: new Date().toISOString(), model: BRAIN, stale: false };
}

export default { buildBrief, readBrief };
