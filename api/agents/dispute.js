// api/agents/dispute.js — Dispute Agent
// Active dispute management. Procedural responses, tone discipline, leverage tracking.
// Model: claude-opus-4-6 (adversarial thinking)
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const DISPUTE_PROMPT = `You are the Dispute Agent inside Kiko, the AI operating system for Van Hawke Group.
You protect Sunny's position in active disputes. Think like a litigation strategist.

RULES:
1. NEVER make admissions. Flag any language that could be used against us.
2. Tone: professional, measured, factual. Never emotional, never aggressive.
3. Every response must be procedurally correct (format, timing, addressee).
4. Track leverage: what we hold, what they hold, what's at stake.
5. Silence is valid. Not every communication requires a response.
6. Escalation timing matters — too early weakens position, too late loses options.

OUTPUT for dispute analysis:
- POSITION SUMMARY (our stance, 2 sentences)
- LEVERAGE MAP (ours vs theirs)
- RECOMMENDED RESPONSE (exact language or "do not respond")
- RISK (what could go wrong)
- NEXT STEP (with timing)

ALWAYS include: "This is not legal advice. Consult a solicitor for binding decisions."`;

async function analyse(situation, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6', max_tokens: 1200,
      system: DISPUTE_PROMPT,
      messages: [{ role: 'user', content: `DISPUTE SITUATION:\n${situation}${context ? `\n\nCONTEXT:\n${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse dispute.';
  } catch (err) { return `Dispute error: ${err.message}`; }
}

async function draftResponse(situation, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6', max_tokens: 1000,
      system: DISPUTE_PROMPT,
      messages: [{ role: 'user', content: `Draft a response for this dispute situation. Must be procedurally correct, make no admissions, and maintain professional tone.\n\nSITUATION:\n${situation}${context ? `\n\nCONTEXT:\n${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not draft response.';
  } catch (err) { return `Dispute draft error: ${err.message}`; }
}

export async function callDisputeAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'analyse': return await analyse(params.situation || params.query, params.context);
      case 'draft': return await draftResponse(params.situation || params.query, params.context);
      default: return `Unknown dispute operation: ${operation}. Available: analyse, draft`;
    }
  } catch (err) { return `Dispute Agent error (${operation}): ${err.message}`; }
}
