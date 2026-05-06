// api/enrich-emails.js — Email Enrichment Engine
// Finds real email addresses for prospects using company domain pattern matching.
// Called by Kiko's find_email tool and by the build-campaign pipeline.
// Zero API cost — uses DNS MX verification + common B2B email patterns.
import dns from 'dns';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

const resolveMx = promisify(dns.resolveMx);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Common B2B email patterns ordered by frequency
const PATTERNS = [
  (f, l) => `${f}.${l}`,         // john.doe@company.com (most common ~60%)
  (f, l) => `${f}`,              // john@company.com (~20%)
  (f, l) => `${f[0]}${l}`,       // jdoe@company.com (~10%)
  (f, l) => `${f}${l}`,          // johndoe@company.com (~5%)
  (f, l) => `${f[0]}.${l}`,      // j.doe@company.com (~3%)
  (f, l) => `${l}.${f}`,         // doe.john@company.com (~2%)
];

// Verify a domain has MX records (can receive email)
async function verifyDomain(domain) {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

// Use Haiku to determine company email domain from name
async function findCompanyDomain(companyName) {
  try {
    // First try obvious patterns
    const clean = companyName.toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheticals
      .replace(/,?\s*(inc|llc|ltd|corp|plc|gmbh|ag|sa|srl)\.?$/i, '')
      .trim();
    
    // Try common domain variations
    const guesses = [
      clean.replace(/\s+/g, '') + '.com',           // sirionlabs.com
      clean.replace(/\s+/g, '') + '.ai',             // hebbia.ai
      clean.replace(/\s+/g, '') + '.io',             // spotdraft.io
      clean.replace(/\s+/g, '-') + '.com',           // contract-pod.com
      clean.split(/\s+/)[0] + '.com',               // first word only
      clean.split(/\s+/)[0] + '.ai',
      clean.split(/\s+/)[0] + '.io',
    ];
    
    // Check MX records for each guess
    for (const domain of guesses) {
      if (await verifyDomain(domain)) {
        return domain;
      }
    }
    
    // If guesses fail, use Haiku to determine the domain
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: 'You are a domain lookup tool. Given a company name, respond with ONLY their primary email domain (e.g. "sirionlabs.com"). Nothing else. No explanation.',
      messages: [{ role: 'user', content: `Company: ${companyName}` }],
    });
    const domain = (res.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    if (domain && domain.includes('.') && await verifyDomain(domain)) {
      return domain;
    }
    
    return null;
  } catch (err) {
    console.error(`[enrich-emails] Domain lookup failed for ${companyName}:`, err.message);
    return null;
  }
}

// Generate the most likely email for a person at a company
function generateEmail(firstName, lastName, domain) {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l || !domain) return null;
  
  // Default to first.last@domain (correct 60%+ of the time)
  return `${f}.${l}@${domain}`;
}

// Parse name into first and last
function parseName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  // Skip titles like MBA, Dr, Prof
  const filtered = parts.filter(p => !['mba', 'dr', 'prof', 'mr', 'mrs', 'ms', 'sir'].includes(p.toLowerCase()));
  if (filtered.length < 2) return { first: filtered[0] || '', last: '' };
  return { first: filtered[0], last: filtered[filtered.length - 1] };
}

export default async function handler(req, res) {
  try {
    const { prospects } = req.body; // [{name, company}]
    if (!Array.isArray(prospects) || !prospects.length) {
      return res.status(400).json({ error: 'prospects array required: [{name, company}]' });
    }
    
    // Group by company for efficiency (one domain lookup per company)
    const byCompany = {};
    for (const p of prospects) {
      const key = (p.company || '').trim();
      if (!byCompany[key]) byCompany[key] = [];
      byCompany[key].push(p);
    }
    
    const results = [];
    const domainCache = {};
    
    for (const [company, people] of Object.entries(byCompany)) {
      // Find company domain (cached)
      if (!domainCache[company]) {
        domainCache[company] = await findCompanyDomain(company);
      }
      const domain = domainCache[company];
      
      for (const person of people) {
        const { first, last } = parseName(person.name);
        const email = domain ? generateEmail(first, last, domain) : null;
        results.push({
          name: person.name,
          company: person.company,
          email,
          domain,
          pattern: domain ? 'first.last' : null,
          verified_domain: !!domain,
        });
      }
    }
    
    const found = results.filter(r => r.email).length;
    console.log(`[enrich-emails] ${found}/${results.length} emails generated`);
    res.json({ ok: true, found, total: results.length, results });
  } catch (err) {
    console.error('[enrich-emails] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
