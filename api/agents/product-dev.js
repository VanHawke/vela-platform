// api/agents/product-dev.js — Product Development Agent (Van Hawke Maison)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const PRODUCT_PROMPT = `You are the Product Development Agent for Van Hawke Maison.
Category: Cultural Performance Eyewear. Distinct from luxury eyewear and functional performance (Oakley).
Archive 01 is the proof-of-concept. Haas F1 collaboration (multi-year, 2026-2028, advanced discussion).
Formula E drops tied to race calendar: Mexico, Jeddah, Berlin, Monaco, Tokyo E-Prix.
Frame types: Hero (premium), Access (entry), Gen4 Hero (next gen).
Team: Giacomo (Lead Product Designer, ex-Kering/Gucci/Chloé/D&G), Temi (Visual Director).
Never use standalone "performance" — always "Cultural Performance Eyewear".
The Intelligent Design Loop™ is the proprietary methodology connecting cultural signals → design → production.
Pre-seed raise: $500K. Revenue model: DTC drops + race calendar alignment.
Output: PRODUCT ANALYSIS → MARKET POSITION → RECOMMENDATION → TIMELINE.`;

async function analyse(question, context = '') {
  let productContext = '';
  try {
    // Check for Haas-related deals
    const haasDeals = await sbFetch(`deals?select=data&or=(data->>company.ilike.*haas*,data->>company.ilike.*maison*)&limit=5`);
    if (haasDeals?.length) {
      productContext = '\n\nRelated deals:';
      for (const d of haasDeals) productContext += `\n• ${d.data?.company} — ${d.data?.stage} ($${d.data?.value || '?'})`;
    }
    // Check race calendar for upcoming drops
    const races = await sbFetch('race_calendar?select=name,date,city&order=date.asc&limit=10');
    if (races?.length) {
      const upcoming = races.filter(r => new Date(r.date) > new Date());
      if (upcoming.length) {
        productContext += '\n\nUpcoming races (potential drop windows):';
        for (const r of upcoming.slice(0, 5)) productContext += `\n• ${r.name} — ${r.date} (${r.city})`;
      }
    }
    // Check documents tagged as product
    const docs = await sbFetch(`documents?select=name,category&or=(category.ilike.*product*,category.ilike.*maison*,category.ilike.*eyewear*)&limit=5`);
    if (docs?.length) productContext += '\n\nProduct docs on file: ' + docs.map(d => d.name).join(', ');
  } catch {}

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1200,
      system: PRODUCT_PROMPT,
      messages: [{ role: 'user', content: `${question}${productContext}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Product Dev error: ${err.message}`; }
}

export async function callProductDevAgent(operation, params = {}) {
  try {
    return await analyse(params.question || params.query || params.instruction || operation, params.context);
  } catch (err) { return `Product Dev Agent error: ${err.message}`; }
}
