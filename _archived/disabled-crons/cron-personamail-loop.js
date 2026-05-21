// api/cron-personamail-loop.js — Self-improving draft system
// Analyses email corrections from the last 24 hours
// Extracts patterns and promotes them to permanent learned rules
// Runs nightly at midnight
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-personamail-loop', 'started');

  try {
    // Load recent corrections (last 48 hours to catch any missed)
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const corrections = await sbFetch(`kiko_email_corrections?created_at=gte.${since}&select=original,edited,diff_analysis,recipient,subject&order=created_at.desc&limit=20`).catch(() => []);

    if (!corrections?.length) {
      await cronHeartbeat('cron-personamail-loop', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, message: 'No recent corrections', rules_created: 0 });
    }

    // Load existing learned rules to avoid duplicates
    const existingRules = await sbFetch('kiko_learned_rules?active=eq.true&select=rule_text&limit=50').catch(() => []);
    const existingTexts = (existingRules || []).map(r => r.rule_text?.toLowerCase() || '');

    // Ask Claude to extract patterns from corrections
    const correctionSummaries = corrections.map((c, i) => 
      `Correction ${i + 1}:\n- Recipient: ${c.recipient || 'unknown'}\n- Subject: ${c.subject || 'unknown'}\n- Analysis: ${c.diff_analysis || 'No analysis'}\n- Original snippet: "${(c.original || '').slice(0, 200)}"\n- Edited snippet: "${(c.edited || '').slice(0, 200)}"`
    ).join('\n\n');

    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      system: 'You extract permanent writing rules from email corrections. Rules should be general (apply to future emails), not specific to one recipient. Respond ONLY in valid JSON.',
      messages: [{ role: 'user', content: `These are corrections a user made to AI-drafted emails:\n\n${correctionSummaries}\n\nExisting rules (do NOT duplicate): ${existingTexts.slice(0, 10).join('; ')}\n\nExtract GENERAL patterns as permanent rules. Examples: "Never include company background in reply drafts", "Use Hi not Dear for warm contacts", "Keep replies to 2 paragraphs max".\n\nRespond with JSON: {"rules":[{"rule_text":"the rule","category":"greeting|tone|length|content|formatting|forbidden_phrase","evidence_count":1,"weight":0.7}]}` }]
    });

    let parsed = { rules: [] };
    try { parsed = JSON.parse(r.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}'); } catch {}

    // Insert new rules that don't duplicate existing ones
    let created = 0;
    for (const rule of (parsed.rules || [])) {
      if (!rule.rule_text) continue;
      const isDuplicate = existingTexts.some(e => e.includes(rule.rule_text.toLowerCase().slice(0, 30)));
      if (isDuplicate) continue;
      
      await sbFetch('kiko_learned_rules', { method: 'POST', body: JSON.stringify({
        rule_text: rule.rule_text,
        category: rule.category || 'general',
        evidence_count: rule.evidence_count || 1,
        weight: rule.weight || 0.5,
        active: true
      }) }).catch(e => console.error('[personamail] Insert rule error:', e.message));
      created++;
    }

    await cronHeartbeat('cron-personamail-loop', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: created });
    console.log(`[personamail-loop] ✅ ${corrections.length} corrections analysed, ${created} new rules created`);
    return res.json({ ok: true, corrections_analysed: corrections.length, rules_created: created, rules: parsed.rules });
  } catch (err) {
    console.error('[personamail-loop] Error:', err.message);
    await cronHeartbeat('cron-personamail-loop', 'error', { heartbeatId: __hbId, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
