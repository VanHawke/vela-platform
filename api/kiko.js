// api/kiko.js — Kiko Prime: Coordinator with Intent Classification (Phase 1)
// Step 1: Haiku classifies intent (~100ms)
// Step 2: Deterministic navigation OR agent dispatch OR full tool loop
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch, logError } from './kiko-tools.js';
import { classifyIntent, INTENT_TO_AGENT } from './agents/intent-classifier.js';
import { generateSelfKnowledge } from './kiko-self-knowledge.js';
import { describeScreen } from './agents/screen-reader.js';

export const config = { supportsResponseStreaming: true, maxDuration: 120 };

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
const SYSTEM_PROMPT = `You are Kiko — the AI operating system for {COMPANY_NAME}.
You work with {USER_NAME}, {USER_TITLE}, based in {USER_LOCATION}. Never ask their name or location.

You are a COORDINATOR. You route requests to specialist agents and relay their results naturally. You never say "the agent said" — you speak as Kiko.

ROUTING (follow these in order):

1. SCREEN / PAGE questions → call ask_navigator
   "what's on screen", "what am I looking at", "describe this page", "where am I"

2. NAVIGATION → call ask_navigator
   "take me to", "go to", "show me", "open", "switch to"

3. CRM WRITES → call ask_deal_agent
   "move [company] to [stage]", "create a task", "add a reminder", "follow up with", "create a deal", "update [person]"

4. DATA QUERIES → call ask_data_agent
   Search contacts/companies/deals, entity details, pipeline stats, stale contacts, email analytics, outreach intelligence, news, partnership matrix, deal history, activity feed, past conversations, learning log, warm path to target company ("who do we know at X", "how do we get to Y", "find me a way into Z"), win/loss analysis ("what worked", "why did we lose X", "deal patterns")

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

21. SELF-MONITORING → call ask_self_monitor
   "are you working", "system health", "what errors", "is inbox triage running", "diagnose yourself", "what broke", "cron status"

22. DEEP RESEARCH → use web_search tool directly (run 5-8 searches, synthesise)
   "research [company]", "deep dive on [X]", "deep research". Run multiple web searches systematically: company overview, funding, leadership, news, competitors, partnerships. Synthesise into structured brief with sections: OVERVIEW, KEY PEOPLE, RECENT DEVELOPMENTS, FINANCIAL POSITION, PARTNERSHIP SIGNALS, RECOMMENDED APPROACH. After research, ALWAYS save key findings using manage_knowledge (save_insight) so you remember them next time.

23. CALENDAR / GMAIL → call read_calendar or read_email
   "check my calendar", "any meetings today", "what's my schedule", "check my email", "unread emails", "emails from X", "last email about Y"

24. WEB SEARCH → use web_search tool directly

25. MEMORY → use memory tool directly (save important facts, check stored context)

26. PAST CONVERSATIONS → call search_conversations
   "you mentioned this before", "what did we discuss about X", "recall our conversation about Y", "we talked about this", any reference to prior discussions or historical context

27. KNOWLEDGE & AGENT MANAGEMENT → call manage_knowledge
   "learn from this URL", "add this source", "what do you know about X", "show me your sources", "remember this", "save this insight", "create an agent for Y", "show my agents", "run the X agent", "switch to fundraising mode", "what mode are we in". Operations: add_source, search_knowledge, list_sources, learn_topic, save_insight, create_agent, list_agents, run_agent, set_mode (fundraising/race_week/outreach_sprint/deal_closing/product_launch), get_mode. You can CREATE NEW SPECIALIST AGENTS and SWITCH OPERATIONAL MODES on the fly.

28. EMAIL TRIAGE → call trigger_triage
   "check my emails" when inbox data is stale (>24h old), "refresh inbox", "what's in my inbox right now". Always check kiko_inbox_triage freshness first — if today's date matches, use the cached data. If stale, trigger fresh triage.

29. CODE SELF-ANALYSIS → call ask_code_review
   "review your code", "analyse your architecture", "how can you improve", "suggest improvements", "performance report", "what are your weaknesses", "read your source code". Operations: architecture (codebase structure), review (specific file), performance (analytics), suggest (AI improvement recommendations), read (raw source).

STYLE: Direct, corporate, high-signal. No fluff. No "happy to help." Lead with value. Max 2-3 sentences for simple queries. Use "intelligent age" not "AI generation." All financials in USD.

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

PROACTIVE: When briefing, flag stale deals, recommend next actions, connect signals to opportunities. When you spot something important, save it to memory via ask_data_agent (operation: learning_save).

SELF-KNOWLEDGE: {DYNAMIC_SELF_KNOWLEDGE}

IMAGE ANALYSIS: You CAN see and analyse uploaded images. When a user uploads an image (screenshot, photo, document scan), describe what you see and provide relevant analysis. Do NOT say you cannot view images — the image data is sent to you directly.

WEB ACCESS: You CAN search the internet. You have a web_search tool that lets you look up any current information — company details, news, funding rounds, market data, anything. Do NOT say you cannot access the internet, browse the web, or search for information. When asked to research something or find current information, USE the web_search tool immediately. You are not limited to your training data.

ORCHESTRATION — HOW YOU WORK:
You have up to 10 tool rounds per conversation. Use them intelligently:

1. SIMPLE QUERIES (1 tool): "move Decagon to Negotiation" → ask_deal_agent. Done.
2. COMPOUND QUERIES (2-3 tools): "What do we know about Cloudflare and should we pursue them?" → ask_data_agent (CRM check) → ask_strategy_agent (evaluation). Chain them.
3. RESEARCH + ACTION (3-5 tools): "Research Nordic Semi and draft an intro email" → web_search (company intel) → ask_data_agent (CRM check for existing contacts) → ask_outreach_agent (draft email with real context). Always gather context BEFORE drafting.
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
  ask_self_monitor: 'Self-Monitor: checking...',
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
  const entityContext = await fetchEntityContext(pageEntity);
  const pageRole = PAGE_ROLES[currentPage] || '';

  // Skills removed from Prime — domain expertise lives inside specialist agents.
  // Loading skills here caused Prime to attempt tasks directly instead of routing to agents.

  // Load Kiko's self-model (identity) for all conversations
  let identityContext = '';
  try {
    const identity = await sbFetch(`kiko_memories?path=eq./memories/identity.md&user_id=eq.${userId}&select=content&limit=1`);
    if (identity?.[0]?.content) identityContext = '\n\n── KIKO IDENTITY ──\n' + identity[0].content.slice(0, 2000);
  } catch {}

  // Voice mode adjustments
  let voiceRules = '';
  let preloadedMemory = '';
  if (voiceMode || currentPage === 'voice') {
    try {
      const memRows = await sbFetch(`kiko_memories?select=path,content&is_directory=eq.false&user_id=eq.${userId}&path=like./memories/%_profile.md&order=path.asc`);
      if (memRows?.length) preloadedMemory = '\n\n── MEMORY ──\n' + memRows.map(r => r.content).join('\n\n');
    } catch {}
    voiceRules = '\n\nVOICE MODE — SPEED IS CRITICAL:\n- Max 2 sentences. No markdown. Say numbers naturally.\n- For greetings (hi, hello, hey, good morning): respond IMMEDIATELY with a warm 1-sentence reply. Do NOT call any tools.\n- For simple questions you can answer from the system prompt context: respond IMMEDIATELY. Do NOT call tools.\n- ONLY call a tool if the user explicitly asks for data, actions, or information you genuinely cannot answer without it.\n- NEVER call memory tools — memory is already pre-loaded above.\n- Keep responses SHORT and spoken-word natural. No lists. No headers.';
  }

  const PERSONALITIES = {
    concise: '\nSTYLE: Ultra-concise. Max 2-3 sentences. Bullet points preferred.',
    analytical: '\nSTYLE: Analytical. Show reasoning. Include data, comparisons, evidence.',
    warm: '\nSTYLE: Warm and encouraging. Acknowledge efforts, frame challenges constructively.',
    executive: '\nSTYLE: Board-level. Direct, strategic. Lead with conclusion, support with evidence.',
  };

  // ── Load user config FIRST — drives all personalization ──
  const userConfig = await getUserConfig(userEmail);
  const userId = userConfig.user_id || '00000000-0000-0000-0000-000000000000';
  const isSuperAdmin = userConfig.role === 'super_admin';

  // Generate dynamic self-knowledge (auto-discovers agents, tools, crons) — scoped per user
  let selfKnowledge = '';
  try { selfKnowledge = await generateSelfKnowledge(userId); } catch { selfKnowledge = 'Self-knowledge generation failed. You have 23+ agents, web search, Gmail, Calendar, memory, and full CRM access.'; }

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
    + `\n\n[CRITICAL IDENTITY: The user you are speaking with RIGHT NOW is ${userConfig.display_name}. Address them as ${userConfig.display_name.split(' ')[0]}. Do NOT use any other name. Do NOT refer to them by any name from your memory — ONLY use the name provided here: ${userConfig.display_name}.]`;

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
    const classification = await classifyIntent(message, currentPage);
    const { intent, target } = classification;

    // ── Context-Aware Greeting: first message = proactive status push ──
    const isFirstMessage = conversationHistory.length <= 1;
    const isGreeting = /^(hi|hey|hello|good morning|good evening|morning|evening|yo|sup|what'?s up)\b/i.test(message.trim());
    if (isFirstMessage && isGreeting && !voiceMode) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg.content === 'string') {
        messages[messages.length - 1] = { role: 'user', content: `${lastMsg.content}\n\n[CONTEXT: This is ${userConfig.display_name}'s first message of this session. DO NOT just say hello back. Greet them briefly (one line) then immediately give a 4-5 sentence proactive status update: any urgent alerts, stale deals needing attention, overdue tasks, recent signals, what you recommend they focus on. Be a Chief of Staff who walks in with the briefing, not a receptionist who says "how can I help you today." Lead with the most important thing.]` };
      }
    }

    // Non-blocking: detect if user is rephrasing (correction learning)
    detectCorrection(message, conversationHistory, intent);

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

    // For general queries, inject live CRM context so Claude has business awareness
    if (intent === 'general') {
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

    // ── UNIVERSAL ENTITY AUTO-RECALL — for ANY intent mentioning a company/person ──
    if (!voiceMode && intent !== 'outreach' && intent !== 'content' && intent !== 'navigate' && intent !== 'screen') {
      try {
        const capWords = message.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)*/g) || [];
        const userName = (userConfig.display_name || '').split(' ')[0];
        const filtered = capWords.filter(w => !['The','This','What','When','Where','How','Why','Can','Should','Would','Could','Please','Kiko',userName,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','January','February','March','April','May','June','July','August','September','October','November','December'].includes(w));
        if (filtered.length > 0) {
          const primary = filtered[0];
          const contacts = await sbFetch(`contacts?select=data&or=(data->>firstName.ilike.*${encodeURIComponent(primary)}*,data->>lastName.ilike.*${encodeURIComponent(primary)}*,data->>company.ilike.*${encodeURIComponent(primary)}*)&limit=2`);
          const deals = await sbFetch(`deals?select=data&or=(data->>company.ilike.*${encodeURIComponent(primary)}*,data->>contactName.ilike.*${encodeURIComponent(primary)}*)&limit=2`);
          if (contacts?.length || deals?.length) {
            let entityCtx = '\n\n[AUTO-RECALL — what we know about entities mentioned]:';
            for (const c of (contacts || []).slice(0, 2)) {
              const d = c.data || {};
              entityCtx += `\n👤 ${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} @ ${d.company || '?'} | ${d.email || ''}`;
            }
            for (const dl of (deals || []).slice(0, 2)) {
              const d = dl.data || {};
              entityCtx += `\n📊 ${d.company} — Stage: ${d.stage} | Value: $${d.value || '?'} | Contact: ${d.contactName || '?'} | Pipeline: ${d.pipeline || '?'}`;
            }
            // Check for conversation history with this entity
            const convos = await sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&select=summary,entities_discussed&order=created_at.desc&limit=10`);
            const relevant = (convos || []).filter(c => (c.entities_discussed || []).some(e => e.toLowerCase().includes(primary.toLowerCase())));
            if (relevant.length) entityCtx += `\n💬 Discussed ${relevant.length} times recently: ${relevant[0]?.summary?.slice(0, 100) || ''}`;
            // Check for thread history (cross-session tracking)
            const threads = await sbFetch(`kiko_thread_tracker?entity_name=ilike.*${encodeURIComponent(primary)}*&user_id=eq.${userId}&limit=1&select=discussion_count,thread_summary,key_decisions,open_questions,status`);
            if (threads?.[0]) {
              const th = threads[0];
              entityCtx += `\n🔗 THREAD (${th.discussion_count}x): ${(th.thread_summary || '').slice(0, 150)}`;
              if (th.key_decisions?.length) entityCtx += `\n  Decided: ${th.key_decisions.slice(-3).join('; ')}`;
              if (th.open_questions?.length) entityCtx += `\n  Open: ${th.open_questions.slice(-3).join('; ')}`;
            }
            // Check for signals
            const signals = await sbFetch(`news_articles?matched_companies=cs.[{"name":"${primary}"}]&order=published_at.desc&limit=1&select=title,published_at`);
            if (signals?.length) entityCtx += `\n📰 Signal: ${signals[0].title}`;
            routingHint += entityCtx;
          }
        }
      } catch {} // Never fail on auto-recall
    }

    // Phase 12: Load strategic preferences (SKIP in voice mode for speed)
    let preferencesHint = '';
    let profileHint = '';
    let memoryHint = '';
    let inboxHint = '';
    let personalHint = '';
    let morningBrief = '';
    if (!voiceMode) {
    try {
      const prefs = await sbFetch(`kiko_preferences?user_id=eq.${userId}&order=confidence.desc&limit=10&select=category,preference,confidence`);
      if (Array.isArray(prefs) && prefs.length) {
        preferencesHint = '\n\n[SUNNY\'S DECISION PATTERNS — reference naturally, never list these explicitly]:';
        for (const p of prefs) preferencesHint += `\n• [${p.category}] ${p.preference} (confidence: ${p.confidence})`;
      }
    } catch {} // Non-blocking

    // Phase 15: Load user communication profile
    try {
      const profiles = await sbFetch(`kiko_user_profiles?user_id=eq.${userId || ''}&limit=1&select=draft_instructions,communication_style,language_fingerprint`);
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

    // Personal context: inject Sunny's personal information for personal queries
    try {
      const personal = await sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category,key,value&order=updated_at.desc&limit=20`);
      if (personal?.length) {
        personalHint = '\n\n[SUNNY — PERSONAL CONTEXT (reference naturally, never list these)]:';
        const byCat = {};
        for (const p of personal) { if (!byCat[p.category]) byCat[p.category] = []; byCat[p.category].push(p.value); }
        for (const [cat, items] of Object.entries(byCat)) {
          personalHint += `\n[${cat}]: ${items.join('; ')}`;
        }
      }
    } catch {}

    // Conversation Memory: inject recent insights for cross-session continuity
    try {
      const insights = await sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&order=created_at.desc&limit=5&select=key_facts,decisions_made,open_threads,entities_discussed`);
      if (Array.isArray(insights) && insights.length) {
        memoryHint = '\n\n[RECENT CONVERSATION CONTEXT — reference naturally for continuity]:';
        for (const i of insights.slice(0, 3)) {
          if (i.decisions_made?.length) memoryHint += `\n• Decided: ${i.decisions_made.join('; ')}`;
          if (i.open_threads?.length) memoryHint += `\n• Open: ${i.open_threads.join('; ')}`;
        }
      }
    } catch {}

    // Inbox triage: inject if available (for briefs and general questions)
    try {
      const today = new Date().toISOString().split('T')[0];
      const triage = await sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=summary,priority_emails`);
      if (Array.isArray(triage) && triage[0]?.summary) {
        inboxHint = `\n\n[TODAY'S INBOX: ${triage[0].summary}]`;
        const actions = (triage[0].priority_emails || []).filter(e => e.priority === 'ACTION_REQUIRED');
        if (actions.length) inboxHint += `\nAction needed: ${actions.map(e => `${e.from}: ${e.subject}`).join('; ')}`;
      }
    } catch {}

    // Morning intelligence brief: inject today's brief if available
    try {
      const brief = await sbFetch(`kiko_alerts?type=eq.morning_brief&user_id=eq.${userId}&order=created_at.desc&limit=1&select=detail,created_at`);
      if (brief?.[0]?.detail) {
        const briefAge = Date.now() - new Date(brief[0].created_at);
        if (briefAge < 24 * 60 * 60 * 1000) { // Only if less than 24h old
          morningBrief = `\n\n[TODAY'S INTELLIGENCE BRIEF — reference proactively, especially during briefs and priority questions]:\n${brief[0].detail.slice(0, 1500)}`;
        }
      }
    } catch {}

    // System health alerts — surface if anything is broken
    try {
      const healthAlerts = await sbFetch(`kiko_alerts?type=eq.system_health&severity=eq.high&user_id=eq.${userId}&order=created_at.desc&limit=1&select=detail,created_at,expires_at`);
      if (healthAlerts?.[0]?.detail) {
        const alert = healthAlerts[0];
        if (new Date(alert.expires_at) > new Date()) {
          morningBrief += `\n\n[⚠️ SYSTEM HEALTH ISSUE: ${alert.detail}. If the user asks about system status or something isn't working, reference this. Suggest checking /api/health for details.]`;
        }
      }
    } catch {}

    // Pending draft actions — surface proactively
    try {
      const pending = await sbFetch(`kiko_draft_actions?status=eq.pending&user_id=eq.${userId}&order=created_at.desc&limit=5&select=action_type,payload,created_at`);
      if (pending?.length) {
        morningBrief += `\n\n[PENDING ACTIONS (${pending.length} waiting for approval):`;
        for (const p of pending) {
          morningBrief += `\n• ${p.payload?.suggested_action || p.action_type} (${p.payload?.entity || '?'})`;
        }
        morningBrief += `\nSurface these when briefing or when relevant to the conversation. Ask if they want to approve or dismiss them.]`;
      }
    } catch {}
    } // end !voiceMode

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

    const systemWithHint = system + identityContext + routingHint + preferencesHint + personalHint + profileHint + memoryHint + inboxHint + morningBrief + modeHint;

    // Deep think detection
    const DEEP_TRIGGERS = ['analyse', 'analyze', 'deep dive', 'think through', 'strategic', 'evaluate', 'comprehensive'];
    const needsDeepThink = !voiceMode && (deepThink || (message && DEEP_TRIGGERS.some(t => message.toLowerCase().includes(t))));

    // MCP servers
    // MCP disabled — email/calendar use our own Google API tools directly

    // Stream helper — clean, no MCP complexity
    async function streamCall(msgs, opts = {}) {
      // Tool rounds use Sonnet for speed. Only final synthesis uses Opus (if deep think).
      // fast: true forces Sonnet even if deep think was requested (used when time budget hit)
      const useDeep = needsDeepThink && opts.noTools && !opts.fast;
      const params = {
        model: useDeep ? 'claude-opus-4-6' : (voiceMode ? 'claude-haiku-4-5-20251001' : MODEL),
        max_tokens: opts.maxTokens || (useDeep ? 16000 : (voiceMode ? 800 : 4096)),
        system: systemWithHint, messages: msgs, tools: opts.noTools ? undefined : allTools,
      };
      if (useDeep) {
        params.thinking = { type: 'enabled', budget_tokens: 10000 };
        write({ toolStatus: 'Deep analysis...' });
      }
      const stream = anthropic.beta.messages.stream(params);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { write({ delta: event.delta.text }); responseText += event.delta.text; }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') write({ thinking: event.delta.thinking });
      }
      return await stream.finalMessage();
    }

    write({ toolStatus: intent !== 'general' ? `Intent: ${intent}` : 'Thinking...' });
    let responseText = ''; // Accumulate for conversation memory extraction — declared before streamCall
    const requestStart = Date.now();
    let response = await streamCall(messages);
    let toolRounds = 0;

    // Tool execution loop — time-aware, stops before timeout
    const maxRounds = voiceMode ? 2 : 5;
    const timeLimit = voiceMode ? 12000 : 65000; // 65s for tools, leaves 50s for synthesis + overhead
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
        const result = block.name === 'memory'
          ? await handleMemory(block.input, userId)
          : await executeTool(block.name, block.input, userEmail, pageContext, userId);
        // Handle navigation from any tool
        if ((block.name === 'navigate_page' || block.name === 'ask_navigator') && result?.navigated) write({ navigate: result.page });
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 8000)
        });
        logDecision(block.name, block.input, result, message, userId); // Phase 8
        trackOutput(block.name, intent, message, result, userId); // Phase 18
        journalInsight(block.name, block.input, result, message, userId); // Phase 19
      }
      write({ toolStatus: null });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await streamCall(messages);
    }

    // If Claude still wants tools but we're out of budget — force a text response
    if (response.stop_reason === 'tool_use') {
      write({ toolStatus: 'Composing response...' });
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

    write({ meta: { done: true, model: needsDeepThink ? 'claude-opus-4-6' : MODEL, toolRounds, intent, version: 'v16.1' } });
    finished = true; clearTimeout(watchdog);
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
    extractConversationInsights(message, responseText, intent, userId);

    // ── UNIVERSAL LEARNING ENGINE — learns from EVERY conversation ──
    if (!['navigate', 'screen'].includes(intent) && responseText.length > 200) {
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
