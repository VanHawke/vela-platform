// api/cron-company-enrich.js — Company Intelligence Enrichment Engine
// Runs weekly (Sun 4:30am). Takes top 20 active pipeline deals,
// web-searches each company for structured intelligence, writes to company_intelligence.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-company-enrich', 'started');
  try {
    // Get active deals with company names
    const deals = await sbFetch('deals?select=data&data->>status=eq.active&order=updated_at.desc&limit=25');
    const safe = Array.isArray(deals) ? deals : [];
    const companies = [...new Set(safe.map(d => d.data?.company).filter(Boolean))].slice(0, 20);
    if (!companies.length) {
      await cronHeartbeat('cron-company-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No companies to enrich', enriched: 0 });
    }

    // Check which companies already have recent intelligence (skip if enriched <14 days ago)
    const existing = await sbFetch('company_intelligence?select=company_name,enriched_at&order=enriched_at.desc');
    const recentlyEnriched = new Set(
      (Array.isArray(existing) ? existing : [])
        .filter(e => e.enriched_at && (Date.now() - new Date(e.enriched_at)) < 14 * 86400000)
        .map(e => e.company_name?.toLowerCase())
    );

    const toEnrich = companies.filter(c => !recentlyEnriched.has(c.toLowerCase())).slice(0, 8);
    if (!toEnrich.length) {
      await cronHeartbeat('cron-company-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'All companies recently enriched', enriched: 0 });
    }

    let enriched = 0;
    for (const companyName of toEnrich) {
      try {
        // Use Claude with web_search to gather structured intelligence
        const enrichRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Research "${companyName}" and return ONLY valid JSON with these fields. Search for their funding, revenue, leadership, and recent news. Be specific — use real numbers, real names.

{
  "company_name": "${companyName}",
  "domain": "company website domain",
  "funding_total": "total funding raised (e.g. $2.1B)",
  "last_funding_round": "Series X or IPO",
  "last_funding_date": "YYYY-MM-DD or null",
  "last_funding_amount": "amount (e.g. $400M)",
  "revenue_estimate": "annual revenue estimate (e.g. $3.4B)",
  "employee_count": "approximate headcount (e.g. 8500)",
  "employee_growth": "YoY growth signal (e.g. +12% or stable)",
  "ceo": "full name",
  "cto": "full name or null",
  "cmo": "full name or null",
  "cfo": "full name or null",
  "vp_marketing": "full name or null",
  "vp_engineering": "full name or null",
  "industry": "primary industry",
  "sub_sector": "specific sub-sector",
  "business_model": "SaaS/hardware/marketplace/etc",
  "key_products": ["product1", "product2"],
  "competitors": ["competitor1", "competitor2", "competitor3"],
  "recent_acquisitions": ["acquisition1 (date)"] or [],
  "existing_sponsorships": ["known sponsorships"] or [],
  "marketing_budget_signal": "high/medium/low based on ad spend, events, brand campaigns",
  "brand_awareness_signal": "high/medium/low",
  "sponsorship_fit_score": 0-100 score for F1 sponsorship readiness
}

Return ONLY the JSON object. No markdown, no explanation.` }]
        });

        // Extract JSON from response (may have text blocks mixed with tool_use)
        const textBlocks = enrichRes.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        let intel = {};
        try {
          const jsonStr = textBlocks.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          // Find the JSON object in the response
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) intel = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.error(`[CompanyEnrich] Failed to parse ${companyName}:`, parseErr.message);
          continue;
        }

        if (!intel.company_name) intel.company_name = companyName;

        // Upsert into company_intelligence
        const record = {
          company_name: intel.company_name,
          domain: intel.domain || null,
          funding_total: intel.funding_total || null,
          last_funding_round: intel.last_funding_round || null,
          last_funding_date: intel.last_funding_date || null,
          last_funding_amount: intel.last_funding_amount || null,
          revenue_estimate: intel.revenue_estimate || null,
          employee_count: intel.employee_count || null,
          employee_growth: intel.employee_growth || null,
          ceo: intel.ceo || null,
          cto: intel.cto || null,
          cmo: intel.cmo || null,
          cfo: intel.cfo || null,
          vp_marketing: intel.vp_marketing || null,
          vp_engineering: intel.vp_engineering || null,
          industry: intel.industry || null,
          sub_sector: intel.sub_sector || null,
          business_model: intel.business_model || null,
          key_products: intel.key_products || [],
          competitors: intel.competitors || [],
          recent_acquisitions: intel.recent_acquisitions || [],
          existing_sponsorships: intel.existing_sponsorships || [],
          marketing_budget_signal: intel.marketing_budget_signal || null,
          brand_awareness_signal: intel.brand_awareness_signal || null,
          sponsorship_fit_score: intel.sponsorship_fit_score || null,
          enriched_at: new Date().toISOString(),
          enrichment_source: 'web_search_sonnet',
          enrichment_quality: 'structured',
          needs_refresh: false,
        };

        // Check if company already exists in intelligence table
        const existingIntel = await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(companyName)}*&limit=1`);
        if (Array.isArray(existingIntel) && existingIntel.length > 0) {
          await sbFetch(`company_intelligence?id=eq.${existingIntel[0].id}`, {
            method: 'PATCH', body: JSON.stringify(record)
          });
        } else {
          await sbFetch('company_intelligence', {
            method: 'POST', body: JSON.stringify(record)
          });
        }
        enriched++;
        console.log(`[CompanyEnrich] ✅ ${companyName} enriched`);
      } catch (compErr) {
        console.error(`[CompanyEnrich] ❌ ${companyName}:`, compErr.message);
      }
    }

    await cronHeartbeat('cron-company-enrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: enriched });
    return res.status(200).json({ ok: true, companies_checked: toEnrich.length, enriched });
  } catch (err) {
    console.error('[CompanyEnrich] Fatal:', err.message);
    await cronHeartbeat('cron-company-enrich', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
