import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch } from './kiko-tools.js';

export const config = { supportsResponseStreaming: true };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-6';
const MEM0_KEY = process.env.MEM0_API_KEY || process.env.MEM0_KEY || '';
const MEM0_USER = 'sunny-vanhawke';

// ── Mem0 Cross-Session Memory ───────────────────────────
async function mem0Search(query) {
  if (!MEM0_KEY) return []
  try {
    const r = await fetch('https://api.mem0.ai/v2/memories/search/', {
      method: 'POST',
      headers: { 'Authorization': `Token ${MEM0_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id: MEM0_USER, limit: 5 })
    })
    if (!r.ok) return []
    const data = await r.json()
    return (data.results || data || []).slice(0, 5).map(m => m.memory || m.text || '').filter(Boolean)
  } catch(e) { return [] }
}

async function mem0Add(userMsg, assistantMsg) {
  if (!MEM0_KEY) return
  try {
    fetch('https://api.mem0.ai/v2/memories/', {
      method: 'POST',
      headers: { 'Authorization': `Token ${MEM0_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: userMsg },
          { role: 'assistant', content: assistantMsg.slice(0, 2000) }
        ],
        user_id: MEM0_USER,
        version: 'v2'
      })
    }) // fire-and-forget — don't await
  } catch(e) { /* non-blocking */ }
}

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

// ── Custom Tools: imported as TOOL_DEFINITIONS from kiko-tools.js


// ── Supabase: imported from kiko-tools.js ───────────────

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

// ── CRM Tools: imported from kiko-tools.js ──────────────


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

  // Auto-fetch entity context (imported from kiko-tools.js)
  const entityContext = await fetchEntityContext(pageEntity)

  // Search Mem0 for relevant cross-session memories
  let memoryContext = ''
  const memories = await mem0Search(message)
  if (memories.length > 0) {
    memoryContext = `\n\nCROSS-SESSION MEMORY (from previous conversations):\n${memories.map(m => `- ${m}`).join('\n')}`
  }

  const system = SYSTEM_PROMPT.replace('{currentPage}', currentPage)
    + `\n\n[Current: ${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + entityContext
    + memoryContext;

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
    const tools = [...NATIVE_TOOLS, ...TOOL_DEFINITIONS];

    // Helper: stream one API call, emit text deltas live, return final message
    async function streamedCall(msgs) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL, max_tokens: 4096, system, messages: msgs,
        tools: [...NATIVE_TOOLS, ...TOOL_DEFINITIONS],
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

    // Store conversation in Mem0 (fire-and-forget)
    const finalText = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    if (finalText) mem0Add(message, finalText)

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
