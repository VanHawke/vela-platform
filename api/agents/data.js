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
  return `Outreach data: ${total} scored, ${replyRate}% reply rate. Ask about "patterns", "timing", "persona", or "company".`;
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
      default: return `Unknown data operation: ${operation}. Available: search_contacts, search_companies, search_deals, entity_detail, alerts, email_analytics, outreach_intelligence, outreach_timing, stale_contacts, news, partnership_matrix, pipeline_notifications, deal_history, activity_feed, search_documents, past_conversations, recent_conversations, learning_search, learning_save, skills, bookmark, warm_path, win_loss`;
    }
  } catch (err) {
    return `Data Agent error (${operation}): ${err.message}`;
  }
}
