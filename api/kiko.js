import Anthropic from '@anthropic-ai/sdk';

export const config = { supportsResponseStreaming: true };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-6';

// ── Kiko System Prompt ──────────────────────────────────
const SYSTEM_PROMPT = `You are Kiko — the intelligence layer of the Vela platform, built for Van Hawke Group.

IDENTITY:
- You are Kiko. Never refer to yourself as Claude, an AI assistant, or a chatbot.
- You are direct, precise, commercially minded. A strategic partner.
- You never waste words. Never say "great question." Never open with pleasantries. Lead with value.
- You have PERMANENT long-term memory. You remember ALL past conversations, preferences, and decisions.
- When asked "do you have memory" — answer YES, definitively. You remember everything.
- If no memories match a query, say "I don't have context on that yet" — NEVER "I don't have memory."

USER:
- Sunny Sidhu — CEO of Van Hawke Group. Based in Weybridge, UK.
- Preferences: direct, no fluff, board-level framing (cost/benefit/risk/time-to-value).
- All financials in USD.

RESPONSE RULES:
- Max 2-3 sentences for simple queries. Expand only when depth is warranted.
- Use memories naturally — never say "according to my memory."
- You have internet access via web search. Never say you can't search the web.
- Default weather location: Weybridge, Surrey, UK.
TOOLS:
- search_contacts: Find contacts by name, company, title, or email. Fuzzy matching. Returns formatted list.
- search_companies: Find companies by name, industry, or country. Includes funding data.
- search_deals: Find deals by company, pipeline, or stage. Returns pipeline summary.
- get_entity_detail: Deep briefing on a specific contact, company, or deal. Returns full profile with funding, campaigns, activities, related records.
- search_conversations: Search past Kiko conversations by keyword.
- navigate_page: Navigate the user to any page in the platform. When the user says "show me the pipeline", "pull up deals", "go to contacts", etc., ALWAYS use this tool to navigate them there. You are the operating system — you control the interface.
- get_alerts: Get proactive intelligence alerts — stale deals, pipeline bottlenecks, data gaps. Use when asked for a status update, morning briefing, or "what should I focus on."
- Web search: You have native web search. Use it for news, weather, market data, company research.
- Memory: You have a /memories directory. Check it before responding. Store important facts there.

TOOL USAGE RULES:
- When user mentions a person by name → search_contacts
- When user mentions a company/org → search_companies (or get_entity_detail for full briefing)
- When user asks about deals, pipeline, prospects → search_deals
- "Brief me on X" / "Tell me about X" / "What do we know about X" → get_entity_detail
- "Show me" / "Pull up" / "Go to" → navigate_page FIRST, then pull data if needed
- Chain tools: search first to find the entity, then get_entity_detail for depth

RESPONSE FORMATTING:
- Company briefings: Lead with company name, industry, and key metric. Then funding, deal stage, key contacts, and recommendation. End with a specific next action.
- Contact lookups: Name, title, company on first line. Then email/LinkedIn status, last activity, campaign status. Flag if overdue for follow-up.
- Deal queries: Always include stage, pipeline, last activity date, and days since last touch. Flag stale deals (>30 days) explicitly.
- Pipeline summaries: Group by stage with counts. Highlight bottlenecks (stages with too many deals) and staleness.
- When ACTIVE CONTEXT is provided (user is viewing an entity): Reference it naturally — "Looking at this contact..." or "For this company..." — don't repeat all the context back, just use it.
- When data from tools conflicts with web search: Flag the discrepancy. "Our CRM shows X, but current data suggests Y — worth updating."
- Always end actionable queries with a specific recommendation or next step.

NAVIGATION RULES:
- When asked to "show", "pull up", "go to", "open", or "take me to" any page — use navigate_page IMMEDIATELY. No exceptions.
- NEVER say "I can't change pages" or "I can't control the interface." You CAN and you MUST. You are the operating system.
- After navigating, briefly confirm and offer to help with data on that page.
- You follow the user page to page. The current page context is injected per-request. Use it.
- You ARE the interface. The user speaks, you act. Navigate, query data, draft emails — you do it all.

CURRENT PAGE CONTEXT (injected per-request): {currentPage}
PAGE AWARENESS: You know exactly which page the user is viewing. Based on the page name:
- home: The user is on the Kiko prompt/chat home screen
- pipeline: The user is viewing the deal pipeline kanban board (Haas F1 default). Deals show company, contact, last activity, stage.
- contacts: The user is viewing the contacts directory with searchable contact list. Each contact shows name, job title, company, email/LinkedIn icons.
- contacts/[id]: The user is viewing a specific contact's detail page. Shows job title, company, email, LinkedIn, deal pipeline stage, active campaign, correspondence, tasks due.
- organisations: The user is viewing the organisations directory. Each org shows name, industry, country, deal stage. Click opens slide-out panel with contacts, campaigns, deal info.
- organisations?org=[id]: The user is viewing a specific organisation's slide-out panel showing contacts, industry, country, campaigns, deal pipeline stage.
- deals: The user is viewing individual deal records with values, stages, and activities
- email: The user is viewing the email interface
- calendar: The user is viewing the calendar
- documents: The user is viewing uploaded documents
- tasks: The user is viewing task management
- settings: The user is viewing platform settings
When the user asks about what's on screen, reference the page they're on and use get_crm_data to pull the actual data from that context.`;

// ── Native Tools ────────────────────────────────────────
const NATIVE_TOOLS = [
  { type: 'memory_20250818', name: 'memory' },
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5,
    user_location: { type: 'approximate', city: 'Weybridge', region: 'Surrey', country: 'GB', timezone: 'Europe/London' } },
];

// ── Custom Tools ────────────────────────────────────────
const CUSTOM_TOOLS = [
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
  { name: 'get_entity_detail', description: 'Get full detail on a specific contact, company, or deal by ID or exact name. Returns all available data including funding, campaigns, activities, and related records. Use when user wants a deep briefing on a specific entity.',
    input_schema: { type: 'object', properties: {
      entity_type: { type: 'string', enum: ['contact', 'company', 'deal'], description: 'Type of entity' },
      id: { type: 'string', description: 'Entity ID (e.g. c3416, org100) — use if known' },
      name: { type: 'string', description: 'Entity name — use if ID not known, will fuzzy match' },
    }, required: ['entity_type'] } },
  { name: 'search_conversations', description: 'Search past Kiko conversations by keyword.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords to search in past conversations' },
      limit: { type: 'number', description: 'Max results (default 5)' },
    }, required: ['query'] } },
  { name: 'navigate_page', description: 'Navigate the user to a specific page in the Vela platform. Use this when the user asks to see a page, pull up data, go to a section, or show something. ALWAYS use this tool when asked to show/open/go to a page.',
    input_schema: { type: 'object', properties: {
      page: { type: 'string', enum: ['home', 'pipeline', 'contacts', 'organisations', 'deals', 'email', 'calendar', 'documents', 'tasks', 'settings', 'dashboard'], description: 'Page to navigate to' },
      reason: { type: 'string', description: 'Brief description of why navigating (shown to user)' },
    }, required: ['page'] } },
  { name: 'get_alerts', description: 'Get proactive intelligence alerts — stale deals, pipeline bottlenecks, data quality issues. Use when user asks for updates, status briefing, "what should I focus on", or when on the home page.',
    input_schema: { type: 'object', properties: {}, required: [] } },
];

// ── Supabase Helper ─────────────────────────────────────
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const sbFetch = async (path, opts = {}) => {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SK(), Authorization: `Bearer ${SK()}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
};

// ── Memory Tool Handler ─────────────────────────────────
async function handleMemory(input) {
  const { command, path, file_text, old_str, new_str, insert_line, new_content, view_range } = input;
  try {
    if (command === 'view') {
      if (!path || path === '/memories') {
        const rows = await sbFetch('kiko_memories?select=path,is_directory,content&order=path.asc');
        return `Files in /memories:\n` + (rows || []).map(r =>
          `${r.is_directory ? '4.0K' : `${((r.content||'').length/1024).toFixed(1)}K`}\t${r.path}`
        ).join('\n');
      }
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content,is_directory&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      if (rows[0].is_directory) {
        const ch = await sbFetch(`kiko_memories?path=like.${encodeURIComponent(path+'/%')}&select=path,content&order=path.asc`);
        return (ch||[]).map(r => `${((r.content||'').length/1024).toFixed(1)}K\t${r.path}`).join('\n');
      }
      const lines = (rows[0].content||'').split('\n');
      if (view_range) {
        const [s,e] = view_range;
        return lines.slice(s-1,e).map((l,i)=>`${s+i}\t${l}`).join('\n');
      }
      return lines.map((l,i)=>`${i+1}\t${l}`).join('\n');
    }
    if (command === 'create') {
      await sbFetch('kiko_memories', { method:'POST', headers:{Prefer:'resolution=merge-duplicates'},
        body: JSON.stringify({path, content:file_text||'', is_directory:false, org_id:'35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at:new Date().toISOString()}) });
      return `Created ${path}`;
    }
    if (command === 'str_replace') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      const updated = rows[0].content.replace(old_str, new_str);
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, { method:'PATCH',
        body: JSON.stringify({content:updated, updated_at:new Date().toISOString()}) });
      return `Replaced in ${path}`;
    }
    if (command === 'insert') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      const lines = rows[0].content.split('\n');
      lines.splice(insert_line, 0, new_content);
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, { method:'PATCH',
        body: JSON.stringify({content:lines.join('\n'), updated_at:new Date().toISOString()}) });
      return `Inserted at line ${insert_line} in ${path}`;
    }
    if (command === 'delete') {
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, {method:'DELETE'});
      return `Deleted ${path}`;
    }
    return `Unknown memory command: ${command}`;
  } catch(e) { return `Memory error: ${e.message}`; }
}

// ── CRM Format Helpers ──────────────────────────────────
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

// ── Custom Tool Executor ────────────────────────────────
async function executeTool(name, input) {
  if (name === 'search_contacts') {
    const { query, limit = 10 } = input
    const q = query.trim()
    // Search across name, company, title, email via ilike
    const data = await sbFetch(
      `contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*,data->>company.ilike.*${q}*,data->>title.ilike.*${q}*,data->>email.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`
    )
    if (!data || data.length === 0) return `No contacts found matching "${q}".`
    return `Found ${data.length} contact${data.length > 1 ? 's' : ''} matching "${q}":\n${data.map(c => fmtContact(c)).join('\n')}`
  }

  if (name === 'search_companies') {
    const { query, limit = 10 } = input
    const q = query.trim()
    const data = await sbFetch(
      `companies?select=id,data&or=(data->>name.ilike.*${q}*,data->>industry.ilike.*${q}*,data->>country.ilike.*${q}*)&limit=${limit}&order=updated_at.desc`
    )
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
    if (query) {
      const q = query.toLowerCase()
      results = results.filter(d => JSON.stringify(d.data || {}).toLowerCase().includes(q))
    }
    if (results.length === 0) return `No deals found${query ? ` matching "${query}"` : ''}${pipeline ? ` in ${pipeline}` : ''}${stage ? ` at ${stage}` : ''}.`
    // Add summary stats
    const byStage = {}
    results.forEach(d => { const s = d.data?.stage || 'Unknown'; byStage[s] = (byStage[s] || 0) + 1 })
    const summary = Object.entries(byStage).map(([s, c]) => `${s}: ${c}`).join(', ')
    return `Found ${results.length} deal${results.length > 1 ? 's' : ''} (${summary}):\n${results.map(d => fmtDeal(d)).join('\n')}`
  }

  if (name === 'get_entity_detail') {
    const { entity_type, id, name: entityName } = input
    try {
      if (entity_type === 'contact') {
        let row
        if (id) {
          const res = await sbFetch(`contacts?id=eq.${id}&select=id,data&limit=1`)
          row = res?.[0]
        } else if (entityName) {
          const q = entityName.trim()
          const res = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*)&limit=1`)
          row = res?.[0]
        }
        if (!row) return `Contact not found.`
        const d = row.data || {}
        // Get activities
        const acts = await sbFetch(`contact_activities?contact_id=eq.${row.id}&select=type,campaign_name,created_at&order=created_at.desc&limit=5`)
        // Get deal info
        let dealInfo = ''
        if (d.company) {
          const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.company)}&limit=3`)
          if (deals?.length) dealInfo = deals.map(dl => `  ${dl.data.pipeline} → ${dl.data.stage}`).join('\n')
        }
        let out = `CONTACT: ${d.firstName || ''} ${d.lastName || ''}\n`
        out += `Title: ${d.title || '—'}\nCompany: ${d.company || '—'}\nEmail: ${d.email || '—'}\nLinkedIn: ${d.linkedin ? 'Yes' : 'No'}\nPhone: ${d.phone || '—'}\n`
        if (d.lemlistCampaigns?.length) out += `Campaigns: ${d.lemlistCampaigns.map(c => c.name).join(', ')}\n`
        if (acts?.length) out += `Recent Activity:\n${acts.map(a => `  ${a.type} — ${a.campaign_name || ''} (${new Date(a.created_at).toLocaleDateString('en-GB')})`).join('\n')}\n`
        if (dealInfo) out += `Deal Pipeline:\n${dealInfo}\n`
        return out
      }

      if (entity_type === 'company') {
        let row
        if (id) {
          const res = await sbFetch(`companies?id=eq.${id}&select=id,data&limit=1`)
          row = res?.[0]
        } else if (entityName) {
          const q = entityName.trim()
          const res = await sbFetch(`companies?select=id,data&data->>name=ilike.*${q}*&limit=1`)
          row = res?.[0]
        }
        if (!row) return `Company not found.`
        const d = row.data || {}
        // Get contacts
        const contacts = await sbFetch(`contacts?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=10&order=updated_at.desc`)
        // Get deals
        const deals = await sbFetch(`deals?select=data&data->>company=eq.${encodeURIComponent(d.name)}&limit=5`)
        let out = `COMPANY: ${d.name}\n`
        out += `Industry: ${d.industry || '—'}\nCountry: ${d.country || '—'}\nWebsite: ${d.website || '—'}\nLinkedIn: ${d.linkedin ? 'Yes' : 'No'}\n`
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
        if (id) {
          const res = await sbFetch(`deals?id=eq.${id}&select=id,data&limit=1`)
          row = res?.[0]
        } else if (entityName) {
          const q = entityName.trim()
          const res = await sbFetch(`deals?select=id,data&data->>company=ilike.*${q}*&limit=1`)
          row = res?.[0]
        }
        if (!row) return `Deal not found.`
        const d = row.data || {}
        let out = `DEAL: ${d.company || d.title}\n`
        out += `Pipeline: ${d.pipeline || '—'}\nStage: ${d.stage || '—'}\nContact: ${d.contactName || '—'}\nOwner: ${d.owner || '—'}\nLast Activity: ${d.lastActivity ? new Date(d.lastActivity).toLocaleDateString('en-GB') : '—'}\nStatus: ${d.status || '—'}\n`
        return out
      }

      return `Unknown entity type: ${entity_type}`
    } catch(e) { return `Error fetching ${entity_type}: ${e.message}` }
  }

  if (name === 'search_conversations') {
    const { query: q, limit=5 } = input;
    const all = await sbFetch('conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=50');
    const matches = (all||[]).filter(c =>
      JSON.stringify(c.messages||[]).toLowerCase().includes(q.toLowerCase())
    ).slice(0, limit);
    if (!matches.length) return { found:false };
    return { found:true, conversations: matches.map(c => ({
      title: c.title, date: c.updated_at,
      excerpt: (c.messages||[]).filter(m => JSON.stringify(m).toLowerCase().includes(q.toLowerCase()))
        .slice(0,3).map(m => ({role:m.role, content:(m.content||'').slice(0,200)}))
    }))};
  }
  if (name === 'navigate_page') {
    const { page, reason } = input;
    return { navigated: true, page, reason: reason || `Opening ${page}`, instruction: `NAVIGATION: Navigating to ${page}. Tell the user you're taking them there.` };
  }
  if (name === 'get_alerts') {
    const alerts = await sbFetch('kiko_alerts?dismissed=eq.false&expires_at=gt.' + new Date().toISOString() + '&select=type,severity,title,detail,entity_name&order=created_at.desc&limit=10')
    if (!alerts || alerts.length === 0) return 'No active alerts. Pipeline is clean.'
    return `${alerts.length} active alert${alerts.length > 1 ? 's' : ''}:\n${alerts.map(a => `[${a.severity?.toUpperCase()}] ${a.title}\n  ${a.detail}`).join('\n\n')}`
  }
  return { error: `Unknown tool: ${name}` };
}

// ── Main Handler ────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, conversationHistory = [], currentPage = 'home', pageEntity = null } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Inject datetime + page context into system prompt
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone:'Europe/London', hour:'2-digit', minute:'2-digit' });

  // Auto-fetch entity context if user is viewing a specific record
  let entityContext = ''
  if (pageEntity?.type && pageEntity?.id) {
    try {
      if (pageEntity.type === 'contact') {
        const rows = await sbFetch(`contacts?id=eq.${pageEntity.id}&select=data&limit=1`)
        if (rows?.[0]?.data) {
          const d = rows[0].data
          entityContext = `\n\nACTIVE CONTEXT — User is viewing contact: ${d.firstName || ''} ${d.lastName || ''}, ${d.title || '?'} at ${d.company || '?'}. Email: ${d.email || '—'}. LinkedIn: ${d.linkedin ? 'Yes' : 'No'}.`
        }
      } else if (pageEntity.type === 'company') {
        const rows = await sbFetch(`companies?id=eq.${pageEntity.id}&select=data&limit=1`)
        if (rows?.[0]?.data) {
          const d = rows[0].data
          entityContext = `\n\nACTIVE CONTEXT — User is viewing company: ${d.name || '?'}. Industry: ${d.industry || '?'}. Country: ${d.country || '?'}.${d.lastRound ? ` Last Round: ${d.lastRound}.` : ''}${d.totalFunding ? ` Total Funding: ${d.totalFunding}.` : ''}${d.employees ? ` Employees: ${d.employees}.` : ''}`
        }
      }
    } catch(e) { /* non-blocking */ }
  }

  const system = SYSTEM_PROMPT.replace('{currentPage}', currentPage)
    + `\n\n[Current: ${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + entityContext;

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();
  const write = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    // Build messages from history
    const messages = [];
    for (const m of conversationHistory.slice(-20)) {
      if (m.role === 'user' || m.role === 'assistant') messages.push({ role: m.role, content: m.content || '' });
    }
    messages.push({ role: 'user', content: message });

    // All tools: native (memory + web search) + custom
    const tools = [...NATIVE_TOOLS, ...CUSTOM_TOOLS];

    // Helper: stream one API call, emit text deltas live, return final message
    async function streamedCall(msgs) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL, max_tokens: 4096, system, messages: msgs,
        tools: [...NATIVE_TOOLS, ...CUSTOM_TOOLS],
        betas: ['context-management-2025-06-27'],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          write({ delta: event.delta.text });
        }
      }
      return await stream.finalMessage();
    }

    let response = await streamedCall(messages);
    let toolRounds = 0;
    const MAX_ROUNDS = 8;

    while (response.stop_reason === 'tool_use' && toolRounds < MAX_ROUNDS) {
      toolRounds++;
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          write({ toolStatus: `${block.name}...` });
          const result = block.name === 'memory'
            ? await handleMemory(block.input)
            : await executeTool(block.name, block.input);
          // Emit navigation event if navigate_page was called
          if (block.name === 'navigate_page' && result?.navigated) {
            write({ navigate: result.page });
          }
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 8000)
          });
        }
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await streamedCall(messages);
    }

    write({ meta: { done: true, model: MODEL, toolRounds } });
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[KIKO] Error:', err);
    write({ delta: `\n\nError: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
