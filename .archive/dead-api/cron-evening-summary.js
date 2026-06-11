// api/cron-evening-summary.js — End-of-day wrap-up via Kiko (Opus 4.8)
// Runs at 6pm weekdays. Reviews what happened today, what's pending, what needs attention tomorrow.
import { cronHeartbeat } from './kiko-tools.js';

export default async function handler(req, res) {
  const hbId = await cronHeartbeat('cron-evening-summary', 'started');
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    // Use Haiku for evening summary — cheap summarisation, not strategic reasoning
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
    const { sbFetch: sb } = await import('./kiko-tools.js');
    const tasks = await sb('tasks?status=neq.completed&order=due_date&limit=10').catch(() => []);
    const alerts = await sb('kiko_alerts?dismissed=eq.false&order=created_at.desc&limit=10').catch(() => []);
    const taskSum = (tasks || []).map(t => t.title || '').join('; ');
    const alertSum = (alerts || []).map(a => (a.title || '') + ': ' + (a.detail || '').slice(0, 50)).join('; ');
    const summaryRes = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      messages: [{ role: 'user', content: `Evening summary for Van Hawke Group. Open tasks: ${taskSum || 'none'}. Active alerts: ${alertSum || 'none'}. Summarise: what needs attention tomorrow, top 3 priorities. Be concise — bullet points.` }]
    });
    const summary = summaryRes.content[0]?.text || 'No summary generated';
    await sb('kiko_knowledge', { method: 'POST', body: JSON.stringify({ domain: 'daily-summary', content: summary, source: 'evening-cron', researched_at: new Date().toISOString() })});
    console.log('[EveningSummary] Complete via Haiku (cost: ~$0.003)');
    // DEAD CODE BELOW — replaced by Haiku direct call above
    if (false) await fetch(`${baseUrl}/api/kiko`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `EVENING WRAP-UP — Review today and prepare for tomorrow:

1. What emails were sent today? Any replies received? Classify each reply.
2. What tasks were completed vs still open? Any overdue?
3. What pipeline deals moved today? Any that should have moved but didn't?
4. What's on the calendar tomorrow? Prepare meeting briefs for any meetings.
5. Any company news or partnership announcements detected today?
6. Top 3 priorities for tomorrow morning.

Store the summary in manage_knowledge with domain "daily-summary". Be concise — bullet points, not paragraphs.`,
        userEmail: 'sunny@vanhawke.agency',
        currentPage: 'command-centre',
        conversationHistory: [],
        nostream: true, system: true,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await kikoRes.json().catch(() => ({}));
    console.log('[EveningSummary] Complete:', (data.response || '').slice(0, 100));
    await cronHeartbeat('cron-evening-summary', 'finished', { heartbeatId: hbId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[EveningSummary] Failed:', err.message);
    await cronHeartbeat('cron-evening-summary', 'error', { heartbeatId: hbId, errorMessage: err.message });
    res.json({ ok: false, error: err.message });
  }
}
