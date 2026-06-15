// api/resolve-email.js — Email resolution with EXPLICIT confidence for campaign targets.
//
// Returns the best-available email for a decision-maker WITH a confidence bucket and a
// source, instead of a silent guess. Built for board-level outreach where a bounced
// first email burns the only shot — so Sunny can decide per target.
//
//   confidence buckets (most→least trustworthy):
//     'verified'  — a current CRM contact's own address (or, future, a deliverability
//                   check via Hunter once it resets).
//     'sourced'   — a specific address found with a public source URL, OR a CRM contact
//                   who may have moved. Corroborated but not deliverability-tested.
//     'inferred'  — derived from the company's email PATTERN (CRM colleagues at the same
//                   domain, or a stated company format). Not the person's confirmed address.
//     'unknown'   — could not determine. Surface the company, flag for enrichment.
//
// "8 verified beats 50 soft" — call this synchronously for the SHORTLIST only.
//
// Exposed as a reusable function (resolveEmailForPerson) AND a POST endpoint for testing.
//   POST { name, company, domain, known_email?, known_verified?, title? }

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── normalisation ──
function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function norm(s) { return stripAccents(s).toLowerCase().replace(/[^a-z]/g, ''); }
function cleanDomain(d) {
  return String(d || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null;
}
function isValidEmailShape(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// ── email pattern model: an ordered list of name components + a separator ──
const COMPONENT = { first: f => f.f, last: f => f.l, fi: f => f.f[0], li: f => f.l[0] };
const LABEL = { first: 'first', last: 'last', fi: 'f', li: 'l' };
const ORDERINGS = [
  ['first', 'last'], ['last', 'first'], ['fi', 'last'], ['first', 'li'],
  ['li', 'first'], ['last', 'fi'], ['first'], ['last'], ['fi', 'li'], ['li', 'fi'],
];
const SEPS = ['.', '_', '-', ''];

function detectPattern(local, first, last) {
  const f = norm(first), l = norm(last);
  if (!f || !l || !local) return null;
  const lp = local.toLowerCase();
  const ctx = { f, l };
  for (const order of ORDERINGS) {
    const parts = order.map(c => COMPONENT[c](ctx));
    if (parts.some(p => !p)) continue;
    if (order.length === 1) { if (lp === parts[0]) return { order, sep: '' }; continue; }
    for (const sep of SEPS) if (lp === parts.join(sep)) return { order, sep };
  }
  return null;
}
function applyPattern(pat, first, last, domain) {
  const f = norm(first), l = norm(last);
  if (!f || !l || !pat || !domain) return null;
  const parts = pat.order.map(c => COMPONENT[c]({ f, l }));
  if (parts.some(p => !p)) return null;
  return `${parts.join(pat.sep)}@${domain}`;
}
function patternLabel(pat) { return pat ? pat.order.map(c => LABEL[c]).join(pat.sep) : 'none'; }
function parseStatedPattern(s) {
  const m = {
    'first.last': { order: ['first', 'last'], sep: '.' },
    'first_last': { order: ['first', 'last'], sep: '_' },
    'firstlast':  { order: ['first', 'last'], sep: '' },
    'flast':      { order: ['fi', 'last'], sep: '' },
    'f.last':     { order: ['fi', 'last'], sep: '.' },
    'first':      { order: ['first'], sep: '' },
    'last':       { order: ['last'], sep: '' },
  };
  return m[String(s || '').toLowerCase()] || null;
}

// ── CRM lookups ──
// Exact-ish person already in the CRM with a real email = our most trustworthy answer.
async function findCrmContact(first, last, company, domain) {
  const { data } = await supabase.from('contacts')
    .select('data, last_verified_at, still_at_company')
    .ilike('data->>firstName', first).ilike('data->>lastName', last).limit(10);
  const rows = (data || []).filter(r => isValidEmailShape(r.data?.email));
  if (!rows.length) return null;
  let pick = domain && rows.find(r => r.data.email.toLowerCase().endsWith('@' + domain));
  if (!pick && company) {
    const token = norm(company.split(/\s+/)[0]);
    pick = rows.find(r => norm(r.data.company || '').includes(token));
  }
  return pick || rows[0];
}

// Dominant email pattern for a company, derived from same-domain colleagues in the CRM.
async function deriveCrmPattern(company, domain) {
  let rows = [];
  if (domain) {
    const { data } = await supabase.from('contacts').select('data')
      .ilike('data->>email', `%@${domain}`).limit(80);
    rows = data || [];
  } else if (company) {
    const { data } = await supabase.from('contacts').select('data')
      .ilike('data->>company', company).limit(80);
    rows = data || [];
  }
  const tally = new Map();
  for (const r of rows) {
    const d = r.data || {};
    if (!isValidEmailShape(d.email)) continue;
    const [local, dom] = d.email.toLowerCase().split('@');
    if (domain && dom !== domain) continue;
    const pat = detectPattern(local, d.firstName, d.lastName);
    if (!pat) continue;
    const key = dom + '|' + JSON.stringify(pat);
    const cur = tally.get(key) || { dom, pat, count: 0 };
    cur.count++; tally.set(key, cur);
  }
  if (!tally.size) return null;
  return [...tally.values()].sort((a, b) => b.count - a.count)[0]; // {dom, pat, count}
}

// ── web fallback (for companies not in the CRM) ──
async function webFindEmail({ name, title, company, domain }) {
  const prompt = `Find the work email address of ${name}${title ? `, ${title}` : ''} at ${company || domain}${domain ? ` (domain ${domain})` : ''}.
Search the web (company website, press releases, conference/speaker pages, LinkedIn, reputable directories).
Prefer their EXACT address. If you cannot find the exact address, identify the company's standard email FORMAT.
Return ONLY this JSON, nothing else:
{"found": true|false, "email": "exact address or null", "is_exact": true|false, "pattern": "first.last"|"first_last"|"firstlast"|"flast"|"f.last"|"first"|"last"|null, "source_url": "url or null"}
Never invent an address. If unsure, set email=null and give pattern if known, else nulls.`;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const m = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

// ── main resolver ──
export async function resolveEmailForPerson({ name, company, domain, knownEmail, knownVerified, title }) {
  const tokens = String(name || '').trim().split(/\s+/);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  domain = cleanDomain(domain);

  // 1. caller-supplied verified email (e.g. CRM-sourced contact)
  if (knownVerified && isValidEmailShape(knownEmail)) {
    return { email: knownEmail.toLowerCase(), confidence: 'verified', method: 'crm', source: 'CRM verified contact', pattern: null };
  }

  // 2. exact CRM contact match
  if (first && last) {
    const c = await findCrmContact(first, last, company, domain);
    if (c) {
      const stillHere = c.still_at_company !== false;
      return {
        email: c.data.email.toLowerCase(),
        confidence: stillHere ? 'verified' : 'sourced',
        method: 'crm-contact',
        source: stillHere
          ? `CRM contact${c.last_verified_at ? ` (verified ${String(c.last_verified_at).slice(0, 10)})` : ''}`
          : 'CRM contact — may have moved, re-verify',
        pattern: null,
      };
    }
  }

  // 3. CRM company email pattern → infer this person's address
  if (first && last) {
    const crm = await deriveCrmPattern(company, domain);
    if (crm && crm.dom) {
      const email = applyPattern(crm.pat, first, last, crm.dom);
      if (email) return {
        email, confidence: 'inferred', method: 'crm-pattern',
        source: `Pattern "${patternLabel(crm.pat)}@${crm.dom}" from ${crm.count} CRM colleague(s)`,
        pattern: patternLabel(crm.pat), samples: crm.count,
      };
    }
  }

  // 4. web search — exact address or a stated company format
  if (name && (company || domain)) {
    const web = await webFindEmail({ name, title, company, domain });
    if (web) {
      if (isValidEmailShape(web.email)) {
        return {
          email: web.email.toLowerCase(),
          confidence: web.is_exact ? 'sourced' : 'inferred',
          method: 'web', source: web.source_url || 'web search', pattern: web.pattern || null,
        };
      }
      if (web.pattern && domain && first && last) {
        const pat = parseStatedPattern(web.pattern);
        const email = pat && applyPattern(pat, first, last, domain);
        if (email) return {
          email, confidence: 'inferred', method: 'web-pattern',
          source: web.source_url || 'web search (stated company format)', pattern: patternLabel(pat),
        };
      }
    }
  }

  // 5. Hunter deliverability seam — drops in here once credits reset (~Jul 1).
  return { email: null, confidence: 'unknown', method: 'none', source: 'No reliable email found — needs enrichment', pattern: null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!b.name) return res.status(400).json({ error: 'name required' });
    const r = await resolveEmailForPerson({
      name: b.name, company: b.company, domain: b.domain,
      knownEmail: b.known_email, knownVerified: !!b.known_verified, title: b.title,
    });
    return res.status(200).json({ ok: true, ...r });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

// exported for unit testing
export const _internals = { detectPattern, applyPattern, patternLabel, deriveCrmPattern, findCrmContact };
