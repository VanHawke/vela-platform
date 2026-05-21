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

    const [goals, alerts, emails, followUps, campaign, tasks, news, calendarEvents] = await Promise.all([
      // DESIRES: Active goals
      supabase.from('kiko_goals').select('*').eq('status', 'active').order('priority'),

      // Recent alerts (undismissed, last 24h)
      supabase.from('kiko_alerts').select('type, title, detail, severity, created_at')
        .eq('dismissed', false).eq('verified', true).gte('created_at', since).order('created_at', { ascending: false }).limit(15),

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

      // Today's calendar (fetch Sunny's Google Calendar)
      (async () => {
        try {
          const { getGoogleToken } = await import('./google-token.js');
          const token = await getGoogleToken('sunny@vanhawke.agency');
          if (!token) return [];
          const now = new Date();
          const eod = new Date(now); eod.setHours(23, 59, 59);
          const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${eod.toISOString()}&singleEvents=true&orderBy=startTime`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const data = await resp.json();
          return data.items || [];
        } catch { return []; }
      })(),
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

    const calendarText = (calendarEvents || []).length > 0
      ? (calendarEvents || []).map(e => {
          const time = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'all-day';
          return `• ${time} — ${e.summary || 'Untitled'}${e.location ? ' @ ' + e.location : ''}`;
        }).join('\n')
      : 'No meetings today — open schedule for focused work.';

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

    // ── PHASE 3: MULTI-PASS REASONING (Planner → Generator → Evaluator) ──
    // From Anthropic's evaluator-optimizer pattern: separate planning from generation from quality control.

    // STEP 1: PLANNER (Haiku — fast, cheap, structural)
    const planResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: `You are a strategic planner for a Formula One sponsorship advisory firm. Today is ${today}.

GOALS: ${goalsText}
RACE CALENDAR: ${raceContext}
TODAY'S SCHEDULE: ${calendarText}
ACTIVE INTENTS: ${intentsText || 'none'}
ALERTS: ${alertsText}
EMAIL ACTIVITY: ${emailText}
FOLLOW-UPS: ${followUpText}
CAMPAIGN: ${campaignText}
${memoryContext}

Produce a structured plan for today's briefing. Output EXACTLY this format:
HEADLINE: [one sentence — the single most important thing today]
PRIORITY_1: [most urgent action + why + which goal it serves]
PRIORITY_2: [second action + why + which goal]
PRIORITY_3: [third action + why + which goal]
RACE_ANGLE: [race timing opportunity or "none"]
RISK: [biggest risk if nothing is done today]
STALE_DEALS: [any deals/prospects going cold with days count]` }]
    });
    const plan = planResp.content[0]?.text || '';
    console.log(`[MorningSynthesis] Plan: ${plan.length} chars`);

    // STEP 2: GENERATOR (Sonnet — deep reasoning, strategic writing)
    const genResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `You are Kiko, the AI executive operating partner for Van Hawke Group, a Formula One sponsorship advisory firm. Today is ${today}.

Your PLANNER identified these priorities:
${plan}

Now write the full strategic briefing using ALL of this data:

═══ ACTIVE STRATEGIC GOALS ═══
${goalsText}

═══ RACE CALENDAR ═══
${raceContext}

═══ TODAY'S CALENDAR ═══
${calendarText}

═══ ACTIVE INTENTS ═══
${intentsText || 'None'}

═══ OVERNIGHT SIGNALS ═══
EMAIL ACTIVITY: ${emailText}
FOLLOW-UPS: ${followUpText}
CAMPAIGN: ${campaignText}
ALERTS: ${alertsText}
TASKS: ${tasksText}
NEWS: ${newsText}
${memoryContext}

═══ RULES ═══
1. HEADLINE — One sentence from the planner's headline.
2. RACE WEEK INTELLIGENCE — If race within 7 days: which prospects to prioritise, what's the location angle, specific actions for Matt. If no race soon, note the next one.
3. GOAL PROGRESS — For each goal: what changed, what's the next step, flag if stalling.
4. ACTIONS FOR TODAY — Numbered, specific, tied to goals. "Rewrite the CTA" not "review the campaign."
5. RISK FLAGS — Stale deals, unanswered follow-ups, campaign problems.

CRITICAL: Do NOT fabricate deals, partnerships, or news. If you don't have information about something, say so. Every claim must come from the data above.
Be direct, specific, strategic. Every sentence = fact, recommendation, or decision point.` }]
    });
    let briefing = genResp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    console.log(`[MorningSynthesis] Draft briefing: ${briefing.length} chars`);

    // STEP 3: EVALUATOR (Haiku — quality control, catches fabrication)
    const evalResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: `You are a quality evaluator for an AI-generated strategic briefing. Review this briefing and check for:

1. FABRICATION — Does it mention any deals, partnerships, or news that aren't in the source data?
2. USEFULNESS — Does every action have a specific next step? Or is it vague ("consider reviewing")?
3. GOAL CONNECTION — Is every recommendation tied to an active goal?
4. OOO HANDLING — If Joe Paulo/Helsing is mentioned, is the OOO correctly noted (not counted as real engagement)?
5. MISSING — Are there any signals in the data that the briefing ignores?

SOURCE DATA SUMMARY:
Goals: ${goalsText.slice(0, 300)}
Campaign: ${campaignText}
Email: ${emailText}
Race: ${raceContext.slice(0, 200)}
Intents: ${intentsText?.slice(0, 200) || 'none'}

BRIEFING TO EVALUATE:
${briefing.slice(0, 2000)}

If the briefing PASSES quality: respond with exactly "PASS"
If it FAILS: respond with "FAIL:" followed by specific issues to fix.` }]
    });
    const evalResult = evalResp.content[0]?.text?.trim() || 'PASS';
    console.log(`[MorningSynthesis] Evaluator: ${evalResult.slice(0, 100)}`);

    // STEP 4: If evaluator rejects, regenerate with feedback (one retry)
    if (evalResult.startsWith('FAIL') && briefing.length > 100) {
      console.log(`[MorningSynthesis] Evaluator rejected. Regenerating with feedback...`);
      const retryResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [
          { role: 'user', content: `Rewrite this briefing. The evaluator found these issues:\n${evalResult}\n\nOriginal briefing:\n${briefing}\n\nFix the issues and rewrite. Keep the same structure but address every problem the evaluator identified.` }
        ]
      });
      briefing = retryResp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      console.log(`[MorningSynthesis] Revised briefing: ${briefing.length} chars`);
    }

    // ── Store briefing ──
    await supabase.from('kiko_alerts').insert({
      type: 'morning_briefing',
      severity: 'high',
      title: `📋 Morning Briefing — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      detail: briefing,
      entity_type: 'briefing',
      entity_name: today,
      dismissed: false,
      verified: true,
      source: 'morning-synthesis',
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