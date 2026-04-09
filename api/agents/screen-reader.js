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
    case 'lemlist': case 'campaigns': return await describeLemlist();
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
  const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=100');
  const active = deals || [];
  let totalWeighted = 0;
  let staleCount = 0;
  const topDeals = [];
  for (const d of active) {
    const data = d.data || {};
    const prob = STAGE_PROB[data.stage] || 0.1;
    totalWeighted += (data.value || 0) * prob;
    const last = data.lastActivity ? new Date(data.lastActivity) : null;
    if (last && (Date.now() - last) > 30 * 86400000) staleCount++;
    if (topDeals.length < 5) topDeals.push(`${data.company} (${data.stage}, ${data.contactName || '?'})`);
  }
  return `COMMAND CENTRE — ${active.length} active deals | ${fmt(totalWeighted)} weighted | ${staleCount} stale (30d+)\n\nTop deals:\n${topDeals.map(d => `  • ${d}`).join('\n')}`;
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

async function describeLemlist() {
  // Summarise local sequence enrollments — live Lemlist stats need the ask_lemlist_live tool
  try {
    const seqs = await sbFetch('kiko_sequences?select=name,is_active&order=created_at.desc&limit=5');
    const enrollments = await sbFetch('kiko_sequence_enrollments?select=status&limit=200');
    const activeEnr = (enrollments || []).filter(e => e.status === 'active').length;
    const repliedEnr = (enrollments || []).filter(e => e.status === 'replied').length;
    return `LEMLIST / CAMPAIGNS — ${(seqs||[]).length} local sequences, ${activeEnr} active enrollments, ${repliedEnr} replied.\n\nRecent: ${(seqs||[]).slice(0,5).map(s => `${s.name} ${s.is_active ? '[active]' : '[paused]'}`).join(', ')}\n\nFor live Lemlist campaign stats, say "show Lemlist campaign stats".`;
  } catch {
    return 'LEMLIST page is open. Say "show Lemlist campaign stats" for live performance data from the Lemlist API.';
  }
}
