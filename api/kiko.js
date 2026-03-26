// api/kiko.js — Kiko Prime: Coordinator with Intent Classification (Phase 1)
// Step 1: Haiku classifies intent (~100ms)
// Step 2: Deterministic navigation OR agent dispatch OR full tool loop
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch } from './kiko-tools.js';
import { classifyIntent, INTENT_TO_AGENT } from './agents/intent-classifier.js';
import { describeScreen } from './agents/screen-reader.js';

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// Phase 8: Learning Loop — log decisions for pattern matching
const DECISION_TOOLS = ['ask_strategy_agent', 'ask_deal_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];
async function logDecision(toolName, toolInput, toolResult, userMessage) {
  if (!DECISION_TOOLS.includes(toolName)) return;
  try {
    const agent = toolName.replace('ask_', '').replace('_agent', '');
    const entity = toolInput?.company || toolInput?.query || toolInput?.situation || '';
    const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
    await sbFetch('kiko_learning_log', {
      method: 'POST',
      body: JSON.stringify({
        category: 'decision',
        content: `[${agent}] Q: ${(userMessage || '').slice(0, 100)} | A: ${resultStr.slice(0, 400)}`,
        entity_name: (typeof entity === 'string' ? entity : '').slice(0, 100) || null,
      })
    });
  } catch {} // Non-blocking — logging failure must never break responses
}

// Phase 18: Output tracking — measure agent quality over time
async function trackOutput(toolName, intent, userMessage, result) {
  try {
    const agent = toolName ? toolName.replace('ask_', '').replace('_agent', '') : 'general';
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    await sbFetch('kiko_output_tracking', {
      method: 'POST',
      body: JSON.stringify({
        user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
        agent, intent: intent || 'unknown',
        user_message: (userMessage || '').slice(0, 150),
        output_preview: resultStr.slice(0, 300),
      })
    });
  } catch {} // Non-blocking
}

// Phase 19: Thought journal — extract and persist strategic insights
const INSIGHT_TOOLS = ['ask_strategy_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];
async function journalInsight(toolName, toolInput, toolResult, userMessage) {
  if (!INSIGHT_TOOLS.includes(toolName)) return;
  try {
    const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
    // Extract entities mentioned
    const entities = [];
    const entityPattern = /(?:Cloudflare|Palo Alto|Nordic|Torq|Decagon|Haas|Broadcom|Infineon|Fastly|Attio|Team8)/gi;
    const matches = (userMessage + ' ' + resultStr).match(entityPattern);
    if (matches) entities.push(...[...new Set(matches.map(m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()))]);
    // Determine topic from intent
    const topic = toolInput?.question?.slice(0, 80) || toolInput?.situation?.slice(0, 80) || (userMessage || '').slice(0, 80);
    await sbFetch('kiko_thought_journal', {
      method: 'POST',
      body: JSON.stringify({
        user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
        topic: topic,
        insight: resultStr.slice(0, 500),
        related_entities: entities.slice(0, 5),
        confidence: 0.7,
      })
    });
  } catch {} // Non-blocking
}

// Conversation Memory: extract insights after a conversation completes
async function extractConversationInsights(message, fullResponse, intent) {
  if (!message || !fullResponse || fullResponse.length < 100) return;
  if (['navigate', 'screen'].includes(intent)) return; // Skip trivial intents
  try {
    const extract = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system: 'Extract key facts, decisions, and open threads from this conversation exchange. Return ONLY valid JSON: { "key_facts": ["..."], "decisions_made": ["..."], "open_threads": ["things left unresolved or to revisit"], "entities": ["company/person names mentioned"] }. Maximum 3 items per array. If nothing significant, return empty arrays.',
      messages: [{ role: 'user', content: `USER: ${message.slice(0, 300)}\n\nKIKO: ${fullResponse.slice(0, 600)}` }],
    });
    const raw = (extract.content[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    const hasContent = (parsed.key_facts?.length || 0) + (parsed.decisions_made?.length || 0) + (parsed.open_threads?.length || 0);
    if (!hasContent) return;
    await sbFetch('kiko_conversation_insights', {
      method: 'POST', body: JSON.stringify({
        user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
        key_facts: parsed.key_facts || [], decisions_made: parsed.decisions_made || [],
        open_threads: parsed.open_threads || [], entities_discussed: parsed.entities || [],
        summary: `${(parsed.key_facts || []).join('; ')}`.slice(0, 200),
      })
    });
  } catch {} // Non-blocking
}

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

5. EMAIL / OUTREACH DRAFTING → call ask_outreach_agent
   Draft emails, Gmail drafts, follow-ups, recipient style, add lead to Lemlist campaign

5b. LEMLIST LIVE DATA → call ask_lemlist_live
   Campaign stats, open rates, reply rates, warm leads, bounced leads, lead search in Lemlist, credit balance, deliverability check, intent signals, "how is the Haas campaign doing", "show me Lemlist stats", "who clicked", "any warm leads"

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

13. LEGAL / CONTRACTS → call ask_legal_agent
   Contract review, clause analysis, risk flagging, obligation tracking

14. DISPUTES → call ask_dispute_agent
   Active disputes, procedural responses, leverage tracking, landlord/CDDA issues

15. CONTENT → call ask_content_agent
   LinkedIn posts, SponsorSignal, case studies, newsletters, thought leadership

16. INVESTMENT / CAPITAL → call ask_investment_agent
   Valuation, raise strategy, dilution, investor narrative, due diligence prep

17. PRICING / ROI → call ask_pricing_agent
   Sponsorship benchmarks, ROI cases, "how much should we charge"

18. SIGNALS → call ask_signal_agent
   Recent deal signals, funding events, hiring spikes, "what signals this week"

19. TRAVEL → call ask_travel_agent
   F1/FE race travel, trip planning, visa awareness

20. SPECIALIST (website/product/IP) → call ask_specialist_agent
   Digital presence, Maison product lifecycle, IP/licensing questions

21. DEEP RESEARCH → use web_search tool directly (run 5-8 searches, synthesise)
   "research [company]", "deep dive on [X]", "deep research". Run multiple web searches systematically: company overview, funding, leadership, news, competitors, partnerships. Synthesise into structured brief with sections: OVERVIEW, KEY PEOPLE, RECENT DEVELOPMENTS, FINANCIAL POSITION, PARTNERSHIP SIGNALS, RECOMMENDED APPROACH.

22. CALENDAR / GMAIL (direct read) → use MCP tools (gmail, google-calendar)

23. WEB SEARCH → use web_search tool directly

24. MEMORY → use memory tool directly (save important facts, check stored context)

STYLE: Direct, corporate, high-signal. No fluff. No "happy to help." Lead with value. Max 2-3 sentences for simple queries. Use "intelligent age" not "AI generation." All financials in USD.

EMAIL DRAFTS: When drafting any email, ALWAYS format with Subject: and To: on separate lines at the top, followed by the body. Example:
Subject: Haas F1 Team — Exclusive Partnership Category
To: ryan@decagon.ai

Dear Ryan,
[body]

Best regards,
Sunny Sidhu
This format triggers the draft preview panel with Copy, Send to Gmail, and tone adjustment options.

OUTREACH DOCTRINE: 5-touch authority-led. No pricing in early outreach. No pleasantries. Board-level positioning. Scarcity by design.

PROACTIVE: When briefing, flag stale deals, recommend next actions, connect signals to opportunities. When you spot something important, save it to memory via ask_data_agent (operation: learning_save).

IMAGE ANALYSIS: You CAN see and analyse uploaded images. When a user uploads an image (screenshot, photo, document scan), describe what you see and provide relevant analysis. Do NOT say you cannot view images — the image data is sent to you directly.

ERROR HANDLING: If an agent returns an error, tell Sunny the agent failed and what went wrong. Do NOT attempt to handle the task yourself — you are a coordinator, not an executor. Say "The [Agent Name] hit an error: [details]. Let me know if you want me to try again."

CURRENT PAGE: {currentPage}`;

// ── Page Roles (injected per page) ──
const PAGE_ROLES = {
  pipeline: '\nROLE: Sales Strategist. Prioritise by momentum and timing. Flag stale deals.',
  email: '\nROLE: Deal Strategist. Deals ranked by value × urgency. Recommend next actions.',
  contacts: '\nROLE: Relationship Manager. Surface connection history and engagement scores.',
  calendar: '\nROLE: Chief of Staff. F1/FE race calendar, pre-race outreach windows, schedule optimisation.',
  'partnership-matrix': '\nROLE: Strategic Advisor. Partnership Detection Engine auto-scans F1 team websites daily. Analyse gaps, competitive positioning, new partner announcements, target recommendations.',
  organisations: '\nROLE: Due Diligence. Assess profiles, funding, sponsorship readiness.',
  home: '\nROLE: Strategic Partner. Brief on top 3 priorities across pipeline, email, calendar.',
  lemlist: '\nROLE: Outreach Analyst. Use ask_lemlist_live for campaign stats, warm leads, deliverability. Use ask_outreach_agent for drafting emails and adding leads.',
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
  ask_legal_agent: 'Legal Agent: reviewing...',
  ask_dispute_agent: 'Dispute Agent: analysing...',
  ask_content_agent: 'Content Agent: generating...',
  ask_investment_agent: 'Investment Agent: modelling...',
  ask_pricing_agent: 'Pricing Agent: benchmarking...',
  ask_signal_agent: 'Signal Agent: scanning...',
  ask_travel_agent: 'Travel Agent: planning...',
  ask_specialist_agent: 'Specialist Agent: processing...',
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

  const { message, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, pageContext = null, attachments = [], deepThink = false, personality = 'executive', voiceMode = false } = req.body;
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

  // Skills removed from Prime — domain expertise lives inside specialist agents.
  // Loading skills here caused Prime to attempt tasks directly instead of routing to agents.

  // Voice mode adjustments
  let voiceRules = '';
  let preloadedMemory = '';
  if (voiceMode || currentPage === 'voice') {
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
    + pageRole + entityContext + voiceRules + preloadedMemory;

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

    // ── PHASE 1: Intent Classification ──
    const classification = await classifyIntent(message, currentPage);
    const { intent, target } = classification;

    // Handle deterministic navigation — no Claude needed
    if (intent === 'navigate' && target) {
      write({ navigate: target });
      write({ delta: `Opening ${target.replace(/-/g, ' ')}.` });
      write({ meta: { done: true, model: 'classifier', intent: 'navigate', version: 'v16.1' } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Handle screen description — live Supabase data, no stale pageContext
    if (intent === 'screen') {
      write({ toolStatus: 'Reading screen data...' });
      const screenData = await describeScreen(currentPage);
      write({ toolStatus: null });
      // Inject live data and let Claude compose a natural response
      const screenSystem = system + `\n\n[LIVE SCREEN DATA — describe this naturally to Sunny, highlight what matters most]:\n${screenData}`;
      const screenStream = anthropic.beta.messages.stream({
        model: MODEL, max_tokens: 600, system: screenSystem, messages,
      });
      for await (const event of screenStream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') write({ delta: event.delta.text });
      }
      write({ meta: { done: true, model: MODEL, intent: 'screen', version: 'v16.1' } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Inject routing hint into system prompt for non-trivial intents
    const agentMapping = INTENT_TO_AGENT[intent];
    let routingHint = '';
    if (agentMapping?.tool) {
      routingHint = `\n\n[ROUTING HINT: This message was classified as "${intent}". Use the ${agentMapping.tool} tool to handle it. Call it immediately — do not deliberate.]`;
    } else if (intent === 'general') {
      routingHint = '\n\n[ROUTING HINT: This is a general question. Answer directly from your knowledge. Do not call any tools unless the user explicitly asks for data.]';
    }

    // For general queries, inject live CRM context so Claude has business awareness
    if (intent === 'general') {
      try {
        const [gDeals, gTasks, gActivity, gLearnings] = await Promise.all([
          sbFetch('deals?select=data&data->>status=eq.active&limit=50').catch(() => []),
          sbFetch('tasks?select=data&order=updated_at.desc&limit=10').catch(() => []),
          sbFetch('activities?select=type,entity_name,subject&order=created_at.desc&limit=5').catch(() => []),
          sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=5').catch(() => []),
        ]);
        const outstanding = (gTasks||[]).filter(t => !t.data?.completed);
        const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
        let ctx = '\n\n[BUSINESS CONTEXT — reference naturally if relevant, do not list unless asked]:';
        ctx += `\nPipeline: ${(gDeals||[]).length} active deals.`;
        ctx += ` Tasks: ${outstanding.length} outstanding, ${overdue.length} overdue.`;
        if (gActivity?.length) ctx += `\nRecent activity: ${gActivity.slice(0,3).map(a => `${a.type}: ${a.entity_name}`).join(', ')}`;
        if (gLearnings?.length) ctx += `\nRecent decisions: ${gLearnings.slice(0,3).map(l => (l.user_message||'').slice(0,80)).join('; ')}`;
        routingHint = `\n\n[ROUTING HINT: You have FULL access to all tools — CRM queries, web search via MCP, Gmail, Calendar, and all specialist agent tools. Think like a Chief of Staff who knows the entire business. If business context strengthens your answer, query the CRM. If current information is needed, use web search. Sunny uses you instead of ChatGPT and Claude — be worthy of that. Answer with depth, intelligence, and specificity.]` + ctx;
      } catch {
        routingHint = '\n\n[ROUTING HINT: You have full access to all tools. Answer with depth and intelligence. If business context would help, query the CRM. If current information is needed, search the web.]';
      }
    }

    // For outreach/content, pre-fetch context so Claude drafts with real data
    if (intent === 'outreach' || intent === 'content') {
      try {
        // Extract potential entity names from the message
        const words = message.split(/\s+/).filter(w => w.length > 2 && w[0] === w[0].toUpperCase());
        if (words.length) {
          const searchTerm = words.join(' ');
          const contacts = await sbFetch(`contacts?select=data&or=(data->>firstName.ilike.*${encodeURIComponent(words[0])}*,data->>company.ilike.*${encodeURIComponent(words[0])}*)&limit=3`);
          if (contacts?.length) {
            let ctx = '\n\n[CONTACT CONTEXT for drafting]:';
            for (const c of contacts) {
              const d = c.data || {};
              ctx += `\n• ${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} @ ${d.company || '?'} | ${d.email || 'no email'}`;
            }
            // Check for deals with this company
            const company = contacts[0]?.data?.company;
            if (company) {
              const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=2`);
              if (deals?.length) {
                ctx += '\n[DEAL CONTEXT]:';
                for (const dl of deals) ctx += `\n• ${dl.data.company} — ${dl.data.stage} (${dl.data.pipeline || '?'})`;
              }
            }
            routingHint += ctx;
          }
          // Phase 17: Relationship intelligence
          if (contacts?.[0]?.data?.email) {
            try {
              const rel = await sbFetch(`kiko_relationships?contact_email=eq.${encodeURIComponent(contacts[0].data.email.toLowerCase())}&limit=1`);
              if (Array.isArray(rel) && rel[0]) {
                const r = rel[0];
                routingHint += `\n[RELATIONSHIP: ${r.warmth_score > 0.6 ? 'WARM' : r.warmth_score > 0.35 ? 'LUKEWARM' : 'COLD'} | ${r.emails_sent} sent, ${r.emails_received} received | Type: ${r.relationship_type} | Last contact: ${r.last_sent_at ? new Date(r.last_sent_at).toLocaleDateString('en-GB') : 'unknown'}]`;
              }
            } catch {}
          }
        }
      } catch {} // Non-blocking — if context fetch fails, Claude still drafts
    }
    // Phase 12: Load strategic preferences (learned from past decisions)
    let preferencesHint = '';
    try {
      const prefs = await sbFetch('kiko_preferences?order=confidence.desc&limit=10&select=category,preference,confidence');
      if (Array.isArray(prefs) && prefs.length) {
        preferencesHint = '\n\n[SUNNY\'S DECISION PATTERNS — reference naturally, never list these explicitly]:';
        for (const p of prefs) preferencesHint += `\n• [${p.category}] ${p.preference} (confidence: ${p.confidence})`;
      }
    } catch {} // Non-blocking

    // Phase 15: Load user communication profile
    let profileHint = '';
    try {
      const profiles = await sbFetch(`kiko_user_profiles?user_id=eq.${userEmail === 'sunny@vanhawke.com' ? '9f486437-4bf5-4111-abfe-fe19bfa76063' : ''}&limit=1&select=draft_instructions,communication_style,language_fingerprint`);
      if (Array.isArray(profiles) && profiles[0]?.draft_instructions) {
        const p = profiles[0];
        profileHint = `\n\n[SUNNY'S VOICE — when drafting emails, messages, or content, write EXACTLY like this]:`;
        profileHint += `\n${p.draft_instructions}`;
        if (p.language_fingerprint?.signature_phrases?.length) {
          profileHint += `\nSignature phrases to use naturally: ${p.language_fingerprint.signature_phrases.join(', ')}`;
        }
        if (p.language_fingerprint?.avoided_phrases?.length) {
          profileHint += `\nPhrases to AVOID: ${p.language_fingerprint.avoided_phrases.join(', ')}`;
        }
        if (p.communication_style?.directness) {
          profileHint += `\nDirectness: ${p.communication_style.directness} | Formality: ${p.communication_style.formality || '?'}`;
        }
      }
    } catch {} // Non-blocking

    // Conversation Memory: inject recent insights for cross-session continuity
    let memoryHint = '';
    try {
      const insights = await sbFetch('kiko_conversation_insights?order=created_at.desc&limit=5&select=key_facts,decisions_made,open_threads,entities_discussed');
      if (Array.isArray(insights) && insights.length) {
        memoryHint = '\n\n[RECENT CONVERSATION CONTEXT — reference naturally for continuity]:';
        for (const i of insights.slice(0, 3)) {
          if (i.decisions_made?.length) memoryHint += `\n• Decided: ${i.decisions_made.join('; ')}`;
          if (i.open_threads?.length) memoryHint += `\n• Open: ${i.open_threads.join('; ')}`;
        }
      }
    } catch {}

    // Inbox triage: inject if available (for briefs and general questions)
    let inboxHint = '';
    try {
      const today = new Date().toISOString().split('T')[0];
      const triage = await sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=summary,priority_emails`);
      if (Array.isArray(triage) && triage[0]?.summary) {
        inboxHint = `\n\n[TODAY'S INBOX: ${triage[0].summary}]`;
        const actions = (triage[0].priority_emails || []).filter(e => e.priority === 'ACTION_REQUIRED');
        if (actions.length) inboxHint += `\nAction needed: ${actions.map(e => `${e.from}: ${e.subject}`).join('; ')}`;
      }
    } catch {}

    const systemWithHint = system + routingHint + preferencesHint + profileHint + memoryHint + inboxHint;

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
        system: systemWithHint, messages: msgs, tools: opts.noTools ? undefined : allTools,
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
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { write({ delta: event.delta.text }); responseText += event.delta.text; }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') write({ thinking: event.delta.thinking });
        if (event.type === 'content_block_start' && event.content_block?.type === 'mcp_tool_use') write({ toolStatus: `MCP: ${event.content_block.name || 'calling'}...` });
        if (event.type === 'content_block_start' && event.content_block?.type === 'mcp_tool_result') write({ toolStatus: null });
      }
      return await stream.finalMessage();
    }

    write({ toolStatus: intent !== 'general' ? `Intent: ${intent}` : 'Thinking...' });
    let responseText = ''; // Accumulate for conversation memory extraction — declared before streamCall
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
        logDecision(block.name, block.input, result, message); // Phase 8
        trackOutput(block.name, intent, message, result); // Phase 18
        journalInsight(block.name, block.input, result, message); // Phase 19
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
        logDecision(block.name, block.input, result, message); // Phase 8
        trackOutput(block.name, intent, message, result); // Phase 18
        journalInsight(block.name, block.input, result, message); // Phase 19
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: finalResults });
      write({ toolStatus: 'Composing response...' });
      const finalStream = anthropic.beta.messages.stream({ model: MODEL, max_tokens: 4096, system: systemWithHint, messages });
      for await (const event of finalStream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { write({ delta: event.delta.text }); responseText += event.delta.text; }
      }
    }

    write({ meta: { done: true, model: needsDeepThink ? 'claude-opus-4-6' : MODEL, toolRounds, intent, version: 'v16.0' } });
    res.write('data: [DONE]\n\n');
    res.end();

    // ── Memory Engine: auto-extract facts (non-blocking, fire-and-forget) ──
    // Only extract from conversations with 3+ user messages to avoid noise
    const userMsgCount = messages.filter(m => m.role === 'user' && typeof m.content === 'string').length;
    if (userMsgCount >= 2) {
      try {
        const { callMemoryEngine } = await import('./agents/memory-engine.js');
        const recentMsgs = messages.slice(-8).filter(m => typeof m.content === 'string').map(m => ({ role: m.role, content: m.content }));
        callMemoryEngine('extract_and_store', { messages: recentMsgs, entityContext: entityContext || '' }).catch(() => {});
      } catch {}
    }
    // Conversation Memory: extract insights for cross-session continuity
    extractConversationInsights(message, responseText, intent);
  } catch (err) {
    console.error('[KIKO] Error:', err);
    write({ delta: `\n\nError: ${err.message}` });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
