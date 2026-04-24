// api/agents/legal.js — Legal Agent with CRM context
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const LEGAL_PROMPT = `You are the Legal Agent for Van Hawke Group.
You handle: contract review, clause analysis, risk flagging, obligation tracking, IP protection.
Van Hawke Group structure: Van Hawke Agency (UK), Van Hawke Maison Inc (US), Van Hawke Group Inc (US holding/IP).
Always flag: liability caps, exclusivity conflicts, termination clauses, IP assignment, non-compete scope.
Output specific risks with severity (HIGH/MEDIUM/LOW) and recommended action.`;

async function analyse(question, context = '') {
  // Pull relevant deal/contract context from CRM
  let crmContext = '';
  try {
    const words = (question || '').split(/\s+/).filter(w => w.length > 3 && w[0] === w[0].toUpperCase());
    if (words.length) {
      const deals = await sbFetch(`deals?select=data&or=(data->>company.ilike.*${encodeURIComponent(words[0])}*)&limit=3`);
      if (deals?.length) {
        crmContext = '\n\nCRM CONTEXT:';
        for (const d of deals) {
          const dd = d.data || {};
          crmContext += `\n• ${dd.company} — Stage: ${dd.stage}, Value: $${dd.value || '?'}, Contact: ${dd.contactName || '?'}`;
        }
      }
    }
    // Pull any documents tagged as legal
    const docs = await sbFetch(`documents?select=name,category&category=ilike.*legal*&limit=5`);
    if (docs?.length) {
      crmContext += '\n\nLegal documents on file: ' + docs.map(d => d.name).join(', ');
    }
  } catch {}

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1200,
      system: LEGAL_PROMPT,
      messages: [{ role: 'user', content: `${question}${crmContext}${context ? `\nAdditional context: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Legal error: ${err.message}`; }
}

export async function callLegalAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': case 'review': return await analyse(params.question || params.query || params.instruction, params.context);
      default: return await analyse(params.question || params.query || operation, params.context);
    }
  } catch (err) { return `Legal Agent error: ${err.message}`; }
}
