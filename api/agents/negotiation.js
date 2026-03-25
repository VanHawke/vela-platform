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
  // Pull deal + company enrichment + outreach history for power mapping
  let crmContext = '';
  const companyMatch = situation.match(/(?:with|for|at|from)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|\s(?:they|came|offered|want|asked))/);
  if (companyMatch) {
    const company = companyMatch[1].trim();
    const [deals, companyData, outreach, learnings] = await Promise.all([
      sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=2`).catch(() => []),
      sbFetch(`companies?select=data&data->>name=ilike.*${encodeURIComponent(company)}*&limit=1`).catch(() => []),
      sbFetch(`outreach_scores?company=ilike.*${encodeURIComponent(company)}*&order=sent_at.desc&limit=10`).catch(() => []),
      sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=30&select=content,entity_name,created_at').catch(() => []),
    ]);
    if (deals?.length) crmContext += `DEAL: ${deals.map(d => `${d.data.company} — ${d.data.stage}, ${d.data.pipeline}, value: $${(d.data.value||0).toLocaleString()}`).join('; ')}\n`;
    if (companyData?.[0]?.data) {
      const c = companyData[0].data;
      crmContext += `COMPANY POWER: ${c.name} | Revenue: ${c.revenueEst || '?'} | Employees: ${c.employees || '?'} | Funding: ${c.totalFunding || '?'} | Last Round: ${c.lastRound || '?'}\n`;
    }
    if (outreach?.length) {
      const replied = outreach.filter(s => s.outcome === 'replied').length;
      crmContext += `ENGAGEMENT: ${outreach.length} emails, ${replied} replies — ${replied > 0 ? 'they are responsive' : 'low engagement so far'}\n`;
    }
    // Match past decisions by company name, industry keywords, or negotiation-related terms
    const searchTerms = [company.toLowerCase(), ...(companyData?.[0]?.data?.industry || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)];
    const relevant = (learnings || []).filter(l => {
      const text = `${l.content || ''} ${l.entity_name || ''}`.toLowerCase();
      return searchTerms.some(t => text.includes(t));
    });
    if (relevant.length) {
      crmContext += `PAST NEGOTIATION INTEL (${relevant.length} entries — reference to show learning):\n`;
      for (const r of relevant.slice(0, 5)) {
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : '?';
        crmContext += `• [${date}] ${r.entity_name || '?'}: ${(r.content || '').slice(0, 150)}\n`;
      }
    }
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
  // Try to extract company for enrichment
  let enrichment = '';
  const text = `${theirOffer} ${ourPosition} ${dealContext}`;
  const words = text.split(/\s+/).filter(w => w.length > 2 && w[0] === w[0].toUpperCase() && /^[A-Z]/.test(w));
  for (const word of words.slice(0, 3)) {
    try {
      const companies = await sbFetch(`companies?select=data&data->>name=ilike.*${encodeURIComponent(word)}*&limit=1`);
      if (companies?.[0]?.data) {
        const c = companies[0].data;
        enrichment = `THEIR PROFILE: ${c.name} | Revenue: ${c.revenueEst || '?'} | Funding: ${c.totalFunding || '?'} | Employees: ${c.employees || '?'}\n`;
        break;
      }
    } catch {}
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: NEGOTIATION_PROMPT,
      messages: [{ role: 'user', content: `They offered: ${theirOffer}\n${ourPosition ? `Our position: ${ourPosition}\n` : ''}${enrichment}${dealContext ? `Context: ${dealContext}\n` : ''}\nBuild a counter-position. Include: what we counter with, what we trade, what we hold firm on, and the exact language to use.` }],
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
