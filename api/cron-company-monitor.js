// api/cron-company-monitor.js — Daily company news & signal monitoring
// Scans pipeline companies for recent news, funding, leadership changes.
// Creates kiko_alerts when significant changes detected.
// Updates company_intelligence with fresh data.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 120 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-company-monitor', 'started');
  try {
    // Get all active pipeline companies
    const deals = await sbFetch('deals?select=id,data&or=(data->>status.eq.active,data->>status.eq.open,data->>status.is.null)&order=updated_at.desc&limit=100');
    const safe = Array.isArray(deals) ? deals : [];
    const companies = [...new Set(safe.map(d => d.data?.company).filter(Boolean))];
    
    if (!companies.length) {
      await cronHeartbeat('cron-company-monitor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, monitored: 0, alerts: 0 });
    }

    // Get existing intelligence to compare against
    const existingIntel = await sbFetch('company_intelligence?select=company_name,funding_total,revenue_estimate,employee_count,ceo,enriched_at&order=enriched_at.desc');
    const intelMap = {};
    (Array.isArray(existingIntel) ? existingIntel : []).forEach(e => { intelMap[e.company_name?.toLowerCase()] = e });

    // Pick companies to monitor — prioritise those not checked recently
    const now = Date.now();
    const toMonitor = companies
      .map(c => ({ name: c, lastChecked: intelMap[c.toLowerCase()]?.enriched_at ? new Date(intelMap[c.toLowerCase()].enriched_at).getTime() : 0 }))
      .sort((a, b) => a.lastChecked - b.lastChecked)
      .slice(0, 5); // 5 per run to stay within timeout

    let monitored = 0, alertsCreated = 0;

    for (const company of toMonitor) {
      try {
        const existing = intelMap[company.name.toLowerCase()];
        
        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Search for recent news about "${company.name}" from the last 30 days. Focus on: funding rounds, acquisitions, leadership changes, major partnerships, product launches, revenue milestones, layoffs, or any significant business developments.

Return ONLY valid JSON (no markdown, no backticks):
{
  "company": "${company.name}",
  "has_significant_news": true/false,
  "signals": [
    {"type": "funding|leadership|partnership|product|growth|risk|acquisition", "headline": "brief headline", "detail": "1-2 sentence detail", "significance": "high|medium|low", "date": "YYYY-MM-DD or null"}
  ],
  "updated_funding": "total funding if changed, or null",
  "updated_revenue": "revenue if changed, or null",
  "updated_employee_count": "employee count if changed, or null",
  "updated_ceo": "CEO name if changed, or null",
  "recommendation": "What should Van Hawke do with this information? 1 sentence."
}

If no significant recent news, return has_significant_news: false with empty signals array.` }],
        });

        const text = result.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}';
        let parsed;
        try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { continue; }

        monitored++;

        if (parsed.has_significant_news && parsed.signals?.length > 0) {
          // Create alerts for high/medium significance signals
          for (const signal of parsed.signals.filter(s => s.significance === 'high' || s.significance === 'medium')) {
            await sbFetch('kiko_alerts', {
              method: 'POST',
              body: JSON.stringify({
                type: 'company_signal',
                title: `${company.name}: ${signal.headline}`,
                detail: `${signal.detail}${parsed.recommendation ? '\n\nRecommendation: ' + parsed.recommendation : ''}`,
                entity_type: 'company',
                entity_name: company.name,
                severity: signal.significance === 'high' ? 'high' : 'medium',
                metadata: { signal_type: signal.type, date: signal.date, source: 'company_monitor' },
                created_at: new Date().toISOString(),
              })
            });
            alertsCreated++;
          }

          // Update company_intelligence if data changed
          const updates = {};
          if (parsed.updated_funding && parsed.updated_funding !== existing?.funding_total) updates.funding_total = parsed.updated_funding;
          if (parsed.updated_revenue && parsed.updated_revenue !== existing?.revenue_estimate) updates.revenue_estimate = parsed.updated_revenue;
          if (parsed.updated_employee_count) updates.employee_count = parsed.updated_employee_count;
          if (parsed.updated_ceo && parsed.updated_ceo !== existing?.ceo) updates.ceo = parsed.updated_ceo;

          if (Object.keys(updates).length > 0) {
            updates.enriched_at = new Date().toISOString();
            if (existing) {
              await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(company.name)}*`, {
                method: 'PATCH', body: JSON.stringify(updates)
              });
            }
          }
        }

        // Update enriched_at even if no news (so we don't re-check too soon)
        if (existing) {
          await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(company.name)}*`, {
            method: 'PATCH', body: JSON.stringify({ enriched_at: new Date().toISOString() })
          });
        }

      } catch (e) {
        console.error(`[CompanyMonitor] Error for ${company.name}:`, e.message);
      }
    }

    await cronHeartbeat('cron-company-monitor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: monitored });
    return res.json({ ok: true, monitored, alerts: alertsCreated, companies: toMonitor.map(c => c.name) });
  } catch (err) {
    console.error('[CompanyMonitor]', err);
    await cronHeartbeat('cron-company-monitor', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
