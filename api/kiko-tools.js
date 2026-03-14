// Kiko Tool Registry — modular, MCP-ready tool definitions and handlers
// Each tool exports { definition, handler } — kiko.js imports and orchestrates

// ── Supabase Helper ─────────────────────────────────────
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
export const sbFetch = async (path, opts = {}) => {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SK(), Authorization: `Bearer ${SK()}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
};

// ── Format Helpers ──────────────────────────────────────
function fmtContact(c) {
  const d = c.data || c
  return `• ${d.firstName || ''} ${d.lastName || ''} — ${d.title || 'No title'}${d.company ? ` @ ${d.company}` : ''}${d.email ? ` | ${d.email}` : ''}${d.linkedin ? ' | LinkedIn ✓' : ''}`
}
function fmtCompany(c) {
  const d = c.data || c
  return `• ${d.name || 'Unknown'} — ${d.industry || '?'}${d.country ? ` | ${d.country}` : ''}${d.lastRound ? ` | ${d.lastRound}` : ''}${d.totalFunding ? ` (${d.totalFunding} total)` : ''}${d.employees ? ` | ${d.employees} emp` : ''}`
}
function fmtDeal(d) {
  const data = d.data || d
  return `• ${data.company || data.title} — ${data.pipeline || '?'} → ${data.stage || '?'}${data.contactName ? ` | ${data.contactName}` : ''}${data.lastActivity ? ` | Last: ${new Date(data.lastActivity).toLocaleDateString('en-GB')}` : ''}`
}


// ── Tool Definitions ────────────────────────────────────
export const TOOL_DEFINITIONS = [
  { name: 'search_contacts', description: 'Search CRM contacts by name, company, title, or email. Use when user asks about a person, who works at a company, or references a contact.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search term — name, company, job title, or email fragment' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    }, required: ['query'] } },
  { name: 'search_companies', description: 'Search CRM companies/organisations by name, industry, or country. Use when user asks about a company, org, or industry.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search term — company name, industry, or country' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    }, required: ['query'] } },
  { name: 'search_deals', description: 'Search deals by company name, pipeline, or stage. Use when user asks about deals, pipeline status, or prospects.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search term — company name, pipeline name, or stage' },
      pipeline: { type: 'string', description: 'Filter to specific pipeline (e.g. "Haas F1", "Formula E")' },
      stage: { type: 'string', description: 'Filter to specific stage (e.g. "Qualified", "Contact made")' },
      limit: { type: 'number', description: 'Max results (default 15)' },
    }, required: [] } },
  { name: 'get_entity_detail', description: 'Get full detail on a specific contact, company, or deal by ID or exact name. Returns all available data including funding, campaigns, activities, and related records.',
    input_schema: { type: 'object', properties: {
      entity_type: { type: 'string', enum: ['contact', 'company', 'deal'], description: 'Type of entity' },
      id: { type: 'string', description: 'Entity ID (e.g. c3416, org100)' },
      name: { type: 'string', description: 'Entity name — will fuzzy match' },
    }, required: ['entity_type'] } },
  { name: 'search_conversations', description: 'Search past Kiko conversations by keyword.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords to search' },
      limit: { type: 'number', description: 'Max results (default 5)' },
    }, required: ['query'] } },
  { name: 'navigate_page', description: 'Navigate user to a Vela page. ALWAYS use when asked to show/open/go to a page.',
    input_schema: { type: 'object', properties: {
      page: { type: 'string', enum: ['home', 'pipeline', 'contacts', 'organisations', 'deals', 'email', 'calendar', 'documents', 'tasks', 'settings', 'dashboard'], description: 'Page to navigate to' },
      reason: { type: 'string', description: 'Brief reason for navigation' },
    }, required: ['page'] } },
  { name: 'get_alerts', description: 'Get proactive intelligence alerts — stale deals, pipeline bottlenecks, data quality issues.',
    input_schema: { type: 'object', properties: {}, required: [] } },
];

// ── Tool Executor ────────────────────────────────────────
export async function executeTool(name, input) {
  if (name === 'search_contacts') {
    const { query, limit = 10 } = input
    const q = query.trim()
    const data = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*,data->>company.ilike.*${q}*,data->>title.ilike.*${q}*,data->>email.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`)
    if (!data || data.length === 0) return `No contacts found matching "${q}".`
    return `Found ${data.length} contact${data.length > 1 ? 's' : ''} matching "${q}":\n${data.map(c => fmtContact(c)).join('\n')}`
  }

  if (name === 'search_companies') {
    const { query, limit = 10 } = input
    const q = query.trim()
    const data = await sbFetch(`companies?select=id,data&or=(data->>name.ilike.*${q}*,data->>industry.ilike.*${q}*,data->>country.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`)
    if (!data || data.length === 0) return `No companies found matching "${q}".`
    return `Found ${data.length} compan${data.length > 1 ? 'ies' : 'y'} matching "${q}":\n${data.map(c => fmtCompany(c)).join('\n')}`
  }

  if (name === 'search_deals') {
    const { query, pipeline, stage, limit = 15 } = input
    let path = `deals?select=id,data&order=updated_at.desc&limit=${limit}`
    if (pipeline) path += `&data->>pipeline=eq.${pipeline}`
    if (stage) path += `&data->>stage=eq.${stage}`
    const data = await sbFetch(path)
    let results = data || []
    if (query) { const q = query.toLowerCase(); results = results.filter(d => JSON.stringify(d.data || {}).toLowerCase().includes(q)) }
    if (results.length === 0) return `No deals found${query ? ` matching "${query}"` : ''}${pipeline ? ` in ${pipeline}` : ''}${stage ? ` at ${stage}` : ''}.`
    const byStage = {}; results.forEach(d => { const s = d.data?.stage || 'Unknown'; byStage[s] = (byStage[s] || 0) + 1 })
    const summary = Object.entries(byStage).map(([s, c]) => `${s}: ${c}`).join(', ')
    return `Found ${results.length} deal${results.length > 1 ? 's' : ''} (${summary}):\n${results.map(d => fmtDeal(d)).join('\n')}`
  }

  if (name === 'get_entity_detail') {
    const { entity_type, id, name: entityName } = input
    try {
      if (entity_type === 'contact') {
        let row
        if (id) { const res = await sbFetch(`contacts?id=eq.${id}&select=id,data&limit=1`); row = res?.[0] }
        else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*)&limit=1`); row = res?.[0] }
        if (!row) return `Contact not found.`
        const d = row.data || {}
        const acts = await sbFetch(`contact_activities?contact_id=eq.${row.id}&select=type,campaign_name,created_at&order=created_at.desc&limit=5`)
        let dealInfo = ''
        if (d.company) {
          const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.company)}&limit=3`)
          if (deals?.length) dealInfo = deals.map(dl => `  ${dl.data.pipeline} → ${dl.data.stage}`).join('\n')
        }
        let out = `CONTACT: ${d.firstName || ''} ${d.lastName || ''}\nTitle: ${d.title || '—'}\nCompany: ${d.company || '—'}\nEmail: ${d.email || '—'}\nLinkedIn: ${d.linkedin ? 'Yes' : 'No'}\nPhone: ${d.phone || '—'}\n`
        if (d.lemlistCampaigns?.length) out += `Campaigns: ${d.lemlistCampaigns.map(c => c.name).join(', ')}\n`
        if (acts?.length) out += `Recent Activity:\n${acts.map(a => `  ${a.type} — ${a.campaign_name || ''} (${new Date(a.created_at).toLocaleDateString('en-GB')})`).join('\n')}\n`
        if (dealInfo) out += `Deal Pipeline:\n${dealInfo}\n`
        return out
      }
      if (entity_type === 'company') {
        let row
        if (id) { const res = await sbFetch(`companies?id=eq.${id}&select=id,data&limit=1`); row = res?.[0] }
        else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`companies?select=id,data&data->>name=ilike.*${q}*&limit=1`); row = res?.[0] }
        if (!row) return `Company not found.`
        const d = row.data || {}
        const contacts = await sbFetch(`contacts?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=10&order=updated_at.desc`)
        const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=5`)
        let out = `COMPANY: ${d.name}\nIndustry: ${d.industry || '—'}\nCountry: ${d.country || '—'}\nWebsite: ${d.website || '—'}\nLinkedIn: ${d.linkedin ? 'Yes' : 'No'}\n`
        if (d.lastRound) out += `Last Round: ${d.lastRound}\n`
        if (d.totalFunding) out += `Total Funding: ${d.totalFunding}\n`
        if (d.valuation) out += `Valuation: ${d.valuation}\n`
        if (d.employees) out += `Employees: ${d.employees}\n`
        if (d.revenueEst) out += `Revenue Est: ${d.revenueEst}\n`
        if (d.founded) out += `Founded: ${d.founded}\n`
        if (contacts?.length) out += `Key Contacts (${contacts.length}):\n${contacts.slice(0, 5).map(c => `  ${c.data.firstName} ${c.data.lastName || ''} — ${c.data.title || '?'}`).join('\n')}\n`
        if (deals?.length) out += `Deals:\n${deals.map(dl => `  ${dl.data.pipeline} → ${dl.data.stage}${dl.data.contactName ? ` (${dl.data.contactName})` : ''}`).join('\n')}\n`
        return out
      }
      if (entity_type === 'deal') {
        let row
        if (id) { const res = await sbFetch(`deals?id=eq.${id}&select=id,data&limit=1`); row = res?.[0] }
        else if (entityName) { const q = entityName.trim(); const res = await sbFetch(`deals?select=id,data&data->>company=ilike.*${q}*&limit=1`); row = res?.[0] }
        if (!row) return `Deal not found.`
        const d = row.data || {}
        return `DEAL: ${d.company || d.title}\nPipeline: ${d.pipeline || '—'}\nStage: ${d.stage || '—'}\nContact: ${d.contactName || '—'}\nOwner: ${d.owner || '—'}\nLast Activity: ${d.lastActivity ? new Date(d.lastActivity).toLocaleDateString('en-GB') : '—'}\nStatus: ${d.status || '—'}\n`
      }
      return `Unknown entity type: ${entity_type}`
    } catch(e) { return `Error fetching ${entity_type}: ${e.message}` }
  }

  if (name === 'search_conversations') {
    const { query: q, limit = 5 } = input
    const all = await sbFetch('conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=50')
    const matches = (all || []).filter(c => JSON.stringify(c.messages || []).toLowerCase().includes(q.toLowerCase())).slice(0, limit)
    if (!matches.length) return { found: false }
    return { found: true, conversations: matches.map(c => ({ title: c.title, date: c.updated_at, excerpt: (c.messages || []).filter(m => JSON.stringify(m).toLowerCase().includes(q.toLowerCase())).slice(0, 3).map(m => ({ role: m.role, content: (m.content || '').slice(0, 200) })) })) }
  }

  if (name === 'navigate_page') {
    const { page, reason } = input
    return { navigated: true, page, reason: reason || `Opening ${page}`, instruction: `NAVIGATION: Navigating to ${page}. Tell the user you're taking them there.` }
  }

  if (name === 'get_alerts') {
    const alerts = await sbFetch('kiko_alerts?dismissed=eq.false&expires_at=gt.' + new Date().toISOString() + '&select=type,severity,title,detail,entity_name&order=created_at.desc&limit=10')
    if (!alerts || alerts.length === 0) return 'No active alerts. Pipeline is clean.'
    return `${alerts.length} active alert${alerts.length > 1 ? 's' : ''}:\n${alerts.map(a => `[${a.severity?.toUpperCase()}] ${a.title}\n  ${a.detail}`).join('\n\n')}`
  }

  return { error: `Unknown tool: ${name}` }
}

// ── Entity Context Helper ───────────────────────────────
export async function fetchEntityContext(pageEntity) {
  if (!pageEntity?.type || !pageEntity?.id) return ''
  try {
    if (pageEntity.type === 'contact') {
      const rows = await sbFetch(`contacts?id=eq.${pageEntity.id}&select=data&limit=1`)
      if (rows?.[0]?.data) { const d = rows[0].data; return `\n\nACTIVE CONTEXT — User is viewing contact: ${d.firstName || ''} ${d.lastName || ''}, ${d.title || '?'} at ${d.company || '?'}. Email: ${d.email || '—'}. LinkedIn: ${d.linkedin ? 'Yes' : 'No'}.` }
    } else if (pageEntity.type === 'company') {
      const rows = await sbFetch(`companies?id=eq.${pageEntity.id}&select=data&limit=1`)
      if (rows?.[0]?.data) { const d = rows[0].data; return `\n\nACTIVE CONTEXT — User is viewing company: ${d.name || '?'}. Industry: ${d.industry || '?'}. Country: ${d.country || '?'}.${d.lastRound ? ` Last Round: ${d.lastRound}.` : ''}${d.totalFunding ? ` Total Funding: ${d.totalFunding}.` : ''}${d.employees ? ` Employees: ${d.employees}.` : ''}` }
    }
  } catch(e) { /* non-blocking */ }
  return ''
}
