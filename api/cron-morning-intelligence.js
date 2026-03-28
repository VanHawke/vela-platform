// api/cron-morning-intelligence.js — Proactive Morning Intelligence Brief
// Runs 7:30am Mon-Fri. Synthesises ALL intelligence into one actionable brief.
// Writes to kiko_alerts as a HIGH priority morning brief.
// This is what makes Kiko push instead of wait.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 90 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-morning-intelligence', 'started');
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString();
    const today = now.toISOString().split('T')[0];

    // Gather ALL intelligence sources in parallel
    const [
      deals, staleDealData, tasks, triage, signals,
      recentInsights, draftActions, stageChanges,
      relationships, raceCalendar, knowledgeFresh
    ] = await Promise.all([
      sbFetch('deals?select=data&data->>status=eq.active&limit=200'),
      sbFetch(`deals?select=data,updated_at&data->>status=eq.active&updated_at=lt.${fourteenDaysAgo}&limit=20`),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
      sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=summary,priority_emails`),
      sbFetch(`news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gt.${sevenDaysAgo}&select=title,matched_companies,category&order=published_at.desc&limit=10`),
      sbFetch('kiko_conversation_insights?order=created_at.desc&limit=5&select=decisions_made,open_threads'),
      sbFetch('kiko_draft_actions?status=eq.pending&limit=5&select=action_type,payload'),
      sbFetch(`deal_stage_history?changed_at=gt.${sevenDaysAgo}&select=deal_id,from_stage,to_stage&order=changed_at.desc&limit=10`),
      sbFetch('kiko_relationships?order=warmth_score.desc&limit=10&select=contact_name,company,warmth_score,last_contact'),
      sbFetch('race_calendar?select=name,date,city&order=date.asc&limit=5'),
      sbFetch('kiko_knowledge_sources?last_scraped_at=is.null&active=eq.true&select=name&limit=5'),
    ]);

    // Build intelligence context
    let intel = '';

    // Pipeline summary
    const activeDeals = (deals || []);
    const totalValue = activeDeals.reduce((s, d) => s + (d.data?.value || 0), 0);
    const stages = {};
    for (const d of activeDeals) { const s = d.data?.stage || '?'; stages[s] = (stages[s] || 0) + 1; }
    intel += `PIPELINE: ${activeDeals.length} active deals, $${(totalValue/1000000).toFixed(1)}M total. Stages: ${JSON.stringify(stages)}\n`;

    // Stale deals (untouched 14+ days)
    const stale = (staleDealData || []);
    if (stale.length) {
      intel += `\nSTALE DEALS (${stale.length} untouched 14+ days):\n`;
      for (const d of stale.slice(0, 5)) {
        const days = Math.floor((now - new Date(d.updated_at)) / 86400000);
        intel += `• ${d.data?.company} — ${d.data?.stage} ($${d.data?.value || '?'}) — ${days} days stale\n`;
      }
    }

    // Overdue tasks
    const overdue = (tasks || []).filter(t => !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < now);
    if (overdue.length) {
      intel += `\nOVERDUE TASKS (${overdue.length}):\n`;
      for (const t of overdue.slice(0, 5)) intel += `• ${t.data?.company || '?'}: ${(t.data?.notes || t.data?.title || '').slice(0, 80)}\n`;
    }

    // Inbox
    if (triage?.[0]?.summary) {
      intel += `\nINBOX: ${triage[0].summary}\n`;
      const actions = (triage[0].priority_emails || []).filter(e => e.priority === 'ACTION_REQUIRED');
      for (const e of actions) intel += `• 🔴 ${e.from}: ${e.subject}\n`;
    }

    // Deal signals from news
    if (signals?.length) {
      intel += `\nDEAL SIGNALS (${signals.length} this week):\n`;
      for (const s of signals.slice(0, 5)) {
        intel += `• ${s.title}${s.matched_companies?.length ? ` — ${s.matched_companies.map(c => c.name || c).join(', ')}` : ''}\n`;
      }
    }

    // Recent stage changes
    if (stageChanges?.length) {
      intel += `\nPIPELINE MOVEMENT (last 7 days): ${stageChanges.length} stage changes\n`;
    }

    // Upcoming races (opportunity windows)
    const upcomingRaces = (raceCalendar || []).filter(r => new Date(r.date) > now && new Date(r.date) < new Date(now.getTime() + 30 * 86400000));
    if (upcomingRaces.length) {
      intel += `\nUPCOMING RACES (next 30 days):\n`;
      for (const r of upcomingRaces) intel += `• ${r.name} — ${r.date} (${r.city})\n`;
    }

    // Open threads from recent conversations
    const threads = (recentInsights || []).flatMap(i => i.open_threads || []).slice(0, 5);
    if (threads.length) intel += `\nOPEN THREADS: ${threads.join('; ')}\n`;

    // Pending draft actions
    if (draftActions?.length) {
      intel += `\nPENDING ACTIONS (${draftActions.length}):\n`;
      for (const d of draftActions) intel += `• ${d.payload?.suggested_action || d.action_type}\n`;
    }

    // Synthesise via Sonnet into actionable morning brief
    const synthesis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: `You are Kiko, writing Sunny's morning intelligence brief. Be DIRECT. Lead with what needs action TODAY. Structure:

1. 🔴 IMMEDIATE (things that need action in the next 4 hours)
2. ⚡ TODAY (should happen today but not urgent)
3. 📊 PIPELINE HEALTH (1-2 sentences on overall momentum)
4. 🎯 RECOMMENDED FOCUS (the ONE thing that would create the most value today)

Max 250 words. No pleasantries. No "good morning." Start with the most important thing.`,
      messages: [{ role: 'user', content: intel }],
    });
    const briefText = synthesis.content[0]?.text || 'Could not generate brief.';

    // Write as high-priority alert
    await sbFetch('kiko_alerts', {
      method: 'POST', body: JSON.stringify({
        type: 'morning_brief', severity: 'high',
        title: `Morning Intelligence Brief — ${today}`,
        detail: briefText,
        entity_type: 'system', entity_name: 'Kiko Intelligence',
        metadata: { stale_deals: stale.length, overdue_tasks: overdue.length, signals: (signals || []).length, upcoming_races: upcomingRaces.length },
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      })
    });

    await cronHeartbeat('cron-morning-intelligence', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 1 });
    return res.status(200).json({ ok: true, brief_length: briefText.length, preview: briefText.slice(0, 200) });
  } catch (err) {
    await logError('cron:morning-intelligence', err.message);
    await cronHeartbeat('cron-morning-intelligence', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
