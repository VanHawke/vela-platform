// api/company-lookup.js — Deterministic company lookup. Zero LLM. Pure SQL.
//
// Given a company name, returns a structured JSON card with:
//   - identity: name, domain, industry, sub_sector, business_model
//   - financials: revenue_estimate, funding_total, last_funding (round + date + amount)
//   - people: ceo, cto, cmo, cfo, vp_marketing, vp_engineering
//   - strategy: key_products, competitors, existing_sponsorships,
//     sponsorship_fit_score, marketing_budget_signal, brand_awareness_signal
//   - internal: contacts at this company (count + sample), deals (count + stages)
//   - freshness: enriched_at + needs_refresh + age_days
//
// Used by Kiko's deterministic short-circuit when intent === 'company_lookup'.
// Replaces the previous LLM-tool-loop path that hallucinated facts.

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15 };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Find best company match across both tables. Returns { id, source, name, domain }.
async function findCompany(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const ilike = `%${q.replace(/[%_]/g, '')}%`;

  // 1. Try exact match in company_intelligence first (richest data, only 21 rows)
  const { data: ciExact } = await supabase
    .from('company_intelligence')
    .select('id, company_id, company_name, domain')
    .ilike('company_name', q)
    .limit(1);
  if (ciExact?.[0]) {
    return { id: ciExact[0].company_id, ci_id: ciExact[0].id, source: 'company_intelligence', name: ciExact[0].company_name, domain: ciExact[0].domain };
  }

  // 2. Partial match in company_intelligence
  const { data: ciPartial } = await supabase
    .from('company_intelligence')
    .select('id, company_id, company_name, domain')
    .ilike('company_name', ilike)
    .limit(5);
  if (ciPartial?.length) {
    // Prefer shortest match (more specific)
    const best = ciPartial.sort((a, b) => a.company_name.length - b.company_name.length)[0];
    return { id: best.company_id, ci_id: best.id, source: 'company_intelligence', name: best.company_name, domain: best.domain };
  }

  // 3. Fall back to companies table (jsonb name field)
  const { data: cExact } = await supabase
    .from('companies')
    .select('id, data')
    .filter('data->>name', 'ilike', q)
    .limit(1);
  if (cExact?.[0]) {
    return { id: cExact[0].id, ci_id: null, source: 'companies', name: cExact[0].data?.name, domain: cExact[0].data?.domain || cExact[0].data?.website };
  }

  // 4. Partial in companies — name contains query
  const { data: cPartial } = await supabase
    .from('companies')
    .select('id, data')
    .filter('data->>name', 'ilike', ilike)
    .limit(5);
  if (cPartial?.length) {
    const best = cPartial.sort((a, b) => (a.data?.name || '').length - (b.data?.name || '').length)[0];
    return { id: best.id, ci_id: null, source: 'companies', name: best.data?.name, domain: best.data?.domain || best.data?.website };
  }

  return null;
}

export default async function handler(req, res) {
  const query = req.method === 'POST'
    ? (req.body?.name || req.body?.query || '').trim()
    : (req.query?.name || req.query?.q || '').trim();

  if (!query) return res.status(400).json({ ok: false, error: 'Provide ?name=Acme or POST {name: "Acme"}' });

  try {
    const result = await lookupCompany(query);
    if (!result.found) return res.status(404).json(result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[company-lookup] error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'lookup failed' });
  }
}

// Exported helper — used by api/kiko.js short-circuit to avoid an HTTP hop.
// Returns { ok, query, found, matched_name?, matched_via?, card?, markdown?, message? }
export async function lookupCompany(query) {
  const match = await findCompany(query);
  if (!match) {
    return {
      ok: false, query, found: false,
      message: `No company matching "${query}" in your database. Try the full name or check spelling.`,
    };
  }

    // Parallel fetch: full company_intelligence row + companies row + contacts + deals
    const [ciRes, companyRes, contactsRes, dealsRes] = await Promise.all([
      match.ci_id
        ? supabase.from('company_intelligence').select('*').eq('id', match.ci_id).single()
        : supabase.from('company_intelligence').select('*').ilike('company_name', match.name).limit(1).maybeSingle(),
      supabase.from('companies').select('id, data, updated_at').eq('id', match.id).maybeSingle(),
      supabase.from('contacts').select('id, data').filter('data->>company', 'ilike', match.name).limit(20),
      supabase.from('deals').select('id, data').filter('data->>company', 'ilike', match.name).limit(10),
    ]);

    const ci = ciRes?.data || null;
    const company = companyRes?.data || null;
    const contacts = contactsRes?.data || [];
    const deals = dealsRes?.data || [];

    // Compute freshness
    let ageDays = null;
    let needsRefresh = true;
    if (ci?.enriched_at) {
      ageDays = Math.floor((Date.now() - new Date(ci.enriched_at).getTime()) / (1000 * 60 * 60 * 24));
      needsRefresh = ageDays > 30 || !!ci.needs_refresh;
    }

    // Structured card
    const card = {
      identity: {
        name: ci?.company_name || company?.name || match.name,
        domain: ci?.domain || company?.domain || company?.website || null,
        industry: ci?.industry || company?.industry || null,
        sub_sector: ci?.sub_sector || null,
        business_model: ci?.business_model || null,
      },
      financials: {
        revenue_estimate: ci?.revenue_estimate || null,
        funding_total: ci?.funding_total || null,
        last_funding_round: ci?.last_funding_round || null,
        last_funding_date: ci?.last_funding_date || null,
        last_funding_amount: ci?.last_funding_amount || null,
        employee_count: ci?.employee_count || null,
        employee_growth: ci?.employee_growth || null,
      },
      people: {
        ceo: ci?.ceo || null,
        cto: ci?.cto || null,
        cmo: ci?.cmo || null,
        cfo: ci?.cfo || null,
        vp_marketing: ci?.vp_marketing || null,
        vp_engineering: ci?.vp_engineering || null,
      },
      strategy: {
        key_products: ci?.key_products || [],
        competitors: ci?.competitors || [],
        recent_acquisitions: ci?.recent_acquisitions || [],
        existing_sponsorships: ci?.existing_sponsorships || [],
        marketing_budget_signal: ci?.marketing_budget_signal || null,
        brand_awareness_signal: ci?.brand_awareness_signal || null,
        sponsorship_fit_score: ci?.sponsorship_fit_score ?? null,
      },
      internal: {
        contacts_count: contacts.length,
        contacts_sample: contacts.slice(0, 5).map(c => ({
          name: [c.data?.firstName, c.data?.lastName].filter(Boolean).join(' ') || 'Unknown',
          title: c.data?.title || null,
          email: c.data?.email || null,
        })),
        deals_count: deals.length,
        deals_sample: deals.slice(0, 5).map(d => ({
          stage: d.data?.stage || 'unknown',
          value: d.data?.value || null,
          status: d.data?.status || null,
        })),
      },
      freshness: {
        enriched_at: ci?.enriched_at || null,
        age_days: ageDays,
        needs_refresh: needsRefresh,
        enrichment_quality: ci?.enrichment_quality || null,
        source: match.source,
      },
    };

    // Pre-formatted markdown for Kiko to stream as her response
    const lines = [];
    lines.push(`**${card.identity.name}**${card.identity.domain ? ` · ${card.identity.domain}` : ''}`);
    if (card.identity.industry || card.identity.sub_sector) {
      lines.push(`${card.identity.industry || ''}${card.identity.sub_sector ? ` / ${card.identity.sub_sector}` : ''}${card.identity.business_model ? ` · ${card.identity.business_model}` : ''}`);
    }

    // Financials section
    const finBits = [];
    if (card.financials.revenue_estimate) finBits.push(`Revenue ${card.financials.revenue_estimate}`);
    if (card.financials.employee_count) finBits.push(`${card.financials.employee_count} employees`);
    if (card.financials.funding_total) finBits.push(`${card.financials.funding_total} raised`);
    if (finBits.length) lines.push('', '**Financials**', finBits.join(' · '));
    if (card.financials.last_funding_round) {
      lines.push(`Last round: ${card.financials.last_funding_round}${card.financials.last_funding_amount ? ` (${card.financials.last_funding_amount})` : ''}${card.financials.last_funding_date ? ` on ${card.financials.last_funding_date}` : ''}`);
    }

    // People section
    const peopleBits = [];
    for (const [role, name] of Object.entries(card.people)) {
      if (name) peopleBits.push(`${role.toUpperCase().replace('_', ' ')}: ${name}`);
    }
    if (peopleBits.length) {
      lines.push('', '**People**');
      peopleBits.forEach(p => lines.push(`· ${p}`));
    }

    // Strategy section
    if (card.strategy.key_products?.length) {
      lines.push('', '**Products**', card.strategy.key_products.slice(0, 6).join(' · '));
    }
    if (card.strategy.competitors?.length) {
      lines.push('', '**Competitors**', card.strategy.competitors.slice(0, 6).join(' · '));
    }
    if (card.strategy.existing_sponsorships?.length) {
      lines.push('', '**Existing sponsorships**', card.strategy.existing_sponsorships.slice(0, 8).join(' · '));
    }
    if (card.strategy.sponsorship_fit_score != null) {
      lines.push('', `**Sponsorship fit score:** ${card.strategy.sponsorship_fit_score}/100`);
    }
    if (card.strategy.marketing_budget_signal) {
      lines.push(`**Marketing budget signal:** ${card.strategy.marketing_budget_signal}`);
    }

    // Internal CRM section
    if (card.internal.contacts_count > 0 || card.internal.deals_count > 0) {
      lines.push('', '**In your CRM**');
      if (card.internal.contacts_count > 0) {
        lines.push(`· ${card.internal.contacts_count} contact${card.internal.contacts_count === 1 ? '' : 's'}: ${card.internal.contacts_sample.map(c => c.name + (c.title ? ` (${c.title})` : '')).join(', ')}`);
      }
      if (card.internal.deals_count > 0) {
        lines.push(`· ${card.internal.deals_count} deal${card.internal.deals_count === 1 ? '' : 's'}: ${card.internal.deals_sample.map(d => `${d.stage}${d.value ? ` $${d.value}` : ''}`).join(', ')}`);
      }
    } else {
      lines.push('', '_No contacts or deals with this company in your CRM yet._');
    }

    // Freshness footer
    if (card.freshness.enriched_at) {
      const freshTag = needsRefresh ? '⚠️ stale' : '✓ fresh';
      lines.push('', `_Data: ${freshTag} (enriched ${ageDays}d ago${card.freshness.enrichment_quality ? `, quality: ${card.freshness.enrichment_quality}` : ''})_`);
    } else {
      lines.push('', `_Limited data — this company has not been enriched yet. Ask Kiko to "enrich ${card.identity.name}" for full intel._`);
    }

    return {
      ok: true,
      query,
      found: true,
      matched_name: card.identity.name,
      matched_via: match.source,
      card,
      markdown: lines.join('\n'),
    };
}
