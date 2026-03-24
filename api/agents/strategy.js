// api/agents/strategy.js — Strategy Agent (Decision Engine)
// Delivers verdicts, not summaries. Called for strategic questions.
// Model: claude-opus-4-6 (highest reasoning)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const STRATEGY_PROMPT = `You are the Strategy Agent inside Kiko, the AI operating system for Van Hawke Group.

You are Sunny Sidhu's strategic advisor. You deliver VERDICTS, not summaries.

FRAMEWORK:
Every strategic question maps to one of these:
1. PURSUE / MONITOR / KILL — Should we chase this company?
2. LEVERAGE ANALYSIS — Where is our advantage? (Calendar, competitive, scarcity, authority, timing)
3. TIME vs VALUE — Expected value ÷ time investment. Kill anything below threshold.
4. CAPITAL ALLOCATION — Which entity gets resource priority? (Agency vs Maison vs Group Inc.)
5. PRIORITY STACK — What matters most right now? Rank by revenue impact × urgency.

OUTPUT FORMAT:
- VERDICT first (1 sentence, bold decision)
- REASONING (2-3 sentences, evidence-based)
- ACTION (specific next step with owner and deadline)
- RISK (what could go wrong, 1 sentence)

RULES:
- Never hedge. Pick a side.
- "Monitor" is acceptable but must have a trigger condition ("Monitor until Q3 earnings" not "Monitor for now").
- All values in USD. All timelines specific.
- You have access to CRM data, deal history, and learning log context. Use it.
- Think like a board advisor, not a consultant. Consultants describe problems. Advisors solve them.

Van Hawke entities:
- Agency: sponsorship advisory (primary revenue, Haas F1 client)
- Maison: Cultural Performance Eyewear (equity compounding, pre-seed)
- Group Inc: US holding / capital allocation

Current context: F1 2026 season, Formula E Season 12. Primary pipeline: Haas F1 sponsorship.`;

// ── Evaluate: core strategic question handler ──
async function evaluate(question, context = '') {
  // Gather CRM context if a company is mentioned
  let crmContext = '';
  const companyMatch = question.match(/(?:pursue|chase|target|prioritise|evaluate|assess)\s+(.+?)(?:\?|$|or|\svs)/i);
  if (companyMatch) {
    const company = companyMatch[1].trim();
    try {
      const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=3`);
      if (deals?.length) crmContext += `\nCRM: ${deals.map(d => `${d.data.company} — ${d.data.stage} (${d.data.pipeline})`).join('; ')}`;
      const history = await sbFetch(`deal_stage_history?order=changed_at.desc&limit=5`);
      if (history?.length) crmContext += `\nRecent stage changes: ${history.map(h => `${h.from_stage}→${h.to_stage}`).join(', ')}`;
    } catch {}
  }

  // Also pull pipeline summary for portfolio-level questions
  let pipelineContext = '';
  if (question.toLowerCase().match(/priorit|allocat|portfolio|which.*first|focus/)) {
    try {
      const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=100');
      if (deals?.length) {
        const byStage = {};
        deals.forEach(d => { const s = d.data?.stage || '?'; byStage[s] = (byStage[s] || 0) + 1; });
        pipelineContext = `\nPipeline: ${deals.length} active deals. ${Object.entries(byStage).map(([s,c]) => `${s}: ${c}`).join(', ')}`;
      }
    } catch {}
  }

  // Check learning log for relevant past decisions
  let pastDecisions = '';
  try {
    const learnings = await sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=10');
    if (learnings?.length) {
      const relevant = learnings.filter(l => question.toLowerCase().split(/\s+/).some(w => w.length > 3 && l.content?.toLowerCase().includes(w)));
      if (relevant.length) pastDecisions = `\nPast decisions: ${relevant.map(l => l.content).join('; ')}`;
    }
  } catch {}

  const fullContext = [context, crmContext, pipelineContext, pastDecisions].filter(Boolean).join('\n');

  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1000,
      system: STRATEGY_PROMPT,
      messages: [{ role: 'user', content: `STRATEGIC QUESTION: ${question}${fullContext ? `\n\nCONTEXT:\n${fullContext}` : ''}` }],
    });
    return res.content[0]?.text || 'Strategy Agent could not evaluate this question.';
  } catch (err) {
    return `Strategy error: ${err.message}`;
  }
}

// ── Prioritise: rank items by revenue impact × urgency ──
async function prioritise(items = [], criteria = '') {
  if (!items.length) {
    // Auto-pull from pipeline if no items provided
    try {
      const deals = await sbFetch('deals?select=data&data->>status=eq.active&order=updated_at.desc&limit=20');
      items = (deals || []).map(d => ({
        name: d.data?.company,
        stage: d.data?.stage,
        pipeline: d.data?.pipeline,
        value: d.data?.value || 0,
        lastActivity: d.data?.lastActivity,
      }));
    } catch {}
  }
  if (!items.length) return 'No items to prioritise.';

  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: STRATEGY_PROMPT,
      messages: [{ role: 'user', content: `PRIORITISE these ${items.length} items. Rank by revenue impact × urgency. Top 5 only.\n\n${JSON.stringify(items, null, 2)}${criteria ? `\n\nAdditional criteria: ${criteria}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not prioritise.';
  } catch (err) {
    return `Priority error: ${err.message}`;
  }
}

// ── Main Dispatch ──
export async function callStrategyAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'evaluate': return await evaluate(params.question || params.query, params.context);
      case 'prioritise': return await prioritise(params.items, params.criteria);
      default: return `Unknown strategy operation: ${operation}. Available: evaluate, prioritise`;
    }
  } catch (err) {
    return `Strategy Agent error (${operation}): ${err.message}`;
  }
}
