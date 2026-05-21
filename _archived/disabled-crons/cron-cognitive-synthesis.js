// api/cron-cognitive-synthesis.js — Cross-domain signal synthesis
// Runs nightly at 11pm — looks across today's processed events and finds connections
// between news, replies, calendar, pipeline to surface non-obvious opportunities
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-cognitive-synthesis', 'started');

  try {
    // Load today's processed events
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const events = await sbFetch(`kiko_events?processed=eq.true&created_at=gte.${today.toISOString()}&select=event_type,entity_name,reasoning_output,payload&order=created_at.desc&limit=20`).catch(() => []);

    if (!events?.length || events.length < 2) {
      await cronHeartbeat('cron-cognitive-synthesis', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, message: 'Not enough events for synthesis' });
    }

    // Load active pipeline and upcoming calendar context
    const [pipeline, news, tasks] = await Promise.all([
      sbFetch('deals?select=id,data&order=updated_at.desc&limit=15').catch(() => []),
      sbFetch(`kiko_alerts?type=eq.sponsorship_news&dismissed=eq.false&created_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&select=title,entity_name,detail&limit=10`).catch(() => []),
      sbFetch(`tasks?data->>completed=is.null&select=data&order=updated_at.desc&limit=10`).catch(() => [])
    ]);

    // Build synthesis prompt
    const eventSummaries = events.map(e => `[${e.event_type}] ${e.entity_name}: ${e.reasoning_output?.brief || e.reasoning_output?.classification?.summary || JSON.stringify(e.payload).slice(0, 150)}`).join('\n');
    const pipelineSummary = (pipeline || []).map(d => { const dd = d.data || {}; return `${dd.company || dd.title || 'Unknown'} (${dd.stage || 'unknown'}, $${dd.value || 0})`; }).join(', ');
    const newsSummary = (news || []).map(n => `${n.title}: ${(n.detail || '').slice(0, 100)}`).join('\n');

    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
      system: 'You are a strategic intelligence synthesiser. Find connections between signals that humans would miss. Reference psychological frameworks when relevant. Respond ONLY in valid JSON.',
      messages: [{ role: 'user', content: `TODAY'S SIGNALS:\n${eventSummaries}\n\nACTIVE PIPELINE:\n${pipelineSummary}\n\nRECENT NEWS:\n${newsSummary}\n\nFind connections between these signals. Are any news items relevant to pipeline prospects? Do multiple signals point to the same opportunity? Are there timing convergences (calendar + prospect behaviour)?\n\nRespond with JSON: {"connections":[{"insight":"what you found","affected_entities":["entity1","entity2"],"recommended_action":"what to do","psychological_rationale":"why this works","urgency":"high|medium|low"}],"morning_brief_summary":"2-3 sentence executive summary of today's intelligence"}` }]
    });

    let synthesis = { connections: [], morning_brief_summary: '' };
    try { synthesis = JSON.parse(r.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}'); } catch { synthesis = { connections: [], morning_brief_summary: r.content?.[0]?.text?.slice(0, 300) || '' }; }

    // Create alerts for significant connections
    let created = 0;
    for (const conn of (synthesis.connections || []).filter(c => c.urgency === 'high' || c.urgency === 'medium')) {
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'cognitive_synthesis',
        title: `Signal convergence: ${(conn.affected_entities || []).join(' + ')}`,
        entity_name: (conn.affected_entities || [])[0] || 'Multiple',
        detail: `${conn.insight}\n\nRecommended: ${conn.recommended_action}\n\nPsychology: ${conn.psychological_rationale || ''}`,
        dismissed: false
      }) }).catch(() => {});
      created++;
    }

    // Store synthesis as an event itself
    await sbFetch('kiko_events', { method: 'POST', body: JSON.stringify({
      event_type: 'cognitive_synthesis',
      source: 'synthesis-engine',
      entity_name: 'Daily synthesis',
      payload: synthesis,
      processed: true,
      processed_at: new Date().toISOString(),
      reasoning_output: synthesis,
      actions_taken: [{ type: 'alerts_created', count: created }]
    }) }).catch(() => {});

    await cronHeartbeat('cron-cognitive-synthesis', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: created });
    return res.json({ ok: true, connections: synthesis.connections?.length || 0, alerts_created: created, brief: synthesis.morning_brief_summary });
  } catch (err) {
    console.error('[cognitive-synthesis] Error:', err.message);
    await cronHeartbeat('cron-cognitive-synthesis', 'error', { heartbeatId: __hbId, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
