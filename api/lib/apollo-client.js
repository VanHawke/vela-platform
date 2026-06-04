// api/lib/apollo-client.js — Server-side Apollo.io API integration
// Provides email verification, contact enrichment, and prospect search.
// Uses APOLLO_API_KEY from environment. Free plan has limited credits.

const API_BASE = 'https://api.apollo.io/api/v1';

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not configured');
  return key;
}

async function apolloFetch(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': getApiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Enrich a person by email — returns verified email status + full profile.
 * Consumes 1 credit per successful match.
 */
export async function enrichByEmail(email) {
  const data = await apolloFetch('/people/match', { email });
  if (!data?.person) return { found: false, email, email_status: null };
  const p = data.person;
  return {
    found: true,
    email: p.email,
    email_status: p.email_status, // 'verified', 'guessed', 'unavailable'
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title,
    company: p.organization?.name,
    linkedin_url: p.linkedin_url,
    city: p.city,
    country: p.country,
    apollo_id: p.id,
  };
}

/**
 * Enrich a person by name + company domain.
 */
export async function enrichByNameDomain(firstName, lastName, domain) {
  const data = await apolloFetch('/people/match', {
    first_name: firstName, last_name: lastName, organization_domain: domain,
  });
  if (!data?.person) return { found: false };
  const p = data.person;
  return {
    found: true,
    email: p.email,
    email_status: p.email_status,
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title,
    company: p.organization?.name,
    linkedin_url: p.linkedin_url,
    apollo_id: p.id,
  };
}

/**
 * Search for prospects matching criteria.
 * Returns list (no emails — need enrichByEmail for each).
 */
export async function searchProspects({ titles, keywords, locations, industries, companySize, perPage = 25 } = {}) {
  const body = { per_page: perPage, page: 1 };
  if (titles?.length) body.person_titles = titles;
  if (keywords?.length) body.q_organization_keyword_tags = keywords;
  if (locations?.length) body.person_locations = locations;
  if (industries?.length) body.organization_industry_tag_ids = industries;
  if (companySize) body.organization_num_employees_ranges = [companySize];
  const data = await apolloFetch('/mixed_people/api_search', body);
  return (data?.people || []).map(p => ({
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title,
    company: p.organization?.name,
    domain: p.organization?.primary_domain,
    linkedin_url: p.linkedin_url,
    has_email: p.has_email || false,
    apollo_id: p.id,
  }));
}

/**
 * Verify an email via Apollo enrichment.
 * Returns { verified: true/false, email_status, email }
 */
export async function verifyEmailViaApollo(email) {
  try {
    const result = await enrichByEmail(email);
    if (!result.found) return { verified: null, email_status: 'not_found', email };
    return {
      verified: result.email_status === 'verified' ? true : result.email_status === 'guessed' ? null : result.email_status === null ? null : false,
      email_status: result.email_status,
      email: result.email,
      name: result.name,
      company: result.company,
    };
  } catch (e) {
    return { verified: null, email_status: 'error', email, error: e.message };
  }
}

export default { enrichByEmail, enrichByNameDomain, searchProspects, verifyEmailViaApollo };
