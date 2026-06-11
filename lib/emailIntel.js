// lib/emailIntel.js — Kiko Email Intelligence Engine
// Finds and verifies professional email addresses using pattern detection + SMTP verification
// Zero external API dependencies — runs entirely on Hetzner

import dns from 'dns';
import net from 'net';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

// ══════════════════════════════════════════════
// APOLLO.IO — 270M+ verified contacts, free tier
// Source 1 in the cascade. Unlimited email credits.
// ══════════════════════════════════════════════
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

async function apolloFindEmail(firstName, lastName, domain, company) {
  if (!APOLLO_API_KEY) return null;
  try {
    const params = new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      organization_name: company || domain,
      domain: domain,
      reveal_personal_emails: 'false',
      reveal_phone_number: 'false',
    });
    const res = await fetch(`https://api.apollo.io/api/v1/people/match?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': APOLLO_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const person = data.person;
    if (!person) return null;
    const email = person.email;
    if (!email || !email.includes('@')) return null;
    return {
      email,
      verified: person.email_status === 'verified',
      confidence: person.email_status === 'verified' ? 0.95 : 0.7,
      source: 'apollo.io',
      title: person.title || null,
      linkedin: person.linkedin_url || null,
      company: person.organization?.name || company,
    };
  } catch { return null; }
}

// Apollo People Search — find decision-makers at a company (no credits consumed)
async function apolloSearchPeople(companyName, titles = ['CMO', 'VP Marketing', 'Head of Marketing']) {
  if (!APOLLO_API_KEY) return [];
  try {
    const params = new URLSearchParams();
    params.append('q_organization_name', companyName);
    for (const t of titles) params.append('person_titles[]', t);
    params.append('per_page', '5');
    const res = await fetch(`https://api.apollo.io/api/v1/mixed_people/api_search?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': APOLLO_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.people || []).map(p => ({
      id: p.id,
      name: p.name,
      firstName: p.first_name,
      lastName: p.last_name,
      title: p.title,
      company: p.organization?.name,
      linkedin: p.linkedin_url,
    }));
  } catch { return []; }
}

// ══════════════════════════════════════════════
// EMAIL PATTERNS — 12 common corporate formats
// ══════════════════════════════════════════════
const PATTERNS = [
  { id: 'first.last',   fn: (f, l) => `${f}.${l}` },
  { id: 'firstlast',    fn: (f, l) => `${f}${l}` },
  { id: 'first',        fn: (f, l) => `${f}` },
  { id: 'flast',        fn: (f, l) => `${f[0]}${l}` },
  { id: 'first.l',      fn: (f, l) => `${f}.${l[0]}` },
  { id: 'first_last',   fn: (f, l) => `${f}_${l}` },
  { id: 'f.last',       fn: (f, l) => `${f[0]}.${l}` },
  { id: 'last.first',   fn: (f, l) => `${l}.${f}` },
  { id: 'last',         fn: (f, l) => `${l}` },
  { id: 'fl',           fn: (f, l) => `${f[0]}${l[0]}` },
  { id: 'lastf',        fn: (f, l) => `${l}${f[0]}` },
  { id: 'lastfirst',    fn: (f, l) => `${l}${f}` },
];


// ══════════════════════════════════════════════
// HUNTER.IO API — Free tier: 25 lookups/month
// ══════════════════════════════════════════════
const HUNTER_API_KEY = '404535bb1e247b82992209e153cd2b2fe3eacde6';

async function hunterFindEmail(firstName, lastName, domain) {
  try {
    const url = 'https://api.hunter.io/v2/email-finder?domain=' + encodeURIComponent(domain) + '&first_name=' + encodeURIComponent(firstName) + '&last_name=' + encodeURIComponent(lastName) + '&api_key=' + HUNTER_API_KEY;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.data && data.data.email) {
      return {
        email: data.data.email,
        confidence: (data.data.score || 50) / 100,
        verified: data.data.verification && data.data.verification.status === 'valid',
        source: 'hunter.io',
        position: data.data.position || null,
        linkedin: data.data.linkedin_url || null,
      };
    }
    return null;
  } catch { return null; }
}

async function hunterDomainSearch(domain) {
  try {
    const url = 'https://api.hunter.io/v2/domain-search?domain=' + encodeURIComponent(domain) + '&limit=5&api_key=' + HUNTER_API_KEY;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.data && data.data.emails && data.data.emails.length > 0) {
      return data.data.emails.map(e => e.value).filter(Boolean);
    }
    if (data.data && data.data.pattern) {
      return { pattern: data.data.pattern }; // e.g. "{first}.{last}"
    }
    return null;
  } catch { return null; }
}


// ══════════════════════════════════════════════
// SNOV.IO API — Free tier: 50 lookups/month
// ══════════════════════════════════════════════
const SNOV_USER_ID = '553969ec6fbe768f993684fe2dbd2acf';
const SNOV_SECRET = '8605d5403f512e9cffc46921d9ed166e';
let snovToken = null;
let snovTokenExpiry = 0;

async function getSnovToken() {
  if (snovToken && Date.now() < snovTokenExpiry) return snovToken;
  try {
    const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: SNOV_USER_ID, client_secret: SNOV_SECRET }),
    });
    const data = await res.json();
    if (data.access_token) { snovToken = data.access_token; snovTokenExpiry = Date.now() + 3500000; return snovToken; }
  } catch {}
  return null;
}

async function snovFindEmail(firstName, lastName, domain) {
  try {
    const token = await getSnovToken();
    if (!token) return null;
    const res = await fetch('https://api.snov.io/v1/get-emails-from-names', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, firstName, lastName, domain }),
    });
    const data = await res.json();
    if (data.data && data.data.emails && data.data.emails.length > 0) {
      const best = data.data.emails.sort((a, b) => (b.emailStatus === 'valid' ? 1 : 0) - (a.emailStatus === 'valid' ? 1 : 0))[0];
      return { email: best.email, verified: best.emailStatus === 'valid', confidence: best.emailStatus === 'valid' ? 0.95 : 0.7, source: 'snov.io' };
    }
  } catch {}
  return null;
}

// ══════════════════════════════════════════════
// CLEAROUT API — Free credits
// ══════════════════════════════════════════════
const CLEAROUT_TOKEN = 'b60ee141d350e6e807132abc8d0f515d:656f42a896b10daaa5a2ba3a7f5874b5dfb715762d8f778406ed48b9b89879a0';

async function clearoutVerifyEmail(email) {
  try {
    const res = await fetch('https://api.clearout.io/v2/email_verify/instant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer:' + CLEAROUT_TOKEN },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.data) {
      return {
        valid: data.data.status === 'valid',
        status: data.data.status,
        reason: data.data.sub_status || data.data.status,
        catch_all: data.data.is_catch_all || false,
      };
    }
  } catch {}
  return null;
}


// ══════════════════════════════════════════════
// VOILA NORBERT — 50 free lookups/month
// ══════════════════════════════════════════════
const NORBERT_KEY = '2c453a9e-9abc-4b94-aff8-0846d9cb60ad';

async function norbertFindEmail(firstName, lastName, domain) {
  try {
    const res = await fetch('https://api.voilanorbert.com/2018-01-08/search/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from(NORBERT_KEY + ':').toString('base64') },
      body: JSON.stringify({ name: firstName + ' ' + lastName, domain }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.email) {
      return { email: data.email.email || data.email, verified: data.email.score > 70, confidence: (data.email.score || 50) / 100, source: 'norbert' };
    }
  } catch {}
  return null;
}

// ══════════════════════════════════════════════
// SKRAPP.IO — 100 free lookups/month
// ══════════════════════════════════════════════
const SKRAPP_KEY = '16488159434pe7UCIl2NPdbiRdyTgkIk2TikkX7bOB';

async function skrappFindEmail(firstName, lastName, domain) {
  try {
    const res = await fetch('https://app.skrapp.io/api/v2/find?firstName=' + encodeURIComponent(firstName) + '&lastName=' + encodeURIComponent(lastName) + '&domain=' + encodeURIComponent(domain), {
      headers: { 'X-Access-Key': SKRAPP_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.email) {
      return { email: data.email, verified: data.accuracy === 'verified', confidence: data.accuracy === 'verified' ? 0.9 : 0.6, source: 'skrapp' };
    }
  } catch {}
  return null;
}

// ══════════════════════════════════════════════
// PROSPEO — 75 free credits/month
// ══════════════════════════════════════════════
const PROSPEO_KEY = 'pk_9142c0872613098079a1f55fdd1c279517d569570db87a71c4778a634a22e091';

async function prospeoFindEmail(firstName, lastName, domain) {
  try {
    const res = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': PROSPEO_KEY },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, company: domain }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.response && data.response.email) {
      return { email: data.response.email, verified: data.response.email_status === 'VALID', confidence: data.response.email_status === 'VALID' ? 0.93 : 0.6, source: 'prospeo' };
    }
  } catch {}
  return null;
}

// Pattern cache — avoid re-detecting for same domain
const patternCache = new Map();
// Gateway cache — skip SMTP for domains that block verification
const gatewayCache = new Set();

// ══════════════════════════════════════════════
// STEP 1: DETECT EMAIL PATTERN FOR A DOMAIN
// ══════════════════════════════════════════════
// Given known emails from a domain, figure out the pattern
function detectPattern(knownEmails, domain) {
  const domainLower = domain.toLowerCase();
  const parsed = [];
  
  for (const email of knownEmails) {
    const [local, emailDomain] = email.toLowerCase().split('@');
    if (emailDomain !== domainLower) continue;
    parsed.push(local);
  }
  
  if (parsed.length === 0) return { pattern: 'first.last', confidence: 0.3 }; // default guess
  
  // Score each pattern against known emails
  // We need name-email pairs to score, but if we only have emails, infer structure
  const scores = {};
  for (const p of PATTERNS) scores[p.id] = 0;
  
  for (const local of parsed) {
    // Check structural patterns
    if (local.includes('.') && local.split('.').length === 2) {
      const parts = local.split('.');
      if (parts[0].length > 1 && parts[1].length > 1) scores['first.last'] += 3;
      else if (parts[0].length === 1 && parts[1].length > 1) scores['f.last'] += 3;
      else if (parts[0].length > 1 && parts[1].length === 1) scores['first.l'] += 3;
    } else if (local.includes('_')) {
      scores['first_last'] += 3;
    } else if (local.length <= 3) {
      scores['fl'] += 1;
    } else if (/^[a-z]{1}[a-z]+$/.test(local) && local.length > 4) {
      scores['flast'] += 2;
      scores['firstlast'] += 1;
    } else if (local.length > 2 && local.length <= 10) {
      scores['first'] += 1;
      scores['firstlast'] += 1;
    }
  }
  
  // Find highest scoring pattern
  let bestPattern = 'first.last';
  let bestScore = 0;
  for (const [id, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; bestPattern = id; }
  }
  
  const confidence = Math.min(0.95, 0.3 + (bestScore * 0.15));
  return { pattern: bestPattern, confidence };
}

// ══════════════════════════════════════════════
// STEP 2: SCRAPE DOMAIN FOR EXISTING EMAILS
// ══════════════════════════════════════════════

// Google search for existing emails at a domain
async function searchGoogleForEmails(domain, customQuery) {
  const emails = new Set();
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const queries = customQuery ? [customQuery] : ['"@' + domain + '" email', '"@' + domain + '" contact'];
  for (const q of queries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://www.google.com/search?q=' + encodeURIComponent(q) + '&num=10', {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      });
      clearTimeout(timeout);
      const html = await res.text();
      const found = html.match(emailRegex) || [];
      for (const e of found) {
        const lower = e.toLowerCase();
        if (lower.endsWith('@' + domain.toLowerCase())) {
          const local = lower.split('@')[0];
          if (!['info','contact','admin','support','sales','hello','help','team','office','hr','noreply','no-reply','webmaster','postmaster','abuse','privacy','legal'].includes(local)) {
            emails.add(lower);
          }
        }
      }
    } catch {}
  }
  return [...emails];
}

async function scrapeEmailsFromDomain(domain) {
  const emails = new Set();
  const urls = [
    `https://${domain}`,
    `https://${domain}/contact`,
    `https://${domain}/about`,
    `https://${domain}/team`,
    `https://${domain}/about-us`,
    `https://${domain}/contact-us`,
    `https://www.${domain}`,
    `https://www.${domain}/contact`,
  ];
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        redirect: 'follow',
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const html = await res.text();
      const found = html.match(emailRegex) || [];
      for (const e of found) {
        const lower = e.toLowerCase();
        if (lower.endsWith(`@${domain.toLowerCase()}`) || lower.endsWith(`@www.${domain.toLowerCase()}`)) {
          // Filter out generic/role-based emails
          const local = lower.split('@')[0];
          if (!['info', 'contact', 'admin', 'support', 'sales', 'hello', 'help', 'team', 'office', 'hr', 'careers', 'jobs', 'press', 'media', 'marketing', 'noreply', 'no-reply', 'webmaster', 'postmaster', 'abuse', 'privacy', 'legal', 'compliance'].includes(local)) {
            emails.add(lower);
          }
        }
      }
    } catch {}
  }
  
  return [...emails];
}

// ══════════════════════════════════════════════
// STEP 3: GENERATE CANDIDATE EMAILS
// ══════════════════════════════════════════════
function generateCandidates(firstName, lastName, domain, detectedPattern) {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l) return [];
  
  const candidates = [];
  
  // Generate from detected pattern first (highest priority)
  const detected = PATTERNS.find(p => p.id === detectedPattern);
  if (detected) {
    candidates.push({ email: `${detected.fn(f, l)}@${domain}`, pattern: detected.id, priority: 1 });
  }
  
  // Generate from all other patterns
  for (const p of PATTERNS) {
    if (p.id === detectedPattern) continue;
    candidates.push({ email: `${p.fn(f, l)}@${domain}`, pattern: p.id, priority: 2 });
  }
  
  return candidates;
}

// ══════════════════════════════════════════════
// STEP 4: SMTP VERIFICATION
// ══════════════════════════════════════════════
async function getMxHost(domain) {
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) return null;
    // Sort by priority (lowest = highest priority)
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

function smtpCheck(mxHost, email, fromEmail = 'verify@vanhawke.com') {
  return new Promise((resolve) => {
    const timeout = 8000;
    let resolved = false;
    let response = '';
    let stage = 0; // 0=connect, 1=ehlo, 2=mail_from, 3=rcpt_to
    
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    
    socket.on('timeout', () => finish({ valid: false, reason: 'timeout' }));
    socket.on('error', (err) => finish({ valid: false, reason: err.message }));
    socket.on('close', () => finish({ valid: false, reason: 'connection_closed' }));
    
    socket.on('data', (data) => {
      response = data.toString();
      const code = parseInt(response.substring(0, 3));
      
      if (stage === 0) {
        // Connected — server banner received
        if (code === 220) {
          stage = 1;
          socket.write(`EHLO mail.vanhawke.com\r\n`);
        } else {
          finish({ valid: false, reason: `banner_${code}` });
        }
      } else if (stage === 1) {
        // EHLO response
        if (code === 250) {
          stage = 2;
          socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
        } else {
          finish({ valid: false, reason: `ehlo_${code}` });
        }
      } else if (stage === 2) {
        // MAIL FROM response
        if (code === 250) {
          stage = 3;
          socket.write(`RCPT TO:<${email}>\r\n`);
        } else {
          finish({ valid: false, reason: `mailfrom_${code}` });
        }
      } else if (stage === 3) {
        // RCPT TO response — this is the key check
        socket.write('QUIT\r\n');
        if (code === 250 || code === 251) {
          finish({ valid: true, code, reason: 'accepted' });
        } else if (code === 550 || code === 551 || code === 553 || code === 554) {
          finish({ valid: false, code, reason: 'mailbox_not_found' });
        } else if (code === 450 || code === 451 || code === 452) {
          // Greylisted or temporary failure — treat as "risky" not invalid
          finish({ valid: 'risky', code, reason: 'greylisted' });
        } else {
          finish({ valid: false, code, reason: `rcpt_${code}` });
        }
      }
    });
    
    socket.connect(25, mxHost);
  });
}

// Detect catch-all domains — send a random fake email
async function isCatchAll(mxHost, domain) {
  const fakeEmail = `kiko_test_${Math.random().toString(36).slice(2, 10)}_${Date.now()}@${domain}`;
  const result = await smtpCheck(mxHost, fakeEmail);
  return result.valid === true; // If fake email is accepted, domain is catch-all
}

// ══════════════════════════════════════════════
// STEP 5: LINKEDIN URL FINDER
// ══════════════════════════════════════════════
async function findLinkedInUrl(firstName, lastName, company) {
  // Use Google search to find the LinkedIn profile
  const query = encodeURIComponent(`"${firstName} ${lastName}" "${company}" site:linkedin.com/in`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://www.google.com/search?q=${query}&num=3`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    clearTimeout(timeout);
    const html = await res.text();
    
    // Extract LinkedIn URLs from search results
    const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/g;
    const matches = html.match(linkedinRegex) || [];
    
    if (matches.length > 0) {
      // Return the first match, cleaned up
      let url = matches[0].replace('http://', 'https://');
      if (!url.startsWith('https://www.')) url = url.replace('https://linkedin.com', 'https://www.linkedin.com');
      return url;
    }
  } catch {}
  
  // Fallback: construct a best-guess URL
  const slug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z\-]/g, '');
  return `https://www.linkedin.com/in/${slug}`;
}

// ══════════════════════════════════════════════
// ORCHESTRATOR — Full email intelligence pipeline
// ══════════════════════════════════════════════
export async function findEmail({ firstName, lastName, company, domain }) {
  const startTime = Date.now();
  const log = [];
  
  if (!firstName || !lastName || !domain) {
    return { ok: false, error: 'firstName, lastName, and domain required' };
  }
  
  const domainClean = domain.toLowerCase().replace(/^www\./, '');
  
  try {
    // Step 1: Check pattern cache
    let pattern = patternCache.get(domainClean);
    
    if (!pattern) {
      // Step 2: Scrape domain for existing emails — FREE METHODS ONLY
      // Do NOT burn paid API credits for pattern detection
      log.push('Scraping domain for existing emails (free methods only)...');
      const [websiteEmails, googleEmails] = await Promise.all([
        scrapeEmailsFromDomain(domainClean),
        searchGoogleForEmails(domainClean),
      ]);
      const foundEmails = [...new Set([...websiteEmails, ...googleEmails])];
      log.push(`Found ${websiteEmails.length} website + ${googleEmails.length} Google = ${foundEmails.length} unique`);
      
      // Step 3: Detect pattern from found emails
      pattern = detectPattern(foundEmails, domainClean);
      log.push(`Detected pattern: ${pattern.pattern} (confidence: ${pattern.confidence})`);
      
      // Cache it
      patternCache.set(domainClean, pattern);
    }
    
    // Step 4: Generate candidate emails
    const candidates = generateCandidates(firstName, lastName, domainClean, pattern.pattern);
    log.push(`Generated ${candidates.length} candidate emails`);
    
    // Step 5: Get MX host
    const mxHost = await getMxHost(domainClean);
    if (!mxHost) {
      const bestGuess = candidates[0];
      return {
        ok: true,
        email: bestGuess?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domainClean}`,
        verified: false, confidence: 0.3, pattern: pattern.pattern,
        reason: 'no_mx_record', duration_ms: Date.now() - startTime, log,
      };
    }
    log.push(`MX host: ${mxHost}`);

    // Step 5.5: Check gateway cache — skip SMTP for domains that block it
    if (gatewayCache.has(domainClean)) {
      const bestGuess = candidates[0];
      log.push(`⚡ Gateway cached — skipping SMTP, using pattern directly`);
      return {
        ok: true, email: bestGuess.email,
        verified: false, confidence: Math.min(0.75, pattern.confidence),
        pattern: bestGuess.pattern, reason: 'gateway_cached',
        gateway: true, duration_ms: Date.now() - startTime, log,
      };
    }
    
    // Step 6: Check if catch-all domain
    const catchAll = await isCatchAll(mxHost, domainClean);
    log.push(`Catch-all: ${catchAll}`);
    
    if (catchAll) {
      // Can't verify individual mailboxes — return best guess
      const bestGuess = candidates[0];
      return {
        ok: true,
        email: bestGuess?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domainClean}`,
        verified: false,
        confidence: Math.min(0.7, pattern.confidence),
        pattern: pattern.pattern,
        reason: 'catch_all_domain',
        catch_all: true,
        duration_ms: Date.now() - startTime,
        log,
      };
    }
    
    // Step 7: SMTP verify candidates — with gateway detection
    let timeoutCount = 0;
    const maxTimeouts = 2; // If first 2 timeout, server has a gateway — skip rest
    const topCandidates = candidates.slice(0, 5); // Only check top 5 patterns
    
    for (const candidate of topCandidates) {
      log.push(`Checking: ${candidate.email}`);
      const result = await smtpCheck(mxHost, candidate.email);
      
      if (result.valid === true) {
        log.push(`✓ VERIFIED: ${candidate.email}`);
        return {
          ok: true,
          email: candidate.email,
          verified: true,
          confidence: 0.95,
          pattern: candidate.pattern,
          reason: 'smtp_verified',
          duration_ms: Date.now() - startTime,
          log,
        };
      } else if (result.valid === 'risky') {
        log.push(`⚠ Risky: ${candidate.email}`);
        return {
          ok: true,
          email: candidate.email,
          verified: false,
          confidence: 0.6,
          pattern: candidate.pattern,
          reason: 'greylisted',
          duration_ms: Date.now() - startTime,
          log,
        };
      }
      
      if (result.reason === 'timeout') timeoutCount++;
      log.push(`✗ ${candidate.email}: ${result.reason}`);
      
      // Gateway detection: if first 2 checks timeout, this server blocks RCPT TO
      if (timeoutCount >= maxTimeouts) {
        log.push('⚠ Gateway detected (SMTP blocked) — using pattern-based guess');
        gatewayCache.add(domainClean); // Cache so subsequent contacts skip SMTP
        const bestGuess = candidates[0];
        return {
          ok: true,
          email: bestGuess.email,
          verified: false,
          confidence: Math.min(0.65, pattern.confidence + 0.2),
          pattern: bestGuess.pattern,
          reason: 'gateway_detected',
          gateway: true,
          duration_ms: Date.now() - startTime,
          log,
        };
      }
    }
    
    // SMTP failed — Step 8: Google search for THIS PERSON's email specifically (free)
    log.push('Searching Google for person-specific email...');
    try {
      const personQueries = [
        `"${firstName} ${lastName}" "${domainClean}" email`,
        `"${firstName}.${lastName}@${domainClean}"`,
        `"${firstName[0]}.${lastName}@${domainClean}"`,
        `"${firstName} ${lastName}" email ${company || domainClean}`,
      ];
      for (const q of personQueries) {
        const personEmails = await searchGoogleForEmails(domainClean, q);
        const match = personEmails.find(e => {
          const local = e.split('@')[0].toLowerCase();
          const f = firstName.toLowerCase(), l = lastName.toLowerCase();
          return local.includes(f) || local.includes(l) || local.includes(f[0] + '.' + l) || local.includes(f + '.' + l);
        });
        if (match) {
          log.push(`✓ Google person search: ${match}`);
          return {
            ok: true, email: match, verified: false,
            confidence: 0.75, pattern: 'google_found',
            reason: 'google_person_search',
            duration_ms: Date.now() - startTime, log,
          };
        }
      }
      log.push('Google person search: no match');
    } catch { log.push('Google person search: failed'); }

    // Step 9: APOLLO.IO — 270M contacts, 75 credits/month. Use ONLY after free methods exhausted.
    log.push('Free methods exhausted. Trying Apollo.io (75 credits/month)...');
    const apolloResult = await apolloFindEmail(firstName, lastName, domainClean, company);
    if (apolloResult && apolloResult.email) {
      log.push(`✓ Apollo.io: ${apolloResult.email} (${apolloResult.verified ? 'verified' : 'unverified'})`);
      const apolloPattern = detectPattern([apolloResult.email], domainClean);
      patternCache.set(domainClean, apolloPattern);
      return {
        ok: true, email: apolloResult.email,
        verified: apolloResult.verified, confidence: apolloResult.confidence,
        pattern: apolloPattern.pattern, reason: 'apollo_io',
        linkedin_url: apolloResult.linkedin, title: apolloResult.title,
        duration_ms: Date.now() - startTime, log,
      };
    }
    log.push('Apollo: no match');

    // Step 10: PAID API fallback — ONLY when all free methods AND Apollo exhausted
    // These have limited credits. Use sparingly.
    log.push('Trying paid API cascade (limited credits)...');
    
    // Try Hunter.io
    const hunterResult = await hunterFindEmail(firstName, lastName, domainClean);
    if (hunterResult && hunterResult.email) {
      log.push('✓ Hunter.io: ' + hunterResult.email);
      const detectedFromHunter = detectPattern([hunterResult.email], domainClean);
      patternCache.set(domainClean, detectedFromHunter);
      return {
        ok: true, email: hunterResult.email, verified: hunterResult.verified || false,
        confidence: hunterResult.confidence, pattern: detectedFromHunter.pattern,
        reason: 'hunter_fallback', linkedin_url: hunterResult.linkedin || null,
        position: hunterResult.position || null, duration_ms: Date.now() - startTime, log,
      };
    }
    
    // Try Snov.io
    const snovResult = await snovFindEmail(firstName, lastName, domainClean);
    if (snovResult && snovResult.email) {
      log.push('✓ Snov.io: ' + snovResult.email);
      return {
        ok: true, email: snovResult.email, verified: snovResult.verified,
        confidence: snovResult.confidence, pattern: pattern.pattern,
        reason: 'snov_fallback', duration_ms: Date.now() - startTime, log,
      };
    }
    
    // Try Voila Norbert (50 free/month)
    log.push('Trying Norbert...');
    const norbertResult = await norbertFindEmail(firstName, lastName, domainClean);
    if (norbertResult && norbertResult.email) {
      log.push('✓ Norbert: ' + norbertResult.email);
      return { ok: true, email: norbertResult.email, verified: norbertResult.verified, confidence: norbertResult.confidence, pattern: detectPattern([norbertResult.email], domainClean).pattern, reason: 'norbert_api', duration_ms: Date.now() - startTime, log };
    }
    
    // Try Skrapp.io (100 free/month)
    log.push('Trying Skrapp...');
    const skrappResult = await skrappFindEmail(firstName, lastName, domainClean);
    if (skrappResult && skrappResult.email) {
      log.push('✓ Skrapp: ' + skrappResult.email);
      return { ok: true, email: skrappResult.email, verified: skrappResult.verified, confidence: skrappResult.confidence, pattern: detectPattern([skrappResult.email], domainClean).pattern, reason: 'skrapp_api', duration_ms: Date.now() - startTime, log };
    }
    
    // Try Prospeo (75 free/month)
    log.push('Trying Prospeo...');
    const prospeoResult = await prospeoFindEmail(firstName, lastName, domainClean);
    if (prospeoResult && prospeoResult.email) {
      log.push('✓ Prospeo: ' + prospeoResult.email);
      return { ok: true, email: prospeoResult.email, verified: prospeoResult.verified, confidence: prospeoResult.confidence, pattern: detectPattern([prospeoResult.email], domainClean).pattern, reason: 'prospeo_api', duration_ms: Date.now() - startTime, log };
    }
    
    // Try Clearout to verify best guess
    const bestGuess = candidates[0];
    if (bestGuess) {
      const clearResult = await clearoutVerifyEmail(bestGuess.email);
      if (clearResult && clearResult.valid) {
        log.push('✓ Clearout verified: ' + bestGuess.email);
        return {
          ok: true, email: bestGuess.email, verified: true,
          confidence: 0.9, pattern: bestGuess.pattern,
          reason: 'clearout_verified', duration_ms: Date.now() - startTime, log,
        };
      }
    }
    
    log.push('All sources exhausted — returning best pattern guess');
    return {
      ok: true,
      email: bestGuess?.email,
      verified: false,
      confidence: pattern.confidence * 0.5,
      pattern: pattern.pattern,
      reason: 'pattern_guess',
      duration_ms: Date.now() - startTime,
      log,
    };
    
  } catch (err) {
    return { ok: false, error: err.message, duration_ms: Date.now() - startTime, log };
  }
}

// Full prospect enrichment — email + LinkedIn
export async function enrichProspect({ firstName, lastName, company, domain }) {
  const [emailResult, linkedInUrl] = await Promise.all([
    findEmail({ firstName, lastName, company, domain }),
    findLinkedInUrl(firstName, lastName, company),
  ]);
  
  return {
    ...emailResult,
    linkedin_url: linkedInUrl,
    company,
    domain,
  };
}

// Verify a single known email
export async function verifyEmail(email) {
  const [local, domain] = email.split('@');
  if (!domain) return { valid: false, reason: 'invalid_format' };
  
  const mxHost = await getMxHost(domain);
  if (!mxHost) return { valid: false, reason: 'no_mx_record' };
  
  const catchAll = await isCatchAll(mxHost, domain);
  if (catchAll) return { valid: 'risky', reason: 'catch_all_domain' };
  
  return await smtpCheck(mxHost, email);
}


// Export Apollo search for use by build-campaign
export { apolloSearchPeople, apolloFindEmail };
