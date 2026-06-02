// api/cron-conversation-learning.js — Deep learning from past conversations
// Runs weekly. Analyses ALL conversations to extract behavioural patterns,
// communication preferences, recurring topics, and decision patterns.
// Stores synthesised intelligence in kiko_learned_rules for automatic loading.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export default async function handler(req, res) {
  const hbId = await cronHeartbeat('cron-conversation-learning', 'started');
  const start = Date.now();

  try {
    const userId = '9f486437-4bf5-4111-abfe-fe19bfa76063';
    
    // 1. Pull all conversation insights (not raw messages — too expensive)
    const insights = await sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&order=created_at.desc&limit=100&select=summary,key_facts,decisions_made,open_threads,entities_discussed`);
    
    if (!insights?.length) {
      await cronHeartbeat('cron-conversation-learning', 'finished', { heartbeatId: hbId });
      return res.json({ ok: true, message: 'No insights to learn from' });
    }

    // 2. Pull existing learned rules to avoid duplicates
    const existingRules = await sbFetch('kiko_learned_rules?select=rule_text&limit=50');
    const existingRuleTexts = (existingRules || []).map(r => r.rule_text).join('\n');

    // 3. Synthesise with Haiku (cheap but effective for pattern extraction)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
    
    const insightText = insights.map((ins, i) => 
      `[Conv ${i+1}] Summary: ${(ins.summary || '').slice(0, 200)} | Facts: ${(ins.key_facts || '').slice(0, 150)} | Decisions: ${(ins.decisions_made || '').slice(0, 150)}`
    ).join('\n');

    const synthesisRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `You are analysing 100 conversation summaries between a user (Sunny, CEO of Van Hawke Group, F1 sponsorship advisory) and his AI assistant (Kiko). Extract CROSS-CONVERSATION PATTERNS — things that repeat, preferences that emerge, communication styles that are consistent.

EXISTING RULES (do not duplicate these):
${existingRuleTexts.slice(0, 1000)}

CONVERSATION SUMMARIES:
${insightText.slice(0, 6000)}

Extract exactly these categories, return JSON only:
{
  "communication_patterns": ["how Sunny phrases requests, what tone he uses, when he gets frustrated"],
  "recurring_topics": ["what he asks about most, what matters to him"],
  "decision_patterns": ["how he makes decisions, what he values in recommendations"],
  "frustration_triggers": ["what makes him push back, what he corrects repeatedly"],
  "positive_signals": ["what he responds well to, what approaches work"],
  "implicit_preferences": ["things he never says explicitly but consistently demonstrates"]
}

Be specific and actionable. Each item should be a rule Kiko can follow.` }]
    });

    const synthesisText = synthesisRes.content[0]?.text || '{}';
    let patterns;
    try {
      patterns = JSON.parse(synthesisText.replace(/```json|```/g, '').trim());
    } catch {
      patterns = { error: 'Failed to parse synthesis' };
    }

    // 4. Store as learned rules
    let rulesCreated = 0;
    for (const [category, rules] of Object.entries(patterns)) {
      if (!Array.isArray(rules)) continue;
      for (const rule of rules.slice(0, 5)) { // Max 5 per category
        if (typeof rule !== 'string' || rule.length < 10) continue;
        // Check if similar rule already exists
        if (existingRuleTexts.toLowerCase().includes(rule.toLowerCase().slice(0, 30))) continue;
        
        await sbFetch('kiko_learned_rules', {
          method: 'POST',
          body: JSON.stringify({
            rule_text: rule,
            category: category,
            source: 'conversation_synthesis',
            evidence_count: 1,
            weight: 0.8,
            active: true,
          })
        });
        rulesCreated++;
      }
    }

    // 5. Also store a summary in knowledge base
    const summaryText = Object.entries(patterns)
      .filter(([k, v]) => Array.isArray(v))
      .map(([k, v]) => `${k}: ${v.join('; ')}`)
      .join('\n');

    await sbFetch('kiko_knowledge', {
      method: 'POST',
      body: JSON.stringify({
        domain: 'learned-behaviour-patterns',
        content: `CROSS-CONVERSATION PATTERNS (synthesised ${new Date().toISOString().slice(0,10)}):\n${summaryText}`,
        source: 'conversation-learning-cron',
        user_id: userId,
        researched_at: new Date().toISOString(),
      })
    });

    console.log(`[ConversationLearning] Created ${rulesCreated} new rules from ${insights.length} conversations`);
    await cronHeartbeat('cron-conversation-learning', 'finished', { heartbeatId: hbId, recordsProcessed: rulesCreated });
    res.json({ ok: true, insights_processed: insights.length, rules_created: rulesCreated, duration_ms: Date.now() - start });

  } catch (err) {
    console.error('[ConversationLearning] Failed:', err.message);
    await cronHeartbeat('cron-conversation-learning', 'error', { heartbeatId: hbId, errorMessage: err.message });
    res.json({ ok: false, error: err.message });
  }
}
