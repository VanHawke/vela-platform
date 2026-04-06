// api/agents/data.js — Data Agent
// All CRM read operations: search, analytics, pipeline, news, partnerships, activities.
// No Claude call needed — pure data handler/dispatcher.
import { sbFetch } from '../kiko-tools.js';

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// ── Format Helpers ──
function fmtContact(c) {
  const d = c.data || c;
  return `• ${d.firstName || ''} ${d.lastName || ''} — ${d.title || 'No title'}${d.company ? ` @ ${d.company}` : ''}${d.email ? ` | ${d.email}` : ''}${d.linkedin ? ' | LinkedIn ✓' : ''}`;
}
function fmtCompany(c) {
  const d = c.data || c;
  return `• ${d.name || 'Unknown'} — ${d.industry || '?'}${d.country ? ` | ${d.country}` : ''}${d.lastRound ? ` | ${d.lastRound}` : ''}${d.totalFunding ? ` (${d.totalFunding} total)` : ''}${d.employees ? ` | ${d.employees} emp` : ''}`;
}
function fmtDeal(d) {
  const data = d.data || d;
  return `• ${data.company || data.title} — ${data.pipeline || '?'} → ${data.stage || '?'}${data.contactName ? ` | ${data.contactName}` : ''}${data.lastActivity ? ` | Last: ${new Date(data.lastActivity).toLocaleDateString('en-GB')}` : ''}`;
}

// ── Handlers ──
async function searchContacts({ query, limit = 10 }) {
  const q = (query || '').trim();
  if (!q) return 'Please specify a contact name, company, or title to search.';
  const data = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*,data->>company.ilike.*${q}*,data->>title.ilike.*${q}*,data->>email.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`);
  if (!data?.length) return `No contacts found matching "${q}".`;
  return `Found ${data.length} contact${data.length > 1 ? 's' : ''} matching "${q}":\n${data.map(fmtContact).join('\n')}`;
}

async function searchCompanies({ query, limit = 10 }) {
  const q = (query || '').trim();
  if (!q) return 'Please specify a company name, industry, or country to search.';
  const data = await sbFetch(`companies?select=id,data&or=(data->>name.ilike.*${q}*,data->>industry.ilike.*${q}*,data->>country.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`);
  if (!data?.length) return `No companies found matching "${q}".`;
  return `Found ${data.length} compan${data.length > 1 ? 'ies' : 'y'} matching "${q}":\n${data.map(fmtCompany).join('\n')}`;
}

async function searchDeals({ query, pipeline, stage, limit = 15 }) {
  let path = `deals?select=id,data&order=updated_at.desc&limit=${limit}`;
  if (pipeline) path += `&data->>pipeline=eq.${pipeline}`;
  if (stage) path += `&data->>stage=eq.${stage}`;
  const data = await sbFetch(path);
  let results = data || [];
  if (query) { const q = query.toLowerCase(); results = results.filter(d => JSON.stringify(d.data || {}).toLowerCase().includes(q)); }
  if (!results.length) return `No deals found${query ? ` matching "${query}"` : ''}${pipeline ? ` in ${pipeline}` : ''}${stage ? ` at ${stage}` : ''}.`;
  const byStage = {}; results.forEach(d => { const s = d.data?.stage || 'Unknown'; byStage[s] = (byStage[s] || 0) + 1; });
  const summary = Object.entries(byStage).map(([s, c]) => `${s}: ${c}`).join(', ');
  return `Found ${results.length} deal${results.length > 1 ? 's' : ''} (${summary}):\n${results.map(fmtDeal).join('\n')}`;
}

async function getEntityDetail({ entity_type, id, name: entityName }) {
  try {
    if (entity_type === 'contact') {
      let row;
      if (id) { const res = await sbFetch(`contacts?id=eq.${id}&select=id,data&limit=1`); row = res?.[0]; }
      else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*)&limit=1`); row = res?.[0]; }
      if (!row) return 'Contact not found.';
      const d = row.data || {};
      const acts = await sbFetch(`contact_activities?contact_id=eq.${row.id}&select=type,campaign_name,created_at&order=created_at.desc&limit=5`);
      let dealInfo = '';
      if (d.company) {
        const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.company)}&limit=3`);
        if (deals?.length) dealInfo = deals.map(dl => `  ${dl.data.pipeline} → ${dl.data.stage}`).join('\n');
      }
      let out = `CONTACT: ${d.firstName || ''} ${d.lastName || ''}\nTitle: ${d.title || '—'}\nCompany: ${d.company || '—'}\nEmail: ${d.email || '—'}\nLinkedIn: ${d.linkedin ? 'Yes' : 'No'}\nPhone: ${d.phone || '—'}\n`;
      if (d.lemlistCampaigns?.length) out += `Campaigns: ${d.lemlistCampaigns.map(c => c.name).join(', ')}\n`;
      if (acts?.length) out += `Recent Activity:\n${acts.map(a => `  ${a.type} — ${a.campaign_name || ''} (${new Date(a.created_at).toLocaleDateString('en-GB')})`).join('\n')}\n`;
      if (dealInfo) out += `Deal Pipeline:\n${dealInfo}\n`;
      return out;
    }
    if (entity_type === 'company') {
      let row;
      if (id) { const res = await sbFetch(`companies?id=eq.${id}&select=id,data&limit=1`); row = res?.[0]; }
      else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`companies?select=id,data&data->>name=ilike.*${q}*&limit=1`); row = res?.[0]; }
      if (!row) return 'Company not found.';
      const d = row.data || {};
      const contacts = await sbFetch(`contacts?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=10&order=updated_at.desc`);
      const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=5`);
      let out = `COMPANY: ${d.name}\nIndustry: ${d.industry || '—'}\nCountry: ${d.country || '—'}\nWebsite: ${d.website || '—'}\n`;
      if (d.lastRound) out += `Last Round: ${d.lastRound}\n`;
      if (d.totalFunding) out += `Total Funding: ${d.totalFunding}\n`;
      if (d.valuation) out += `Valuation: ${d.valuation}\n`;
      if (d.employees) out += `Employees: ${d.employees}\n`;
      if (d.revenueEst) out += `Revenue Est: ${d.revenueEst}\n`;
      if (contacts?.length) out += `Key Contacts (${contacts.length}):\n${contacts.slice(0, 5).map(c => `  ${c.data.firstName} ${c.data.lastName || ''} — ${c.data.title || '?'}`).join('\n')}\n`;
      if (deals?.length) out += `Deals:\n${deals.map(dl => `  ${dl.data.pipeline} → ${dl.data.stage}${dl.data.contactName ? ` (${dl.data.contactName})` : ''}`).join('\n')}\n`;
      return out;
    }
    if (entity_type === 'deal') {
      let row;
      if (id) { const res = await sbFetch(`deals?id=eq.${id}&select=id,data&limit=1`); row = res?.[0]; }
      else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`deals?select=id,data&data->>company=ilike.*${q}*&limit=1`); row = res?.[0]; }
      if (!row) return 'Deal not found.';
      const d = row.data || {};
      return `DEAL: ${d.company || d.title}\nPipeline: ${d.pipeline || '—'}\nStage: ${d.stage || '—'}\nContact: ${d.contactName || '—'}\nOwner: ${d.owner || '—'}\nLast Activity: ${d.lastActivity ? new Date(d.lastActivity).toLocaleDateString('en-GB') : '—'}\nStatus: ${d.status || '—'}\n`;
    }
    return `Unknown entity type: ${entity_type}`;
  } catch(e) { return `Error fetching ${entity_type}: ${e.message}`; }
}

async function getAlerts() {
  const alerts = await sbFetch('kiko_alerts?dismissed=eq.false&expires_at=gt.' + new Date().toISOString() + '&select=type,severity,title,detail,entity_name&order=created_at.desc&limit=10');
  if (!alerts?.length) return 'No active alerts. Pipeline is clean.';
  return `${alerts.length} active alert${alerts.length > 1 ? 's' : ''}:\n${alerts.map(a => `[${a.severity?.toUpperCase()}] ${a.title}\n  ${a.detail}`).join('\n\n')}`;
}

async function getStaleContacts({ min_staleness = 40 }, userEmail) {
  const scores = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&staleness_score=gte.${min_staleness}&order=staleness_score.desc&limit=15`);
  if (!scores?.length) return 'No stale contacts found. All relationships are healthy.';
  let out = `${scores.length} contacts need follow-up:\n`;
  for (const s of scores) {
    out += `\n• ${s.contact_name || s.contact_email}${s.company ? ` (${s.company})` : ''}\n`;
    out += `  Health: ${s.relationship_health}/100 | Staleness: ${s.staleness_score}/100 | Momentum: ${s.momentum}\n`;
    out += `  Last contact: ${s.days_since_last_contact} days ago | Emails: ${s.total_emails}\n`;
    if (s.followup_reason) out += `  → ${s.followup_reason}\n`;
  }
  return out;
}

async function getNews({ category, company, deals_only }) {
  let filter = 'is_processed=eq.true&order=published_at.desc&limit=15';
  if (category && category !== 'all') filter += `&category=eq.${category}`;
  if (deals_only) filter += '&deal_signal=eq.true';
  let articles = await sbFetch(`news_articles?${filter}&select=title,source_name,article_url,published_at,category,relevance_score,deal_signal,matched_companies,key_topics`);
  if (company && articles?.length) {
    const q = company.toLowerCase();
    articles = articles.filter(a => a.title?.toLowerCase().includes(q) || (a.matched_companies || []).some(c => (c.name || c).toLowerCase().includes(q)) || (a.key_topics || []).some(t => t.toLowerCase().includes(q)));
  }
  if (!articles?.length) return `No news found${category ? ` in ${category}` : ''}${company ? ` about "${company}"` : ''}.`;
  let out = `${articles.length} article${articles.length > 1 ? 's' : ''}${company ? ` mentioning "${company}"` : ''}:\n`;
  for (const a of articles.slice(0, 10)) {
    const ago = Math.floor((Date.now() - new Date(a.published_at)) / 3600000);
    const timeStr = ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`;
    out += `\n• ${a.title} (${a.source_name}, ${timeStr})`;
    if (a.deal_signal) out += ' 🔴 DEAL SIGNAL';
    if (a.matched_companies?.length) out += ` — ${a.matched_companies.map(c => c.name || c).join(', ')}`;
    out += `\n  ${a.article_url}\n`;
  }
  return out;
}

async function getPartnershipMatrix({ team, category, gaps_only }) {
  const teams = await sbFetch('f1_teams?order=sort_order&select=id,name,full_name,engine,color');
  const categories = await sbFetch('sponsor_categories?order=sort_order&select=id,name');
  const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier');
  if (!teams?.length) return 'Partnership matrix data not loaded.';
  let filteredTeams = teams;
  if (team) filteredTeams = teams.filter(t => t.name.toLowerCase().includes(team.toLowerCase()) || t.id.includes(team.toLowerCase()));
  let filteredCats = categories || [];
  if (category) filteredCats = filteredCats.filter(c => c.name.toLowerCase().includes(category.toLowerCase()));
  let out = '';
  for (const t of filteredTeams) {
    const teamPartners = (partnerships || []).filter(p => p.team_id === t.id);
    const filledCats = new Set(teamPartners.map(p => p.category_id));
    const gaps = filteredCats.filter(c => !filledCats.has(c.id));
    if (gaps_only && !gaps.length) continue;
    out += `\n**${t.name}** (${t.full_name || ''}) — ${teamPartners.length} partners\n`;
    if (!gaps_only) {
      for (const c of filteredCats) {
        const cp = teamPartners.filter(p => p.category_id === c.id);
        out += cp.length ? `  ✅ ${c.name}: ${cp.map(p => `${p.partner_name} [${p.tier}]`).join(', ')}\n` : `  ❌ ${c.name}: GAP\n`;
      }
    } else { out += `  Gaps: ${gaps.map(g => g.name).join(', ')}\n`; }
  }
  if (!out) return gaps_only ? 'No gaps found.' : 'No matching teams or categories.';
  const totalGaps = filteredTeams.reduce((acc, t) => {
    const filled = new Set((partnerships || []).filter(p => p.team_id === t.id).map(p => p.category_id));
    return acc + filteredCats.filter(c => !filled.has(c.id)).length;
  }, 0);
  return `F1 PARTNERSHIP MATRIX${team ? ` — ${team}` : ''}${category ? ` — ${category}` : ''}\n${filteredTeams.length} teams, ${(partnerships||[]).length} active partnerships, ${totalGaps} gaps\n${out}`;
}

async function getPipelineNotifications({ unread_only }) {
  const unreadFilter = unread_only ? '&is_read=eq.false' : '';
  const notifs = await sbFetch(`pipeline_notifications?is_dismissed=eq.false${unreadFilter}&order=created_at.desc&limit=15`);
  if (!notifs?.length) return 'No pipeline notifications.';
  const unread = notifs.filter(n => !n.is_read).length;
  let out = `PIPELINE ACTIVITY — ${notifs.length} notifications (${unread} unread)\n\n`;
  for (const n of notifs) {
    const icon = n.type === 'reply' ? '💬' : n.type === 'interested' ? '✅' : n.type === 'stage_change' ? '📈' : '📧';
    out += `${icon} ${n.title}${n.is_read ? '' : ' 🔴'}\n   ${n.body || ''}\n   ${n.pipeline || ''}${n.stage ? ' → ' + n.stage : ''} · ${n.source || ''}\n\n`;
  }
  return out;
}

async function getDealHistory({ company }) {
  const deals = await sbFetch(`deals?select=id,data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=5`);
  if (!deals?.length) return `No deals found for "${company}".`;
  let out = `DEAL HISTORY FOR "${company}":\n\n`;
  for (const deal of deals) {
    const d = deal.data || {};
    out += `📋 ${d.company || d.title} — Current: ${d.stage} (${d.pipeline})\n`;
    const history = await sbFetch(`deal_stage_history?deal_id=eq.${deal.id}&order=changed_at.desc&limit=20`);
    if (history?.length) {
      out += `   Changes (${history.length}):\n`;
      for (const h of history) {
        const date = new Date(h.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        out += `   ${date}: ${h.from_stage || '(new)'} → ${h.to_stage}\n`;
      }
    } else out += '   No stage changes recorded.\n';
    out += '\n';
  }
  return out;
}

async function getActivityFeed({ limit = 15, type_filter }) {
  let url = `activities?select=*&order=created_at.desc&limit=${Math.min(limit, 30)}`;
  if (type_filter) url += `&type=eq.${type_filter}`;
  const rows = await sbFetch(url);
  if (!rows?.length) return 'No activities found.';
  let out = `ACTIVITY FEED (${rows.length}):\n\n`;
  for (const a of rows) {
    const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    out += `${date} — [${a.type}] ${a.entity_name || ''}: ${a.subject || a.body?.slice(0, 80) || ''}\n`;
  }
  return out;
}

async function getEmailAnalytics({ query }, userEmail) {
  const q = query || '';
  const scores = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&or=(contact_email.ilike.*${encodeURIComponent(q)}*,contact_name.ilike.*${encodeURIComponent(q)}*,company.ilike.*${encodeURIComponent(q)}*)&limit=5`);
  if (!scores?.length) return `No email intelligence for "${q}".`;
  const s = scores[0];
  let out = `EMAIL INTELLIGENCE: ${s.contact_name || s.contact_email}\n`;
  out += `Total emails: ${s.total_emails} (Sent: ${s.sent_count} | Received: ${s.received_count})\n`;
  out += `Last contact: ${s.days_since_last_contact} days ago\nRelationship health: ${s.relationship_health}/100\n`;
  out += `Engagement: ${s.engagement_score}/100 | Momentum: ${s.momentum} | Tone: ${s.tone_trend}\n`;
  if (s.staleness_score > 40) out += `⚠️ STALE (${s.staleness_score}/100) — ${s.followup_reason || 'Follow-up recommended'}\n`;
  if (s.next_followup_recommended) out += `Next follow-up: ${new Date(s.next_followup_recommended).toLocaleDateString('en-GB')}\n`;
  return out;
}

async function getOutreachIntelligence({ focus = 'patterns', company, pipeline }) {
  let path = 'outreach_scores?order=sent_at.desc&limit=200';
  if (company) path += `&company=ilike.*${encodeURIComponent(company)}*`;
  if (pipeline) path += `&pipeline=eq.${encodeURIComponent(pipeline)}`;
  const scores = await sbFetch(path);
  if (!scores?.length) return 'No outreach scores yet. The scoring engine runs daily.';
  const total = scores.length;
  const replied = scores.filter(s => s.outcome === 'replied');
  const replyRate = total > 0 ? Math.round(replied.length / total * 100) : 0;
  if (focus === 'patterns' || focus === 'recommendations') {
    const byApproach = {};
    scores.forEach(s => { const a = s.messaging_approach || 'unknown'; if (!byApproach[a]) byApproach[a] = { total: 0, replied: 0 }; byApproach[a].total++; if (s.outcome === 'replied') byApproach[a].replied++; });
    return `OUTREACH INTELLIGENCE — ${total} emails scored\nReply rate: ${replyRate}%\n\nBy approach:\n${Object.entries(byApproach).map(([a, d]) => `${a}: ${d.replied}/${d.total} (${Math.round(d.replied / d.total * 100)}%)`).join('\n')}`;
  }
  if (focus === 'timing') {
    const byDay = {};
    scores.forEach(s => { const d = s.sent_day_of_week || 'Unknown'; if (!byDay[d]) byDay[d] = { total: 0, replied: 0 }; byDay[d].total++; if (s.outcome === 'replied') byDay[d].replied++; });
    return `SEND TIMING\n\n${Object.entries(byDay).map(([d, v]) => `${d}: ${v.replied}/${v.total} (${Math.round(v.replied / v.total * 100)}%)`).join('\n')}`;
  }
  if (focus === 'race_windows') {
    const races = await sbFetch(`race_calendar?date=gt.${new Date().toISOString().split('T')[0]}&order=date&limit=6&select=name,date,circuit,series`);
    const deals = await sbFetch(`deals?select=data&data->>status=eq.active&limit=200`);
    const now = new Date();
    const raceData = (races || []).map(r => {
      const daysTo = Math.ceil((new Date(r.date) - now) / 86400000);
      const urgency = daysTo <= 14 ? '🔴 CRITICAL' : daysTo <= 30 ? '🟡 HIGH' : '🟢 NORMAL';
      return { name: r.name, series: r.series, date: r.date, daysTo, urgency };
    });
    const staleDeals = (deals || []).filter(d => {
      const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : null;
      return last && (now - last) > 14 * 86400000;
    }).map(d => ({ company: d.data?.company, daysSince: Math.floor((now - new Date(d.data.lastActivity)) / 86400000), stage: d.data?.stage, contact: d.data?.contactName }));
    let out = `RACE WINDOW INTELLIGENCE\n\nUpcoming races:\n`;
    for (const r of raceData) out += `${r.urgency} ${r.series} ${r.name} — ${r.daysTo}d (${r.date})\n`;
    if (staleDeals.length) {
      out += `\n⚠️ ${staleDeals.length} DEALS STALE >14 DAYS (need contact before next race):\n`;
      for (const d of staleDeals.slice(0, 15)) out += `• ${d.company} — ${d.daysSince}d silent, stage: ${d.stage}, contact: ${d.contact || 'unknown'}\n`;
    }
    out += `\nOUTREACH DOCTRINE: Ideal contact window is 21-28 days before race weekend. <14 days = last chance. Emails sent during race week get buried.`;
    return out;
  }
  return `Outreach data: ${total} scored, ${replyRate}% reply rate. Ask about "patterns", "timing", "race_windows", "persona", or "company".`;
}

async function searchDocuments({ query, team, category }) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  let filter = 'select=id,name,linked_team,category,intelligence,summary,content&limit=8&order=created_at.desc';
  if (words.length) filter = words.map(w => `content.ilike.*${encodeURIComponent(w)}*`).join('&') + `&${filter}`;
  if (team) filter += `&linked_team=ilike.*${encodeURIComponent(team)}*`;
  if (category) filter += `&category=eq.${encodeURIComponent(category)}`;
  const docs = await sbFetch(`documents?${filter}`);
  if (!docs?.length) return `No documents found matching "${query}".`;
  let out = `DOCUMENT SEARCH: "${query}" — ${docs.length} found\n\n`;
  for (const doc of docs) {
    out += `📄 ${doc.name}${doc.linked_team ? ` (${doc.linked_team})` : ''}${doc.category ? ` [${doc.category}]` : ''}\n`;
    const intel = doc.intelligence || {};
    if (intel.key_stats?.length) out += `   Stats: ${intel.key_stats.join(', ')}\n`;
    if (intel.talking_points?.length) out += `   Talking points: ${intel.talking_points.join(', ')}\n`;
    if (doc.summary) out += `   Summary: ${doc.summary}\n`;
    out += '\n';
  }
  return out;
}

async function searchPastConversations({ query, limit = 5 }) {
  const allConvos = await sbFetch('conversations?select=id,title,messages,updated_at,bookmarked&order=updated_at.desc&limit=50');
  if (!allConvos?.length) return 'No past conversations found.';
  const qLower = (query || '').toLowerCase();
  const keywords = qLower.split(/\s+/).filter(w => w.length > 2);
  const scored = allConvos.map(conv => {
    const titleText = (conv.title || '').toLowerCase();
    const msgText = JSON.stringify(conv.messages || []).toLowerCase();
    let score = conv.bookmarked ? 5 : 0;
    for (const kw of keywords) { if (titleText.includes(kw)) score += 3; if (msgText.includes(kw)) score += 1; }
    return { ...conv, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  if (!scored.length) return `No past conversations matching "${query}".`;
  let out = `PAST CONVERSATIONS matching "${query}" (${scored.length} found):\n\n`;
  for (const r of scored) {
    const date = new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    out += `─── "${r.title || 'Untitled'}" (${date}, ${(r.messages || []).length} messages) ───\n`;
    const msgs = r.messages || [];
    const relevant = msgs.filter(m => (m.content || '').toLowerCase().includes(qLower));
    const toShow = relevant.length > 0 ? relevant.slice(0, 3) : msgs.slice(0, 3);
    for (const m of toShow) out += `  ${m.role === 'user' ? 'Sunny' : 'Kiko'}: ${(m.content || '').slice(0, 250)}\n`;
    out += '\n';
  }
  return out;
}

async function getRecentConversations({ limit = 5 }) {
  const rows = await sbFetch(`conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=${Math.min(limit, 10)}`);
  if (!rows?.length) return 'No conversations found.';
  let out = `RECENT CONVERSATIONS (${rows.length}):\n\n`;
  for (const r of rows) {
    const date = new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const firstUser = (r.messages || []).find(m => m.role === 'user');
    out += `• "${r.title || 'Untitled'}" (${date}, ${(r.messages || []).length} msgs)\n`;
    if (firstUser) out += `  You asked: "${(firstUser.content || '').slice(0, 120)}"\n`;
    out += '\n';
  }
  return out;
}

async function searchLearningLog({ query, category }) {
  let url = 'kiko_learning_log?select=*&order=created_at.desc&limit=20';
  if (category) url += `&category=eq.${category}`;
  const rows = await sbFetch(url);
  if (!rows?.length) return `No learning log entries found.`;
  const matches = query ? rows.filter(r => r.content?.toLowerCase().includes(query.toLowerCase()) || r.entity_name?.toLowerCase().includes(query.toLowerCase())) : rows;
  if (!matches.length) return `No entries matching "${query}".`;
  let out = `LEARNING LOG (${matches.length} matches):\n\n`;
  for (const r of matches.slice(0, 10)) {
    const date = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    out += `[${r.category}] ${date}${r.entity_name ? ` — ${r.entity_name}` : ''}: ${r.content}\n`;
  }
  return out;
}

async function saveLearning({ category, content, entity_name }) {
  await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ org_id: ORG_ID, category, content, entity_name: entity_name || null }) });
  return `✅ Saved: [${category}]${entity_name ? ` ${entity_name}:` : ''} ${content}`;
}

async function getSkills() {
  const skills = await sbFetch('kiko_skills?is_active=eq.true&select=name,category,trigger_keywords');
  if (!skills?.length) return 'No skills loaded.';
  return 'KIKO EXPERTISE:\n\n' + skills.map(s => `• ${s.name} (${s.category}) — ${(s.trigger_keywords || []).join(', ')}`).join('\n');
}

async function bookmarkConversation({ reason }) {
  const convs = await sbFetch('conversations?select=id,title&order=updated_at.desc&limit=1');
  if (!convs?.length) return 'No conversation found to bookmark.';
  await sbFetch(`conversations?id=eq.${convs[0].id}`, { method: 'PATCH', body: JSON.stringify({ bookmarked: true, bookmark_reason: reason || 'Bookmarked' }) });
  return `✅ Bookmarked "${convs[0].title}".`;
}

async function getOutreachTiming({ company, contact_email }, userEmail) {
  let url = 'outreach_scores?select=sent_day_of_week,sent_hour,outcome,company,recipient_email&order=sent_at.desc&limit=200';
  if (company) url += `&company=ilike.*${company}*`;
  if (contact_email) url += `&recipient_email=eq.${contact_email}`;
  const rows = await sbFetch(url);
  if (!rows?.length) return `No outreach data found${company ? ` for "${company}"` : ''}.`;
  const byDay = {};
  rows.forEach(r => { const d = r.sent_day_of_week || 'Unknown'; if (!byDay[d]) byDay[d] = { total: 0, replied: 0 }; byDay[d].total++; if (r.outcome === 'replied') byDay[d].replied++; });
  const bestDay = Object.entries(byDay).filter(([,v]) => v.total >= 2).sort((a,b) => (b[1].replied/b[1].total) - (a[1].replied/a[1].total))[0];
  let out = `OUTREACH TIMING${company ? ` — ${company}` : ''} (${rows.length} emails):\n\n`;
  const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  dayOrder.forEach(d => { const data = byDay[d]; if (data) out += `  ${d}: ${data.total} sent, ${data.replied} replied (${data.total > 0 ? Math.round(data.replied/data.total*100) : 0}%)\n`; });
  if (bestDay) out += `\nBest day: ${bestDay[0]} (${Math.round(bestDay[1].replied/bestDay[1].total*100)}% reply rate)`;
  return out;
}

// ── Warm Path Finder — who do we know that connects us to a target? ──
async function findWarmPath({ company, person }) {
  const target = (company || person || '').toLowerCase();
  if (!target) return 'Error: provide company or person name';
  try {
    // 1. Check direct contacts at the target company
    const directContacts = await sbFetch(`contacts?select=data&or=(data->>company.ilike.*${encodeURIComponent(target)}*)&limit=5`);
    // 2. Check relationships with anyone at that company
    const relationships = await sbFetch(`kiko_relationships?select=contact_name,company,warmth_score,last_contact&company=ilike.*${encodeURIComponent(target)}*&order=warmth_score.desc&limit=5`);
    // 3. Check all warm contacts (warmth > 6) who might know someone
    const warmContacts = await sbFetch('kiko_relationships?warmth_score=gte.6&order=warmth_score.desc&limit=20&select=contact_name,company,warmth_score');
    // 4. Check deal history
    const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(target)}*&limit=3`);

    let out = `WARM PATH ANALYSIS: ${company || person}\n\n`;

    if (directContacts?.length) {
      out += `🟢 DIRECT CONTACTS (${directContacts.length}):\n`;
      for (const c of directContacts) {
        const d = c.data || {};
        out += `• ${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} | ${d.email || ''}\n`;
      }
    } else { out += '🔴 No direct contacts at this company.\n'; }

    if (relationships?.length) {
      out += `\n📊 RELATIONSHIP STRENGTH:\n`;
      for (const r of relationships) out += `• ${r.contact_name} — warmth: ${r.warmth_score}/10, last: ${r.last_contact ? new Date(r.last_contact).toLocaleDateString('en-GB') : '?'}\n`;
    }

    if (deals?.length) {
      out += `\n📋 DEAL HISTORY:\n`;
      for (const d of deals) out += `• ${d.data?.company} — ${d.data?.stage} ($${d.data?.value || '?'})\n`;
    }

    // Find potential connectors — warm contacts at related companies
    if (!directContacts?.length && warmContacts?.length) {
      out += `\n🔗 POTENTIAL CONNECTORS (warm contacts who might know someone):\n`;
      for (const w of warmContacts.slice(0, 8)) {
        out += `• ${w.contact_name} @ ${w.company} (warmth: ${w.warmth_score}/10)\n`;
      }
    }
    return out;
  } catch (e) { return `Warm path error: ${e.message}`; }
}

// ── Win/Loss Insights ──
async function getWinLossInsights({ company }) {
  try {
    const filter = company ? `kiko_win_loss_analysis?company=ilike.*${encodeURIComponent(company)}*&order=created_at.desc&limit=10` : 'kiko_win_loss_analysis?order=created_at.desc&limit=10';
    const analyses = await sbFetch(filter + '&select=company,outcome,value,analysis,key_factors,lessons');
    if (!analyses?.length) return company ? `No win/loss data for "${company}".` : 'No win/loss analyses yet. They are auto-generated when deals move to Won or Lost.';
    let out = `WIN/LOSS ANALYSIS${company ? ` — ${company}` : ''} (${analyses.length} deals):\n\n`;
    const wins = analyses.filter(a => a.outcome === 'won');
    const losses = analyses.filter(a => a.outcome === 'lost');
    out += `Record: ${wins.length} won, ${losses.length} lost\n`;
    if (wins.length) out += `Win value: $${wins.reduce((s, w) => s + (w.value || 0), 0).toLocaleString()}\n`;
    out += '\n';
    for (const a of analyses) {
      out += `${a.outcome === 'won' ? '🟢' : '🔴'} ${a.company} ($${a.value?.toLocaleString() || '?'}): ${a.analysis || ''}\n`;
      if (a.lessons?.length) out += `  Lessons: ${a.lessons.join('; ')}\n`;
    }
    return out;
  } catch (e) { return `Win/loss error: ${e.message}`; }
}

// ── Thread History — cross-session entity tracking ──
async function getThreadHistory({ entity, company }) {
  const target = entity || company;
  if (!target) return 'Error: provide entity or company name';
  try {
    const threads = await sbFetch(`kiko_thread_tracker?entity_name=ilike.*${encodeURIComponent(target)}*&order=last_discussed_at.desc&limit=5&select=*`);
    if (!threads?.length) return `No conversation threads found for "${target}".`;
    let out = `THREAD HISTORY: ${target}\n\n`;
    for (const t of threads) {
      out += `📍 ${t.entity_name} (${t.entity_type}) — discussed ${t.discussion_count}x\n`;
      out += `   First: ${new Date(t.first_discussed_at).toLocaleDateString('en-GB')} | Last: ${new Date(t.last_discussed_at).toLocaleDateString('en-GB')}\n`;
      if (t.thread_summary) out += `   Summary: ${t.thread_summary.slice(0, 200)}\n`;
      if (t.key_decisions?.length) out += `   Decisions: ${t.key_decisions.join('; ')}\n`;
      if (t.open_questions?.length) out += `   Open: ${t.open_questions.join('; ')}\n`;
      out += `   Status: ${t.status}\n\n`;
    }
    return out;
  } catch (e) { return `Thread history error: ${e.message}`; }
}

// ── Deal Prediction — score deals by closure likelihood ──
async function predictDealOutcomes() {
  try {
    const deals = await sbFetch('deals?select=id,data,updated_at&data->>status=eq.active&limit=100');
    if (!deals?.length) return 'No active deals to score.';
    const now = new Date();
    const stageProb = { 'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20, 'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50, 'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90, 'Contract Review': 0.95 };
    
    // Get win/loss patterns
    const winLoss = await sbFetch('kiko_win_loss_analysis?select=key_factors,outcome&limit=20');
    const winFactors = (winLoss || []).filter(w => w.outcome === 'won').flatMap(w => w.key_factors || []);
    
    const scored = deals.map(d => {
      const dd = d.data || {};
      const stageScore = stageProb[dd.stage] || 0.15;
      const daysSinceUpdate = Math.floor((now - new Date(d.updated_at)) / 86400000);
      const freshnessScore = daysSinceUpdate < 7 ? 1.0 : daysSinceUpdate < 14 ? 0.7 : daysSinceUpdate < 30 ? 0.4 : 0.1;
      const valueScore = (dd.value || 0) > 100000 ? 1.0 : (dd.value || 0) > 50000 ? 0.8 : 0.5;
      const composite = (stageScore * 0.5 + freshnessScore * 0.3 + valueScore * 0.2);
      return { company: dd.company, stage: dd.stage, value: dd.value, daysSinceUpdate, score: Math.round(composite * 100), pipeline: dd.pipeline };
    });
    scored.sort((a, b) => b.score - a.score);
    
    let out = `DEAL PREDICTION (${scored.length} active deals scored):\n\n`;
    out += `🟢 HIGH PROBABILITY (>60%):\n`;
    for (const d of scored.filter(s => s.score > 60)) out += `  ${d.company} — ${d.stage} ($${d.value?.toLocaleString() || '?'}) — ${d.score}% | ${d.daysSinceUpdate}d stale\n`;
    out += `\n🟡 MEDIUM (30-60%):\n`;
    for (const d of scored.filter(s => s.score >= 30 && s.score <= 60).slice(0, 10)) out += `  ${d.company} — ${d.stage} ($${d.value?.toLocaleString() || '?'}) — ${d.score}% | ${d.daysSinceUpdate}d stale\n`;
    out += `\n🔴 LOW (<30%):\n`;
    const low = scored.filter(s => s.score < 30);
    out += `  ${low.length} deals at low probability\n`;
    
    // Weighted pipeline value
    const weighted = scored.reduce((s, d) => s + (d.value || 0) * d.score / 100, 0);
    out += `\n💰 WEIGHTED PIPELINE: $${Math.round(weighted).toLocaleString()} (vs $${scored.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()} total)\n`;
    if (winFactors.length) out += `\n📈 Winning factors from past deals: ${[...new Set(winFactors)].slice(0, 5).join('; ')}`;
    return out;
  } catch (e) { return `Deal prediction error: ${e.message}`; }
}

// ── Partnership Matrix Refresh — on-demand update via web search ──
async function refreshTeamPartnerships(params) {
  try {
    const teamQuery = (params.team || params.query || '').toLowerCase();
    if (!teamQuery) return 'Please specify a team: e.g. "refresh partnerships for Haas"';
    
    const TEAM_MAP = {
      'red bull': 'red_bull', 'redbull': 'red_bull', 'ferrari': 'ferrari', 'mclaren': 'mclaren',
      'mercedes': 'mercedes', 'aston martin': 'aston_martin', 'aston': 'aston_martin',
      'alpine': 'alpine', 'williams': 'williams', 'haas': 'haas',
      'racing bulls': 'racing_bulls', 'rb': 'racing_bulls', 'audi': 'audi', 'cadillac': 'cadillac',
    };
    const teamId = TEAM_MAP[teamQuery] || teamQuery;
    const teamName = Object.entries(TEAM_MAP).find(([, v]) => v === teamId)?.[0] || teamId;

    // Get current partnerships for this team
    const current = await sbFetch(`f1_partnerships?team_id=eq.${teamId}&status=eq.active&select=partner_name,category_id,tier`);
    const currentNames = new Set((current || []).map(p => p.partner_name.toLowerCase()));

    // Use Anthropic to research current partnerships
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for the CURRENT 2025-2026 F1 sponsors and partners for ${teamName} F1 team. I need an accurate, comprehensive list.

For each partner, provide:
- partner_name: Official company/brand name
- category: One of: fintech, cloud, ai_data, cybersecurity, banking, energy, telecom, automotive, fashion, food_bev, watches, crypto, software, legal, hospitality, gaming, health, logistics, semiconductors, robotics
- tier: One of: title, principal, official, technical, partner, supplier

Respond with ONLY a JSON array. Example: [{"partner_name":"Toyota","category":"automotive","tier":"title"}]
Include ALL known sponsors — title, principal, official partners, technical partners, and suppliers.`
      }],
    });

    // Extract text from response (may have tool use blocks)
    let responseText = '';
    for (const block of res.content) {
      if (block.type === 'text') responseText += block.text;
    }

    // Parse partnerships from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return `Could not parse partnership data for ${teamName}. Raw response available but no structured JSON found.`;

    let partnerships;
    try { partnerships = JSON.parse(jsonMatch[0]); } catch { return `JSON parse error for ${teamName} partnerships.`; }
    if (!Array.isArray(partnerships) || !partnerships.length) return `No partnerships found for ${teamName}.`;

    // Upsert each partnership
    let added = 0, updated = 0;
    for (const p of partnerships) {
      if (!p.partner_name) continue;
      const isNew = !currentNames.has(p.partner_name.toLowerCase());
      await sbFetch('f1_partnerships', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          team_id: teamId,
          partner_name: p.partner_name,
          category_id: p.category || null,
          tier: p.tier || 'partner',
          status: 'active',
          verified: true,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (isNew) added++; else updated++;
    }

    let out = `PARTNERSHIP REFRESH: ${teamName.toUpperCase()}\n`;
    out += `Found ${partnerships.length} partners via web search.\n`;
    out += `• ${added} NEW partners added\n• ${updated} existing partners verified\n\n`;
    if (added > 0) {
      const newOnes = partnerships.filter(p => !currentNames.has(p.partner_name.toLowerCase()));
      out += `NEW:\n${newOnes.map(p => `  + ${p.partner_name} (${p.category || '?'}, ${p.tier || 'partner'})`).join('\n')}\n`;
    }
    return out;
  } catch (e) { return `Partnership refresh error: ${e.message}`; }
}

// ── Main Dispatch ──
// Called by Kiko Prime. Routes to the correct handler based on operation.
export async function callDataAgent(operation, params = {}, userEmail = 'sunny@vanhawke.com') {
  try {
    switch (operation) {
      case 'search_contacts': return await searchContacts(params);
      case 'search_companies': return await searchCompanies(params);
      case 'search_deals': return await searchDeals(params);
      case 'entity_detail': return await getEntityDetail(params);
      case 'alerts': return await getAlerts();
      case 'email_analytics': return await getEmailAnalytics(params, userEmail);
      case 'outreach_intelligence': return await getOutreachIntelligence(params);
      case 'stale_contacts': return await getStaleContacts(params, userEmail);
      case 'news': return await getNews(params);
      case 'partnership_matrix': return await getPartnershipMatrix(params);
      case 'pipeline_notifications': return await getPipelineNotifications(params);
      case 'deal_history': return await getDealHistory(params);
      case 'activity_feed': return await getActivityFeed(params);
      case 'search_documents': return await searchDocuments(params);
      case 'past_conversations': return await searchPastConversations(params);
      case 'recent_conversations': return await getRecentConversations(params);
      case 'learning_search': return await searchLearningLog(params);
      case 'learning_save': return await saveLearning(params);
      case 'skills': return await getSkills();
      case 'bookmark': return await bookmarkConversation(params);
      case 'outreach_timing': return await getOutreachTiming(params, userEmail);
      case 'warm_path': return await findWarmPath(params);
      case 'win_loss': return await getWinLossInsights(params);
      case 'thread_history': return await getThreadHistory(params);
      case 'deal_prediction': return await predictDealOutcomes();
      case 'company_intel': {
        const name = params?.company || params?.name;
        if (!name) {
          const all = await sbFetch('company_intelligence?select=company_name,industry,revenue_estimate,sponsorship_fit_score,enriched_at&order=enriched_at.desc&limit=20');
          return `ENRICHED COMPANIES (${(all||[]).length}):\n${(all||[]).map(c => `• ${c.company_name} — ${c.industry || '?'} | Rev: ${c.revenue_estimate || '?'} | Fit: ${c.sponsorship_fit_score || '?'}/100`).join('\n')}\n\nAsk about a specific company for full intelligence.`;
        }
        const intel = await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(name)}*&limit=1`);
        if (!intel?.length) return `No enriched intelligence for "${name}". The enrichment cron runs weekly — or ask me to research them now.`;
        const c = intel[0];
        return `COMPANY INTELLIGENCE: ${c.company_name}\n\nFunding: ${c.funding_total || '?'} (${c.last_funding_round || '?'}, ${c.last_funding_date || '?'})\nRevenue: ${c.revenue_estimate || '?'} | Employees: ${c.employee_count || '?'} (${c.employee_growth || '?'})\n\nLeadership:\n• CEO: ${c.ceo || '?'}\n• CTO: ${c.cto || '?'}\n• CMO: ${c.cmo || '?'}\n• CFO: ${c.cfo || '?'}\n• VP Marketing: ${c.vp_marketing || '?'}\n• VP Engineering: ${c.vp_engineering || '?'}\n\nBusiness: ${c.industry || '?'} / ${c.sub_sector || '?'} | Model: ${c.business_model || '?'}\nProducts: ${(c.key_products || []).join(', ') || '?'}\nCompetitors: ${(c.competitors || []).join(', ') || '?'}\nAcquisitions: ${(c.recent_acquisitions || []).join(', ') || 'none known'}\n\nSponsorship Readiness:\n• Existing: ${(c.existing_sponsorships || []).join(', ') || 'none known'}\n• Marketing budget: ${c.marketing_budget_signal || '?'}\n• Brand awareness: ${c.brand_awareness_signal || '?'}\n• F1 fit score: ${c.sponsorship_fit_score || '?'}/100\n\nEnriched: ${c.enriched_at ? new Date(c.enriched_at).toLocaleDateString('en-GB') : '?'} via ${c.enrichment_source || '?'}`;
      }
      case 'refresh_partnerships': return await refreshTeamPartnerships(params);
      case 'enrich_company': {
        const name = params?.company || params?.name;
        if (!name) return 'Please specify a company name to enrich.';
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
          const enrichRes = await client.messages.create({
            model: 'claude-sonnet-4-20250514', max_tokens: 1500,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: `Research "${name}" and return ONLY valid JSON: { "company_name": "${name}", "domain": "website", "funding_total": "$X", "last_funding_round": "Series X", "last_funding_date": "YYYY-MM-DD", "last_funding_amount": "$X", "revenue_estimate": "$X", "employee_count": "N", "employee_growth": "+X%", "ceo": "name", "cto": "name or null", "cmo": "name or null", "cfo": "name or null", "vp_marketing": "name or null", "vp_engineering": "name or null", "industry": "X", "sub_sector": "X", "business_model": "X", "key_products": [], "competitors": [], "recent_acquisitions": [], "existing_sponsorships": [], "marketing_budget_signal": "high/medium/low", "brand_awareness_signal": "high/medium/low", "sponsorship_fit_score": 0-100 }. Return ONLY JSON.` }]
          });
          const text = enrichRes.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
          const jsonMatch = text.replace(/```json\n?/g, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
          if (!jsonMatch) return `Could not parse enrichment data for "${name}".`;
          const intel = JSON.parse(jsonMatch[0]);
          const record = { company_name: intel.company_name || name, domain: intel.domain, funding_total: intel.funding_total, last_funding_round: intel.last_funding_round, last_funding_date: intel.last_funding_date, last_funding_amount: intel.last_funding_amount, revenue_estimate: intel.revenue_estimate, employee_count: intel.employee_count, employee_growth: intel.employee_growth, ceo: intel.ceo, cto: intel.cto, cmo: intel.cmo, cfo: intel.cfo, vp_marketing: intel.vp_marketing, vp_engineering: intel.vp_engineering, industry: intel.industry, sub_sector: intel.sub_sector, business_model: intel.business_model, key_products: intel.key_products || [], competitors: intel.competitors || [], recent_acquisitions: intel.recent_acquisitions || [], existing_sponsorships: intel.existing_sponsorships || [], marketing_budget_signal: intel.marketing_budget_signal, brand_awareness_signal: intel.brand_awareness_signal, sponsorship_fit_score: intel.sponsorship_fit_score, enriched_at: new Date().toISOString(), enrichment_source: 'manual_web_search', enrichment_quality: 'structured', needs_refresh: false };
          const existing = await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(name)}*&limit=1`);
          if (Array.isArray(existing) && existing.length) { await sbFetch(`company_intelligence?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify(record) }); }
          else { await sbFetch('company_intelligence', { method: 'POST', body: JSON.stringify(record) }); }
          return `✅ ENRICHED: ${intel.company_name || name}\nRevenue: ${intel.revenue_estimate || '?'} | Funding: ${intel.funding_total || '?'} (${intel.last_funding_round || '?'})\nEmployees: ${intel.employee_count || '?'} | CEO: ${intel.ceo || '?'} | CMO: ${intel.cmo || '?'}\nIndustry: ${intel.industry || '?'} / ${intel.sub_sector || '?'}\nF1 Fit: ${intel.sponsorship_fit_score || '?'}/100 | Marketing: ${intel.marketing_budget_signal || '?'}`;
        } catch (err) { return `Enrichment failed for "${name}": ${err.message}`; }
      }
      case 'start_sequence': {
        const company = params?.company;
        const contactEmail = params?.contact_email || params?.email;
        const contactName = params?.contact_name || params?.name;
        const sequenceName = params?.sequence;
        if (!company || !contactEmail) return 'Please provide company and contact_email to start a sequence.';
        // Find best matching sequence
        const seqs = await sbFetch('kiko_sequences?is_active=eq.true&select=*');
        const allSeqs = Array.isArray(seqs) ? seqs : [];
        let seq = sequenceName ? allSeqs.find(s => s.name.toLowerCase().includes(sequenceName.toLowerCase())) : allSeqs[0];
        if (!seq) return 'No active sequences found.';
        // Check duplicate enrollment
        const existing = await sbFetch(`kiko_sequence_enrollments?contact_email=eq.${encodeURIComponent(contactEmail)}&sequence_id=eq.${seq.id}&status=eq.active&limit=1`);
        if (existing?.length) return `${contactName || contactEmail} is already enrolled in "${seq.name}".`;
        // Get company intelligence
        const intel = await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(company)}*&limit=1`);
        const ci = intel?.[0] || {};
        const steps = seq.steps || [];
        const firstStep = steps[0];
        const nextSendAt = new Date(Date.now() + (firstStep?.delay_days || 0) * 86400000).toISOString();
        await sbFetch('kiko_sequence_enrollments', { method: 'POST', body: JSON.stringify({
          sequence_id: seq.id, contact_email: contactEmail, contact_name: contactName || null,
          company, company_intel: ci, current_step: 1, status: 'active', next_send_at: nextSendAt,
          personalisation: { revenue: ci.revenue_estimate, ceo: ci.ceo, cmo: ci.cmo, industry: ci.industry, sub_sector: ci.sub_sector }
        }) });
        return `✅ ENROLLED: ${contactName || contactEmail} at ${company} in "${seq.name}" (${steps.length} steps)\nFirst email scheduled for: ${new Date(nextSendAt).toLocaleDateString('en-GB')}\nSequence: ${steps.map(s => `Step ${s.step}: ${s.channel} (${s.approach})`).join(' → ')}`;
      }
      case 'sequence_status': {
        const enrollments = await sbFetch('kiko_sequence_enrollments?order=created_at.desc&limit=20&select=contact_name,company,status,current_step,next_send_at,sequence_id');
        const arr = Array.isArray(enrollments) ? enrollments : [];
        if (!arr.length) return 'No sequence enrollments found. Use start_sequence to enroll contacts.';
        const seqs = await sbFetch('kiko_sequences?select=id,name,steps');
        const seqMap = {};
        (Array.isArray(seqs) ? seqs : []).forEach(s => { seqMap[s.id] = s; });
        let out = `ACTIVE SEQUENCES (${arr.length} enrollments):\n\n`;
        for (const e of arr) {
          const seq = seqMap[e.sequence_id];
          const totalSteps = seq?.steps?.length || '?';
          out += `${e.status === 'active' ? '🟢' : e.status === 'replied' ? '✅' : e.status === 'bounced' ? '❌' : '⏸️'} ${e.contact_name || 'Unknown'} at ${e.company} — ${seq?.name || 'Unknown sequence'}\n`;
          out += `   Step ${e.current_step}/${totalSteps} | Status: ${e.status} | Next: ${e.next_send_at ? new Date(e.next_send_at).toLocaleDateString('en-GB') : 'n/a'}\n\n`;
        }
        return out;
      }
      case 'pause_sequence': case 'cancel_sequence': {
        const company = params?.company;
        const email = params?.contact_email || params?.email;
        if (!company && !email) return 'Please provide company or contact_email to pause/cancel.';
        const filter = email ? `contact_email=eq.${encodeURIComponent(email)}` : `company=ilike.*${encodeURIComponent(company)}*`;
        const enrollments = await sbFetch(`kiko_sequence_enrollments?${filter}&status=eq.active&limit=5`);
        if (!enrollments?.length) return `No active enrollments found for "${company || email}".`;
        const newStatus = operation === 'pause_sequence' ? 'paused' : 'cancelled';
        for (const e of enrollments) {
          await sbFetch(`kiko_sequence_enrollments?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
          await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${e.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
        }
        return `✅ ${newStatus === 'paused' ? 'Paused' : 'Cancelled'} ${enrollments.length} enrollment(s) for "${company || email}". All queued emails cancelled.`;
      }
      case 'linkedin_queue': {
        const pending = await sbFetch('kiko_linkedin_queue?status=eq.pending&order=priority.desc&limit=10&select=contact_name,company,message_type,message,context,priority');
        const arr = Array.isArray(pending) ? pending : [];
        if (!arr.length) return 'No pending LinkedIn messages. Enroll contacts in sequences with LinkedIn steps, or ask me to draft a LinkedIn message.';
        let out = `LINKEDIN QUEUE (${arr.length} pending):\n\n`;
        for (const m of arr) {
          out += `📱 ${m.contact_name} at ${m.company} (${m.message_type})\nPriority: ${'★'.repeat(Math.min(m.priority, 5))}\nMessage: "${m.message}"\nContext: ${m.context || 'n/a'}\n\n`;
        }
        out += `Say "I sent the LinkedIn message to [name]" to mark as sent.`;
        return out;
      }
      default: return `Unknown data operation: ${operation}. Available: search_contacts, search_companies, search_deals, entity_detail, alerts, email_analytics, outreach_intelligence, outreach_timing, stale_contacts, news, partnership_matrix, pipeline_notifications, deal_history, activity_feed, search_documents, past_conversations, recent_conversations, learning_search, learning_save, skills, bookmark, warm_path, win_loss, thread_history, deal_prediction, company_intel, enrich_company, start_sequence, sequence_status, pause_sequence, cancel_sequence, linkedin_queue`;
    }
  } catch (err) {
    return `Data Agent error (${operation}): ${err.message}`;
  }
}
