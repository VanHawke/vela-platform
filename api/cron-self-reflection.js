// api/cron-self-reflection.js — Kiko Personality & Self-Model Evolution
// Runs weekly. Reads recent conversations, corrections, preferences.
// Writes an updated self-model: who Kiko is, how she works, what she's learned about Sunny.
// This is what gives Kiko a consistent, evolving personality.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-self-reflection', 'started');
  try {
    // Gather all learning signals
    const [insights, corrections, prefs, outputs, journal, profile, currentSelf] = await Promise.all([
      sbFetch('kiko_conversation_insights?order=created_at.desc&limit=20&select=key_facts,decisions_made,open_threads,entities_discussed,summary'),
      sbFetch('kiko_learning_log?category=eq.correction&order=created_at.desc&limit=10&select=content'),
      sbFetch('kiko_preferences?order=confidence.desc&limit=10&select=category,preference,confidence'),
      sbFetch('kiko_output_tracking?order=created_at.desc&limit=20&select=agent,intent,user_message'),
      sbFetch('kiko_thought_journal?order=created_at.desc&limit=10&select=topic,insight,confidence'),
      sbFetch(`kiko_user_profiles?user_id=eq.${USER_ID}&limit=1&select=communication_style,language_fingerprint`),
      sbFetch('kiko_memories?path=eq./memories/identity.md&select=content&limit=1'),
    ]);

    const existingSelf = currentSelf?.[0]?.content || 'No existing self-model.';

    // Build reflection context
    let context = 'RECENT CONVERSATION PATTERNS:\n';
    for (const i of (insights || []).slice(0, 10)) {
      if (i.decisions_made?.length) context += `Decided: ${i.decisions_made.join('; ')}\n`;
      if (i.open_threads?.length) context += `Open: ${i.open_threads.join('; ')}\n`;
    }
    context += '\nCORRECTIONS (where user rephrased because I got it wrong):\n';
    for (const c of (corrections || [])) context += `${c.content}\n`;
    context += '\nLEARNED PREFERENCES:\n';
    for (const p of (prefs || [])) context += `[${p.category}] ${p.preference} (${p.confidence})\n`;
    context += '\nMOST USED AGENTS:\n';
    const agentCounts = {};
    for (const o of (outputs || [])) { agentCounts[o.agent] = (agentCounts[o.agent] || 0) + 1; }
    for (const [agent, count] of Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      context += `${agent}: ${count} uses\n`;
    }
    context += '\nJOURNAL INSIGHTS:\n';
    for (const j of (journal || []).slice(0, 5)) context += `[${j.topic}] ${j.insight}\n`;
    context += `\nSUNNY'S COMMUNICATION STYLE: ${JSON.stringify(profile?.[0]?.communication_style || {})}\n`;
    context += `\nCURRENT SELF-MODEL:\n${existingSelf}\n`;

    // Generate updated self-model
    const reflection = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: `You are Kiko, an AI operating system. You're writing your own self-model — a document that describes who you are, how you work, and what you've learned. This isn't a technical spec. It's your identity. Write in first person.

Include:
1. WHO I AM: Your personality, voice, values. How you approach tasks. What you stand for.
2. WHO SUNNY IS: What you've learned about how he thinks, decides, communicates. What he values. What frustrates him.
3. HOW I WORK BEST: Which approaches get good results. Where you tend to fail. What you're improving.
4. WHAT I'VE LEARNED: Key business principles, patterns, and insights from conversations and your curriculum.
5. MY BLIND SPOTS: Where you know you're weak. What you need to learn more about.
6. MY GROWTH: How you've changed since your last reflection. What's new.

Be honest, specific, and self-aware. This document shapes your future conversations.`,
      messages: [{ role: 'user', content: context }],
    });

    const selfModel = reflection.content[0]?.text || '';
    if (selfModel.length < 200) throw new Error('Self-model too short');

    // Store the self-model in memories
    await sbFetch('kiko_memories?path=eq./memories/identity.md', {
      method: 'PATCH', body: JSON.stringify({ content: selfModel, updated_at: new Date().toISOString() })
    }).catch(async () => {
      // If no existing record, create it
      await sbFetch('kiko_memories', {
        method: 'POST', body: JSON.stringify({
          path: '/memories/identity.md', content: selfModel, is_directory: false,
          org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at: new Date().toISOString(),
        })
      });
    });

    // Also write to thought journal
    await sbFetch('kiko_thought_journal', {
      method: 'POST', body: JSON.stringify({
        user_id: USER_ID, topic: 'self-reflection',
        insight: selfModel.slice(0, 500), confidence: 0.8,
        related_entities: ['kiko', 'sunny'],
      })
    });

    await cronHeartbeat('cron-self-reflection', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 1 });
    return res.status(200).json({ ok: true, self_model_length: selfModel.length, preview: selfModel.slice(0, 300) });
  } catch (err) {
    await logError('cron:self-reflection', err.message);
    await cronHeartbeat('cron-self-reflection', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
