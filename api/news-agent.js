// api/news-agent.js — RSS feed aggregator + Haiku intelligence classifier
// Fetches from 10+ sports business/F1/sponsorship RSS feeds, deduplicates, classifies via Haiku
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// RSS Feed sources — free, public, no API keys needed
const FEEDS = [
  { name: 'Formula1.com', url: 'https://www.formula1.com/en/latest/all.xml', category: 'f1_general' },
  { name: 'Motorsport.com F1', url: 'https://www.motorsport.com/rss/f1/news/', category: 'f1_general' },
  { name: 'Autosport F1', url: 'https://www.autosport.com/rss/feed/f1', category: 'f1_general' },
  { name: 'RaceFans', url: 'https://www.racefans.net/feed/', category: 'f1_general' },
  { name: 'Racer.com F1', url: 'https://racer.com/f1/feed/', category: 'f1_general' },
  { name: 'PlanetF1', url: 'https://www.planetf1.com/feed/', category: 'f1_general' },
  { name: 'SportsPro Media', url: 'https://www.sportspromedia.com/feed/', category: 'sports_sponsorship' },
  { name: 'SportsMint Media', url: 'https://www.sportsmintmedia.com/feed/', category: 'sports_sponsorship' },
  { name: 'InsiderSport', url: 'https://insidersport.com/feed/', category: 'sports_sponsorship' },
  { name: 'FIA', url: 'https://www.fia.com/rss/news', category: 'f1_general' },
];

// Simple XML RSS parser (no dependencies)
function parseRSS(xml, sourceName, sourceUrl) {
  const articles = [];
  // Handle both RSS 2.0 (<item>) and Atom (<entry>) formats
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return (m?.[1] || m?.[2] || '').trim().replace(/<[^>]*>/g, '').trim();
    };
    const getAttr = (tag, attr) => {
      const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
      return m?.[1] || '';
    };
    const title = get('title');
    const link = get('link') || getAttr('link', 'href');
    const desc = get('description') || get('summary') || get('content');
    const pubDate = get('pubDate') || get('published') || get('updated') || get('dc:date');
    const author = get('author') || get('dc:creator');
    const imageMatch = block.match(/<media:content[^>]*url="([^"]*)"/) || block.match(/<enclosure[^>]*url="([^"]*)"/) || block.match(/<img[^>]*src="([^"]*)"/);
    if (title && link) {
      articles.push({
        source_name: sourceName, source_url: sourceUrl, article_url: link,
        title: title.slice(0, 500), summary: desc?.slice(0, 1000) || '',
        image_url: imageMatch?.[1] || null, author: author || null,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        org_id: ORG_ID,
      });
    }
  }
  return articles;
}

// Fetch all RSS feeds and return deduplicated articles
async function fetchAllFeeds() {
  const allArticles = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Vela-Platform/1.0 (RSS Reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { console.log(`[News] ${feed.name}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const articles = parseRSS(xml, feed.name, feed.url);
      allArticles.push(...articles);
    } catch (e) { console.log(`[News] ${feed.name}: ${e.message}`); }
  }
  return allArticles;
}

// Store articles, skip duplicates via article_url_hash unique constraint
async function storeArticles(articles) {
  let stored = 0, skipped = 0;
  for (const a of articles) {
    const { error } = await supabase.from('news_articles').upsert(a, { onConflict: 'article_url_hash', ignoreDuplicates: true });
    if (error) skipped++; else stored++;
  }
  return { stored, skipped, total: articles.length };
}

// Classify articles via Claude Haiku — category, relevance, deal signals
async function classifyArticle(article, companyNames) {
  const prompt = `Classify this sports business article. Return ONLY valid JSON (no markdown, no backticks):
Title: ${article.title}
Source: ${article.source_name}
Summary: ${(article.summary || '').slice(0, 800)}

Context: Van Hawke Group is an F1/Formula E sponsorship advisory firm. Key clients: Haas F1, Alpine F1. Target sectors: cybersecurity, AI, cloud, semiconductors, fintech, robotics, legal, banking.

Return JSON:
{
  "category": "f1_sponsorship|sports_sponsorship|formula_e|f1_general|market_activity|brand_ambassador|team_news|regulatory",
  "relevance_score": 0-10,
  "deal_signal": true/false,
  "key_topics": ["topic1", "topic2"],
  "sentiment": "positive|neutral|negative",
  "matched_companies": []
}

Relevance scoring:
- 10: Directly mentions Haas F1, Van Hawke, or a company in Van Hawke's CRM
- 8-9: New F1/Formula E sponsorship deal announcement
- 6-7: Sports sponsorship deal in a target sector (cyber, AI, cloud, fintech)
- 4-5: General F1 commercial/business news
- 2-3: General sports business news
- 0-1: Irrelevant (race results, driver gossip, non-commercial)

For matched_companies, check if any of these company names appear in the title or summary: ${companyNames.slice(0, 100).join(', ')}
Return matched names as strings in the array.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) { console.error('[News] Haiku classify error:', e.message); return null; }
}

// Process unclassified articles
async function classifyBatch(limit = 15) {
  // Get company names from CRM for matching
  const { data: companies } = await supabase.from('companies').select("data->name").limit(200);
  const companyNames = (companies || []).map(c => c.name).filter(Boolean);

  const { data: articles } = await supabase.from('news_articles')
    .select('*').eq('is_processed', false).order('published_at', { ascending: false }).limit(limit);
  if (!articles?.length) return { classified: 0 };

  let classified = 0;
  for (const article of articles) {
    const intel = await classifyArticle(article, companyNames);
    if (intel) {
      // Look up matched company IDs
      const matchedCompanies = [];
      for (const name of (intel.matched_companies || [])) {
        const { data: match } = await supabase.from('companies')
          .select('id, data->name').ilike('data->>name', `%${name}%`).limit(1);
        if (match?.[0]) matchedCompanies.push({ id: match[0].id, name: match[0].name });
      }
      await supabase.from('news_articles').update({
        category: intel.category, relevance_score: intel.relevance_score,
        deal_signal: intel.deal_signal || false, key_topics: intel.key_topics || [],
        sentiment: intel.sentiment, matched_companies: matchedCompanies,
        is_processed: true,
      }).eq('id', article.id);
      // Create Kiko alert if high relevance deal signal
      if (intel.deal_signal && intel.relevance_score >= 7) {
        await supabase.from('kiko_alerts').insert({
          org_id: ORG_ID, type: 'deal_signal', severity: 'high',
          title: `Deal Signal: ${article.title.slice(0, 100)}`,
          body: `${article.source_name}: ${article.summary?.slice(0, 200)}`,
          metadata: { article_id: article.id, url: article.article_url, matched_companies: matchedCompanies },
        });
      }
      classified++;
    }
  }
  return { classified, total: articles.length };
}

// API handler
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const action = req.body?.action || req.query?.action;

  // FETCH — pull RSS feeds and store new articles
  if (action === 'fetch') {
    const articles = await fetchAllFeeds();
    const result = await storeArticles(articles);
    return res.json({ action: 'fetch', ...result });
  }

  // CLASSIFY — run Haiku on unclassified articles
  if (action === 'classify') {
    const limit = req.body?.limit || 15;
    const result = await classifyBatch(limit);
    return res.json({ action: 'classify', ...result });
  }

  // SYNC — fetch + classify in one call (for cron)
  if (action === 'sync') {
    const articles = await fetchAllFeeds();
    const storeResult = await storeArticles(articles);
    const classifyResult = await classifyBatch(20);
    return res.json({ action: 'sync', fetched: storeResult, classified: classifyResult });
  }

  // LIST — get articles for frontend (requires action=list explicitly)
  if (action === 'list') {
    const category = req.query?.category;
    const page = parseInt(req.query?.page || '1');
    const limit = parseInt(req.query?.limit || '30');
    const offset = (page - 1) * limit;
    const dealSignalsOnly = req.query?.deals === 'true';

    let query = supabase.from('news_articles')
      .select('id, title, source_name, article_url, image_url, published_at, category, relevance_score, deal_signal, matched_companies, key_topics, sentiment, is_read, is_starred', { count: 'exact' })
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== 'all') query = query.eq('category', category);
    if (dealSignalsOnly) query = query.eq('deal_signal', true);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Stats
    const { data: stats } = await supabase.rpc('news_stats').catch(() => ({ data: null }));

    return res.json({ articles: data || [], total: count || 0, page, stats });
  }

  // STAR/READ — toggle state
  if (action === 'star' || action === 'read') {
    const { id, value } = req.body;
    const field = action === 'star' ? 'is_starred' : 'is_read';
    await supabase.from('news_articles').update({ [field]: value }).eq('id', id);
    return res.json({ ok: true });
  }

  // Default for GET (cron trigger) — run sync
  if (req.method === 'GET' && !action) {
    const articles = await fetchAllFeeds();
    const storeResult = await storeArticles(articles);
    const classifyResult = await classifyBatch(20);
    return res.json({ action: 'cron-sync', fetched: storeResult, classified: classifyResult });
  }

  return res.status(400).json({ error: 'action required: fetch|classify|sync|list|star|read' });
}
