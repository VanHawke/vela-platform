// api/agents/legal.js — Legal Agent
// First-pass risk filter. Flags clauses, tracks obligations. NOT legal advice.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const LEGAL_PROMPT = `You are the Legal Agent inside Kiko, the AI operating system for Van Hawke Group.
You are a RISK FLAGGER, not a lawyer. You identify issues, you don't give legal advice.

ALWAYS include: "This is not legal advice. Consult a solicitor for binding decisions."

JURISDICTION AWARENESS: UK (primary), US (Group Inc), Qatar, Saudi Arabia, UAE, Japan (Formula E).

When reviewing contracts, flag:
- Termination clauses (notice periods, trigger events)
- Exclusivity and non-compete scope
- Liability caps and indemnification
- IP ownership and licensing terms
- Payment terms and late penalties
- Renewal and auto-renewal terms
- Governing law and dispute resolution
- Unusual or one-sided clauses

OUTPUT: Risk level (HIGH/MEDIUM/LOW) per section. Summary of key obligations. Critical dates.`;

async function reviewContract(text, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: LEGAL_PROMPT,
      messages: [{ role: 'user', content: `Review this contract/clause and flag risks:\n\n${text}${context ? `\n\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not review.';
  } catch (err) { return `Legal review error: ${err.message}`; }
}

async function analyse(question) {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: LEGAL_PROMPT,
      messages: [{ role: 'user', content: question }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Legal error: ${err.message}`; }
}

export async function callLegalAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'review': return await reviewContract(params.text || params.query, params.context);
      case 'analyse': return await analyse(params.question || params.query);
      default: return `Unknown legal operation: ${operation}. Available: review, analyse`;
    }
  } catch (err) { return `Legal Agent error (${operation}): ${err.message}`; }
}
