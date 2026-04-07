// api/score.js — SponsorSignal Scoring Engine
// The keystone of Kiko's decision layer (M3). Takes a company + the active
// vertical pack's scoring model and returns a 0-100 composite score with
// per-dimension breakdown and reasoning.
//
// Two modes:
//   POST /api/score?company_id=X — score one company
//   POST /api/score?bulk=true&limit=N — score N companies needing scores
//
// Uses Sonnet for reasoning (the model is small enough that Haiku could work
// but Sonnet's calibration on multi-dimensional scoring is significantly better).
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export const config = { maxDuration: 60 };


// Resolve active pack + model + sectors (cached per request)
async function loadActivePackContext() {
  const { data: pack } = await supabase
    .from('kiko_vertical_packs')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pack) throw new Error('No active vertical pack');

  const { data: model } = await supabase
    .from('kiko_scoring_models')
    .select('*')
    .eq('pack_id', pack.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!model) throw new Error('No active scoring model for this pack');

  const { data: sectors } = await supabase
    .from('kiko_sector_definitions')
    .select('*')
    .eq('pack_id', pack.id)
    .order('priority', { ascending: true });

  return { pack, model, sectors: sectors || [] };
}

// Determine which sector a company best matches based on its industry/data
function matchSector(company, sectors) {
  const data = company.data || {};
  const industry = (data.industry || '').toLowerCase();
  const description = (data.description || '').toLowerCase();
  const name = (data.name || company.name || '').toLowerCase();
  const haystack = `${industry} ${description} ${name}`;

  let bestMatch = null;
  let bestScore = 0;
  for (const sector of sectors) {
    const keywords = sector.keywords || [];
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(String(kw).toLowerCase())) score += 1;
    }
    // Bonus for exact industry match
    const industries = sector.target_industries || [];
    for (const ind of industries) {
      if (industry.includes(String(ind).toLowerCase())) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = sector;
    }
  }
  return bestMatch;
}


// Score a single company against the active pack model.
// Returns { composite_score, dimensions: {revenue_fit, geography_fit, ...}, reasoning, matched_sector_id }
async function scoreCompany(company, ctx) {
  const { pack, model, sectors } = ctx;
  const matchedSector = matchSector(company, sectors);
  const dims = model.dimensions || [];
  const weights = model.weights || {};

  // Build a clean intel summary for the model
  const data = company.data || {};
  const intel = {
    name: data.name || company.name || 'Unknown',
    industry: data.industry || data.category || 'unknown',
    revenue: data.revenue || data.revenue_estimate || data.annual_revenue || 'unknown',
    employees: data.employee_count || data.employees || 'unknown',
    hq_location: data.hq_location || data.headquarters || data.country || 'unknown',
    description: (data.description || '').slice(0, 500),
    last_funding: data.last_funding_round || data.funding_stage || 'unknown',
    matched_sector: matchedSector?.name || 'no clear match',
  };

  const dimensionPrompts = dims.map(d => `- ${d.name} (${d.id}): ${d.prompt_hint}`).join('\n');

  const prompt = `You are SponsorSignal — a scoring engine for F1/Formula E sponsorship targets.

COMPANY:
${JSON.stringify(intel, null, 2)}

ACTIVE PACK: ${pack.name}
MATCHED SECTOR: ${intel.matched_sector}

SCORE THIS COMPANY ON 5 DIMENSIONS (each 0-100). Be calibrated and honest — most companies should score 30-70. Only exceptional fits score 85+.

${dimensionPrompts}

Return ONLY valid JSON in this exact shape (no markdown, no preamble):
{
  "revenue_fit": <0-100>,
  "geography_fit": <0-100>,
  "category_fit": <0-100>,
  "growth_signals": <0-100>,
  "narrative_fit": <0-100>,
  "reasoning": {
    "revenue_fit": "<one sentence why>",
    "geography_fit": "<one sentence why>",
    "category_fit": "<one sentence why>",
    "growth_signals": "<one sentence why>",
    "narrative_fit": "<one sentence why>",
    "summary": "<two sentence overall verdict — would Van Hawke pursue this lead?>"
  }
}`;

  const result = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = result.content[0]?.text?.trim() || '{}';
  // Strip any markdown fences just in case
  const cleaned = text.replace(/^```json\s*|```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Sonnet returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Compute weighted composite
  const composite = Math.round(
    ((parsed.revenue_fit || 0) * (weights.revenue_fit || 0) +
      (parsed.geography_fit || 0) * (weights.geography_fit || 0) +
      (parsed.category_fit || 0) * (weights.category_fit || 0) +
      (parsed.growth_signals || 0) * (weights.growth_signals || 0) +
      (parsed.narrative_fit || 0) * (weights.narrative_fit || 0)) / 100
  );

  return {
    composite_score: composite,
    revenue_fit: parsed.revenue_fit || 0,
    geography_fit: parsed.geography_fit || 0,
    category_fit: parsed.category_fit || 0,
    growth_signals: parsed.growth_signals || 0,
    narrative_fit: parsed.narrative_fit || 0,
    reasoning: parsed.reasoning || {},
    matched_sector_id: matchedSector?.sector_id || null,
  };
}


// Persist a score result and write a history row with delta from previous
async function persistScore(companyId, packId, modelId, scoreResult) {
  // Look up previous composite for delta calculation
  const { data: prev } = await supabase
    .from('kiko_company_scores')
    .select('composite_score')
    .eq('company_id', companyId)
    .eq('pack_id', packId)
    .maybeSingle();
  const previousComposite = prev?.composite_score || null;
  const delta = previousComposite !== null ? scoreResult.composite_score - previousComposite : null;

  // Upsert the live score row (one row per company × pack)
  const { error: upsertErr } = await supabase
    .from('kiko_company_scores')
    .upsert({
      company_id: companyId,
      pack_id: packId,
      model_id: modelId,
      revenue_fit: scoreResult.revenue_fit,
      geography_fit: scoreResult.geography_fit,
      category_fit: scoreResult.category_fit,
      growth_signals: scoreResult.growth_signals,
      narrative_fit: scoreResult.narrative_fit,
      composite_score: scoreResult.composite_score,
      matched_sector_id: scoreResult.matched_sector_id,
      reasoning: scoreResult.reasoning,
      scored_at: new Date().toISOString(),
      scored_by: 'api',
      org_id: ORG_ID,
    }, { onConflict: 'company_id,pack_id' });
  if (upsertErr) throw new Error(`Score upsert failed: ${upsertErr.message}`);

  // Always write a history row (audit trail)
  await supabase.from('kiko_score_history').insert({
    company_id: companyId,
    pack_id: packId,
    composite_score: scoreResult.composite_score,
    delta,
    reason: previousComposite === null ? 'initial_score' : 'rescored',
    org_id: ORG_ID,
  });

  return { previousComposite, delta };
}


// Exported helper for cron + other modules to call directly without HTTP
export async function scoreCompanyById(companyId, ctx = null) {
  const context = ctx || await loadActivePackContext();
  const { data: company } = await supabase
    .from('companies')
    .select('id, data')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) throw new Error(`Company ${companyId} not found`);
  const result = await scoreCompany(company, context);
  const { previousComposite, delta } = await persistScore(company.id, context.pack.id, context.model.id, result);
  return { company_id: company.id, name: company.data?.name, ...result, previous_composite: previousComposite, delta };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'method not allowed' });
    }

    // Single-company mode: ?company_id=X
    if (req.query.company_id) {
      const result = await scoreCompanyById(req.query.company_id);
      return res.status(200).json({ ok: true, ...result });
    }

    // Bulk mode: ?bulk=true&limit=N
    if (req.query.bulk === 'true') {
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);
      const ctx = await loadActivePackContext();

      // Find companies with no score OR scored more than 7 days ago
      const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existingScores } = await supabase
        .from('kiko_company_scores')
        .select('company_id, scored_at')
        .eq('pack_id', ctx.pack.id);
      const recentScoreSet = new Set(
        (existingScores || [])
          .filter(s => s.scored_at > staleCutoff)
          .map(s => s.company_id)
      );

      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id, data')
        .limit(500);

      const candidates = (allCompanies || [])
        .filter(c => !recentScoreSet.has(c.id))
        .slice(0, limit);

      const results = [];
      let succeeded = 0, failed = 0;
      for (const company of candidates) {
        try {
          const scoreResult = await scoreCompany(company, ctx);
          await persistScore(company.id, ctx.pack.id, ctx.model.id, scoreResult);
          results.push({ company_id: company.id, name: company.data?.name, score: scoreResult.composite_score });
          succeeded++;
        } catch (e) {
          console.error(`[Score] Failed for ${company.id}:`, e.message);
          failed++;
        }
      }

      return res.status(200).json({
        ok: true,
        scored: succeeded,
        failed,
        candidates: candidates.length,
        results: results.slice(0, 20),
      });
    }

    return res.status(400).json({ error: 'provide company_id or bulk=true' });
  } catch (err) {
    console.error('[Score] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
