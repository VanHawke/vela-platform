// api/cron-preference-synthesis.js — Memory Synthesis (Phase 12)
// Runs weekly. Reads kiko_learning_log, distils patterns via Sonnet,
// writes/updates kiko_preferences. STANDALONE — if fails, agents work as before.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers } from './cron-utils.js';

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  try {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('cron-preference-synthesis', 'started');
    const users = await getActiveUsers();
    const results = [];
    for (const user of users) {
    try {
    const userId = user.user_id;
    // Pull last 30 days of decisions for this user
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const entries = await sbFetch(`kiko_learning_log?category=eq.decision&user_id=eq.${userId}&created_at=gt.${since}&order=created_at.desc&limit=50&select=content,entity_name,created_at`);
    const safe = Array.isArray(entries) ? entries : [];

    if (safe.length < 3) {
      return res.status(200).json({ ok: true, message: `Only ${safe.length} decisions — need at least 3 for pattern detection`, preferences: 0 });
    }

    // Ask Sonnet to identify patterns
    const synthesis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You analyse decision logs and identify consistent patterns in how a CEO makes decisions. Return ONLY valid JSON array. Each item: { "category": "deal_selection|pricing|communication|timing|risk_tolerance|sector_preference", "preference": "Concise statement of the pattern, e.g. 'Kills deals after 60 days of silence'", "confidence": 0.5-0.95, "evidence_count": N }. Maximum 10 preferences. Only include patterns with 2+ supporting decisions. Be specific, not generic.`,
      messages: [{ role: 'user', content: `Analyse these ${safe.length} decisions from the last 30 days and identify Sunny's consistent patterns:\n\n${safe.map((e, i) => `[${i+1}] ${e.entity_name || '?'}: ${(e.content || '').slice(0, 200)}`).join('\n')}` }],
    });


    const rawText = synthesis.content[0]?.text || '[]';
    let preferences = [];
    try {
      preferences = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(200).json({ ok: true, message: 'Synthesis ran but parse failed', raw: rawText.slice(0, 200) });
    }

    if (!Array.isArray(preferences) || !preferences.length) {
      return res.status(200).json({ ok: true, message: 'No patterns identified', preferences: 0 });
    }

    // Clear old preferences for this user and write new ones
    await sbFetch(`kiko_preferences?user_id=eq.${userId}`, { method: 'DELETE' });

    let written = 0;
    for (const pref of preferences.slice(0, 10)) {
      try {
        await sbFetch('kiko_preferences', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            category: (pref.category || 'general').slice(0, 50),
            preference: (pref.preference || '').slice(0, 300),
            confidence: Math.min(Math.max(pref.confidence || 0.5, 0.1), 0.99),
            evidence_count: pref.evidence_count || 1,
            last_updated: new Date().toISOString(),
          })
        });
        written++;
      } catch {}
    }

    results.push({ user: user.email, ok: true, preferences: written });
    } catch (e) { results.push({ user: user.email, ok: false, error: e.message }); }
    } // end user loop
    await cronHeartbeat('cron-preference-synthesis', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: results.length });
    return res.status(200).json({ ok: true, users: results });
  } catch (err) {
    await cronHeartbeat('cron-preference-synthesis', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
