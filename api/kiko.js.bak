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
- get_crm_data: Query contacts, deals, companies, tasks from the CRM
- search_conversations: Search past conversation history
- navigate_page: Navigate the user to any page in the platform. When the user says "show me the pipeline", "pull up deals", "go to contacts", etc., ALWAYS use this tool to navigate them there. You are the operating system — you control the interface.
- Web search: You have native web search. Use it for news, weather, market data, company research.
- Memory: You have a /memories directory. Check it before responding. Store important facts there.

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
  { name: 'get_crm_data', description: 'Query CRM: deals, contacts, companies, or tasks.',
    input_schema: { type: 'object', properties: {
      entity: { type: 'string', enum: ['deals', 'contacts', 'companies', 'tasks'], description: 'CRM entity to query' },
      filter: { type: 'string', description: 'Optional search term or stage filter' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    }, required: ['entity'] } },
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

// ── Custom Tool Executor ────────────────────────────────
async function executeTool(name, input) {
  if (name === 'get_crm_data') {
    const { entity, filter, limit=10 } = input;
    const data = await sbFetch(`${entity}?select=data&limit=${limit}&order=updated_at.desc`);
    if (!filter) return data || [];
    const f = filter.toLowerCase();
    return (data||[]).filter(d => JSON.stringify(d.data||{}).toLowerCase().includes(f)).slice(0, limit);
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

  const { message, conversationHistory = [], currentPage = 'home' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Inject datetime + page context into system prompt
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone:'Europe/London', hour:'2-digit', minute:'2-digit' });
  const system = SYSTEM_PROMPT.replace('{currentPage}', currentPage)
    + `\n\n[Current: ${dateStr}, ${timeStr} UK | Page: ${currentPage}]`;

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
