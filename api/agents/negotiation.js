// api/agents/negotiation.js — Negotiation Agent
// Protects margin and deal value during active negotiations.
// Model: claude-opus-4-6 (needs highest reasoning for adversarial thinking)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const NEGOTIATION_PROMPT = `You are the Negotiation Agent inside Kiko, the AI operating system for Van Hawke Group.

You protect margin and deal value. You think adversarially — always considering what the other side wants, what they'll try, and how to counter.

PRINCIPLES:
1. ANCHOR HIGH. The first number sets the frame. Never let the other side anchor first.
2. CONCESSIONS are TRADES, not gifts. Every concession must extract something in return.
3. SILENCE is a weapon. Not responding is a valid strategy. Urgency kills margin.
4. SCARCITY IS REAL. One partner per category. No unbundling. Closed system.
5. WALK-AWAY is always an option. A bad deal is worse than no deal.

SPONSORSHIP PRICING CONTEXT:
- F1 Title: $25-60M/year
- F1 Primary: $8-20M/year
- F1 Official Supplier: $1-5M/year
- Category exclusivity is non-negotiable — this is the pricing power
- Multi-year deals preferred (3-5 year terms)
- Value-in-kind can supplement but never replace cash

WHEN ANALYSING A NEGOTIATION:
1. MAP THE POWER — Who needs this deal more? What are their alternatives?
2. IDENTIFY LEVERAGE — Calendar pressure, competitive interest, budget cycles, public commitments
3. ASSESS CONCESSION HISTORY — What have we already given? What have they given?
4. RECOMMEND POSITION — Specific number, specific terms, specific trade
5. PREPARE COUNTERS — For their 3 most likely responses

OUTPUT:
- POSITION (what we should ask for)
- FLOOR (walk-away number)
- TRADES (what we can give, what we get back)
- SILENCE STRATEGY (when to NOT respond)
- COUNTER PREP (their likely moves + our responses)

Never use soft language. "We could consider..." → "Our position is..." `;

// ── Analyse a negotiation position ──
async function analysePosition(situation, context = '') {
  // Pull deal + learning log context
  let crmContext = '';
  const companyMatch = situation.match(/(?:with|for|at|from)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|\s(?:they|came|offered|want|asked))/);
  if (companyMatch) {
    const company = companyMatch[1].trim();
    try {
      const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=2`);
      if (deals?.length) crmContext += `Deal: ${deals.map(d => `${d.data.company} — ${d.data.stage}, ${d.data.pipeline}`).join('; ')}\n`;
      const learnings = await sbFetch('kiko_learning_log?order=created_at.desc&limit=20');
      const relevant = (learnings || []).filter(l => l.content?.toLowerCase().includes(company.toLowerCase()));
      if (relevant.length) crmContext += `Past intel: ${relevant.map(l => l.content).join('; ')}\n`;
    } catch {}
  }

  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1200,
      system: NEGOTIATION_PROMPT,
      messages: [{ role: 'user', content: `NEGOTIATION SITUATION:\n${situation}${crmContext ? `\n\nCRM CONTEXT:\n${crmContext}` : ''}${context ? `\n\nADDITIONAL CONTEXT:\n${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Negotiation Agent could not analyse this position.';
  } catch (err) {
    return `Negotiation error: ${err.message}`;
  }
}

// ── Counter-offer: respond to a specific proposal ──
async function counterOffer(theirOffer, ourPosition = '', dealContext = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: NEGOTIATION_PROMPT,
      messages: [{ role: 'user', content: `They offered: ${theirOffer}\n${ourPosition ? `Our position: ${ourPosition}\n` : ''}${dealContext ? `Context: ${dealContext}\n` : ''}\nBuild a counter-position. Include: what we counter with, what we trade, what we hold firm on, and the exact language to use.` }],
    });
    return res.content[0]?.text || 'Could not generate counter.';
  } catch (err) {
    return `Counter error: ${err.message}`;
  }
}

// ── Main Dispatch ──
export async function callNegotiationAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analysePosition(params.situation || params.query, params.context);
      case 'counter': return await counterOffer(params.their_offer, params.our_position, params.context);
      default: return `Unknown negotiation operation: ${operation}. Available: analyse, counter`;
    }
  } catch (err) {
    return `Negotiation Agent error (${operation}): ${err.message}`;
  }
}
