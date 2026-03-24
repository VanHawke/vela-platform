// api/agents/website.js — Website & Product Agent
// Digital presence, landing pages, conversion flows.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function analyse(question, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: 'You are the Website Agent for Van Hawke Group. You manage digital presence, landing pages, conversion flows, SEO, and credibility assets. Output specific recommendations with implementation steps.',
      messages: [{ role: 'user', content: `${question}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Website error: ${err.message}`; }
}

export async function callWebsiteAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analyse(params.question || params.query, params.context);
      default: return `Unknown website operation: ${operation}. Available: analyse`;
    }
  } catch (err) { return `Website Agent error (${operation}): ${err.message}`; }
}
