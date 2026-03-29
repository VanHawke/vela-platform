// api/agents/intent-classifier.js — Haiku-based intent classification
// Replaces 24-rule routing prompt. ~100ms classification.
// Uses structured outputs for guaranteed valid JSON.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Deterministic navigation — no LLM needed ──
const NAV_TRIGGERS = ['take me to', 'go to', 'open the', 'navigate to', 'switch to', 'pull up'];
const PAGE_ALIASES = {
  'pipeline': 'pipeline', 'deals': 'pipeline', 'deal pipeline': 'pipeline',
  'command centre': 'command-centre', 'command center': 'command-centre', 'outreach intelligence': 'command-centre',
  'contacts': 'contacts', 'people': 'contacts',
  'organisations': 'organisations', 'organizations': 'organisations', 'companies': 'organisations',
  'tasks': 'command-centre', 'to do': 'command-centre', 'todo': 'command-centre', 'task list': 'command-centre',
  'calendar': 'calendar', 'schedule': 'calendar', 'race calendar': 'calendar', 'races': 'calendar',
  'partnership': 'strategy', 'partnership matrix': 'strategy', 'partnerships': 'strategy',
  'partnership matrix': 'partnership-matrix', 'matrix': 'partnership-matrix', 'partnerships': 'partnership-matrix',
  'lemlist': 'lemlist', 'campaigns': 'lemlist',
  'lemlist': 'lemlist', 'campaigns': 'lemlist',
  'home': 'home', 'dashboard': 'home', 'homepage': 'home',
  'settings': 'settings',
};

function detectNavigation(message) {
  const lower = message.toLowerCase();
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
- code_review: Self-analysis — "review your code", "analyse your architecture", "how can you improve", "suggest improvements", "your weaknesses", "performance report", "read your source code", introspection about Kiko's own capabilities and code
- general: General conversation, greetings, questions Claude can answer from knowledge

Respond with ONLY the intent name. Nothing else.`;

export async function classifyIntent(message, currentPage = 'home') {
  // Step 1: Check deterministic navigation first (0ms)
  const nav = detectNavigation(message);
  if (nav) return nav;

  // Step 2: Quick keyword checks for common high-confidence intents (0ms)
  const lower = message.toLowerCase();
  if (/^(hi|hey|hello|good morning|good evening|thanks|thank you|bye|goodbye)\b/i.test(lower)) return { intent: 'general' };
  if (lower.includes('brief me') || lower.includes('morning brief') || lower === 'brief') return { intent: 'brief' };
  if (lower.includes('what am i looking at') || lower.includes('what\'s on screen') || lower.includes('where am i') || lower.includes('describe this page')) return { intent: 'screen' };
  if (lower.includes('correspondence with') || lower.includes('last email') || lower.includes('email from') || lower.includes('email to') || lower.includes('emails from') || lower.includes('emails to') || lower.includes('check my email') || lower.includes('check my inbox') || lower.includes('unread email')) return { intent: 'email_read' };

  // Knowledge management shortcuts (includes agent creation)
  if (lower.includes('learn from') || lower.includes('add this source') || lower.includes('add source') || lower.includes('show me your sources') || lower.includes('your knowledge') || lower.includes('what do you know about') || lower.includes('save this insight') || lower.includes('remember this fact') || lower.includes('create an agent') || lower.includes('create a new agent') || lower.includes('build an agent') || lower.includes('show my agents') || lower.includes('list agents') || lower.includes('custom agent') || lower.includes('dynamic agent') || lower.includes('switch to') && lower.includes('mode') || lower.includes('fundraising mode') || lower.includes('race week mode') || lower.includes('what mode') || lower.includes('operational mode')) return { intent: 'knowledge' };

  // Conversation search shortcuts
  if (lower.includes('we discussed') || lower.includes('you mentioned') || lower.includes('what did we talk') || lower.includes('recall our conversation') || lower.includes('we talked about') || lower.includes('previous conversation') || lower.includes('earlier conversation') || lower.includes('last time we spoke')) return { intent: 'conversation_search' };

  // Code review / self-analysis shortcuts
  if (lower.includes('review your code') || lower.includes('your architecture') || lower.includes('how can you improve') || lower.includes('suggest improvements') || lower.includes('your weaknesses') || lower.includes('performance report') || lower.includes('read your source') || lower.includes('analyse yourself') || lower.includes('self-analysis') || lower.includes('your own code')) return { intent: 'code_review' };

  // Step 3: Haiku classification for everything else (~100-200ms)
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: CLASSIFY_PROMPT,
      messages: [{ role: 'user', content: `[Current page: ${currentPage}] ${message}` }],
    });
    const intentText = (response.content?.[0]?.text || 'general').trim().toLowerCase().replace(/[^a-z_]/g, '');
    const validIntents = ['navigate','screen','crm_write','data','outreach','lemlist','signal','brief','strategy','content','research','memory','finance','document','negotiation','category','legal','dispute','investment','pricing','travel','calendar','email_read','self_monitor','knowledge','conversation_search','code_review','general'];
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
  negotiation: { tool: 'ask_negotiation_agent' },
  category:    { tool: 'ask_category_agent' },
  legal:       { tool: 'ask_legal_agent' },
  dispute:     { tool: 'ask_dispute_agent' },
  investment:  { tool: 'ask_investment_agent' },
  pricing:     { tool: 'ask_pricing_agent' },
  travel:      { tool: 'ask_travel_agent' },
  calendar:    { tool: null, useMCP: 'google-calendar' },
  email_read:  { tool: null, useMCP: 'gmail' },
  self_monitor: { tool: 'ask_self_monitor' },
  knowledge:    { tool: 'manage_knowledge' },
  conversation_search: { tool: 'search_conversations' },
  code_review: { tool: 'ask_code_review' },
  general:     { tool: null, directResponse: true },
};
