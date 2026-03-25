// api/agents/pricing.js — Pricing & ROI Agent (Phase 5 Rebuild)
// Data-backed pricing. Pulls company enrichment + partnership landscape.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const PRICING_PROMPT = `You are the Pricing Agent inside Kiko, the AI operating system for Van Hawke Group.
You defend deal value and build ROI cases. All figures in USD.

BENCHMARKS:
- F1 Title: $25-60M/year
- F1 Primary: $8-20M/year  
- F1 Official Supplier: $1-5M/year
- Formula E: typically 30-50% of F1 equivalent tier
- Category exclusivity premium: 15-25% above base
- Multi-year discount: 10-15% for 3+ year commitments

ROI DIMENSIONS:
1. Pipeline value (enterprise access × deal size × win rate)
2. Enterprise access (hospitality events × avg relationship value)
3. Brand equity (media equivalent, reach, audience demographics)
4. Category ownership (exclusivity value in the market)

OUTPUT: Price recommendation with floor and ceiling. ROI case with 3 scenarios (conservative/base/optimistic). Use REAL company data provided.`;

async function buildROI(company, tier = '', context = '') {
  let dataContext = '';
  if (company && company !== 'general') {
    // Pull all relevant data in parallel
    const [companyData, deals, partnerships, outreach] = await Promise.all([
      sbFetch(`companies?select=data&data->>name=ilike.*${encodeURIComponent(company)}*&limit=1`).catch(() => []),
      sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=3`).catch(() => []),
      sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier&limit=100').catch(() => []),
      sbFetch(`outreach_scores?company=ilike.*${encodeURIComponent(company)}*&order=sent_at.desc&limit=10`).catch(() => []),
    ]);
    if (companyData?.[0]?.data) {
      const c = companyData[0].data;
      dataContext += `COMPANY: ${c.name} | Industry: ${c.industry || '?'} | Revenue: ${c.revenueEst || '?'} | Employees: ${c.employees || '?'} | Funding: ${c.totalFunding || '?'} | Last Round: ${c.lastRound || '?'}\n`;
    }
    if (deals?.length) {
      dataContext += `DEAL STATUS: ${deals.map(d => `${d.data.company} — ${d.data.stage} (${d.data.pipeline}), value: $${(d.data.value||0).toLocaleString()}`).join('; ')}\n`;
    }
    if (partnerships?.length) {
      // Find competitors in same industry category
      const companyIndustry = companyData?.[0]?.data?.industry?.toLowerCase() || '';
      const sameIndustry = partnerships.filter(p => p.partner_name.toLowerCase().includes(companyIndustry.split(' ')[0]));
      dataContext += `LANDSCAPE: ${partnerships.length} active F1 partnerships.`;
      if (sameIndustry.length) dataContext += ` Same-sector sponsors: ${sameIndustry.map(p => `${p.partner_name} [${p.tier}]`).join(', ')}.`;
      dataContext += '\n';
    }
    if (outreach?.length) {
      const replied = outreach.filter(s => s.outcome === 'replied').length;
      dataContext += `ENGAGEMENT: ${outreach.length} outreach emails, ${replied} replies (${Math.round(replied/outreach.length*100)}%)\n`;
    }
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: PRICING_PROMPT,
      messages: [{ role: 'user', content: `Build ROI case for ${company}${tier ? ` at ${tier} tier` : ''}.\n\n${dataContext}${context ? `\nADDITIONAL: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not build ROI.';
  } catch (err) { return `Pricing error: ${err.message}`; }
}

export async function callPricingAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'roi': return await buildROI(params.company, params.tier, params.context);
      case 'benchmark': return await buildROI(params.company || 'general', params.tier || 'all tiers', params.context);
      default: return `Unknown pricing operation: ${operation}. Available: roi, benchmark`;
    }
  } catch (err) { return `Pricing Agent error (${operation}): ${err.message}`; }
}
