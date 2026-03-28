// api/agents/ip.js — IP & Licensing Agent with portfolio context
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const IP_PROMPT = `You are the IP & Licensing Agent for Van Hawke Group.
Van Hawke Group Inc (US holding) acquires, licenses, and revives dormant IP under the Micro-ABG Model.
Entities: Van Hawke Agency (F1 sponsorship advisory), Van Hawke Maison Inc (Cultural Performance Eyewear), Van Hawke Group Inc (IP studio/holding).
Key IP: "Cultural Performance Eyewear" category, "Intelligent Design Loop" methodology, Van Hawke brand marks.
Cover: trademarks, designs, copyrights, licensing deals (royalty rates 5-15%, territories, exclusivity).
The intelligent age (not "AI generation") is the brand positioning era.
Output: ASSET ASSESSMENT → PROTECTION STRATEGY → MONETISATION PATH → RISK FLAGS.`;

async function analyse(question, context = '') {
  let businessContext = '';
  try {
    const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=10');
    const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=partner_name,team_id&limit=20');
    if (deals?.length) {
      businessContext = `\n\nActive deals (${deals.length}): ${deals.slice(0, 5).map(d => d.data?.company).filter(Boolean).join(', ')}`;
    }
    if (partnerships?.length) {
      businessContext += `\nActive F1 partnerships: ${partnerships.length}`;
    }
  } catch {}

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: IP_PROMPT,
      messages: [{ role: 'user', content: `${question}${businessContext}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `IP error: ${err.message}`; }
}

export async function callIPAgent(operation, params = {}) {
  try {
    return await analyse(params.question || params.query || params.instruction || operation, params.context);
  } catch (err) { return `IP Agent error: ${err.message}`; }
}
