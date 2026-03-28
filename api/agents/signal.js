// api/agents/signal.js — Signal Detection Agent (enriched)
// Detects actionable triggers: funding, hiring, expansion, leadership changes.
import { sbFetch } from '../kiko-tools.js';

async function getRecentSignals({ days = 7, type, company } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let filter = `news_articles?is_processed=eq.true&published_at=gte.${since}&order=relevance_score.desc&limit=30&select=title,source_name,published_at,category,deal_signal,matched_companies,key_topics,relevance_score`;
  if (type) filter += `&category=eq.${type}`;
  const articles = await sbFetch(filter);
  if (!articles?.length) return `No signals in the last ${days} days.`;

  let signals = (articles || []).filter(a => a.deal_signal || a.relevance_score >= 7);

  // Filter by company if specified
  if (company) {
    const compLower = company.toLowerCase();
    signals = signals.filter(a =>
      a.title?.toLowerCase().includes(compLower) ||
      (a.matched_companies || []).some(c => (c.name || c || '').toLowerCase().includes(compLower))
    );
    if (!signals.length) return `No signals found for "${company}" in the last ${days} days.`;
  }

  let out = `SIGNALS (${signals.length} high-relevance from ${articles.length} articles, last ${days}d):\n\n`;
  for (const a of signals.slice(0, 15)) {
    const ago = Math.floor((Date.now() - new Date(a.published_at)) / 3600000);
    const time = ago < 24 ? `${ago}h` : `${Math.floor(ago / 24)}d`;
    out += `${a.deal_signal ? '🔴 DEAL SIGNAL' : '⭐'} ${a.title} (${a.source_name}, ${time} ago)`;
    if (a.matched_companies?.length) out += ` — ${a.matched_companies.map(c => c.name || c).join(', ')}`;
    if (a.key_topics?.length) out += ` [${a.key_topics.slice(0, 3).join(', ')}]`;
    out += '\n';
  }

  // Cross-reference with pipeline
  const dealCompanies = new Set();
  try {
    const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=100');
    for (const d of (deals || [])) dealCompanies.add((d.data?.company || '').toLowerCase());
  } catch {}

  const pipelineMatches = signals.filter(a =>
    (a.matched_companies || []).some(c => dealCompanies.has((c.name || c || '').toLowerCase()))
  );
  if (pipelineMatches.length) {
    out += `\n⚡ PIPELINE MATCHES (${pipelineMatches.length}):\n`;
    for (const m of pipelineMatches) {
      const matched = (m.matched_companies || []).filter(c => dealCompanies.has((c.name || c || '').toLowerCase()));
      out += `• ${matched.map(c => c.name || c).join(', ')}: ${m.title}\n`;
    }
  }

  return out;
}

export async function callSignalAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'recent': return await getRecentSignals(params);
      case 'company': return await getRecentSignals({ ...params, company: params.company || params.query });
      default: return await getRecentSignals(params);
    }
  } catch (err) { return `Signal Agent error (${operation}): ${err.message}`; }
}
