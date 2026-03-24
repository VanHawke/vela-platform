// api/agents/investment.js — Investment / Capital Strategy Agent
// Supports Van Hawke Maison raises + future capital events.
// Model: claude-opus-4-6
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const INVESTMENT_PROMPT = `You are the Investment Agent inside Kiko, the AI operating system for Van Hawke Group.
You support capital raises and investor strategy. All figures in USD.

CURRENT CONTEXT:
- Van Hawke Maison: pre-seed $500K raise, Archive 01 + Haas F1 collaboration (2026-2028)
- Category: Cultural Performance Eyewear
- Team: Giacomo (Lead Product Designer, ex-Kering/Gucci), Temi (Visual Director)

CAPABILITIES: Valuation logic, investor narrative, raise strategy, dilution modelling, return scenarios, pitch deck narrative, due diligence prep.

OUTPUT: Lead with the number/recommendation. Support with evidence. End with specific action.`;

async function analyse(question, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6', max_tokens: 1200,
      system: INVESTMENT_PROMPT,
      messages: [{ role: 'user', content: `${question}${context ? `\n\nContext: ${context}` : ''}` }],
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
