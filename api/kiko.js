// api/kiko.js — Kiko Prime: Coordinator with Intent Classification (Phase 1)
// Step 1: Haiku classifies intent (~100ms)
// Step 2: Deterministic navigation OR agent dispatch OR full tool loop
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch, logError } from './kiko-tools.js';
import { classifyIntent, INTENT_TO_AGENT } from './agents/intent-classifier.js';
import { generateSelfKnowledge } from './kiko-self-knowledge.js';
import { describeScreen } from './agents/screen-reader.js';

export const config = { supportsResponseStreaming: true, maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ── User config loader — replaces all hardcoded user references ──
const userConfigCache = new Map();
async function getUserConfig(email) {
  if (userConfigCache.has(email)) {
    const cached = userConfigCache.get(email);
    if (Date.now() - cached.ts < 300000) return cached.data; // 5 min cache
  }
  try {
    const rows = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(email)}&limit=1`);
    if (rows?.[0]) {
      const config = rows[0];
      userConfigCache.set(email, { data: config, ts: Date.now() });
      return config;
    }
  } catch {}
  // Fallback for unknown users — minimal config so Kiko still works
  return { user_id: null, email, display_name: email.split('@')[0], role: 'user', company_name: '', job_title: '', location: '', timezone: 'Europe/London', communication_style: 'executive', company_description: '' };
}

// Strip orphaned Unicode surrogates — prevents Anthropic API JSON parse errors
function sanitizeUnicode(str) {
  if (!str || typeof str !== 'string') return str || '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { result += str[i] + str[i + 1]; i++; }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Orphaned low surrogate — skip
    } else { result += str[i]; }
  }
  return result;
}

// Phase 8: Learning Loop — log decisions for pattern matching
const DECISION_TOOLS = ['ask_strategy_agent', 'ask_deal_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];

// Audit logging — every query and tool call
async function auditLog(actionType, { userId, userEmail, intent, toolName, entityType, entityId, detail, durationMs } = {}) {
  try {
    await sbFetch('kiko_audit_log', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId || null, user_email: userEmail || null,
        action_type: actionType, intent: intent || null,
        tool_name: toolName || null, entity_type: entityType || null,
        entity_id: entityId || null, detail: (detail || '').slice(0, 500),
        duration_ms: durationMs || null,
      }),
    });
  } catch {} // Must never throw
}
async function logDecision(toolName, toolInput, toolResult, userMessage, userId) {
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
async function trackOutput(toolName, intent, userMessage, result, userId) {
  try {
    const agent = toolName ? toolName.replace('ask_', '').replace('_agent', '') : 'general';
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    await sbFetch('kiko_output_tracking', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        agent, intent: intent || 'unknown',
        user_message: (userMessage || '').slice(0, 150),
        output_preview: resultStr.slice(0, 300),
      })
    });
  } catch {} // Non-blocking
}

// Phase 19: Thought journal — extract and persist strategic insights
const INSIGHT_TOOLS = ['ask_strategy_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];
async function journalInsight(toolName, toolInput, toolResult, userMessage, userId) {
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
        user_id: userId,
        topic: topic,
        insight: resultStr.slice(0, 500),
        related_entities: entities.slice(0, 5),
        confidence: 0.7,
      })
    });
  } catch {} // Non-blocking
}

// Conversation Memory: extract insights after a conversation completes
async function extractConversationInsights(message, fullResponse, intent, userId) {
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
        user_id: userId,
        key_facts: parsed.key_facts || [], decisions_made: parsed.decisions_made || [],
        open_threads: parsed.open_threads || [], entities_discussed: parsed.entities || [],
        summary: `${(parsed.key_facts || []).join('; ')}`.slice(0, 200),
      })
    });

    // Update thread tracker for each mentioned entity
    for (const entity of (parsed.entities || []).slice(0, 3)) {
      try {
        const existing = await sbFetch(`kiko_thread_tracker?entity_name=ilike.${encodeURIComponent(entity)}&user_id=eq.${userId}&limit=1`);
        if (existing?.length) {
          const t = existing[0];
          const decisions = [...(t.key_decisions || []), ...(parsed.decisions_made || [])].slice(-10);
          const questions = [...(t.open_questions || []), ...(parsed.open_threads || [])].slice(-10);
          await sbFetch(`kiko_thread_tracker?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({
            discussion_count: (t.discussion_count || 0) + 1,
            last_discussed_at: new Date().toISOString(),
            key_decisions: decisions, open_questions: questions,
            thread_summary: `${t.thread_summary || ''}; ${(parsed.key_facts || []).join('; ')}`.slice(-500),
            updated_at: new Date().toISOString(),
          })});
        } else {
          await sbFetch('kiko_thread_tracker', { method: 'POST', body: JSON.stringify({
            entity_name: entity, entity_type: 'company', user_id: userId,
            thread_summary: (parsed.key_facts || []).join('; '),
            key_decisions: parsed.decisions_made || [],
            open_questions: parsed.open_threads || [],
          })});
        }
      } catch {} // Non-blocking per entity
    }
  } catch {} // Non-blocking
}

// ── Correction Learning — detect when user rephrases ──
async function detectCorrection(message, conversationHistory, intent) {
  if (conversationHistory.length < 3) return; // Need at least one exchange
  try {
    const lastUserMsg = conversationHistory.filter(m => m.role === 'user').slice(-2, -1)[0];
    if (!lastUserMsg) return;
    // Quick heuristic: if both messages are >10 chars, share 30%+ words, but aren't identical
    const prev = (lastUserMsg.content || '').toLowerCase().split(/\s+/);
    const curr = message.toLowerCase().split(/\s+/);
    if (prev.length < 3 || curr.length < 3) return;
    const prevSet = new Set(prev);
    const overlap = curr.filter(w => prevSet.has(w) && w.length > 3).length;
    const similarity = overlap / Math.max(prev.length, curr.length);
    if (similarity > 0.25 && similarity < 0.9) {
      // Likely a rephrase — log it for learning
      await sbFetch('kiko_learning_log', {
        method: 'POST', body: JSON.stringify({
          user_id: userId,
          category: 'correction', content: `User rephrased. Original: "${lastUserMsg.content?.slice(0, 150)}". Rephrased: "${message.slice(0, 150)}". Intent: ${intent}. Similarity: ${(similarity * 100).toFixed(0)}%.`,
          entity_name: null, user_message: message.slice(0, 200),
        })
      });
    }
  } catch {} // Non-blocking
}
// MCP disabled — Anthropic's hosted MCP servers require their own OAuth flow, 
// not our direct Google tokens. Email/calendar access uses our own tools instead.
async function getMcpServers() { return []; }

// ── System Prompt — Clean Coordinator ──
const SYSTEM_PROMPT = `You are Kiko — the AI executive operating partner for {COMPANY_NAME}.
You work with {USER_NAME}, {USER_TITLE}, based in {USER_LOCATION}. Never ask their name or location.
{USER_NAME} is the visionary and final decision-maker. You are their executive bench — CFO, CRO, COO, CMO, and Chief of Staff simultaneously. You don't wait to be asked. You think ahead, challenge assumptions, flag what's being ignored, connect signals across domains, and recommend moves with conviction.

OPERATING PRINCIPLES:
- Think like a CEO, not a secretary. Before answering, ask yourself: What is the strategic implication? What's being missed? What would I do if I were running this company?
- Lead with the insight, not the data. Don't dump information — synthesise it into a conclusion and recommendation.
- Challenge when necessary. If {USER_NAME} is pursuing something you think is wrong, say so directly with reasoning. You're not a yes-machine.
- Connect signals. A reply from a prospect + a news article about their funding + a stale deal in the same sector = convergence. Surface these connections unprompted.
- Be proactive. When briefing, flag stale deals, recommend next actions, connect signals to opportunities. Save important insights via ask_data_agent (operation: learning_save).
- You speak as Kiko. Never say "the agent said" or reference internal routing. You ARE the intelligence.

ROUTING (call the matching tool — never say "the agent said"):
ask_navigator → screen/page questions, navigation ("go to", "show me", "where am I")
ask_deal_agent → CRM writes (move deal, create task, add reminder, follow up)
ask_data_agent → data queries (contacts, deals, pipeline stats, stale leads, warm paths, win/loss, past conversations, activity)
ask_outreach_agent → email drafting (Gmail drafts, follow-ups, outreach)
ask_lemlist_live → Lemlist stats (campaigns, open rates, warm leads, bounced)
ask_document_agent → file creation (docx/xlsx/pptx/csv, images, QR codes)
ask_strategy_agent → strategy ("should we pursue X", "where is leverage", "prioritise")
ask_negotiation_agent → negotiations (counter-offers, pricing pushback, walk-away)
ask_category_agent → sponsorship availability ("is X category open", "gaps on Haas")
ask_memory_engine → entity recall ("tell me everything about X", relationship summary)
ask_finance_agent → financials (pipeline worth, weighted forecast, runway)
ask_ea_agent → briefing/priorities ("brief me", "morning brief", "prioritise tasks")
ask_legal_agent → legal/contracts (clause analysis, risk flagging)
ask_dispute_agent → disputes (procedural responses, landlord/CDDA)
ask_content_agent → content (LinkedIn, SponsorSignal, case studies)
ask_investment_agent → investment (valuation, raise strategy, dilution)
ask_pricing_agent → pricing/ROI (sponsorship benchmarks)
ask_signal_agent → signals (deal signals, funding events, hiring)
ask_travel_agent → travel (F1/FE race travel, visa)
ask_specialist_agent → specialist (website, product lifecycle, IP)
ask_self_monitor → self-monitoring ("system health", "what errors", "cron status")
web_search → deep research (run 5-8 searches, synthesise into structured brief; save findings with manage_knowledge)
read_calendar → calendar ("check my calendar", "meetings today")
read_email → email reading ("check my email", "unread from X")
search_conversations → past conversation recall ("we discussed X", "recall our chat about Y")
manage_knowledge → knowledge/agents ("learn from URL", "create agent", "set mode", "save insight")
trigger_triage → email triage (refresh inbox when stale)
ask_code_review → self-analysis ("review your code", "suggest improvements")

STYLE: Direct, corporate, high-signal. No fluff. No "happy to help." No "great question." Lead with value — conclusion first, evidence second. Max 2-3 sentences for simple queries, structured briefs for complex ones. Use "intelligent age" not "AI generation." All financials in USD. When you disagree, say "I'd push back on that" not "that's an interesting perspective."

EXECUTIVE LENS: For every business query, briefly consider:
- Revenue impact: Does this move the needle on pipeline, outreach, or conversion?
- Opportunity cost: What are we NOT doing by pursuing this?
- Timing: Is this the right moment, or should we wait/accelerate?
You don't need to surface all three every time — just the one that matters most.

REASONING DISCIPLINE: Before every response — especially before choosing which tools to call — think step by step:
1. What is the user actually asking? (Strip away the surface phrasing — what's the real need?)
2. What do I already know from memory, learning log, and preferences that's relevant?
3. What data do I need that I don't have? (Only then reach for tools)
4. What's my recommendation and why? (Take a position — don't just present options)
This internal reasoning should sharpen your tool selection, reduce unnecessary calls, and make your answers decisive rather than descriptive.

ADAPTIVE TONE: You serve {USER_NAME} across BOTH business and personal life. Detect which mode from context:
- BUSINESS: Corporate, strategic, data-driven. Lead with conclusions. Bullets for complex info.
- PERSONAL: Warm, conversational, thoughtful. Use personal context loaded below to be helpful like a trusted friend who also happens to be brilliant.
- MIXED: Start professional, soften where appropriate.
When {USER_NAME} asks about personal things (school, family, weekends, health, shopping, holidays, hobbies), switch to personal mode naturally. Don't be a corporate robot for personal queries. You're their AI — business AND life.

EMAIL DRAFTS: When drafting any email, ALWAYS format with Subject: and To: on separate lines at the top, followed by the body. Example:
Subject: Haas F1 Team — Exclusive Partnership Category
To: ryan@decagon.ai

Dear Ryan,
[body]

Best regards,
{USER_NAME}
This format triggers the draft preview panel with Copy, Send to Gmail, and tone adjustment options.

OUTREACH DOCTRINE: 5-touch authority-led. No pricing in early outreach. No pleasantries. Board-level positioning. Scarcity by design.

SELF-KNOWLEDGE: {DYNAMIC_SELF_KNOWLEDGE}

IMAGE ANALYSIS: You CAN see and analyse uploaded images. When a user uploads an image (screenshot, photo, document scan), describe what you see and provide relevant analysis. Do NOT say you cannot view images — the image data is sent to you directly.

WEB ACCESS: You CAN search the internet. You have a web_search tool that lets you look up any current information — company details, news, funding rounds, market data, anything. Do NOT say you cannot access the internet, browse the web, or search for information. When asked to research something or find current information, USE the web_search tool immediately. You are not limited to your training data.

ORCHESTRATION — HOW YOU WORK:
You have up to 10 tool rounds per conversation. Use them intelligently:

1. SIMPLE QUERIES (1 tool): "move Decagon to Negotiation" → ask_deal_agent. Done.
2. COMPOUND QUERIES (2-3 tools): "What do we know about Cloudflare and should we pursue them?" → ask_data_agent (CRM check) → ask_strategy_agent (evaluation). Chain them.
3. RESEARCH + ACTION (3-5 tools): "Research Nordic Semi and draft an intro email" → web_search (company intel) → ask_data_agent (CRM check for existing contacts) → ask_outreach_agent (draft email with real context). Always gather context BEFORE drafting.
4. ENRICH COMPANY: When user says "enrich [company]" → use ask_data_agent with operation "enrich_company" and params.company. This runs a deep web search and saves structured intelligence (funding, leadership, competitors, sponsorship fit) to the database permanently. Also use ask_data_agent with operation "company_intel" to retrieve previously enriched data.
5. SEQUENCE ENGINE: When user says "start a sequence for [company]" or "enroll [contact] in a sequence" → use ask_data_agent with operation "start_sequence" and params { company, contact_email, contact_name, sequence (optional name) }. "Show active sequences" → operation "sequence_status". "Pause/cancel sequence for [company]" → "pause_sequence" or "cancel_sequence". "Show LinkedIn queue" → "linkedin_queue". Sequences auto-send emails on schedule, auto-stop on reply, and track in the attribution system.
4. FULL WORKFLOW (5+ tools): "Brief me and then execute the top priority" → ask_ea_agent (brief) → identify priority → use the appropriate agent to execute it.

DECISION FRAMEWORK — adapt your approach based on the task:
- If the query mentions a COMPANY NAME: always check CRM first (ask_data_agent with search_contacts or deal_lookup) before responding. Context from existing relationships changes everything.
- If the query asks you to DRAFT anything: gather context first (CRM contact details, deal stage, relationship history, recent emails). Never draft blind.
- If the query is about CURRENT events, news, or "what's happening": use web_search. Never say you don't have access to current information.
- If an agent returns an ERROR or EMPTY results: try an alternative approach. If ask_data_agent returns nothing, try web_search. If email tools fail, tell the user the connection needs refreshing.
- If the query is AMBIGUOUS: ask a clarifying question rather than guessing. But if you can make a reasonable inference, do it and note your assumption.

SELF-CORRECTION: If you call a tool and the result doesn't fully answer the question, call another tool. Don't stop short. If you searched the CRM and found nothing, search the web. If you drafted an email and it needs contact details, look them up. Complete the task.

ERROR HANDLING: If an agent returns an error, explain the agent failed and what went wrong. Do NOT attempt to handle the task yourself — you are a coordinator, not an executor. Say "The [Agent Name] hit an error: [details]. Let me know if you want me to try again."

CURRENT PAGE: {currentPage}`;

// ── Page Roles (injected per page) ──
const PAGE_ROLES = {
  pipeline: '\nROLE: Sales Strategist. Prioritise by momentum and timing. Flag stale deals.',
  'command-centre': '\nROLE: Deal Strategist. Deals ranked by value × urgency. Recommend next actions.',
  contacts: '\nROLE: Relationship Manager. Surface connection history and engagement scores.',
  calendar: '\nROLE: Chief of Staff. F1/FE race calendar, pre-race outreach windows, schedule optimisation.',
  'partnership-matrix': '\nROLE: Strategic Advisor. Partnership Detection Engine auto-scans F1 team websites daily. Analyse gaps, competitive positioning, new partner announcements, target recommendations.',
  organisations: '\nROLE: Due Diligence. Assess profiles, funding, sponsorship readiness.',
  home: '\nROLE: Strategic Partner. Brief on top 3 priorities across pipeline, email, calendar.',
  lemlist: '\nROLE: Outreach Analyst. Use ask_lemlist_live for campaign stats, warm leads, deliverability. Use ask_outreach_agent for drafting emails and adding leads.',
};

// ── Native Tools (built per-user in handler) ──
function buildNativeTools(userConfig) {
  const loc = userConfig?.location || '';
  const city = loc.split(',')[0].trim();
  const country = loc.includes('UK') ? 'GB' : loc.includes('US') ? 'US' : '';
  const tz = userConfig?.timezone || 'Europe/London';
  const tool = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };
  if (city || country) {
    tool.user_location = { type: 'approximate' };
    if (city) tool.user_location.city = city;
    if (country) tool.user_location.country = country;
    if (tz) tool.user_location.timezone = tz;
  }
  const tools = [tool];
  // Anthropic memory tool stores per-API-key — only enable for super_admin to prevent cross-user leaks
  if (userConfig?.role === 'super_admin') {
    tools.unshift({ type: 'memory_20250818', name: 'memory' });
  }
  return tools;
}

// ── Memory Handler ──
async function handleMemory(input, userId) {
  const { command, path, file_text, old_str, new_str, insert_line, new_content, view_range } = input;
  const uf = userId ? `&user_id=eq.${userId}` : ''; // user filter for all memory queries
  try {
    if (command === 'view') {
      if (!path || path === '/memories') {
        const rows = await sbFetch(`kiko_memories?select=path,is_directory,content&order=path.asc${uf}`);
        return 'Files in /memories:\n' + (rows || []).map(r => `${r.is_directory ? '4.0K' : `${((r.content||'').length/1024).toFixed(1)}K`}\t${r.path}`).join('\n');
      }
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}&select=content,is_directory&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      if (rows[0].is_directory) {
        const ch = await sbFetch(`kiko_memories?path=like.${encodeURIComponent(path+'/%')}${uf}&select=path,content&order=path.asc`);
        return (ch||[]).map(r => `${((r.content||'').length/1024).toFixed(1)}K\t${r.path}`).join('\n');
      }
      const lines = (rows[0].content||'').split('\n');
      if (view_range) { const [s,e] = view_range; return lines.slice(s-1,e).map((l,i)=>`${s+i}\t${l}`).join('\n'); }
      return lines.map((l,i)=>`${i+1}\t${l}`).join('\n');
    }
    if (command === 'create') {
      await sbFetch('kiko_memories', { method:'POST', headers:{Prefer:'resolution=merge-duplicates'}, body: JSON.stringify({path, content:file_text||'', is_directory:false, user_id: userId, updated_at:new Date().toISOString()}) });
      return `Created ${path}`;
    }
    if (command === 'str_replace') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}`, { method:'PATCH', body: JSON.stringify({content:rows[0].content.replace(old_str, new_str), updated_at:new Date().toISOString()}) });
      return `Replaced in ${path}`;
    }
    if (command === 'insert') {
      const rows = await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}&select=content&limit=1`);
      if (!rows?.[0]) return `Error: not found: ${path}`;
      const lines = rows[0].content.split('\n'); lines.splice(insert_line, 0, new_content);
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}`, { method:'PATCH', body: JSON.stringify({content:lines.join('\n'), updated_at:new Date().toISOString()}) });
      return `Inserted at line ${insert_line} in ${path}`;
    }
    if (command === 'delete') {
      await sbFetch(`kiko_memories?path=eq.${encodeURIComponent(path)}${uf}`, {method:'DELETE'});
      return `Deleted ${path}`;
    }
    return `Unknown memory command: ${command}`;
  } catch(e) { return `Memory error: ${e.message}`; }
}

// ── Tool Status Labels ──
const TOOL_LABELS = {
  ask_navigator: 'Analysing page context...',
  ask_deal_agent: 'Searching deals and pipeline data...',
  ask_data_agent: 'Querying CRM database...',
  ask_outreach_agent: 'Drafting outreach communication...',
  ask_document_agent: 'Processing document intelligence...',
  ask_memory_engine: 'Retrieving past decisions and context...',
  ask_strategy_agent: 'Strategy Agent composing verdict...',
  ask_negotiation_agent: 'Analysing negotiation positions...',
  ask_category_agent: 'Checking sponsorship category availability...',
  ask_finance_agent: 'Running financial analysis...',
  ask_ea_agent: 'Compiling your executive brief...',
  ask_legal_agent: 'Reviewing legal framework...',
  ask_dispute_agent: 'Analysing dispute resolution options...',
  ask_content_agent: 'Generating content...',
  ask_investment_agent: 'Building investment model...',
  ask_pricing_agent: 'Benchmarking pricing against market data...',
  ask_signal_agent: 'Scanning partnership signals...',
  ask_travel_agent: 'Planning travel logistics...',
  ask_specialist_agent: 'Running specialist analysis...',
  ask_self_monitor: 'Running system diagnostics...',
  navigate_page: 'Navigating...',
  log_activity: 'Logging activity...',
  web_search: 'Searching web for current intel...',
  memory: 'Retrieving past decisions and context...',
  ask_lemlist_live: 'Querying Lemlist campaign data...',
  search_conversations: 'Searching conversation history...',
  trigger_triage: 'Running inbox triage...',
  ask_code_review: 'Analysing platform code...',
  read_email: 'Reading emails via Gmail...',
  read_calendar: 'Checking your calendar...',
  manage_knowledge: 'Managing knowledge library...',
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

  const { message: rawMessage, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, pageContext = null, attachments = [], deepThink = false, personality = 'executive', voiceMode = false } = req.body;
  const message = sanitizeUnicode(rawMessage);
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
  const pageRole = PAGE_ROLES[currentPage] || '';

  // ── USER CONFIG FIRST — everything else depends on userId ──
  const userConfig = await getUserConfig(userEmail);
  const isRegistered = !!userConfig.user_id; // Has a real kiko_user_config entry
  const userId = userConfig.user_id || crypto.randomUUID(); // Ephemeral UUID for unregistered — never accumulates data
  const isSuperAdmin = userConfig.role === 'super_admin';

  // ── Early greeting detection — skip heavy fetches for simple greetings ──
  const earlyGreeting = /^(hi|hey|hello|good\s+(morning|afternoon|evening)|howdy|what'?s?\s+up|yo)\b/i.test((message || '').trim());

  // ── PARALLEL INITIAL LOAD — entityContext, identity, selfKnowledge all at once ──
  const [entityContext, identityResult, selfKnowledge, voiceMemResult] = await Promise.all([
    earlyGreeting ? Promise.resolve('') : fetchEntityContext(pageEntity),
    sbFetch(`kiko_memories?path=eq./memories/identity.md&user_id=eq.${userId}&select=content&limit=1`).catch(() => []),
    earlyGreeting ? Promise.resolve('') : generateSelfKnowledge(userId).catch(() => 'Self-knowledge unavailable.'),
    (voiceMode || currentPage === 'voice')
      ? sbFetch(`kiko_memories?select=path,content&is_directory=eq.false&user_id=eq.${userId}&path=like./memories/%_profile.md&order=path.asc`).catch(() => [])
      : Promise.resolve([]),
  ]);

  let identityContext = '';
  if (identityResult?.[0]?.content) identityContext = '\n\n── KIKO IDENTITY ──\n' + identityResult[0].content.slice(0, 2000);

  let voiceRules = '';
  let preloadedMemory = '';
  if (voiceMode || currentPage === 'voice') {
    if (voiceMemResult?.length) preloadedMemory = '\n\n── MEMORY ──\n' + voiceMemResult.map(r => r.content).join('\n\n');
    voiceRules = `\n\nVOICE MODE — YOU ARE SPEAKING ALOUD:
- You are having a natural spoken conversation. Respond as if talking face-to-face.
- Keep responses to 1-4 sentences. Be warm, direct, natural. Like a trusted advisor in the room.
- NEVER use markdown, asterisks, bullet points, headers, or any formatting — this is speech, not text.
- Say numbers and abbreviations naturally ("twelve million dollars" not "$12M", "the pipeline" not "pipeline page").
- NEVER discuss your own modes, system prompts, capabilities, or architecture. Just answer the question.
- NEVER say "voice mode", "verbose mode", "transparent mode" or explain how you work internally.
- For greetings: respond warmly in 1 sentence. Do NOT call any tools.
- For data questions: use tools, then summarise findings conversationally. Lead with the answer.
- You have full access to all tools, memory, and context. Use them when needed — the user expects you to know everything you know in text mode.
- NEVER ask the user to "switch modes" or offer different response formats. Just respond naturally.`;
  }

  const PERSONALITIES = {
    concise: '\nSTYLE: Ultra-concise. Max 2-3 sentences. Bullet points preferred.',
    analytical: '\nSTYLE: Analytical. Show reasoning. Include data, comparisons, evidence.',
    warm: '\nSTYLE: Warm and encouraging. Acknowledge efforts, frame challenges constructively.',
    executive: '\nSTYLE: Board-level. Direct, strategic. Lead with conclusion, support with evidence.',
  };

  const system = SYSTEM_PROMPT
    .replace('{currentPage}', currentPage)
    .replace('{DYNAMIC_SELF_KNOWLEDGE}', selfKnowledge)
    .replace('{COMPANY_NAME}', userConfig.company_name || 'your organisation')
    .replace('{USER_NAME}', userConfig.display_name || userEmail.split('@')[0])
    .replace('{USER_TITLE}', userConfig.job_title || 'team member')
    .replace('{USER_LOCATION}', userConfig.location || '')
    .replace(/\{USER_NAME\}/g, userConfig.display_name || userEmail.split('@')[0])
    + `\n[${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + (pageContext?.summary ? `\n[Context: ${pageContext.summary}${pageContext.stageDistribution ? ` | Stages: ${JSON.stringify(pageContext.stageDistribution)}` : ''}${pageContext.visibleItems ? `\nVisible: ${pageContext.visibleItems}` : ''}]` : '')
    + (PERSONALITIES[personality] || PERSONALITIES.executive)
    + pageRole + entityContext + voiceRules + preloadedMemory
    + `\n\n[CRITICAL IDENTITY: The user you are speaking with RIGHT NOW is ${userConfig.display_name}. Address them as ${userConfig.display_name.split(' ')[0]}. Do NOT use any other name.]`
    + (isSuperAdmin ? '' : `\n\n[MEMORY ISOLATION — CRITICAL: You may have memories stored from other users who share this system. You MUST completely ignore ALL memories that reference people, families, children, personal details, locations, or private matters that were NOT told to you by ${userConfig.display_name} in THIS conversation or in the personal context section above. If you have NO personal context items for this user, then you know NOTHING about their personal life — do not reference any memories about daughters, children, family, schools, addresses, books, legal matters, or any other personal details. Any such memories belong to a DIFFERENT user and are CONFIDENTIAL. Respond only with "I don't have any personal information about you yet" when asked about personal matters you have no data for.]`);

  // ── SSE setup ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-No-Buffering', '1');
  if (res.flushHeaders) res.flushHeaders();
  const write = (d) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch {} };

  // Watchdog: if handler takes >55s, force-send an error and close
  let finished = false;
  const watchdog = setTimeout(() => {
    if (!finished) {
      finished = true;
      write({ delta: '\n\nRequest timed out. Try a simpler question or try again.' });
      try { res.write('data: [DONE]\n\n'); res.end(); } catch {}
    }
  }, 115000);

  try {
    write({ toolStatus: 'Connecting...' });
    const queryStartTime = Date.now();
    // Build messages
    const messages = conversationHistory.slice(-20)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: sanitizeUnicode(m.content || '') }));

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

    const nativeTools = buildNativeTools(userConfig);
    const voiceTools = voiceMode
      ? [...nativeTools.filter(t => t.name !== 'memory'), ...TOOL_DEFINITIONS]
      : [...nativeTools, ...TOOL_DEFINITIONS];
    const allTools = voiceTools;

    // ── PHASE 1: Intent Classification ──
    // Fast-path: skip Haiku API call for obvious patterns (~60% of queries, saves 800ms)
    const msgLower = (message || '').toLowerCase().trim();
    let classification;
    const FAST_INTENTS = {
      greeting: /^(hi|hey|hello|good\s+(morning|afternoon|evening)|howdy|what'?s?\s+up|yo)\b/i,
      navigate: /^(go\s+to|open|show\s+me|navigate|take\s+me\s+to)\s+(home|pipeline|contacts|calendar|settings|tasks|outreach)/i,
      email_read: /^(check|read|show|get|any)\s*(my)?\s*(new|unread|latest|recent)?\s*(email|inbox|mail|gmail)/i,
      calendar: /^(what'?s?\s+on\s+my\s+calendar|any\s+meetings|my\s+schedule|calendar|meetings?\s+(today|tomorrow|this\s+week))/i,
    };
    const fastMatch = Object.entries(FAST_INTENTS).find(([, re]) => re.test(msgLower));
    if (fastMatch) {
      classification = { intent: fastMatch[0], confidence: 0.99, useMCP: false };
    } else {
      classification = await classifyIntent(message, currentPage);
    }
    const { intent, target } = classification;

    // Audit: log every query
    auditLog('query', { userId, userEmail, intent, detail: (message || '').slice(0, 200) });

    // ── Context-Aware Greeting: first message = proactive status push ──
    const isFirstMessage = conversationHistory.length <= 1;
    const isGreeting = /^(hi|hey|hello|good morning|good evening|morning|evening|yo|sup|what'?s up)\b/i.test(message.trim());
    if (isFirstMessage && isGreeting && !voiceMode) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg.content === 'string') {
        messages[messages.length - 1] = { role: 'user', content: `${lastMsg.content}\n\n[CONTEXT: This is ${userConfig.display_name}'s first message. Greet them briefly (one line) then give a 3-4 sentence proactive status using ONLY the intelligence brief, inbox triage, and pipeline data already in your system prompt. Do NOT call any tools — everything you need is already loaded above. Lead with the most important thing.]` };
      }
    }

    // Non-blocking: detect if user is rephrasing (correction learning) — registered users only
    if (isRegistered) detectCorrection(message, conversationHistory, intent);

    // Trim conversation history for non-research intents to reduce token usage and latency
    const DEEP_HISTORY_INTENTS = ['research', 'code_review', 'conversation_search'];
    if (!DEEP_HISTORY_INTENTS.includes(intent) && messages.length > 11) {
      const newUserMsg = messages.pop(); // remove current message
      while (messages.length > 10) messages.shift(); // keep last 10 history
      messages.push(newUserMsg); // add current message back
    }

    // Handle deterministic navigation — no Claude needed
    if (intent === 'navigate' && target) {
      write({ navigate: target });
      write({ delta: `Opening ${target.replace(/-/g, ' ')}.` });
      write({ meta: { done: true, model: 'classifier', intent: 'navigate', version: 'v16.1' } });
      finished = true; clearTimeout(watchdog);
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
      const screenSystem = system + `\n\n[LIVE SCREEN DATA — describe this naturally to ${userConfig.display_name}, highlight what matters most]:\n${screenData}`;
      const screenStream = anthropic.beta.messages.stream({
        model: MODEL, max_tokens: 600, system: screenSystem, messages,
      });
      for await (const event of screenStream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') write({ delta: event.delta.text });
      }
      write({ meta: { done: true, model: MODEL, intent: 'screen', version: 'v16.1' } });
      finished = true; clearTimeout(watchdog);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Inject routing hint into system prompt for non-trivial intents
    const agentMapping = INTENT_TO_AGENT[intent];
    let routingHint = '';
    if (agentMapping?.tool) {
      routingHint = `\n\n[ROUTING HINT: This message was classified as "${intent}". Start with the ${agentMapping.tool} tool. After getting results, you may call additional tools if the task requires multiple steps — you have up to 10 tool rounds. For example: research a company (web_search) → check CRM (ask_data_agent) → draft email (ask_outreach_agent). Think about what the user actually needs end-to-end, not just the first step.]`;
      // Force consistent email draft format for UI rendering
      if (intent === 'outreach') {
        routingHint += `\n\n[EMAIL FORMAT RULE: When presenting an email draft in your response, ALWAYS use this exact structure:
### SUGGESTED DRAFT
Subject: [subject line]
To: [recipient email]

Dear [Name],

[body paragraphs]

Do NOT include a sign-off, your name, or job title — the user's Gmail signature handles this.
This format is required for the UI to render the email in an interactive frame with tone adjustment and Gmail integration buttons. If you skip this format, the user loses access to those tools.]`;
        routingHint += `\n\n[PREDICTIVE BEHAVIOR ENGINE — Apply these psychological principles to ALL outreach]:
CIALDINI'S 6 PRINCIPLES (select based on deal stage + recipient seniority):
1. RECIPROCITY: Give before asking. Share proprietary market intel, competitor analysis, or exclusive data in the first email. Works best for cold outreach to C-suite.
2. SCARCITY: "One remaining category position" / "Exclusivity window closing [date]." Use when deal is stalling or competitor pressure exists. Never fabricate scarcity.
3. AUTHORITY: Lead with Van Hawke's advisory track record, Sunny's board-level experience, or named F1 team relationships. Best for first touch to VP+ recipients.
4. SOCIAL PROOF: Reference other partnerships in the same category — "CrowdStrike at Mercedes, Bitdefender at Ferrari." Use when recipient is risk-averse or in evaluation stage.
5. COMMITMENT/CONSISTENCY: After any positive signal, reference their own words back — "As you mentioned in our call..." / "Building on your interest in..." Anchors them to prior engagement.
6. LIKING: Mirror communication style, reference shared context (same industry event, mutual connection, shared challenge). Use in follow-ups and relationship-building.

TIMING PSYCHOLOGY:
- Tuesday-Thursday 8-10am recipient local time: highest open rates
- Post-earnings/post-funding: company is in "growth narrative" mode — 48hr window
- Pre-race weekend (14-21 days): urgency lever for motorsport sponsorship
- Monday: avoid — inbox overload. Friday PM: avoid — weekend mental checkout
- Follow-up at 72hrs (not 24hrs): reduces perceived desperation
- After 3 silences: switch approach entirely (new angle, new person, or strategic withdrawal)

DEAL STAGE MAPPING:
- Cold/First touch → Authority + Reciprocity (give intel, establish credibility)
- Follow-up 1-2 → Social Proof + Scarcity (competitive landscape, exclusivity)
- In Dialogue → Commitment/Consistency + Liking (reference their words, build rapport)
- Qualified → Scarcity + Authority (closing window, board-level framing)
- Stale >30d → Pattern interrupt (completely new angle, different stakeholder, or strategic news hook)]`;
      }
    } else if (intent === 'email_read') {
      routingHint = '\n\n[ROUTING HINT: This is an EMAIL query. Use the read_email tool. Operations: unread (get unread count + recent), search (Gmail search query like "from:john subject:proposal"), read_message (read specific email by ID), inbox_summary. If the user mentions a person, search by their name. Give a clear summary — dates, senders, key content.]';
    } else if (intent === 'calendar') {
      routingHint = '\n\n[ROUTING HINT: This is a CALENDAR query. Use the read_calendar tool. Operations: today (today\'s events), upcoming (next 7 days), search (by keyword), free_slots (find available time). Give times in UK format.]';
    } else if (intent === 'research') {
      routingHint = '\n\n[ROUTING HINT: This is a RESEARCH query. Use the web_search tool to find current information. Run 3-8 searches systematically: company overview, funding, leadership, news, competitors, partnerships. Synthesise into a structured brief. You HAVE internet access — use it. Also cross-reference with CRM data via ask_data_agent if the entity exists in the pipeline. After research, save key findings using manage_knowledge (operation: save_insight).]';
    } else if (intent === 'knowledge') {
      routingHint = '\n\n[ROUTING HINT: This is a KNOWLEDGE MANAGEMENT query. Use the manage_knowledge tool. Operations: add_source (add URL/document), search_knowledge (search knowledge base), list_sources (show sources), learn_topic (queue learning), save_insight (save a fact), create_agent (create a new dynamic specialist agent), list_agents (show custom agents), run_agent (execute a custom agent), set_mode (switch operational mode: fundraising/race_week/outreach_sprint/deal_closing/product_launch), get_mode (check current mode). If user says "create an agent for X" — design a system_prompt, pick relevant data_queries, and create it. If user says "fundraising mode" or "switch to X mode" — use set_mode.]';
    } else if (intent === 'conversation_search') {
      routingHint = '\n\n[ROUTING HINT: This references a PAST CONVERSATION. Use the search_conversations tool with relevant keywords. Search for entity names, topics, or specific phrases the user mentions. Return the most relevant excerpts with dates.]';
    } else if (intent === 'code_review') {
      routingHint = '\n\n[ROUTING HINT: This is a SELF-ANALYSIS query. Use the ask_code_review tool. Operations: architecture (full codebase structure), review (review specific file — pass filename like "kiko.js" or "agents/deal.js"), performance (agent usage stats, error rates, cron health), suggest (AI-generated top 5 improvements), read (read raw source file). Default to "suggest" if the user just asks generally about improvements.]';
    } else if (intent === 'general') {
      routingHint = '\n\n[ROUTING HINT: This is a general question. You have FULL access to all tools — CRM, web search, Gmail, Calendar, all 23 specialist agents. Answer from your knowledge first, but if current data, business context, or research would improve the answer, use the appropriate tool. Do not hold back.]';
    }

    // For general queries, inject live CRM context (registered users only)
    if (isRegistered && intent === 'general') {
      try {
        const [gDeals, gTasks, gActivity, gLearnings] = await Promise.all([
          sbFetch('deals?select=data&data->>status=eq.active&limit=50').catch(() => []),
          sbFetch('tasks?select=data&order=updated_at.desc&limit=10').catch(() => []),
          sbFetch('activities?select=type,entity_name,subject&order=created_at.desc&limit=5').catch(() => []),
          sbFetch(`kiko_learning_log?user_id=eq.${userId}&category=eq.decision&order=created_at.desc&limit=5`).catch(() => []),
        ]);
        const outstanding = (gTasks||[]).filter(t => !t.data?.completed);
        const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
        let ctx = '\n\n[BUSINESS CONTEXT — reference naturally if relevant, do not list unless asked]:';
        ctx += `\nPipeline: ${(gDeals||[]).length} active deals.`;
        ctx += ` Tasks: ${outstanding.length} outstanding, ${overdue.length} overdue.`;
        if (gActivity?.length) ctx += `\nRecent activity: ${gActivity.slice(0,3).map(a => `${a.type}: ${a.entity_name}`).join(', ')}`;
        if (gLearnings?.length) ctx += `\nRecent decisions: ${gLearnings.slice(0,3).map(l => (l.user_message||'').slice(0,80)).join('; ')}`;
        routingHint = `\n\n[ROUTING HINT: You have FULL access to all tools — CRM queries, web search, Gmail, Calendar, and all specialist agent tools. Think like a Chief of Staff who knows the entire business. If business context strengthens your answer, query the CRM. If current information is needed, use web search. Answer with depth, intelligence, and specificity.]` + ctx;
      } catch {
        routingHint = '\n\n[ROUTING HINT: You have full access to all tools. Answer with depth and intelligence. If business context would help, query the CRM. If current information is needed, search the web.]';
      }
    }

    // For outreach/content, pre-fetch context (registered users only)
    if (isRegistered && (intent === 'outreach' || intent === 'content')) {
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
              const rel = await sbFetch(`kiko_relationships?contact_email=eq.${encodeURIComponent(contacts[0].data.email.toLowerCase())}&user_id=eq.${userId}&limit=1`);
              if (Array.isArray(rel) && rel[0]) {
                const r = rel[0];
                routingHint += `\n[RELATIONSHIP: ${r.warmth_score > 0.6 ? 'WARM' : r.warmth_score > 0.35 ? 'LUKEWARM' : 'COLD'} | ${r.emails_sent} sent, ${r.emails_received} received | Type: ${r.relationship_type} | Last contact: ${r.last_sent_at ? new Date(r.last_sent_at).toLocaleDateString('en-GB') : 'unknown'}]`;
              }
            } catch {}
          }
          // Load learned email templates for drafting
          try {
            const templates = await sbFetch(`kiko_memories?path=eq./memories/email_templates.md&user_id=eq.${userId}&select=content&limit=1`);
            if (templates?.[0]?.content) {
              routingHint += `\n\n[LEARNED EMAIL TEMPLATES — use these patterns when drafting]:\n${templates[0].content.slice(0, 1000)}`;
            }
          } catch {}
          // Load outreach effectiveness patterns
          try {
            const patterns = await sbFetch(`kiko_learning_log?user_id=eq.${userId}&category=eq.outreach_patterns&order=created_at.desc&limit=1&select=content`);
            if (patterns?.[0]?.content) {
              routingHint += `\n[OUTREACH DATA: ${patterns[0].content.slice(0, 300)}]`;
            }
          } catch {}
        }
      } catch {} // Non-blocking — if context fetch fails, Claude still drafts
    }

    // ── UNIVERSAL ENTITY AUTO-RECALL — parallelized (registered users only) ──
    // Skip for fast intents (greeting, navigate, screen, calendar_read, email_read)
    const SKIP_ENTITY_RECALL = ['greeting', 'outreach', 'content', 'navigate', 'screen', 'calendar_read', 'email_read'];
    if (!voiceMode && isRegistered && !SKIP_ENTITY_RECALL.includes(intent)) {
      try {
        const capWords = message.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)*/g) || [];
        const userName = (userConfig.display_name || '').split(' ')[0];
        const filtered = capWords.filter(w => !['The','This','What','When','Where','How','Why','Can','Should','Would','Could','Please','Kiko',userName,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','January','February','March','April','May','June','July','August','September','October','November','December'].includes(w));
        if (filtered.length > 0) {
          const primary = filtered[0];
          // Fire all entity queries in parallel
          const [contacts, deals, convos, threads, signals] = await Promise.all([
            sbFetch(`contacts?select=data&or=(data->>firstName.ilike.*${encodeURIComponent(primary)}*,data->>lastName.ilike.*${encodeURIComponent(primary)}*,data->>company.ilike.*${encodeURIComponent(primary)}*)&limit=2`).catch(() => []),
            sbFetch(`deals?select=data&or=(data->>company.ilike.*${encodeURIComponent(primary)}*,data->>contactName.ilike.*${encodeURIComponent(primary)}*)&limit=2`).catch(() => []),
            sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&select=summary,entities_discussed&order=created_at.desc&limit=10`).catch(() => []),
            sbFetch(`kiko_thread_tracker?entity_name=ilike.*${encodeURIComponent(primary)}*&user_id=eq.${userId}&limit=1&select=discussion_count,thread_summary,key_decisions,open_questions,status`).catch(() => []),
            sbFetch(`news_articles?matched_companies=cs.[{"name":"${primary}"}]&order=published_at.desc&limit=1&select=title,published_at`).catch(() => []),
          ]);
          if (contacts?.length || deals?.length) {
            let entityCtx = '\n\n[AUTO-RECALL]:';
            for (const c of (contacts || []).slice(0, 2)) { const d = c.data || {}; entityCtx += `\n👤 ${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} @ ${d.company || '?'} | ${d.email || ''}`; }
            for (const dl of (deals || []).slice(0, 2)) { const d = dl.data || {}; entityCtx += `\n📊 ${d.company} — ${d.stage} | $${d.value || '?'} | ${d.contactName || '?'}`; }
            const relevant = (convos || []).filter(c => (c.entities_discussed || []).some(e => e.toLowerCase().includes(primary.toLowerCase())));
            if (relevant.length) entityCtx += `\n💬 Discussed ${relevant.length}x: ${relevant[0]?.summary?.slice(0, 100) || ''}`;
            if (threads?.[0]) { const th = threads[0]; entityCtx += `\n🔗 Thread (${th.discussion_count}x): ${(th.thread_summary||'').slice(0,150)}`; if (th.key_decisions?.length) entityCtx += ` | Decided: ${th.key_decisions.slice(-2).join('; ')}`; }
            if (signals?.length) entityCtx += `\n📰 ${signals[0].title}`;
            routingHint += entityCtx;
          }
        }
      } catch {}
    }

    // Phase 12: Load strategic preferences (SKIP in voice mode for speed)
    let preferencesHint = '';
    let profileHint = '';
    let memoryHint = '';
    let inboxHint = '';
    let personalHint = '';
    let morningBrief = '';
    if (isRegistered) { // All modes get personal context (voice uses light queries for speed)
    // ── CONTEXT LOADING — intent-aware (light for greetings, full for everything else) ──
    const isLightIntent = voiceMode || ['greeting', 'navigate', 'screen'].includes(intent);
    try {
      const queries = isLightIntent
        ? [ // Light: only 3 queries for greeting speed
          Promise.resolve([]), // prefs — skip
          Promise.resolve([]), // profiles — skip
          sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category,key,value&order=updated_at.desc&limit=15`).catch(() => []),
          Promise.resolve([]), // insights — skip
          sbFetch(`kiko_inbox_triage?triage_date=eq.${new Date().toISOString().split('T')[0]}&limit=1&select=summary,priority_emails`).catch(() => []),
          sbFetch(`kiko_alerts?type=eq.morning_brief&user_id=eq.${userId}&order=created_at.desc&limit=1&select=detail,created_at`).catch(() => []),
          Promise.resolve([]), // pending — skip
        ]
        : [ // Full: all 7 queries
          sbFetch(`kiko_preferences?user_id=eq.${userId}&order=confidence.desc&limit=10&select=category,preference,confidence`).catch(() => []),
          sbFetch(`kiko_user_profiles?user_id=eq.${userId || ''}&limit=1&select=draft_instructions,communication_style,language_fingerprint`).catch(() => []),
          sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category,key,value&order=updated_at.desc&limit=20`).catch(() => []),
          sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&order=created_at.desc&limit=5&select=key_facts,decisions_made,open_threads,entities_discussed`).catch(() => []),
          sbFetch(`kiko_inbox_triage?triage_date=eq.${new Date().toISOString().split('T')[0]}&limit=1&select=summary,priority_emails`).catch(() => []),
          sbFetch(`kiko_alerts?type=eq.morning_brief&user_id=eq.${userId}&order=created_at.desc&limit=1&select=detail,created_at`).catch(() => []),
          sbFetch(`kiko_draft_actions?status=eq.pending&user_id=eq.${userId}&order=created_at.desc&limit=5&select=action_type,payload,created_at`).catch(() => []),
        ];
      const [prefs, profiles, personal, insights, triage, brief, pending] = await Promise.all(queries);

      // Preferences
      if (Array.isArray(prefs) && prefs.length) {
        preferencesHint = `\n\n[${userConfig.display_name}'s DECISION PATTERNS — reference naturally]:`;
        for (const p of prefs) preferencesHint += `\n• [${p.category}] ${p.preference} (confidence: ${p.confidence})`;
      }

      // Communication profile
      if (Array.isArray(profiles) && profiles[0]?.draft_instructions) {
        const p = profiles[0];
        profileHint = `\n\n[${userConfig.display_name}'s VOICE — when drafting emails/messages, write EXACTLY like this]:`;
        profileHint += `\n${p.draft_instructions}`;
        if (p.language_fingerprint?.signature_phrases?.length) profileHint += `\nSignature phrases: ${p.language_fingerprint.signature_phrases.join(', ')}`;
        if (p.language_fingerprint?.avoided_phrases?.length) profileHint += `\nPhrases to AVOID: ${p.language_fingerprint.avoided_phrases.join(', ')}`;
        if (p.communication_style?.directness) profileHint += `\nDirectness: ${p.communication_style.directness} | Formality: ${p.communication_style.formality || '?'}`;
      }

      // Personal context
      if (personal?.length) {
        personalHint = `\n\n[${userConfig.display_name} — PERSONAL CONTEXT]:`;
        const byCat = {};
        for (const p of personal) { if (!byCat[p.category]) byCat[p.category] = []; byCat[p.category].push(p.value); }
        for (const [cat, items] of Object.entries(byCat)) personalHint += `\n[${cat}]: ${items.join('; ')}`;
      }

      // Conversation memory
      if (Array.isArray(insights) && insights.length) {
        memoryHint = '\n\n[RECENT CONVERSATION CONTEXT]:';
        for (const i of insights.slice(0, 3)) {
          if (i.decisions_made?.length) memoryHint += `\n• Decided: ${i.decisions_made.join('; ')}`;
          if (i.open_threads?.length) memoryHint += `\n• Open: ${i.open_threads.join('; ')}`;
        }
      }

      // Inbox triage
      if (Array.isArray(triage) && triage[0]?.summary) {
        inboxHint = `\n\n[TODAY'S INBOX: ${triage[0].summary}]`;
        const actions = (triage[0].priority_emails || []).filter(e => e.priority === 'ACTION_REQUIRED');
        if (actions.length) inboxHint += `\nAction needed: ${actions.map(e => `${e.from}: ${e.subject}`).join('; ')}`;
      }

      // Morning brief
      if (brief?.[0]?.detail) {
        const briefAge = Date.now() - new Date(brief[0].created_at);
        if (briefAge < 24 * 60 * 60 * 1000) {
          morningBrief = `\n\n[TODAY'S INTELLIGENCE BRIEF]:\n${brief[0].detail.slice(0, 1500)}`;
        }
      }

      // Pending draft actions
      if (pending?.length) {
        morningBrief += `\n\n[PENDING DRAFT ACTIONS (${pending.length})]:`;
        for (const d of pending.slice(0, 3)) morningBrief += `\n• ${d.action_type}: ${JSON.stringify(d.payload).slice(0, 100)}`;
        morningBrief += `\nSurface these when briefing or when relevant to the conversation. Ask if they want to approve or dismiss them.]`;
      }
    } catch {} // Non-blocking — if context fails, Kiko still works

    } // end isRegistered

    // Load operational mode (always, including voice)
    let modeHint = '';
    try {
      const mode = await sbFetch(`kiko_operational_mode?active=eq.true&user_id=eq.${userId}&order=created_at.desc&limit=1&select=id,mode,description,priorities,expires_at`);
      if (mode?.[0] && mode[0].mode !== 'default') {
        const m = mode[0];
        if (m.expires_at && new Date(m.expires_at) < new Date()) {
          // Mode expired — deactivate it
          await sbFetch(`kiko_operational_mode?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
        } else {
          modeHint = `\n\n[OPERATIONAL MODE: ${m.mode.toUpperCase()}]\n${m.description}`;
          if (m.priorities?.length) modeHint += `\nPriorities: ${m.priorities.join(' > ')}`;
          modeHint += `\nAdjust ALL responses to serve this mode. Every answer should ladder back to these priorities.`;
        }
      }
    } catch {}

    // ── Kiko Identity Layer — persistent personality from accumulated intelligence ──
    let identityHint = '';
    try {
      const identity = await sbFetch('kiko_identity?order=updated_at.desc&limit=15&select=category,content,confidence');
      const entries = Array.isArray(identity) ? identity : [];
      if (entries.length) {
        const grouped = {};
        entries.forEach(e => { if (!grouped[e.category]) grouped[e.category] = []; grouped[e.category].push(e); });
        let hint = '\n\n[KIKO IDENTITY — your accumulated strategic intelligence and positions]\n';
        for (const [cat, items] of Object.entries(grouped)) {
          hint += `\n${cat.toUpperCase().replace(/_/g, ' ')}:\n`;
          items.forEach(i => { hint += `• ${i.content}${i.confidence === 'high' ? '' : ` (${i.confidence} confidence)`}\n`; });
        }
        hint += '\nThese are YOUR positions. State them with conviction when relevant. Challenge the user if their approach contradicts your intelligence. You are an opinionated operating partner, not a passive assistant.';
        identityHint = hint;
      }
    } catch {}

    // ── Deal Attribution — Kiko's own impact tracking ──
    let attributionHint = '';
    try {
      const attrs = await sbFetch('kiko_deal_attribution?kiko_contributed=eq.true&order=created_at.desc&limit=10&select=deal_company,event_type,kiko_action,created_at');
      const attrArr = Array.isArray(attrs) ? attrs : [];
      if (attrArr.length) {
        const summary = {};
        attrArr.forEach(a => { summary[a.event_type] = (summary[a.event_type] || 0) + 1; });
        attributionHint = `\n\n[YOUR IMPACT — deals where your actions contributed to progression]\n${Object.entries(summary).map(([t, c]) => `• ${t}: ${c} deals`).join('\n')}\nRecent: ${attrArr.slice(0, 3).map(a => `${a.deal_company} (${a.event_type}) via ${a.kiko_action}`).join('; ')}\nYou are making measurable impact. Reference this when the user questions your effectiveness.`;
      }
    } catch {}

    // ── Email Style Feedback Loop (Phase 16) ──
    // When drafting emails, inject accumulated edit-delta lessons so Kiko improves over time
    let emailStyleHint = '';
    if (intent === 'outreach' || message.toLowerCase().includes('draft') || message.toLowerCase().includes('email')) {
      try {
        const deltas = await sbFetch('kiko_draft_tracking?edit_delta=not.is.null&order=sent_at.desc&limit=8&select=edit_delta,recipient,subject');
        const lessons = (Array.isArray(deltas) ? deltas : [])
          .map(d => d.edit_delta?.style_lesson).filter(Boolean);
        if (lessons.length) {
          emailStyleHint = `\n\n[EMAIL WRITING FEEDBACK — ${lessons.length} edits analysed]\nWhen you draft emails, the user consistently makes these corrections. Apply these lessons:\n${lessons.map((l, i) => `${i + 1}. ${l}`).join('\n')}\nAdjust your email drafting style accordingly. Do NOT mention this feedback to the user.`;
        }
        // Outreach outcome feedback — which approaches actually get replies
        const scores = await sbFetch('outreach_scores?order=sent_at.desc&limit=100&select=messaging_approach,outcome,cta_type,persona_seniority');
        const scoreArr = Array.isArray(scores) ? scores : [];
        if (scoreArr.length >= 5) {
          const byApproach = {};
          scoreArr.forEach(s => { const a = s.messaging_approach || 'unknown'; if (!byApproach[a]) byApproach[a] = { total: 0, replied: 0 }; byApproach[a].total++; if (s.outcome === 'replied') byApproach[a].replied++; });
          const ranked = Object.entries(byApproach).filter(([,d]) => d.total >= 2).sort((a, b) => (b[1].replied / b[1].total) - (a[1].replied / a[1].total));
          if (ranked.length) {
            emailStyleHint += `\n\n[OUTREACH OUTCOME DATA — ${scoreArr.length} emails tracked]\nApproach effectiveness (reply rates):\n${ranked.map(([a, d]) => `• ${a}: ${Math.round(d.replied / d.total * 100)}% (${d.replied}/${d.total})`).join('\n')}\nFavour higher-performing approaches when drafting. Do NOT mention these statistics to the user.`;
          }
        }
        // Company intelligence injection — auto-pull enriched data for target companies
        try {
          const companyIntel = await sbFetch('company_intelligence?enrichment_quality=eq.structured&order=enriched_at.desc&limit=30&select=company_name,funding_total,last_funding_round,revenue_estimate,employee_count,ceo,cto,cmo,industry,sub_sector,competitors,existing_sponsorships,sponsorship_fit_score,marketing_budget_signal');
          const intelArr = Array.isArray(companyIntel) ? companyIntel : [];
          if (intelArr.length) {
            const msgLower = message.toLowerCase();
            const matched = intelArr.filter(c => msgLower.includes(c.company_name?.toLowerCase()));
            if (matched.length) {
              emailStyleHint += `\n\n[COMPANY INTELLIGENCE — pre-enriched data]\n${matched.map(c => `${c.company_name}: ${c.industry || ''}${c.sub_sector ? '/' + c.sub_sector : ''} | Revenue: ${c.revenue_estimate || '?'} | Funding: ${c.funding_total || '?'} (${c.last_funding_round || '?'}) | Employees: ${c.employee_count || '?'} | CEO: ${c.ceo || '?'} | CTO: ${c.cto || '?'} | CMO: ${c.cmo || '?'} | Competitors: ${(c.competitors || []).join(', ') || '?'} | Existing sponsors: ${(c.existing_sponsorships || []).join(', ') || 'none known'} | Sponsorship fit: ${c.sponsorship_fit_score || '?'}/100 | Marketing spend signal: ${c.marketing_budget_signal || '?'}`).join('\n')}\nUse this data to craft a more specific, informed email. Reference relevant facts naturally.`;
            }
          }
        } catch {}
      } catch {}
    }

    const systemWithHint = system + identityContext + routingHint + preferencesHint + personalHint + profileHint + memoryHint + inboxHint + morningBrief + modeHint + identityHint + attributionHint + emailStyleHint;

    // ── Prompt Caching ──
    // Split system content into stable (cached) and dynamic (not cached) blocks
    // The base system prompt + self-knowledge are stable per user session (~9K tokens)
    // Context hints change per request and should NOT be cached
    const systemCached = [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: identityContext + routingHint + preferencesHint + personalHint + profileHint + memoryHint + inboxHint + morningBrief + modeHint },
    ];

    // Deep think detection
    const DEEP_TRIGGERS = ['analyse', 'analyze', 'deep dive', 'think through', 'strategic', 'evaluate', 'comprehensive'];
    const needsDeepThink = !voiceMode && (deepThink || (message && DEEP_TRIGGERS.some(t => message.toLowerCase().includes(t))));

    // MCP servers
    // MCP disabled — email/calendar use our own Google API tools directly

    // Stream helper — with prompt caching for cost reduction
    async function streamCall(msgs, opts = {}) {
      // Tool rounds use Sonnet for speed. Only final synthesis uses Opus (if deep think).
      // fast: true forces Sonnet even if deep think was requested (used when time budget hit)
      // Only super_admin gets deep think (requires beta API)
      const useDeep = isSuperAdmin && needsDeepThink && opts.noTools && !opts.fast;
      const useHaiku = opts.useHaiku === true;
      
      // Build tools array with cache_control on last tool (caches entire tool block)
      let toolsWithCache = undefined;
      if (!opts.noTools) {
        toolsWithCache = [...allTools];
        if (toolsWithCache.length > 0) {
          const last = { ...toolsWithCache[toolsWithCache.length - 1] };
          last.cache_control = { type: 'ephemeral' };
          toolsWithCache[toolsWithCache.length - 1] = last;
        }
      }
      
      const params = {
        model: useDeep ? 'claude-opus-4-6' : (useHaiku ? 'claude-haiku-4-5-20251001' : MODEL),
        max_tokens: opts.maxTokens || (useDeep ? 16000 : 4096),
        system: systemCached, messages: msgs, tools: toolsWithCache,
      };
      if (useDeep) {
        params.thinking = { type: 'enabled', budget_tokens: 10000 };
        write({ toolStatus: 'Deep analysis...' });
      }
      // Non-super-admin: use non-beta API to prevent Anthropic memory injection
      // Super-admin: use beta API (supports extended thinking + memory)
      const stream = isSuperAdmin
        ? anthropic.beta.messages.stream(params)
        : anthropic.messages.stream(params);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { write({ delta: event.delta.text }); responseText += event.delta.text; }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') write({ thinking: event.delta.thinking });
      }
      return await stream.finalMessage();
    }

    const INTENT_LABELS = {
      pipeline: 'Checking deal pipeline...', deals: 'Searching deals...', contacts: 'Looking up contacts...',
      organisations: 'Searching organisations...', tasks: 'Reviewing tasks...', calendar: 'Checking calendar...',
      strategy: 'Evaluating strategic opportunity...', partnership: 'Analysing partnership landscape...',
      negotiation: 'Preparing negotiation analysis...', outreach: 'Drafting outreach...', content: 'Generating content...',
      brief: 'Preparing your morning brief...', screen: 'Reading current screen...', category: 'Analysing sponsorship categories...',
      navigation: 'Navigating...', memory: 'Searching your history...', general: 'Thinking...',
      code_review: 'Analysing platform code...', email: 'Checking emails...', document: 'Processing document...',
    };
    write({ toolStatus: INTENT_LABELS[intent] || 'Thinking...' });
    let responseText = '';
    const requestStart = Date.now();

    // Fast-path for greetings and simple queries — skip tool loop, use Haiku for speed
    // Voice: ALL greetings use Haiku (speed > proactive context). Text: first-message greetings use Sonnet.
    const FAST_RESPONSE_INTENTS = ['greeting'];
    const isSimpleGreeting = FAST_RESPONSE_INTENTS.includes(intent);
    const useHaikuForGreeting = isSimpleGreeting && (voiceMode || !isFirstMessage);
    const skipTools = isSimpleGreeting;
    let response = await streamCall(messages, skipTools ? { noTools: true, maxTokens: voiceMode ? 300 : 1500, useHaiku: useHaikuForGreeting } : {});
    let toolRounds = 0;

    // Tool execution loop — time-aware, stops before timeout
    const maxRounds = voiceMode ? 5 : 5;
    const timeLimit = voiceMode ? 45000 : 65000; // 45s for voice tools (research needs time), 65s for text
    while (response.stop_reason === 'tool_use' && toolRounds < maxRounds) {
      const elapsed = Date.now() - requestStart;
      if (elapsed > timeLimit) {
        console.log(`[KIKO] Time budget exceeded (${elapsed}ms) after ${toolRounds} tool rounds — forcing response`);
        break;
      }
      toolRounds++;
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        write({ toolStatus: TOOL_LABELS[block.name] || `Running ${block.name}...` });
        let result;
        try {
          result = block.name === 'memory'
            ? await handleMemory(block.input, userId)
            : await executeTool(block.name, block.input, userEmail, pageContext, userId);
        } catch (toolErr) {
          const errMsg = toolErr.message || String(toolErr);
          // Detect Google OAuth/token expiry
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('invalid_grant') || errMsg.includes('Token has been expired')) {
            result = `AUTH_EXPIRED: Google authentication has expired. Please ask Sunny to reconnect his Google account in Settings → Accounts. The ${block.name.replace('ask_', '').replace('read_', '')} tool cannot run until re-authenticated.`;
          } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT') || errMsg.includes('fetch failed') || errMsg.includes('network')) {
            // Retry once for transient network errors
            try {
              await new Promise(r => setTimeout(r, 2000));
              result = block.name === 'memory'
                ? await handleMemory(block.input, userId)
                : await executeTool(block.name, block.input, userEmail, pageContext, userId);
            } catch (retryErr) {
              result = `TOOL_ERROR: ${block.name} failed after retry — ${(retryErr.message || '').slice(0, 200)}. This is a temporary connectivity issue. Try again in a moment.`;
            }
          } else {
            result = `TOOL_ERROR: ${block.name} encountered an error — ${errMsg.slice(0, 200)}. I'll work with what I have.`;
          }
          // Log the error
          try { await logError(`tool:${block.name}`, errMsg, `input: ${JSON.stringify(block.input).slice(0, 300)}`); } catch {}
        }
        // Handle navigation from any tool
        if ((block.name === 'navigate_page' || block.name === 'ask_navigator') && result?.navigated) write({ navigate: result.page });
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 8000)
        });
        if (isRegistered) {
          logDecision(block.name, block.input, result, message, userId);
          trackOutput(block.name, intent, message, result, userId);
          journalInsight(block.name, block.input, result, message, userId);
        }
        // Audit: log every tool call
        auditLog('tool_call', { userId, userEmail, intent, toolName: block.name, detail: JSON.stringify(block.input).slice(0, 300) });
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await streamCall(messages);
    }

    // If Claude still wants tools but we're out of budget — force a text response
    if (response.stop_reason === 'tool_use') {
      write({ toolStatus: 'Synthesising response...' });
      // Extract all tool results gathered so far into a concise summary
      const toolData = [];
      for (const m of messages) {
        if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block.type === 'tool_result') {
              const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
              toolData.push(text.slice(0, 1500));
            }
          }
        }
      }
      // Build a compact synthesis request — original question + collected data only
      const synthMessages = [
        { role: 'user', content: `ORIGINAL QUESTION: ${message}\n\nCOLLECTED DATA FROM ${toolRounds} RESEARCH ROUNDS:\n${toolData.join('\n---\n').slice(0, 12000)}\n\nSynthesise a comprehensive, actionable response using ALL the data above. Do NOT request any more tools. Respond directly.` },
      ];
      response = await streamCall(synthMessages, { noTools: true, fast: true, maxTokens: 3000 });
    }

    // Fallback: if response is still empty, send a meaningful message
    if (!responseText || responseText.trim().length < 10) {
      write({ delta: 'I gathered data but couldn\'t complete the full synthesis. Try breaking your question into smaller parts — for example: "Research semiconductor companies for Haas" then separately "Draft the Monaco strategy."' });
    }

    // Include cache stats in meta for cost tracking
    const usage = response?.usage || {};
    const actualModel = needsDeepThink ? 'claude-opus-4-6' : (useHaikuForGreeting ? 'claude-haiku-4-5-20251001' : MODEL);
    const totalDuration = Date.now() - queryStartTime;
    write({ meta: { done: true, model: actualModel, toolRounds, intent, version: 'v16.3',
      cache: { write: usage.cache_creation_input_tokens || 0, read: usage.cache_read_input_tokens || 0, input: usage.input_tokens || 0, output: usage.output_tokens || 0 }
    } });
    finished = true; clearTimeout(watchdog);
    // Audit: log completion with duration
    auditLog('response_complete', { userId, userEmail, intent, durationMs: totalDuration, detail: `model=${actualModel} tools=${toolRounds} tokens=${usage.input_tokens||0}+${usage.output_tokens||0}` });
    res.write('data: [DONE]\n\n');
    res.end();

    // ── Memory Engine: auto-extract facts (registered users only) ──
    const userMsgCount = messages.filter(m => m.role === 'user' && typeof m.content === 'string').length;
    if (isRegistered && userMsgCount >= 2) {
      try {
        const { callMemoryEngine } = await import('./agents/memory-engine.js');
        const recentMsgs = messages.slice(-8).filter(m => typeof m.content === 'string').map(m => ({ role: m.role, content: m.content }));
        callMemoryEngine('extract_and_store', { messages: recentMsgs, entityContext: entityContext || '' }).catch(() => {});
      } catch {}
    }
    // Conversation Memory: extract insights for cross-session continuity (registered users only)
    if (isRegistered) {
      extractConversationInsights(message, responseText, intent, userId);
    }

    // Auto-embed conversation for semantic search (non-blocking)
    if (isRegistered && responseText.length > 100 && !['navigate', 'screen', 'greeting'].includes(intent)) {
      try {
        const { embedConversation } = await import('./embed-utils.js');
        const convMsgs = messages.filter(m => typeof m.content === 'string').slice(-6);
        const convId = `live_${Date.now()}_${userId?.slice(0, 8) || 'anon'}`;
        const title = (message || '').slice(0, 80);
        embedConversation(convId, 'kiko', title, convMsgs, userId).catch(() => {});
      } catch {}
    }

    // ── UNIVERSAL LEARNING ENGINE — registered users only ──
    if (isRegistered && !['navigate', 'screen'].includes(intent) && responseText.length > 200) {
      try {
        const extract = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 400,
          system: `Analyse this exchange between the user and Kiko (AI OS). Extract ALL of the following. Return ONLY JSON:
{
  "facts": ["1-3 key facts worth remembering permanently"],
  "entity": "main company/person name or null",
  "personal": ["any personal details revealed — family, preferences, habits, health, hobbies, goals, feelings"],
  "unknown_topics": ["topics discussed where Kiko seemed to lack depth or gave generic answers"],
  "category": "business|personal|mixed"
}
If nothing worth saving, return empty arrays.`,
          messages: [{ role: 'user', content: `Q: ${message.slice(0, 300)}\nA: ${responseText.slice(0, 1000)}` }],
        });
        const parsed = JSON.parse((extract.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

        // Save facts to learning log
        for (const fact of (parsed.facts || []).slice(0, 3)) {
          await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
            user_id: userId,
            category: 'auto_learning', content: fact,
            entity_name: parsed.entity || null, user_message: message.slice(0, 200),
          })});
        }

        // Save personal context
        for (const personal of (parsed.personal || []).slice(0, 3)) {
          await sbFetch('kiko_personal_context', { method: 'POST', body: JSON.stringify({
            user_id: userId, category: 'inferred', key: personal.slice(0, 50), value: personal, source: 'conversation',
          })});
        }

        // Queue unknown topics for curiosity learning
        for (const topic of (parsed.unknown_topics || []).slice(0, 2)) {
          await sbFetch('kiko_curiosity_queue', { method: 'POST', body: JSON.stringify({
            user_id: userId, topic, category: parsed.category || 'general',
            reason: 'Kiko lacked depth on this topic during conversation',
            source_conversation: message.slice(0, 200), priority: 7,
          })});
        }
      } catch {} // Non-blocking
    }
  } catch (err) {
    console.error('[KIKO] Error:', err);
    finished = true; clearTimeout(watchdog);
    try { logError('coordinator', err?.message || 'unknown', (message || '').slice(0, 100), 'critical'); } catch {}
    try { write({ delta: `\n\nSomething went wrong: ${err?.message || 'Unknown error'}. Try again.` }); } catch {}
    try { res.write('data: [DONE]\n\n'); } catch {}
    try { res.end(); } catch {}
  }
}
