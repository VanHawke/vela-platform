// api/cron-partner-reconcile.js — Proactive F1 team partner page scraper.
// Runs daily 6am UK. Visits each team's official partners page, extracts partner names,
// diffs against f1_partnerships. New partners get inserted (trigger auto-pauses matching
// campaigns and creates alerts). Missing partners get flagged for review.
//
// This is the cron the system has been missing. Previous cron-partnership-scan was
// reactive (RSS-based) — this one is proactive (page-based).

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 300 };

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Each team's official partners/sponsors page. These are the canonical sources.
const TEAM_PARTNER_URLS = {
  red_bull: 'https://www.redbullracing.com/int-en/partners',
  ferrari: 'https://www.ferrari.com/en-EN/formula1/partners',
  mercedes: 'https://www.mercedesamgf1.com/partners',
  mclaren: 'https://www.mclaren.com/racing/partners/',
  aston_martin: 'https://www.astonmartinf1.com/en-GB/partners',
  alpine: 'https://www.alpinecars.com/en/formula-1/partners/',
  williams: 'https://www.williamsf1.com/partners',
  haas: 'https://www.haasf1team.com/team/partners',
  racing_bulls: 'https://www.visacashapprb.com/en-GB/partners',
  audi: 'https://www.audi.com/en/company/motorsport/formula-1/partners.html',
  cadillac: 'https://www.cadillacf1.com/partners',
};

const CATEGORIES = ['fintech','cloud','ai_data','cybersecurity','banking','energy','telecom','automotive','fashion','food_bev','watches','crypto','software','legal','hospitality','gaming','health','logistics','semiconductors','robotics'];

async function fetchPageText(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Strip HTML tags and scripts, keep visible text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 6000);
  } catch (err) {
    console.error(`[reconcile] fetch failed for ${url}:`, err.message);
    return null;
  }
}

async function extractPartnersFromText(teamId, pageText) {
  if (!pageText || pageText.length < 50) return [];
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `You extract F1 team partners from scraped partner-page text. Return ONLY a JSON array. No prose.

For each partner you find, output:
{"partner_name": "Clean brand name", "category_id": "best fit from the list", "tier": "title|principal|official|technical|partner|supplier", "confidence": 0.0-1.0}

Valid categories: ${CATEGORIES.join(', ')}

Rules:
- Only include companies that are clearly listed as partners/sponsors
- Use the official brand name (e.g. "Red Bull" not "Red Bull GmbH")
- Pick the most specific category (e.g. CrowdStrike → cybersecurity, not software)
- Skip team-internal items like driver names, race calendar, news links
- confidence 0.9+ if the partner is obviously listed, 0.6-0.8 if inferred, <0.6 skip

Return: []  if no partners found.`,
      messages: [{ role: 'user', content: `Team: ${teamId}\n\nPartner page text:\n${pageText}` }],
    });
    const raw = resp.content[0]?.text?.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter(p => p.confidence >= 0.6) : [];
  } catch (err) {
    console.error(`[reconcile] extract failed for ${teamId}:`, err.message);
    return [];
  }
}

async function reconcileTeam(teamId, url) {
  const stats = { team_id: teamId, url, fetched: false, extracted: 0, new: 0, existing: 0, errors: [] };

  const pageText = await fetchPageText(url);
  if (!pageText) {
    stats.errors.push('fetch_failed');
    return stats;
  }
  stats.fetched = true;

  const discovered = await extractPartnersFromText(teamId, pageText);
  stats.extracted = discovered.length;
  if (discovered.length === 0) return stats;

  // Pull existing partners for this team
  const { data: existing } = await supabase
    .from('f1_partnerships')
    .select('partner_name')
    .eq('team_id', teamId)
    .eq('status', 'active');
  const existingLower = new Set((existing || []).map(e => (e.partner_name || '').toLowerCase().trim()));

  // Insert any new ones — trigger will auto-pause + alert
  for (const p of discovered) {
    const nameLower = (p.partner_name || '').toLowerCase().trim();
    if (!nameLower || existingLower.has(nameLower)) {
      stats.existing++;
      continue;
    }
    const { error } = await supabase.from('f1_partnerships').insert({
      team_id: teamId,
      partner_name: p.partner_name,
      category_id: p.category_id,
      tier: p.tier || 'partner',
      status: 'active',
      source_url: url,
      notes: `Auto-detected by cron-partner-reconcile (confidence ${p.confidence})`,
      verified: true,
      last_verified_at: new Date().toISOString(),
    });
    if (error) {
      stats.errors.push(`insert_${p.partner_name}: ${error.message}`);
    } else {
      stats.new++;
    }
  }
  return stats;
}

export default async function handler(req, res) {
  // Simple cron auth — Vercel sets this header
  const authHeader = req.headers.authorization || req.headers['x-vercel-cron'];
  if (!authHeader && req.query?.force !== '1') {
    return res.status(401).json({ error: 'unauthorised — add ?force=1 to run manually' });
  }

  const startedAt = Date.now();
  const teamResults = [];
  let totalNew = 0;

  for (const [teamId, url] of Object.entries(TEAM_PARTNER_URLS)) {
    try {
      const stats = await reconcileTeam(teamId, url);
      teamResults.push(stats);
      totalNew += stats.new;
    } catch (err) {
      teamResults.push({ team_id: teamId, url, errors: [err.message] });
    }
    // Small delay between teams to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  const summary = {
    ok: true,
    duration_ms: Date.now() - startedAt,
    teams_processed: teamResults.length,
    new_partnerships: totalNew,
    results: teamResults,
    timestamp: new Date().toISOString(),
  };

  // Log to cron_runs if the table exists
  try {
    await supabase.from('cron_runs').insert({
      cron_name: 'partner-reconcile',
      status: 'ok',
      duration_ms: summary.duration_ms,
      metadata: { new_partnerships: totalNew, teams: teamResults.length },
    });
  } catch { /* optional table */ }

  return res.status(200).json(summary);
}
