// api/cron-email-template-learning.js — Email Template Extraction
// Runs weekly. Analyses emails that got replies vs silence.
// Extracts winning patterns into reusable templates.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-email-template-learning', 'started');
  try {
    // Get scored outreach emails with outcomes
    const scored = await sbFetch('outreach_scores?scored_at=not.is.null&select=subject,approach_category,outcome,word_count,recipient_name,company&order=scored_at.desc&limit=50');
    if (!scored?.length || scored.length < 5) {
      await cronHeartbeat('cron-email-template-learning', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'Not enough scored emails yet', templates: 0 });
    }

    const replied = scored.filter(e => e.outcome === 'replied');
    const silence = scored.filter(e => e.outcome === 'silence');

    if (replied.length < 2) {
      await cronHeartbeat('cron-email-template-learning', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'Need more replied emails for pattern analysis', templates: 0 });
    }

    // Ask Sonnet to analyse patterns and extract templates
    const analysis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: `Analyse outreach email performance for a CEO running an F1 sponsorship advisory. Compare emails that got replies vs those that got silence. Extract actionable patterns and reusable templates.

Return JSON: {
  "patterns": {
    "winning": ["pattern that correlates with replies"],
    "losing": ["pattern that correlates with silence"]
  },
  "templates": [
    {
      "name": "template name",
      "use_case": "when to use this",
      "subject_formula": "subject line pattern",
      "structure": "opening → body → close pattern",
      "example_subject": "concrete example"
    }
  ],
  "stats": {
    "reply_rate": "X%",
    "best_approach": "category with highest reply rate",
    "optimal_length": "X words"
  }
}`,
      messages: [{ role: 'user', content: `REPLIED (${replied.length}):\n${replied.map(e => `• "${e.subject}" to ${e.recipient_name} @ ${e.company} (${e.word_count} words, approach: ${e.approach_category})`).join('\n')}\n\nSILENCE (${silence.length}):\n${silence.map(e => `• "${e.subject}" to ${e.recipient_name} @ ${e.company} (${e.word_count} words, approach: ${e.approach_category})`).join('\n')}` }],
    });

    try {
      const parsed = JSON.parse((analysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

      // Store patterns in learning log
      if (parsed.patterns?.winning?.length) {
        await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
          user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', category: 'email_templates',
          content: `WINNING PATTERNS: ${parsed.patterns.winning.join('; ')}. LOSING: ${(parsed.patterns.losing || []).join('; ')}. Stats: ${JSON.stringify(parsed.stats || {})}`,
          entity_name: 'outreach_effectiveness',
        })});
      }

      // Store templates in memories for Kiko to reference when drafting
      if (parsed.templates?.length) {
        const templateContent = parsed.templates.map(t =>
          `## ${t.name}\n**Use when:** ${t.use_case}\n**Subject:** ${t.subject_formula}\n**Structure:** ${t.structure}\n**Example:** ${t.example_subject}`
        ).join('\n\n');

        await sbFetch('kiko_memories?path=eq./memories/email_templates.md', {
          method: 'PATCH', body: JSON.stringify({ content: `# Email Templates (auto-learned)\n\n${templateContent}\n\n## Stats\n${JSON.stringify(parsed.stats || {})}`, updated_at: new Date().toISOString() })
        }).catch(async () => {
          await sbFetch('kiko_memories', { method: 'POST', body: JSON.stringify({
            path: '/memories/email_templates.md', content: `# Email Templates\n\n${templateContent}`,
            is_directory: false, org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
          })});
        });
      }

      await cronHeartbeat('cron-email-template-learning', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: (parsed.templates || []).length });
      return res.status(200).json({ ok: true, templates: (parsed.templates || []).length, patterns: parsed.patterns });
    } catch (parseErr) {
      await cronHeartbeat('cron-email-template-learning', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'Analysis ran but parse failed', templates: 0 });
    }
  } catch (err) {
    await logError('cron:email-template-learning', err.message);
    await cronHeartbeat('cron-email-template-learning', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
