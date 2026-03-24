// api/agents/travel.js — Travel & Logistics Agent
// F1/FE calendar alignment, travel planning, visa tracking.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const TRAVEL_PROMPT = `You are the Travel Agent inside Kiko for Van Hawke Group.
Sunny is UK-based (Weybridge). UK passport holder. Manages F1/FE race calendar travel.
Optimise for cost, minimise layovers, align with race schedule (arrive day before, depart day after).
Key destinations: Bahrain, Saudi Arabia, Australia, Japan, China, Miami, Monaco, UK, UAE, Qatar.
Visa awareness: UK passport — visa-free for most F1 destinations. Qatar/Saudi may need business visa.`;

async function planTrip(destination, context = '') {
  let raceContext = '';
  try {
    const races = await sbFetch('race_calendar?select=*&order=race_date.asc&limit=30');
    if (races?.length) {
      const relevant = races.filter(r => r.location?.toLowerCase().includes((destination || '').toLowerCase()) || r.name?.toLowerCase().includes((destination || '').toLowerCase()));
      if (relevant.length) raceContext = `\nRace: ${relevant.map(r => `${r.name} — ${r.race_date} at ${r.location}`).join('; ')}`;
    }
  } catch {}
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: TRAVEL_PROMPT,
      messages: [{ role: 'user', content: `Plan travel to ${destination}.${raceContext}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not plan trip.';
  } catch (err) { return `Travel error: ${err.message}`; }
}

export async function callTravelAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'plan': return await planTrip(params.destination || params.query, params.context);
      default: return `Unknown travel operation: ${operation}. Available: plan`;
    }
  } catch (err) { return `Travel Agent error (${operation}): ${err.message}`; }
}
