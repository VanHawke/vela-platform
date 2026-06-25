// kiko-tools.js — CLEAN REBUILD v15.0
// Agent routing layer. Kiko Prime calls agents, agents execute operations.
// All CRM/email/file operations live inside agents. This file is routing only.

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// ── Supabase Helper (shared by all agents) ──
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
export const sbFetch = async (path, opts = {}) => {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SK(), Authorization: `Bearer ${SK()}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  // Guard against non-JSON responses (errors, empty bodies)
  const text = await res.text();
  if (!text || text.trim().length === 0) return opts.method && opts.method !== 'GET' ? {} : [];
  try { return JSON.parse(text); }
  catch { console.error(`[sbFetch] Non-JSON response for ${path}: ${text.slice(0, 200)}`); return opts.method && opts.method !== 'GET' ? {} : []; }
};

// ── Reconciliation helpers (account ownership/strategy state + task dedup) ──
// Find an OPEN task for a company, org-wide across ALL users. Used to stop duplicate generation.
export const findOpenTaskForCompany = async (company, orgId = ORG_ID) => {
  const c = (company || '').trim();
  if (!c) return null;
  const enc = encodeURIComponent(c);
  const rows = await sbFetch(`tasks?org_id=eq.${orgId}&data->>company=ilike.${enc}&or=(data->>completed.is.null,data->>completed.eq.false)&select=id,data&limit=1`).catch(() => []);
  return (rows && rows[0]) || null;
};

// ── Parked intelligence (cold prospects are parked, never tasked) ──
// DOCTRINE: a task is earned by a real prior touch, and a touch is a TWO-WAY dialogue
// (a reply we RECEIVED), not a send. A company we only emailed (personal or campaign)
// with no reply is COLD. Warm = a reply on record from the company, or an active deal.
export const companyHasReply = async (company) => {
  const c = (company || '').trim();
  if (!c) return false;
  const enc = encodeURIComponent(c);
  const replied = await sbFetch(`kiko_email_tracking?company=ilike.${enc}&replied_at=not.is.null&select=company&limit=1`).catch(() => []);
  if (Array.isArray(replied) && replied.length) return true;
  const deal = await sbFetch(`deals?data->>company=ilike.${enc}&data->>status=eq.active&select=id&limit=1`).catch(() => []);
  return Array.isArray(deal) && deal.length > 0;
};

// Record a cold prospect hypothesis as dormant intelligence (deduped on email|company while parked).
export const parkIntelligence = async (p = {}) => {
  const company = (p.company || '').trim();
  const name = (p.name || '').trim();
  const email = (p.email || '').trim().toLowerCase();
  const dedupe = `${(email || name).toLowerCase()}|${company.toLowerCase()}`;
  try {
    const existing = await sbFetch(`kiko_parked_intelligence?dedupe_key=eq.${encodeURIComponent(dedupe)}&status=eq.parked&select=id&limit=1`).catch(() => []);
    if (Array.isArray(existing) && existing.length) return { parked: false, deduped: true, id: existing[0].id };
    await sbFetch('kiko_parked_intelligence', { method: 'POST', body: JSON.stringify({
      entity_type: p.entity_type || 'prospect',
      name: name || null, role: p.role || null, company: company || null,
      email: email || null, contact_id: p.contact_id || null,
      category: p.category || null, target_team: p.target_team || null,
      rationale: p.rationale || null, signals: p.signals || null,
      source: p.source || 'system', status: 'parked',
      dedupe_key: dedupe, org_id: p.org_id || ORG_ID,
    }) });
    return { parked: true };
  } catch (e) { console.error('[parkIntelligence]', e.message); return { parked: false, error: e.message }; }
};

// Promote a parked row into an active campaign (the only path from note to outreach).
export const promoteParkedIntelligence = async (id, opts = {}) => {
  if (!id) return { promoted: false };
  try {
    await sbFetch(`kiko_parked_intelligence?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'promoted', promoted_at: new Date().toISOString(), promoted_to_sequence_id: opts.sequence_id || null }),
    });
    return { promoted: true };
  } catch (e) { console.error('[promoteParkedIntelligence]', e.message); return { promoted: false, error: e.message }; }
};

// Read the current account state (owner / strategy / ruled-out plays) for a company.
export const getAccountState = async (company, orgId = ORG_ID) => {
  const c = (company || '').trim().toLowerCase();
  if (!c) return null;
  const enc = encodeURIComponent(c);
  const rows = await sbFetch(`kiko_account_state?org_id=eq.${orgId}&account_key=eq.${enc}&select=*&limit=1`).catch(() => []);
  return (rows && rows[0]) || null;
};

// ── Error Logger (write to kiko_error_log for self-monitoring) ──
export const logError = async (component, errorMessage, context = '', severity = 'error') => {
  try {
    await sbFetch('kiko_error_log', {
      method: 'POST',
      body: JSON.stringify({ component, error_message: (errorMessage || '').slice(0, 1000), context: (context || '').slice(0, 500), severity })
    });
  } catch {} // Must never throw — this is the error logger itself
};

// ── Cron Heartbeat (write to kiko_cron_heartbeats for self-monitoring) ──
export const cronHeartbeat = async (cronName, status, extras = {}) => {
  try {
    if (status === 'started') {
      const res = await sbFetch('kiko_cron_heartbeats', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cron_name: cronName, status: 'started', metadata: extras })
      });
      return res?.[0]?.id || null;
    } else {
      // Update existing heartbeat with finished status
      if (extras.heartbeatId) {
        await sbFetch(`kiko_cron_heartbeats?id=eq.${extras.heartbeatId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status, finished_at: new Date().toISOString(), duration_ms: extras.durationMs, records_processed: extras.recordsProcessed, error_message: extras.errorMessage })
        });
      }
    }
  } catch {} // Must never throw
};

// ── Agent Tool Definitions (6 agents — down from 49 tools) ──
export const TOOL_DEFINITIONS = [
  {
    name: 'ask_navigator',
    description: 'Screen awareness + navigation. Use when user asks: what is on screen, what page am I on, what am I looking at, take me to [page], go to [page], show me [page], open [page], walk me through this.',
    input_schema: { type: 'object', properties: {
      instruction: { type: 'string', description: 'What the user wants — describe screen, navigate to page, explain page' },
    }, required: ['instruction'] },
  },
  {
    name: 'ask_deal_agent',
    description: 'CRM write operations. Use when user asks to: move a deal stage, create a task, add a reminder, create a deal, update a contact, follow up with someone in X days.',
    input_schema: { type: 'object', properties: {
      instruction: { type: 'string', description: 'Full instruction — e.g. "move Decagon to Qualified", "create a task to call Ryan in 2 days"' },
    }, required: ['instruction'] },
  },
  // ═══ SPLIT: ask_data_agent replaced with 5 purpose-specific tools (Kiko's design) ═══
  {
    name: 'crm_search',
    description: 'CRM lookups — search contacts, companies, deals, get entity details, deal history, thread history, company intelligence.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['search_contacts', 'search_companies', 'search_deals', 'entity_detail', 'company_intel', 'deal_history', 'thread_history', 'enrich_company', 'warm_path', 'stale_contacts'], description: 'CRM read operation' },
      params: { type: 'object', description: 'query (search term), company (name), limit (number)' },
    }, required: ['operation'] },
  },
  {
    name: 'campaign_engine',
    description: 'Campaign lifecycle — create campaigns, enroll contacts, check status, pause/cancel sequences, LinkedIn queue, source prospects.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['campaign_overview', 'create_campaign', 'source_companies', 'source_contacts', 'bulk_enroll', 'start_sequence', 'sequence_status', 'pause_sequence', 'cancel_sequence', 'linkedin_queue', 'campaign_health', 'optimize_campaign'], description: 'Campaign operation' },
      params: { type: 'object', description: 'campaign/sequence name, company, category, team' },
    }, required: ['operation'] },
  },
  {
    name: 'pipeline_analytics',
    description: 'Pipeline intelligence — email analytics, outreach timing, deal predictions, win/loss analysis, activity feed, partnership matrix.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['email_analytics', 'outreach_intelligence', 'outreach_timing', 'pipeline_notifications', 'activity_feed', 'deal_prediction', 'win_loss', 'alerts', 'news', 'partnership_matrix', 'refresh_partnerships', 'update_partnership'], description: 'Analytics operation' },
      params: { type: 'object', description: 'query, team_id, partner_name, category_id, tier, status' },
    }, required: ['operation'] },
  },
  {
    name: 'knowledge_ops',
    description: 'Knowledge management — search/save learnings, search documents, past conversations, skills, bookmarks.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['learning_search', 'learning_save', 'search_documents', 'past_conversations', 'recent_conversations', 'skills', 'bookmark', 'morning_briefing', 'run_morning_briefing'], description: 'Knowledge operation' },
      params: { type: 'object', description: 'query (search term)' },
    }, required: ['operation'] },
  },
  {
    name: 'goals_intents',
    description: 'Goals and intents — list/update goals, create/update intents, record/review outcomes.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['list_goals', 'update_goal', 'record_outcome', 'review_outcomes', 'list_intents', 'create_intent', 'update_intent'], description: 'Goals/intents operation' },
      params: { type: 'object', description: 'title, status, priority, description, next_action, due_date' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_outreach_agent',
    description: 'Email drafting + outreach. Use for: drafting emails, Gmail drafts, follow-ups, recipient style analysis, campaign emails.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['draft_email', 'recipient_style', 'generate_followup', 'get_followup_queue'], description: 'Which outreach operation' },
      params: { type: 'object', description: 'Operation params. draft_email: to, subject, body, cc. recipient_style: email, name.' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_document_agent',
    description: 'File generation + exports + TEMPLATE DOCUMENTS. Use for: creating Word docs, spreadsheets, presentations, CSVs, images (DALL-E), QR codes, reading URLs, exporting pipeline or contacts. TEMPLATES: generate_from_template (create a pitch deck, proposal, NDA, meeting brief, or campaign report from CRM data). list_templates (show available document templates).',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['generate_docx', 'generate_xlsx', 'generate_pptx', 'generate_csv', 'generate_image', 'generate_qr', 'read_url', 'export_pipeline', 'export_contacts', 'generate_from_template', 'list_templates'], description: 'Which document operation. generate_from_template: create a document from a template using CRM data. list_templates: show available templates.' },
      params: { type: 'object', description: 'Operation params. generate_docx: filename, content. generate_from_template: template_name (pitch_deck, proposal, nda, brief, report), entity_type (deal, contact, company), entity_id, additional_fields. list_templates: no params needed.' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_memory_engine',
    description: 'Cross-session intelligence. Use for: recalling everything about a company/person (before drafting or meetings), getting draft context (before writing emails), relationship summaries, auto-extracting facts from conversation.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['recall', 'draft_context', 'relationship_summary', 'extract_and_store'], description: 'recall: full context for entity. draft_context: pre-draft intelligence. relationship_summary: concise relationship status. extract_and_store: auto-extract facts from messages.' },
      params: { type: 'object', description: 'entity_name or query (string). For extract_and_store: messages (array), entityContext (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_strategy_agent',
    description: 'Strategic decisions. Use when user asks: should we pursue X, where is leverage, kill or continue, prioritise deals, capital allocation, what matters most, evaluate this opportunity.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['evaluate', 'prioritise'], description: 'evaluate: strategic verdict on a question. prioritise: rank items by revenue × urgency.' },
      params: { type: 'object', description: 'evaluate: question (string), context (string). prioritise: items (array), criteria (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_negotiation_agent',
    description: 'Active negotiation support. Use when user discusses: counter-offers, pricing pushback, concession strategy, deal pressure, walk-away analysis, "they came back at X".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['analyse', 'counter'], description: 'analyse: full negotiation position analysis. counter: build counter-offer to their proposal.' },
      params: { type: 'object', description: 'analyse: situation (string), context (string). counter: their_offer (string), our_position (string), context (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'deep_research',
    description: 'Deep multi-source research (ONE call per conversation — do not call twice). on a company, person, market, or topic. Use when user asks to research, investigate, due diligence, prospect intel, competitive analysis. Produces structured intelligence brief saved to knowledge base.',
    input_schema: { type: 'object', properties: {
      brief: { type: 'string', description: 'Research brief. Be specific: company name, person, topic, questions.' },
    }, required: ['brief'] },
  },
  {
    name: 'ask_category_agent',
    description: 'Sponsorship category availability and conflicts. Use when user asks: is X category open, what gaps does Y team have, can we sell Z category, check for conflicts.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['check', 'conflict'], description: 'check: category availability (team, category, or both). conflict: check if company already sponsors elsewhere.' },
      params: { type: 'object', description: 'check: team (string), category (string). conflict: company (string), team (string), category (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_finance_agent',
    description: 'Financial analysis. Use for: pipeline forecast (weighted value), revenue projections, cash flow questions, runway, "what is our pipeline worth", financial analysis.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['forecast', 'analyse'], description: 'forecast: weighted pipeline value. analyse: answer financial question.' },
      params: { type: 'object', description: 'analyse: question (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_ea_agent',
    description: 'Executive assistant. Use for: "brief me", morning brief, task prioritisation, task consolidation, "what should I focus on", daily summary.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['brief', 'prioritise', 'consolidate'], description: 'brief: morning briefing. prioritise: rank tasks. consolidate: find duplicate tasks.' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_legal_agent',
    description: 'Legal risk flagging. Use for: contract review, clause analysis, risk summaries, obligation tracking. NOT legal advice.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['review', 'analyse'], description: 'review: flag contract risks. analyse: answer legal question.' },
      params: { type: 'object', description: 'review: text (string), context (string). analyse: question (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_dispute_agent',
    description: 'Active dispute management. Use for: dispute analysis, drafting procedural responses, leverage tracking, tone discipline. Tenancy, CDDA, commercial disputes.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['analyse', 'draft'], description: 'analyse: full dispute position. draft: procedural response.' },
      params: { type: 'object', description: 'situation (string), context (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_content_agent',
    description: 'Authority content generation. Use for: LinkedIn posts (SponsorSignal format), case studies, newsletters, thought leadership.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['linkedin', 'case_study', 'newsletter', 'custom'], description: 'Content type to generate.' },
      params: { type: 'object', description: 'topic (string), context (string). custom also takes: type (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_investment_agent',
    description: 'Capital strategy. Use for: valuation, investor narrative, raise strategy, dilution modelling, due diligence prep.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['analyse'], description: 'analyse: answer investment/capital question.' },
      params: { type: 'object', description: 'question (string), context (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_pricing_agent',
    description: 'Pricing & ROI. Use for: sponsorship pricing benchmarks, ROI modelling, "how much should we charge", "build an ROI case for X".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['roi', 'benchmark'], description: 'roi: build ROI case for company. benchmark: pricing benchmarks.' },
      params: { type: 'object', description: 'company (string), tier (string), context (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_signal_agent',
    description: 'Signal detection. Use for: recent sponsorship signals, deal triggers, funding events, hiring spikes, "what signals this week".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['recent'], description: 'recent: high-relevance signals from news feed.' },
      params: { type: 'object', description: 'days (number, default 7), type (string, optional category filter).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_travel_agent',
    description: 'Travel planning. Use for: F1/FE race travel, flight planning, visa awareness, "plan travel to Melbourne GP".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['plan'], description: 'plan: plan trip to destination.' },
      params: { type: 'object', description: 'destination (string), context (string).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_specialist_agent',
    description: 'Specialist domains: website/digital presence, product development, IP/licensing. Use for niche questions in these areas.',
    input_schema: { type: 'object', properties: {
      domain: { type: 'string', enum: ['website', 'product_dev', 'ip'], description: 'Which specialist domain.' },
      params: { type: 'object', description: 'question (string), context (string).' },
    }, required: ['domain'] },
  },
  {
    name: 'navigate_page',
    description: 'Direct page navigation. Use as fallback if ask_navigator is unavailable.',
    input_schema: { type: 'object', properties: {
      page: { type: 'string', enum: ['home', 'pipeline', 'contacts', 'organisations', 'command-centre', 'calendar', 'sporting-events', 'settings', 'partnership-matrix', 'campaigns', 'messages', 'documents', 'knowledge'], description: 'Page ID. calendar = personal Google Calendar. sporting-events = F1/FE race calendar.' },
      reason: { type: 'string', description: 'Brief reason' },
    }, required: ['page'] },
  },
  {
    name: 'log_activity',
    description: 'Log a business activity — call, meeting, note, task.',
    input_schema: { type: 'object', properties: {
      type: { type: 'string', description: 'Activity type: call, meeting, note, task, email_sent' },
      entity_name: { type: 'string', description: 'Person or company name' },
      description: { type: 'string', description: 'What happened' },
      deal_id: { type: 'string', description: 'Associated deal ID (optional)' },
    }, required: ['type', 'entity_name', 'description'] },
  },
  // ask_lemlist_live REMOVED — Lemlist is cancelled, all campaigns run through native engine
  {
    name: 'ask_self_monitor',
    description: 'Kiko self-monitoring. Check system health, recent errors, cron job status, agent performance. Use when user asks: "are you working", "what errors happened", "is inbox triage running", "what broke", "system health", "diagnose yourself".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['health_check', 'recent_errors', 'cron_status', 'agent_stats', 'run_selfcheck'], description: 'health_check: overall system health. recent_errors: last 24h errors. cron_status: check if crons ran today. agent_stats: agent usage and error rates. run_selfcheck: comprehensive 25-check system audit.' },
      params: { type: 'object', description: 'hours (number, default 24 for recent_errors), component (string, filter errors by component).' },
    }, required: ['operation'] },
  },
  {
    name: 'search_conversations',
    description: 'Search past conversations for context. Use when: "you mentioned this before", "what did we discuss about X", "recall our conversation about Y", "we talked about this last week", any reference to prior discussions, or when you need historical context about a decision or entity.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search term — entity name, topic, keyword. Keep it focused.' },
      limit: { type: 'number', description: 'Max results (default 5).' },
    }, required: ['query'] },
  },
  {
    name: 'trigger_triage',
    description: 'Trigger an on-demand inbox triage. Use when: the brief shows stale triage data, user asks "check my emails" and triage is outdated, or Kiko detects the last triage is >24h old. Returns fresh email classification.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_code_review',
    description: 'Kiko self-analysis. Review own source code, analyse architecture, check performance analytics, generate improvement recommendations. Use when: "review your code", "analyse your architecture", "how can you improve", "what are your weaknesses", "performance report", "check your own code", "suggest improvements", "read your source".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['architecture', 'review', 'performance', 'suggest', 'read'], description: 'architecture: analyse full codebase structure. review: review a specific file for bugs/improvements. performance: agent usage + error rates + cron stats. suggest: AI-generated top 5 improvements. read: read a specific source file.' },
      params: { type: 'object', description: 'For review/read: { filename: "kiko.js" or "agents/deal.js" }' },
    }, required: ['operation'] },
  },
  {
    name: 'read_email',
    description: 'Read, search, and manage Gmail across team accounts. Use when: "check my email", "any emails from X", "correspondence with X", "emails between us and X", "search emails for X". Super admin can search all team members\' emails. Regular users can only search their own.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['search', 'unread', 'read_thread', 'inbox_summary'], description: 'search: search emails by query across permitted accounts. unread: get unread count. read_thread: read full email thread by threadId. inbox_summary: overview of recent inbox.' },
      query: { type: 'string', description: 'For search: Gmail search query (e.g. "from:matthew proofpoint", "to:chad startree"). For read_thread: threadId from a previous search result.' },
    }, required: ['operation'] },
  },
  {
    name: 'read_calendar',
    description: 'Read and manage Google Calendar. Use when: "what\'s on my calendar", "any meetings today", "what\'s my schedule", "am I free on Tuesday", "upcoming meetings", "calendar this week", "schedule a meeting", "book time with", "create a calendar event".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['today', 'upcoming', 'search', 'free_slots', 'create_event'], description: 'today: today\'s events. upcoming: next 7 days. search: search by query. free_slots: find available time. create_event: create a new calendar event.' },
      query: { type: 'string', description: 'For search: keywords. For free_slots: date range like "next Tuesday". For create_event: JSON with {title, start, end?, description?, location?, attendees?[emails]}.' },
    }, required: ['operation'] },
  },
  {
    name: 'manage_knowledge',
    description: 'Manage Kiko\'s knowledge base AND create new agents. Use to: add a learning source, search knowledge, list sources, trigger learning, save insights, create a new specialist agent, or list custom agents. Use when: user says "learn about X", "add this source", "what do you know about X", "create an agent for Y", "show me your agents".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['add_source', 'search_knowledge', 'list_sources', 'learn_topic', 'save_insight', 'create_agent', 'list_agents', 'run_agent', 'set_mode', 'get_mode'], description: 'add_source: add URL/document. search_knowledge: search knowledge. list_sources: show sources. learn_topic: queue learning. save_insight: save a fact. create_agent: create dynamic agent. list_agents: show custom agents. run_agent: execute dynamic agent. set_mode: set operational mode (fundraising, race_week, outreach_sprint, deal_closing, product_launch). get_mode: show current mode.' },
      params: { type: 'object', description: 'For add_source: { name, url, category, content }. For search_knowledge: { query }. For list_sources: { category }. For learn_topic: { topic, category }. For save_insight: { insight, entity, category }. For create_agent: { name, display_name, description, system_prompt, data_queries, trigger_keywords, category }. For run_agent: { agent_name, question }.' },
    }, required: ['operation'] },
  },
  {
    name: 'linkedin_search_prospects',
    description: 'Search LinkedIn for prospects matching a query (keywords, company, title). Returns a list of profile snippets with name, headline, company, and profile URL. Use this to find new prospects to add to a campaign or to verify a prospect exists on LinkedIn before sending an invite.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query (e.g. "VP Marketing whiskey brand", "CISO fintech London")' },
      limit: { type: 'number', description: 'Max results to return (default 10, max 25)' },
    }, required: ['query'] },
  },
  {
    name: 'find_linkedin_url',
    description: 'Find a person\'s LinkedIn profile URL by searching LinkedIn with their name and company. Use this when sourcing prospects, enriching contacts, or when asked to find someone\'s LinkedIn. Returns the LinkedIn profile URL or null if not found. Can process single or multiple prospects.',
    input_schema: { type: 'object', properties: {
      prospects: { type: 'array', description: 'Array of prospects to find. Each item: { name: "Full Name", company: "Company Name" }', items: { type: 'object', properties: { name: { type: 'string' }, company: { type: 'string' } }, required: ['name', 'company'] } },
    }, required: ['prospects'] },
  },
  {
    name: 'find_email',
    description: 'Find business email addresses for prospects using company domain pattern matching and DNS verification. Use this EVERY TIME you source prospects — email AND LinkedIn URL are BOTH mandatory. Accepts array of {name, company}. Returns verified email addresses based on company domain patterns. Zero API cost.',
    input_schema: { type: 'object', properties: {
      prospects: { type: 'array', description: 'Array of prospects to find emails for. Each item: { name: "Full Name", company: "Company Name" }', items: { type: 'object', properties: { name: { type: 'string' }, company: { type: 'string' } }, required: ['name', 'company'] } },
    }, required: ['prospects'] },
  },
  {
    name: 'linkedin_send_invite',
    description: 'Send a LinkedIn connection invitation to a prospect. Requires their LinkedIn profile URL and an optional personalised note (max 200 characters). Use when the user explicitly asks to send a LinkedIn invite. Will fail if already connected or already invited.',
    input_schema: { type: 'object', properties: {
      profile_url: { type: 'string', description: 'LinkedIn profile URL (e.g. https://www.linkedin.com/in/username/)' },
      message: { type: 'string', description: 'Personal note (max 200 chars). Leave empty for a no-note invite.' },
    }, required: ['profile_url'] },
  },
  {
    name: 'linkedin_send_message',
    description: 'Send a direct LinkedIn message to a 1st-degree connection. Requires either a LinkedIn profile URL or an existing conversation URN. Will fail if the recipient is not a 1st-degree connection — use linkedin_send_invite first.',
    input_schema: { type: 'object', properties: {
      profile_url_or_conversation_urn: { type: 'string', description: 'LinkedIn profile URL or existing conversation URN' },
      message: { type: 'string', description: 'Message text (keep under 1000 chars for readability)' },
    }, required: ['profile_url_or_conversation_urn', 'message'] },
  },
  {
    name: 'get_platform_users',
    description: 'Get information about platform users, their roles, connected accounts, and team setup. Super admin sees full details (role, email, connected services, job title). Regular users see team member names and roles only. Use this when: user asks about team members, who is on the platform, campaign setup readiness, account connections, or who has access to what.',
    input_schema: { type: 'object', properties: {
      include_connections: { type: 'boolean', description: 'Include connected services (Gmail, LinkedIn, Calendar) for each user. Default true.' },
    } },
  },
  {
    name: 'query_user_activity',
    description: 'SUPER-ADMIN ONLY oversight tool. Lets a super-admin see another user\'s activity: what they have added to their memory, and the state of their task list split into actioned vs open. Use when Sunny asks "what has Matt added to memory", "did Matt upload the E1 costs", "where is Matt on his tasks", "what has Matt actioned and what is still open". Refuses for any non-super-admin caller. One-directional by design: it never exposes Sunny\'s own data to anyone.',
    input_schema: { type: 'object', properties: {
      target_user: { type: 'string', description: 'The user to inspect, by name or email (e.g. "Matt" or "matt.smith@vanhawke.agency").' },
      kind: { type: 'string', enum: ['memory', 'tasks', 'both'], description: 'What to retrieve. "memory" = what they added to memory; "tasks" = their task list split into actioned vs open; "both" = both. Default both.' },
    }, required: ['target_user'] },
  },
  {
    name: 'update_kiko_preference',
    description: 'Update Kiko behaviour preferences based on user feedback. Use when user says things like "be more direct", "less formal", "always include pricing", "shorter responses", "more detail on financials", "stop asking clarifying questions". Saves the preference so it applies in ALL future conversations. Also use for process adjustments like "always check CRM before emailing" or "prioritise cyber deals".',
    input_schema: { type: 'object', properties: {
      category: { type: 'string', enum: ['communication_style', 'process', 'priority', 'language', 'formatting', 'behaviour'], description: 'Type of preference being set' },
      preference: { type: 'string', description: 'The specific preference to save, stated as a clear rule (e.g. "Use direct, concise language with no filler")' },
      confidence: { type: 'string', enum: ['high', 'medium'], description: 'How strongly to weight this preference. High = always apply. Medium = apply when relevant.' },
    }, required: ['category', 'preference'] },
  },
  {
    name: 'google_maps_link',
    description: 'Generate a Google Maps link for a place, directions, or search. On mobile, these links launch Google Maps directly. Use this whenever discussing venues, restaurants, hotels, addresses, or giving directions. Return the link in markdown format so the user can tap/click it.',
    input_schema: { type: 'object', properties: {
      place: { type: 'string', description: 'The place name or address (e.g. "Komodo Miami", "Faena Hotel Miami Beach", "1100 Biscayne Blvd Miami")' },
      mode: { type: 'string', enum: ['search', 'directions'], description: 'search = find the place. directions = get directions to the place from the user\'s current location.' },
      travel_mode: { type: 'string', enum: ['driving', 'walking', 'transit', 'bicycling'], description: 'Only for directions mode. Default: driving.' },
    }, required: ['place'] },
  },
  {
    name: 'create_email_draft',
    description: 'Create an email draft in a team member\'s Gmail. Use this when the user asks you to draft an email, compose a message, or prepare outreach. After drafting, the user can refine the content with you, then you push the final version to their Gmail drafts (or another team member like Matt). Always confirm the final draft with the user before creating it. Default: send to the current user\'s Gmail. Option: send to matt.smith@vanhawke.agency for Matt to review and send.',
    input_schema: { type: 'object', properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body in HTML format. Use <br> for line breaks, <b> for bold, <i> for italic. Include the full email with greeting and sign-off.' },
      draft_for: { type: 'string', description: 'Email of the team member whose Gmail drafts folder should receive this draft. Default: sunny@vanhawke.agency (current user). Use matt.smith@vanhawke.agency to send to Matt\'s drafts.' },
      original_draft: { type: 'string', description: 'IMPORTANT: If the user made corrections to your original draft, include your FIRST version here so Kiko can learn from the edits. Leave empty if the user accepted the first draft without changes.' },
    }, required: ['to', 'subject', 'body'] },
  },
  {
    name: 'batch_draft_emails',
    description: 'Draft re-engagement emails for multiple stalled deals in one go. Use when: "draft emails for all stalled deals", "re-engage the pipeline", "batch outreach for idle deals". Queries stalled deals, generates personalised drafts for each, and creates Gmail drafts. Reports progress as it works.',
    input_schema: { type: 'object', properties: {
      min_days_stale: { type: 'number', description: 'Minimum days since last activity to include. Default: 14' },
      max_deals: { type: 'number', description: 'Maximum number of deals to draft for. Default: 10' },
      sender: { type: 'string', description: 'Email of the sender (determines From + signature). Default: matt.smith@vanhawke.agency' },
      draft_for: { type: 'string', description: 'Whose Gmail receives the drafts. Default: same as sender' },
      tone: { type: 'string', description: 'Tone directive: "direct", "warm", "formal", "casual". Default: "direct"' },
    } },
  },
  // ── Follow-up Tracking ──
  {
    name: 'check_follow_ups',
    description: 'Check pending follow-ups, overdue items, and reply status. Use when user asks about follow-ups, pending replies, or outreach status.',
    input_schema: { type: 'object', properties: {
      status: { type: 'string', description: 'Filter: "awaiting_reply" (default), "replied", "overdue", "all"', enum: ['awaiting_reply', 'replied', 'overdue', 'all'] },
    } },
  },
  // ── Scheduled Emails ──
  {
    name: 'check_scheduled_emails',
    description: 'Check scheduled emails waiting to be sent. Use when user asks about scheduled sends, pending emails, or email queue.',
    input_schema: { type: 'object', properties: {
      status: { type: 'string', description: 'Filter: "scheduled" (default), "sent", "failed", "all"', enum: ['scheduled', 'sent', 'failed', 'all'] },
    } },
  },
  // ── Relationship Intelligence ──
  {
    name: 'query_relationships',
    description: 'Query relationship data between contacts — who knows who, interaction history, relationship strength. Use when user asks about relationships, connections, or "who do we know at X".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Company name, contact email, or person name to search relationships for' },
    }, required: ['query'] },
  },
  // ── Thought Journal ──
  {
    name: 'query_thought_journal',
    description: 'Search your strategic thought journal — insights and reflections from past tool executions. Use when user asks "what have you learned", "what do you think about X", or for strategic reflection.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Topic or keyword to search journal entries for' },
    }, required: ['query'] },
  },
  // ── Conversation History Search ──
  {
    name: 'query_conversation_insights',
    description: 'Search past conversation insights — decisions made, open threads, key facts from previous chats. Use when user asks "what did we discuss about X", "what was decided", or references past conversations.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Topic, company, or keyword to search conversation history for' },
    }, required: ['query'] },
  },
  // ── Document Generation ──
  {
    name: 'generate_document',
    description: 'Generate a professional branded document (PDF/PPTX). Researches the topic via web search, structures content, and renders with Van Hawke branding. Use when user asks for a report, proposal, one-pager, pitch deck, partnership overview, or any formal document.',
    input_schema: { type: 'object', properties: {
      topic: { type: 'string', description: 'The topic or brief for the document. Be specific — include company names, deal context, objectives.' },
      documentType: { type: 'string', enum: ['pdf', 'pptx'], description: 'pdf = branded report/proposal (HTML, printable). pptx = slide deck.' },
      division: { type: 'string', enum: ['agency', 'maison', 'group'], description: 'Which Van Hawke entity this is for. Determines branding.' },
      purpose: { type: 'string', description: 'Document purpose: report, proposal, one-pager, pitch-deck, partnership-overview, market-analysis, competitive-brief' },
    }, required: ['topic'] },
  },
  // ── Campaign Builder (full end-to-end) ──
  {
    name: 'build_campaign',
    description: 'Discover prospects AND build a COMPLETE campaign end-to-end, returning a VERIFIED ready-to-launch shortlist. Sources companies (CRM + web), excludes anyone already in the pipeline, ranks by fit, then for the top 8 confirms the decision-maker is still in seat and resolves a real email with a confidence label. Use whenever the user wants to FIND or TARGET prospects, e.g. "find me cybersecurity companies over $1B that sponsor sports", "target legal-AI", "build a fintech campaign". Extract any precision criteria from the user sentence into `overrides`. PREFERRED tool — do NOT redirect users to the UI. AUTHORITATIVE OUTPUT: the shortlist this returns is the real result of live CRM + web sourcing and email verification. Present those exact companies and decision-makers to the user. NEVER replace, pad, or substitute the list with companies from your own training knowledge; relaying the verified output IS the task, not generating your own prospect list.',
    input_schema: { type: 'object', properties: {
      category: { type: 'string', description: 'Closest sector. One of: banking, fintech, cybersecurity, cloud, ai_data, software, semiconductors, telecom, gaming, crypto, energy, automotive, hospitality, fashion, watches, food_bev, health, logistics, legal, robotics, whiskey. Pick the nearest if the user names a narrower vertical.' },
      team: { type: 'string', description: 'F1 team name. Default: auto-selects based on category availability. E.g. "alpine", "haas".' },
      overrides: { type: 'object', description: 'OPTIONAL precision criteria parsed from the user request. Fields: revenue_min (e.g. "$1B"), funding_min (e.g. "$100M"), geography (e.g. "US and Europe"), dm_seniority (e.g. "CMO / Head of Brand"), signals (array, e.g. ["current sports sponsorship"]). Only include fields the user actually specified.' },
    }, required: ['category'] },
  },
  {
    name: 'get_cognitive_analysis',
    description: 'Retrieve the cognitive reasoning chain analysis for a specific entity (person or company). Returns the 5-step analysis: classification, context, knowledge matching, psychology diagnosis, and recommended actions. ALWAYS check this BEFORE generating your own analysis for a prospect or contact — the cognitive engine has already done the deep work. This ensures consistency across all interactions.',
    input_schema: { type: 'object', properties: {
      entity_name: { type: 'string', description: 'Name of the person or company to look up. E.g. "Matthew Liberty", "Proofpoint", "Jasmyn Collings".' },
    }, required: ['entity_name'] },
  },
  {
    name: 'read_bible',
    description: 'Load Kiko operational doctrine, org rules, or full research knowledge base on demand. Use when you need: operational rules, outreach doctrine, campaign sequencing rules, platform architecture details, team info, email formatting rules, F1 partnership values, hard rules. Also use when your answer would benefit from the full knowledge base across all research domains. Call this BEFORE responding if the query involves doctrine, rules, or operational procedures.',
    input_schema: { type: 'object', properties: {
      section: { type: 'string', enum: ['core', 'org', 'knowledge', 'all'], description: 'core: Kiko Bible (operational rules, architecture, team, hard rules). org: Organisation doctrine. knowledge: full research knowledge base (all domains). all: everything.' },
    }, required: ['section'] },
  },
  {
    name: 'run_code',
    description: 'Execute Python or JavaScript code and return the output. Use for calculations, data processing, analysis, generating HTML charts/dashboards, or any computational task. EXECUTION ENVIRONMENT: code runs from /home/kiko/kiko-worker with the full node_modules available. JavaScript executes as CommonJS (.cjs) — use require(), NOT import. Relative paths resolve from the worker root. When creating visuals, generate data then output HTML in a html code block so it renders as an interactive artifact.',
    input_schema: { type: 'object', properties: {
      language: { type: 'string', enum: ['python', 'javascript'], description: 'Language to execute' },
      code: { type: 'string', description: 'Code to execute. Full script. stdout is returned.' },
    }, required: ['language', 'code'] },
  },
  {
    name: 'kiko_self_modify',
    description: 'Read, edit, and deploy your own source code. Use when you detect a problem via selfcheck or conversation and can fix it. Operations: read_file (view source), edit_file (surgical find/replace), list_files (browse codebase), run_command (build, test, git), deploy (API: pm2 restart), full_deploy (frontend: npm run build + copy to /var/www/kiko/ + pm2 restart). SERVER FILESYSTEM TRUTH: your code root is /home/kiko/kiko-worker containing api/, routes/, monitors/, lib/, src/cron-scheduler.js. The frontend SOURCE (src/pages/, src/components/) is NOT on this server — it lives only on Sunny\'s Mac; the built bundle sits at /var/www/kiko. Never ls, read, or edit frontend source paths here — they do not exist. ALWAYS: 1) read the file first, 2) make surgical edits, 3) build to verify, 4) deploy, 5) run selfcheck after. NEVER edit blindly.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['read_file', 'edit_file', 'list_files', 'run_command', 'deploy', 'full_deploy'], description: 'read_file: view source. edit_file: find/replace. list_files: browse. run_command: shell command. deploy: full build+deploy+restart cycle.' },
      file_path: { type: 'string', description: 'Relative path from /home/kiko/kiko-worker, e.g. "api/kiko.js" or "routes/kiko-chat.js". Frontend source paths (src/pages/, src/components/) do NOT exist on this server.' },
      old_text: { type: 'string', description: 'For edit_file: exact text to find (must be unique in file)' },
      new_text: { type: 'string', description: 'For edit_file: replacement text' },
      command: { type: 'string', description: 'For run_command: shell command to execute. Allowed: git status, git diff, git log, npm run build, pm2 logs, cat, grep, ls, wc, head, tail' },
      reason: { type: 'string', description: 'Why you are making this change — logged for audit trail' },
    }, required: ['operation'] },
  },
  {
    name: 'reengagement_brief',
    description: 'Generate or fetch a re-engagement brief for a dormant or archived deal: a holistic read of the counterpart, the company now, and a recommendation weighted to the actual re-engagement message. Use when the user asks whether to reopen or re-engage an archived deal, "should we go back to X", or wants a re-engagement angle. Takes the company name of an archived deal.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string', description: 'Company name of the archived deal, e.g. "Thomson Reuters".' },
      refresh: { type: 'boolean', description: 'Force regeneration (Opus + web search, ~45s) instead of the cached brief. Default false.' },
    }, required: ['company'] },
  },
  {
    name: 'assign_tasks',
    description: 'Push one or more concrete tasks to a teammate\'s task list, which appears on their Today page. Use when Sunny says "push to <name>\'s task list", "assign these to <name>", "add to <name>\'s tasks", or hands you a weekly task list meant for someone. Resolve the person by name or email (e.g. "Matt" or "matt.smith@vanhawke.com"). Each task is one action. Only Sunny (super_admin) can assign to other people; a non-admin can only add to their own list.',
    input_schema: { type: 'object', properties: {
      assignee: { type: 'string', description: 'Who the tasks are for — a name or email, e.g. "Matt".' },
      tasks: { type: 'array', description: 'The tasks to push.', items: { type: 'object', properties: {
        notes: { type: 'string', description: 'The task itself — the action to take. Required.' },
        company: { type: 'string', description: 'Related company, if any.' },
        contact: { type: 'string', description: 'Related contact, if any.' },
        type: { type: 'string', enum: ['Email Follow-up', 'Call', 'Research', 'Outreach', 'Other'], description: 'Task type. Default Other.' },
        dueDate: { type: 'string', description: 'Optional due date in YYYY-MM-DD.' },
      }, required: ['notes'] } },
    }, required: ['assignee', 'tasks'] },
  },
  {
    name: 'complete_task',
    description: 'Mark a task on someone\'s list as done. Use when Sunny says a task is finished, "mark the <company> task done", "complete that task", or when you have just sent the work a task asked for. Completing removes it from the Today list and writes the completion through to the contact\'s activity history, the company record, and any matching follow-up. Identify the task by the company it relates to, plus a keyword if several could match.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string', description: 'The company the task relates to, e.g. "Helsing".' },
      match: { type: 'string', description: 'Optional keyword from the task notes to disambiguate if several match.' },
      assignee: { type: 'string', description: 'Optional, whose list to look on (name or email). Defaults to the current user.' },
    }, required: ['company'] },
  },
  {
    name: 'dismiss_task',
    description: 'Remove a task from someone\'s list without completing the underlying work. Use when Sunny says "remove that from my task list", "drop the <company> task", or a task is no longer relevant. Soft-deletes it with an optional reason (kept for the record) and takes it off the Today list. Identify it by company, plus a keyword if several match.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string', description: 'The company the task relates to, e.g. "Helsing".' },
      match: { type: 'string', description: 'Optional keyword to disambiguate.' },
      reason: { type: 'string', description: 'Optional short reason for dismissing.' },
      assignee: { type: 'string', description: 'Optional, whose list. Defaults to the current user.' },
    }, required: ['company'] },
  },
];

// Conditional tool — only injected when intent is master_brief
export const DIGEST_BRIEF_TOOL = {
  name: 'digest_master_brief',
  description: 'Digest a master brief or operating instructions. Extracts rules, preferences, priorities, and rewrites the user personal bible. Use when user says "digest this as my brief" or "learn from this".',
  input_schema: { type: 'object', properties: {
    document_text: { type: 'string', description: 'Full text of the brief to digest.' },
    mode: { type: 'string', enum: ['replace', 'merge'], description: 'replace = overwrite bible. merge (default) = add/update sections.' },
  }, required: ['document_text'] },
};

// ── Tool Executor — Routes to agents ──
function agentError(agentName, err) {
  console.error(`[KIKO] ${agentName} FAILED:`, err.message);
  logError(`agent:${agentName.toLowerCase()}`, err.message, '', 'error');
  return `AGENT UNAVAILABLE: ${agentName} failed — ${err.message}. Tell Sunny this agent hit an error. Do NOT attempt to handle the task yourself.`;
}

export async function executeTool(name, input, userEmail = 'sunny@vanhawke.agency', pageContext = null, userId = null) {

  // ── Auto-Activity Logger — fires after agent calls that touch CRM entities ──
  const autoLogActivity = async (type, entityName, description) => {
    try {
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({
        type, entity_name: entityName, subject: (description || '').slice(0, 500),
        status: 'completed', completed_at: new Date().toISOString(),
        metadata: { logged_by: 'kiko', tool: name, auto: true }
      })});
    } catch {} // Never fail on logging
  };

  // ── Assign Tasks — push structured tasks to a teammate's list (their Today page) ──
  if (name === 'assign_tasks') {
    const who = (input.assignee || '').trim();
    const items = Array.isArray(input.tasks) ? input.tasks.filter(t => t && String(t.notes || '').trim()) : [];
    if (!who) return 'Who are these tasks for? Give me a name, e.g. "Matt".';
    if (!items.length) return 'No tasks with a description to assign — give me at least one task.';
    let caller = null;
    try { const c = await sbFetch(`users?email=eq.${encodeURIComponent(userEmail)}&select=id,role,org_id,full_name&limit=1`); caller = (c && c[0]) || null; } catch {}
    const term = who.replace(/[%,()]/g, ' ').trim();
    let matches = [];
    try { matches = (await sbFetch(`users?select=id,full_name,email,org_id,role&or=(email.ilike.*${encodeURIComponent(term)}*,full_name.ilike.*${encodeURIComponent(term)}*)&limit=6`)) || []; } catch {}
    if (!matches.length) {
      let all = [];
      try { all = (await sbFetch('users?select=full_name,email&limit=20')) || []; } catch {}
      return `I could not find anyone matching "${who}". People I can assign to: ${all.map(u => u.full_name || u.email).join(', ') || '(none found)'}.`;
    }
    if (matches.length > 1) {
      return `"${who}" matches more than one person: ${matches.map(u => `${u.full_name} (${u.email})`).join(', ')}. Which one?`;
    }
    const target = matches[0];
    if (caller && caller.role !== 'super_admin' && caller.id !== target.id) {
      return `Only an admin can assign tasks to other people. I can add these to your own list instead.`;
    }
    const orgId = target.org_id || (caller && caller.org_id);
    const now = Date.now();
    let rows = items.map((t, i) => ({
      id: 't' + (now + i),
      org_id: orgId,
      user_id: target.id,
      data: {
        type: t.type || 'Other',
        notes: String(t.notes).trim(),
        company: t.company || '',
        contact: t.contact || '',
        dueDate: t.dueDate || '',
        completed: false,
        createdAt: new Date().toISOString(),
        assignedTo: target.full_name || target.email,
        assignedBy: (caller && caller.full_name) || 'Kiko',
      },
    }));
    // ── Parked-intelligence guard: cold outreach is parked as intelligence, never pushed as a task ──
    // A task is earned by a reply received, not a send. Outreach-type rows aimed at a company with no
    // reply on record are parked as dormant intelligence instead of nagging on a Today list.
    const GATED_TYPES = ['Outreach', 'First Outreach', 'Email Follow-up', 'Call', 'LinkedIn'];
    const parkedItems = [];
    {
      const kept = [];
      for (const r of rows) {
        const comp = (r.data.company || '').trim();
        if (GATED_TYPES.includes(r.data.type) && comp && !(await companyHasReply(comp))) {
          await parkIntelligence({
            name: r.data.contact || '', company: comp, source: 'assign_tasks_guard', org_id: r.org_id,
            rationale: `Auto-parked from assign_tasks: ${r.data.type} requested for ${comp}, but no reply on record from this company (cold). Note: ${r.data.notes}`.slice(0, 900),
          });
          parkedItems.push(r.data.contact ? `${r.data.contact} (${comp})` : comp);
        } else { kept.push(r); }
      }
      rows = kept;
    }
    try {
      if (rows.length) await sbFetch('tasks', { method: 'POST', body: JSON.stringify(rows) });
    } catch (e) {
      return agentError('assign_tasks', e);
    }
    // ── Delegation handoff: assigning to someone else transfers the account and clears the delegator's own copies ──
    let handoffNote = '';
    if (caller && target.id !== caller.id) {
      const companies = [...new Set(rows.map(r => (r.data.company || '').trim()).filter(Boolean))];
      let removedTotal = 0;
      for (const comp of companies) {
        const key = comp.toLowerCase();
        const strat = (rows.find(r => (r.data.company || '').trim().toLowerCase() === key)?.data.notes || '').slice(0, 300);
        // 1. Record the account's new owner + current strategy (ruled-out plays preserved on merge)
        try {
          await sbFetch('kiko_account_state?on_conflict=org_id,account_key', {
            method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              account_key: key, org_id: orgId,
              current_owner: target.id, owner_name: target.full_name || target.email,
              current_strategy: strat, delegated_from: caller.id,
              status: 'active', updated_at: new Date().toISOString(),
            }),
          });
        } catch {}
        // 2. Dismiss the delegator's own OPEN tasks for this account (handoff, not duplication)
        try {
          const mine = await sbFetch(`tasks?org_id=eq.${orgId}&user_id=eq.${caller.id}&data->>company=ilike.${encodeURIComponent(comp)}&or=(data->>completed.is.null,data->>completed.eq.false)&select=id,data`).catch(() => []);
          for (const mt of (mine || [])) {
            const nd = { ...mt.data, completed: true, completedAt: new Date().toISOString(), dismissed: true, dismissReason: `Delegated to ${target.full_name || target.email}`, dismissedAt: new Date().toISOString() };
            await sbFetch(`tasks?id=eq.${encodeURIComponent(mt.id)}`, { method: 'PATCH', body: JSON.stringify({ data: nd, updated_at: new Date().toISOString() }) });
            removedTotal++;
          }
        } catch {}
      }
      if (removedTotal > 0) handoffNote = ` Cleared ${removedTotal} matching task${removedTotal > 1 ? 's' : ''} off your own list, this is ${target.full_name || target.email}'s to run now.`;
    }
    const parkedNote = parkedItems.length ? ` Parked ${parkedItems.length} cold ${parkedItems.length > 1 ? 'items' : 'item'} as intelligence (no reply on record): ${parkedItems.join(', ')}.` : '';
    if (!rows.length) {
      return `No tasks created.${parkedNote} A task is earned by a real prior touch, so these cold ones are parked for review rather than actioned.`;
    }
    try { await autoLogActivity('task', target.full_name || target.email, `Assigned ${rows.length} task(s) to ${target.full_name || target.email}`); } catch {}
    return `Done. Pushed ${rows.length} task${rows.length > 1 ? 's' : ''} to ${target.full_name || target.email}'s list.${handoffNote}${parkedNote} They will appear on their Today page.\n` + rows.map((r, i) => `${i + 1}. ${r.data.notes.slice(0, 90)}${r.data.company ? ` (${r.data.company})` : ''}`).join('\n');
  }

  // ── Complete / Dismiss task — flips completed; a DB trigger fans out to activity, company, follow-up ──
  if (name === 'complete_task' || name === 'dismiss_task') {
    const isDismiss = name === 'dismiss_task';
    const company = (input.company || '').trim();
    if (!company) return 'Which task? Tell me the company it relates to.';
    let target = null;
    if (input.assignee && input.assignee.trim()) {
      const term = input.assignee.replace(/[%,()]/g, ' ').trim();
      const m = await sbFetch(`users?select=id,full_name,email&or=(email.ilike.*${encodeURIComponent(term)}*,full_name.ilike.*${encodeURIComponent(term)}*)&limit=2`).catch(() => []);
      target = (m && m[0]) || null;
    }
    if (!target) {
      const c = await sbFetch(`users?email=eq.${encodeURIComponent(userEmail)}&select=id,full_name,email&limit=1`).catch(() => []);
      target = (c && c[0]) || null;
    }
    if (!target) return 'Could not resolve whose task list to update.';
    const all = await sbFetch(`tasks?user_id=eq.${target.id}&select=id,data&order=updated_at.desc&limit=200`).catch(() => []);
    const lc = company.toLowerCase();
    const kw = (input.match || '').toLowerCase().trim();
    const matches = (all || []).filter(t => {
      const d = t.data || {};
      if (d.completed) return false;
      const comp = (d.company || '').toLowerCase();
      if (!comp) return false;
      if (!comp.includes(lc) && !lc.includes(comp)) return false;
      if (kw && !(d.notes || '').toLowerCase().includes(kw)) return false;
      return true;
    });
    if (!matches.length) return `No open task found for "${company}"${kw ? ` matching "${input.match}"` : ''} on ${target.full_name || target.email}'s list.`;
    if (matches.length > 1) {
      return `${matches.length} open tasks match "${company}" on ${target.full_name || target.email}'s list:\n` + matches.map((t, i) => `${i + 1}. ${(t.data.notes || '').slice(0, 80)}`).join('\n') + `\nGive me a keyword to pick the right one.`;
    }
    const t = matches[0];
    const newData = { ...t.data, completed: true, completedAt: new Date().toISOString() };
    if (isDismiss) { newData.dismissed = true; newData.dismissReason = input.reason || ''; newData.dismissedAt = new Date().toISOString(); }
    try {
      await sbFetch(`tasks?id=eq.${encodeURIComponent(t.id)}`, { method: 'PATCH', body: JSON.stringify({ data: newData, updated_at: new Date().toISOString() }) });
    } catch (e) { return agentError(name, e); }
    const whose = (target.email && target.email.toLowerCase() === (userEmail || '').toLowerCase()) ? 'your' : `${target.full_name || target.email}'s`;
    return `${isDismiss ? 'Dismissed' : 'Completed'} the ${t.data.company || company} task${t.data.notes ? ` (${String(t.data.notes).slice(0, 60)})` : ''}. It is off ${whose} list${isDismiss ? '.' : ', and the completion is written through to the contact and company record.'}`;
  }

  // ── Re-engagement brief (Archive v2 — same engine as the dossier UI, same ring-fence) ──
  if (name === 'reengagement_brief') {
    const company = (input.company || '').trim();
    if (!company) return 'Tell me which company — I need the name of an archived deal.';
    const deals = await sbFetch('deals?select=id,data');
    const archived = (deals || []).filter(d => (d.data?.status || '') === 'archived');
    const lc = company.toLowerCase();
    const match = archived.find(d => (d.data?.company || '').toLowerCase() === lc)
              || archived.find(d => (d.data?.company || '').toLowerCase().includes(lc));
    if (!match) return `No archived deal found for "${company}". This brief is for dormant/archived relationships — check the name, or the deal may still be active.`;
    const { buildBrief, readBrief } = await import('./lib/archive-brief.js');
    let result = input.refresh
      ? await buildBrief({ dealId: match.id, viewerEmail: userEmail })
      : await readBrief({ dealId: match.id, viewerEmail: userEmail });
    if (!input.refresh && result && result.brief === null) {
      result = await buildBrief({ dealId: match.id, viewerEmail: userEmail });
    }
    if (result?.error) return `Could not build the brief (${result.error}).`;
    return result;
  }

  // ── Read Bible — JIT doctrine loading (Phase 5.1) ──
  if (name === 'read_bible') {
    try {
      const section = input.section || 'all';
      const parts = [];

      if (section === 'core' || section === 'all') {
        const rows = await sbFetch('kiko_core_bible?select=content&order=version.desc&limit=1');
        if (rows?.[0]?.content) parts.push(`═══ KIKO CORE BIBLE ═══\n${rows[0].content}`);
        else parts.push('[Core Bible not found in database]');
      }

      if (section === 'org' || section === 'all') {
        // Get user's org
        const orgMember = await sbFetch(`organization_members?user_id=eq.${userId}&select=organization_id&limit=1`).catch(() => []);
        const orgId = orgMember?.[0]?.organization_id;
        if (orgId) {
          const orgRows = await sbFetch(`org_bibles?organization_id=eq.${orgId}&select=content&limit=1`);
          if (orgRows?.[0]?.content) parts.push(`═══ ORGANISATION DOCTRINE ═══\n${orgRows[0].content}`);
        }
      }

      if (section === 'knowledge' || section === 'all') {
        const knowledge = await sbFetch('kiko_knowledge?select=domain,content,researched_at&order=researched_at.desc&limit=30');
        if (knowledge?.length) {
          // Deduplicate by domain (latest per domain)
          const byDomain = new Map();
          for (const k of knowledge) { if (k.content && !byDomain.has(k.domain)) byDomain.set(k.domain, k); }
          parts.push(`═══ RESEARCH KNOWLEDGE BASE (${byDomain.size} domains) ═══\n` +
            [...byDomain.values()].map(k =>
              `[${k.domain} — ${new Date(k.researched_at).toLocaleDateString('en-GB')}]\n${k.content.slice(0, 1500)}`
            ).join('\n\n'));
        }
      }

      const out = parts.join('\n\n') || 'No bible content found.';
      return out.length > 60000 ? out.slice(0, 60000) + '\n\n[TRUNCATED — request a specific section for more]' : out;
    } catch (e) { return agentError('read_bible', e); }
  }

  // ── Kiko Self-Modification — read, edit, deploy own code ──
  if (name === 'run_code') {
    const { language, code } = input;
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    // Session 71 fix: scripts MUST live inside the worker root with cwd anchored there.
    // /tmp scripts cannot resolve node_modules (Node resolves from the script's location,
    // not cwd) — this caused every run_code module-not-found failure in kiko_error_log.
    const WORKER_ROOT = '/home/kiko/kiko-worker';
    const tmpDir = path.join(WORKER_ROOT, '.tmp');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
    // .cjs so generated JS can use require() despite the package being ESM
    const ext = language === 'python' ? 'py' : 'cjs';
    const tmpFile = path.join(tmpDir, 'kiko_code_' + Date.now() + '.' + ext);
    try {
      fs.writeFileSync(tmpFile, code);
      const cmd = language === 'python' ? 'python3 ' + tmpFile : 'node ' + tmpFile;
      const output = execSync(cmd, { cwd: WORKER_ROOT, timeout: 30000, encoding: 'utf8', maxBuffer: 512 * 1024 });
      try { fs.unlinkSync(tmpFile); } catch {}
      return output.slice(0, 5000) || '(no output)';
    } catch (e) {
      try { fs.unlinkSync(tmpFile); } catch {}
      return 'Error: ' + (e.stderr || e.message || '').slice(0, 2000);
    }
  }

  if (name === 'kiko_self_modify') {
    const { operation, file_path, old_text, new_text, command, reason } = input;
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    const PROJECT_ROOT = '/home/kiko/kiko-worker'; // FIXED: was /home/kiko/vela-platform (stale copy, 2 days old)
    const ALLOWED_COMMANDS = ['git status', 'git diff', 'git log', 'npm run build', 'npm install', 'pm2 logs', 'pm2 restart', 'cat ', 'grep ', 'ls ', 'wc ', 'head ', 'tail ', 'node -c ', 'cp -r '];

    // Audit log
    const logEntry = `[${new Date().toISOString()}] ${operation} ${file_path || command || ''} — ${reason || 'no reason given'}\n`;
    try { fs.appendFileSync(path.join(PROJECT_ROOT, 'KIKO_SELF_EDIT_LOG.md'), logEntry); } catch {}

    try {
      if (operation === 'list_files') {
        const target = path.join(PROJECT_ROOT, file_path || '');
        if (!target.startsWith(PROJECT_ROOT)) return 'Error: Path outside project root';
        const result = execSync(`ls -la "${target}"`, { cwd: PROJECT_ROOT, timeout: 5000 }).toString();
        return result.slice(0, 3000);
      }

      if (operation === 'read_file') {
        if (!file_path) return 'Error: file_path required';
        const fullPath = path.join(PROJECT_ROOT, file_path);
        if (!fullPath.startsWith(PROJECT_ROOT)) return 'Error: Path outside project root';
        if (!fs.existsSync(fullPath)) return `Error: File not found: ${file_path}`;
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.length > 8000) {
          return `File: ${file_path} (${content.length} chars, ${content.split('\n').length} lines)\n\n` + content.slice(0, 4000) + '\n\n... [TRUNCATED — use run_command with head/tail for specific sections] ...\n\n' + content.slice(-2000);
        }
        return `File: ${file_path} (${content.length} chars, ${content.split('\n').length} lines)\n\n${content}`;
      }

      if (operation === 'edit_file') {
        if (!file_path || !old_text || new_text === undefined) return 'Error: file_path, old_text, new_text all required';
        const fullPath = path.join(PROJECT_ROOT, file_path);
        if (!fullPath.startsWith(PROJECT_ROOT)) return 'Error: Path outside project root';
        if (!fs.existsSync(fullPath)) return `Error: File not found: ${file_path}`;
        const content = fs.readFileSync(fullPath, 'utf8');
        const count = content.split(old_text).length - 1;
        if (count === 0) return `Error: old_text not found in ${file_path}. Read the file first to get exact text.`;
        if (count > 1) return `Error: old_text found ${count} times in ${file_path}. Make the search text more specific.`;
        // Backup
        fs.writeFileSync(fullPath + '.bak', content);
        // Apply edit
        const newContent = content.replace(old_text, new_text);
        fs.writeFileSync(fullPath, newContent);
        // Syntax check for JS files
        if (file_path.endsWith('.js') || file_path.endsWith('.mjs')) {
          try { execSync(`node -c "${fullPath}"`, { timeout: 5000 }); }
          catch (syntaxErr) {
            fs.writeFileSync(fullPath, content); // Rollback
            return `Error: Syntax error after edit — ROLLED BACK.\n${syntaxErr.message}`;
          }
        }
        return `✓ Edited ${file_path}: replaced 1 occurrence. Backup at ${file_path}.bak. Run deploy to apply.`;
      }

      if (operation === 'run_command') {
        if (!command) return 'Error: command required';
        const isAllowed = ALLOWED_COMMANDS.some(c => command.startsWith(c) || command === c.trim());
        if (!isAllowed) return `Error: Command not allowed. Permitted: ${ALLOWED_COMMANDS.join(', ')}`;
        try {
          const result = execSync(command, { cwd: PROJECT_ROOT, timeout: 30000, encoding: 'utf8' });
          return (result || '').slice(0, 4000) || '[no output]';
        } catch (e) {
          // A non-zero exit is NOT a tool failure for search commands: grep/find return exit 1 when there are simply no matches.
          // Surface the captured output + exit code instead of throwing "Command failed", which reads as a broken tool.
          const out = `${e.stdout || ''}${e.stderr || ''}`.toString().trim();
          return `[exit ${e.status ?? '?'}${e.signal ? ', signal ' + e.signal : ''}] ${out || '(no matches / no output)'}`.slice(0, 4000);
        }
      }

      if (operation === 'full_deploy') {
        const steps = [];
        // Step 0: REQUIRE a reason — no blind deploys
        if (!reason) return 'Error: You must provide a reason for the deploy. What did you change and why?';
        
        // STAGING-FIRST DEPLOY: build → deploy to staging → health check staging → promote to production
        const STAGING_ROOT = '/home/kiko/staging-worker';
        
        // Step 1: Build frontend — if this fails, STOP. Do not deploy.
        try {
          const buildOut = execSync('npm run build 2>&1', { cwd: PROJECT_ROOT, timeout: 60000, encoding: 'utf8' });
          if (buildOut.includes('ERROR') || buildOut.includes('error TS') || (buildOut.includes('error') && !buildOut.includes('built in'))) {
            steps.push('✗ BUILD FAILED — DEPLOY ABORTED. Fix the error first.');
            steps.push(buildOut.slice(-500));
            return steps.join('\n');
          }
          steps.push('✓ Frontend built successfully');
        } catch (e) { 
          steps.push('✗ BUILD FAILED — DEPLOY ABORTED: ' + e.message?.slice(0, 300)); 
          return steps.join('\n'); 
        }
        // Step 2: Deploy to STAGING first
        try {
          execSync('cp -r dist/* /var/www/kiko-staging/', { cwd: PROJECT_ROOT, timeout: 10000 });
          execSync('cp -r api/* /home/kiko/staging-worker/api/', { cwd: PROJECT_ROOT, timeout: 10000 });
          execSync('pm2 restart kiko-staging', { timeout: 15000 });
          steps.push('✓ Deployed to STAGING');
        } catch (e) { steps.push('✗ Staging deploy failed: ' + e.message?.slice(0, 100)); return steps.join('\n'); }
        // Step 3: Health check STAGING
        await new Promise(r => setTimeout(r, 3000));
        try {
          const stagingHealth = await fetch('http://127.0.0.1:3001/health');
          const sh = await stagingHealth.json();
          if (sh.status !== 'ok') { steps.push('✗ STAGING HEALTH FAILED — NOT promoting to production'); return steps.join('\n'); }
          steps.push('✓ Staging health check passed');
        } catch (e) { steps.push('✗ STAGING HEALTH FAILED: ' + e.message?.slice(0, 100) + ' — NOT promoting to production'); return steps.join('\n'); }
        // Step 4: Promote to PRODUCTION (only if staging passed)
        try {
          execSync('cp -r dist/* /var/www/kiko/', { cwd: PROJECT_ROOT, timeout: 10000 });
          execSync('cp -r api/* /home/kiko/kiko-worker/api/', { cwd: PROJECT_ROOT, timeout: 10000 });
          steps.push('✓ Frontend + API promoted to production');
        } catch (e) { steps.push('✗ Production copy failed: ' + e.message?.slice(0, 100)); }
        // Step 5: PM2 restart production
        try {
          execSync('pm2 restart kiko-worker', { cwd: PROJECT_ROOT, timeout: 15000 });
          steps.push('✓ Production restarted');
        } catch (e) { steps.push('✗ PM2 restart failed: ' + e.message?.slice(0, 100)); }
        // Step 6: Health check PRODUCTION
        await new Promise(r => setTimeout(r, 3000));
        try {
          const healthRes = await fetch('http://127.0.0.1:3000/health');
          const health = await healthRes.json();
          steps.push('✓ Health: ' + health.status);
        } catch (e) { steps.push('✗ Health check failed: ' + e.message?.slice(0, 100)); }
        return steps.join('\n');
      }

      if (operation === 'deploy') {
        if (!reason) return 'Error: You must provide a reason for the deploy. What did you change and why?';
        const steps = [];
        // Step 0: Syntax-check all recently modified JS files
        try {
          const recent = execSync('find . -name "*.js" -newer KIKO_SELF_EDIT_LOG.md -not -path "*/node_modules/*" 2>/dev/null', { cwd: PROJECT_ROOT, timeout: 5000, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
          for (const f of recent.slice(0, 10)) {
            execSync(`node -c "${f}"`, { cwd: PROJECT_ROOT, timeout: 3000 });
          }
          if (recent.length) steps.push('✓ Syntax verified: ' + recent.length + ' files');
        } catch (e) { 
          steps.push('✗ SYNTAX ERROR — DEPLOY ABORTED: ' + e.message?.slice(0, 200));
          return steps.join('\n');
        }
        // Step 1: Git commit
        try {
          execSync('git add -A', { cwd: PROJECT_ROOT, timeout: 10000 });
          execSync(`git commit --no-verify -m "Kiko self-edit: ${(reason || 'auto-fix').slice(0, 60)}"`, { cwd: PROJECT_ROOT, timeout: 10000 });
          steps.push('✓ Git committed');
        } catch (e) { steps.push('○ Git commit skipped (no changes or error): ' + e.message?.slice(0, 100)); }
        // Step 2: PM2 restart
        try {
          execSync('pm2 restart kiko-worker', { cwd: PROJECT_ROOT, timeout: 15000 });
          steps.push('✓ PM2 restarted');
        } catch (e) { steps.push('✗ PM2 restart failed: ' + e.message?.slice(0, 100)); }
        // Step 3: Wait for startup
        await new Promise(r => setTimeout(r, 3000));
        // Step 4: Self-check
        try {
          const healthRes = await fetch('http://127.0.0.1:3000/health');
          const health = await healthRes.json();
          steps.push(`✓ Health check: ${health.status}`);
        } catch (e) { steps.push('✗ Health check failed: ' + e.message?.slice(0, 100)); }
        return steps.join('\n');
      }

      return 'Error: Unknown operation: ' + operation;
    } catch (e) { return agentError('kiko_self_modify', e); }
  }

  // ── Platform Users — user/role awareness ──
  if (name === 'get_platform_users') {
    try {
      // Get caller's role
      const callerConfig = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(userEmail)}&select=role&limit=1`);
      const callerRole = callerConfig?.[0]?.role || 'user';
      const isSuperAdmin = callerRole === 'super_admin';

      // Get all users in the org
      const users = await sbFetch('kiko_user_config?select=email,display_name,job_title,company_name,role&order=display_name.asc');
      
      // Get connected accounts
      const tokens = input.include_connections !== false 
        ? await sbFetch('user_tokens?select=user_email,provider,scope,expires_at,updated_at&order=user_email.asc')
        : [];

      // Build response
      const userList = (users || []).map(u => {
        const connections = (tokens || []).filter(t => t.user_email === u.email);
        const entry = {
          name: u.display_name,
          role: u.role === 'super_admin' ? 'Super Admin' : 'User',
          job_title: u.job_title,
          company: u.company_name,
        };
        // Super admin sees full details, regular users see limited info
        if (isSuperAdmin) {
          entry.email = u.email;
          entry.connected_services = connections.map(c => ({
            service: c.provider === 'google' ? 'Google (Gmail + Calendar)' : c.provider === 'linkedin' ? 'LinkedIn' : c.provider,
            scope: c.scope || 'NOT SET',
            token_expires: c.expires_at,
            last_refreshed: c.updated_at,
          }));
          if (connections.length === 0) entry.connected_services = ['None — needs setup'];
        }
        return entry;
      });

      return JSON.stringify({
        total_users: userList.length,
        caller_role: callerRole,
        users: userList,
        note: isSuperAdmin 
          ? 'Full user details shown (super admin access).' 
          : 'Limited view — contact your admin for account connection details.',
      }, null, 2);
    } catch (e) { return agentError('PlatformUsers', e); }
  }

  // ── Super-Admin Oversight — inspect another user's memory + task activity ──
  // The ONLY tool that crosses the user boundary, and it opens one way: super-admin -> named user.
  // Refuses for everyone else by construction; never exposes Sunny's data to a non-super-admin.
  if (name === 'query_user_activity') {
    try {
      const callerCfg = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(userEmail)}&select=role&limit=1`);
      const callerRole = callerCfg?.[0]?.role || 'user';
      if (callerRole !== 'super_admin') {
        return JSON.stringify({ error: 'Not permitted. query_user_activity is restricted to super-admins.' });
      }
      const target = (input.target_user || '').trim();
      if (!target) return JSON.stringify({ error: 'target_user is required (a name or email).' });
      const kind = ['memory', 'tasks', 'both'].includes(input.kind) ? input.kind : 'both';

      // Resolve target -> distinct user_id (one person can hold several email rows under one user_id).
      const safe = encodeURIComponent(target);
      const rows = await sbFetch(`kiko_user_config?or=(display_name.ilike.*${safe}*,email.ilike.*${safe}*)&select=user_id,display_name,email`);
      const ids = [...new Set((rows || []).map(r => r.user_id).filter(Boolean))];
      if (ids.length === 0) return JSON.stringify({ error: `No user found matching "${target}".` });
      if (ids.length > 1) return JSON.stringify({ error: `"${target}" is ambiguous — it matches ${ids.length} users. Be more specific.`, matches: [...new Set((rows || []).map(r => r.display_name))] });
      const targetId = ids[0];
      const targetName = (rows.find(r => r.user_id === targetId) || {}).display_name || target;

      const result = { target: targetName };

      if (kind === 'memory' || kind === 'both') {
        const mem = await sbFetch(`kiko_memories?user_id=eq.${targetId}&is_directory=eq.false&select=path,content,created_at,updated_at&order=updated_at.desc&limit=60`);
        result.memory = {
          count: (mem || []).length,
          note: (mem || []).length === 0 ? 'No attributed memory rows yet for this user. Auto-extracted facts still land in the shared narrative file until the attribution write-path is live.' : undefined,
          items: (mem || []).map(m => ({ path: m.path, added: (m.created_at || '').slice(0, 10), updated: (m.updated_at || '').slice(0, 10), content: (m.content || '').slice(0, 400) })),
        };
      }

      if (kind === 'tasks' || kind === 'both') {
        const tasks = await sbFetch(`tasks?user_id=eq.${targetId}&select=id,data,updated_at&order=updated_at.desc&limit=200`);
        const actioned = [], open = [];
        for (const t of (tasks || [])) {
          const d = t.data || {};
          const done = d.completed === true || d.status === 'completed' || d.status === 'done' || d.dismissed === true;
          const row = { type: d.type || '', company: d.company || '', notes: (d.notes || '').slice(0, 200), assignedBy: d.assignedBy || '', completedAt: (d.completedAt || '').slice(0, 10) || null };
          (done ? actioned : open).push(row);
        }
        result.tasks = { total: (tasks || []).length, actioned_count: actioned.length, open_count: open.length, actioned, open };
      }

      return JSON.stringify(result, null, 2);
    } catch (e) { return agentError('UserActivity', e); }
  }

  // ── Cognitive Analysis — retrieve reasoning chain for an entity ──
  if (name === 'get_cognitive_analysis') {
    try {
      const { entity_name } = input;
      if (!entity_name) return JSON.stringify({ error: 'entity_name required' });
      // Step 1: find event_ids from classify/context steps (which have entity_name in input JSONB)
      const matchRes = await sbFetch(`kiko_reasoning_chains?select=event_id&input-%3E%3Eentity_name=ilike.*${encodeURIComponent(entity_name)}*&order=created_at.desc&limit=4`);
      if (!matchRes?.length) return JSON.stringify({ found: false, message: `No cognitive analysis found for "${entity_name}". The event processor may not have processed this entity yet.` });
      const eventIds = [...new Set(matchRes.map(s => s.event_id))];
      // Step 2: fetch ALL steps for those events
      const chains = await sbFetch(`kiko_reasoning_chains?select=step_type,output,created_at&event_id=in.(${eventIds.join(',')})&order=created_at.asc`);
      if (!chains?.length) return JSON.stringify({ found: false, message: 'Event found but no reasoning steps.' });
      const result = { found: true, entity: entity_name, steps: {} };
      for (const c of chains) {
        if (!result.steps[c.step_type] || new Date(c.created_at) > new Date(result.steps[c.step_type].created_at)) {
          result.steps[c.step_type] = { output: c.output, created_at: c.created_at };
        }
      }
      return JSON.stringify(result, null, 2);
    } catch (e) { return agentError('CognitiveAnalysis', e); }
  }

  // ── Preference Update — self-adjustment via user prompting ──
  if (name === 'update_kiko_preference') {
    try {
      const { category, preference, confidence } = input;
      // Fire-and-forget — don't block the response waiting for DB writes
      sbFetch('kiko_preferences', {
        method: 'POST',
        body: JSON.stringify({
          category: category || 'behaviour',
          content: preference,
          confidence: confidence || 'high',
          source: 'user_instruction',
          updated_at: new Date().toISOString(),
        })
      }).catch(e => console.error('[update_kiko_preference] Write failed:', e.message));
      sbFetch('kiko_learning_log', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          category: 'preference_update',
          content: `[${category}] ${preference} (confidence: ${confidence || 'high'})`,
          entity_name: userEmail,
        })
      }).catch(e => console.error('[update_kiko_preference] Log failed:', e.message));
      return `Preference saved: "${preference}" [${category}, ${confidence || 'high'}]. Applied to all future conversations.`;
    } catch (e) { return agentError('PreferenceUpdate', e); }
  }

  // ── Digest Master Brief — rewire Kiko from a document ──
  if (name === 'digest_master_brief') {
    try {
      const { document_text, mode } = input;
      if (!document_text || document_text.length < 50) return 'Document text too short. Please provide the full brief.';
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
      const extraction = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 4000,
        messages: [{ role: 'user', content: `Extract operating instructions from this master brief for an AI Chief of Staff. Return raw JSON only (no markdown):
{
  "user_bible": "Comprehensive personal context: name, role, company, responsibilities, priorities, communication style, decision-making, key relationships, industry focus. Use § headers. Max 3000 words.",
  "preferences": [{"category": "communication_style|process|priority|language|formatting|behaviour", "content": "specific rule", "confidence": "high|medium"}],
  "learned_rules": [{"category": "communication|process|strategy|outreach|financial|legal|general", "rule_text": "specific operational rule"}],
  "specialist_roles": ["C-suite roles to assume on demand"],
  "key_objectives": ["top strategic objectives"],
  "restricted_topics": ["data NEVER shared with other users"]
}

Document:\n${document_text.slice(0, 25000)}` }],
      });
      let parsed;
      try { parsed = JSON.parse((extraction.content[0]?.text || '{}').replace(/```json|```/g, '').trim()); } catch { return 'Failed to parse brief. Please try again.'; }
      const results = { bible: false, preferences: 0, rules: 0 };
      if (parsed.user_bible) {
        const bible = `§15 USER CONTEXT — PRIVATE OPERATING BRIEF\n${parsed.user_bible}` +
          (parsed.key_objectives?.length ? `\n\n§16 KEY OBJECTIVES\n${parsed.key_objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : '') +
          (parsed.specialist_roles?.length ? `\n\n§17 SPECIALIST ROLES\nKiko operates as: ${parsed.specialist_roles.join(', ')}.` : '') +
          (parsed.restricted_topics?.length ? `\n\n§18 RESTRICTED DATA\nNEVER share with other users: ${parsed.restricted_topics.join(', ')}` : '');
        if (mode === 'replace') {
          await sbFetch(`user_bibles?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ content: bible, updated_at: new Date().toISOString() }) });
        } else {
          const existing = await sbFetch(`user_bibles?user_id=eq.${userId}&select=content&limit=1`);
          let merged = Array.isArray(existing) && existing[0]?.content ? existing[0].content : '';
          for (const section of bible.split(/(?=§\d+)/)) {
            const num = section.match(/§(\d+)/)?.[1];
            if (num) { const re = new RegExp(`§${num}[^§]*`, 's'); merged = merged.match(re) ? merged.replace(re, section) : merged + '\n\n' + section; }
          }
          await sbFetch(`user_bibles?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ content: merged.trim(), updated_at: new Date().toISOString() }) });
        }
        results.bible = true;
      }
      if (Array.isArray(parsed.preferences)) {
        for (const p of parsed.preferences.slice(0, 20)) {
          sbFetch('kiko_preferences', { method: 'POST', body: JSON.stringify({ category: p.category || 'behaviour', preference: p.content, confidence: p.confidence || 'high', updated_at: new Date().toISOString() }) }).catch(() => {});
          results.preferences++;
        }
      }
      if (Array.isArray(parsed.learned_rules)) {
        for (const r of parsed.learned_rules.slice(0, 15)) {
          sbFetch('kiko_learned_rules', { method: 'POST', body: JSON.stringify({ category: r.category || 'general', rule_text: r.rule_text, active: true, evidence_count: 5, weight: 1.5, source: 'master_brief' }) }).catch(() => {});
          results.rules++;
        }
      }
      sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ user_id: userId, category: 'master_brief_digest', content: `Digested brief (${document_text.length} chars, mode: ${mode || 'merge'}). Bible=${results.bible}, prefs=${results.preferences}, rules=${results.rules}`, entity_name: userEmail }) }).catch(() => {});
      return `Master brief digested.\n- Personal bible: ${results.bible ? 'Updated' : 'No changes'}\n- Preferences: ${results.preferences} saved\n- Rules: ${results.rules} activated\n${parsed.specialist_roles?.length ? `- Roles: ${parsed.specialist_roles.join(', ')}\n` : ''}${parsed.restricted_topics?.length ? `- ${parsed.restricted_topics.length} restricted topics marked private\n` : ''}All changes private to you.`;
    } catch (e) { return agentError('DigestBrief', e); }
  }

  // ── Navigator Agent ──
  if (name === 'ask_navigator') {
    try {
      const { callNavigator } = await import('./agents/navigator.js');
      let enrichedInstruction = input.instruction;
      if (pageContext?.page) {
        enrichedInstruction += `\n\n[PAGE CONTEXT: page=${pageContext.page}, path=${pageContext.path || '/'}, summary=${pageContext.summary || 'none'}${pageContext.stageDistribution ? `, stages=${JSON.stringify(pageContext.stageDistribution)}` : ''}${pageContext.visibleItems ? `, visibleItems=${pageContext.visibleItems}` : ''}]`;
      }
      const result = await callNavigator(enrichedInstruction, pageContext || {});
      if (result.navigateTo) return { navigated: true, page: result.navigateTo, description: result.description };
      return result.description;
    } catch (e) { return agentError('Navigator', e); }
  }

  // ── Deal Agent ──
  if (name === 'ask_deal_agent') {
    try {
      const { callDealAgent } = await import('./agents/deal.js');
      const result = await callDealAgent(input.instruction, userEmail, userId);
      if (result.success) {
        const entity = input.instruction?.match(/(?:for|at|with|to)\s+([A-Z][a-zA-Z\s&]+)/)?.[1] || 'unknown';
        autoLogActivity('crm_action', entity.trim(), input.instruction?.slice(0, 200));
      }
      return result.success ? result.result : `Deal Agent failed: ${result.result}`;
    } catch (e) { return agentError('Deal Agent', e); }
  }

  // ── Data Agent ──
  if (name === 'ask_data_agent' || name === 'crm_search' || name === 'campaign_engine' || name === 'pipeline_analytics' || name === 'knowledge_ops' || name === 'goals_intents') {
    // Super admin only operations
    if (['update_partnership', 'refresh_partnerships', 'create_campaign', 'bulk_enroll'].includes(input.operation)) {
      const userRows = await sbFetch(`users?id=eq.${userId}&select=role&limit=1`); const userRow = userRows?.[0];
      if (userRow?.[0]?.role !== 'super_admin') {
        return `❌ ${input.operation} is restricted to super admin only.`;
      }
    }
    try {
      const { callDataAgent } = await import('./agents/data.js');
      return await callDataAgent(input.operation, input.params || {}, userEmail);
    } catch (e) { return agentError('Data Agent', e); }
  }

  // ── Outreach Agent ──
  if (name === 'ask_outreach_agent') {
    try {
      const { callOutreachAgent } = await import('./agents/outreach.js');
      const result = await callOutreachAgent(input.operation, input.params || {}, userEmail, userId);
      const entity = input.params?.company || input.params?.recipient || input.params?.contactName || 'unknown';
      autoLogActivity('outreach', entity, `${input.operation}: ${JSON.stringify(input.params || {}).slice(0, 200)}`);
      return result;
    } catch (e) { return agentError('Outreach Agent', e); }
  }

  // ── Document Agent ──
  if (name === 'ask_document_agent') {
    // Export operations restricted to super_admin only
    const exportOps = ['export_pipeline', 'export_contacts', 'generate_csv', 'generate_xlsx'];
    if (exportOps.includes(input.operation)) {
      const userRow = await sbFetch(`users?id=eq.${userId}&select=role&limit=1`);
      const role = userRow?.[0]?.role || 'user';
      if (role !== 'super_admin') {
        return '❌ Data exports are restricted to admin users only. Contact your administrator if you need access to export data.';
      }
    }
    try {
      const { callDocumentAgent } = await import('./agents/document.js');
      return await callDocumentAgent(input.operation, input.params || {}, userId);
    } catch (e) { return agentError('Document Agent', e); }
  }

  // ── Memory Engine ──
  if (name === 'ask_memory_engine') {
    try {
      const { callMemoryEngine } = await import('./agents/memory-engine.js');
      return await callMemoryEngine(input.operation, input.params || {}, userId);
    } catch (e) { return agentError('Memory Engine', e); }
  }

  // ── Strategy Agent ──
  if (name === 'ask_strategy_agent') {
    try {
      const { callStrategyAgent } = await import('./agents/strategy.js');
      return await callStrategyAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Strategy Agent', e); }
  }

  // ── Negotiation Agent ──
  if (name === 'ask_negotiation_agent') {
    try {
      const { callNegotiationAgent } = await import('./agents/negotiation.js');
      return await callNegotiationAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Negotiation Agent', e); }
  }

  // ── Category Control Agent ──
  if (name === 'ask_category_agent') {
    try {
      const { callCategoryControlAgent } = await import('./agents/category-control.js');
      return await callCategoryControlAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Category Control', e); }
  }

  // ── Finance Agent ──
  if (name === 'ask_finance_agent') {
    try {
      const { callFinanceAgent } = await import('./agents/finance.js');
      return await callFinanceAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Finance Agent', e); }
  }

  // ── EA Agent ──
  if (name === 'ask_ea_agent') {
    try {
      const { callEAAgent } = await import('./agents/ea.js');
      return await callEAAgent(input.operation, input.params || {});
    } catch (e) { return agentError('EA Agent', e); }
  }

  // ── Legal Agent ──
  if (name === 'ask_legal_agent') {
    try {
      const { callLegalAgent } = await import('./agents/legal.js');
      return await callLegalAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Legal Agent', e); }
  }

  // ── Dispute Agent ──
  if (name === 'ask_dispute_agent') {
    try {
      const { callDisputeAgent } = await import('./agents/dispute.js');
      return await callDisputeAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Dispute Agent', e); }
  }

  // ── Content Agent ──
  if (name === 'ask_content_agent') {
    try {
      const { callContentAgent } = await import('./agents/content.js');
      return await callContentAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Content Agent', e); }
  }

  // ── Investment Agent ──
  if (name === 'ask_investment_agent') {
    try {
      const { callInvestmentAgent } = await import('./agents/investment.js');
      return await callInvestmentAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Investment Agent', e); }
  }

  // ── Pricing Agent ──
  if (name === 'ask_pricing_agent') {
    try {
      const { callPricingAgent } = await import('./agents/pricing.js');
      return await callPricingAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Pricing Agent', e); }
  }

  // ── Signal Agent ──
  if (name === 'ask_signal_agent') {
    try {
      const { callSignalAgent } = await import('./agents/signal.js');
      return await callSignalAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Signal Agent', e); }
  }

  // ── Travel Agent ──
  if (name === 'ask_travel_agent') {
    try {
      const { callTravelAgent } = await import('./agents/travel.js');
      return await callTravelAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Travel Agent', e); }
  }

  // ── Specialist Agents (Website, Product Dev, IP) ──
  if (name === 'ask_specialist_agent') {
    try {
      if (input.domain === 'website') {
        const { callWebsiteAgent } = await import('./agents/website.js');
        return await callWebsiteAgent('analyse', input.params || {});
      }
      if (input.domain === 'product_dev') {
        const { callProductDevAgent } = await import('./agents/product-dev.js');
        return await callProductDevAgent('analyse', input.params || {});
      }
      if (input.domain === 'ip') {
        const { callIPAgent } = await import('./agents/ip.js');
        return await callIPAgent('analyse', input.params || {});
      }
      return `Unknown specialist domain: ${input.domain}. Available: website, product_dev, ip`;
    } catch (e) { return agentError('Specialist Agent', e); }
  }

  // ── Direct tools (kept for backwards compatibility) ──
  // ── Google Maps Link Generator ──
  if (name === 'google_maps_link') {
    const { place, mode = 'search', travel_mode = 'driving' } = input;
    const encoded = encodeURIComponent(place);
    if (mode === 'directions') {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=${travel_mode}`;
      return `📍 **[Get directions to ${place}](${url})**\n\nThis link opens Google Maps with directions. On mobile, it launches the Google Maps app directly.`;
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
      return `📍 **[${place} on Google Maps](${url})**\n\nTap to open in Google Maps.`;
    }
  }

  if (name === 'navigate_page') {
    const { page, reason } = input;
    return { navigated: true, page, reason: reason || `Opening ${page}` };
  }

  if (name === 'create_email_draft') {
    const { to, subject, body, draft_for, original_draft } = input;
    const targetEmail = draft_for || 'sunny@vanhawke.agency';
    try {
      const res = await fetch('https://api.vanhawke.agency/api/create-gmail-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body: body.replace(/\n/g, '<br>'), htmlBody: body, draftFor: targetEmail }),
      });
      const data = await res.json();
      if (data.ok) {
        // Log draft edit for learning if user made corrections
        if (original_draft && original_draft !== body) {
          try {
            await sbFetch('kiko_draft_edits', { method: 'POST', body: JSON.stringify({
              user_id: userId, original_draft, final_draft: body, subject, recipient: to,
            }) });
          } catch (logErr) { /* silent — don't block draft creation */ }
        }
        return `✅ Draft created in ${targetEmail.includes('matt') ? "Matt's" : "your"} Gmail drafts.\n\n**To:** ${to}\n**Subject:** ${subject}\n**Draft in:** ${targetEmail}\n\n${targetEmail.includes('matt') ? 'Matt can review and send from his Gmail.' : 'Open Gmail to review and send.'}`;
      } else {
        return `❌ Failed to create draft: ${data.error}`;
      }
    } catch (err) {
      return `❌ Error creating draft: ${err.message}`;
    }
  }

  // ── Batch Email Drafting — draft re-engagement emails for multiple stalled deals ──
  if (name === 'batch_draft_emails') {
    const minDays = input.min_days_stale || 14;
    const maxDeals = Math.min(input.max_deals || 10, 20); // Cap at 20
    const senderEmail = input.sender || 'matt.smith@vanhawke.agency';
    const draftFor = input.draft_for || senderEmail;
    const tone = input.tone || 'direct';
    
    try {
      // Get stalled deals
      const deals = await sbFetch('deals?select=id,data,updated_at&order=updated_at.asc');
      if (!Array.isArray(deals) || !deals.length) return 'No deals found in pipeline.';
      
      const now = Date.now();
      const stalledDeals = deals.filter(d => {
        const data = d.data || {};
        const stage = data.stage || '';
        if (/closed|won|lost|dead/i.test(stage)) return false;
        const lastActivity = data.last_activity_at || d.updated_at;
        const daysSince = Math.floor((now - new Date(lastActivity).getTime()) / 86400000);
        return daysSince >= minDays && daysSince < 365;
      }).slice(0, maxDeals);
      
      if (!stalledDeals.length) return `No deals stalled for ${minDays}+ days found.`;
      
      // For each deal, find the primary contact and draft an email
      const results = [];
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
      
      for (let i = 0; i < stalledDeals.length; i++) {
        const deal = stalledDeals[i];
        const d = deal.data || {};
        const dealName = d.name || d.company || d.title || 'Unknown';
        const contactName = d.contact_name || d.contact || '';
        const contactEmail = d.contact_email || '';
        const company = d.company || dealName;
        const stage = d.stage || '';
        const value = d.value || 0;
        const lastActivity = d.last_activity_at || deal.updated_at;
        const daysSince = Math.floor((now - new Date(lastActivity).getTime()) / 86400000);
        
        if (!contactEmail) {
          results.push({ deal: dealName, status: 'skipped', reason: 'No contact email' });
          continue;
        }
        
        try {
          // Generate personalised draft using Claude
          const draftRes = await claude.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: `Draft a short re-engagement email (under 120 words) for a Haas F1 Team sponsorship partnership.
Tone: ${tone}. Sender: Matt Smith, Van Hawke Agency.
Recipient: ${contactName} at ${company}
Last contact: ${daysSince} days ago. Stage: ${stage}. Value: $${(value/1000000).toFixed(1)}M.
Rules: Start with "Hi ${contactName.split(' ')[0]}," — reference our previous conversations naturally — give a specific reason to reconnect (new season, recent results, upcoming race) — end with a clear ask for a brief call. End with just "Best," on its own line. Do NOT include any name, title, company, or signature after Best. Output ONLY the email body, nothing else.` }],
          });
          
          const emailBody = draftRes.content[0]?.text || '';
          if (!emailBody || emailBody.length < 30) {
            results.push({ deal: dealName, status: 'failed', reason: 'Draft generation failed' });
            continue;
          }
          
          // Create the Gmail draft
          const gmailRes = await fetch('https://api.vanhawke.agency/api/create-gmail-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: contactEmail,
              subject: `Haas F1 Team x ${company} — Reconnecting`,
              body: emailBody,
              sender: senderEmail,
              draftFor: draftFor,
            }),
          });
          const gmailData = await gmailRes.json();
          
          if (gmailData.ok) {
            results.push({ deal: dealName, contact: contactName, email: contactEmail, status: 'drafted', draftId: gmailData.draftId });
          } else {
            results.push({ deal: dealName, status: 'failed', reason: gmailData.error || 'Gmail error' });
          }
        } catch (err) {
          results.push({ deal: dealName, status: 'failed', reason: err.message?.slice(0, 100) });
        }
      }
      
      const drafted = results.filter(r => r.status === 'drafted');
      const skipped = results.filter(r => r.status === 'skipped');
      const failed = results.filter(r => r.status === 'failed');
      
      let report = `📧 BATCH DRAFT COMPLETE\n\n`;
      report += `✅ ${drafted.length} drafts created in ${draftFor?.includes('matt') ? "Matt's" : "your"} Gmail\n`;
      if (skipped.length) report += `⏭️ ${skipped.length} skipped (no contact email)\n`;
      if (failed.length) report += `❌ ${failed.length} failed\n`;
      report += `\n`;
      
      if (drafted.length) {
        report += `DRAFTS CREATED:\n`;
        for (const r of drafted) {
          report += `• ${r.deal} → ${r.contact} (${r.email})\n`;
        }
      }
      if (skipped.length) {
        report += `\nSKIPPED (no email):\n`;
        for (const r of skipped) report += `• ${r.deal}\n`;
      }
      if (failed.length) {
        report += `\nFAILED:\n`;
        for (const r of failed) report += `• ${r.deal}: ${r.reason}\n`;
      }
      
      return report;
    } catch (err) {
      return `Batch draft error: ${err.message}`;
    }
  }

  if (name === 'log_activity') {
    const { type, entity_name, description, deal_id } = input;
    try {
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({ type, entity_name, subject: description, deal_id: deal_id || null, status: 'completed', completed_at: new Date().toISOString(), metadata: { logged_by: 'kiko' } }) });
      return `Activity logged: ${type} — ${entity_name}: ${description}`;
    } catch (e) { return `Activity log error: ${e.message}`; }
  }

  // ── Lemlist Live Agent ──
  // ask_lemlist_live handler REMOVED — Lemlist cancelled

  // ── Self-Monitor ──
  if (name === 'ask_self_monitor') {
    try {
      return await handleSelfMonitor(input.operation, input.params || {});
    } catch (e) { return agentError('Self-Monitor', e); }
  }

  // ── Knowledge Management ──
  if (name === 'manage_knowledge') {
    try {
      const { operation, params = {} } = input;

      if (operation === 'add_source') {
        const { name: srcName, url, category, content } = params;
        if (!srcName) return 'Error: name is required for add_source';
        if (content) {
          await sbFetch('kiko_knowledge_sources', { method: 'POST', body: JSON.stringify({ name: srcName, type: 'document', category: category || 'general', content: content.slice(0, 50000), active: true, user_id: userId }) });
          return `Knowledge source added: "${srcName}" (document, ${category || 'general'}). Will be processed on next ingestion cycle.`;
        }
        if (url) {
          await sbFetch('kiko_knowledge_sources', { method: 'POST', body: JSON.stringify({ name: srcName, type: 'url', category: category || 'general', url, scrape_frequency: 'weekly', active: true }) });
          return `Knowledge source added: "${srcName}" (${url}). Will be scraped on next ingestion cycle at 5am.`;
        }
        return 'Error: provide url or content';
      }

      if (operation === 'search_knowledge') {
        const query = (params.query || '').toLowerCase();
        // Session 71 fix: term-based AND matching. The old contiguous-substring match
        // silently failed on any multi-word query ("qatar registration" never matches
        // "QATAR ENTRY ... REGISTRATION ROUTE"). Split into terms; ALL must appear.
        const terms = query.split(/\s+/).filter(Boolean).slice(0, 5);
        const sources = await sbFetch('kiko_knowledge_sources?active=eq.true&select=name,category,summary,key_facts&order=relevance_score.desc&limit=30');
        const learning = await sbFetch(`kiko_learning_log?category=in.(curriculum,knowledge_source,imported_knowledge)&order=created_at.desc&limit=50&select=content,entity_name,category`);
        // Also search kiko_knowledge (competitive intel, imported sessions, discovery findings)
        // — match each term against content OR domain (imported docs carry key terms in domain)
        const andGroup = terms.map(t => `or(content.ilike.*${encodeURIComponent(t)}*,domain.ilike.*${encodeURIComponent(t)}*)`).join(',');
        const research = terms.length
          ? await sbFetch(`kiko_knowledge?and=(${andGroup})&select=domain,content,researched_at&order=researched_at.desc&limit=10`)
              .catch(e => { console.error('[search_knowledge] kiko_knowledge query failed:', e.message); return []; })
          : [];
        let matches = [];
        for (const s of (sources || [])) {
          const text = `${s.name} ${s.summary || ''} ${JSON.stringify(s.key_facts || [])}`.toLowerCase();
          if (terms.length && terms.every(t => text.includes(t))) matches.push({ type: 'source', name: s.name, category: s.category, summary: (s.summary || '').slice(0, 150) });
        }
        for (const r of (research || [])) {
          matches.push({ type: 'research', domain: r.domain, content: (r.content || '').slice(0, 1500), date: r.researched_at });
        }
        for (const l of (learning || [])) {
          const ltext = `${l.content || ''} ${l.entity_name || ''}`.toLowerCase();
          if (terms.length && terms.every(t => ltext.includes(t))) {
            matches.push({ type: 'learned', category: l.category, content: l.content.slice(0, 200), entity: l.entity_name });
          }
        }
        if (!matches.length) {
          // Semantic search fallback via RAG vector embeddings
          try {
            const embedRes = await fetch('https://api.vanhawke.agency/api/embed', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'search', query: params.query }),
            });
            if (embedRes.ok) {
              const embedData = await embedRes.json();
              if (embedData.results?.length) {
                let out = `SEMANTIC SEARCH: "${params.query}" — ${embedData.results.length} vector matches\n\n`;
                for (const r of embedData.results.slice(0, 5)) {
                  out += `🔍 [${r.source_id}] (${(r.similarity * 100).toFixed(0)}% match): ${r.chunk_text?.slice(0, 250)}\n\n`;
                }
                return out;
              }
            }
          } catch (e) { console.error('[search_knowledge] RAG fallback error:', e.message); }
          return `No knowledge found for "${params.query}". I can learn about this — ask me to "learn about ${params.query}".`;
        }
        let out = `KNOWLEDGE SEARCH: "${params.query}" — ${matches.length} results\n\n`;
        for (const m of matches.slice(0, 12)) {
          if (m.type === 'source') out += `📚 [${m.category}] ${m.name}: ${m.summary}\n`;
          else if (m.type === 'research') out += `🔬 [${m.domain} — ${m.date ? new Date(m.date).toLocaleDateString('en-GB') : '?'}] ${m.content}\n`;
          else out += `🧠 [${m.category}] ${m.content}\n`;
        }
        return out;
      }

      if (operation === 'list_sources') {
        const cat = params.category;
        const query = cat ? `kiko_knowledge_sources?active=eq.true&category=eq.${cat}&select=name,category,url,last_scraped_at,relevance_score&order=relevance_score.desc` : 'kiko_knowledge_sources?active=eq.true&select=name,category,url,last_scraped_at,relevance_score&order=category,relevance_score.desc';
        const sources = await sbFetch(query);
        if (!sources?.length) return cat ? `No sources in category "${cat}".` : 'No active knowledge sources.';
        let out = `KNOWLEDGE SOURCES${cat ? ` [${cat}]` : ''} — ${sources.length} active\n\n`;
        let lastCat = '';
        for (const s of sources) {
          if (s.category !== lastCat) { out += `\n[${s.category.toUpperCase()}]\n`; lastCat = s.category; }
          out += `• ${s.name}${s.url ? ` (${s.url.slice(0, 50)})` : ''} — relevance: ${s.relevance_score}/10${s.last_scraped_at ? `, scraped: ${new Date(s.last_scraped_at).toLocaleDateString('en-GB')}` : ' (not yet scraped)'}\n`;
        }
        return out;
      }

      if (operation === 'learn_topic') {
        const { topic, category } = params;
        if (!topic) return 'Error: topic is required';
        const baseUrl = 'https://api.vanhawke.agency';
        // Trigger the ingestion endpoint with a synthetic source
        await sbFetch('kiko_knowledge_sources', { method: 'POST', body: JSON.stringify({ name: `On-demand: ${topic}`, type: 'topic', category: category || 'general', url: null, content: topic, scrape_frequency: 'once', active: true }) });
        return `Learning topic queued: "${topic}". I'll research this on the next learning cycle, or you can ask me to research it now using web search.`;
      }

      if (operation === 'save_insight') {
        const { insight, entity, category } = params;
        if (!insight) return 'Error: insight text is required';
        sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ user_id: userId, category: category || 'conversation_insight', content: insight, entity_name: entity || null }) }).catch(e => console.error('[learning_save] Failed:', e.message));
        return `Insight saved: "${insight.slice(0, 100)}${insight.length > 100 ? '...' : ''}"`;
      }

      if (operation === 'create_agent') {
        const { createDynamicAgent } = await import('./agents/dynamic-runner.js');
        const result = await createDynamicAgent(params);
        if (result.error) return `Failed to create agent: ${result.error}`;
        return `Agent "${result.name}" ${result.action} successfully. It's now available and I'll automatically discover it. You can trigger it by name or by its keywords.`;
      }

      if (operation === 'list_agents') {
        const { listDynamicAgents } = await import('./agents/dynamic-runner.js');
        return await listDynamicAgents();
      }

      if (operation === 'run_agent') {
        const { runDynamicAgent } = await import('./agents/dynamic-runner.js');
        return await runDynamicAgent(params.agent_name, params.question || params.query, params.context);
      }

      if (operation === 'set_mode') {
        const { mode, description, priorities, expires_in_days } = params;
        if (!mode) return 'Error: mode is required. Options: fundraising, race_week, outreach_sprint, deal_closing, product_launch, default';
        // Deactivate current mode
        await sbFetch('kiko_operational_mode?active=eq.true', { method: 'PATCH', body: JSON.stringify({ active: false }) });
        // Set new mode
        const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000).toISOString() : null;
        await sbFetch('kiko_operational_mode', { method: 'POST', body: JSON.stringify({
          mode, description: description || `${mode} mode activated`,
          priorities: priorities || [], active: true, set_by: 'sunny',
          expires_at: expiresAt,
        })});
        return `Operational mode set: ${mode.toUpperCase()}${expiresAt ? ` (expires in ${expires_in_days} days)` : ''}. All my responses will now prioritise this mode.`;
      }

      if (operation === 'get_mode') {
        const mode = await sbFetch('kiko_operational_mode?active=eq.true&order=created_at.desc&limit=1&select=mode,description,priorities,created_at,expires_at');
        if (!mode?.length) return 'Current mode: DEFAULT. No special operational mode active.';
        const m = mode[0];
        return `Current mode: ${m.mode.toUpperCase()}\n${m.description}\nPriorities: ${(m.priorities || []).join(' > ')}\nSet: ${new Date(m.created_at).toLocaleDateString('en-GB')}${m.expires_at ? `\nExpires: ${new Date(m.expires_at).toLocaleDateString('en-GB')}` : ''}`;
      }

      return `Unknown knowledge operation: ${operation}`;
    } catch (e) { return `Knowledge management error: ${e.message}`; }
  }

  // ── Code Review / Self-Analysis ──
  if (name === 'ask_code_review') {
    try {
      const { callCodeReviewAgent } = await import('./agents/code-review.js');
      return await callCodeReviewAgent(input.operation, input.params || {});
    } catch (e) { return agentError('CodeReview', e); }
  }

  // ── On-Demand Triage ──
  if (name === 'trigger_triage') {
    try {
      const baseUrl = 'https://api.vanhawke.agency';
      const triageRes = await fetch(`${baseUrl}/api/cron-inbox-triage`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      const result = await triageRes.json();
      if (result.ok) {
        // Read the fresh triage
        const today = new Date().toISOString().split('T')[0];
        const triage = await sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=summary,priority_emails`);
        if (triage?.[0]) {
          let out = `FRESH INBOX TRIAGE:\n${triage[0].summary}\n\n`;
          for (const e of (triage[0].priority_emails || [])) {
            out += `${e.priority === 'ACTION_REQUIRED' ? '🔴' : '📌'} ${e.from}: ${e.subject}\n  → ${e.reason || ''}\n`;
          }
          return out;
        }
        return `Triage completed: ${JSON.stringify(result)}`;
      }
      return `Triage failed: ${result.error || 'unknown'}`;
    } catch (e) { return `Triage trigger error: ${e.message}`; }
  }

  // ── Conversation Search ──
  if (name === 'search_conversations') {
    try {
      const query = (input.query || '');
      const limit = input.limit || 5;

      // Phase 1: Semantic search (pgvector) — finds conceptual matches
      let semanticResults = [];
      try {
        const { semanticSearchConversations } = await import('./embed-utils.js');
        semanticResults = await semanticSearchConversations(query, limit, userId);
      } catch (semErr) {
        console.error('[search_conversations] Semantic search unavailable:', semErr.message);
      }

      // Phase 2: Keyword fallback — catches exact matches semantic might miss
      const scored = [];
      const queryLower = query.toLowerCase();
      const convos = await sbFetch(`conversations?select=id,title,messages,updated_at&archived=neq.true&order=updated_at.desc&limit=50`);
      for (const c of (convos || [])) {
        const msgs = c.messages || [];
        const text = msgs.map(m => (m.content || '')).join(' ').toLowerCase();
        if (text.includes(queryLower)) {
          const matchMsgs = msgs.filter(m => (m.content || '').toLowerCase().includes(queryLower));
          scored.push({
            title: c.title || 'Untitled', id: c.id,
            date: c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '?',
            matches: matchMsgs.length, source: 'keyword',
            excerpts: matchMsgs.slice(0, 3).map(m => {
              const content = m.content || '';
              const idx = content.toLowerCase().indexOf(queryLower);
              const start = Math.max(0, idx - 60);
              const end = Math.min(content.length, idx + queryLower.length + 60);
              return `[${m.role}]: ...${content.slice(start, end)}...`;
            })
          });
        }
      }
      // Also keyword-search imported conversations — Session 71 fix:
      // server-side RPC searches ALL imported convs at full depth (old code
      // filtered processed=true [always false], read m.content [imports use
      // m.text], and scanned only the 30 newest — archive was invisible).
      try {
        const hits = await sbFetch('rpc/search_imported_convs', {
          method: 'POST',
          body: JSON.stringify({ q: query, uid: userId || null, lim: 8 }),
        });
        for (const c of (hits || [])) {
          scored.push({
            title: `[${c.source}] ${c.title || 'Untitled'}`, id: c.id,
            date: c.original_date ? new Date(c.original_date).toLocaleDateString('en-GB') : '?',
            matches: 1, source: 'keyword',
            excerpts: [`...${(c.snippet || '').replace(/\\+n/g, ' ').slice(0, 320)}...`],
          });
        }
      } catch (impErr) { console.error('[search_conversations] imported-archive RPC failed:', impErr.message); }

      // Merge: semantic results first, then keyword results (deduplicated)
      const seenIds = new Set();
      let out = `CONVERSATION SEARCH: "${query}"`;
      const allResults = [];

      // Add semantic results
      for (const sr of semanticResults) {
        seenIds.add(String(sr.conversation_id));
        allResults.push({
          title: sr.title || 'Untitled',
          date: '', source: `semantic (${Math.round(sr.similarity * 100)}% match)`,
          summary: sr.summary?.slice(0, 200) || '',
        });
      }

      // Add keyword results not already in semantic
      scored.sort((a, b) => b.matches - a.matches);
      for (const kr of scored) {
        if (seenIds.has(String(kr.id))) continue;
        allResults.push(kr);
      }

      if (!allResults.length) return `No conversations found for "${query}". Try broader terms.`;
      out += ` — ${allResults.length} results\n\n`;
      for (const r of allResults.slice(0, limit)) {
        out += `📅 ${r.date ? r.date + ' — ' : ''}${r.title} (${r.source || r.matches + ' mentions'})\n`;
        if (r.summary) out += `  ${r.summary}\n`;
        if (r.excerpts) for (const e of r.excerpts) out += `  ${e}\n`;
        out += '\n';
      }
      return out;
    } catch (e) { return `Conversation search error: ${e.message}`; }
  }

  // ── Email tool (uses our own Gmail API, not MCP) ──
  if (name === 'read_email') {
    const { operation, query } = input;
    try {
      // Permission check: get user role
      const userRows = await sbFetch(`users?id=eq.${userId}&select=role,email&limit=1`);
      const userRole = (Array.isArray(userRows) && userRows[0]?.role) || 'user';
      const userEmailAddr = (Array.isArray(userRows) && userRows[0]?.email) || userEmail;
      const isSuperAdmin = userRole === 'super_admin';

      // Token refresh — uses same pattern as create-gmail-draft (proven working)
      async function refreshGmailToken(email) {
        const rows = await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(email)}&provider=eq.google&select=refresh_token&limit=1`);
        if (!Array.isArray(rows) || !rows[0]?.refresh_token) { console.log(`[read_email] No refresh_token for ${email}`); return null; }
        const tRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
        });
        const tData = await tRes.json();
        if (!tData.access_token) { console.log(`[read_email] Token refresh failed for ${email}:`, JSON.stringify(tData).slice(0, 200)); return null; }
        return tData.access_token;
      }

      const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
      const gfetch = (token, path) => fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

      // Extract full body text from Gmail message payload
      function extractBody(payload) {
        if (payload?.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
        if (payload?.parts) for (const p of payload.parts) { const t = extractBody(p); if (t) return t; }
        if (payload?.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
        return '';
      }

      // Find attachment parts (filename + attachmentId) anywhere in the payload tree
      function findAttachmentParts(p, out = []) {
        if (!p) return out;
        if (p.filename && p.filename.length > 0 && p.body?.attachmentId) out.push({ id: p.body.attachmentId, filename: p.filename, size: p.body.size || 0 });
        if (p.parts) for (const c of p.parts) findAttachmentParts(c, out);
        return out;
      }
      // Download + extract text from a message's attachments (PDF/Word/Excel/PPT) so Kiko can reason over them
      async function attachmentsText(payload, msgId, token) {
        const atts = findAttachmentParts(payload);
        if (!atts.length) return '';
        let mod; try { mod = await import('./lib/extract-buffer.js'); } catch (e) { return `\n\n[Attachments present but extractor unavailable: ${e.message}]`; }
        const chunks = [];
        for (const a of atts.slice(0, 4)) {
          if (!mod.isExtractable(a.filename)) { chunks.push(`[ATTACHMENT: ${a.filename} \u2014 not readable as text]`); continue; }
          if (a.size > 12 * 1024 * 1024) { chunks.push(`[ATTACHMENT: ${a.filename} \u2014 too large (${Math.round(a.size / 1048576)}MB) to read]`); continue; }
          try {
            const att = await gfetch(token, `/messages/${msgId}/attachments/${a.id}`);
            if (!att?.data) { chunks.push(`[ATTACHMENT: ${a.filename} \u2014 could not download]`); continue; }
            const txt = await mod.extractTextFromBuffer(Buffer.from(att.data, 'base64url'), a.filename, 6000);
            chunks.push(`[ATTACHMENT: ${a.filename}]\n${txt || '(no extractable text found)'}`);
          } catch (e) { chunks.push(`[ATTACHMENT: ${a.filename} \u2014 could not read: ${e.message}]`); }
        }
        return chunks.length ? `\n\n--- ATTACHMENTS (extracted) ---\n${chunks.join('\n\n')}` : '';
      }

      // Build account list based on permissions — parallel token refresh
      const teamEmails = isSuperAdmin
        ? (await sbFetch('users?select=email&order=role.asc') || []).map(u => u.email).filter(Boolean)
        : [userEmailAddr];

      const tokenResults = await Promise.all(teamEmails.map(async email => {
        const t = await refreshGmailToken(email);
        return t ? { label: email.split('@')[0], email, token: t } : null;
      }));
      const accounts = tokenResults.filter(Boolean);

      if (!accounts.length) return 'Gmail token refresh failed for all accounts. Try reconnecting Google in Settings → Accounts.';

      if (operation === 'unread' || operation === 'inbox_summary') {
        let results = [];
        for (const acct of accounts) {
          try {
            const list = await gfetch(acct.token, '/messages?q=is:unread&maxResults=8');
            if (!list.messages?.length) continue;
            for (const m of list.messages.slice(0, 5)) {
              const detail = await gfetch(acct.token, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
              const hdrs = detail.payload?.headers || [];
              results.push({ account: acct.label, from: (hdrs.find(h => h.name === 'From')?.value || '?').split('<')[0].trim(), subject: hdrs.find(h => h.name === 'Subject')?.value || '(no subject)', date: hdrs.find(h => h.name === 'Date')?.value || '' });
            }
          } catch (e) { console.log(`[read_email] unread error for ${acct.label}:`, e.message); }
        }
        if (!results.length) return 'No unread emails across checked accounts.';
        return `UNREAD EMAILS (${results.length}):\n${results.map(m => `[${m.account}] ${m.from}: ${m.subject} [${m.date}]`).join('\n')}`;
      }

      if (operation === 'search') {
        const q = query || 'newer_than:7d';
        let allResults = [];
        for (const acct of accounts) {
          try {
            const list = await gfetch(acct.token, `/messages?q=${encodeURIComponent(q)}&maxResults=10`);
            if (!list.messages?.length) continue;
            for (const m of list.messages.slice(0, 6)) {
              const detail = await gfetch(acct.token, `/messages/${m.id}?format=full`);
              const hdrs = detail.payload?.headers || [];
              const body = extractBody(detail.payload) || detail.snippet || '';
              const _atts = findAttachmentParts(detail.payload);
              const _attFlag = _atts.length ? `\n[ATTACHMENTS: ${_atts.map(a => a.filename).join(', ')} \u2014 use read_thread to read their contents]` : '';
              allResults.push({ account: acct.label, from: (hdrs.find(h => h.name === 'From')?.value || '?').split('<')[0].trim(), to: hdrs.find(h => h.name === 'To')?.value || '', subject: hdrs.find(h => h.name === 'Subject')?.value || '(no subject)', date: hdrs.find(h => h.name === 'Date')?.value || '', body: body.slice(0, 1500) + _attFlag, threadId: detail.threadId });
            }
          } catch (e) { console.log(`[read_email] search error for ${acct.label}:`, e.message); }
        }
        if (!allResults.length) return `No emails found for: "${q}" across ${accounts.length} account(s). Try a different search query.`;
        return `EMAIL SEARCH "${q}" — ${allResults.length} results across ${accounts.length} account(s):\n\n${allResults.map(m => `[${m.account.toUpperCase()}] ${m.from} → ${m.to?.split('<')[0]?.trim() || '?'}\nSubject: ${m.subject} [${m.date}]\nThread: ${m.threadId}\n${m.body}\n`).join('\n---\n')}`;
      }

      if (operation === 'read_thread') {
        const threadId = query;
        if (!threadId) return 'Provide a threadId from a previous search result.';
        for (const acct of accounts) {
          try {
            const thread = await gfetch(acct.token, `/threads/${threadId}?format=full`);
            if (thread.messages?.length) {
              const msgs = [];
              for (const m of thread.messages) {
                const hdrs = m.payload?.headers || [];
                const body = extractBody(m.payload) || m.snippet || '';
                const attText = await attachmentsText(m.payload, m.id, acct.token);
                msgs.push({ from: hdrs.find(h => h.name === 'From')?.value || '?', to: hdrs.find(h => h.name === 'To')?.value || '', date: hdrs.find(h => h.name === 'Date')?.value || '', subject: hdrs.find(h => h.name === 'Subject')?.value || '', body: body.slice(0, 3000) + attText });
              }
              return `FULL THREAD (${msgs.length} messages, ${acct.label}'s inbox):\n\n${msgs.map(m => `FROM: ${m.from}\nTO: ${m.to}\nDATE: ${m.date}\nSUBJECT: ${m.subject}\n\n${m.body}\n`).join('\n═══════════════════════════════\n')}`;
            }
          } catch {}
        }
        return 'Thread not found.';
      }

      return 'Specify operation: unread, inbox_summary, search, or read_thread.';
    } catch (e) { return `Email access error: ${e.message}`; }
  }

  // ── Calendar tool (uses our own Google Calendar API, not MCP) ──
  if (name === 'read_calendar') {
    const { operation, query } = input;
    try {
      const { getGoogleToken } = await import('./google-token.js');
      const token = await getGoogleToken(userEmail);
      const GCAL = 'https://www.googleapis.com/calendar/v3/calendars/primary';
      const gcfetch = (path) => fetch(`${GCAL}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

      // Handle create_event before fetching events
      if (operation === 'create_event') {
        try {
          const params = typeof query === 'string' ? JSON.parse(query) : (query || {});
          const { title, start, end, description, location, attendees } = params;
          if (!title || !start) return 'Error: title and start required. Example: {"title":"Meeting","start":"2026-04-18T14:00:00"}';
          const event = {
            summary: title,
            start: start.includes('T') ? { dateTime: start, timeZone: 'Europe/London' } : { date: start },
            end: end ? (end.includes('T') ? { dateTime: end, timeZone: 'Europe/London' } : { date: end })
              : start.includes('T') ? { dateTime: new Date(new Date(start).getTime() + 30 * 60000).toISOString(), timeZone: 'Europe/London' } : { date: start },
          };
          if (description) event.description = description;
          if (location) event.location = location;
          if (attendees?.length) event.attendees = attendees.map(a => typeof a === 'string' ? { email: a } : a);
          const created = await fetch(`${GCAL}/events`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }).then(r => r.json());
          if (created.error) return `Failed: ${created.error.message}`;
          const evStart = created.start?.dateTime ? new Date(created.start.dateTime).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : created.start?.date;
          return `✓ Event created: "${created.summary}" on ${evStart}${created.htmlLink ? '\nLink: ' + created.htmlLink : ''}`;
        } catch (parseErr) {
          return `Error: ${parseErr.message}. Pass query as JSON: {"title":"...", "start":"2026-04-18T14:00:00"}`;
        }
      }

      const now = new Date();
      let timeMin, timeMax;

      if (operation === 'today') {
        timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      } else if (operation === 'upcoming' || operation === 'free_slots') {
        timeMin = now.toISOString();
        timeMax = new Date(now.getTime() + 7 * 86400000).toISOString();
      } else {
        timeMin = now.toISOString();
        timeMax = new Date(now.getTime() + 30 * 86400000).toISOString();
      }

      const events = await gcfetch(`/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=20&singleEvents=true&orderBy=startTime`);

      if (!events.items?.length) return operation === 'today' ? 'No events today. Calendar is clear.' : 'No upcoming events in the next 7 days.';

      if (operation === 'free_slots') {
        // Calculate free time between events
        const busy = events.items.filter(e => e.start?.dateTime).map(e => ({
          start: new Date(e.start.dateTime), end: new Date(e.end.dateTime), title: e.summary || '?',
        }));
        let out = `BUSY TIMES (next 7 days):\n`;
        for (const b of busy) {
          out += `• ${b.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${b.start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}-${b.end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: ${b.title}\n`;
        }
        return out;
      }

      let out = operation === 'today' ? `TODAY'S CALENDAR:\n` : `UPCOMING EVENTS:\n`;
      for (const e of events.items) {
        const start = e.start?.dateTime ? new Date(e.start.dateTime) : null;
        const day = start ? start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : (e.start?.date || '?');
        const time = start ? start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'All day';
        out += `• ${day} ${time}: ${e.summary || '(no title)'}${e.location ? ' @ ' + e.location : ''}\n`;
      }

      return out;
    } catch (e) {
      if (e.message?.includes('No Google token') || e.message?.includes('refresh failed')) {
        return `Calendar not connected. Sunny needs to connect Google in Settings: https://kiko.vanhawke.agency/api/google-auth?email=${userEmail}`;
      }
      return `Calendar error: ${e.message}`;
    }
  }

  // ── LinkedIn Tools ──
  // find_linkedin_url uses Hetzner Playwright backend (proven working) — NOT voyager
  if (name === 'find_linkedin_url') {
    try {
      const prospects = input.prospects || [];
      if (!prospects.length) return { error: 'No prospects provided' };
      
      // For small batches (1-5), do inline search via Hetzner
      const HETZNER = 'https://api.vanhawke.agency';
      const SECRET = process.env.KIKO_WORKER_SECRET || 'kiko-hetzner-2026-vanhawke';
      
      // Insert prospects as temporary enrollments to trigger enrichment, or call endpoint directly
      const results = [];
      const batchSize = Math.min(prospects.length, 20);
      
      // Call the enrichment endpoint which searches LinkedIn via Playwright
      const enrichRes = await fetch(HETZNER + '/api/enrich-linkedin-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRET },
        body: JSON.stringify({ prospects: prospects.slice(0, batchSize) }),
      }).catch(() => null);
      
      if (enrichRes?.ok) {
        const data = await enrichRes.json();
        return { found: data.enriched || 0, failed: data.failed || 0, results: data.results || [] };
      }
      
      // Fallback: construct likely URLs from names (less reliable but instant)
      for (const p of prospects) {
        const slug = p.name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '-');
        results.push({ name: p.name, company: p.company, url: 'https://www.linkedin.com/in/' + slug, confidence: 'low — needs verification' });
      }
      return { found: results.length, results, note: 'Hetzner enrichment unavailable — URLs are best-guesses and need verification' };
    } catch (err) { return { error: err.message }; }
  }

  // find_email uses Hetzner email enrichment endpoint
  if (name === 'find_email') {
    try {
      const resp = await fetch('http://127.0.0.1:3000/api/enrich-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer kiko-hetzner-2026-vanhawke' },
        body: JSON.stringify({ prospects: input.prospects }),
      });
      const data = await resp.json();
      if (!data.ok) return `Email enrichment failed: ${data.error}`;
      const lines = data.results.map(r => r.email ? `${r.name} (${r.company}): ${r.email}` : `${r.name} (${r.company}): NOT FOUND — domain ${r.domain || 'unknown'}`);
      return `Found ${data.found}/${data.total} emails:\n${lines.join('\n')}`;
    } catch (err) { return `Email enrichment error: ${err.message}`; }
  }

  // linkedin_send_invite and linkedin_send_message now route through Hetzner Playwright backend
  if (name === 'linkedin_send_invite' || name === 'linkedin_send_message') {
    try {
      const HETZNER = 'https://api.vanhawke.agency';
      const SECRET = process.env.KIKO_WORKER_SECRET || 'kiko-hetzner-2026-vanhawke';
      const queueItem = {
        contact_name: input.contact_name || 'Unknown',
        company: input.company || '',
        linkedin_url: name === 'linkedin_send_invite' ? input.profile_url : input.profile_url_or_conversation_urn,
        message_type: name === 'linkedin_send_invite' ? 'invite' : 'message',
        message: name === 'linkedin_send_invite' ? (input.message || '') : input.message,
        context: JSON.stringify({ source: 'kiko_tool', sender: 'matt.smith@vanhawke.agency' }),
        status: 'pending',
        priority: 5,
      };
      await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify(queueItem) });
      if (error) return { error: error.message };
      // Trigger immediate processing
      fetch(HETZNER + '/api/linkedin-trigger', { method: 'POST', headers: { 'Authorization': 'Bearer ' + SECRET } }).catch(() => {});
      return { ok: true, status: 'queued', message: `LinkedIn ${name === 'linkedin_send_invite' ? 'invite' : 'message'} queued and will be sent within 60 seconds` };
    } catch (err) { return { error: err.message }; }
  }

  if (name === 'linkedin_search_prospects') {
    try {
      const { linkedinSearch } = await import('./linkedin-client.js');
      const results = await linkedinSearch(input.query, { limit: input.limit || 10 });
      return results.length ? results : 'No LinkedIn profiles found for that search query.';
    } catch (e) { return `LinkedIn search error: ${e.message}`; }
  }
  if (name === 'linkedin_send_invite') {
    try {
      const { linkedinSendInvite } = await import('./linkedin-client.js');
      return await linkedinSendInvite(input.profile_url, input.message || '');
    } catch (e) { return `LinkedIn invite error: ${e.message}`; }
  }
  if (name === 'linkedin_send_message') {
    try {
      const { linkedinSendMessage } = await import('./linkedin-client.js');
      return await linkedinSendMessage(input.profile_url_or_conversation_urn, input.message);
    } catch (e) { return `LinkedIn message error: ${e.message}`; }
  }

  // ── Follow-up Tracking ──
  if (name === 'check_follow_ups') {
    try {
      const status = input.status || 'awaiting_reply';
      const now = new Date().toISOString();
      let query = 'kiko_follow_ups?select=*&order=follow_up_due_at.asc&limit=20';
      if (status === 'overdue') query = `kiko_follow_ups?status=eq.awaiting_reply&follow_up_due_at=lt.${now}&select=*&order=follow_up_due_at.asc&limit=20`;
      else if (status !== 'all') query = `kiko_follow_ups?status=eq.${status}&select=*&order=follow_up_due_at.asc&limit=20`;
      const rows = await sbFetch(query);
      if (!Array.isArray(rows) || !rows.length) return `No follow-ups found with status: ${status}`;
      return rows.map(r => {
        const days = Math.floor((new Date(r.follow_up_due_at) - new Date()) / 86400000);
        const dueLabel = days < 0 ? `OVERDUE by ${Math.abs(days)} days` : days === 0 ? 'DUE TODAY' : `due in ${days} days`;
        return `${r.recipient_name || r.recipient_email} (${r.company || '?'}) — "${r.subject}" | Sent: ${new Date(r.sent_at).toLocaleDateString('en-GB')} | ${dueLabel} | Status: ${r.status}`;
      }).join('\n');
    } catch (e) { return `Error checking follow-ups: ${e.message}`; }
  }

  // ── Scheduled Emails ──
  if (name === 'check_scheduled_emails') {
    try {
      const status = input.status || 'scheduled';
      let query = 'kiko_scheduled_emails?select=*&order=scheduled_for.asc&limit=20';
      if (status !== 'all') query = `kiko_scheduled_emails?status=eq.${status}&select=*&order=scheduled_for.asc&limit=20`;
      const rows = await sbFetch(query);
      if (!Array.isArray(rows) || !rows.length) return `No scheduled emails with status: ${status}`;
      return rows.map(r => `To: ${r.recipient_email} | Subject: "${r.subject}" | From: ${r.sender_email} | Scheduled: ${new Date(r.scheduled_for).toLocaleString('en-GB')} | Status: ${r.status}${r.error ? ` | Error: ${r.error}` : ''}`).join('\n');
    } catch (e) { return `Error checking scheduled emails: ${e.message}`; }
  }

  // ── Campaign Builder (full end-to-end) ──
  if (name === 'build_campaign') {
    try {
      const { category, team, overrides } = input;
      if (!category) return 'Error: category is required (e.g. "legal_ai", "banking", "cybersecurity")';
      const baseUrl = 'http://127.0.0.1:3000';
      
      // Call the build-campaign endpoint directly
      const res = await fetch(`${baseUrl}/api/build-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category.toLowerCase().replace(/\s+/g, '_'), team: team || undefined, overrides: overrides || undefined, user_id: userId }),
        signal: AbortSignal.timeout(240000), // 4 min max
      });
      const data = await res.json();
      
      if (!data.success) return `Campaign build failed: ${data.error || JSON.stringify(data).slice(0, 300)}`;

      // Verify the TOP 8 synchronously — still-in-seat + resolve a real email with confidence
      let shortlist = [];
      try {
        const vr = await fetch(`${baseUrl}/api/verify-campaign-targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: data.sequence_id, shortlist_only: true, shortlist_size: 8, force: true }),
          signal: AbortSignal.timeout(120000),
        });
        const vd = await vr.json();
        if (Array.isArray(vd.shortlist)) shortlist = vd.shortlist;
      } catch (e) { console.warn('[build_campaign] shortlist verify failed:', e?.message); }

      const CONF = { verified: '✅ verified', sourced: '🔎 sourced', inferred: '✱ inferred', unknown: '— no email' };
      const lines = shortlist
        .sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .map(t => `${t.rank}. ${t.name || t.decision_maker_name || '—'} · ${t.title || '—'} · ${t.company || t.company_name}\n     ${t.email || 'no email found'}  (${CONF[t.email_confidence] || t.email_confidence || 'unknown'})`)
        .join('\n');
      const crit = data.criteria || {};
      const critLine = [crit.revenue_min && `revenue ≥ ${crit.revenue_min}`, crit.geography, crit.dm_seniority, Array.isArray(crit.signals) ? crit.signals.join('; ') : crit.signals].filter(Boolean).join(' · ');
      const pipelineNote = data.pipeline_excluded_count
        ? `\n🛡️ Skipped ${data.pipeline_excluded_count} company(ies) already in your pipeline${data.pipeline_excluded_sample?.length ? ` (e.g. ${data.pipeline_excluded_sample.slice(0, 3).join(', ')})` : ''}.`
        : '';
      return `✅ CAMPAIGN BUILT: "${data.sequence_name}" — ${data.team?.name || 'team auto-selected'}, ${data.category?.name || category}\n` +
        (critLine ? `Criteria: ${critLine}\n` : '') +
        `Sourced ${data.sourced_total || 0}, ranked ${data.inserted_count || 0} decision-makers.${pipelineNote}\n\n` +
        `TOP 8 — verified & ready to review:\n${lines || '(shortlist verification returned nothing — review in /campaigns)'}\n\n` +
        `Sequence ID: ${data.sequence_id}\n` +
        `Confidence: ✅ verified (send now) · 🔎 sourced · ✱ inferred (company pattern — sanity-check) · — none found.\n` +
        `Review & launch in /campaigns, or tell me to refine the targeting.`;
    } catch (e) { return `Campaign build error: ${e.message}`; }
  }

  // ── Document Generation (background job) ──
  if (name === 'generate_document') {
    try {
      const { topic, documentType = 'pdf', division = 'agency', purpose = 'report' } = input;
      if (!topic) return 'Error: topic is required';
      // Queue as background job — returns immediately, processor handles generation
      const jobId = crypto.randomUUID();
      await sbFetch('kiko_background_jobs', { method: 'POST', body: JSON.stringify({
        id: jobId, user_id: userId, job_type: 'generate_document', status: 'queued',
        title: `Generate ${documentType === 'pptx' ? 'presentation' : 'report'}: ${topic}`,
        params: { topic, documentType, division, purpose },
        queued_at: new Date().toISOString(),
      }) });
      return `📄 Document queued for generation.\n\n**Topic:** ${topic}\n**Type:** ${documentType === 'pptx' ? 'PowerPoint Presentation' : 'Branded Report'}\n**Division:** ${division}\n\nI've started generating this in the background. It typically takes 60-90 seconds. You'll see a notification when it's ready — the download link will appear in your alerts. You can keep chatting in the meantime.`;
    } catch (e) { return `Error: ${e.message}`; }
  }

  // ── Relationship Intelligence (handler) ──
  if (name === 'query_relationships') {
    try {
      const q = (input.query || '').toLowerCase();
      const rows = await sbFetch(`kiko_relationships?or=(contact_email.ilike.*${encodeURIComponent(q)}*,contact_name.ilike.*${encodeURIComponent(q)}*,company.ilike.*${encodeURIComponent(q)}*,notes.ilike.*${encodeURIComponent(q)}*)&user_id=eq.${userId}&select=*&order=last_interaction.desc&limit=10`);
      if (!Array.isArray(rows) || !rows.length) return `No relationships found matching "${input.query}"`;
      return rows.map(r => `${r.contact_name || r.contact_email} (${r.company || '?'}) — Strength: ${r.strength || '?'}/10 | Last interaction: ${r.last_interaction ? new Date(r.last_interaction).toLocaleDateString('en-GB') : 'unknown'} | ${r.notes || ''}`).join('\n');
    } catch (e) { return `Error: ${e.message}`; }
  }

  // ── Thought Journal ──
  if (name === 'query_thought_journal') {
    try {
      const q = (input.query || '').toLowerCase();
      const rows = await sbFetch(`kiko_thought_journal?content=ilike.*${encodeURIComponent(q)}*&select=content,context,created_at&order=created_at.desc&limit=8`);
      if (!Array.isArray(rows) || !rows.length) return `No thought journal entries matching "${input.query}"`;
      return rows.map(r => `[${new Date(r.created_at).toLocaleDateString('en-GB')}] ${r.context ? `(${r.context}) ` : ''}${r.content?.slice(0, 300)}`).join('\n\n');
    } catch (e) { return `Error: ${e.message}`; }
  }

  // ── Conversation Insights ──
  if (name === 'query_conversation_insights') {
    try {
      const q = (input.query || '').toLowerCase();
      const rows = await sbFetch(`kiko_conversation_insights?or=(summary.ilike.*${encodeURIComponent(q)}*,entities_discussed.cs.{${encodeURIComponent(q)}},key_facts.cs.{${encodeURIComponent(q)}})&user_id=eq.${userId}&select=summary,key_facts,decisions_made,open_threads,entities_discussed,created_at&order=created_at.desc&limit=8`);
      if (!Array.isArray(rows) || !rows.length) return `No conversation insights found matching "${input.query}"`;
      return rows.map(r => {
        let out = `[${new Date(r.created_at).toLocaleDateString('en-GB')}]`;
        if (r.summary) out += ` ${r.summary}`;
        if (r.decisions_made?.length) out += `\n  Decisions: ${r.decisions_made.join('; ')}`;
        if (r.open_threads?.length) out += `\n  Open: ${r.open_threads.join('; ')}`;
        return out;
      }).join('\n\n');
    } catch (e) { return `Error: ${e.message}`; }
  }


  if (name === 'deep_research') {
    const { deepResearch } = await import('./agents/research.js');
    const result = await deepResearch(input.brief, userId);
    return JSON.stringify(result);
  }

  return { error: `Unknown tool: ${name}` };
}

// Lemlist code REMOVED — Lemlist cancelled, all campaigns run through native engine

// ── Self-Monitor Handler ──
async function handleSelfMonitor(operation, params = {}) {
  try {
    if (operation === 'health_check') {
      const [errors24h, lastTriage, lastLearning, lastInsight, taskCount, dealCount] = await Promise.all([
        sbFetch('kiko_error_log?created_at=gt.' + new Date(Date.now() - 86400000).toISOString() + '&select=component,severity&limit=50').catch(() => []),
        sbFetch('kiko_inbox_triage?order=triage_date.desc&limit=1&select=triage_date,summary').catch(() => []),
        sbFetch('kiko_learning_log?order=created_at.desc&limit=1&select=created_at,category').catch(() => []),
        sbFetch('kiko_conversation_insights?order=created_at.desc&limit=1&select=created_at').catch(() => []),
        sbFetch('tasks?select=data&limit=100').catch(() => []),
        sbFetch('deals?select=data&data->>status=eq.active&limit=100').catch(() => []),
      ]);
      const errorCount = (errors24h || []).length;
      const criticals = (errors24h || []).filter(e => e.severity === 'critical').length;
      const components = [...new Set((errors24h || []).map(e => e.component))];
      let health = errorCount === 0 ? '🟢 HEALTHY' : criticals > 0 ? '🔴 CRITICAL' : errorCount > 10 ? '🟡 DEGRADED' : '🟢 HEALTHY (minor issues)';
      let out = `KIKO SYSTEM HEALTH: ${health}\n\n`;
      out += `Errors (24h): ${errorCount}${criticals ? ` (${criticals} critical)` : ''}\n`;
      if (components.length) out += `Affected: ${components.join(', ')}\n`;
      out += `Active deals: ${(dealCount || []).length}\n`;
      out += `Tasks: ${(taskCount || []).length}\n`;
      out += `Last inbox triage: ${lastTriage?.[0]?.triage_date || 'never'}\n`;
      out += `Last learning: ${lastLearning?.[0]?.created_at ? new Date(lastLearning[0].created_at).toLocaleDateString('en-GB') : 'never'}\n`;
      out += `Last conversation insight: ${lastInsight?.[0]?.created_at ? new Date(lastInsight[0].created_at).toLocaleDateString('en-GB') : 'never'}`;
      return out;
    }
    if (operation === 'recent_errors') {
      const hours = params?.hours || 24;
      const since = new Date(Date.now() - hours * 3600000).toISOString();
      let query = `kiko_error_log?created_at=gt.${since}&order=created_at.desc&limit=20&select=created_at,component,error_message,severity`;
      if (params?.component) query += `&component=eq.${encodeURIComponent(params.component)}`;
      const errors = await sbFetch(query);
      if (!errors?.length) return `No errors in the last ${hours} hours. All systems operational.`;
      let out = `ERRORS (last ${hours}h): ${errors.length} found\n\n`;
      for (const e of errors) {
        out += `[${new Date(e.created_at).toLocaleTimeString('en-GB')}] ${e.severity.toUpperCase()} | ${e.component}: ${e.error_message}\n`;
      }
      return out;
    }
    if (operation === 'cron_status') {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [triage, prep, proactive, news, heartbeats] = await Promise.all([
        sbFetch(`kiko_inbox_triage?triage_date=eq.${today}&limit=1&select=triage_date`).catch(() => []),
        sbFetch(`kiko_meeting_prep?select=created_at&order=created_at.desc&limit=1`).catch(() => []),
        sbFetch(`kiko_alerts?created_at=gt.${today}T00:00:00Z&limit=5&select=created_at,type`).catch(() => []),
        sbFetch(`news_articles?is_processed=eq.true&order=published_at.desc&limit=1&select=published_at`).catch(() => []),
        sbFetch(`kiko_cron_heartbeats?started_at=gt.${weekAgo}&order=started_at.desc&limit=30&select=cron_name,status,started_at,duration_ms,error_message`).catch(() => []),
      ]);
      let out = 'CRON STATUS:\n\n';
      out += `Inbox triage today: ${triage?.length ? '✅ Ran' : '❌ Not run'}\n`;
      out += `Meeting prep: ${prep?.[0]?.created_at ? '✅ Last: ' + new Date(prep[0].created_at).toLocaleDateString('en-GB') : '❌ No data'}\n`;
      out += `Proactive alerts today: ${proactive?.length || 0} alerts\n`;
      out += `News agent: ${news?.[0]?.published_at ? '✅ Last: ' + new Date(news[0].published_at).toLocaleDateString('en-GB') : '❌ No data'}\n`;
      if (heartbeats?.length) {
        const byCron = {};
        for (const h of heartbeats) { if (!byCron[h.cron_name]) byCron[h.cron_name] = h; }
        out += `\nHEARTBEATS (last 7 days):\n`;
        for (const [name, h] of Object.entries(byCron)) {
          const status = h.status === 'finished' ? '✅' : h.status === 'error' ? '❌' : '⏳';
          out += `${status} ${name}: ${new Date(h.started_at).toLocaleDateString('en-GB')} ${new Date(h.started_at).toLocaleTimeString('en-GB')}${h.duration_ms ? ` (${h.duration_ms}ms)` : ''}${h.error_message ? ` ERR: ${h.error_message}` : ''}\n`;
        }
      } else {
        out += `\nNo cron heartbeats recorded yet (heartbeat tracking newly enabled).`;
      }
      return out;
    }
    if (operation === 'agent_stats') {
      const [outputs, errors] = await Promise.all([
        sbFetch('kiko_output_tracking?order=created_at.desc&limit=100&select=agent,intent,created_at').catch(() => []),
        sbFetch('kiko_error_log?order=created_at.desc&limit=50&select=component,created_at').catch(() => []),
      ]);
      const agentCounts = {};
      for (const o of (outputs || [])) { agentCounts[o.agent] = (agentCounts[o.agent] || 0) + 1; }
      const errorCounts = {};
      for (const e of (errors || [])) { errorCounts[e.component] = (errorCounts[e.component] || 0) + 1; }
      let out = 'AGENT STATS (recent):\n\n';
      for (const [agent, count] of Object.entries(agentCounts).sort((a, b) => b[1] - a[1])) {
        const errs = errorCounts[`agent:${agent}`] || 0;
        out += `${agent}: ${count} calls${errs ? ` (${errs} errors)` : ''}\n`;
      }
      if (Object.keys(errorCounts).length) {
        out += '\nERROR COMPONENTS:\n';
        for (const [comp, count] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
          out += `${comp}: ${count} errors\n`;
        }
      }
      return out;
    }
    if (operation === 'run_selfcheck') {
      try {
        const resp = await fetch('http://localhost:3000/api/selfcheck?force=1');
        const data = await resp.json();
        let out = `FULL SYSTEM SELFCHECK: ${data.summary}\n\n`;
        const failures = data.checks.filter(c => c.status !== 'PASS');
        if (failures.length === 0) {
          out += '✅ ALL CHECKS PASSING — system fully operational.';
        } else {
          out += 'ISSUES FOUND:\n';
          for (const f of failures) {
            out += `❌ ${f.name}: expected ${f.expected}, actual=${JSON.stringify(f.actual).slice(0, 100)}\n`;
          }
          out += '\nRECOMMENDED ACTIONS:\n';
          for (const f of failures) {
            if (f.name.includes('email')) out += '• Check sequence-sender cron and outreach queue\n';
            else if (f.name.includes('gmail')) out += '• Verify Gmail OAuth token is valid\n';
            else if (f.name.includes('linkedin')) out += '• LinkedIn cookies may need refreshing via /api/cron-linkedin-keepalive\n';
            else if (f.name.includes('error_budget')) out += '• Review recent errors in kiko_error_log\n';
            else if (f.name.includes('briefing')) out += '• Morning synthesis cron may have failed — check at /api/cron-morning-synthesis\n';
            else out += `• Investigate ${f.name}\n`;
          }
        }
        return out;
      } catch (e) { return `Selfcheck failed: ${e.message}`; }
    }

    return `Unknown self-monitor operation: ${operation}. Available: health_check, recent_errors, cron_status, agent_stats, run_selfcheck`;
  } catch (e) { return `Self-monitor error: ${e.message}`; }
}

// ── Entity Context Helper (used by kiko.js for page-specific context) ──
export async function fetchEntityContext(pageEntity) {
  if (!pageEntity?.type || !pageEntity?.id) return '';
  try {
    if (pageEntity.type === 'contact') {
      const rows = await sbFetch(`contacts?id=eq.${pageEntity.id}&select=data&limit=1`);
      if (rows?.[0]?.data) {
        const d = rows[0].data;
        let ctx = `\n\nVIEWING CONTACT: ${d.firstName || ''} ${d.lastName || ''}, ${d.title || '?'} at ${d.company || '?'}. Email: ${d.email || '—'}.`;
        if (d.linkedin) ctx += ' LinkedIn: Yes.';
        ctx += ` Use their email (${d.email || 'not available'}) when drafting.`;
        return ctx;
      }
    } else if (pageEntity.type === 'company') {
      const rows = await sbFetch(`companies?id=eq.${pageEntity.id}&select=data&limit=1`);
      if (rows?.[0]?.data) {
        const d = rows[0].data;
        let ctx = `\n\nVIEWING COMPANY: ${d.name || '?'}. Industry: ${d.industry || '?'}.`;
        if (d.totalFunding) ctx += ` Funding: ${d.totalFunding}.`;
        if (d.employees) ctx += ` Employees: ${d.employees}.`;
        return ctx;
      }
    }
  } catch {}
  return '';
}
