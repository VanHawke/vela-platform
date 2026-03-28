// api/cron-competitive-intel.js — Competitive Partnership Change Detector
// Runs weekly. Compares current F1 team partner pages against last snapshot.
// Detects: new partners, lost partners, category changes.
// Writes alerts for any changes found — these are immediate opportunities.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 120 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function fetchPartnerPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KikoOS/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  } catch { return null; }
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-competitive-intel', 'started');
  try {
    // Get all competitor partner page sources
    const sources = await sbFetch('kiko_knowledge_sources?category=eq.competitor&type=eq.url&active=eq.true&select=id,name,url,key_facts,summary');
    if (!sources?.length) {
      await cronHeartbeat('cron-competitive-intel', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No competitor sources', changes: 0 });
    }

    let changesDetected = 0;
    const results = [];

    for (const source of sources) {
      if (!source.url) continue;
      const currentText = await fetchPartnerPage(source.url);
      if (!currentText) { results.push({ name: source.name, status: 'fetch_failed' }); continue; }

      const previousFacts = source.key_facts || [];
      const previousSummary = source.summary || '';

      // Use Haiku to compare current page against stored snapshot
      const analysis = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        system: `You analyse F1 team partner pages for changes. Compare the current page content against the previous snapshot. Identify: NEW partners (not in previous), LOST partners (in previous but gone), CATEGORY CHANGES (partner moved tiers). Return ONLY JSON: { "changes_found": true/false, "new_partners": ["name"], "lost_partners": ["name"], "category_changes": ["description"], "current_partners": ["name1", "name2"], "summary": "1-sentence summary of current state" }. If no previous data exists, just list current partners.`,
        messages: [{ role: 'user', content: `Team: ${source.name}\n\nPREVIOUS SNAPSHOT:\n${previousSummary}\nPrevious partners: ${JSON.stringify(previousFacts)}\n\nCURRENT PAGE:\n${currentText}` }],
      });

      try {
        const parsed = JSON.parse((analysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

        // Update stored snapshot
        await sbFetch(`kiko_knowledge_sources?id=eq.${source.id}`, {
          method: 'PATCH', body: JSON.stringify({
            key_facts: parsed.current_partners || previousFacts,
            summary: parsed.summary || previousSummary,
            last_scraped_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          })
        });

        if (parsed.changes_found) {
          changesDetected++;
          const detail = [];
          if (parsed.new_partners?.length) detail.push(`NEW: ${parsed.new_partners.join(', ')}`);
          if (parsed.lost_partners?.length) detail.push(`LOST: ${parsed.lost_partners.join(', ')}`);
          if (parsed.category_changes?.length) detail.push(`CHANGES: ${parsed.category_changes.join('; ')}`);

          await sbFetch('kiko_alerts', {
            method: 'POST', body: JSON.stringify({
              type: 'competitive_change', severity: 'high',
              title: `Partnership change: ${source.name}`,
              detail: detail.join('\n'),
              entity_type: 'team', entity_name: source.name,
              metadata: parsed,
              expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
            })
          });
          results.push({ name: source.name, status: 'changes_detected', ...parsed });
        } else {
          results.push({ name: source.name, status: 'no_changes' });
        }
      } catch { results.push({ name: source.name, status: 'parse_error' }); }
    }

    await cronHeartbeat('cron-competitive-intel', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sources.length,
    });
    return res.status(200).json({ ok: true, teams_scanned: sources.length, changes_detected: changesDetected, results });
  } catch (err) {
    await logError('cron:competitive-intel', err.message);
    await cronHeartbeat('cron-competitive-intel', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
