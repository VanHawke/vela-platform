// api/cron-rule-promotion.js — Loop 3: insights → applied rules
// Weekly Sunday 3am. Reads recent insights + meta-learnings + corroborated context.
// Promotes patterns observed across 3+ days into kiko_learned_rules.
// These rules are injected into the system prompt as active directives.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-rule-promotion', 'started');
  try {
    // 1. Pull last 14 days of conversation insights
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const insights = await sbFetch(`kiko_conversation_insights?created_at=gte.${since}&select=user_id,key_facts,decisions_made,open_threads,entities_discussed,created_at&order=created_at.desc&limit=200`);
    const safeInsights = Array.isArray(insights) ? insights : [];

    // 2. Pull corroborated personal context (already promoted by cron-self-awareness)
    const context = await sbFetch(`kiko_personal_context?promoted=eq.true&select=user_id,key,value,corroboration_count,last_corroborated_at&order=last_corroborated_at.desc&limit=50`);
    const safeContext = Array.isArray(context) ? context : [];

    // 3. Pull active meta-learnings (pattern detections)
    const meta = await sbFetch(`kiko_meta_learning?active=eq.true&select=user_id,pattern_type,pattern_signature,occurrences,prior_verdict&order=last_seen.desc&limit=20`);
    const safeMeta = Array.isArray(meta) ? meta : [];

    if (!safeInsights.length && !safeContext.length && !safeMeta.length) {
      await cronHeartbeat('cron-rule-promotion', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, promoted: 0, message: 'no data to promote' });
    }

    // 4. Use Sonnet to extract candidate rules from the raw data
    const userId = safeInsights[0]?.user_id || safeContext[0]?.user_id || safeMeta[0]?.user_id;
    const summary = JSON.stringify({
      insights: safeInsights.slice(0, 50).map(i => ({
        facts: i.key_facts,
        decisions: i.decisions_made,
        date: i.created_at?.slice(0, 10)
      })),
      corroborated_user_facts: safeContext.map(c => ({ k: c.key, v: c.value, days: c.corroboration_count })),
      detected_loops: safeMeta.map(m => ({ pattern: m.pattern_signature, occurrences: m.occurrences, verdict: m.prior_verdict }))
    }).slice(0, 12000);

    let candidates = [];
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are Kiko's rule promoter. You extract APPLIED RULES from raw learning data — patterns Kiko should follow on every future request because they have been corroborated across multiple days.

A rule is valid only if:
1. It is observed across 3+ separate days (use corroboration_count or insight dates as proxy)
2. It is actionable (Kiko can DO something differently, not just KNOW something)
3. It is specific (not "be helpful" — instead "the user prefers responses under 200 words on weekday mornings")

Return ONLY a JSON array of objects: [{"rule_text": "...", "category": "preference|behaviour|sector|messaging|approach|refusal", "evidence": "1 sentence justifying why this is corroborated"}]
Maximum 8 rules. If nothing meets the bar, return [].
Do not include rules that already exist as meta-learning loops.`,
        messages: [{ role: 'user', content: `Extract applied rules from this 14-day learning data:\n\n${summary}` }]
      });
      const text = response.content[0]?.text?.trim() || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) candidates = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[RulePromotion] Sonnet extraction failed:', e.message);
    }

    // 5. Upsert into kiko_learned_rules (dedupe by rule_text)
    let promoted = 0, updated = 0;
    for (const c of candidates) {
      if (!c.rule_text || c.rule_text.length < 15) continue;
      const existing = await sbFetch(`kiko_learned_rules?rule_text=eq.${encodeURIComponent(c.rule_text)}&active=eq.true&limit=1`);
      if (existing?.length) {
        await sbFetch(`kiko_learned_rules?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            evidence_count: (existing[0].evidence_count || 1) + 1,
            last_observed: new Date().toISOString()
          })
        });
        updated++;
      } else {
        await sbFetch('kiko_learned_rules', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            rule_text: c.rule_text,
            category: c.category || 'behaviour',
            source: 'cron-rule-promotion',
            evidence_count: 1,
            metadata: { evidence: c.evidence || null }
          })
        });
        promoted++;
      }
    }

    await cronHeartbeat('cron-rule-promotion', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: promoted + updated });
    return res.status(200).json({ ok: true, promoted, updated, candidates_evaluated: candidates.length });
  } catch (err) {
    console.error('[RulePromotion] Fatal:', err.message);
    await cronHeartbeat('cron-rule-promotion', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
