// api/agents/pricing.js — Pricing & ROI Agent
// Defends pricing in negotiations. Builds ROI cases.
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

ROI DIMENSIONS:
1. Pipeline value (enterprise access × deal size × win rate)
2. Enterprise access (hospitality events × avg relationship value)
3. Brand equity (media equivalent, reach, audience demographics)
4. Category ownership (exclusivity value in the market)

OUTPUT: Price recommendation with floor and ceiling. ROI case with 3 scenarios (conservative/base/optimistic).`;

async function buildROI(company, tier = '', context = '') {
  let crmContext = '';
  if (company) {
    try {
      const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=2`);
      if (deals?.length) crmContext = `CRM: ${deals.map(d => `${d.data.company} — ${d.data.stage}`).join('; ')}`;
    } catch {}
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: PRICING_PROMPT,
      messages: [{ role: 'user', content: `Build ROI case for ${company}${tier ? ` at ${tier} tier` : ''}.\n${crmContext}${context ? `\nContext: ${context}` : ''}` }],
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
