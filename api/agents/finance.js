// api/agents/finance.js — Finance Agent
// Cash flow, revenue forecasting, cost tracking, runway awareness.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const FINANCE_PROMPT = `You are the Finance Agent inside Kiko, the AI operating system for Van Hawke Group.

You keep the business solvent and controlled. All figures in USD.

ENTITIES:
- Van Hawke Agency: sponsorship advisory (primary revenue — Haas F1 client)
- Van Hawke Maison Inc: Cultural Performance Eyewear (equity compounding, pre-seed $500K)
- Van Hawke Group Inc: US holding / capital allocation

CAPABILITIES:
- Pipeline → revenue conversion analysis
- Deal-weighted forecasting (probability × value)
- Cost tracking awareness (API, SaaS, marketing, travel)
- Runway calculations
- Monthly financial summary generation

OUTPUT: Always lead with the number. Then context. Then recommendation.
Never round excessively — use $X.XM or $XXK as appropriate.`;

async function pipelineForecast() {
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=500');
  if (!deals?.length) return 'No active deals in pipeline.';

  const STAGE_PROB = {
    'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20,
    'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50,
    'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90,
    'Contract Review': 0.95
  };

  let totalRaw = 0, totalWeighted = 0;
  const byStage = {};
  const byPipeline = {};

  for (const d of deals) {
    const data = d.data || {};
    const val = data.value || 0;
    const prob = STAGE_PROB[data.stage] || 0.1;
    const weighted = val * prob;
    totalRaw += val;
    totalWeighted += weighted;

    const stage = data.stage || 'Unknown';
    if (!byStage[stage]) byStage[stage] = { count: 0, raw: 0, weighted: 0 };
    byStage[stage].count++;
    byStage[stage].raw += val;
    byStage[stage].weighted += weighted;

    const pipe = data.pipeline || 'Unknown';
    if (!byPipeline[pipe]) byPipeline[pipe] = { count: 0, raw: 0, weighted: 0 };
    byPipeline[pipe].count++;
    byPipeline[pipe].raw += val;
    byPipeline[pipe].weighted += weighted;
  }

  const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

  let out = `PIPELINE FORECAST — ${deals.length} active deals\n\n`;
  out += `Total raw value: ${fmt(totalRaw)}\nWeighted value: ${fmt(totalWeighted)}\n\n`;
  out += `BY STAGE:\n`;
  for (const [stage, d] of Object.entries(byStage).sort((a, b) => b[1].weighted - a[1].weighted)) {
    out += `  ${stage} (${d.count}): ${fmt(d.raw)} raw → ${fmt(d.weighted)} weighted\n`;
  }
  out += `\nBY PIPELINE:\n`;
  for (const [pipe, d] of Object.entries(byPipeline)) {
    out += `  ${pipe} (${d.count}): ${fmt(d.raw)} raw → ${fmt(d.weighted)} weighted\n`;
  }
  return out;
}

async function analyse(question) {
  // Pull pipeline data for context
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=100');
  const byStage = {};
  let totalValue = 0;
  (deals || []).forEach(d => {
    const s = d.data?.stage || '?';
    byStage[s] = (byStage[s] || 0) + 1;
    totalValue += d.data?.value || 0;
  });
  const pipelineContext = `Pipeline: ${(deals||[]).length} deals, total value $${(totalValue/1000000).toFixed(1)}M. Stages: ${Object.entries(byStage).map(([s,c])=>`${s}:${c}`).join(', ')}`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: FINANCE_PROMPT,
      messages: [{ role: 'user', content: `${question}\n\nCONTEXT:\n${pipelineContext}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Finance error: ${err.message}`; }
}

export async function callFinanceAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'forecast': return await pipelineForecast();
      case 'analyse': return await analyse(params.question || params.query);
      default: return `Unknown finance operation: ${operation}. Available: forecast, analyse`;
    }
  } catch (err) { return `Finance Agent error (${operation}): ${err.message}`; }
}
