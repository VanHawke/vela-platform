// api/agents/intent-classifier.js — Haiku-based intent classification
// Replaces 24-rule routing prompt. ~100ms classification.
// Uses structured outputs for guaranteed valid JSON.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Deterministic category-gap detector ──
// Catches queries like "which sector should we target for Haas" / "what categories
// are open" / "where's the best opportunity" — routes to /api/category-gaps which
// queries f1_partnerships directly. ZERO LLM involvement = zero hallucination.
const GAP_TRIGGERS = [
  'which sector', 'which category', 'which categories', 'which sectors',
  'what sector', 'what category', 'what categories', 'what sectors',
  'which industry', 'which industries', 'what industry', 'what industries',
  'where should we target', 'what should we target', 'who should we target',
  'best opportunity', 'best opportunities', 'best sector', 'best category',
  'category gap', 'category gaps', 'open category', 'open categories',
  'open slot', 'open slots', 'open sector', 'open sectors',
  'identify.*potential.*sector', 'identify.*potential.*category', 'identify.*industries',
  'categor.*potential', 'sector.*target', 'gap analysis',
];
const F1_TEAM_ALIASES = {
  'haas': 'haas', 'haas f1': 'haas',
  'ferrari': 'ferrari', 'scuderia ferrari': 'ferrari',
  'mercedes': 'mercedes', 'mercedes-amg': 'mercedes',
  'mclaren': 'mclaren',
  'red bull': 'red_bull', 'redbull': 'red_bull',
  'williams': 'williams',
  'aston martin': 'aston_martin',
  'alpine': 'alpine',
  'racing bulls': 'racing_bulls', 'rb': 'racing_bulls', 'visa cash app': 'racing_bulls',
  'cadillac': 'cadillac',
  'audi': 'audi', 'sauber': 'audi',
};

function detectCategoryGap(message) {
  const lower = (message || '').toLowerCase();
  // Must have a gap-trigger phrase
  const hasTrigger = GAP_TRIGGERS.some(t => {
    if (t.includes('.*')) return new RegExp(t, 'i').test(lower);
    return lower.includes(t);
  });
  if (!hasTrigger) return null;
  // Find team reference (optional — defaults to whichever team has most open slots)
  let teamId = null;
  const sortedTeams = Object.entries(F1_TEAM_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, tid] of sortedTeams) {
    if (lower.includes(alias)) { teamId = tid; break; }
  }
  return { intent: 'category_gap', team: teamId };
}

// ── Deterministic navigation — no LLM needed ──
// Broader trigger set: includes short commands like "take me there" after a recent
// campaign-redirect turn, plus generic "show me / bring up" phrasings.
const NAV_TRIGGERS = [
  'take me to', 'take me there', 'go to', 'open the', 'open campaigns', 'open pipeline',
  'navigate to', 'switch to', 'pull up', 'bring up', 'show me', 'jump to', 'head to',
];
const PAGE_ALIASES = {
  'campaign builder': 'campaigns', 'campaign page': 'campaigns', 'campaigns page': 'campaigns',
  'campaigns': 'campaigns', 'campaign': 'campaigns', 'there': 'campaigns', // "take me there" after campaign redirect
  'pipeline': 'pipeline', 'deals': 'pipeline', 'deal pipeline': 'pipeline',
  'command centre': 'command-centre', 'command center': 'command-centre', 'outreach intelligence': 'command-centre',
  'contacts': 'contacts', 'people': 'contacts',
  'organisations': 'organisations', 'organizations': 'organisations', 'companies': 'organisations',
  'tasks': 'command-centre', 'to do': 'command-centre', 'todo': 'command-centre', 'task list': 'command-centre',
  'calendar': 'calendar', 'schedule': 'calendar', 'race calendar': 'calendar', 'races': 'calendar',
  'partnership matrix': 'partnership-matrix', 'matrix': 'partnership-matrix', 'partnerships': 'partnership-matrix',
  'lemlist': 'lemlist',
  'home': 'home', 'dashboard': 'home', 'homepage': 'home',
  'settings': 'settings',
};

function detectNavigation(message, conversationHistory = []) {
  const lower = (message || '').toLowerCase().trim();
  // Short commands like "take me there" / "go there" / "yes take me" after a
  // recent campaign-redirect turn should navigate to /campaigns.
  const shortNavPhrases = ['take me there', 'go there', 'yes take me', 'take me', 'there please', 'ok take me', 'yes go'];
  if (shortNavPhrases.some(p => lower === p || lower === p + '.' || lower === p + '!')) {
    // Check if the last assistant turn mentioned /campaigns
    const lastAssistant = [...(conversationHistory || [])].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && /\/campaigns|campaign builder|⚡ build/i.test(lastAssistant.content || '')) {
      return { intent: 'navigate', target: 'campaigns' };
    }
    // Default for bare "take me there" = campaigns (most common context)
    return { intent: 'navigate', target: 'campaigns' };
  }
  const hasNavTrigger = NAV_TRIGGERS.some(t => lower.includes(t));
  if (!hasNavTrigger) return null;
  // Sort by length descending — match "command centre" before "contacts"
  const sorted = Object.entries(PAGE_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, pageId] of sorted) {
    if (lower.includes(alias)) return { intent: 'navigate', target: pageId };
  }
  return null;
}

// ── Haiku classifier — structured output ──
const CLASSIFY_PROMPT = `Classify this user message into exactly one intent. Consider the full message carefully.

INTENTS:
- screen: Asking what's on screen, what page they're on, describe what they see
- crm_write: Moving deals between stages, creating tasks, updating contacts, creating deals, adding reminders
- data: Searching contacts/companies/deals, pipeline stats, entity details, stale contacts, email analytics, news, activity feed
- outreach: Drafting emails, Gmail drafts, follow-ups, adding leads to Lemlist campaigns, recipient analysis
- brief: Morning brief, daily priorities, "what should I focus on", task consolidation
- strategy: "Should we pursue X", evaluate opportunities, kill or continue, capital allocation
- content: LinkedIn posts, SponsorSignal, case studies, newsletters, thought leadership
- research: Deep research on a company, industry analysis, competitor intelligence, web search needed
- memory: "What do we know about X", relationship summary, recall everything about an entity
- finance: Pipeline value, weighted forecast, revenue projection, runway, financial analysis
- lemlist: Lemlist campaign stats, open rates, reply rates, warm leads, bounced leads, credit balance, deliverability, "how are campaigns doing", "Lemlist performance"
- signal: Recent deal signals, funding events, hiring spikes, intent signals, "what signals this week"
- document: Create Word docs, spreadsheets, presentations, CSVs, export pipeline/contacts, QR codes
- negotiation: Counter-offers, pricing pushback, "they came back at X", concession strategy
- category: Sponsorship category availability, "gaps on Haas", exclusivity conflicts
- legal: Contract review, clause analysis, risk flagging
- dispute: Active disputes, procedural responses, landlord/CDDA issues
- investment: Valuation, raise strategy, investor narrative, dilution modelling
- pricing: Sponsorship benchmarks, ROI cases, "how much should we charge"
- travel: F1/FE race travel, trip planning, visa awareness
- calendar: Check calendar, schedule meetings, what's on today (Google Calendar)
- email_read: Check emails, read emails, inbox search, unread count, email correspondence, "last email from/to/with X", "correspondence with X", "what did X email me", "any emails from X", "email thread with X", finding specific emails or email history (Gmail)
- self_monitor: System health, errors, "are you working", "what broke", "diagnose yourself", "is inbox triage running", cron status, agent stats
- knowledge: Knowledge management — "learn from this URL", "add this source", "what do you know about X", "show me your sources", "remember this", "save this insight", "create an agent for Y", "show my agents", "run the X agent", managing Kiko's knowledge base and custom agents
- conversation_search: Recall past conversations — "we discussed X before", "you mentioned Y", "what did we talk about last week", "recall our conversation about Z", references to prior discussions
- document_query: Find or browse uploaded documents — "show me the Haas deck", "find the agency agreement", "what team decks do we have", "documents for F1", "any contracts uploaded", browsing the document library
- code_review: Self-analysis — "review your code", "analyse your architecture", "how can you improve", "suggest improvements", "your weaknesses", "performance report", "read your source code", introspection about Kiko's own capabilities and code. NOT for ship/commit/release history (those use git log injection — route to 'general').
- general: General conversation, greetings, questions Claude can answer from knowledge

Respond with ONLY the intent name. Nothing else.`;

export async function classifyIntent(message, currentPage = 'home', conversationHistory = []) {
  // Step 0: Deterministic category-gap detection — bypasses LLM entirely
  const gap = detectCategoryGap(message);
  if (gap) return { intent: 'category_gap', target: gap.team, confidence: 0.99, useMCP: false };
  // Step 1: Check deterministic navigation first (0ms)
  const nav = detectNavigation(message, conversationHistory);
  if (nav) return nav;

  // Step 2: Quick keyword checks for common high-confidence intents (0ms)
  const lower = message.toLowerCase();
  if (/^(hi|hey|hello|good morning|good evening|thanks|thank you|bye|goodbye)\b/i.test(lower)) return { intent: 'general' };
  if (lower.includes('brief me') || lower.includes('morning brief') || lower === 'brief') return { intent: 'brief' };
  if (lower.includes('what am i looking at') || lower.includes('what\'s on screen') || lower.includes('where am i') || lower.includes('describe this page')) return { intent: 'screen' };

  // Command Centre fast-path — when on /command-centre, priority/focus questions
  // MUST route to screen intent so describeCommandCentre's visible priority list
  // is fed into the prompt. Otherwise the LLM defaults to a generic deals digest
  // and ignores the on-page priority order Sunny actually sees.
  if (currentPage === 'command-centre' || currentPage === 'outreach-intelligence') {
    if (
      /\b(prioriti[sz]e|priorities|focus|act on|tackle|do (today|first|next)|what should i|where (do i|should i) start|first thing|biggest|top \d|act first|hot|urgent)\b/i.test(message) ||
      /^(brief|brief me|status|status update)$/i.test(message.trim())
    ) {
      return { intent: 'screen' };
    }
  }
  if (lower.includes('correspondence with') || lower.includes('last email') || lower.includes('email from') || lower.includes('email to') || lower.includes('emails from') || lower.includes('emails to') || lower.includes('check my email') || lower.includes('check my inbox') || lower.includes('unread email')) return { intent: 'email_read' };

  // Finance shortcuts — pipeline value, revenue, forecast, runway
  if (/\b(pipeline value|weighted.*pipeline|weighted.*value|revenue.*projec|forecast|runway|cash.*flow|burn.*rate|financial.*analy|roi.*calc|cap.*table|valuation)\b/i.test(message)) return { intent: 'finance' };

  // Knowledge management shortcuts (includes agent creation)
  if (lower.includes('learn from') || lower.includes('add this source') || lower.includes('add source') || lower.includes('show me your sources') || lower.includes('your knowledge') || lower.includes('what do you know about') || lower.includes('save this insight') || lower.includes('remember this fact') || lower.includes('create an agent') || lower.includes('create a new agent') || lower.includes('build an agent') || lower.includes('show my agents') || lower.includes('list agents') || lower.includes('custom agent') || lower.includes('dynamic agent') || lower.includes('switch to') && lower.includes('mode') || lower.includes('fundraising mode') || lower.includes('race week mode') || lower.includes('what mode') || lower.includes('operational mode')) return { intent: 'knowledge' };

  // Conversation search shortcuts
  if (lower.includes('we discussed') || lower.includes('you mentioned') || lower.includes('what did we talk') || lower.includes('recall our conversation') || lower.includes('we talked about') || lower.includes('previous conversation') || lower.includes('earlier conversation') || lower.includes('last time we spoke')) return { intent: 'conversation_search' };

  // Document library queries
  if (lower.includes('team deck') || lower.includes('team decks') || lower.includes('document library') || lower.includes('agency agreement') || lower.includes('show me the') && (lower.includes('contract') || lower.includes('deck') || lower.includes('document')) || lower.includes('uploaded document') || lower.includes('find the') && lower.includes('deck') || lower.includes('haas deck') || lower.includes('alpine deck') || lower.includes('williams deck')) return { intent: 'document_query' };

  if (lower.includes('master brief') || lower.includes('digest this') || lower.includes('operating instructions') || lower.includes('learn from this') || lower.includes('update your brief') || lower.includes('rewrite your brief') || lower.includes('these are your instructions') || lower.includes('absorb this')) return { intent: 'master_brief' };

  // Code review / self-analysis shortcuts
  // SHIP / COMMIT / HISTORY questions go to general (uses git log injection in self-knowledge), NOT code_review
  if (/\b(ship(ped)?|commit(s|ted)?|deploy(ed|ment)?|release(s|d)?|build(s|t)?\s*(yesterday|recently|today|this week|last week|last \d+ days?))\b/i.test(message) && /\b(you|your)\b/i.test(message)) {
    return { intent: 'general' };
  }
  if (lower.includes('review your code') || lower.includes('your architecture') || lower.includes('how can you improve') || lower.includes('suggest improvements') || lower.includes('your weaknesses') || lower.includes('performance report') || lower.includes('read your source') || lower.includes('analyse yourself') || lower.includes('self-analysis') || lower.includes('your own code')) return { intent: 'code_review' };

  // Identity fast-path — "who are you", "what are you", "what can you do", "introduce yourself"
  // These stall in the tool loop because Claude "helpfully" calls ask_memory_engine after answering.
  // Answer from KIKO_BIBLE system prompt only. No tools. Fast response.
  if (
    /^(kiko[,\s]+)?(who|what) (are|r) (you|u|kiko)\b/i.test(message.trim()) ||
    /^(tell me |can you )?(who|what) is kiko\b/i.test(message.trim()) ||
    /^(what (can|do) you do|introduce yourself|tell me about yourself|describe yourself|your purpose|your role)\b/i.test(message.trim()) ||
    /^kiko\??$/i.test(message.trim())
  ) {
    return { intent: 'identity' };
  }

  // Company lookup fast-path — "tell me about Acme", "info on Stripe", "intel on X", "lookup Y"
  // Routes to deterministic /api/company-lookup. Zero LLM hallucination on facts.
  // Excludes self-referential ("yourself", "kiko") and CRM meta queries ("my pipeline", "my deals").
  const companyLookupPatterns = [
    /^tell me (about|more about) (.+?)(?:\?|$)/i,
    /^(?:what|who) is (?!kiko\b)(.+?)(?:\?|$)/i,
    /^(?:info|intel|details|background|the latest) on (.+?)(?:\?|$)/i,
    /^(?:lookup|look up|company lookup) (.+?)(?:\?|$)/i,
  ];
  for (const re of companyLookupPatterns) {
    const m = message.trim().match(re);
    if (!m) continue;
    const captured = (m[2] || m[1] || '').trim();
    // Reject self-referential or meta-CRM queries
    if (!captured) continue;
    if (/^(yourself|your |you |me|us|our |kiko|my |the |a |an |this |that |it |how |why |when |where |what )/i.test(captured)) continue;
    if (/^(pipeline|deals|contacts|inbox|calendar|tasks|sequences|campaigns|partnerships|alerts)\b/i.test(captured)) continue;
    if (captured.length < 2 || captured.length > 80) continue;
    // Reject if captured text contains question words (not a company name)
    if (/\b(when|where|why|how|should|would|could|do you|does|about|mandatory|objective|process|format|rule|approach|strategy|best|which|necessary|required|important)\b/i.test(captured)) continue;
    // Reject if too many words (company names are typically 1-5 words)
    if (captured.split(/\s+/).length > 6) continue;
    return { intent: 'company_lookup', target: captured };
  }

  // Step 3: Haiku classification for everything else (~100-200ms)
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: CLASSIFY_PROMPT,
      messages: [{ role: 'user', content: `[Current page: ${currentPage}] ${message}` }],
    });
    const intentText = (response.content?.[0]?.text || 'general').trim().toLowerCase().replace(/[^a-z_]/g, '');
    const validIntents = ['navigate','screen','crm_write','data','outreach','lemlist','signal','brief','strategy','content','research','memory','finance','document','negotiation','category','legal','dispute','investment','pricing','travel','calendar','email_read','self_monitor','knowledge','conversation_search','code_review','identity','company_lookup','general'];
    const intent = validIntents.includes(intentText) ? intentText : 'general';
    console.log(`[Intent] "${message.slice(0,60)}" → ${intent} (${response.usage?.input_tokens || '?'}in/${response.usage?.output_tokens || '?'}out)`);
    return { intent };
  } catch (err) {
    console.error('[Intent] Classification failed:', err.message);
    return { intent: 'general' }; // Fallback — let the full tool loop handle it
  }
}

// ── Intent → Agent mapping ──
export const INTENT_TO_AGENT = {
  navigate:    { tool: 'navigate_page' },
  screen:      { tool: 'ask_navigator' },
  crm_write:   { tool: 'ask_deal_agent' },
  data:        { tool: 'ask_data_agent' },
  outreach:    { tool: 'ask_outreach_agent' },
  lemlist:     { tool: 'ask_lemlist_live' },
  signal:      { tool: 'ask_signal_agent' },
  brief:       { tool: 'ask_ea_agent', defaultOp: 'brief' },
  strategy:    { tool: 'ask_strategy_agent' },
  content:     { tool: 'ask_content_agent' },
  research:    { tool: null, useWebSearch: true },
  memory:      { tool: 'ask_memory_engine' },
  finance:     { tool: 'ask_finance_agent' },
  document:    { tool: 'ask_document_agent' },
  document_query: { tool: 'ask_data_agent' },
  negotiation: { tool: 'ask_negotiation_agent' },
  category:    { tool: 'ask_category_agent' },
  legal:       { tool: 'ask_legal_agent' },
  dispute:     { tool: 'ask_dispute_agent' },
  investment:  { tool: 'ask_investment_agent' },
  pricing:     { tool: 'ask_pricing_agent' },
  travel:      { tool: 'ask_travel_agent' },
  calendar:    { tool: 'read_calendar' },
  email_read:  { tool: 'read_email' },
  self_monitor: { tool: 'ask_self_monitor' },
  knowledge:    { tool: 'manage_knowledge' },
  conversation_search: { tool: 'search_conversations' },
  code_review: { tool: 'ask_code_review' },
  identity:    { tool: null, directResponse: true },
  company_lookup: { tool: null, directResponse: true },
  general:     { tool: null, directResponse: true },
};
