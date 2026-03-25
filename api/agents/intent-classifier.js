// api/agents/intent-classifier.js — Haiku-based intent classification
// Replaces 24-rule routing prompt. ~100ms classification.
// Uses structured outputs for guaranteed valid JSON.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Deterministic navigation — no LLM needed ──
const NAV_TRIGGERS = ['take me to', 'go to', 'open the', 'navigate to', 'switch to', 'pull up'];
const PAGE_ALIASES = {
  'pipeline': 'pipeline', 'deals': 'pipeline', 'deal pipeline': 'pipeline',
  'command centre': 'email', 'command center': 'email', 'outreach intelligence': 'email',
  'contacts': 'contacts', 'people': 'contacts',
  'organisations': 'organisations', 'organizations': 'organisations', 'companies': 'organisations',
  'tasks': 'tasks', 'to do': 'tasks', 'todo': 'tasks', 'task list': 'tasks',
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
- outreach: Drafting emails, Gmail drafts, follow-ups, Lemlist campaigns, recipient analysis
- brief: Morning brief, daily priorities, "what should I focus on", task consolidation
- strategy: "Should we pursue X", evaluate opportunities, kill or continue, capital allocation
- content: LinkedIn posts, SponsorSignal, case studies, newsletters, thought leadership
- research: Deep research on a company, industry analysis, competitor intelligence, web search needed
- memory: "What do we know about X", relationship summary, recall everything about an entity
- finance: Pipeline value, weighted forecast, revenue projection, runway, financial analysis
- document: Create Word docs, spreadsheets, presentations, CSVs, export pipeline/contacts, QR codes
- negotiation: Counter-offers, pricing pushback, "they came back at X", concession strategy
- category: Sponsorship category availability, "gaps on Haas", exclusivity conflicts
- legal: Contract review, clause analysis, risk flagging
- dispute: Active disputes, procedural responses, landlord/CDDA issues
- investment: Valuation, raise strategy, investor narrative, dilution modelling
- pricing: Sponsorship benchmarks, ROI cases, "how much should we charge"
- travel: F1/FE race travel, trip planning, visa awareness
- calendar: Check calendar, schedule meetings, what's on today (Google Calendar)
- email_read: Check emails, unread count, inbox search (Gmail)
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

  // Step 3: Haiku classification for everything else (~100-200ms)
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: CLASSIFY_PROMPT,
      messages: [{ role: 'user', content: `[Current page: ${currentPage}] ${message}` }],
    });
    const intentText = (response.content?.[0]?.text || 'general').trim().toLowerCase().replace(/[^a-z_]/g, '');
    const validIntents = ['screen','crm_write','data','outreach','brief','strategy','content','research','memory','finance','document','negotiation','category','legal','dispute','investment','pricing','travel','calendar','email_read','general'];
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
  general:     { tool: null, directResponse: true },
};
