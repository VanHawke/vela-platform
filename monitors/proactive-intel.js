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
      model: 'claude-sonnet-4-6', max_tokens: 5000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `You are the strategic intelligence engine for Van Hawke Group — an F1 sponsorship advisory (primary client: Haas F1 Team) and luxury eyewear company (Van Hawke Maison — "Cultural Performance Eyewear").

Van Hawke is currently pre-revenue. Your job is to find intelligence that DIRECTLY helps generate revenue, build credibility, and outmanoeuvre competitors.

Scan for HIGH-IMPACT developments from the last 48 hours:

═══ VAN HAWKE AGENCY (F1 SPONSORSHIP ADVISORY) ═══
- New F1/motorsport sponsorship deals announced — who's spending, how much, which team
- Companies LEAVING F1 — potential clients who need a new home
- New Grand Prix locations confirmed — target brands from those countries/regions
- F1 team commercial restructuring, leadership changes, available inventory
- Companies completing funding rounds ($50M+) — sponsorship budget signals
- CMO/VP Marketing hires at tech companies — new marketing leadership = new budgets
- Competitor agencies (CAA, WME, Octagon, CSM, Wasserman, Excel Sports, AND any others you discover) — wins, losses, hires, restructuring
- Any agency or advisory firm you discover that competes in this space — identify them for future tracking
- Industry conferences, events, networking opportunities in the next 60 days

═══ VAN HAWKE MAISON (LUXURY EYEWEAR) ═══
- New luxury eyewear launches, collaborations, or brand moves
- EssilorLuxottica, Kering Eyewear, Safilo strategic decisions
- Independent eyewear brands gaining traction — who's emerging, what's working
- Fashion x sport crossover collaborations — who's doing this well
- Viral marketing campaigns in luxury/fashion — what worked and why
- Any eyewear or luxury brand you discover that's relevant — identify for tracking

═══ BUSINESS BUILDING INTELLIGENCE ═══
- Relevant startup or agency success stories — how they grew from zero
- Marketing techniques that work RIGHT NOW for pre-revenue businesses
- Any content, framework, or strategy that Van Hawke could directly apply TODAY

For each event, think through multiple lenses:
- CFO: What are the financial implications?
- CCO/CMO: How does this affect positioning and messaging?
- Psychologist: What's the behavioural driver behind this move?
- Strategist: How can Van Hawke exploit this?
- Legal/GC: Any regulatory or contractual considerations?

SELF-DISCOVERY RULE: If you find companies, agencies, or brands NOT on the list above that are relevant to Van Hawke — INCLUDE THEM. You are not limited to tracking only what's been named. Discover new threats and opportunities.

Respond ONLY in JSON:
{
  "events": [
    {
      "headline": "Short factual headline",
      "detail": "What happened — specific numbers, names, dates",
      "relevance": "Why Van Hawke should care",
      "opportunity": "Specific actionable recommendation — what to DO",
      "urgency": "high|medium|low",
      "division": "agency|maison|both",
      "lenses": ["cfo", "cco", "strategy", "psychology", "legal"],
      "new_entity_discovered": "Name of any new competitor/brand/agency discovered (null if none)"
    }
  ]
}

Return 4-8 events. Only HIGH-IMPACT intelligence Van Hawke can act on. No filler. Prioritise revenue-generating opportunities.` }],
    });

    const text = scanResult.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    // Extract JSON — handle markdown fences, truncation, partial responses
    let events = [];
    try {
      // Try to find the events array directly
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*"events"[\s\S]*\})/);
      if (jsonMatch) {
        let raw = (jsonMatch[1] || jsonMatch[0]).trim();
        // If JSON is truncated (common with max_tokens), try to fix it
        if (!raw.endsWith('}')) {
          // Find last complete event object
          const lastBrace = raw.lastIndexOf('}');
          if (lastBrace > 0) raw = raw.slice(0, lastBrace + 1) + ']}';
        }
        events = JSON.parse(raw).events || [];
      } else {
        console.log('[proactive-intel] No JSON found, text length:', text.length);
        return;
      }
    } catch (e) {
      // Fallback: try to extract individual events with a more lenient approach
      try {
        const eventsMatch = text.match(/"headline"\s*:\s*"([^"]+)"/g);
        if (eventsMatch && eventsMatch.length > 0) {
          // Create simple events from headlines found
          events = eventsMatch.slice(0, 5).map(m => ({
            headline: m.match(/"headline"\s*:\s*"([^"]+)"/)?.[1] || 'Market update',
            detail: 'See full scan for details',
            relevance: 'Strategic market movement',
            opportunity: 'Review and assess',
            urgency: 'medium',
            division: 'both',
            lenses: ['strategy']
          }));
          console.log(`[proactive-intel] Partial parse: extracted ${events.length} headlines from malformed JSON`);
        } else {
          console.error('[proactive-intel] JSON parse failed completely:', e.message);
          return;
        }
      } catch { return; }
    }

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
          user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', // Sunny — super_admin sees all
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

    // ═══ STEP 5: PREDICTIVE SYNTHESIS ═══
    // Go beyond "what happened" → predict "what's likely to happen next"
    try {
      // Pull stale deals and recent pipeline state for prediction context
      const staleDeals = await sbFetch('deals?select=data&limit=200');
      const safe = v => Array.isArray(v) ? v : [];
      const now = Date.now();
      const stale = safe(staleDeals).filter(d => {
        const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : null;
        return last && Math.floor((now - last) / 86400000) > 14;
      }).map(d => ({ company: d.data?.company, daysSince: Math.floor((now - new Date(d.data?.lastActivity)) / 86400000), stage: d.data?.stage }));

      // Pull recent discoveries for competitive context
      const discoveries = await sbFetch('kiko_knowledge?source=eq.self-discovery&select=content&order=researched_at.desc&limit=3');
      const discoveryContext = safe(discoveries).map(d => (d.content || '').slice(0, 400)).join('\n');

      // Pull upcoming races
      const races = await sbFetch(`race_calendar?date=gt.${new Date().toISOString().split('T')[0]}&order=date&limit=5&select=name,date,series`);
      const raceWindows = safe(races).map(r => ({
        name: r.name, series: r.series,
        daysTo: Math.ceil((new Date(r.date) - now) / 86400000),
      })).filter(r => r.daysTo <= 60);

      if (stale.length > 0 || events.length > 0 || raceWindows.length > 0) {
        const predPayload = JSON.stringify({
          staleDeals: stale.slice(0, 15),
          todaysEvents: events.slice(0, 5).map(e => ({ headline: e.headline, urgency: e.urgency, division: e.division })),
          raceWindows,
          competitiveIntel: discoveryContext.slice(0, 1000),
          pipelineSize: safe(staleDeals).length,
        });

        const predResp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 1200,
          system: `You are Kiko's predictive intelligence module. Based on pipeline data, market events, race calendar, and competitive intel, generate FORWARD-LOOKING PREDICTIONS about the next 7-30 days.

Types:
- DEAL VELOCITY: "Company X will go cold within 14 days based on engagement decline"
- CONVERSION WINDOW: "Company Y + race in 21 days = proposal window closing in ~7 days"  
- COMPETITIVE THREAT: "Competitor Z circling same prospects — act first"
- CATEGORY TIMING: "Sector Q2 budgets suggest outreach window opens in 2 weeks"
- CHURN RISK: "3 deals at Negotiation static 20+ days — will stall without intervention"

Return ONLY valid JSON array. Each: { "prediction": "What will happen", "confidence": "high|medium|low", "timeframe": "7d|14d|30d", "category": "deal_velocity|conversion_window|competitive_threat|category_timing|churn_risk", "entities": ["Company"], "preemptive_action": "What to do NOW" }. Max 4. Only predictions with analytical basis.`,
          messages: [{ role: 'user', content: predPayload }],
        });

        let preds = [];
        try {
          preds = JSON.parse((predResp.content[0]?.text || '[]').replace(/```json|```/g, '').trim());
          if (!Array.isArray(preds)) preds = [];
        } catch { preds = []; }

        let predCount = 0;
        for (const pred of preds.slice(0, 4)) {
          if (pred.confidence === 'low') continue;
          try {
            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                id: crypto.randomUUID(),
                type: 'prediction',
                severity: pred.confidence === 'high' ? 'high' : 'medium',
                title: `🔮 ${(pred.category || 'prediction').replace(/_/g, ' ')}: ${(pred.entities || []).join(', ') || 'Portfolio'}`,
                detail: `${pred.prediction}\n\nTimeframe: ${pred.timeframe || '14d'} | Confidence: ${pred.confidence}\n→ ${pred.preemptive_action || 'Review in Kiko'}`,
                entity_name: (pred.entities || [])[0] || 'Portfolio',
                metadata: { category: pred.category, confidence: pred.confidence, timeframe: pred.timeframe },
                user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
                dismissed: false,
                created_at: new Date().toISOString(),
                expires_at: new Date(now + (pred.timeframe === '7d' ? 7 : pred.timeframe === '30d' ? 30 : 14) * 86400000).toISOString(),
              }),
            });
            predCount++;
          } catch {}
        }
        console.log(`[proactive-intel] Predictive synthesis: ${predCount} predictions generated.`);
      }
    } catch (predErr) {
      console.error('[proactive-intel] Predictive synthesis error:', predErr.message);
    }

  } catch (err) { console.error('[proactive-intel] Error:', err.message); }
}
