// api/cron-task-executor.js — Due Task Auto-Execution
// Runs 8:30am Mon-Fri. Checks tasks due today or overdue.
// Auto-drafts follow-up emails for review, creates actionable alerts.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-task-executor', 'started');
  try {
    const now = new Date();
    const tasks = await sbFetch('tasks?select=id,data&order=updated_at.desc&limit=50');
    if (!tasks?.length) {
      await cronHeartbeat('cron-task-executor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No tasks', executed: 0 });
    }

    const dueTasks = tasks.filter(t => {
      if (t.data?.completed) return false;
      if (!t.data?.dueDate) return false;
      return new Date(t.data.dueDate) <= now;
    });

    if (!dueTasks.length) {
      await cronHeartbeat('cron-task-executor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No due tasks', executed: 0 });
    }

    let executed = 0;
    for (const task of dueTasks.slice(0, 5)) {
      const d = task.data;
      const company = d.company || d.contact || 'Unknown';
      const daysOverdue = Math.floor((now - new Date(d.dueDate)) / 86400000);

      // Fetch context for this task
      let context = '';
      try {
        const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=1`);
        if (deals?.[0]) context += `Deal: ${deals[0].data?.stage} ($${deals[0].data?.value || '?'})`;
        const rel = await sbFetch(`kiko_relationships?company=ilike.*${encodeURIComponent(company)}*&limit=1&select=warmth_score,last_contact`);
        if (rel?.[0]) context += ` | Warmth: ${rel[0].warmth_score}/10`;
      } catch {}

      // Generate suggested action
      const suggestion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 300,
        system: `You are Kiko drafting a follow-up action for Sunny (CEO, Van Hawke Group). Be direct, specific, under 150 words. If this is a follow-up email task, draft the email. If it's a call task, write 3 bullet points for the call. Format: SUBJECT: [subject]\nACTION: [email draft or call notes]`,
        messages: [{ role: 'user', content: `Task: ${d.type || 'Follow-up'} for ${company}${d.contact ? ` (${d.contact})` : ''}\nNotes: ${d.notes || 'none'}\nOverdue: ${daysOverdue} days\nContext: ${context}` }],
      });
      const draftText = suggestion.content[0]?.text || '';

      // Store as pending draft action
      await sbFetch('kiko_draft_actions', { method: 'POST', body: JSON.stringify({
        user_id: USER_ID, action_type: 'auto_followup',
        payload: { entity: company, task_id: task.id, task_type: d.type, days_overdue: daysOverdue, draft: draftText, context },
        status: 'pending',
      })});

      // Create high-priority alert
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'task_due', severity: daysOverdue > 3 ? 'high' : 'medium',
        title: `Due: ${d.type || 'Follow-up'} — ${company}`,
        detail: `${daysOverdue} days overdue. Draft ready:\n${draftText.slice(0, 300)}`,
        entity_type: 'task', entity_name: company,
        metadata: { task_id: task.id, draft: draftText },
        expires_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
      })});
      executed++;
    }

    await cronHeartbeat('cron-task-executor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: executed });
    return res.status(200).json({ ok: true, due_tasks: dueTasks.length, executed });
  } catch (err) {
    await logError('cron:task-executor', err.message);
    await cronHeartbeat('cron-task-executor', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
