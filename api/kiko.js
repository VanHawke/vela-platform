// api/kiko.js — Kiko Prime: Clean Coordinator (v15.0)
// Routes to specialist agents. Does NOT execute tools directly.
// Down from 4000-token prompt to ~600 tokens. No competing instructions.
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch } from './kiko-tools.js';

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ── MCP Server Registry ──
async function getMcpServers(userEmail) {
  try {
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken(userEmail);
    if (!token) return [];
    return [
      { type: 'url', url: 'https://gmail.mcp.claude.com/mcp', name: 'gmail', authorization_token: token },
      { type: 'url', url: 'https://gcal.mcp.claude.com/mcp', name: 'google-calendar', authorization_token: token },
    ];
  } catch (err) {
    console.log('[MCP] Google token unavailable:', err.message);
    return [];
  }
}

// ── System Prompt — Clean Coordinator ──
const SYSTEM_PROMPT = `You are Kiko — the AI operating system for Van Hawke Group.
You work with Sunny Sidhu, CEO, based in Weybridge, UK. Never ask his name or location.

You are a COORDINATOR. You route requests to specialist agents and relay their results naturally. You never say "the agent said" — you speak as Kiko.

ROUTING (follow these in order):

1. SCREEN / PAGE questions → call ask_navigator
   "what's on screen", "what am I looking at", "describe this page", "where am I"

2. NAVIGATION → call ask_navigator
   "take me to", "go to", "show me", "open", "switch to"

3. CRM WRITES → call ask_deal_agent
   "move [company] to [stage]", "create a task", "add a reminder", "follow up with", "create a deal", "update [person]"

4. DATA QUERIES → call ask_data_agent
   Search contacts/companies/deals, entity details, pipeline stats, stale contacts, email analytics, outreach intelligence, news, partnership matrix, deal history, activity feed, past conversations, learning log

5. EMAIL / OUTREACH → call ask_outreach_agent
   Draft emails, Gmail drafts, follow-ups, recipient style, Lemlist campaigns

6. FILE GENERATION → call ask_document_agent
   Create docx/xlsx/pptx/csv, images, QR codes, export pipeline/contacts, read URLs

7. STRATEGIC QUESTIONS → call ask_strategy_agent
   "should we pursue X", "where is leverage", "kill or continue", "prioritise", "what matters most", "evaluate this"

8. NEGOTIATIONS → call ask_negotiation_agent
   Counter-offers, pricing pushback, concession strategy, "they came back at X", walk-away analysis

9. CATEGORY / SPONSORSHIP AVAILABILITY → call ask_category_agent
   "is X category open", "gaps on Haas", "can we sell Y category", "check for conflicts"

10. ENTITY RECALL → call ask_memory_engine
   "tell me everything about X", "what do we know about Y", "relationship summary for Z", pre-draft context gathering

11. FINANCIAL QUESTIONS → call ask_finance_agent
   "what's our pipeline worth", "weighted forecast", "revenue projection", "runway", financial analysis

12. BRIEFING / PRIORITIES → call ask_ea_agent
   "brief me", "what should I focus on", "morning brief", "prioritise my tasks", "any duplicates in tasks"

13. CALENDAR / GMAIL (direct read) → use MCP tools (gmail, google-calendar)

14. WEB SEARCH → use web_search tool directly

15. MEMORY → use memory tool directly (save important facts, check stored context)

STYLE: Direct, corporate, high-signal. No fluff. No "happy to help." Lead with value. Max 2-3 sentences for simple queries. Use "intelligent age" not "AI generation." All financials in USD.

OUTREACH DOCTRINE: 5-touch authority-led. No pricing in early outreach. No pleasantries. Board-level positioning. Scarcity by design.

PROACTIVE: When briefing, flag stale deals, recommend next actions, connect signals to opportunities. When you spot something important, save it to memory via ask_data_agent (operation: learning_save).

CURRENT PAGE: {currentPage}`;

// ── Page Roles (injected per page) ──
const PAGE_ROLES = {
  pipeline: '\nROLE: Sales Strategist. Prioritise by momentum and timing. Flag stale deals.',
  email: '\nROLE: Deal Strategist. Deals ranked by value × urgency. Recommend next actions.',
  contacts: '\nROLE: Relationship Manager. Surface connection history and engagement scores.',
  calendar: '\nROLE: Chief of Staff. Optimise schedule, flag conflicts, prep for meetings.',
  news: '\nROLE: Intelligence Analyst. Connect signals to sponsorship opportunities.',
  documents: '\nROLE: Research Analyst. Extract insights, cross-reference with opportunities.',
  'partnership-matrix': '\nROLE: Strategic Advisor. Analyse gaps, competitive positioning, target recommendations.',
  organisations: '\nROLE: Due Diligence. Assess profiles, funding, sponsorship readiness.',
  home: '\nROLE: Strategic Partner. Brief on top 3 priorities across pipeline, email, calendar.',
  tasks: '\nROLE: Task Manager. Prioritise, flag overdue, recommend actions.',
  lemlist: '\nROLE: Outreach Analyst. Campaign performance, warm leads, next actions.',
  'outreach-intelligence': '\nROLE: Deal Strategist. Command Centre — deals ranked by value × urgency.',
};

// ── Native Tools ──
const NATIVE_TOOLS = [
  { type: 'memory_20250818', name: 'memory' },
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5,
    user_location: { type: 'approximate', city: 'Weybridge', region: 'Surrey', country: 'GB', timezone: 'Europe/London' } },
];

// ── Memory Handler ──
async function handleMemory(input) {
  const { command, path, file_text, old_str, new_str, insert_line, new_content, view_range } = input;
  try {
    if (command === 'view') {
      if (!path || path === '/memories') {
        const rows = await sbFetch('kiko_memories?select=path,is_directory,content&order=path.asc');
        return 'Files in /memories:\n' + (rows || []).map(r => `${r.is_directory ? '4.0K' : `${((r.content||'').length/1024).toFixed(1)}K`}\t${r.path}`).join('\n');
      }
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content,is_directory&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      if (rows[0].is_directory) {
        const ch = await sbFetch(`kiko_memories?path=like.${encodeURIComponent(path+'/%')}&select=path,content&order=path.asc`);
        return (ch||[]).map(r => `${((r.content||'').length/1024).toFixed(1)}K\t${r.path}`).join('\n');
      }
      const lines = (rows[0].content||'').split('\n');
      if (view_range) { const [s,e] = view_range; return lines.slice(s-1,e).map((l,i)=>`${s+i}\t${l}`).join('\n'); }
      return lines.map((l,i)=>`${i+1}\t${l}`).join('\n');
    }
    if (command === 'create') {
      await sbFetch('kiko_memories', { method:'POST', headers:{Prefer:'resolution=merge-duplicates'}, body: JSON.stringify({path, content:file_text||'', is_directory:false, org_id:'35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at:new Date().toISOString()}) });
      return `Created ${path}`;
    }
    if (command === 'str_replace') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, { method:'PATCH', body: JSON.stringify({content:rows[0].content.replace(old_str, new_str), updated_at:new Date().toISOString()}) });
      return `Replaced in ${path}`;
    }
    if (command === 'insert') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      const lines = rows[0].content.split('\n'); lines.splice(insert_line, 0, new_content);
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, { method:'PATCH', body: JSON.stringify({content:lines.join('\n'), updated_at:new Date().toISOString()}) });
      return `Inserted at line ${insert_line} in ${path}`;
    }
    if (command === 'delete') {
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, {method:'DELETE'});
      return `Deleted ${path}`;
    }
    return `Unknown memory command: ${command}`;
  } catch(e) { return `Memory error: ${e.message}`; }
}

// ── Tool Status Labels ──
const TOOL_LABELS = {
  ask_navigator: 'Navigator: analysing...',
  ask_deal_agent: 'Deal Agent: executing...',
  ask_data_agent: 'Data Agent: querying...',
  ask_outreach_agent: 'Outreach Agent: drafting...',
  ask_document_agent: 'Document Agent: generating...',
  ask_memory_engine: 'Memory Engine: recalling...',
  ask_strategy_agent: 'Strategy Agent: evaluating...',
  ask_negotiation_agent: 'Negotiation Agent: analysing...',
  ask_category_agent: 'Category Control: checking...',
  ask_finance_agent: 'Finance Agent: analysing...',
  ask_ea_agent: 'Executive Assistant: briefing...',
  navigate_page: 'Navigating...',
  log_activity: 'Logging activity...',
  web_search: 'Searching the web...',
  memory: 'Checking memory...',
};

// ── Main Handler ──
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, pageContext = null, attachments = [], deepThink = false, personality = 'executive' } = req.body;
  if (!message && action !== 'title') return res.status(400).json({ error: 'message required' });

  // ── Title generation ──
  if (action === 'title') {
    try {
      const titleRes = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 20, messages: [{ role: 'user', content: `Generate a 3-5 word title for: "${(message || '').slice(0, 200)}". Reply with ONLY the title.` }] });
      return res.status(200).json({ title: titleRes.content?.[0]?.text?.trim() || message?.slice(0, 40) });
    } catch { return res.status(200).json({ title: message?.slice(0, 40) }); }
  }

  // ── Build system prompt ──
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone:'Europe/London', hour:'2-digit', minute:'2-digit' });
  const entityContext = await fetchEntityContext(pageEntity);
  const pageRole = PAGE_ROLES[currentPage] || '';

  // Load relevant skills
  let skillsContext = '';
  try {
    const skills = await sbFetch('kiko_skills?is_active=eq.true&select=name,trigger_keywords,content');
    if (skills?.length) {
      const msgLower = (message || '').toLowerCase();
      const matched = skills.filter(s => s.trigger_keywords?.some(kw => msgLower.includes(kw)));
      if (matched.length > 0) {
        skillsContext = '\n\n── DOMAIN EXPERTISE ──\n' + matched.map(s => `[${s.name}]\n${s.content}`).join('\n\n');
      }
    }
  } catch {}

  // Voice mode adjustments
  let voiceRules = '';
  let preloadedMemory = '';
  if (currentPage === 'voice') {
    try {
      const memRows = await sbFetch('kiko_memories?select=path,content&is_directory=eq.false&path=in.(%22/memories/sunny_profile.md%22,%22/memories/identity.md%22)&order=path.asc');
      if (memRows?.length) preloadedMemory = '\n\n── MEMORY ──\n' + memRows.map(r => r.content).join('\n\n');
    } catch {}
    voiceRules = '\n\nVOICE MODE: Max 2-3 sentences. No markdown. Say numbers naturally. Memory already loaded — only save new facts.';
  }

  const PERSONALITIES = {
    concise: '\nSTYLE: Ultra-concise. Max 2-3 sentences. Bullet points preferred.',
    analytical: '\nSTYLE: Analytical. Show reasoning. Include data, comparisons, evidence.',
    warm: '\nSTYLE: Warm and encouraging. Acknowledge efforts, frame challenges constructively.',
    executive: '\nSTYLE: Board-level. Direct, strategic. Lead with conclusion, support with evidence.',
  };

  const system = SYSTEM_PROMPT.replace('{currentPage}', currentPage)
    + `\n[${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + (pageContext?.summary ? `\n[Context: ${pageContext.summary}${pageContext.stageDistribution ? ` | Stages: ${JSON.stringify(pageContext.stageDistribution)}` : ''}${pageContext.visibleItems ? `\nVisible: ${pageContext.visibleItems}` : ''}]` : '')
    + (PERSONALITIES[personality] || PERSONALITIES.executive)
    + pageRole + entityContext + skillsContext + voiceRules + preloadedMemory;

  // ── SSE setup ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();
  const write = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    // Build messages
    const messages = conversationHistory.slice(-20)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content || '' }));

    // File attachments
    if (attachments.length > 0) {
      const contentBlocks = [];
      for (const att of attachments) {
        if (att.type === 'image') contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } });
        else if (att.type === 'document' && att.mediaType === 'application/pdf') contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } });
        else if (att.type === 'text') contentBlocks.push({ type: 'text', text: `[File: ${att.fileName || 'uploaded'}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      }
      contentBlocks.push({ type: 'text', text: message || 'Analyse this file.' });
      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const allTools = [...NATIVE_TOOLS, ...TOOL_DEFINITIONS];

    // Deep think detection
    const DEEP_TRIGGERS = ['analyse', 'analyze', 'deep dive', 'think through', 'strategic', 'evaluate', 'comprehensive'];
    const needsDeepThink = deepThink || (message && DEEP_TRIGGERS.some(t => message.toLowerCase().includes(t)));

    // MCP servers
    const mcpServers = await getMcpServers(userEmail);
    if (mcpServers.length > 0) write({ toolStatus: `MCP: ${mcpServers.length} servers connected` });

    // Stream helper
    async function streamCall(msgs, opts = {}) {
      const params = {
        model: needsDeepThink ? 'claude-opus-4-6' : MODEL,
        max_tokens: needsDeepThink ? 16000 : 4096,
        system, messages: msgs, tools: opts.noTools ? undefined : allTools,
      };
      if (mcpServers.length > 0 && !opts.noTools) {
        params.mcp_servers = mcpServers;
        params.tools = [...(params.tools || []), ...mcpServers.map(s => ({ type: 'mcp_toolset', mcp_server_name: s.name }))];
      }
      if (needsDeepThink) {
        params.thinking = { type: 'enabled', budget_tokens: 10000 };
        write({ toolStatus: 'Deep analysis...' });
      }
      const stream = mcpServers.length > 0
        ? anthropic.beta.messages.stream({ ...params, betas: ['mcp-client-2025-11-20'] })
        : anthropic.beta.messages.stream(params);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') write({ delta: event.delta.text });
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') write({ thinking: event.delta.thinking });
        if (event.type === 'content_block_start' && event.content_block?.type === 'mcp_tool_use') write({ toolStatus: `MCP: ${event.content_block.name || 'calling'}...` });
        if (event.type === 'content_block_start' && event.content_block?.type === 'mcp_tool_result') write({ toolStatus: null });
      }
      return await stream.finalMessage();
    }

    write({ toolStatus: 'Thinking...' });
    let response = await streamCall(messages);
    let toolRounds = 0;

    // Tool execution loop — max 10 rounds
    while (response.stop_reason === 'tool_use' && toolRounds < 10) {
      toolRounds++;
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        write({ toolStatus: TOOL_LABELS[block.name] || `Running ${block.name}...` });
        const result = block.name === 'memory'
          ? await handleMemory(block.input)
          : await executeTool(block.name, block.input, userEmail, pageContext);
        // Handle navigation from any tool
        if ((block.name === 'navigate_page' || block.name === 'ask_navigator') && result?.navigated) write({ navigate: result.page });
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 8000)
        });
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await streamCall(messages);
    }

    // Safety: if tool limit hit, force text-only
    if (response.stop_reason === 'tool_use') {
      const finalResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        write({ toolStatus: TOOL_LABELS[block.name] || 'Finishing...' });
        const result = block.name === 'memory' ? await handleMemory(block.input) : await executeTool(block.name, block.input, userEmail, pageContext);
        finalResults.push({ type: 'tool_result', tool_use_id: block.id, content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 4000) });
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: finalResults });
      write({ toolStatus: 'Composing response...' });
      const finalStream = anthropic.beta.messages.stream({ model: MODEL, max_tokens: 4096, system, messages });
      for await (const event of finalStream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') write({ delta: event.delta.text });
      }
    }

    write({ meta: { done: true, model: needsDeepThink ? 'claude-opus-4-6' : MODEL, toolRounds, version: 'v15.0' } });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[KIKO] Error:', err);
    write({ delta: `\n\nError: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
