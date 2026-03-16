// api/cron-partnership-scan.js — Partnership Scanner Agent
// Runs daily, cross-references news_articles for new partnership announcements
// Auto-classifies and updates f1_partnerships table
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const CATEGORIES = [
  'fintech','cloud','ai_data','cybersecurity','banking','energy','telecom',
  'automotive','fashion','food_bev','watches','crypto','software','legal',
  'hospitality','gaming','health','logistics','semiconductors','robotics'
];

const TEAM_ALIASES = {
  'red bull': 'red_bull', 'redbull': 'red_bull', 'oracle red bull': 'red_bull',
  'ferrari': 'ferrari', 'scuderia ferrari': 'ferrari', 'hp ferrari': 'ferrari',
  'mclaren': 'mclaren', 'mastercard mclaren': 'mclaren',
  'mercedes': 'mercedes', 'petronas mercedes': 'mercedes', 'silver arrows': 'mercedes',
  'aston martin': 'aston_martin', 'aramco aston martin': 'aston_martin',
  'alpine': 'alpine', 'bwt alpine': 'alpine',
  'williams': 'williams', 'atlassian williams': 'williams',
  'haas': 'haas', 'tgr haas': 'haas',
  'racing bulls': 'racing_bulls', 'visa cash app': 'racing_bulls', 'rb': 'racing_bulls',
  'audi': 'audi', 'revolut audi': 'audi', 'sauber': 'audi',
  'cadillac': 'cadillac',
};

async function classifyPartnership(articleTitle, articleSummary) {
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are an F1 sponsorship data extractor. Given an article about an F1 partnership announcement, extract:
1. team_id: Which F1 team (use these IDs: red_bull, ferrari, mclaren, mercedes, aston_martin, alpine, williams, haas, racing_bulls, audi, cadillac)
2. partner_name: The company/brand name (clean, official name)
3. category_id: Best fit from: ${CATEGORIES.join(', ')}
4. tier: One of: title, principal, official, technical, partner, supplier

Respond ONLY with valid JSON: {"team_id":"...","partner_name":"...","category_id":"...","tier":"..."}
If the article is NOT about a new F1 team partnership announcement, respond: {"skip":true}`,
      messages: [{ role: 'user', content: `Title: ${articleTitle}\nSummary: ${articleSummary || 'N/A'}` }]
    });
    const text = resp.content[0]?.text?.trim();
    return JSON.parse(text);
  } catch (e) {
    console.error('[PartnerScan] Classification error:', e.message);
    return { skip: true };
  }
}

export default async function handler(req, res) {
  console.log('[PartnerScan] Starting daily partnership scan...');

  // 1. Get news articles from last 24h that are deal signals or sponsorship-related
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: articles } = await supabase.from('news_articles')
    .select('id, title, summary, intelligence')
    .or('intelligence->>is_deal_signal.eq.true,intelligence->>category.eq.f1_sponsorship,intelligence->>category.eq.sports_sponsorship')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(50);

  if (!articles?.length) {
    console.log('[PartnerScan] No new deal signal articles found');
    return res.json({ ok: true, message: 'No new articles to scan', scanned: 0 });
  }

  console.log(`[PartnerScan] Found ${articles.length} deal signal articles to analyse`);

  let added = 0, skipped = 0, errors = 0;
  const results = [];

  for (const article of articles) {
    // Check if already processed
    const intel = article.intelligence || {};
    if (intel.partnership_scanned) { skipped++; continue; }

    const classification = await classifyPartnership(article.title, article.summary);

    if (classification.skip) {
      skipped++;
    } else if (classification.team_id && classification.partner_name) {
      // Upsert into f1_partnerships
      const { error } = await supabase.from('f1_partnerships').upsert({
        team_id: classification.team_id,
        partner_name: classification.partner_name,
        category_id: classification.category_id || null,
        tier: classification.tier || 'partner',
        status: 'active',
        source_url: null,
        verified: false,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'team_id,partner_name' });

      if (error) {
        console.error('[PartnerScan] Upsert error:', error.message);
        errors++;
      } else {
        added++;
        results.push({ team: classification.team_id, partner: classification.partner_name, category: classification.category_id });

        // Create Kiko alert for new partnership
        await supabase.from('kiko_alerts').insert({
          type: 'new_partnership',
          title: `New Partnership: ${classification.partner_name} → ${classification.team_id}`,
          body: `${classification.partner_name} detected as new ${classification.tier || 'partner'} for ${classification.team_id} in category ${classification.category_id}. Source: ${article.title}`,
          priority: 'medium',
          data: { article_id: article.id, ...classification },
        });
      }
    }

    // Mark article as scanned
    await supabase.from('news_articles').update({
      intelligence: { ...intel, partnership_scanned: true }
    }).eq('id', article.id);

    // Rate limit: 1 Haiku call per second
    await new Promise(r => setTimeout(r, 1000));
  }

  const summary = { scanned: articles.length, added, skipped, errors, results };
  console.log('[PartnerScan] Complete:', JSON.stringify(summary));
  return res.json({ ok: true, ...summary });
}
