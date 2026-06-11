// api/enrich-on-demand.js — On-demand contact enrichment
// REPLACES the old cron-crm-enrich.js nightly sweep.
// Only runs when explicitly triggered (new contacts added to campaign/CRM).
// Cascades through free methods first, paid last. Hard-capped.

import { sbFetch } from './kiko-tools.js';
import { verifyEmail } from './lib/verify-email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const HUNTER_KEY = process.env.HUNTER_API_KEY;
const APOLLO_KEY = process.env.APOLLO_API_KEY;
const MAX_SONNET_CALLS = 20; // Hard cap on AI enrichment per batch

// ═══ TIER 1: DNS verification (free, always runs) ═══
async function tier1_dns(email) {
  if (!email) return null;
  try {
    const result = await verifyEmail(email);
    return { tier: 1, source: 'dns', valid: result.valid, reason: result.reason, mx: result.mx };
  } catch { return null; }
}

// ═══ TIER 2: Hunter.io (50 searches/month free) ═══
async function tier2_hunter(firstName, lastName, domain) {
  if (!HUNTER_KEY || !firstName || !lastName || !domain) return null;
  try {
    const url = 'https://api.hunter.io/v2/email-finder?' +
      'domain=' + encodeURIComponent(domain) +
      '&first_name=' + encodeURIComponent(firstName) +
      '&last_name=' + encodeURIComponent(lastName) +
      '&api_key=' + HUNTER_KEY;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.data?.email) {
      return {
        tier: 2, source: 'hunter',
        email: data.data.email,
        confidence: data.data.confidence,
        position: data.data.position,
        linkedin_url: data.data.linkedin || null,
      };
    }
    return null;
  } catch { return null; }
}

// Hunter domain search — find email pattern for a company
async function tier2_hunter_domain(domain) {
  if (!HUNTER_KEY || !domain) return null;
  try {
    const url = 'https://api.hunter.io/v2/domain-search?domain=' + encodeURIComponent(domain) + '&limit=5&api_key=' + HUNTER_KEY;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      pattern: data.data?.pattern,
      emails: (data.data?.emails || []).map(e => ({ email: e.value, name: , title: e.position, confidence: e.confidence })),
    };
  } catch { return null; }
}

// ═══ TIER 3: Apollo (free tier, when credits available) ═══
async function tier3_apollo(email, firstName, lastName, domain) {
  if (!APOLLO_KEY) return null;
  try {
    const body = email ? { email } : { first_name: firstName, last_name: lastName, domain };
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      if (res.status === 422) return { tier: 3, source: 'apollo', error: 'credits_exhausted' };
      return null;
    }
    const data = await res.json();
    const p = data.person;
    if (!p) return null;
    return {
      tier: 3, source: 'apollo',
      email: p.email, email_status: p.email_status,
      title: p.title, company: p.organization?.name,
      linkedin_url: p.linkedin_url, city: p.city, country: p.country,
    };
  } catch { return null; }
}

// ═══ TIER 4: Sonnet web search (capped, last resort) ═══
async function tier4_sonnet(name, company) {
  if (!name) return null;
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: 'Find the current job title, company, LinkedIn URL, and work email for: ' + name + (company ? ' at ' + company : '') + '. Return ONLY JSON. If unknown, use null.' }],
    });
    const text = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return { tier: 4, source: 'sonnet_web_search', ...parsed };
  } catch { return null; }
}

// ═══ MAIN: Enrich a batch of contacts ═══
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { contact_ids, max_ai_calls } = req.body || {};
  if (!contact_ids?.length) return res.status(400).json({ error: 'contact_ids required' });

  const cap = Math.min(max_ai_calls || MAX_SONNET_CALLS, MAX_SONNET_CALLS);
  let sonnetCalls = 0;
  const results = [];

  for (const id of contact_ids) {
    const contacts = await sbFetch(\`contacts?id=eq.\${id}&select=id,data&limit=1\`);
    const contact = contacts?.[0];
    if (!contact) { results.push({ id, status: 'not_found' }); continue; }

    const d = contact.data || {};
    const name = \`\${d.firstName || ""} \${d.lastName || ""}\`.trim();
    const email = d.email;
    const domain = email ? email.split('@')[1] : (d.company || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    const enriched = { ...d };
    let enrichSource = null;

    // TIER 1: DNS verification (if email exists)
    if (email) {
      const dns = await tier1_dns(email);
      if (dns) {
        enriched.email_verified = dns.valid;
        enriched.email_verify_source = dns.source;
        enriched.email_verify_reason = dns.reason;
        if (dns.valid === false) enriched.email_status = 'invalid_' + dns.reason;
      }
    }

    // TIER 2: Hunter.io (if missing email or need verification)
    if (!email || !enriched.email_verified) {
      const hunter = await tier2_hunter(d.firstName, d.lastName, domain);
      if (hunter?.email) {
        enriched.email = hunter.email;
        enriched.email_source = 'hunter';
        enriched.email_confidence = hunter.confidence;
        if (hunter.position && !d.title) enriched.title = hunter.position;
        if (hunter.linkedin_url && !d.linkedinUrl) enriched.linkedinUrl = hunter.linkedin_url;
        enrichSource = 'hunter';
      }
    }

    // TIER 3: Apollo (if still missing data)
    if ((!enriched.email || !enriched.title || !enriched.linkedinUrl) && APOLLO_KEY) {
      const apollo = await tier3_apollo(enriched.email, d.firstName, d.lastName, domain);
      if (apollo?.error === 'credits_exhausted') {
        // Apollo done for this batch — skip for remaining contacts
        console.log('[enrich] Apollo credits exhausted — skipping Tier 3 for remaining');
      } else if (apollo) {
        if (apollo.email && apollo.email_status === 'verified' && !enriched.email) enriched.email = apollo.email;
        if (apollo.title && !enriched.title) enriched.title = apollo.title;
        if (apollo.linkedin_url && !enriched.linkedinUrl) enriched.linkedinUrl = apollo.linkedin_url;
        if (apollo.city && !enriched.city) enriched.city = apollo.city;
        if (apollo.country && !enriched.country) enriched.country = apollo.country;
        enrichSource = enrichSource || 'apollo';
      }
    }

    // TIER 4: Sonnet web search (last resort, capped)
    if ((!enriched.email || !enriched.title || !enriched.linkedinUrl) && sonnetCalls < cap) {
      const sonnet = await tier4_sonnet(name, d.company);
      sonnetCalls++;
      if (sonnet) {
        if (sonnet.email && !enriched.email) { enriched.email = sonnet.email; enriched.email_inferred = true; }
        if (sonnet.title && !enriched.title) enriched.title = sonnet.title;
        if (sonnet.linkedin_url && !enriched.linkedinUrl) enriched.linkedinUrl = sonnet.linkedin_url;
        enrichSource = enrichSource || 'sonnet';
      }
    }

    // Save enriched data
    enriched.enriched_at = new Date().toISOString();
    enriched.enrich_source = enrichSource;
    await sbFetch(\`contacts?id=eq.\${id}\`, {
      method: 'PATCH',
      body: JSON.stringify({ data: enriched, updated_at: new Date().toISOString() }),
    });

    results.push({ id, name, enrichSource, hasEmail: !!enriched.email, hasTitle: !!enriched.title, hasLinkedIn: !!enriched.linkedinUrl });
  }

  return res.json({
    ok: true,
    enriched: results.length,
    sonnet_calls_used: sonnetCalls,
    sonnet_cap: cap,
    results,
  });
}
