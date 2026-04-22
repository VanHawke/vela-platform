// api/process-imports.js — Batch processor for imported conversations
// Processes unprocessed imported conversations in batches of 20.
// Call repeatedly until all are processed.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError } from './kiko-tools.js';

export const config = { maxDuration: 120 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

export default async function handler(req, res) {
  try {
    const unprocessed = await sbFetch('kiko_imported_conversations?processed=eq.false&order=original_date.asc&limit=20&select=id,source,title,messages');
    if (!unprocessed?.length) return res.status(200).json({ ok: true, message: 'All conversations processed', remaining: 0 });

    let processed = 0, highValue = 0;
    for (const convo of unprocessed) {
      try {
        const msgText = (convo.messages || []).slice(0, 20).map(m => `[${m.role}]: ${(m.content || '').slice(0, 300)}`).join('\n');
        const res2 = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 400,
          system: `Extract business intelligence from this conversation. CEO of F1 sponsorship advisory + luxury eyewear. Return ONLY JSON: { "key_facts": ["max 5"], "decisions": ["..."], "entities": ["..."], "topics": ["..."], "strategic_value": 1-10 }`,
          messages: [{ role: 'user', content: `Title: ${convo.title}\n\n${msgText}` }],
        });
        const insights = JSON.parse((res2.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

        if (insights.strategic_value >= 3) {
          highValue++;
          await sbFetch('kiko_conversation_insights', { method: 'POST', body: JSON.stringify({
            user_id: USER_ID, key_facts: insights.key_facts || [], decisions_made: insights.decisions || [],
            open_threads: [], entities_discussed: insights.entities || [],
            summary: `[${convo.source}] ${convo.title}: ${(insights.key_facts || []).join('; ').slice(0, 200)}`,
          })});
          for (const entity of (insights.entities || []).slice(0, 3)) {
            await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
              user_id: USER_ID, category: 'imported_knowledge',
              content: `From ${convo.source}: ${convo.title}. ${(insights.key_facts || []).slice(0, 2).join('; ')}`,
              entity_name: entity,
            })});
          }
        }
        await sbFetch(`kiko_imported_conversations?id=eq.${convo.id}`, { method: 'PATCH', body: JSON.stringify({
          processed: true, extracted_insights: insights,
          entities_mentioned: insights.entities || [], decisions_made: insights.decisions || [],
        })});
        processed++;
      } catch {} // Skip individual failures
    }

    // Check how many remain
    const remaining = await sbFetch('kiko_imported_conversations?processed=eq.false&select=id&limit=1');
    const moreRemaining = remaining?.length > 0;

    return res.status(200).json({
      ok: true, processed, high_value: highValue,
      has_more: moreRemaining,
      message: `Processed ${processed} conversations (${highValue} high-value).${moreRemaining ? ' More remaining — call again.' : ' All done.'}`,
    });
  } catch (err) {
    await logError('process-imports', err.message);
    return res.status(500).json({ error: err.message });
  }
}
