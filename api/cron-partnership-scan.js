// api/cron-partnership-scan.js — Partnership Scanner Agent v2
// Phase 1: Scan news_articles for deal signals (RSS feed)
// Phase 2: Web search for recent F1 partnership announcements
// Phase 3: Auto-classify + upsert + Kiko alert + activity log
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const CATEGORIES = [
  'fintech','cloud','ai_data','cybersecurity','banking','energy','telecom',
  'automotive','fashion','food_bev','watches','crypto','software','legal',
  'hospitality','gaming','health','logistics','semiconductors','robotics'
];

const TEAMS = ['Red Bull','Ferrari','McLaren','Mercedes','Aston Martin',
  'Alpine','Williams','Haas','Racing Bulls','Audi','Cadillac'];

async function classifyPartnership(text) {
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You are an F1 sponsorship data extractor. Given text about F1 partnership/sponsorship announcements, extract ALL new partnerships mentioned.

For each partnership found, output a JSON object with:
- team_id: one of: red_bull, ferrari, mclaren, mercedes, aston_martin, alpine, williams, haas, racing_bulls, audi, cadillac
- partner_name: Clean official company/brand name
- category_id: Best fit from: ${CATEGORIES.join(', ')}
- tier: One of: title, principal, official, technical, partner, supplier

Respond ONLY with a JSON array: [{"team_id":"...","partner_name":"...","category_id":"...","tier":"..."}]
If no F1 team partnerships found, respond: []`,
      messages: [{ role: 'user', content: text.slice(0, 2000) }]
    });
    const raw = resp.content[0]?.text?.trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[PartnerScan] Classification error:', e.message);
    return [];
  }
}

async function upsertPartnership(p, source) {
  if (!p.team_id || !p.partner_name) return null;
  // Check if already exists
  const { data: existing } = await supabase.from('f1_partnerships')
    .select('id').eq('team_id', p.team_id).eq('partner_name', p.partner_name).maybeSingle();

  const record = {
    team_id: p.team_id, partner_name: p.partner_name,
    category_id: p.category_id || null, tier: p.tier || 'partner',
    status: 'active', verified: false,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('f1_partnerships')
    .upsert(record, { onConflict: 'team_id,partner_name' });
  if (error) { console.error('[PartnerScan] Upsert error:', error.message); return null; }

  const isNew = !existing;
  if (isNew) {
    // Log activity
    await supabase.from('kiko_alerts').insert({
      type: 'new_partnership',
      severity: 'medium',
      title: `New: ${p.partner_name} → ${p.team_id}`,
      detail: `${p.partner_name} detected as ${p.tier || 'partner'} for ${p.team_id} (${p.category_id}). Source: ${source}`,
      entity_type: 'partnership',
      entity_name: p.partner_name,
      metadata: { ...p, source },
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return isNew ? 'new' : 'existing';
}

export default async function handler(req, res) {
  console.log('[PartnerScan] Starting partnership scan...');
  let added = 0, updated = 0, skipped = 0;
  const results = [];

  // === PHASE 1: Scan unprocessed news_articles (deal signals) ===
  const { data: articles } = await supabase.from('news_articles')
    .select('id, title, summary, intelligence')
    .or('deal_signal.eq.true,category.eq.f1_sponsorship,category.eq.sports_sponsorship')
    .order('published_at', { ascending: false })
    .limit(30);

  const unscanned = (articles || []).filter(a => !a.intelligence?.partnership_scanned);
  console.log(`[PartnerScan] Phase 1: ${unscanned.length} unscanned deal articles`);

  for (const article of unscanned) {
    const partnerships = await classifyPartnership(`Title: ${article.title}\nSummary: ${article.summary || ''}`);
    for (const p of partnerships) {
      const result = await upsertPartnership(p, article.title);
      if (result === 'new') { added++; results.push(p); }
      else if (result === 'existing') updated++;
    }
    // Mark scanned
    await supabase.from('news_articles').update({
      intelligence: { ...(article.intelligence || {}), partnership_scanned: true }
    }).eq('id', article.id);
    await new Promise(r => setTimeout(r, 500));
  }

  // === PHASE 2: Web search for fresh partnership news ===
  // Fetch Google News RSS for F1 partnership announcements
  const searchFeeds = [
    'https://news.google.com/rss/search?q=F1+team+sponsor+partner+2026&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=Formula+1+sponsorship+deal+2026&hl=en&gl=GB&ceid=GB:en',
  ];

  let webArticles = 0;
  for (const feedUrl of searchFeeds) {
    try {
      const feedRes = await fetch(feedUrl, { headers: { 'User-Agent': 'Vela-Platform/1.0' } });
      if (!feedRes.ok) continue;
      const xml = await feedRes.text();
      // Simple XML title extraction
      const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].map(m => m[1]);
      const altTitles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)].map(m => m[1]);
      const allTitles = [...titles, ...altTitles].filter(t => t && t.length > 20 && !t.includes('Google News'));

      for (const title of allTitles.slice(0, 10)) {
        // Check if already in news_articles
        const { data: exists } = await supabase.from('news_articles')
          .select('id').ilike('title', `%${title.slice(0, 50)}%`).maybeSingle();
        if (exists) continue;

        const partnerships = await classifyPartnership(title);
        for (const p of partnerships) {
          const result = await upsertPartnership(p, `Web: ${title}`);
          if (result === 'new') { added++; results.push(p); webArticles++; }
          else if (result === 'existing') updated++;
        }
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { console.error('[PartnerScan] Feed error:', e.message); }
  }
  console.log(`[PartnerScan] Phase 2: ${webArticles} new from web search`);

  // === PHASE 3: Update scan timestamp on all teams ===
  await supabase.from('f1_teams').update({ updated_at: new Date().toISOString() })
    .neq('id', 'none');

  const summary = {
    phase1_articles: unscanned.length,
    phase2_web: webArticles,
    new_partnerships: added,
    existing_updated: updated,
    results,
    timestamp: new Date().toISOString()
  };
  console.log('[PartnerScan] Complete:', JSON.stringify(summary));
  return res.json({ ok: true, ...summary });
}
