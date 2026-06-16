// monitors/competitive-discovery.js — Kiko Self-Discovery Engine
// Autonomously discovers NEW competitors, agencies, market entrants, and
// emerging threats that aren't in the existing knowledge base.
// Runs weekly (Sunday 5am UK). Writes to kiko_knowledge + kiko_alerts.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Get existing known entities from kiko_knowledge to avoid rediscovery
async function getKnownEntities(domain) {
  try {
    const entries = await sbFetch(`kiko_knowledge?domain=eq.${domain}&select=content&order=researched_at.desc&limit=20`);
    if (!entries?.length) return 'None yet — first discovery run.';
    const content = entries.map(e => e.content || '').join('\n');
    const names = [...new Set(content.match(/(?:^|\n)##\s+(.+)/gm) || [])].map(n => n.replace(/^##\s+/, '').trim());
    return names.length > 0 ? names.join(', ') : content.slice(0, 1500);
  } catch { return 'None available'; }
}

const DISCOVERY_DOMAINS = [
  {
    id: 'agency-competitors',
    label: 'Sponsorship Agency Competitors',
    prompt: `You are a competitive intelligence analyst for Van Hawke Agency — a boutique F1/Formula E sponsorship advisory.

EXISTING KNOWN COMPETITORS (do NOT repeat these): {KNOWN}

Find NEW sports sponsorship agencies, consultancies, or advisory firms Van Hawke should watch:
1. Agencies founded in the last 3 years gaining traction
2. Larger agencies making moves into F1/motorsport
3. Dealmakers who left big agencies to start their own shop
4. Companies pivoting from adjacent spaces (media, PE, brand consulting) into sponsorship advisory
5. Non-obvious competitors: in-house sponsorship teams at brands, tech platforms enabling direct deals
6. Any agency or individual NOT on the known list who is active in F1/motorsport sponsorship

For each: name, what they do, size estimate, key clients/wins, why Van Hawke should care, threat level (high/medium/low).`,
  },
  {
    id: 'prospect-signals',
    label: 'Prospect Predictive Signals',
    prompt: `You are a predictive analyst identifying companies ABOUT TO enter sports sponsorship.

Companies Kiko already tracks: {KNOWN}

Find NEW companies showing pre-sponsorship signals:
1. Companies raising $100M+ entering brand-building phase
2. B2B tech companies hiring CMOs, VPs of Brand, Heads of Partnerships
3. Companies whose competitors just signed F1/sports deals (competitive pressure)
4. Companies expanding into European/Middle East markets where F1 has presence
5. PE-backed companies with new growth mandates correlating with sponsorship spend
6. Pre-IPO companies needing brand awareness investment

For each: company name, signal type, estimated timeline to sponsorship decision, suggested approach.`,
  },
  {
    id: 'eyewear-disruptors',
    label: 'Luxury Eyewear Disruptors',
    prompt: `You are tracking the luxury eyewear market for Van Hawke Maison — "Cultural Performance Eyewear".

KNOWN BRANDS: {KNOWN}

Discover NEW eyewear brands, collaborations, market moves:
1. New indie eyewear brands launched in last 18 months with $200+ price points
2. Fashion houses launching eyewear lines NOT through Luxottica
3. Sport/performance eyewear brands moving upmarket into luxury
4. Celebrity or athlete eyewear collaborations announced or rumoured
5. DTC eyewear brands crossing $10M revenue — what's their playbook?
6. Materials innovation (carbon fibre, titanium, bio-acetate) changing what's possible
7. Retail strategy shifts — experiential, pop-up, digital-first

For each: brand name, positioning, price point, distribution, why Maison should care.`,
  },
  {
    id: 'agency-structures',
    label: 'Agency Business Models & Org Intelligence',
    prompt: `You are reverse-engineering sports sponsorship agency business structures for Van Hawke.

AGENCIES ALREADY STUDIED: {KNOWN}

Go DEEPER — find intelligence not in existing knowledge:
1. Team structures: How many people on a typical F1 account? What roles?
2. Revenue models: Retainer vs commission vs hybrid — typical rates and splits?
3. Pitch processes: How do top agencies pitch to teams AND brands? Deck structure?
4. Client retention: Average tenure, churn rates, why clients leave
5. Technology: CRM, analytics, valuation tools agencies use
6. Growth patterns: How did Octagon, CSM, Wasserman scale? What was the inflection?
7. New business dev: How do they prospect and win clients?
8. Revenue per employee economics: What's the right team size for a motorsport practice?

Be forensic. Numbers, names, org charts where available. Not generalities.`,
  },
  {
    id: 'f1-commercial-shifts',
    label: 'F1 Commercial Landscape Shifts',
    prompt: `You are monitoring the F1 commercial landscape for strategic shifts affecting Van Hawke Agency.

WHAT'S ALREADY KNOWN: {KNOWN}

Find NEW developments:
1. Teams restructuring commercial departments (new hires, departures, strategy changes)
2. New sponsor categories entering F1 that weren't there 12 months ago
3. Sponsorship deals at risk — companies cutting budgets, leadership changes
4. Emerging revenue streams (digital, gaming, experiential) creating advisory opportunities
5. Regulatory or format changes affecting sponsorship value
6. Intermediaries, brokers, or platforms teams use to find sponsors — new market infrastructure
7. F1 expansion markets and the brands from those regions likely to enter

For each: name, what changed, why it matters for Van Hawke, urgency level.`,
  },
];

// Run a single discovery domain
async function discoverDomain(domain) {
  const known = await getKnownEntities(domain.id);
  const prompt = domain.prompt.replace(/{KNOWN}/g, known);

  const research = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = research.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (!text || text.length < 300) return { domain: domain.id, discoveries: 0 };

  // Write raw discovery to kiko_knowledge (persistent — Kiko reads this every conversation)
  await sbFetch('kiko_knowledge', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      domain: `discovery-${domain.id}`,
      content: `## SELF-DISCOVERY: ${domain.label}\n**Discovered:** ${new Date().toISOString().split('T')[0]}\n**Previously known:** ${known.slice(0, 300)}\n\n${text.slice(0, 6000)}`,
      researched_at: new Date().toISOString(),
      source: 'self-discovery',
    }),
  });

  // Extract structured discoveries via Haiku for alerts
  const extract = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1200, // Sonnet — competitive analysis
    system: `Extract the most important NEW discoveries. Return ONLY valid JSON array. Each item: { "entity": "Name", "type": "competitor|prospect|disruptor|market_shift|agency_intel", "threat_level": "high|medium|low", "summary": "1 sentence", "action": "What Van Hawke should do" }. Maximum 5 items. Only genuinely NEW intelligence.`,
    messages: [{ role: 'user', content: `Domain: ${domain.label}\n\n${text.slice(0, 3000)}` }],
  });

  let discoveries = [];
  try {
    discoveries = JSON.parse((extract.content[0]?.text || '[]').replace(/```json|```/g, '').trim());
    if (!Array.isArray(discoveries)) discoveries = [];
  } catch { discoveries = []; }

  // Write medium/high discoveries as alerts
  for (const d of discoveries.slice(0, 3)) {
    if (d.threat_level === 'low') continue;
    try {
      await sbFetch('kiko_alerts', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          type: 'self_discovery',
          severity: d.threat_level || 'medium',
          title: `🔍 Discovery: ${d.entity}`,
          detail: `${d.summary}${d.action ? '\n→ ' + d.action : ''}`,
          entity_name: d.entity,
          metadata: { discovery_domain: domain.id, entity_type: d.type },
          user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
          dismissed: false,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        }),
      });
    } catch {}
  }

  console.log(`[discovery] ${domain.label}: ${text.length} chars, ${discoveries.length} entities`);
  return { domain: domain.id, discoveries: discoveries.length, chars: text.length };
}

export async function runCompetitiveDiscovery() {
  console.log('[discovery] Starting self-discovery scan...');
  try {
    // Pick 2 domains per run (rotates through all 5 over ~2.5 weeks)
    const weekOfYear = Math.floor(Date.now() / (7 * 86400000));
    const startIdx = weekOfYear % DISCOVERY_DOMAINS.length;
    const domainsToRun = [
      DISCOVERY_DOMAINS[startIdx],
      DISCOVERY_DOMAINS[(startIdx + 1) % DISCOVERY_DOMAINS.length],
    ];

    const results = [];
    for (const domain of domainsToRun) {
      try {
        const result = await discoverDomain(domain);
        results.push(result);
      } catch (err) {
        console.error(`[discovery] ${domain.id} failed:`, err.message);
        results.push({ domain: domain.id, error: err.message });
      }
    }

    const total = results.reduce((s, r) => s + (r.discoveries || 0), 0);
    console.log(`[discovery] Complete. ${results.length} domains scanned, ${total} entities discovered.`);
  } catch (err) {
    console.error('[discovery] Engine error:', err.message);
  }
}
