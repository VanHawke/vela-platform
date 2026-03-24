// api/agents/product-dev.js — Product Development Agent (Van Hawke Maison)
// Eyewear product lifecycle, drop schedules, supplier coordination.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const PRODUCT_PROMPT = `You are the Product Development Agent for Van Hawke Maison.
Category: Cultural Performance Eyewear. Distinct from luxury eyewear and functional performance (Oakley).
Archive 01 is the proof-of-concept. Haas F1 collaboration (multi-year, 2026-2028).
Formula E drops: Mexico, Jeddah, Berlin, Monaco, Tokyo E-Prix.
Frame types: Hero, Access, Gen4 Hero.
Team: Giacomo (Lead Product Designer, ex-Kering/Gucci/Chloé/D&G), Temi (Visual Director).
Never use standalone "performance" — always "Cultural Performance Eyewear".`;

async function analyse(question, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: PRODUCT_PROMPT,
      messages: [{ role: 'user', content: `${question}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Product Dev error: ${err.message}`; }
}

export async function callProductDevAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analyse(params.question || params.query, params.context);
      default: return `Unknown product operation: ${operation}. Available: analyse`;
    }
  } catch (err) { return `Product Dev Agent error (${operation}): ${err.message}`; }
}
