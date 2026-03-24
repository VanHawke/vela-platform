// api/agents/content.js — Content Agent
// Authority content: LinkedIn, SponsorSignal, case studies, newsletters.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const CONTENT_PROMPT = `You are the Content Agent inside Kiko, the AI operating system for Van Hawke Group.
You generate authority content. Board-level language. No hashtag spam.

SPONSORSIGNAL FORMAT (LinkedIn posts):
1. Headline (bold, attention-grabbing)
2. Brand Signals (2-3 recent sponsorship moves in the market)
3. Sponsorship Move of the Week (one standout deal/event)
4. Van Hawke Viewpoint (Sunny's strategic perspective — 2-3 sentences, opinionated)
5. Closing question/CTA (engagement driver)

RULES:
- Use "intelligent age" not "AI generation"
- Never use "hope you're well" or generic openings
- Van Hawke Viewpoint section ALWAYS included
- Reference current F1 2026 calendar accurately
- Board-level vocabulary: "capital allocation", "category control", "scarcity by design"
- No more than 3 hashtags, placed at the end
- Keep under 1300 characters for LinkedIn optimal engagement`;

async function generate(type, topic, context = '') {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: CONTENT_PROMPT,
      messages: [{ role: 'user', content: `Generate a ${type} about: ${topic}${context ? `\n\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not generate content.';
  } catch (err) { return `Content error: ${err.message}`; }
}

export async function callContentAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'linkedin': return await generate('SponsorSignal LinkedIn post', params.topic || params.query, params.context);
      case 'case_study': return await generate('case study', params.topic || params.query, params.context);
      case 'newsletter': return await generate('newsletter section', params.topic || params.query, params.context);
      case 'custom': return await generate(params.type || 'content piece', params.topic || params.query, params.context);
      default: return `Unknown content operation: ${operation}. Available: linkedin, case_study, newsletter, custom`;
    }
  } catch (err) { return `Content Agent error (${operation}): ${err.message}`; }
}
