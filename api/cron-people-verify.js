// api/cron-people-verify.js — People Verification Pipeline
// Runs weekly (Sun 5:30am). Checks contacts linked to active deals
// for role changes, departures, and stale data. Flags mismatches.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-people-verify', 'started');
  try {
    // Get contacts linked to open/active deals
    const deals = await sbFetch('deals?select=data&or=(data->>status.eq.active,data->>status.eq.open)&limit=50');
    const safe = Array.isArray(deals) ? deals : [];

    // Extract unique contact names + companies from deals
    const contactPairs = [];
    for (const d of safe) {
      const data = d.data || {};
      if (data.contactName && data.company) {
        contactPairs.push({ name: data.contactName, company: data.company, title: data.contactTitle || null });
      }
    }
    const unique = contactPairs.filter((c, i, arr) => arr.findIndex(x => x.name === c.name && x.company === c.company) === i).slice(0, 6);
    if (!unique.length) {
      await cronHeartbeat('cron-people-verify', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No contacts to verify', verified: 0 });
    }

    let verified = 0, flagged = 0;
    for (const contact of unique) {
      try {
        const verifyRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Verify this person's current role. Search for them and return ONLY valid JSON:

Person: ${contact.name}
Company: ${contact.company}
Last known title: ${contact.title || 'unknown'}

Return JSON:
{
  "name": "${contact.name}",
  "company": "${contact.company}",
  "current_title": "their current title or null if departed",
  "still_at_company": true/false,
  "new_company": "if departed, where they went (or null)",
  "new_title": "if departed, their new title (or null)",
  "confidence": "high/medium/low",
  "source": "where you found this info",
  "notes": "any relevant context"
}

Return ONLY the JSON object.` }]
        });

        const textBlocks = verifyRes.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        let result = {};
        try {
          const jsonMatch = textBlocks.replace(/```json\n?/g, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
          if (jsonMatch) result = JSON.parse(jsonMatch[0]);
        } catch { continue; }

        verified++;

        // If person departed or role changed significantly, create an alert
        if (result.still_at_company === false || (result.current_title && contact.title && result.current_title.toLowerCase() !== contact.title.toLowerCase())) {
          flagged++;
          const alertType = result.still_at_company === false ? 'DEPARTED' : 'ROLE_CHANGE';
          const detail = result.still_at_company === false
            ? `${contact.name} has LEFT ${contact.company}. ${result.new_company ? `Now at ${result.new_company}${result.new_title ? ' as ' + result.new_title : ''}.` : 'New position unknown.'} Update pipeline contact.`
            : `${contact.name} at ${contact.company}: role changed from "${contact.title}" to "${result.current_title}". Verify outreach approach still appropriate.`;

          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              org_id: ORG_ID,
              type: 'people_verification',
              entity: contact.company,
              severity: alertType === 'DEPARTED' ? 'high' : 'medium',
              title: `${alertType}: ${contact.name}`,
              detail,
              action: alertType === 'DEPARTED'
                ? `Find replacement contact at ${contact.company} and update deal record`
                : `Review outreach strategy for ${contact.name} given new role`,
              created_at: new Date().toISOString()
            })
          });

          // Save to learning log for long-term memory
          await sbFetch('kiko_learning_log', {
            method: 'POST',
            body: JSON.stringify({
              org_id: ORG_ID,
              category: 'people_movement',
              entity_name: contact.name,
              content: `${alertType}: ${contact.name} — ${detail} (Source: ${result.source || 'web search'}, Confidence: ${result.confidence || 'unknown'})`
            })
          });
        }
      } catch (err) {
        console.error(`[PeopleVerify] ❌ ${contact.name}:`, err.message);
      }
    }

    await cronHeartbeat('cron-people-verify', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: verified });
    return res.status(200).json({ ok: true, verified, flagged });
  } catch (err) {
    console.error('[PeopleVerify] Fatal:', err.message);
    await cronHeartbeat('cron-people-verify', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
