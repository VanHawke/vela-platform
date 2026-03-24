// api/agents/ea.js — Executive Assistant Agent
// Removes cognitive load. Calendar, priorities, morning brief, task consolidation.
// Model: claude-sonnet-4-20250514
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const EA_PROMPT = `You are the Executive Assistant inside Kiko, the AI operating system for Van Hawke Group.
You run Sunny Sidhu's day. Think like a Chief of Staff who knows the business.
PRIORITY ORDER: Revenue-generating > client commitments > internal ops > admin.
Keep it sharp. Lead with what matters. No pleasantries. All financials in USD.`;

async function morningBrief() {
  // Pull tasks
  const tasks = await sbFetch('tasks?select=data&order=updated_at.desc&limit=20');
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
  const dueToday = outstanding.filter(t => {
    if (!t.data?.dueDate) return false;
    const d = new Date(t.data.dueDate).toDateString();
    return d === new Date().toDateString();
  });

  // Pull pipeline summary
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=100');
  const staleDeals = (deals || []).filter(d => {
    const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : null;
    return last && (Date.now() - last) > 7 * 86400000;
  });

  // Pull alerts
  const alerts = await sbFetch('kiko_alerts?dismissed=eq.false&expires_at=gt.' + new Date().toISOString() + '&select=type,severity,title,detail&order=created_at.desc&limit=5');

  // Pull recent activity
  const activities = await sbFetch('activities?select=type,entity_name,subject,created_at&order=created_at.desc&limit=5');

  // Build brief
  let out = `MORNING BRIEF — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

  // Overdue tasks
  if (overdue.length) {
    out += `🔴 OVERDUE (${overdue.length}):\n`;
    for (const t of overdue.slice(0, 5)) {
      const d = t.data;
      out += `  • ${d.type}: ${d.notes}${d.company ? ` (${d.company})` : ''} — due ${new Date(d.dueDate).toLocaleDateString('en-GB')}\n`;
    }
    out += '\n';
  }

  // Due today
  if (dueToday.length) {
    out += `📌 DUE TODAY (${dueToday.length}):\n`;
    for (const t of dueToday) {
      out += `  • ${t.data.type}: ${t.data.notes}${t.data.company ? ` (${t.data.company})` : ''}\n`;
    }
    out += '\n';
  }

  // Pipeline
  out += `📊 PIPELINE: ${(deals||[]).length} active deals`;
  if (staleDeals.length) out += ` | ${staleDeals.length} stale (7d+)`;
  out += '\n';
  if (staleDeals.length) {
    out += `  Stale: ${staleDeals.slice(0, 5).map(d => d.data.company).join(', ')}\n`;
  }
  out += '\n';

  // Alerts
  if (alerts?.length) {
    out += `⚠️ ALERTS (${alerts.length}):\n`;
    for (const a of alerts.slice(0, 3)) out += `  [${a.severity}] ${a.title}\n`;
    out += '\n';
  }

  // Recent activity
  if (activities?.length) {
    out += `📋 RECENT ACTIVITY:\n`;
    for (const a of activities.slice(0, 3)) {
      const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      out += `  ${date} — [${a.type}] ${a.entity_name}: ${a.subject || ''}\n`;
    }
    out += '\n';
  }

  // Outstanding count
  out += `📝 ${outstanding.length} outstanding tasks (${overdue.length} overdue)`;
  return out;
}

async function prioritiseTasks() {
  const tasks = await sbFetch('tasks?select=data&order=updated_at.desc&limit=30');
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  if (!outstanding.length) return 'No outstanding tasks.';

  try {
    const taskList = outstanding.map(t => {
      const d = t.data;
      return `${d.type}: ${d.notes}${d.company ? ` (${d.company})` : ''}${d.dueDate ? ` — due ${d.dueDate}` : ''}`;
    }).join('\n');

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

  // Find potential duplicates (same company + similar type)
  const byCompany = {};
  for (const t of outstanding) {
    const key = (t.data?.company || 'none').toLowerCase();
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push(t);
  }
  const dupes = Object.entries(byCompany).filter(([, v]) => v.length > 1);
  if (!dupes.length) return `${outstanding.length} tasks, no duplicates detected.`;

  let out = `TASK CONSOLIDATION — ${outstanding.length} outstanding, ${dupes.length} companies with multiple tasks:\n\n`;
  for (const [company, tasks] of dupes) {
    out += `${company} (${tasks.length} tasks):\n`;
    for (const t of tasks) out += `  • ${t.data.type}: ${t.data.notes}${t.data.dueDate ? ` (due ${t.data.dueDate})` : ''}\n`;
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
