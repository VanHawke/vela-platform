// api/cron-morning-synthesis.js — Kiko's Strategic Reasoning Engine
// Runs at 7 AM daily. This is the BRAIN — it connects goals to signals to actions.
// Architecture: BDI model (Belief-Desire-Intention) + Google CC briefing pattern
//
// 1. Loads all active GOALS (Desires)
// 2. Collects overnight SIGNALS from every source (Beliefs)
// 3. Feeds everything to Claude to REASON about what matters today (Intentions)
// 4. Stores the briefing for the Today page
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

function getRaceContext() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const calendar = JSON.parse(readFileSync(join(__dirname, 'data', 'race-calendars.json'), 'utf8'));
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const allRaces = [
      ...(calendar.f1_2026 || []).map(r => ({ ...r, series: 'F1' })),
      ...(calendar.formula_e_2026 || []).map(r => ({ ...r, series: 'Formula E' })),
      ...(calendar.motogp_2026 || []).map(r => ({ ...r, series: 'MotoGP' })),
    ];
    
    const upcoming = allRaces
      .filter(r => new Date(r.date) >= new Date(todayStr))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);
    
    return upcoming.map(r => {
      const days = Math.ceil((new Date(r.date) - now) / 86400000);
      return `[${r.series}] ${r.name} in ${r.location} on ${r.date} (${days} days away)${r.sprint ? ' [SPRINT]' : ''}`;
    }).join('\n');
  } catch (e) { return 'Race calendar unavailable'; }
}

export default async function handler(req, res) {
  const start = Date.now();
  try {
    // ── BELIEFS: Collect all overnight signals ──
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [goals, alerts, emails, followUps, campaign, tasks, news] = await Promise.all([
      // DESIRES: Active goals
      supabase.from('kiko_goals').select('*').eq('status', 'active').order('priority'),

      // Recent alerts (undismissed, last 24h)
      supabase.from('kiko_alerts').select('type, title, detail, severity, created_at')
        .eq('dismissed', false).gte('created_at', since).order('created_at', { ascending: false }).limit(15),

      // Email tracking (last 24h activity)
      supabase.from('kiko_email_tracking').select('recipient_name, company, status, replied_at, bounced_at, last_opened_at')
        .gte('updated_at', since).limit(20),

      // Follow-ups awaiting reply
      supabase.from('kiko_follow_ups').select('contact_name, company, status, due_date')
        .eq('status', 'awaiting_reply').limit(10),

      // Campaign state
      supabase.from('kiko_sequence_enrollments').select('status, company')
        .then(({ data }) => {
          const counts = {};
          (data || []).forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
          return { data: counts };
        }),

      // Open tasks
      supabase.from('tasks').select('data')
        .eq('data->>completed', 'false').limit(10),

      // Recent news (classified, last 24h)
      supabase.from('kiko_news_articles').select('title, source, relevance_score, classification')
        .gte('created_at', since).order('relevance_score', { ascending: false }).limit(10),
    ]);

    // ── Get race calendar from local file (no web search — web search returned wrong results) ──
    const today = new Date().toISOString().split('T')[0];
    const raceContext = getRaceContext();

    // ── Format signals for Claude ──
    const goalsText = (goals.data || []).map(g =>
      `• [${g.priority}] ${g.title}: ${g.description || ''} | Success: ${g.success_criteria || 'undefined'}`
    ).join('\n');

    const alertsText = (alerts.data || []).map(a =>
      `• [${a.severity}] ${a.title}`
    ).join('\n') || 'No new alerts';

    const emailText = (emails.data || []).map(e => {
      if (e.replied_at) return `• REPLY: ${e.recipient_name} (${e.company}) replied`;
      if (e.bounced_at) return `• BOUNCE: ${e.recipient_name} (${e.company})`;
      if (e.last_opened_at) return `• OPENED: ${e.recipient_name} (${e.company})`;
      return null;
    }).filter(Boolean).join('\n') || 'No email activity';

    const followUpText = (followUps.data || []).map(f =>
      `• ${f.contact_name} (${f.company}) — ${f.status}, due ${f.due_date || 'unset'}`
    ).join('\n') || 'No pending follow-ups';

    const campaignText = Object.entries(campaign.data || {}).map(([k, v]) => `${k}: ${v}`).join(', ');

    const tasksText = (tasks.data || []).slice(0, 5).map(t =>
      `• ${t.data?.type || 'Task'}: ${t.data?.contact || ''} @ ${t.data?.company || ''} — ${t.data?.notes?.slice(0, 80) || ''}`
    ).join('\n') || 'No open tasks';

    const newsText = (news.data || []).map(n =>
      `• [${n.relevance_score || '?'}] ${n.title} (${n.source})`
    ).join('\n') || 'No relevant news';

    // ── GLOBAL MEMORY: Search for relevant past context ──
    let memoryContext = '';
    try {
      const { searchMemory, formatMemoryContext } = await import('./lib/memory-retrieval.js');
      const goalsKeywords = (goals.data || []).map(g => g.title).join(' ');
      const memory = await searchMemory(goalsKeywords);
      memoryContext = formatMemoryContext(memory);
      if (memoryContext) memoryContext = `\n\n═══ PAST CONTEXT (from memory) ═══\n${memoryContext}`;
    } catch (e) { console.warn('[MorningSynthesis] Memory retrieval failed:', e.message); }

    // ── ACTIVE INTENTS ──
    let intentsText = '';
    try {
      const { data: intents } = await supabase.from('kiko_intents')
        .select('title, status, next_action, due_date').eq('status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false }).limit(5);
      if (intents?.length) {
        intentsText = intents.map(i => `• ${i.title}${i.due_date ? ' (due: ' + i.due_date + ')' : ''} → ${i.next_action || 'action needed'}`).join('\n');
      }
    } catch {}

    // ── REASONING: Ask Claude to synthesise ──
    const synthesisResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `You are Kiko, the AI executive operating partner for Van Hawke Group, a Formula One sponsorship advisory firm. Today is ${today}.

Your job is to deliver a STRATEGIC MORNING BRIEFING to Sunny Sidhu (Founder & CEO). This is not a data dump. This is what a world-class Chief of Staff would say at 7 AM: "Here's what matters today, here's what's changed, here's what you should do."

═══ ACTIVE STRATEGIC GOALS ═══
${goalsText}

═══ RACE CALENDAR ═══
${raceContext}

═══ OVERNIGHT SIGNALS ═══

EMAIL ACTIVITY (last 24h):
${emailText}

FOLLOW-UPS AWAITING REPLY:
${followUpText}

CAMPAIGN STATE:
${campaignText}

ALERTS:
${alertsText}

OPEN TASKS:
${tasksText}

NEWS & INTELLIGENCE:
${newsText}
${intentsText ? `\n═══ ACTIVE INTENTS (what needs to happen NOW) ═══\n${intentsText}` : ''}
${memoryContext}

═══ YOUR TASK ═══
Produce a briefing with these sections:

1. **HEADLINE** — One sentence: the single most important thing today.

2. **RACE WEEK INTELLIGENCE** — If there's a race within 7 days: which prospects should be prioritised for outreach this week, what's the market angle for that location, and what specific actions Matt should take. If no race this week, note the next one and what prep is needed.

3. **GOAL PROGRESS** — For each active goal, one line: what changed in the last 24h and what the next step is. Flag any goal that's stalling.

4. **ACTIONS FOR TODAY** — Numbered list of specific things to do today, in priority order. Each action should be concrete and tied to a goal. "Review campaign CTA" not "think about campaigns."

5. **RISK FLAGS** — Anything that needs attention: stale deals, unanswered follow-ups, campaign problems, data quality issues.

Be direct, specific, and strategic. No filler. Every sentence should contain either a fact, a recommendation, or a decision point. Write as Sunny's most trusted advisor, not as a system report.` }]
      });

    const briefing = synthesisResp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    // ── Store briefing ──
    await supabase.from('kiko_alerts').insert({
      type: 'morning_briefing',
      severity: 'high',
      title: `📋 Morning Briefing — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      detail: briefing,
      entity_type: 'briefing',
      entity_name: today,
      dismissed: false,
      metadata: {
        goals_count: goals.data?.length || 0,
        signals_count: (alerts.data?.length || 0) + (emails.data?.length || 0),
        race_context: raceContext,
        generated_at: new Date().toISOString()
      }
    });

    console.log(`[MorningSynthesis] Briefing generated (${briefing.length} chars, ${Date.now() - start}ms)`);
    return res.json({ ok: true, briefing_length: briefing.length, duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[MorningSynthesis] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}