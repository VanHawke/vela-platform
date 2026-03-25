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
    case 'email': case 'outreach-intelligence': return await describeCommandCentre();
    case 'tasks': return await describeTasks();
    case 'news': return 'News Signals has been replaced by the Partnership Detection Engine. Partnership announcements are now detected automatically and appear as alerts on the Home page. Say "show me the partnership matrix" to see the latest F1 partnerships.';
    case 'partnership-matrix': return await describeMatrix();
    case 'lemlist': return await describeLemlist();
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
  const count = await sbFetch('contacts?select=id&limit=1&order=updated_at.desc', { headers: { Prefer: 'count=exact' } });
  const recent = await sbFetch('contacts?select=data&order=updated_at.desc&limit=5');
  const total = Array.isArray(count) ? 'many' : '?';
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

async function describeNews() {
  const articles = await sbFetch('news_articles?is_processed=eq.true&order=published_at.desc&limit=5&select=title,source_name,relevance_score,deal_signal');
  let out = `NEWS SIGNALS — latest articles:\n\n`;
  for (const a of (articles || [])) {
    out += `  • ${a.title} (${a.source_name})${a.deal_signal ? ' 🔴 DEAL SIGNAL' : ''}\n`;
  }
  return out;
}

async function describeMatrix() {
  const teams = await sbFetch('f1_teams?order=sort_order&select=name&limit=10');
  const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id&limit=200');
  const categories = await sbFetch('sponsor_categories?order=sort_order&select=id,name&limit=20');
  const totalGaps = (teams || []).length * (categories || []).length - (partnerships || []).length;
  return `PARTNERSHIP MATRIX — ${(teams||[]).length} F1 teams, ${(partnerships||[]).length} active partnerships, ~${totalGaps} open categories.\n\nTeams: ${(teams||[]).map(t=>t.name).join(', ')}`;
}

async function describeLemlist() {
  const campaigns = await sbFetch('lemlist_campaigns?select=name,status&limit=10&order=created_at.desc');
  const activeCampaigns = (campaigns || []).filter(c => c.status === 'active');
  return `LEMLIST — ${(campaigns||[]).length} campaigns (${activeCampaigns.length} active).\n\nRecent: ${(campaigns||[]).slice(0,5).map(c => `${c.name} [${c.status}]`).join(', ')}`;
}

async function describeDocuments() {
  const docs = await sbFetch('documents?select=name,category,linked_team&order=created_at.desc&limit=5');
  let out = `KNOWLEDGE LIBRARY — your uploaded documents.\n\nRecent:\n`;
  for (const d of (docs || [])) out += `  • ${d.name}${d.category ? ` [${d.category}]` : ''}${d.linked_team ? ` — ${d.linked_team}` : ''}\n`;
  return out;
}
