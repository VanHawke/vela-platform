// api/agents/ip.js — IP & Licensing Agent
// IP portfolio, licensing opportunities, dormant IP acquisition.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const IP_PROMPT = `You are the IP & Licensing Agent for Van Hawke Group.
You manage intellectual property and licensing opportunities under the Micro-ABG Model.
Van Hawke Group Inc (US holding) acquires, licenses, and revives dormant IP.
Cover: trademarks, designs, copyrights, licensing deals (royalty rates, territories, exclusivity).`;

async function analyse(question, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: IP_PROMPT,
      messages: [{ role: 'user', content: `${question}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `IP error: ${err.message}`; }
}

export async function callIPAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analyse(params.question || params.query, params.context);
      default: return `Unknown IP operation: ${operation}. Available: analyse`;
    }
  } catch (err) { return `IP Agent error (${operation}): ${err.message}`; }
}
