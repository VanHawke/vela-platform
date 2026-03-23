// api/kiko-research.js — Multi-agent parallel research
// Spawns 3 specialist Claude instances in parallel, merges into one synthesised brief
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-20250514';

const AGENTS = [
  {
    name: 'Company & Financial Analyst',
    system: `You are a financial intelligence analyst. Research this company/topic focusing on:
- Company overview, founding, HQ, size, revenue
- Recent funding rounds, valuation, investors
- Financial health indicators, growth trajectory
- Key competitors and market position
Be factual. Use web search aggressively. Return dense, structured intelligence in 200-300 words.`,
  },
  {
    name: 'News & Leadership Analyst', 
    system: `You are a news and leadership intelligence analyst. Research this company/topic focusing on:
- Recent news (last 6 months) — partnerships, launches, acquisitions
- Key leadership: CEO, CMO, VP Marketing, Head of Partnerships
- Leadership changes, hires, departures
- Social media presence and brand sentiment
Be factual. Use web search aggressively. Return dense, structured intelligence in 200-300 words.`,
  },
  {
    name: 'Partnership & Sponsorship Analyst',
    system: `You are a sponsorship and partnership intelligence analyst for a Formula 1 sponsorship advisory. Research this company/topic focusing on:
- Existing sports/entertainment sponsorships
- Marketing spend indicators and brand activation strategies
- F1 or motorsport connections (current or potential)
- Partnership signals: expansion plans, new markets, brand repositioning
- Fit for Haas F1 sponsorship (cultural alignment, budget tier, category availability)
Be factual. Use web search aggressively. Return dense, structured intelligence in 200-300 words.`,
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { query, userEmail } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();
  const write = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    write({ toolStatus: 'Launching 3 research agents in parallel...' });

    // Phase 1: Run 3 agents in parallel
    const agentPromises = AGENTS.map(async (agent, i) => {
      write({ toolStatus: `Agent ${i + 1}: ${agent.name}...` });
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: agent.system,
          messages: [{ role: 'user', content: `Research: ${query}` }],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        });
        // Extract text from response
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        return { agent: agent.name, result: text };
      } catch (err) {
        return { agent: agent.name, result: `Error: ${err.message}` };
      }
    });

    const results = await Promise.all(agentPromises);
    write({ toolStatus: 'All agents complete. Synthesising...' });

    // Phase 2: Synthesiser — merge all 3 agent outputs into one brief
    const synthesisPrompt = `You are Kiko, an elite intelligence briefing system for Sunny, CEO of Van Hawke Group (F1 sponsorship advisory).

Three research agents have independently analysed "${query}". Synthesise their findings into one structured intelligence brief.

AGENT RESULTS:
${results.map(r => `=== ${r.agent} ===\n${r.result}`).join('\n\n')}

FORMAT YOUR RESPONSE AS:

**OVERVIEW**
2-3 sentences on what this company/entity is.

**KEY PEOPLE**
Names, titles, relevant background. Focus on decision-makers for partnerships.

**RECENT DEVELOPMENTS**
Most significant news from last 6 months. Prioritise partnership-relevant signals.

**FINANCIAL POSITION**
Revenue, funding, growth trajectory. Be specific with numbers.

**PARTNERSHIP SIGNALS**
Existing sponsorships, marketing moves, expansion signals that indicate sponsorship appetite.

**RECOMMENDED APPROACH**
Pursue / Monitor / Deprioritise — with specific reasoning and suggested next steps.

Be direct, dense, and actionable. No fluff. Board-level communication.`;

    const synthStream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: synthesisPrompt,
      messages: [{ role: 'user', content: `Synthesise the research on: ${query}` }],
    });

    write({ toolStatus: null });
    for await (const event of synthStream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        write({ delta: event.delta.text });
      }
    }

    write({ meta: { done: true, model: MODEL, agents: results.length, version: 'research-v1' } });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[RESEARCH] Error:', err);
    write({ delta: `\n\nResearch error: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export const config = { maxDuration: 120 }; // 2 minutes for parallel research
