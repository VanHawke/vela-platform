// api/enrich-campaign-sponsorship.js — Sports sponsorship history enrichment for campaign targets.
//
// For each top-N company in a campaign, runs a web_search to find:
//   - Has the company done F1/motorsport/sports sponsorships before?
//   - Which other sports/teams/properties have they sponsored?
//   - Who signed those deals (decision-maker name, often different from CMO)?
//   - Approximate timeframe + value bracket if disclosed
//
// Updates campaign_targets.sponsorship_history (new jsonb field).
// Designed to run AFTER build-campaign + verify-campaign-targets.
// Parallel batches of 4 to keep wall time under 60s.
//
// POST { campaign_id, top_n? }   default top_n=10
// Returns { enriched, no_history, errors, total, duration_ms }

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';


const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const BATCH_SIZE = 4;

async function enrichOne(target) {
  const company = target.company_name;
  if (!company) return { ...target, _result: 'no_company' };

  const prompt = `Research ${company}'s sports sponsorship history. Search the web (LinkedIn, press releases, deal announcements, sponsorship industry publications, SportsBusinessJournal) for past or current sports sponsorships.

Focus specifically on:
- Has ${company} ever sponsored Formula 1, MotoGP, Formula E, or any motorsport?
- Other sports they've sponsored (football, rugby, tennis, golf, esports, basketball, cricket, sailing)
- Specific teams, athletes, properties, or events
- Approximate years/timeframe of each deal
- If named, the decision-maker who signed each deal (CMO, CRO, Head of Sponsorship, sometimes different from current execs)
- Disclosed deal values if available (USD)
- Whether the deal is still active or expired

Return ONLY this JSON, nothing else (no markdown fences, no commentary):
{
  "has_sponsorship_history": true | false,
  "motorsport_history": true | false,
  "sponsorships": [
    {
      "sport": "F1 | MotoGP | FE | Football | etc",
      "property": "team / event / athlete name",
      "years": "2023-present | 2021-2024 | etc",
      "value_usd": "$X million or null",
      "decision_maker": "name and title or null",
      "active": true | false
    }
  ],
  "summary": "1-2 sentence narrative of their sponsorship posture",
  "f1_fit_score": 0-100
}

If you find nothing concrete, return has_sponsorship_history=false, sponsorships=[], summary="No public sponsorship history found", f1_fit_score=null.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { ...target, _result: 'no_json' };
    const parsed = JSON.parse(match[0]);
    return { ...target, _result: 'enriched', _data: parsed };
  } catch (err) {
    return { ...target, _result: 'error', _error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { campaign_id, sequence_id, top_n = 10, force = false } = req.body || {};
  const id = campaign_id || sequence_id;
  if (!id) return res.status(400).json({ error: 'campaign_id required' });

  const startedAt = Date.now();

  try {
    // Pull top N targets by rank, deduped by company (one enrichment per company,
    // not per contact — multiple decision-makers at the same company share the same
    // sponsorship history)
    const { data: targets, error: tErr } = await supabase
      .from('campaign_targets')
      .select('id, company_name, rank, sponsorship_enriched_at, sponsorship_history')
      .eq('campaign_id', id)
      .order('rank')
      .limit(200);
    if (tErr) throw tErr;
    if (!targets || targets.length === 0) {
      return res.status(404).json({ error: 'No targets found for this campaign' });
    }

    // Dedupe by company name — pick the lowest-rank row per company
    const byCompany = new Map();
    for (const t of targets) {
      if (!byCompany.has(t.company_name)) byCompany.set(t.company_name, t);
    }
    let uniqueCompanies = Array.from(byCompany.values());

    // Skip already-enriched unless force
    if (!force) {
      uniqueCompanies = uniqueCompanies.filter(t => !t.sponsorship_history);
    }

    // Take only top_n
    uniqueCompanies = uniqueCompanies.slice(0, top_n);

    if (uniqueCompanies.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'Nothing to enrich — all top companies already have sponsorship_history',
        total: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

    // Process in parallel batches
    const enriched = [];
    for (let i = 0; i < uniqueCompanies.length; i += BATCH_SIZE) {
      const batch = uniqueCompanies.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(enrichOne));
      enriched.push(...results);
    }

    // Update ALL campaign_targets rows for each enriched company (so all
    // decision-makers at the same company share the sponsorship intel)
    let nEnriched = 0, nNoHistory = 0, nErrors = 0;
    const enrichedAt = new Date().toISOString();
    for (const v of enriched) {
      if (v._result === 'enriched' && v._data) {
        await supabase.from('campaign_targets').update({
          sponsorship_history: v._data,
          sponsorship_enriched_at: enrichedAt,
        }).eq('campaign_id', id).eq('company_name', v.company_name);
        if (v._data.has_sponsorship_history) nEnriched++;
        else nNoHistory++;
      } else {
        nErrors++;
      }
    }

    return res.status(200).json({
      ok: true,
      campaign_id: id,
      total_processed: enriched.length,
      enriched_with_history: nEnriched,
      no_public_history: nNoHistory,
      errors: nErrors,
      duration_ms: Date.now() - startedAt,
      motorsport_matches: enriched
        .filter(v => v._data?.motorsport_history)
        .map(v => ({
          company: v.company_name,
          summary: v._data.summary,
          f1_fit_score: v._data.f1_fit_score,
          sponsorships: (v._data.sponsorships || []).slice(0, 3),
        })),
    });
  } catch (err) {
    console.error('[enrich-campaign-sponsorship] error:', err);
    return res.status(500).json({ error: err.message || 'enrichment failed' });
  }
}
