// api/crm-match-preview.js — Preview CRM matches before clicking Build Campaign
// Sunny spec 2026-04-12 v0.0.39: gives the user visibility into how many CRM
// companies/contacts will be sourced for a category BEFORE committing to a build.
//
// GET ?category=<id>
// Returns: {
//   category, industries, company_count, contact_count,
//   sample_companies: [{name, industry, contact_count}, ...],  // top 5
//   sample_contacts: [{name, title, company}, ...]              // top 8
// }

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 15 };

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

    // Build the OR clause for PostgREST: industry=in.(Banking,FinTech,...)
    const industryFilter = industries.map(i => `"${i}"`).join(',');

    // Fetch matching companies
    const companies = await sbFetch(
      `companies?industry=in.(${encodeURIComponent(industryFilter)})&select=id,name,industry&limit=200`
    );

    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(200).json({
        category, industries,
        company_count: 0, contact_count: 0,
        sample_companies: [], sample_contacts: [],
        message: `No CRM companies match the ${category} category industries (${industries.join(', ')}). Build will rely entirely on web search.`,
      });
    }

    // Fetch contacts at those companies
    const companyIds = companies.map(c => c.id);
    // Chunk if too many
    const allContacts = [];
    for (let i = 0; i < companyIds.length; i += 50) {
      const chunk = companyIds.slice(i, i + 50);
      const idFilter = chunk.join(',');
      const contacts = await sbFetch(
        `contacts?company_id=in.(${idFilter})&select=id,first_name,last_name,title,company_id&limit=500`
      );
      if (Array.isArray(contacts)) allContacts.push(...contacts);
    }

    // Filter to relevant titles only
    const relevantContacts = allContacts.filter(c => c.title && RELEVANT_TITLE_REGEX.test(c.title));

    // Build company → contact count map
    const companyMap = new Map(companies.map(c => [c.id, { ...c, contact_count: 0 }]));
    for (const contact of relevantContacts) {
      const co = companyMap.get(contact.company_id);
      if (co) co.contact_count++;
    }

    // Sample top 5 companies (by relevant contact count)
    const sample_companies = [...companyMap.values()]
      .filter(c => c.contact_count > 0)
      .sort((a, b) => b.contact_count - a.contact_count)
      .slice(0, 5)
      .map(c => ({ name: c.name, industry: c.industry, contact_count: c.contact_count }));

    // Sample top 8 contacts
    const sample_contacts = relevantContacts.slice(0, 8).map(c => ({
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
      title: c.title,
      company: companyMap.get(c.company_id)?.name || 'Unknown',
    }));

    return res.status(200).json({
      category, industries,
      company_count: sample_companies.length > 0
        ? [...companyMap.values()].filter(c => c.contact_count > 0).length
        : 0,
      total_companies_in_category: companies.length,
      contact_count: relevantContacts.length,
      sample_companies,
      sample_contacts,
    });
  } catch (err) {
    console.error('[crm-match-preview] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
