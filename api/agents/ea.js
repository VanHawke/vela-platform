// api/agents/ea.js — Executive Assistant Agent (Phase 2 Rebuild)
// 9-source morning brief. Chief of Staff who knows the business.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

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
  const [tasks, deals, alerts, activities, news, outreachScores, pipelineNotifs, stageHistory] = await Promise.all([
    sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
    sbFetch('deals?select=id,data&data->>status=eq.active&limit=200'),
    sbFetch('kiko_alerts?dismissed=eq.false&expires_at=gt.' + now.toISOString() + '&select=type,severity,title,detail,entity_name&order=created_at.desc&limit=10'),
    sbFetch('activities?select=type,entity_name,subject,created_at&order=created_at.desc&limit=10'),
    sbFetch('news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gt.' + sevenDaysAgo + '&select=title,source_name,published_at,matched_companies,category&order=published_at.desc&limit=10'),
    sbFetch('outreach_scores?outcome=eq.replied&order=sent_at.desc&limit=10'),
    sbFetch('pipeline_notifications?is_dismissed=eq.false&order=created_at.desc&limit=10'),
    sbFetch('deal_stage_history?changed_at=gt.' + sevenDaysAgo + '&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc&limit=20'),
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

  // ══════ COMPOSE THE BRIEF ══════
  let out = `MORNING BRIEF — ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

  // ── OVERDUE (highest priority) ──
  if (overdue.length) {
    out += `🔴 OVERDUE (${overdue.length}):\n`;
    for (const t of overdue.slice(0, 5)) {
      const d = t.data;
      const daysOver = Math.floor((now - new Date(d.dueDate)) / 86400000);
      out += `  • ${d.type}: ${d.notes}${d.company ? ` (${d.company})` : ''} — ${daysOver}d overdue\n`;
    }
    out += '\n';
  }

  // ── DUE TODAY ──
  if (dueToday.length) {
    out += `📌 DUE TODAY (${dueToday.length}):\n`;
    for (const t of dueToday) {
      out += `  • ${t.data.type}: ${t.data.notes}${t.data.company ? ` (${t.data.company})` : ''}\n`;
    }
    out += '\n';
  }

  // ── HOT LEADS (outreach replies — immediate revenue opportunity) ──
  if (hotLeads.length) {
    out += `🔥 HOT LEADS (${hotLeads.length} outreach replies):\n`;
    for (const h of hotLeads) {
      out += `  • ${h.recipient_name || h.recipient_email}${h.company ? ` (${h.company})` : ''} — replied ${h.sent_at ? new Date(h.sent_at).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : ''}\n`;
    }
    out += '\n';
  }

  // ── PIPELINE (weighted value + momentum) ──
  out += `💰 PIPELINE: ${allDeals.length} active deals | ${fmt(totalRaw)} raw | ${fmt(totalWeighted)} weighted\n`;
  if (recentMoves.length) {
    out += `  Moved this week:\n`;
    for (const m of recentMoves.slice(0, 5)) {
      const name = movedDealNames[m.deal_id] || 'Unknown';
      const date = new Date(m.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      out += `  ↗ ${name}: ${m.from_stage} → ${m.to_stage} (${date})\n`;
    }
  }
  if (atRiskDeals.length) {
    out += `  ⚠️ At risk (4-7d no contact): ${atRiskDeals.map(d => `${d.company} (${d.daysSince}d)`).join(', ')}\n`;
  }
  if (staleDeals.length) {
    out += `  🔴 Stale (7d+): ${staleDeals.slice(0, 5).map(d => `${d.company} (${d.daysSince}d)`).join(', ')}`;
    if (staleDeals.length > 5) out += ` +${staleDeals.length - 5} more`;
    out += '\n';
  }
  out += '\n';

  // ── DEAL SIGNALS (from news) ──
  if (dealSignals.length) {
    out += `📰 DEAL SIGNALS (${dealSignals.length} this week):\n`;
    for (const s of dealSignals.slice(0, 3)) {
      const companies = (s.matched_companies || []).map(c => c.name || c).join(', ');
      out += `  • ${s.title}${companies ? ` — ${companies}` : ''}\n`;
    }
    out += '\n';
  }

  // ── ALERTS ──
  if (alerts?.length) {
    out += `⚠️ ALERTS (${alerts.length}):\n`;
    for (const a of alerts.slice(0, 3)) out += `  [${(a.severity||'info').toUpperCase()}] ${a.title}\n`;
    out += '\n';
  }

  // ── PIPELINE NOTIFICATIONS ──
  if (unreadNotifs.length) {
    out += `🔔 NOTIFICATIONS (${unreadNotifs.length} unread):\n`;
    for (const n of unreadNotifs.slice(0, 3)) {
      out += `  ${n.type === 'reply' ? '💬' : n.type === 'interested' ? '✅' : '📈'} ${n.title}\n`;
    }
    out += '\n';
  }

  // ── RECENT ACTIVITY ──
  if (activities?.length) {
    out += `📋 RECENT ACTIVITY:\n`;
    for (const a of (activities || []).slice(0, 3)) {
      const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      out += `  ${date} — [${a.type}] ${a.entity_name}: ${a.subject || ''}\n`;
    }
    out += '\n';
  }

  // ── SUMMARY LINE ──
  out += `📝 ${outstanding.length} tasks (${overdue.length} overdue) | ${hotLeads.length} hot leads | ${staleDeals.length} stale deals`;
  return out;
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
