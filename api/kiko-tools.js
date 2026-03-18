// Kiko Tool Registry — modular, MCP-ready tool definitions and handlers
// Each tool exports { definition, handler } — kiko.js imports and orchestrates
import { getCalendar, createCalendarEvent } from './kiko-calendar.js';
import { generateFollowup, getFollowupQueue } from './kiko-followup.js';

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
      page: { type: 'string', enum: ['home', 'pipeline', 'contacts', 'organisations', 'deals', 'email', 'calendar', 'documents', 'tasks', 'settings', 'dashboard', 'news', 'partnership-matrix'], description: 'Page to navigate to' },
      reason: { type: 'string', description: 'Brief reason for navigation' },
    }, required: ['page'] } },
  { name: 'get_alerts', description: 'Get proactive intelligence alerts — stale deals, pipeline bottlenecks, data quality issues.',
    input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'search_emails', description: 'Search Gmail emails by query. Use when user asks about emails, messages, or correspondence with a person/company.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Gmail search query — e.g. "from:john@company.com", "subject:sponsorship", "to:haas", or freetext' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    }, required: ['query'] } },
  { name: 'get_email_thread', description: 'Get a full email thread/conversation by thread ID. Use when user asks for details of a specific email thread.',
    input_schema: { type: 'object', properties: {
      thread_id: { type: 'string', description: 'Gmail thread ID' },
    }, required: ['thread_id'] } },
  { name: 'draft_email', description: 'Create a Gmail draft email. Use when user asks to draft, compose, or write an email. The draft is saved in Gmail Drafts — user can review and send.',
    input_schema: { type: 'object', properties: {
      to: { type: 'string', description: 'Recipient email(s), comma-separated' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body — can be HTML or plain text. Write in Sunny\'s direct, board-level tone.' },
      cc: { type: 'string', description: 'CC recipients (optional)' },
      thread_id: { type: 'string', description: 'Thread ID to reply within (optional — makes it a reply draft)' },
    }, required: ['to', 'body'] } },
  { name: 'get_email_analytics', description: 'Analyse email communication patterns for a contact or company. Shows frequency, recency, response patterns, engagement score. Use for "how active is our communication with X", "when did I last email X", "who am I most in touch with at X".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Contact name, email, or company domain to analyse. E.g. "haas", "john@acme.com", "decagon.ai"' },
      direction: { type: 'string', enum: ['all', 'sent', 'received'], description: 'Filter direction (default: all)' },
    }, required: ['query'] } },
  { name: 'get_outreach_intelligence', description: 'Get outreach effectiveness patterns and recommendations. Use when user asks about messaging performance, reply rates, what approaches work, how to improve outreach, optimal send times, or draft intelligence. Returns data-driven patterns from scored outreach history.',
    input_schema: { type: 'object', properties: {
      focus: { type: 'string', description: 'What to analyse: "patterns" for messaging approach effectiveness, "timing" for send time analysis, "persona" for target persona performance, "company" for company-specific insights, "recommendations" for actionable next steps, "draft-context" for pre-draft intelligence on a specific target' },
      company: { type: 'string', description: 'Optional: filter to a specific company' },
      pipeline: { type: 'string', description: 'Optional: filter to a specific pipeline (e.g. "Haas F1")' },
    }, required: ['focus'] } },
  { name: 'get_calendar', description: 'Get upcoming calendar events. Use when user asks about schedule, meetings, what\'s next, availability, or "what\'s on my calendar".',
    input_schema: { type: 'object', properties: {
      days: { type: 'number', description: 'Number of days ahead to look (default: 7)' },
      query: { type: 'string', description: 'Search term to filter events (optional)' },
    }, required: [] } },
  { name: 'create_calendar_event', description: 'Create a calendar event. Use when user asks to schedule, book, or set up a meeting/call.',
    input_schema: { type: 'object', properties: {
      summary: { type: 'string', description: 'Event title' },
      start: { type: 'string', description: 'Start time in ISO format (e.g. 2026-03-20T10:00:00)' },
      end: { type: 'string', description: 'End time in ISO format (e.g. 2026-03-20T11:00:00)' },
      description: { type: 'string', description: 'Event description (optional)' },
      attendees: { type: 'string', description: 'Comma-separated attendee emails (optional)' },
      location: { type: 'string', description: 'Location (optional)' },
    }, required: ['summary', 'start', 'end'] } },
  { name: 'get_stale_contacts', description: 'Get contacts who need follow-up based on email intelligence. Use for "who should I follow up with", "stale contacts", "who am I losing touch with".',
    input_schema: { type: 'object', properties: {
      min_staleness: { type: 'number', description: 'Minimum staleness score 0-100 (default: 40)' },
    }, required: [] } },
  { name: 'generate_followup', description: 'Generate a follow-up email draft for a deal or contact, queue it for review. Use for "draft a follow-up for X", "write a re-engagement email for Y deal".',
    input_schema: { type: 'object', properties: {
      contact_email: { type: 'string', description: 'Recipient email address' },
      deal_name: { type: 'string', description: 'Deal name for context (optional)' },
      context: { type: 'string', description: 'Any additional context — last touchpoint, deal stage, tone instructions' },
    }, required: ['contact_email'] } },
  { name: 'get_followup_queue', description: 'Get pending follow-up drafts awaiting review. Use for "show follow-up queue", "what drafts are waiting".',
    input_schema: { type: 'object', properties: {
      status: { type: 'string', enum: ['pending_review', 'approved', 'sent', 'all'], description: 'Filter by status (default: pending_review)' },
    }, required: [] } },
  { name: 'get_news', description: 'Get latest sports sponsorship and F1 news from the intelligence feed. Use for "what\'s the latest news", "F1 sponsorship deals", "any news about X company", "deal signals".',
    input_schema: { type: 'object', properties: {
      category: { type: 'string', enum: ['all', 'f1_sponsorship', 'sports_sponsorship', 'formula_e', 'f1_general', 'market_activity', 'brand_ambassador'], description: 'Filter by category (default: all)' },
      company: { type: 'string', description: 'Search for news mentioning a specific company (optional)' },
      deals_only: { type: 'boolean', description: 'Only return deal signal articles (default: false)' },
    }, required: [] } },
  { name: 'get_partnership_matrix', description: 'Query the F1 Partnership Matrix. Shows which teams have sponsors in which categories, and highlights gaps. Use for "who sponsors Red Bull", "which F1 teams have no cybersecurity partner", "show me the partnership matrix", "gaps in F1 sponsorship".',
    input_schema: { type: 'object', properties: {
      team: { type: 'string', description: 'Filter by team name (e.g. "Red Bull", "Ferrari", "Haas"). Optional.' },
      category: { type: 'string', description: 'Filter by category (e.g. "cybersecurity", "fintech", "cloud"). Optional.' },
      gaps_only: { type: 'boolean', description: 'Only show gaps (empty sponsorship slots). Default: false' },
    }, required: [] } },
  { name: 'get_pipeline_notifications', description: 'Get recent pipeline activity notifications — prospect replies, interested signals, deal stage changes, engagement events from Lemlist campaigns. Use for "any pipeline updates", "who replied", "new leads", "what happened with outreach", "campaign activity".',
    input_schema: { type: 'object', properties: {
      unread_only: { type: 'boolean', description: 'Only show unread notifications. Default: false' },
    }, required: [] } },
  { name: 'search_documents', description: 'Search uploaded documents (decks, proposals, briefs) by content or team. Use when user asks about a deck, document, what a team said, team positioning, partnership benefits, or references uploaded materials. Returns relevant passages with extracted intelligence (stats, tone, positioning, talking points).',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query — what to look for in documents' },
      team: { type: 'string', description: 'Filter by F1 team name (optional). E.g. Alpine, Haas, Mercedes' },
      category: { type: 'string', description: 'Filter by category: deck, proposal, contract, brief, report, media_kit (optional)' },
    }, required: ['query'] } },
];

// ── Tool Executor ────────────────────────────────────────
export async function executeTool(name, input, userEmail = 'sunny@vanhawke.com') {
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

  if (name === 'search_emails') {
    const { query: q, limit = 10 } = input
    try {
      const { getGoogleToken } = await import('./google-token.js')
      const token = await getGoogleToken(userEmail)
      const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const searchData = await searchRes.json()
      const ids = (searchData.messages || []).map(m => m.id)
      if (!ids.length) return `No emails found matching "${q}".`
      const emails = []
      for (const id of ids.slice(0, limit)) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const msg = await msgRes.json()
        const h = msg.payload?.headers || []
        const getH = (n) => h.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || ''
        emails.push({ id: msg.id, threadId: msg.threadId, from: getH('From'), subject: getH('Subject'), date: getH('Date'), snippet: msg.snippet })
      }
      return `Found ${emails.length} email${emails.length > 1 ? 's' : ''} matching "${q}":\n${emails.map(e => `• ${e.from} — "${e.subject}" (${e.date ? new Date(e.date).toLocaleDateString('en-GB') : '?'}) [thread:${e.threadId}]\n  ${(e.snippet || '').slice(0, 120)}`).join('\n')}`
    } catch(e) { return `Email search error: ${e.message}` }
  }

  if (name === 'get_email_thread') {
    const { thread_id } = input
    try {
      const { getGoogleToken } = await import('./google-token.js')
      const token = await getGoogleToken(userEmail)
      const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread_id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const thread = await threadRes.json()
      const msgs = (thread.messages || []).map(msg => {
        const h = msg.payload?.headers || []
        const getH = (n) => h.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || ''
        return { from: getH('From'), to: getH('To'), subject: getH('Subject'), date: getH('Date'), snippet: msg.snippet }
      })
      if (!msgs.length) return 'Thread not found.'
      return `EMAIL THREAD: "${msgs[0].subject}" (${msgs.length} messages)\n${msgs.map((m, i) => `\n[${i + 1}] ${m.from} → ${m.to} (${m.date ? new Date(m.date).toLocaleDateString('en-GB') : '?'})\n${m.snippet}`).join('\n')}`
    } catch(e) { return `Thread fetch error: ${e.message}` }
  }

  if (name === 'draft_email') {
    const { to, subject, body, cc, thread_id } = input
    try {
      const { getGoogleToken } = await import('./google-token.js')
      const token = await getGoogleToken(userEmail)
      // Fetch signature from user_settings
      let sig = ''
      try {
        const sigRows = await sbFetch(`user_settings?select=email_signature&limit=1`)
        if (sigRows?.[0]?.email_signature) sig = `<br><div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0">${sigRows[0].email_signature}</div>`
      } catch {}
      const htmlBody = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:14px">${body.replace(/\n/g, '<br>')}${sig}</div>`
      const boundary = `b_${Date.now()}`
      let mime = `To: ${to}\r\nFrom: ${userEmail}\r\n`
      if (cc) mime += `Cc: ${cc}\r\n`
      if (subject) mime += `Subject: ${subject}\r\n`
      mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
      mime += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}\r\n`
      mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody}\r\n`
      mime += `--${boundary}--`
      const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const draftBody = { message: { raw } }
      if (thread_id) draftBody.message.threadId = thread_id
      const draftRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(draftBody)
      })
      const draft = await draftRes.json()
      if (!draftRes.ok) return `Failed to create draft: ${JSON.stringify(draft)}`
      return `Draft created successfully. To: ${to}${subject ? `, Subject: "${subject}"` : ''}. It's saved in Gmail Drafts — Sunny can review and send from the Email page.`
    } catch(e) { return `Draft error: ${e.message}` }
  }

  if (name === 'get_email_analytics') {
    const { query: q, direction = 'all' } = input
    try {
      // Try pre-computed scores first (instant)
      const { data: scores } = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&or=(contact_email.ilike.*${encodeURIComponent(q)}*,contact_name.ilike.*${encodeURIComponent(q)}*,company.ilike.*${encodeURIComponent(q)}*)&limit=5`)
      if (scores?.length) {
        const s = scores[0]
        let out = `EMAIL INTELLIGENCE: ${s.contact_name || s.contact_email}\n`
        out += `Total emails: ${s.total_emails} (Sent: ${s.sent_count} | Received: ${s.received_count})\n`
        out += `Last contact: ${s.days_since_last_contact} days ago\n`
        out += `Avg response time: ${s.avg_response_hours ? Math.round(s.avg_response_hours) + ' hours' : 'N/A'}\n`
        out += `Relationship health: ${s.relationship_health}/100\n`
        out += `Engagement: ${s.engagement_score}/100\n`
        out += `Momentum: ${s.momentum}\n`
        out += `Tone trend: ${s.tone_trend}\n`
        if (s.staleness_score > 40) out += `⚠️ STALE (${s.staleness_score}/100) — ${s.followup_reason || 'Follow-up recommended'}\n`
        if (s.next_followup_recommended) out += `Next follow-up: ${new Date(s.next_followup_recommended).toLocaleDateString('en-GB')}\n`
        if (s.last_action_items?.length) out += `Open action items: ${s.last_action_items.join('; ')}\n`
        if (scores.length > 1) out += `\n(${scores.length - 1} more matches found)`
        return out
      }
      // Fallback: live Gmail search if no pre-computed scores
      return `No pre-computed intelligence for "${q}". Run email analysis first, or ask me to search emails directly.`
    } catch(e) { return `Analytics error: ${e.message}` }
  }

  if (name === 'get_outreach_intelligence') {
    const { focus, company, pipeline } = input
    try {
      let query = `${SB}/rest/v1/outreach_scores?org_id=eq.${ORG_ID}&order=sent_at.desc&limit=200`
      if (company) query += `&company=ilike.*${encodeURIComponent(company)}*`
      if (pipeline) query += `&pipeline=eq.${encodeURIComponent(pipeline)}`
      const r = await fetch(query, { headers: h })
      const scores = await r.json()
      if (!scores?.length) return 'No outreach scores yet. The scoring engine runs daily at 9am — data will appear after the first run.'

      const total = scores.length
      const replied = scores.filter(s => s.outcome === 'replied')
      const silence = scores.filter(s => s.outcome === 'silence')
      const replyRate = total > 0 ? Math.round(replied.length / total * 100) : 0
      const avgTimeToReply = replied.filter(s => s.time_to_reply_hours).reduce((a, s) => a + s.time_to_reply_hours, 0) / (replied.filter(s => s.time_to_reply_hours).length || 1)

      if (focus === 'patterns' || focus === 'recommendations') {
        // Group by messaging approach
        const byApproach = {}
        scores.forEach(s => {
          const a = s.messaging_approach || 'unknown'
          if (!byApproach[a]) byApproach[a] = { total: 0, replied: 0 }
          byApproach[a].total++
          if (s.outcome === 'replied') byApproach[a].replied++
        })
        const approachStats = Object.entries(byApproach).map(([a, d]) => `${a}: ${d.replied}/${d.total} replied (${Math.round(d.replied/d.total*100)}%)`).join('\n')

        // Group by CTA type
        const byCta = {}
        scores.forEach(s => {
          const c = s.cta_type || 'unknown'
          if (!byCta[c]) byCta[c] = { total: 0, replied: 0 }
          byCta[c].total++
          if (s.outcome === 'replied') byCta[c].replied++
        })
        const ctaStats = Object.entries(byCta).map(([c, d]) => `${c}: ${d.replied}/${d.total} (${Math.round(d.replied/d.total*100)}%)`).join('\n')

        return `OUTREACH INTELLIGENCE — ${total} emails scored\n\nOverall reply rate: ${replyRate}%\nAvg time to reply: ${Math.round(avgTimeToReply)}h\n\nBy messaging approach:\n${approachStats}\n\nBy CTA type:\n${ctaStats}\n\nSilent: ${silence.length} | Replied: ${replied.length} | Pending: ${scores.filter(s => s.outcome === 'pending').length}`
      }

      if (focus === 'timing') {
        const byDay = {}; const byHour = {}
        scores.forEach(s => {
          const d = s.sent_day_of_week || 'Unknown'; const hr = s.sent_hour ?? -1
          if (!byDay[d]) byDay[d] = { total: 0, replied: 0 }; byDay[d].total++; if (s.outcome === 'replied') byDay[d].replied++
          if (hr >= 0) { const bucket = hr < 9 ? 'Before 9am' : hr < 12 ? '9am-12pm' : hr < 15 ? '12-3pm' : hr < 18 ? '3-6pm' : 'After 6pm'
            if (!byHour[bucket]) byHour[bucket] = { total: 0, replied: 0 }; byHour[bucket].total++; if (s.outcome === 'replied') byHour[bucket].replied++ }
        })
        const dayStats = Object.entries(byDay).map(([d, v]) => `${d}: ${v.replied}/${v.total} (${Math.round(v.replied/v.total*100)}%)`).join('\n')
        const hourStats = Object.entries(byHour).map(([h, v]) => `${h}: ${v.replied}/${v.total} (${Math.round(v.replied/v.total*100)}%)`).join('\n')
        return `SEND TIMING ANALYSIS\n\nBy day:\n${dayStats}\n\nBy time window (UTC):\n${hourStats}`
      }

      if (focus === 'persona') {
        const bySeniority = {}
        scores.forEach(s => {
          const p = s.persona_seniority || 'Unknown'
          if (!bySeniority[p]) bySeniority[p] = { total: 0, replied: 0 }; bySeniority[p].total++; if (s.outcome === 'replied') bySeniority[p].replied++
        })
        return `PERSONA ANALYSIS\n\n${Object.entries(bySeniority).map(([p, v]) => `${p}: ${v.replied}/${v.total} (${Math.round(v.replied/v.total*100)}%)`).join('\n')}`
      }

      if (focus === 'company') {
        const byCompany = {}
        scores.forEach(s => {
          const c = s.company || 'Unknown'
          if (!byCompany[c]) byCompany[c] = { total: 0, replied: 0, lastSent: s.sent_at, outcome: s.outcome }; byCompany[c].total++; if (s.outcome === 'replied') byCompany[c].replied++
        })
        const sorted = Object.entries(byCompany).sort((a, b) => b[1].total - a[1].total).slice(0, 20)
        return `COMPANY-LEVEL OUTREACH\n\n${sorted.map(([c, v]) => `${c}: ${v.total} sent, ${v.replied} replied (${Math.round(v.replied/v.total*100)}%)`).join('\n')}`
      }

      if (focus === 'draft-context') {
        const best = replied.slice(0, 5)
        const approaches = [...new Set(best.map(s => s.messaging_approach))].join(', ')
        const avgWords = Math.round(best.reduce((a, s) => a + (s.body_word_count || 100), 0) / (best.length || 1))
        const bestCta = [...new Set(best.map(s => s.cta_type))].join(', ')
        return `DRAFT INTELLIGENCE\n\nBased on ${replied.length} successful emails:\n- Best approaches: ${approaches}\n- Optimal length: ~${avgWords} words\n- Effective CTAs: ${bestCta}\n- Avg subject words: ${Math.round(best.reduce((a, s) => a + (s.subject_word_count || 5), 0) / (best.length || 1))}\n- Reply rate: ${replyRate}%`
      }

      return `Outreach data: ${total} scored, ${replyRate}% reply rate. Ask about "patterns", "timing", "persona", "company", or "draft-context" for specific analysis.`
    } catch (err) { return `Outreach intelligence error: ${err.message}` }
  }

  if (name === 'get_calendar') return await getCalendar(input, userEmail)
  if (name === 'create_calendar_event') return await createCalendarEvent(input, userEmail)

  if (name === 'get_stale_contacts') {
    const minStaleness = input.min_staleness || 40
    const scores = await sbFetch(`email_scores?user_email=eq.${encodeURIComponent(userEmail)}&staleness_score=gte.${minStaleness}&order=staleness_score.desc&limit=15`)
    if (!scores?.length) return 'No stale contacts found. All relationships are healthy.'
    let out = `${scores.length} contacts need follow-up:\n`
    for (const s of scores) {
      out += `\n• **${s.contact_name || s.contact_email}**${s.company ? ` (${s.company})` : ''}\n`
      out += `  Health: ${s.relationship_health}/100 | Staleness: ${s.staleness_score}/100 | Momentum: ${s.momentum}\n`
      out += `  Last contact: ${s.days_since_last_contact} days ago | Emails: ${s.total_emails}\n`
      if (s.followup_reason) out += `  → ${s.followup_reason}\n`
    }
    return out
  }

  if (name === 'generate_followup') return await generateFollowup(input, userEmail)

  if (name === 'get_followup_queue') return await getFollowupQueue(input, userEmail)

  if (name === 'get_news') {
    const { category, company, deals_only } = input
    let filter = 'is_processed=eq.true&order=published_at.desc&limit=15'
    if (category && category !== 'all') filter += `&category=eq.${category}`
    if (deals_only) filter += '&deal_signal=eq.true'
    let articles = await sbFetch(`news_articles?${filter}&select=title,source_name,article_url,published_at,category,relevance_score,deal_signal,matched_companies,key_topics`)
    // If company search, filter client-side (more flexible matching)
    if (company && articles?.length) {
      const q = company.toLowerCase()
      articles = articles.filter(a =>
        a.title?.toLowerCase().includes(q) ||
        (a.matched_companies || []).some(c => (c.name || c).toLowerCase().includes(q)) ||
        (a.key_topics || []).some(t => t.toLowerCase().includes(q))
      )
    }
    if (!articles?.length) return `No news found${category ? ` in ${category}` : ''}${company ? ` about "${company}"` : ''}.`
    let out = `${articles.length} article${articles.length > 1 ? 's' : ''}${company ? ` mentioning "${company}"` : ''}:\n`
    for (const a of articles.slice(0, 10)) {
      const date = new Date(a.published_at)
      const ago = Math.floor((Date.now() - date) / 3600000)
      const timeStr = ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`
      out += `\n• **${a.title}** (${a.source_name}, ${timeStr})`
      if (a.deal_signal) out += ` 🔴 DEAL SIGNAL`
      if (a.relevance_score >= 7) out += ` ⭐ High relevance`
      if (a.matched_companies?.length) out += ` — Companies: ${a.matched_companies.map(c => c.name || c).join(', ')}`
      out += `\n  ${a.article_url}\n`
    }
    return out
  }

  if (name === 'get_partnership_matrix') {
    const { team, category, gaps_only } = input
    const teams = await sbFetch('f1_teams?order=sort_order&select=id,name,full_name,engine,color')
    const categories = await sbFetch('sponsor_categories?order=sort_order&select=id,name')
    const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier')
    if (!teams?.length) return 'Partnership matrix data not loaded.'

    // Filter
    let filteredTeams = teams
    if (team) filteredTeams = teams.filter(t => t.name.toLowerCase().includes(team.toLowerCase()) || t.id.includes(team.toLowerCase()))
    let filteredCats = categories || []
    if (category) filteredCats = filteredCats.filter(c => c.name.toLowerCase().includes(category.toLowerCase()) || c.id.includes(category.toLowerCase()))

    // Build response
    let out = ''
    for (const t of filteredTeams) {
      const teamPartners = (partnerships || []).filter(p => p.team_id === t.id)
      const filledCats = new Set(teamPartners.map(p => p.category_id))
      const gaps = filteredCats.filter(c => !filledCats.has(c.id))
      if (gaps_only && gaps.length === 0) continue

      out += `\n**${t.name}** (${t.full_name || ''}) — ${teamPartners.length} partners\n`
      if (!gaps_only) {
        for (const c of filteredCats) {
          const catPartners = teamPartners.filter(p => p.category_id === c.id)
          if (catPartners.length) out += `  ✅ ${c.name}: ${catPartners.map(p => `${p.partner_name} [${p.tier}]`).join(', ')}\n`
          else out += `  ❌ ${c.name}: **GAP** — no partner\n`
        }
      } else {
        out += `  Gaps: ${gaps.map(g => g.name).join(', ')}\n`
      }
    }

    if (!out) return gaps_only ? 'No gaps found for the specified criteria.' : 'No matching teams or categories.'
    const totalGaps = filteredTeams.reduce((acc, t) => {
      const filled = new Set((partnerships || []).filter(p => p.team_id === t.id).map(p => p.category_id))
      return acc + filteredCats.filter(c => !filled.has(c.id)).length
    }, 0)
    return `F1 PARTNERSHIP MATRIX${team ? ` — ${team}` : ''}${category ? ` — ${category}` : ''}\n${filteredTeams.length} teams, ${(partnerships||[]).length} active partnerships, ${totalGaps} gaps\n${out}`
  }

  if (name === 'get_pipeline_notifications') {
    const unreadOnly = input.unread_only ? '&is_read=eq.false' : ''
    const notifs = await sbFetch(`pipeline_notifications?is_dismissed=eq.false${unreadOnly}&order=created_at.desc&limit=15`)
    if (!notifs?.length) return 'No pipeline notifications. Campaigns may be quiet or no prospects have engaged yet.'
    const unread = notifs.filter(n => !n.is_read).length
    let out = `PIPELINE ACTIVITY — ${notifs.length} notifications (${unread} unread)\n\n`
    for (const n of notifs) {
      const icon = n.type === 'reply' ? '💬' : n.type === 'interested' ? '✅' : n.type === 'stage_change' ? '📈' : n.type === 'deal_won' ? '🏆' : '📧'
      const readMark = n.is_read ? '' : ' 🔴'
      out += `${icon} **${n.title}**${readMark}\n`
      out += `   ${n.body || ''}\n`
      out += `   ${n.pipeline ? n.pipeline : ''}${n.stage ? ' → ' + n.stage : ''} · ${n.source || ''} · ${n.priority} priority\n\n`
    }
    return out
  }

  if (name === 'search_documents') {
    const { query: q, team, category } = input
    try {
      // Embed the query
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })
      const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q.slice(0, 8000) })
      const embedding = embRes.data[0].embedding
      const embeddingStr = `[${embedding.join(',')}]`

      // Vector search via RPC
      let results = []
      try {
        const rpcRes = await fetch(`${SB()}/rest/v1/rpc/match_document_chunks`, {
          method: 'POST', headers: { apikey: SK(), Authorization: `Bearer ${SK()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query_embedding: embeddingStr, match_threshold: 0.45, match_count: 8, p_user_email: userEmail }),
        })
        const rpcData = await rpcRes.json()
        if (Array.isArray(rpcData) && rpcData.length > 0) results = rpcData
      } catch (e) { console.log('[Kiko] Vector search failed:', e.message) }

      // Fallback: text search on document content
      if (results.length === 0) {
        const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 3)
        if (words.length > 0) {
          const textFilter = words.map(w => `content.ilike.*${encodeURIComponent(w)}*`).join('&')
          const textDocs = await sbFetch(`documents?${textFilter}&select=id,name,linked_team,linked_entity,category,context,intelligence,summary,content&limit=5`)
          if (textDocs?.length > 0) {
            let out = `DOCUMENT SEARCH: "${q}" — ${textDocs.length} documents found (text match)\n\n`
            for (const doc of textDocs) {
              out += `📄 **${doc.name}**${doc.linked_team ? ` (${doc.linked_team})` : doc.linked_entity ? ` (${doc.linked_entity})` : ''}${doc.category ? ` [${doc.category}]` : ''}\n`
              const intel = doc.intelligence || {}
              if (intel.key_stats?.length) out += `   Key stats: ${intel.key_stats.join(', ')}\n`
              if (intel.messaging_tone) out += `   Tone: ${intel.messaging_tone}\n`
              if (intel.positioning) out += `   Positioning: ${intel.positioning}\n`
              if (intel.talking_points?.length) out += `   Talking points: ${intel.talking_points.join(', ')}\n`
              if (intel.partner_benefits?.length) out += `   Partner benefits: ${intel.partner_benefits.join(', ')}\n`
              if (intel.unique_angles?.length) out += `   Unique angles: ${intel.unique_angles.join(', ')}\n`
              if (doc.summary) out += `   Summary: ${doc.summary}\n`
              out += `   Content preview: ${(doc.content || '').slice(0, 400)}...\n\n`
            }
            return out
          }
        }
      }

      if (!results.length) return `No documents found matching "${q}"${team ? ` for ${team}` : ''}. Upload relevant decks or briefs to build the knowledge base.`

      // Enrich vector results with document metadata
      const docIds = [...new Set(results.map(r => r.document_id))].filter(Boolean)
      let docMap = {}
      if (docIds.length > 0) {
        let filter = `id=in.(${docIds.join(',')})`
        if (team) filter += `&linked_team=ilike.*${encodeURIComponent(team)}*`
        const docs = await sbFetch(`documents?${filter}&select=id,name,linked_team,linked_entity,category,context,intelligence,summary`)
        if (docs) docMap = Object.fromEntries(docs.map(d => [d.id, d]))
      }

      // Format output
      const byDoc = {}
      for (const r of results) {
        if (!byDoc[r.document_id]) byDoc[r.document_id] = { ...(docMap[r.document_id] || {}), passages: [] }
        byDoc[r.document_id].passages.push(r.content)
      }
      let out = `DOCUMENT SEARCH: "${q}" — ${results.length} passages from ${Object.keys(byDoc).length} documents\n\n`
      for (const [id, doc] of Object.entries(byDoc)) {
        out += `📄 **${doc.name || 'Unknown'}**${doc.linked_team ? ` (${doc.linked_team})` : doc.linked_entity ? ` (${doc.linked_entity})` : ''}${doc.category ? ` [${doc.category}]` : ''}\n`
        const intel = doc.intelligence || {}
        if (intel.key_stats?.length) out += `   Key stats: ${intel.key_stats.join(', ')}\n`
        if (intel.messaging_tone) out += `   Tone: ${intel.messaging_tone}\n`
        if (intel.positioning) out += `   Positioning: ${intel.positioning}\n`
        if (intel.talking_points?.length) out += `   Talking points: ${intel.talking_points.join(', ')}\n`
        if (intel.partner_benefits?.length) out += `   Partner benefits: ${intel.partner_benefits.join(', ')}\n`
        if (intel.unique_angles?.length) out += `   Unique angles: ${intel.unique_angles.join(', ')}\n`
        out += `   Relevant passages:\n`
        for (const p of doc.passages.slice(0, 3)) out += `   > ${p.slice(0, 400)}...\n`
        out += '\n'
      }
      return out
    } catch (err) {
      console.error('[Kiko] search_documents error:', err.message)
      return `Document search error: ${err.message}`
    }
  }

  return { error: `Unknown tool: ${name}` }
}

// ── Entity Context Helper ───────────────────────────────
export async function fetchEntityContext(pageEntity) {
  if (!pageEntity?.type || !pageEntity?.id) return ''
  try {
    if (pageEntity.type === 'contact') {
      const rows = await sbFetch(`contacts?id=eq.${pageEntity.id}&select=data&limit=1`)
      if (rows?.[0]?.data) {
        const d = rows[0].data
        let ctx = `\n\nACTIVE CONTEXT — User is viewing contact: ${d.firstName || ''} ${d.lastName || ''}, ${d.title || '?'} at ${d.company || '?'}. Email: ${d.email || '—'}. LinkedIn: ${d.linkedin ? 'Yes' : 'No'}. Phone: ${d.phone || '—'}.`
        if (d.lastCampaign) ctx += ` Last campaign: ${d.lastCampaign}.`
        if (d.outreachStatus) ctx += ` Outreach status: ${d.outreachStatus}.`
        ctx += ` When user asks to draft/email this person, use their email (${d.email || 'not available'}) as the recipient.`
        return ctx
      }
    } else if (pageEntity.type === 'company') {
      const rows = await sbFetch(`companies?id=eq.${pageEntity.id}&select=data&limit=1`)
      if (rows?.[0]?.data) {
        const d = rows[0].data
        let ctx = `\n\nACTIVE CONTEXT — User is viewing company: ${d.name || '?'}. Industry: ${d.industry || '?'}. Country: ${d.country || '?'}.${d.lastRound ? ` Last Round: ${d.lastRound}.` : ''}${d.totalFunding ? ` Total Funding: ${d.totalFunding}.` : ''}${d.employees ? ` Employees: ${d.employees}.` : ''}`
        // Fetch top contacts for this company
        const contacts = await sbFetch(`contacts?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=5&order=updated_at.desc`)
        if (contacts?.length) {
          ctx += ` Key contacts: ${contacts.map(c => `${c.data.firstName || ''} ${c.data.lastName || ''} (${c.data.title || '?'}, ${c.data.email || 'no email'})`).join('; ')}.`
        }
        return ctx
      }
    }
  } catch(e) { /* non-blocking */ }
  return ''
}
