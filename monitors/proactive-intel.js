// monitors/proactive-intel.js — Proactive Strategic Intelligence Engine
// Scans for market events, connects to CRM pipeline, generates actionable recommendations
// Runs 2x daily (8am, 2pm weekdays) — creates strategic alerts visible to all users
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

export async function runProactiveIntel() {
  console.log('[proactive-intel] Starting strategic scan...');
  try {
    // Step 1: Scan for actionable market events
    const scanResult = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `You are the strategic intelligence engine for Van Hawke Group — an F1 sponsorship advisory (primary client: Haas F1 Team) and luxury eyewear company (Van Hawke Maison).

Scan for HIGH-IMPACT market events from the last 48 hours across these areas:

FOR VAN HAWKE AGENCY (F1 SPONSORSHIP):
- New F1 sponsorship deals announced (any team)
- Companies LEAVING F1 sponsorship (potential clients for competitor teams)
- New Grand Prix locations confirmed (target brands from those countries)
- F1 team commercial restructuring or leadership changes
- Companies completing funding rounds ($50M+) that could afford F1 sponsorship
- Marketing/CMO hires at tech companies (signals sponsorship budget)
- CAA, WME, Octagon, CSM major wins or losses
- Competitor agency news (hiring, restructuring, client wins/losses)

FOR VAN HAWKE MAISON (LUXURY EYEWEAR):
- New luxury eyewear launches or collaborations
- EssilorLuxottica, Kering Eyewear, Safilo strategic moves
- Independent eyewear brands gaining traction (Gentle Monster, JMM, Mykita)
- Fashion x sport crossover collaborations
- Viral marketing campaigns in luxury/fashion
- DTC luxury brand strategies that are working

Respond ONLY in JSON format:
{
  "events": [
    {
      "headline": "Short factual headline",
      "detail": "What happened, specific numbers/names/dates",
      "relevance": "Why Van Hawke should care",
      "opportunity": "Specific actionable recommendation",
      "urgency": "high|medium|low",
      "division": "agency|maison|both",
      "lenses": ["Which expertise lenses apply: cfo, cco, legal, psychology, strategy, etc"]
    }
  ]
}

Return 3-6 events max. Only HIGH-IMPACT events that Van Hawke can act on. No filler.` }],
    });

    const text = scanResult.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    let events = [];
    try { events = JSON.parse(cleaned).events || []; } catch { console.error('[proactive-intel] Failed to parse events JSON'); return; }

    if (!events.length) { console.log('[proactive-intel] No actionable events found'); return; }

    // Step 2: Cross-reference with CRM pipeline
    const deals = await sbFetch('deals?select=id,data&limit=50');
    const dealCompanies = (deals || []).map(d => (d.data?.name || d.data?.company || '').toLowerCase()).filter(Boolean);

    // Step 3: Create strategic alerts
    let alertsCreated = 0;
    for (const event of events.slice(0, 5)) {
      // Check if this event relates to an existing deal
      const relatedDeal = dealCompanies.find(dc => event.detail?.toLowerCase().includes(dc));

      const now = new Date().toISOString();
      await sbFetch('kiko_alerts', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          type: 'proactive_intel',
          severity: event.urgency === 'high' ? 'high' : 'medium',
          title: `[${event.division?.toUpperCase() || 'INTEL'}] ${event.headline}`,
          detail: `${event.detail}\n\n💡 OPPORTUNITY: ${event.opportunity}\n\n🎯 LENSES: ${(event.lenses || []).join(', ')}${relatedDeal ? `\n\n⚡ RELATED TO EXISTING DEAL: ${relatedDeal}` : ''}`,
          entity_type: 'market_intel',
          entity_name: event.headline?.slice(0, 100),
          metadata: { division: event.division, urgency: event.urgency, lenses: event.lenses, related_deal: relatedDeal || null },
          user_id: null, // visible to all users
          dismissed: false,
          created_at: now,
          expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), // 3-day expiry
        }),
      });
      alertsCreated++;
    }

    // Step 4: Write synthesis to kiko_knowledge for persistent context
    const synthesis = events.map(e => `• [${e.urgency?.toUpperCase()}] ${e.headline}: ${e.opportunity}`).join('\n');
    await sbFetch('kiko_knowledge', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        domain: 'proactive-intel-latest',
        content: `## LATEST STRATEGIC INTELLIGENCE\n**Scanned:** ${new Date().toLocaleDateString('en-GB')}\n\n${synthesis}`,
        researched_at: new Date().toISOString(),
        source: 'proactive-intel',
      })
    });

    console.log(`[proactive-intel] Complete. ${events.length} events found, ${alertsCreated} alerts created.`);
  } catch (err) { console.error('[proactive-intel] Error:', err.message); }
}
