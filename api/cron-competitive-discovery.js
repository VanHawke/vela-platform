// api/cron-competitive-discovery.js — Kiko Self-Discovery Engine
// Kiko autonomously discovers NEW competitors, agencies, market entrants,
// and emerging threats that aren't in her existing knowledge base.
// Runs weekly (Sunday 4am UK). Writes discoveries to kiko_knowledge + kiko_alerts.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Discovery domains — each one asks Kiko to find entities she doesn't know about yet
const DISCOVERY_DOMAINS = [
  {
    id: 'agency_competitors',
    label: 'Sponsorship Agency Competitors',
    prompt: `You are a competitive intelligence analyst for Van Hawke Agency — a boutique F1/Formula E sponsorship advisory.

EXISTING KNOWN COMPETITORS (do NOT repeat these):
{KNOWN_ENTITIES}

Your job: Find NEW sports sponsorship agencies, consultancies, or advisory firms that Van Hawke should be watching. Focus on:
1. Agencies founded in the last 3 years that are gaining traction
2. Larger agencies making moves into F1/motorsport
3. Individual dealmakers who left big agencies to start their own shop
4. Companies pivoting from adjacent spaces (media, PE, brand consulting) into sponsorship advisory
5. Non-obvious competitors: in-house sponsorship teams at brands, tech platforms enabling direct sponsor-team deals

For each discovery, provide:
- Company/person name
- What they do and why they matter
- Size estimate (team, revenue if available)
- Key clients or wins
- Why Van Hawke should care
- Threat level: high/medium/low`,
  },
  {
    id: 'f1_commercial_shifts',
    label: 'F1 Commercial Landscape Shifts',
    prompt: `You are monitoring the F1 commercial landscape for strategic shifts that affect Van Hawke Agency.

WHAT KIKO ALREADY KNOWS:
{KNOWN_ENTITIES}

Find NEW developments Kiko doesn't know about:
1. Teams restructuring commercial departments (new hires, departures, strategy changes)
2. New sponsor categories entering F1 that weren't there 12 months ago
3. Sponsorship deals at risk — companies cutting marketing budgets, leadership changes at sponsors
4. Emerging F1 revenue streams (digital, gaming, experiential) that create new advisory opportunities
5. Regulatory or format changes (sprint races, new venues, cost cap shifts) that affect sponsorship value
6. Intermediaries, brokers, or platforms being used by teams to find sponsors — new market infrastructure

For each: name, what changed, why it matters for Van Hawke, urgency level.`,
  },
  {
    id: 'prospect_signals',
    label: 'Prospect Predictive Signals',
    prompt: `You are a predictive analyst identifying companies that are ABOUT TO enter sports sponsorship.

Companies Kiko already tracks: {KNOWN_ENTITIES}

Find NEW companies showing pre-sponsorship signals:
1. Companies that just raised $100M+ and are entering brand-building phase
2. B2B tech companies hiring CMOs, VPs of Brand, or Heads of Partnerships (signals budget allocation)
3. Companies whose competitors just signed F1/sports deals (competitive pressure to respond)
4. Companies expanding into European/Middle East markets where F1 has presence
5. PE-backed companies with new growth mandates that historically correlate with sponsorship spend
6. Companies with board members who have sports/entertainment backgrounds

For each: company name, signal type, estimated timeline to sponsorship decision, suggested approach.`,
  },
  {
    id: 'eyewear_disruptors',
    label: 'Luxury Eyewear Disruptors & Market Entrants',
    prompt: `You are tracking the luxury eyewear market for Van Hawke Maison — a new entrant positioning as "Cultural Performance Eyewear".

KNOWN BRANDS IN KIKO'S DATABASE:
{KNOWN_ENTITIES}

Discover NEW eyewear brands, collaborations, or market moves:
1. New indie eyewear brands launched in the last 18 months with $200+ price points
2. Fashion houses launching or relaunching eyewear lines (not through Luxottica)
3. Sport/performance eyewear brands moving upmarket into luxury
4. Celebrity or athlete eyewear collaborations announced or rumoured
5. DTC eyewear brands that crossed $10M revenue — what's their playbook?
6. Materials innovation (carbon fibre, titanium, bio-acetate) changing what's possible in frames
7. Retail strategy shifts — which brands are going experiential, pop-up, or digital-first?

For each: brand name, positioning, price point, distribution strategy, why Maison should care.`,
  },
  {
    id: 'agency_structures',
    label: 'Agency Business Models & Organisational Intelligence',
    prompt: `You are reverse-engineering the business structures of top sports sponsorship agencies to find strategic advantages for Van Hawke.

AGENCIES KIKO HAS STUDIED:
{KNOWN_ENTITIES}

Go DEEPER on business structures — find intelligence Kiko doesn't have:
1. Team structures: How many people work on a typical F1 account? What roles?
2. Revenue models: Retainer vs commission vs hybrid — what's the split? What are typical rates?
3. Pitch processes: How do top agencies pitch to teams AND to brands? What does their deck look like?
4. Client retention: Average client tenure, churn rates, why clients leave
5. Technology: What platforms/tools do agencies use? CRM, analytics, valuation tools
6. Recruitment: Where do they hire from? What backgrounds dominate?
7. Growth patterns: How did Octagon, CSM, Wasserman scale from small to big? What was the inflection point?

Be forensic. Numbers, names, org charts where available. Not generalities.`,
  },
];

// Get existing known entities from kiko_knowledge to avoid rediscovery
async function getKnownEntities(domain) {
  try {
    const entries = await sbFetch(`kiko_knowledge?domain=eq.${domain}&select=content&order=researched_at.desc&limit=20`);
    if (!entries?.length) return 'None yet — this is a first discovery run.';
    // Extract entity names from existing knowledge
    const content = entries.map(e => e.content || '').join('\n');
    // Pull out capitalised names and key terms
    const names = [...new Set(content.match(/(?:^|\n)##\s+(.+)/gm) || [])].map(n => n.replace(/^##\s+/, '').trim());
    return names.length > 0 ? names.join(', ') : content.slice(0, 1500);
  } catch { return 'None available'; }
}

// Run a single discovery domain
async function runDiscovery(domain) {
  const knownEntities = await getKnownEntities(domain.id.replace(/_/g, '-'));
  const prompt = domain.prompt.replace(/{KNOWN_ENTITIES}/g, knownEntities);

  const research = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = research.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (!text || text.length < 300) return { domain: domain.id, discoveries: 0 };

  // Write raw discovery to kiko_knowledge
  const kbDomain = `discovery-${domain.id.replace(/_/g, '-')}`;
  await sbFetch('kiko_knowledge', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      domain: kbDomain,
      content: `## SELF-DISCOVERY: ${domain.label}\n**Discovered:** ${new Date().toISOString().split('T')[0]}\n**Known at time of scan:** ${knownEntities.slice(0, 300)}\n\n${text.slice(0, 6000)}`,
      researched_at: new Date().toISOString(),
      source: 'self-discovery',
    }),
  });

  // Extract actionable discoveries via Haiku — structured for alerts
  const extract = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: `Extract the most important NEW discoveries from this intelligence report. Return ONLY valid JSON array. Each item: { "entity": "Name", "type": "competitor|prospect|disruptor|market_shift", "threat_level": "high|medium|low", "summary": "1 sentence", "action": "What Van Hawke should do about this" }. Maximum 5 items. Only include genuinely NEW intelligence.`,
    messages: [{ role: 'user', content: `Domain: ${domain.label}\n\n${text.slice(0, 3000)}` }],
  });

  let discoveries = [];
  try {
    discoveries = JSON.parse((extract.content[0]?.text || '[]').replace(/```json|```/g, '').trim());
    if (!Array.isArray(discoveries)) discoveries = [];
  } catch { discoveries = []; }

  // Write high-value discoveries as alerts
  for (const d of discoveries.slice(0, 3)) {
    if (d.threat_level === 'low') continue; // Only alert on medium/high
    try {
      await sbFetch('kiko_alerts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'self_discovery',
          severity: d.threat_level || 'medium',
          title: `🔍 Discovery: ${d.entity}`,
          detail: `${d.summary}${d.action ? '\n→ ' + d.action : ''}`,
          entity_name: d.entity,
          dismissed: false,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    } catch {}
  }

  console.log(`[discovery] ${domain.label}: ${text.length} chars, ${discoveries.length} entities discovered`);
  return { domain: domain.id, discoveries: discoveries.length, chars: text.length };
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-competitive-discovery', 'started');
  try {
    // Pick 2 domains per run (rotate through all 5 over ~2.5 weeks)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const startIdx = (dayOfYear % DISCOVERY_DOMAINS.length);
    const domainsToRun = [
      DISCOVERY_DOMAINS[startIdx],
      DISCOVERY_DOMAINS[(startIdx + 1) % DISCOVERY_DOMAINS.length],
    ];

    const results = [];
    for (const domain of domainsToRun) {
      // Time guard — don't exceed 100s total
      if (Date.now() - __hbStart > 100000) break;
      try {
        const result = await runDiscovery(domain);
        results.push(result);
      } catch (err) {
        console.error(`[discovery] ${domain.id} failed:`, err.message);
        results.push({ domain: domain.id, error: err.message });
      }
    }

    const totalDiscoveries = results.reduce((s, r) => s + (r.discoveries || 0), 0);
    await cronHeartbeat('cron-competitive-discovery', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: totalDiscoveries,
    });
    return res.status(200).json({ ok: true, domains: results.length, discoveries: totalDiscoveries, results });
  } catch (err) {
    console.error('[discovery] Engine error:', err.message);
    await cronHeartbeat('cron-competitive-discovery', 'error', {
      heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart,
    });
    return res.status(200).json({ ok: false, error: err.message });
  }
}
