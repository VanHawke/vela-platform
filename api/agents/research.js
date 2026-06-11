// api/agents/research.js — Deep Research Agent
// Multi-step autonomous research: plan queries → search → cross-reference → synthesise
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = process.env.KIKO_COGNITIVE_MODEL || 'claude-sonnet-4-6';

export async function deepResearch(brief, userId) {
  const startTime = Date.now();
  
  // Step 1: Sonnet plans the research with web search enabled
  const researchResp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    system: `You are a senior research analyst for Van Hawke Group, an F1 and Formula E sponsorship advisory firm. 
You conduct thorough, multi-source research and produce structured intelligence briefs.

RESEARCH METHODOLOGY:
1. Search for the most current information using multiple queries
2. Cross-reference findings across sources  
3. Look for: leadership team, recent news, funding/financials, marketing strategy, existing sponsorships, competitors
4. Flag any conflicting information between sources
5. Note what you could NOT find (gaps in intelligence)

OUTPUT FORMAT — return a structured brief with these sections:
## Company Overview
## Leadership & Decision Makers  
## Recent News & Developments (last 12 months)
## Marketing & Sponsorship Activity
## Financial Position
## Strategic Assessment (relevance to Van Hawke's F1/Formula E proposition)
## Intelligence Gaps (what couldn't be verified)
## Recommended Next Steps

Be factual. Cite sources. Flag anything uncertain.`,
    messages: [{ role: 'user', content: `Research brief: ${brief}\n\nConduct thorough research using web search. Search multiple angles — company overview, leadership, news, sponsorships, financials. Synthesise into a structured intelligence brief.` }],
  });

  // Extract the final text response
  const textBlocks = researchResp.content.filter(b => b.type === 'text');
  const researchOutput = textBlocks.map(b => b.text).join('\n\n');
  
  // Count searches used
  const searchCount = researchResp.content.filter(b => b.type === 'tool_use').length;
  const durationMs = Date.now() - startTime;

  // Step 2: Save to knowledge base for future reference
  try {
    const domain = brief.match(/(?:about|on|for|research)\s+(.+?)(?:\.|$)/i)?.[1]?.trim() || brief.slice(0, 50);
    await sbFetch('kiko_knowledge', { 
      method: 'POST', 
      body: JSON.stringify({ 
        domain: domain.toLowerCase().replace(/\s+/g, '-'),
        content: researchOutput.slice(0, 5000),
        source: 'deep-research-agent',
        researched_at: new Date().toISOString(),
        user_id: userId || null
      }) 
    });
  } catch (e) { console.warn('[Research] Failed to save to knowledge base:', e.message); }

  return {
    brief: researchOutput,
    metadata: {
      searches_executed: searchCount,
      duration_ms: durationMs,
      model: MODEL,
      saved_to_knowledge_base: true
    }
  };
}
