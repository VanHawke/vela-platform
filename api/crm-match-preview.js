// api/crm-match-preview.js — Preview CRM matches before clicking Build Campaign
// Sunny spec 2026-04-12 v0.0.39: gives the user visibility into how many CRM
// companies/contacts will be sourced for a category BEFORE committing to a build.
//
// IMPORTANT: companies and contacts use a `data` jsonb column, not flat columns.
// All filters use data->>field syntax. This mirrors the working sourceFromCRM
// function in api/build-campaign.js.
//
// GET ?category=<id>
// Returns: {
//   category, industries, company_count, contact_count,
//   sample_companies: [{name, industry, contact_count}, ...],  // top 5
//   sample_contacts: [{name, title, company}, ...]              // top 8
// }

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15 };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const CATEGORY_INDUSTRY_MAP = {
  banking:        ['Banking', 'FinTech'],
  fintech:        ['FinTech', 'Banking', 'InsurTech'],
  cybersecurity:  ['Cybersecurity'],
  cloud:          ['Cloud Infrastructure', 'SaaS', 'DevOps', 'Data Centers'],
  ai_data:        ['AI/ML', 'Data Analytics', 'Quantum Computing'],
  software:       ['SaaS', 'DevOps', 'Developer Tools'],
  semiconductors: ['Semiconductors', 'Semiconductor', 'Consumer Electronics'],
  telecom:        ['Telecommunications'],
  gaming:         ['Gaming'],
  crypto:         ['Blockchain'],
  energy:         ['Energy', 'Mining'],
  automotive:     ['Automotive'],
  hospitality:    ['Hospitality', 'Travel'],
  fashion:        ['Fashion', 'Luxury Goods'],
  watches:        ['Watches', 'Luxury Goods'],
  food_bev:       ['Food & Beverage', 'Beverages', 'Food Tech'],
  health:         ['HealthTech', 'Healthcare'],
  logistics:      ['Supply Chain', 'Logistics'],
  legal:          ['Legal Tech', 'Legal'],
  robotics:       ['Robotics'],
};

const RELEVANT_TITLE_REGEX = /chief marketing|cmo|head of (sponsorship|partnership|brand|marketing)|vp.*marketing|director.*(brand|marketing|sponsorship)|chief (revenue|brand|growth|commercial)|cro|cbo|cco|chief executive|ceo|chief financial|cfo|head of (business development|bd|strategy|growth)/i;

export default async function handler(req, res) {
  try {
    const category = req.query?.category;
    if (!category) return res.status(400).json({ error: 'category required' });
    const industries = CATEGORY_INDUSTRY_MAP[category];
    if (!industries) return res.status(400).json({ error: `unknown category: ${category}` });

    // 1. Fetch companies matching industry from jsonb data column
    const { data: companies, error: cErr } = await supabase
      .from('companies')
      .select('id, data')
      .in('data->>industry', industries)
      .limit(200);

    if (cErr) {
      console.error('[crm-match-preview] companies query error:', cErr.message);
      return res.status(500).json({ error: cErr.message });
    }

    if (!companies || companies.length === 0) {
      return res.status(200).json({
        category, industries,
        company_count: 0, contact_count: 0,
        sample_companies: [], sample_contacts: [],
        message: `No CRM companies match the ${category} category industries (${industries.join(', ')}). Build will rely entirely on web search.`,
      });
    }

    // 2. For each company, find contacts via text-match on data->>company
    // Mirror sourceFromCRM: parallel batches via Promise.all
    const companyResults = await Promise.all(
      companies.map(async (co) => {
        const companyName = co.data?.name || '';
        if (!companyName) return null;
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, data')
          .filter('data->>company', 'ilike', companyName)
          .limit(15);
        // Filter to relevant titles only
        const relevant = (contacts || []).filter(ct => {
          const d = ct.data || {};
          if (!d.title) return false;
          return RELEVANT_TITLE_REGEX.test(d.title);
        });
        return {
          name: companyName,
          industry: co.data?.industry || '',
          contact_count: relevant.length,
          contacts: relevant,
        };
      })
    );

    const validResults = companyResults.filter(r => r && r.contact_count > 0);
    const totalContacts = validResults.reduce((s, r) => s + r.contact_count, 0);

    // Top 5 companies by contact count
    const sample_companies = validResults
      .sort((a, b) => b.contact_count - a.contact_count)
      .slice(0, 5)
      .map(r => ({ name: r.name, industry: r.industry, contact_count: r.contact_count }));

    // Top 8 contacts across all companies
    const allContactsFlat = [];
    for (const r of validResults) {
      for (const ct of r.contacts) {
        const d = ct.data || {};
        allContactsFlat.push({
          name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown',
          title: d.title || '',
          company: r.name,
        });
        if (allContactsFlat.length >= 8) break;
      }
      if (allContactsFlat.length >= 8) break;
    }

    return res.status(200).json({
      category, industries,
      company_count: validResults.length,
      total_companies_in_category: companies.length,
      contact_count: totalContacts,
      sample_companies,
      sample_contacts: allContactsFlat,
    });
  } catch (err) {
    console.error('[crm-match-preview] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
