// api/agents/content.js — Content Agent (Phase 2 Rebuild)
// Data-backed authority content. Pulls news + sponsors before composing.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const CONTENT_PROMPT = `You are the Content Agent inside Kiko, the AI operating system for Van Hawke Group.
You generate authority content grounded in REAL DATA. Board-level language. No hashtag spam.

SPONSORSIGNAL FORMAT (LinkedIn posts):
1. Headline (bold, attention-grabbing)
2. Brand Signals (2-3 recent sponsorship moves — use the REAL news data provided)
3. Sponsorship Move of the Week (one standout deal from the news data)
4. Van Hawke Viewpoint (Sunny's strategic perspective — 2-3 sentences, opinionated)
5. Closing question/CTA (engagement driver)

RULES:
- Use "intelligent age" not "AI generation"
- Never use "hope you're well" or generic openings
- Van Hawke Viewpoint section ALWAYS included
- Reference current F1 2026 calendar accurately
- Board-level vocabulary: "capital allocation", "category control", "scarcity by design"
- No more than 3 hashtags, placed at the end
- Keep under 1300 characters for LinkedIn optimal engagement
- CRITICAL: Use the real news articles and sponsor data provided. Do NOT make up examples.`;

async function gatherContext(topic) {
  const topicLower = (topic || '').toLowerCase();
  const keywords = topicLower.split(/\s+/).filter(w => w.length > 3).slice(0, 3);

  // Pull real data in parallel
  const [news, partnerships, deals] = await Promise.all([
    // Recent news matching the topic
    sbFetch(`news_articles?is_processed=eq.true&order=published_at.desc&limit=15&select=title,source_name,published_at,category,matched_companies,key_topics`),
    // Current F1 partnerships
    sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier&limit=100'),
    // Active deals that might relate
    sbFetch('deals?select=data&data->>status=eq.active&limit=50'),
  ]);

  // Filter news by topic relevance
  let relevantNews = (news || []);
  if (keywords.length) {
    relevantNews = relevantNews.filter(a => {
      const text = `${a.title} ${(a.key_topics||[]).join(' ')} ${(a.matched_companies||[]).map(c=>c.name||c).join(' ')}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    });
  }
  if (!relevantNews.length) relevantNews = (news || []).slice(0, 5); // Fallback to recent

  // Build context string
  let ctx = '';
  if (relevantNews.length) {
    ctx += `RECENT NEWS (use these as Brand Signals):\n`;
    for (const a of relevantNews.slice(0, 5)) {
      const companies = (a.matched_companies || []).map(c => c.name || c).join(', ');
      ctx += `• ${a.title} (${a.source_name}, ${new Date(a.published_at).toLocaleDateString('en-GB', {day:'numeric',month:'short'})})${companies ? ` — ${companies}` : ''}\n`;
    }
    ctx += '\n';
  }
  if (partnerships?.length) {
    ctx += `CURRENT F1 SPONSORS (${partnerships.length} active partnerships):\n`;
    const byPartner = {};
    for (const p of partnerships.slice(0, 20)) byPartner[p.partner_name] = p.tier;
    ctx += Object.entries(byPartner).slice(0, 10).map(([name, tier]) => `• ${name} [${tier}]`).join('\n');
    ctx += '\n\n';
  }
  if (deals?.length) {
    const relDeals = deals.filter(d => {
      const company = (d.data?.company || '').toLowerCase();
      return keywords.some(k => company.includes(k));
    });
    if (relDeals.length) {
      ctx += `VAN HAWKE PIPELINE (relevant deals):\n`;
      for (const d of relDeals.slice(0, 3)) ctx += `• ${d.data.company} — ${d.data.stage}\n`;
      ctx += '\n';
    }
  }
  return ctx;
}

async function generate(type, topic, extraContext = '') {
  const dataContext = await gatherContext(topic);
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: CONTENT_PROMPT,
      messages: [{ role: 'user', content: `Generate a ${type} about: ${topic}\n\n${dataContext}${extraContext ? `\nADDITIONAL CONTEXT: ${extraContext}` : ''}` }],
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
