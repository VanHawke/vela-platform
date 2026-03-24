// api/agents/signal.js — Signal Detection Agent
// Detects actionable triggers: funding, hiring, expansion, leadership changes.
// Model: claude-haiku-4-5-20251001 (speed — runs on cron)
import { sbFetch } from '../kiko-tools.js';

async function getRecentSignals({ days = 7, type } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let filter = `news_articles?is_processed=eq.true&published_at=gte.${since}&order=relevance_score.desc&limit=20&select=title,source_name,published_at,category,deal_signal,matched_companies,key_topics,relevance_score`;
  if (type) filter += `&category=eq.${type}`;
  const articles = await sbFetch(filter);
  if (!articles?.length) return `No signals in the last ${days} days.`;
  const signals = (articles || []).filter(a => a.deal_signal || a.relevance_score >= 7);
  let out = `SIGNALS (${signals.length} high-relevance from ${articles.length} articles, last ${days}d):\n\n`;
  for (const a of signals.slice(0, 15)) {
    const ago = Math.floor((Date.now() - new Date(a.published_at)) / 3600000);
    const time = ago < 24 ? `${ago}h` : `${Math.floor(ago / 24)}d`;
    out += `${a.deal_signal ? '🔴' : '⭐'} ${a.title} (${a.source_name}, ${time} ago)`;
    if (a.matched_companies?.length) out += ` — ${a.matched_companies.map(c => c.name || c).join(', ')}`;
    out += '\n';
  }
  return out;
}

export async function callSignalAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'recent': return await getRecentSignals(params);
      default: return `Unknown signal operation: ${operation}. Available: recent`;
    }
  } catch (err) { return `Signal Agent error (${operation}): ${err.message}`; }
}
