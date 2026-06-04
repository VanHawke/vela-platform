// api/cron-daily-intelligence.js — Consolidated intelligence cron
// REPLACES: morning-synthesis, partnership-scan, prospect-intelligence, evening-summary
// Designed by Kiko: 3 phases, 1 Opus call instead of 4 separate crons.
// Runs once at 6am. Saves ~$30/month in API costs.

import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  const start = Date.now();
  const __hbId = await cronHeartbeat('cron-daily-intelligence', 'started');

  try {
    // ═══ PHASE 1: INGEST (no LLM, parallel data collection) ═══
    const [goals, deals, alerts, enrollments, tasks, calendar] = await Promise.all([
      supabase.from('kiko_goals').select('*').eq('status', 'active').order('priority'),
      supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")'),
      supabase.from('kiko_alerts').select('type, title, severity, entity_name, created_at')
        .eq('dismissed', false).gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
        .not('type', 'in', '(proactive_heartbeat,morning_briefing)').limit(20),
      supabase.from('kiko_sequence_enrollments').select('contact_name, company, status, current_step, reply_detected_at')
        .limit(200),
      supabase.from('tasks').select('id, data').limit(100),
      (() => { try { return JSON.parse(readFileSync(join(__dirname, 'data', 'race-calendars.json'), 'utf8')); } catch { return {}; } })(),
    ]);

    // Deal state with idle counters
    const now = Date.now();
    const dealState = (deals.data || []).map(d => {
      const lastAct = d.data?.lastActivity ? new Date(d.data.lastActivity).getTime() : 0;
      const updated = d.updated_at ? new Date(d.updated_at).getTime() : 0;
      const daysSince = Math.floor((now - Math.max(lastAct, updated)) / 86400000);
      return { company: d.data?.company, contact: d.data?.contactName, stage: d.data?.stage, value: d.data?.value, daysSince };
    });

    // Campaign stats
    const campaignStats = {
      total: (enrollments.data || []).length,
      active: (enrollments.data || []).filter(e => e.status === 'active').length,
      replied: (enrollments.data || []).filter(e => e.reply_detected_at).length,
      paused: (enrollments.data || []).filter(e => e.status === 'paused').length,
    };

    // Race context
    let raceContext = 'No upcoming race data';
    try {
      const nextRace = (calendar.f1_2026 || []).filter(r => new Date(r.date) >= new Date())[0];
      if (nextRace) {
        const days = Math.ceil((new Date(nextRace.date) - new Date()) / 86400000);
        raceContext = `Next race: ${nextRace.name} in ${nextRace.location} (${days} days away)`;
      }
    } catch {}

    // Open tasks summary
    const openTasks = (tasks.data || []).filter(t => !t.data?.completed).length;
    const overdueTasks = (tasks.data || []).filter(t => !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < new Date()).length;

    // ═══ PHASE 2: REASON (single Opus call — the BDI brain) ═══
    const briefing = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      messages: [{ role: 'user', content: `You are Kiko, the AI operating partner for Van Hawke Group (F1 sponsorship advisory). Produce the daily intelligence briefing.

ACTIVE GOALS:
${(goals.data || []).map(g => `[${g.priority}] ${g.title}`).join('\n') || 'No active goals set'}

PIPELINE (${dealState.length} active deals):
${dealState.map(d => `${d.company} — ${d.stage} — $${d.value || 0} — ${d.daysSince}d idle — Contact: ${d.contact || 'none'}`).join('\n') || 'No active deals'}

CAMPAIGN: ${campaignStats.total} enrolled, ${campaignStats.active} active, ${campaignStats.replied} replied, ${campaignStats.paused} paused

OVERNIGHT SIGNALS (${(alerts.data || []).length}):
${(alerts.data || []).map(a => `[${a.severity}] ${a.title}`).join('\n') || 'None'}

${raceContext}

TASKS: ${openTasks} open, ${overdueTasks} overdue

INSTRUCTIONS:
- Synthesise into a narrative briefing, not a list of data points.
- Lead with the single most important thing Sunny should act on today.
- Flag any deal idle >14 days as at-risk.
- Flag any campaign signals that need human action.
- Reference the race calendar if relevant (upcoming races create outreach windows).
- Keep it under 500 words. Direct. No filler.
- End with "TODAY'S PRIORITY:" and one clear action.` }],
    });

    const briefText = briefing.content?.[0]?.text || 'Briefing generation failed.';

    // ═══ PHASE 3: PUBLISH (write briefing to alerts + Today page) ═══
    await supabase.from('kiko_alerts').insert({
      type: 'morning_briefing',
      severity: 'medium',
      title: `Morning Briefing — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      detail: briefText,
      entity_type: 'briefing',
      entity_name: new Date().toISOString(),
      dismissed: false,
    });

    // Also write to memory for Today page
    await sbFetch('kiko_memory', {
      method: 'POST',
      body: JSON.stringify({
        key: 'daily_briefing',
        content: briefText,
        category: 'briefing',
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});

    console.log(`[daily-intelligence] Briefing published. ${dealState.length} deals, ${(alerts.data || []).length} signals, 1 Opus call.`);
    await cronHeartbeat('cron-daily-intelligence', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - start });
    return res.json({ ok: true, deals: dealState.length, signals: (alerts.data || []).length, duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[daily-intelligence] Fatal:', err.message);
    await cronHeartbeat('cron-daily-intelligence', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}
