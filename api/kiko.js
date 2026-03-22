// api/kiko.js — Kiko AI engine: Claude + tools, streaming SSE
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch } from './kiko-tools.js';

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ── System Prompt ────────────────────────────────────────
const SYSTEM_PROMPT = `You are Kiko — the AI engine powering a sponsorship operations platform for Van Hawke Group. You work with Sunny Sidhu, CEO, who manages F1 and Formula E sponsorship advisory for clients including Haas F1 Team.

CRITICAL — YOU ALWAYS KNOW THE USER:
- The user is ALWAYS Sunny Sidhu. Never ask for their name. Never say you don't know who they are.
- Sunny is based in Weybridge, Surrey, UK. When asked about weather, local info, or anything location-dependent, use Weybridge UK automatically — NEVER ask for location.
- Address Sunny by name naturally. You know him. You work together.

MEMORY — USE IT PROACTIVELY:
- At the START of every conversation, use the memory tool to read /memories to load any saved context.
- When Sunny mentions preferences, decisions, key facts, deadlines — save them to memory immediately.
- When Sunny says "remember this" or asks if you remember something — check memory first, then respond.
- Memory persists across ALL conversations. You have continuity. Use it.
- When resuming a conversation or referencing previous discussions, check memory for relevant context.

CAPABILITIES:
- Email: You can search and read Gmail, draft emails, analyse communication patterns via tools. These are CONNECTED, WORKING API integrations. Use them immediately when asked — never say you can't access emails.
- CRM: You can query contacts, companies, pipelines, activities, deals in Supabase.
- Web: You have native web search for news, company info, F1 updates, weather.
- Calendar: You can check and create calendar events.
- Documents: You can search uploaded documents (decks, proposals, briefs).
- Memory: You have persistent memory across ALL conversations. Read /memories at conversation start. Save important facts proactively.
- Navigation: You control the UI. When asked to "show", "go to", "pull up" a page — use navigate_page.

IDENTITY:
- You are Kiko. Never refer to yourself as Claude, an AI assistant, or a chatbot.
- You are direct, precise, commercially minded. A strategic partner.
- Never waste words. Never say "great question." Lead with value.

COMMUNICATION STYLE:
- Direct, corporate, high-signal. No fluff.
- Never say "I hope you're well" or "happy to help"
- Use "intelligent age" not "AI generation"
- All financials in USD
- Be specific with data — names, dates, amounts
- When briefing, lead with the most actionable item
- Max 2-3 sentences for simple queries. Expand only when depth is warranted.

USER: Sunny Sidhu — CEO of Van Hawke Group. Based in Weybridge, UK.

OUTREACH DOCTRINE:
- 5-touch authority-led sequence
- No pricing in early-stage outreach
- Never reference secured funding unless confirmed
- Scarcity by design, board-level platform positioning

TOOL USAGE: Use tools proactively. FIRST ACTION in any new conversation: use memory tool to read /memories. When user mentions a person → search_contacts. Company → search_companies. Emails → search_emails. Pipeline → search_deals. "Brief me on X" → get_entity_detail. Weather/local → use web_search with Weybridge UK. Chain tools for depth.

MEMORY: At the start of every new conversation, use the memory tool to check /memories for any stored context about the user. Proactively save important facts (preferences, decisions, key dates, project updates) to memory. When user says "remember this" or mentions something important, write it to memory immediately. You have PERMANENT long-term memory — use it.

DOCUMENT KNOWLEDGE INGESTION: When the user uploads a document (PDF, image, deck, contract, report):
1. Analyse it thoroughly and respond with key insights.
2. AUTOMATICALLY save the most important extracted facts to memory using the memory tool.
3. Identify the document type and extract accordingly:

   CONTRACT / LEGAL: Save to /memories/contracts/[company_name].md
   → Parties, effective date, term length, renewal terms, termination clauses
   → Key obligations, restrictive covenants, liability caps, IP ownership
   → Financial terms (fees, royalties, minimum guarantees)
   → Deadlines, notice periods, critical dates
   → Risk areas and unusual clauses

   PITCH DECK / PARTNERSHIP PROPOSAL: Save to /memories/partnerships/[company_name].md
   → Company overview, valuation, funding stage
   → Audience data, reach metrics, demographic breakdown
   → Partnership structure, asset inventory, pricing tiers
   → Strategic fit assessment, competitive positioning
   → Key contacts and decision-makers mentioned

   FINANCIAL MODEL / REPORT: Save to /memories/financials/[topic].md
   → Revenue figures, projections, growth rates
   → Cost structure, margins, unit economics
   → Key assumptions, scenarios, sensitivities
   → Benchmarks and comparisons

   RESEARCH / INTELLIGENCE: Save to /memories/research/[topic].md
   → Key findings, data points, trends
   → Market size, competitive landscape
   → Actionable insights, recommendations
   → Sources and methodology

   GENERAL DOCUMENT: Save to /memories/documents.md (append)
   → Document name, date, key facts, entities mentioned

4. Never ask "should I save this?" — always save proactively.
5. After saving, confirm what was stored and suggest follow-up questions.

LEARNING: When the user teaches you something through speech or text — industry knowledge, competitive intelligence, strategic preferences, relationship context — save it to memory immediately. Build a growing knowledge base that makes you more valuable over time. Store learnings in appropriate memory files (e.g., /memories/industry_knowledge.md, /memories/strategic_preferences.md, /memories/relationship_context.md).

PREDICTIVE BEHAVIOUR: Proactively identify and surface insights without being asked:
- When on Pipeline page: flag deals with no activity in 7+ days, suggest next actions based on deal stage
- When on Email page: identify unanswered threads, suggest follow-up timing based on past patterns
- When on Contacts page: surface contacts not touched in 30+ days who are in active deals
- When briefing: lead with the most time-sensitive item first, then highest-value opportunity
- When analysing a company: cross-reference with existing pipeline, contacts, and email history
- When reviewing documents: connect insights to active opportunities and suggest strategic moves
- When asked "brief me" or on homepage: check deals, emails, calendar, and news — surface the top 3 actionable items
- Save observations about patterns to /memories/patterns.md (e.g., "Cybersecurity companies respond best to Tuesday outreach", "Series B+ companies convert 3x higher")
- When you notice a pattern across multiple interactions, proactively share the insight

LOCATION: The user is based in Weybridge, Surrey, UK. When asked about weather, local info, time, or anything location-dependent, use this location automatically — never ask.

CURRENT PAGE: {currentPage}`;

// ── Page-specific role identity ──────────────────────────
const PAGE_ROLES = {
  pipeline: '\n\nROLE: Sales Strategist. Prioritise deals by momentum and timing. Flag stale opportunities. Recommend next actions per deal stage. Think like a VP of Sales.',
  email: '\n\nROLE: Communications Advisor. Analyse email patterns, draft responses that match Sunny\'s voice (direct, board-level, no fluff). Flag unanswered threads. Recommend outreach timing.',
  contacts: '\n\nROLE: Relationship Manager. Surface connection history, last touchpoints, engagement scores. Recommend who to contact and why. Think like a Chief of Staff.',
  calendar: '\n\nROLE: Chief of Staff. Optimise schedule, flag conflicts, suggest prep for upcoming meetings. Think about what Sunny needs to know before each meeting.',
  news: '\n\nROLE: Intelligence Analyst. Connect news signals to sponsorship opportunities. Identify companies in expansion mode, leadership changes, funding rounds that create partnership windows.',
  documents: '\n\nROLE: Research Analyst. Extract insights from uploaded materials. Cross-reference with existing knowledge. Identify strategic implications and actionable takeaways.',
  'partnership-matrix': '\n\nROLE: Strategic Advisor. Analyse partnership fit, competitive positioning, market gaps. Recommend high-value targets based on category alignment and timing.',
  organisations: '\n\nROLE: Due Diligence Analyst. Assess company profiles, funding history, market position. Identify sponsorship readiness signals and decision-maker access points.',
  home: '\n\nROLE: Strategic Partner. Brief Sunny on what matters most today. Proactively surface the top 3 priorities across pipeline, email, and calendar.',
};

// ── Native Tools ─────────────────────────────────────────
const NATIVE_TOOLS = [
  { type: 'memory_20250818', name: 'memory' },
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5,
    user_location: { type: 'approximate', city: 'Weybridge', region: 'Surrey', country: 'GB', timezone: 'Europe/London' } },
];

// ── Memory Tool Handler ──────────────────────────────────
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
      if (view_range) { const [s,e] = view_range; return lines.slice(s-1,e).map((l,i)=>`${s+i}\t${l}`).join('\n'); }
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
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}`, { method:'PATCH',
        body: JSON.stringify({content:rows[0].content.replace(old_str, new_str), updated_at:new Date().toISOString()}) });
      return `Replaced in ${path}`;
    }
    if (command === 'insert') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      const lines = rows[0].content.split('\n'); lines.splice(insert_line, 0, new_content);
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

// ── Tool Status Labels ───────────────────────────────────
const TOOL_LABELS = {
  search_contacts: 'Searching contacts', search_companies: 'Searching companies',
  search_deals: 'Searching deals', get_entity_detail: 'Loading record details',
  search_emails: 'Searching emails', get_email_thread: 'Reading email thread',
  draft_email: 'Drafting email', get_email_analytics: 'Analysing email data',
  get_calendar: 'Checking calendar', create_calendar_event: 'Creating event',
  get_stale_contacts: 'Finding stale contacts', generate_followup: 'Generating follow-up',
  get_followup_queue: 'Loading follow-up queue', get_alerts: 'Checking alerts',
  get_news: 'Scanning news feed', get_partnership_matrix: 'Querying partnership matrix',
  get_pipeline_notifications: 'Loading pipeline activity', navigate_page: 'Navigating',
  web_search: 'Searching the web', memory: 'Checking memory',
  search_documents: 'Searching documents', get_deal_history: 'Loading deal history',
  get_skills: 'Loading expertise',
};

// ── Main Handler ─────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, attachments = [], deepThink = false } = req.body;
  if (!message && action !== 'title') return res.status(400).json({ error: 'message required' });

  // ── Title generation ──
  if (action === 'title') {
    try {
      const titleRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 20,
        messages: [{ role: 'user', content: `Generate a 3-5 word title for a chat that started with: "${(message || '').slice(0, 200)}". Reply with ONLY the title, no punctuation, no quotes.` }]
      });
      return res.status(200).json({ title: titleRes.content?.[0]?.text?.trim() || message?.slice(0, 40) });
    } catch { return res.status(200).json({ title: message?.slice(0, 40) }); }
  }

  // ── Build system prompt with context ──
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone:'Europe/London', hour:'2-digit', minute:'2-digit' });
  const entityContext = await fetchEntityContext(pageEntity);

  // ── Load relevant skills based on message keywords ──
  let skillsContext = '';
  try {
    const skills = await sbFetch('kiko_skills?is_active=eq.true&select=name,trigger_keywords,content');
    if (skills?.length) {
      const msgLower = (message || '').toLowerCase();
      const matched = skills.filter(s => s.trigger_keywords?.some(kw => msgLower.includes(kw)));
      if (matched.length > 0) {
        skillsContext = '\n\n── DOMAIN EXPERTISE (loaded for this query) ──\n' +
          matched.map(s => `[${s.name}]\n${s.content}`).join('\n\n');
      }
    }
  } catch (e) { console.error('[KIKO] Skills load error:', e.message); }

  // ── Voice mode: pre-load memory to avoid slow tool calls ──
  let voiceRules = '';
  let preloadedMemory = '';
  if (currentPage === 'voice') {
    try {
      const memRows = await sbFetch('kiko_memories?select=path,content&is_directory=eq.false&path=in.(%22/memories/sunny_profile.md%22,%22/memories/identity.md%22)&order=path.asc');
      if (memRows?.length) {
        preloadedMemory = '\n\n── YOUR MEMORY ──\n' +
          memRows.map(r => r.content).join('\n\n');
      }
    } catch (e) { console.error('[KIKO] Memory preload error:', e.message); }
    voiceRules = `\n\nVOICE MODE — STRICT RULES:
- Maximum 2-3 sentences. NEVER more than 4 sentences.
- NO markdown, NO bullet points, NO headers, NO formatting. Plain spoken language only.
- Say numbers naturally ("two point five million" not "$2,500,000").
- Limit lists to top 3 items only.
- Your memory is ALREADY LOADED in this prompt — do NOT call the memory tool to read/view.
- Only use memory tool to SAVE new facts when Sunny tells you something worth remembering.
- Be conversational and warm, like a trusted colleague.`;
  }

  const pageRole = PAGE_ROLES[currentPage] || PAGE_ROLES[currentPage.split('?')[0]] || '';

  const system = SYSTEM_PROMPT.replace('{currentPage}', currentPage)
    + `\n\n[Current: ${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + pageRole + entityContext + skillsContext + voiceRules + preloadedMemory;

  // ── SSE setup ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();
  const write = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    // Build messages from conversation history
    const messages = conversationHistory.slice(-20)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content || '' }));

    // Build user message — with file attachments if present
    if (attachments.length > 0) {
      const contentBlocks = [];
      for (const att of attachments) {
        if (att.type === 'image') {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } });
        } else if (att.type === 'document' && att.mediaType === 'application/pdf') {
          contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } });
        } else if (att.type === 'text') {
          // Text content decoded from base64 and sent as text
          contentBlocks.push({ type: 'text', text: `[File: ${att.fileName || 'uploaded file'}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
        }
      }
      contentBlocks.push({ type: 'text', text: message || 'Analyse this file.' });
      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const allTools = [...NATIVE_TOOLS, ...TOOL_DEFINITIONS];

    // Detect if deep thinking is needed
    const DEEP_THINK_TRIGGERS = ['analyse', 'analyze', 'deep dive', 'think through', 'strategic', 'evaluate', 'compare', 'assess', 'due diligence', 'comprehensive', 'thorough']
    const needsDeepThink = deepThink || (message && DEEP_THINK_TRIGGERS.some(t => message.toLowerCase().includes(t)))

    // Stream helper
    async function streamCall(msgs) {
      const params = {
        model: needsDeepThink ? 'claude-opus-4-6' : MODEL, max_tokens: needsDeepThink ? 16000 : 4096, system, messages: msgs, tools: allTools,
      }
      if (needsDeepThink) {
        params.thinking = { type: 'enabled', budget_tokens: 10000 }
        write({ toolStatus: 'Deep analysis...' })
      }
      const stream = anthropic.beta.messages.stream(params);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          write({ delta: event.delta.text });
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
          write({ thinking: event.delta.thinking });
        }
      }
      return await stream.finalMessage();
    }

    write({ toolStatus: 'Thinking...' });
    let response = await streamCall(messages);
    let toolRounds = 0;

    // Tool execution loop
    while (response.stop_reason === 'tool_use' && toolRounds < 8) {
      toolRounds++;
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        write({ toolStatus: TOOL_LABELS[block.name] || `Running ${block.name}` });
        const result = block.name === 'memory'
          ? await handleMemory(block.input)
          : await executeTool(block.name, block.input, userEmail);
        if (block.name === 'navigate_page' && result?.navigated) write({ navigate: result.page });
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

    write({ meta: { done: true, model: MODEL, toolRounds, version: 'v4' } });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[KIKO] Error:', err);
    write({ delta: `\n\nError: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
