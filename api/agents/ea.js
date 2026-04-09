// api/agents/ea.js — Executive Assistant Agent (Phase 2 Rebuild + Quick Wins)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Fetch today's calendar events from Google Calendar
async function getTodayCalendarEvents() {
  try {
    const { getGoogleToken } = await import('../google-token.js');
    const token = await getGoogleToken('sunny@vanhawke.com');
    if (!token) return [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime&maxResults=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(e => ({
      title: e.summary || 'Untitled',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      attendees: (e.attendees || []).map(a => a.email).slice(0, 5),
      location: e.location || '',
    }));
  } catch { return []; }
}

const STAGE_PROB = {
  'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20,
  'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50,
  'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90,
  'Contract Review': 0.95
};

const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

const EA_PROMPT = `You are the Executive Assistant inside Kiko, the AI operating system for Van Hawke Group.
You run Sunny Sidhu's day. Think like a Chief of Staff who knows the business.
PRIORITY ORDER: Revenue-generating > client commitments > internal ops > admin.
Keep it sharp. Lead with what matters. No pleasantries. All financials in USD.`;

async function morningBrief() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();

  // Pull ALL 9 sources in parallel for speed
  const [tasks, deals, alerts, activities, news, outreachScores, pipelineNotifs, stageHistory, draftActions, calendarEvents, preferences] = await Promise.all([
    sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
    sbFetch('deals?select=id,data&data->>status=eq.active&limit=200'),
    sbFetch(`kiko_alerts?dismissed=eq.false&or=(expires_at.is.null,expires_at.gt.${now.toISOString()})&select=type,severity,title,detail,entity_name&order=created_at.desc&limit=10`),
    sbFetch('activities?select=type,entity_name,subject,created_at&order=created_at.desc&limit=10'),
    sbFetch('news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gt.' + sevenDaysAgo + '&select=title,source_name,published_at,matched_companies,category&order=published_at.desc&limit=10'),
    sbFetch('outreach_scores?outcome=eq.replied&order=sent_at.desc&limit=10'),
    sbFetch('pipeline_notifications?is_dismissed=eq.false&order=created_at.desc&limit=10'),
    sbFetch('deal_stage_history?changed_at=gt.' + sevenDaysAgo + '&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc&limit=20'),
    sbFetch('kiko_draft_actions?status=eq.pending&order=created_at.desc&limit=5&select=action_type,payload,created_at').catch(() => []),
    getTodayCalendarEvents(),
    sbFetch('kiko_preferences?order=confidence.desc&limit=10&select=category,preference,confidence').catch(() => []),
  ]);

  // ── SOURCE 1: Tasks ──
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);
  const dueToday = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate).toDateString() === now.toDateString());

  // ── SOURCE 2: Pipeline (weighted value + stale detection + momentum) ──
  const allDeals = deals || [];
  let totalRaw = 0, totalWeighted = 0;
  const staleDeals = [];
  const atRiskDeals = []; // 4-7 days, about to go stale
  for (const d of allDeals) {
    const data = d.data || {};
    const val = data.value || 0;
    const prob = STAGE_PROB[data.stage] || 0.1;
    totalRaw += val;
    totalWeighted += val * prob;
    const last = data.lastActivity ? new Date(data.lastActivity) : null;
    const daysSince = last ? Math.floor((now - last) / 86400000) : 999;
    if (daysSince > 7) staleDeals.push({ ...data, daysSince });
    else if (daysSince >= 4) atRiskDeals.push({ ...data, daysSince });
  }

  // ── SOURCE 3: Recently moved deals (momentum) ──
  const recentMoves = (stageHistory || []).slice(0, 10);
  const dealIds = [...new Set(recentMoves.map(m => m.deal_id))];
  const movedDealNames = {};
  for (const id of dealIds.slice(0, 5)) {
    const match = allDeals.find(d => d.id === id);
    if (match) movedDealNames[id] = match.data?.company || 'Unknown';
  }

  // ── SOURCE 4: Hot leads from outreach (replies) ──
  const hotLeads = (outreachScores || []).slice(0, 5);

  // ── SOURCE 5: Deal signals from news ──
  const dealSignals = (news || []).slice(0, 5);

  // ── SOURCE 6: Pipeline notifications ──
  const unreadNotifs = (pipelineNotifs || []).filter(n => !n.is_read);

  // ══════ SYNTHESISE VIA CLAUDE (not a formatted list) ══════
  // Also pull recent decisions from learning log for context
  let recentDecisions = [];
  try {
    recentDecisions = await sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=5&select=content,entity_name,created_at') || [];
  } catch {}

  // Inbox triage for today
  let inboxSummary = null;
  try {
    const today = now.toISOString().split('T')[0];
    const triage = await sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=summary,priority_emails`);
    if (Array.isArray(triage) && triage[0]) {
      const t = triage[0];
      inboxSummary = { summary: t.summary, actionRequired: (t.priority_emails || []).filter(e => e.priority === 'ACTION_REQUIRED').map(e => ({ from: e.from, subject: e.subject })) };
    }
  } catch {}

  const briefData = JSON.stringify({
    date: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    tasks: { outstanding: outstanding.length, overdue: overdue.length, dueToday: dueToday.length,
      overdueItems: overdue.slice(0,5).map(t => ({ type: t.data.type, notes: t.data.notes, company: t.data.company, daysOverdue: Math.floor((now - new Date(t.data.dueDate)) / 86400000) })),
      dueTodayItems: dueToday.slice(0,3).map(t => ({ type: t.data.type, notes: t.data.notes, company: t.data.company })) },
    pipeline: { total: allDeals.length, rawValue: totalRaw, weightedValue: totalWeighted,
      stale: staleDeals.slice(0,5).map(d => ({ company: d.company, daysSince: d.daysSince })),
      atRisk: atRiskDeals.slice(0,5).map(d => ({ company: d.company, daysSince: d.daysSince })) },
    momentum: recentMoves.slice(0,5).map(m => ({ company: movedDealNames[m.deal_id] || '?', from: m.from_stage, to: m.to_stage })),
    hotLeads: hotLeads.slice(0,5).map(h => ({ name: h.recipient_name || h.recipient_email, company: h.company })),
    dealSignals: dealSignals.slice(0,5).map(s => ({ title: s.title, companies: (s.matched_companies||[]).map(c => c.name||c) })),
    alerts: (alerts||[]).slice(0,5).map(a => ({ severity: a.severity, title: a.title, entity: a.entity_name })),
    notifications: unreadNotifs.slice(0,3).map(n => ({ type: n.type, title: n.title })),
    recentDecisions: recentDecisions.slice(0,3).map(d => ({ entity: d.entity_name, content: (d.content||'').slice(0,100), date: d.created_at })),
    pendingDraftActions: (Array.isArray(draftActions) ? draftActions : []).slice(0,3).map(d => ({ type: d.action_type, entity: d.payload?.entity, action: d.payload?.suggested_action })),
    todayCalendar: (calendarEvents || []).map(e => ({ title: e.title, start: e.start, attendees: e.attendees?.slice(0,3), location: e.location })),
    inboxTriage: inboxSummary,
    preferences: (Array.isArray(preferences) ? preferences : []).slice(0, 10).map(p => ({ confidence: p.confidence, preference: p.preference, category: p.category })),
  });

  try {
    const briefResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: `You are Kiko, Sunny's Chief of Staff at Van Hawke Group. Compose a morning brief.

RULES:
- DO NOT list data sources as sections. SYNTHESISE into a narrative.
- Identify CONVERGENCE MOMENTS: where multiple signals point to the same company.
- Lead with the single most important action Sunny should take RIGHT NOW.
- Be specific: names, numbers, dates. No filler. Under 400 words.
- If deals are stale and tasks are overdue, say so bluntly.
- If hot leads + news signals converge on a company, call it out as a convergence.
- End with the top 3 priorities for the day, ranked.
- If there are calendar events today, weave them into the narrative naturally: "You have a call with X at 2pm — here's what to know going in."
- If inbox triage data exists, mention it: "X emails need your attention — [sender]: [subject] is the most urgent."
- If there are pending draft actions, mention them: "I've prepared a [action] for [entity] — say 'approve' to execute."
- If preferences data exists, use it to frame priorities — e.g. if Sunny prioritises semiconductors, weight those deals higher.
- All values in USD.`,
      messages: [{ role: 'user', content: briefData }],
    });
    return briefResponse.content[0]?.text || 'Brief generation failed — data was gathered but synthesis errored.';
  } catch (err) {
    // Fallback: return raw data summary if Claude fails
    return `BRIEF DATA (synthesis unavailable): ${outstanding.length} tasks (${overdue.length} overdue), ${allDeals.length} deals (${fmt(totalWeighted)} weighted), ${hotLeads.length} hot leads, ${dealSignals.length} signals, ${(alerts||[]).length} alerts. Error: ${err.message}`;
  }
}

async function prioritiseTasks() {
  const tasks = await sbFetch('tasks?select=data&order=updated_at.desc&limit=30');
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  if (!outstanding.length) return 'No outstanding tasks.';
  // Pull deal data to cross-reference task companies with deal values
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=200');
  const dealsByCompany = {};
  for (const d of (deals || [])) {
    const name = (d.data?.company || '').toLowerCase();
    if (name) dealsByCompany[name] = d.data;
  }
  const taskList = outstanding.map(t => {
    const d = t.data;
    const deal = dealsByCompany[(d.company || '').toLowerCase()];
    let line = `${d.type}: ${d.notes}${d.company ? ` (${d.company})` : ''}${d.dueDate ? ` — due ${d.dueDate}` : ''}`;
    if (deal) line += ` [Deal: ${deal.stage}, value: $${(deal.value||0).toLocaleString()}]`;
    return line;
  }).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      system: EA_PROMPT,
      messages: [{ role: 'user', content: `Prioritise these ${outstanding.length} tasks. Rank by revenue impact × urgency. Top 5 with specific recommended actions.\n\n${taskList}` }],
    });
    return res.content[0]?.text || 'Could not prioritise tasks.';
  } catch (err) { return `Prioritisation error: ${err.message}`; }
}

async function consolidateTasks() {
  const tasks = await sbFetch('tasks?select=id,data&order=updated_at.desc&limit=50');
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  const byCompany = {};
  for (const t of outstanding) {
    const key = (t.data?.company || 'none').toLowerCase();
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push(t);
  }
  const dupes = Object.entries(byCompany).filter(([, v]) => v.length > 1);
  if (!dupes.length) return `${outstanding.length} tasks, no duplicates detected.`;
  let out = `TASK CONSOLIDATION — ${outstanding.length} outstanding, ${dupes.length} companies with multiple tasks:\n\n`;
  for (const [company, compTasks] of dupes) {
    out += `${company} (${compTasks.length} tasks):\n`;
    for (const t of compTasks) out += `  • ${t.data.type}: ${t.data.notes}${t.data.dueDate ? ` (due ${t.data.dueDate})` : ''}\n`;
    out += '\n';
  }
  return out;
}

export async function callEAAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'brief': return await morningBrief();
      case 'prioritise': return await prioritiseTasks();
      case 'consolidate': return await consolidateTasks();
      default: return `Unknown EA operation: ${operation}. Available: brief, prioritise, consolidate`;
    }
  } catch (err) { return `EA Agent error (${operation}): ${err.message}`; }
}
