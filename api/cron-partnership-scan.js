// api/cron-partnership-scan.js — Partnership Scanner Agent v2
import { cronHeartbeat } from './kiko-tools.js';
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
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
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
  if (error) { console.error('[PartnerScan] Upsert error:', error.message, error.details, JSON.stringify(record)); return null; }

  const isNew = !existing;
  if (isNew) {
    // Log activity
    await supabase.from('kiko_alerts').insert({
      type: 'new_partnership',
      severity: 'high',
      title: `New F1 Partner: ${p.partner_name} → ${p.team_id}`,
      detail: `${p.partner_name} announced as ${p.tier || 'partner'} for ${p.team_id} (${p.category_id}). Source: ${source}`,
      entity_type: 'partnership',
      entity_name: p.partner_name,
      action: `View ${p.partner_name} in Partnership Matrix`,
      metadata: { ...p, source, action_url: '/partnership-matrix' },
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    // Homepage notification
    await supabase.from('pipeline_notifications').insert({
      type: 'new_partnership',
      title: `New F1 partner: ${p.partner_name} → ${p.team_id}`,
      body: `${p.partner_name} detected as ${p.tier || 'partner'} for ${p.team_id} (${p.category_id || 'uncategorised'}). Source: ${source}`,
      company_name: p.partner_name,
      pipeline: p.team_id,
      stage: 'Partnership Announced',
      source: 'partnership_scanner',
      priority: 'high',
      metadata: { ...p, source },
    });
  }
  return isNew ? 'new' : 'existing';
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-partnership-scan', 'started');
  try {
  console.log('[PartnerScan] Starting partnership scan...');
  let added = 0, updated = 0, skipped = 0;
  const results = [];

  // === PHASE 1: Scan unprocessed news_articles (deal signals) — max 10 per run ===
  const { data: articles } = await supabase.from('news_articles')
    .select('id, title, summary, intelligence')
    .or('deal_signal.eq.true,category.eq.f1_sponsorship,category.eq.sports_sponsorship')
    .order('published_at', { ascending: false })
    .limit(30);

  const unscanned = (articles || []).filter(a => !a.intelligence?.partnership_scanned).slice(0, 10);
  console.log(`[PartnerScan] Phase 1: ${unscanned.length} unscanned deal articles (capped at 10)`);

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

  // === PHASE 2: Claude web search for partnership announcements ===
  let webArticles = 0;
  try {
    console.log('[PartnerScan] Phase 2: Starting Claude web search...');
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
    const searchRes = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Search for Formula 1 partnership, sponsorship, and commercial deal announcements from the last 7 days (today is ${new Date().toISOString().split('T')[0]}). Cover ALL teams: Red Bull, Ferrari, McLaren, Mercedes, Aston Martin, Alpine, Williams, Haas, Racing Bulls, Audi/Sauber, Cadillac.

IMPORTANT: category must be one of these EXACT values: ai_data, automotive, banking, cloud, crypto, cybersecurity, energy, software, fashion, fintech, food_bev, gaming, health, hospitality, legal, legal_ai, logistics, robotics, semiconductors, telecom, watches, whiskey

IMPORTANT: team must be one of: red_bull, ferrari, mclaren, mercedes, aston_martin, alpine, williams, haas, racing_bulls, audi, cadillac

IMPORTANT: tier must be one of: title, principal, official, partner, supplier

Return ONLY a JSON array: [{"team":"mclaren","partner":"Intel","category":"semiconductors","tier":"official","status":"confirmed","source":"brief description"}]. No other text, no code fences.` }]
    });
    console.log('[PartnerScan] Phase 2: Claude responded, blocks:', searchRes.content?.length);
    const textBlock = searchRes.content?.find(b => b.type === 'text');
    console.log('[PartnerScan] Phase 2: Text block found:', !!textBlock, 'length:', textBlock?.text?.length);
    if (textBlock?.text) {
      try {
        // Strip code fences before parsing
        const cleaned = textBlock.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        console.log('[PartnerScan] Phase 2: JSON match found:', !!jsonMatch, 'length:', jsonMatch?.[0]?.length);
        if (jsonMatch) {
          const partnerships = JSON.parse(jsonMatch[0]);
          console.log(`[PartnerScan] Phase 2: Parsed ${partnerships.length} partnerships from Claude`);
          for (const p of partnerships) {
            if (!p.team || !p.partner) continue;
            console.log(`[PartnerScan] Phase 2: Processing ${p.partner} → ${p.team} (${p.category})`);
            const teamMap = { 'red bull': 'red_bull', 'aston martin': 'aston_martin', 'racing bulls': 'racing_bulls', 'alfa romeo': 'alfa_romeo' };
            const teamId = teamMap[(p.team || '').toLowerCase()] || (p.team || '').toLowerCase().replace(/\s+/g, '_');
            const catId = (p.category || 'other').toLowerCase().replace(/\s+/g, '_');
            const result = await upsertPartnership({ team_id: teamId, partner_name: p.partner, category_id: catId, tier: p.tier || 'partner', status: p.status || 'confirmed', source_url: p.source || null }, `Claude web search ${new Date().toISOString().split('T')[0]}`);
            if (result === 'new') { added++; results.push(p); webArticles++; }
            else if (result === 'existing') updated++;
          }
        }
      } catch (parseErr) { console.error('[PartnerScan] JSON parse error:', parseErr.message); }
    }
  } catch (e) { console.error('[PartnerScan] Claude search error:', e.message); }
  console.log(`[PartnerScan] Phase 2: ${webArticles} new from Claude web search`);

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
  await cronHeartbeat('cron-partnership-scan', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: added + updated });
  return res.json({ ok: true, ...summary });
  } catch (__hbErr) {
    await cronHeartbeat('cron-partnership-scan', 'error', { heartbeatId: __hbId, errorMessage: __hbErr?.message || 'unknown' });
    return res.status(200).json({ ok: false, error: __hbErr?.message });
  }
}
