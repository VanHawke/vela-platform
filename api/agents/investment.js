// api/agents/investment.js — Investment / Capital Strategy Agent (Phase 5 Rebuild)
// Supports Van Hawke Maison raises + future capital events.
// Now pulls pipeline and deal data for revenue context.
// Model: claude-opus-4-6
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const STAGE_PROB = {
  'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20,
  'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50,
  'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90,
  'Contract Review': 0.95
};

const INVESTMENT_PROMPT = `You are the Investment Agent inside Kiko, the AI operating system for Van Hawke Group.
You support capital raises and investor strategy. All figures in USD.

ENTITIES:
- Van Hawke Agency: sponsorship advisory (primary revenue, Haas F1 client)
- Van Hawke Maison Inc: Cultural Performance Eyewear (equity compounding, pre-seed $500K)
- Van Hawke Group Inc: US holding / capital allocation

CURRENT RAISE: Van Hawke Maison pre-seed $500K, Archive 01 + Haas F1 collaboration (2026-2028).
Team: Giacomo (Lead Product Designer, ex-Kering/Gucci/Chloé/D&G), Temi (Visual Director).

CAPABILITIES: Valuation logic, investor narrative, raise strategy, dilution modelling, return scenarios, pitch deck narrative, due diligence prep.

OUTPUT: Lead with the number/recommendation. Support with evidence. End with specific action.`;

async function analyse(question, context = '') {
  // Pull pipeline and deal data for revenue context
  let dataContext = '';
  try {
    const [deals, tasks, activities] = await Promise.all([
      sbFetch('deals?select=data&data->>status=eq.active&limit=200').catch(() => []),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=10').catch(() => []),
      sbFetch('activities?select=type,entity_name,subject,created_at&order=created_at.desc&limit=10').catch(() => []),
    ]);
    if (deals?.length) {
      let totalRaw = 0, totalWeighted = 0;
      const byStage = {};
      for (const d of deals) {
        const data = d.data || {};
        const val = data.value || 0;
        totalRaw += val;
        totalWeighted += val * (STAGE_PROB[data.stage] || 0.1);
        const stage = data.stage || 'Unknown';
        byStage[stage] = (byStage[stage] || 0) + 1;
      }
      const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;
      dataContext += `PIPELINE: ${deals.length} active deals, ${fmt(totalRaw)} raw, ${fmt(totalWeighted)} weighted. Stages: ${Object.entries(byStage).map(([s,c]) => `${s}: ${c}`).join(', ')}\n`;
    }
    if (activities?.length) {
      dataContext += `RECENT ACTIVITY: ${activities.slice(0,5).map(a => `${a.type}: ${a.entity_name}`).join(', ')}\n`;
    }
  } catch {}
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6', max_tokens: 1200,
      system: INVESTMENT_PROMPT,
      messages: [{ role: 'user', content: `${question}\n\n${dataContext}${context ? `ADDITIONAL: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Investment error: ${err.message}`; }
}

export async function callInvestmentAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analyse(params.question || params.query, params.context);
      default: return `Unknown investment operation: ${operation}. Available: analyse`;
    }
  } catch (err) { return `Investment Agent error (${operation}): ${err.message}`; }
}
