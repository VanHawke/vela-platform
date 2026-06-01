// api/cron-evening-summary.js — End-of-day wrap-up via Kiko (Opus 4.8)
// Runs at 6pm weekdays. Reviews what happened today, what's pending, what needs attention tomorrow.
import { cronHeartbeat } from './kiko-tools.js';

export default async function handler(req, res) {
  const hbId = await cronHeartbeat('cron-evening-summary', 'started');
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    const kikoRes = await fetch(`${baseUrl}/api/kiko`, {
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
