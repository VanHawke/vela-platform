// api/source-web.js — Sprint B1: Web Search Sourcing Engine
// Uses Sonnet + Anthropic web_search to discover new companies in a sector.
// Zero new spend. Uses existing Anthropic API.
//
// POST /api/source-web
// Body: { sector_id: 'cybersecurity', count: 15, geo_override?: 'EU', extra_criteria?: '...' }
// Returns: { ok, run_id, candidates: [{name, domain, rationale, accepted, dedup_status}], stats }
//
// POST /api/source-web?action=accept
// Body: { run_id, accepted: [{name, domain, rationale}] }
// Persists accepted companies into the companies table + kiko_company_sources.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

async function loadActivePack() {
  const { data: assignment } = await supabase
    .from('kiko_pack_assignments').select('pack_id').eq('org_id', ORG_ID).eq('active', true).limit(1).maybeSingle();
  if (!assignment) return null;
  const { data: pack } = await supabase
    .from('kiko_vertical_packs').select('*').eq('id', assignment.pack_id).maybeSingle();
  return pack;
}

async function loadSector(packId, sectorId) {
  const { data } = await supabase
    .from('kiko_sector_definitions')
    .select('*').eq('pack_id', packId).eq('sector_id', sectorId).maybeSingle();
  return data;
}

async function existingDomains() {
  const { data } = await supabase.from('companies').select('data').limit(10000);
  const set = new Set();
  (data || []).forEach(c => {
    const d = (c.data?.domain || c.data?.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (d) set.add(d);
  });
  return set;
}

function buildPrompt(sector, count, geoOverride, extraCriteria) {
  const geos = geoOverride || 'US, UK, EU, MENA';
  const minRev = 100000000;
  const keywords = (sector?.keywords || []).join(', ');
  const industries = (sector?.target_industries || []).join(', ');
  return `You are sourcing F1 sponsorship prospects for Van Hawke Group's vertical pack.

SECTOR: ${sector?.name || 'unknown'}
KEYWORDS: ${keywords}
TARGET INDUSTRIES: ${industries}
MINIMUM REVENUE: $${(minRev / 1e6).toFixed(0)}M USD (Series C+ or public preferred)
GEOS: ${geos}
${extraCriteria ? 'EXTRA CRITERIA: ' + extraCriteria : ''}

Use web_search to find ${count} real companies matching these criteria. Prefer companies with active brand-building, recent funding, or expansion into new markets — they are most likely to invest in F1 sponsorship.

For each company, return ONE entry of JSON with: name, domain (root only, no protocol/www), rationale (one sentence on why they fit F1 sponsorship in this sector).

Return ONLY a JSON array. No markdown, no preamble, no explanation. Example:
[{"name":"Acme Corp","domain":"acme.com","rationale":"Series C cybersecurity firm, $400M ARR, expanding in MENA, matches sector + geo + revenue."}]`;
}

function normalizeDomain(d) {
  return (d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
}

function extractJSON(text) {
  // Find first [...] in text
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function sourceCompanies({ sector_id, count, geo_override, extra_criteria }) {
  const pack = await loadActivePack();
  if (!pack) throw new Error('No active vertical pack assigned to org');
  const sector = await loadSector(pack.id, sector_id);
  if (!sector) throw new Error(`Sector "${sector_id}" not found in active pack`);

  const prompt = buildPrompt(sector, count, geo_override, extra_criteria);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text from response (may include tool_use blocks)
  const textBlocks = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const candidates = extractJSON(textBlocks) || [];

  // Dedupe against existing companies
  const existing = await existingDomains();
  const enriched = candidates.map(c => {
    const dom = normalizeDomain(c.domain);
    return { ...c, domain: dom, dedup_status: existing.has(dom) ? 'duplicate' : 'new' };
  });
  const newOnes = enriched.filter(c => c.dedup_status === 'new');
  const dupes = enriched.filter(c => c.dedup_status === 'duplicate');

  // Persist run
  const { data: run } = await supabase.from('kiko_sourcing_runs').insert({
    pack_id: pack.id, sector_id, source: 'web_search',
    filters: { count, geo_override, extra_criteria },
    requested_count: count,
    returned_count: candidates.length,
    duplicate_count: dupes.length,
    status: 'pending_review',
    reasoning: textBlocks.slice(0, 2000),
    finished_at: new Date().toISOString(),
    org_id: ORG_ID,
  }).select().single();

  return { run_id: run?.id, candidates: enriched, stats: { requested: count, returned: candidates.length, new: newOnes.length, duplicates: dupes.length } };
}

async function acceptCandidates(run_id, accepted) {
  const { data: run } = await supabase.from('kiko_sourcing_runs').select('*').eq('id', run_id).maybeSingle();
  if (!run) throw new Error('Run not found');

  let added = 0;
  for (const c of accepted) {
    const id = 'src_' + Math.random().toString(36).slice(2, 11);
    const dom = normalizeDomain(c.domain);
    try {
      await supabase.from('companies').insert({
        id,
        data: {
          name: c.name,
          domain: dom,
          website: dom ? `https://${dom}` : '',
          source: 'web_search',
          sourced_at: new Date().toISOString(),
          rationale: c.rationale,
        },
        org_id: ORG_ID,
      });
      await supabase.from('kiko_company_sources').insert({
        company_id: id, source: 'web_search', source_run_id: run_id, rationale: c.rationale,
      });
      added++;
    } catch (e) {
      console.error('[source-web] insert failed:', e.message);
    }
  }

  await supabase.from('kiko_sourcing_runs').update({
    added_count: added, status: 'completed', finished_at: new Date().toISOString(),
  }).eq('id', run_id);

  return { added };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (req.query.action === 'accept') {
      const { run_id, accepted } = req.body || {};
      if (!run_id || !Array.isArray(accepted)) return res.status(400).json({ error: 'run_id and accepted[] required' });
      const result = await acceptCandidates(run_id, accepted);
      return res.json({ ok: true, ...result });
    }

    const { sector_id, count = 15, geo_override, extra_criteria } = req.body || {};
    if (!sector_id) return res.status(400).json({ error: 'sector_id required' });
    const result = await sourceCompanies({ sector_id, count, geo_override, extra_criteria });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[source-web] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
