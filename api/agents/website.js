// api/agents/website.js — Website & Digital Presence Agent
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const WEB_PROMPT = `You are the Website Agent for Van Hawke Group.
You manage digital presence, landing pages, conversion flows, SEO, and credibility assets.
Van Hawke properties: vanhawke.com (agency), vanhawkemaison.com (eyewear).
Key pages needed: investor page, partnership case studies, F1 team portfolio, Maison product showcase.
Brand aesthetic: dark ambient void (#0A0A0C), glassmorphism, purple (#7C5CFC) to teal (#00D4AA) gradients.
Font: 300 weight, clean, minimal. The platform (Kiko) uses this aesthetic already.
Output specific recommendations with implementation steps and priority (P1/P2/P3).`;

async function analyse(question, context = '') {
  let siteContext = '';
  try {
    // Pull pipeline data to understand what sales pages need to support
    const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=20');
    const activeCount = (deals || []).length;
    const stages = {};
    for (const d of (deals || [])) { const s = d.data?.stage || '?'; stages[s] = (stages[s] || 0) + 1; }
    siteContext = `\n\nBusiness context: ${activeCount} active deals. Stages: ${JSON.stringify(stages)}`;
    // Check content assets
    const content = await sbFetch('kiko_output_tracking?agent=eq.ask_content_agent&order=created_at.desc&limit=5&select=user_message');
    if (content?.length) {
      siteContext += `\nRecent content requests: ${content.map(c => (c.user_message || '').slice(0, 60)).join('; ')}`;
    }
  } catch {}

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1000,
      system: WEB_PROMPT,
      messages: [{ role: 'user', content: `${question}${siteContext}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Website error: ${err.message}`; }
}

export async function callWebsiteAgent(operation, params = {}) {
  try {
    return await analyse(params.question || params.query || params.instruction || operation, params.context);
  } catch (err) { return `Website Agent error: ${err.message}`; }
}
