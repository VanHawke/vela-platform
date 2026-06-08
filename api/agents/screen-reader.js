// api/agents/screen-reader.js — Live screen description
// Queries Supabase directly per page instead of reading stale pageContext.
// Called when intent === 'screen' ("what am I looking at")
import { sbFetch } from '../kiko-tools.js';

const STAGE_PROB = {
  'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20,
  'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50,
  'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90,
  'Contract Review': 0.95
};
const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

export async function describeScreen(currentPage) {
  try {
    switch (currentPage) {
    case 'pipeline': return await describePipeline();
    case 'contacts': return await describeContacts();
    case 'organisations': return await describeOrganisations();
    case 'email': case 'outreach-intelligence': case 'command-centre': return await describeCommandCentre();
    case 'tasks': return await describeTasks();
    case 'news': return 'News Signals has been replaced by the Partnership Detection Engine. Partnership announcements are now detected automatically and appear as alerts on the Home page. Say "show me the partnership matrix" to see the latest F1 partnerships.';
    case 'partnership-matrix': return await describeMatrix();
    case 'campaigns': return await describeCampaigns();
    case 'calendar': return 'You are on the Race Calendar page. It shows F1 2026 and Formula E Season 12 race calendars with pre-race outreach windows and upcoming events.';
    case 'documents': return 'Knowledge Library has been removed. Documents can be uploaded directly in chat — just drag and drop a file and I will learn from it.';
    case 'home': return 'You are on the Home page — Kiko\'s main interface. You can ask me anything, use the quick action chips (Brief me, Pipeline update, Check emails, Race calendar), or navigate to any page.';
    default: return `You are on the ${currentPage || 'unknown'} page.`;
    }
  } catch (err) { return `Screen description error: ${err.message}`; }
}

async function describePipeline() {
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=200');
  if (!deals?.length) return 'Pipeline page is open but no active deals found.';
  const byStage = {};
  let totalRaw = 0, totalWeighted = 0;
  const stale = [];
  for (const d of deals) {
    const data = d.data || {};
    const stage = data.stage || 'Unknown';
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(data);
    totalRaw += data.value || 0;
    totalWeighted += (data.value || 0) * (STAGE_PROB[stage] || 0.1);
    const last = data.lastActivity ? new Date(data.lastActivity) : null;
    if (last && (Date.now() - last) > 7 * 86400000) stale.push(data.company);
  }
  const stageOrder = ['To revisit','Contact made','Qualified','In Dialogue','Meeting arranged (brand x RH)','Proposal Sent','Negotiation','Verbal Agreement','Contract Review'];
  let out = `PIPELINE — ${deals.length} active deals | ${fmt(totalRaw)} raw | ${fmt(totalWeighted)} weighted\n\n`;
  for (const stage of stageOrder) {
    const ds = byStage[stage];
    if (!ds?.length) continue;
    out += `${stage} (${ds.length}): ${ds.slice(0,4).map(d => d.company).join(', ')}${ds.length > 4 ? ` +${ds.length-4}` : ''}\n`;
  }
  if (stale.length) out += `\nStale (7d+): ${stale.slice(0,5).join(', ')}${stale.length > 5 ? ` +${stale.length-5}` : ''}`;
  return out;
}

async function describeContacts() {
  const recent = await sbFetch('contacts?select=data&order=updated_at.desc&limit=5');
  let out = `CONTACTS — showing your contact database.\n\nRecent contacts:\n`;
  for (const c of (recent || [])) {
    const d = c.data || {};
    out += `  • ${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} @ ${d.company || '?'}\n`;
  }
  return out;
}

async function describeOrganisations() {
  const companies = await sbFetch('companies?select=data&order=updated_at.desc&limit=8');
  let out = `ORGANISATIONS — your company database.\n\nRecent companies:\n`;
  for (const c of (companies || [])) {
    const d = c.data || {};
    out += `  • ${d.name || '?'} — ${d.industry || '?'}${d.totalFunding ? ` | Funded: ${d.totalFunding}` : ''}${d.employees ? ` | ${d.employees} emp` : ''}\n`;
  }
  return out;
}

async function describeCommandCentre() {
  // Mirror EXACTLY what OutreachIntelligence.jsx renders for the priority list,
  // so when Sunny is on /command-centre and asks "what should I prioritize",
  // the answer matches the visible top 5, not a generic deals digest.
  // CRITICAL: use data.lastActivity (real business activity) not row updated_at
  // (which bumps on any field edit and is meaningless — was the Decagon 16-day bug).
  const [deals, tasks] = await Promise.all([
    sbFetch('deals?select=id,data,updated_at&data->>status=eq.active&limit=200'),
    sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
  ]);
  const active = deals || [];
  const now = Date.now();

  // Score deals same way OutreachIntelligence.jsx does
  const scoredDeals = active.map(d => {
    const data = d.data || {};
    const stage = data.stage || 'lead';
    const prob = STAGE_PROB[stage] || 0.1;
    const value = data.value || 0;
    const weightedValue = value * prob;
    const activityDate = data.lastActivity ? new Date(data.lastActivity) : new Date(d.updated_at);
    const daysSinceUpdate = Math.floor((now - activityDate) / 86400000);
    const isStale = daysSinceUpdate > 30;
    const urgency = daysSinceUpdate > 30 ? 3 : daysSinceUpdate > 14 ? 2 : daysSinceUpdate > 7 ? 1 : 0;
    const actionType = isStale ? 'Re-engage' : daysSinceUpdate > 14 ? 'Follow-up' : daysSinceUpdate > 7 ? 'Touch base' : 'Active';
    // priorityScore matches OutreachIntelligence: weightedValue * (1 + urgency)
    const priorityScore = weightedValue * (1 + urgency);
    return { company: data.company || '?', contact: data.contactName || data.contact || '?', stage, value, weightedValue, daysSinceUpdate, isStale, urgency, actionType, priorityScore };
  }).sort((a, b) => b.priorityScore - a.priorityScore);

  const topPriority = scoredDeals.slice(0, 5);
  const totalWeighted = scoredDeals.reduce((s, d) => s + d.weightedValue, 0);
  const staleCount = scoredDeals.filter(d => d.isStale).length;

  // Tasks (overdue + due today)
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
  const dueToday = outstanding.filter(t => {
    if (!t.data?.dueDate) return false;
    return new Date(t.data.dueDate).toDateString() === new Date().toDateString();
  });

  // Build the response — this is what you SEE on the page right now, in priority order
  const lines = [];
  lines.push(`COMMAND CENTRE — VISIBLE PRIORITY LIST (top of page, sorted by weighted value × urgency)`);
  lines.push('');
  lines.push(`Stats: ${active.length} active deals | ${fmt(totalWeighted)} weighted pipeline | ${staleCount} stale (>30d) | ${overdue.length} overdue tasks | ${dueToday.length} due today`);
  lines.push('');
  lines.push('ACT ON THESE FIRST (top 5 priority actions exactly as the user sees them on screen):');
  topPriority.forEach((d, i) => {
    lines.push(`  ${i + 1}. ${d.company}${d.contact !== '?' ? ' — ' + d.contact : ''}: ${d.stage}, $${(d.value / 1000).toFixed(0)}k, ${d.daysSinceUpdate}d since real activity, action: ${d.actionType}${d.isStale ? ' [STALE]' : ''}`);
  });
  if (overdue.length > 0) {
    lines.push('');
    lines.push(`OVERDUE TASKS (${overdue.length} total):`);
    overdue.slice(0, 5).forEach(t => {
      const d = t.data || {};
      const days = Math.floor((Date.now() - new Date(d.dueDate)) / 86400000);
      lines.push(`  • ${d.type || 'task'}: ${d.notes || d.title || 'no description'}${d.company ? ' (' + d.company + ')' : ''} — ${days}d overdue`);
    });
  }
  lines.push('');
  lines.push(`When the user asks "what should I prioritize" on this page, the answer is the top 5 priority actions ABOVE — already sorted by weighted value × urgency. Use those exact deals in that exact order. Reference companies and contacts BY NAME from this list.`);
  return lines.join('\n');
}

async function describeTasks() {
  const tasks = await sbFetch('tasks?select=data&order=updated_at.desc&limit=30');
  const outstanding = (tasks || []).filter(t => !t.data?.completed);
  const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
  let out = `TASKS — ${outstanding.length} outstanding, ${overdue.length} overdue\n\n`;
  if (overdue.length) {
    out += `Overdue:\n`;
    for (const t of overdue.slice(0, 5)) out += `  • ${t.data.type}: ${t.data.notes}${t.data.company ? ` (${t.data.company})` : ''}\n`;
    out += '\n';
  }
  out += `Recent:\n`;
  for (const t of outstanding.slice(0, 5)) out += `  • ${t.data.type}: ${t.data.notes}${t.data.company ? ` (${t.data.company})` : ''}\n`;
  return out;
}

async function describeMatrix() {
  // Live partnership matrix summary — reads f1_partnerships to show real state
  const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,category_id,partner_name&limit=500');
  const teams = await sbFetch('f1_teams?select=id,name&order=name');
  const categories = await sbFetch('sponsor_categories?select=id,name');
  if (!partnerships?.length || !teams?.length || !categories?.length) {
    return 'PARTNERSHIP MATRIX — data still loading. Try refreshing.';
  }
  const total = partnerships.length;
  // Coverage per category
  const catMap = {};
  for (const p of partnerships) {
    if (!p.category_id || !p.team_id) continue;
    if (!catMap[p.category_id]) catMap[p.category_id] = new Set();
    catMap[p.category_id].add(p.team_id);
  }
  const thinCategories = categories
    .map(c => ({ id: c.id, name: c.name, teamCount: (catMap[c.id] || new Set()).size }))
    .filter(c => c.teamCount > 0 && c.teamCount <= 4)
    .sort((a, b) => a.teamCount - b.teamCount)
    .slice(0, 5);
  let out = `PARTNERSHIP MATRIX — ${total} active partnerships across ${teams.length} teams and ${categories.length} categories.\n\n`;
  out += `Most-open categories (fewest teams with a partner — biggest opportunity):\n`;
  for (const c of thinCategories) out += `  • ${c.name}: ${c.teamCount}/11 teams filled\n`;
  out += `\nClick a team tab to see their full partner list, or ask "which category is open for [team]" for a live gap analysis.`;
  return out;
}

async function describeCampaigns() {
  // Summarise local sequence enrollments — live Lemlist stats need the ask_lemlist_live tool
  try {
    const seqs = await sbFetch('kiko_sequences?select=name,is_active&order=created_at.desc&limit=5');
    const enrollments = await sbFetch('kiko_sequence_enrollments?select=status&limit=200');
    const activeEnr = (enrollments || []).filter(e => e.status === 'active').length;
    const repliedEnr = (enrollments || []).filter(e => e.status === 'replied').length;
    return `CAMPAIGNS — ${(seqs||[]).length} local sequences, ${activeEnr} active enrollments, ${repliedEnr} replied.\n\nRecent: ${(seqs||[]).slice(0,5).map(s => `${s.name} ${s.is_active ? '[active]' : '[paused]'}`).join(', ')}\n\nCampaign engine is native — all stats available directly.`;
  } catch {
    return 'CAMPAIGNS page is open. All campaign data runs through the native outreach engine.';
  }
}
