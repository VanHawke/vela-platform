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
  {
    name: 'ask_data_agent',
    description: 'CRM reads + analytics. Use for: searching contacts/companies/deals, entity details, pipeline stats, stale contacts, email analytics, outreach intelligence, news, partnership matrix, activity feed, deal history, document search, past conversations, learning log, warm path introductions, win/loss analysis.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['search_contacts', 'search_companies', 'search_deals', 'entity_detail', 'alerts', 'email_analytics', 'outreach_intelligence', 'outreach_timing', 'stale_contacts', 'news', 'partnership_matrix', 'pipeline_notifications', 'deal_history', 'activity_feed', 'search_documents', 'past_conversations', 'recent_conversations', 'learning_search', 'learning_save', 'skills', 'bookmark', 'warm_path', 'win_loss', 'thread_history', 'deal_prediction'], description: 'Which data operation to run. warm_path: find connections to a target company. win_loss: analyse deal outcomes and patterns. thread_history: cross-session discussion history for an entity. deal_prediction: score all active deals by closure probability.' },
      params: { type: 'object', description: 'Operation params. Common: query (string), limit (number), company (string), category (string), entity_type (string), name (string), focus (string)' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_outreach_agent',
    description: 'Email drafting + campaigns. Use for: drafting emails, Gmail drafts, follow-ups, recipient style analysis, Lemlist campaigns, adding leads to campaigns, campaign activities.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['draft_email', 'recipient_style', 'generate_followup', 'get_followup_queue', 'lemlist_campaigns', 'lemlist_add_lead', 'lemlist_activities'], description: 'Which outreach operation' },
      params: { type: 'object', description: 'Operation params. draft_email: to, subject, body, cc. recipient_style: email, name. lemlist_add_lead: campaign_id, email, first_name.' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_document_agent',
    description: 'File generation + exports. Use for: creating Word docs, spreadsheets, presentations, CSVs, images (DALL-E), QR codes, reading URLs, exporting pipeline or contacts.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['generate_docx', 'generate_xlsx', 'generate_pptx', 'generate_csv', 'generate_image', 'generate_qr', 'read_url', 'export_pipeline', 'export_contacts'], description: 'Which document operation' },
      params: { type: 'object', description: 'Operation params. generate_docx: filename, content. generate_xlsx: filename, sheets. generate_image: prompt, size. export_pipeline: pipeline.' },
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
    description: 'Capital strategy. Use for: valuation, investor narrative, raise strategy, dilution modelling, due diligence prep. Currently: Van Hawke Maison pre-seed $500K.',
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
    description: 'Specialist domains: website/digital presence, product development (Van Hawke Maison eyewear), IP/licensing. Use for niche questions in these areas.',
    input_schema: { type: 'object', properties: {
      domain: { type: 'string', enum: ['website', 'product_dev', 'ip'], description: 'Which specialist domain.' },
      params: { type: 'object', description: 'question (string), context (string).' },
    }, required: ['domain'] },
  },
  {
    name: 'navigate_page',
    description: 'Direct page navigation. Use as fallback if ask_navigator is unavailable.',
    input_schema: { type: 'object', properties: {
      page: { type: 'string', enum: ['home', 'pipeline', 'contacts', 'organisations', 'command-centre', 'calendar', 'settings', 'partnership-matrix', 'lemlist'], description: 'Page ID' },
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
  {
    name: 'ask_lemlist_live',
    description: 'Live Lemlist data. Use when user asks: campaign stats, open rates, reply rates, lead status in Lemlist, credit balance, warm leads, campaign performance, "how is the Haas campaign doing", "show me Lemlist stats", deliverability, bounced leads, interested leads, LinkedIn sequence status.',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['campaign_stats', 'lead_search', 'lead_detail', 'warm_leads', 'credits', 'signals', 'deliverability'], description: 'campaign_stats: performance metrics for all/specific campaigns. lead_search: find leads by email/name/company. lead_detail: full lead data by email. warm_leads: leads showing intent (opened/clicked/replied). credits: remaining Lemlist credits. signals: recent intent signals. deliverability: email health check.' },
      params: { type: 'object', description: 'campaign_name (string, optional filter), email (string, for lead_detail), query (string, for lead_search), limit (number, default 10).' },
    }, required: ['operation'] },
  },
  {
    name: 'ask_self_monitor',
    description: 'Kiko self-monitoring. Check system health, recent errors, cron job status, agent performance. Use when user asks: "are you working", "what errors happened", "is inbox triage running", "what broke", "system health", "diagnose yourself".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['health_check', 'recent_errors', 'cron_status', 'agent_stats'], description: 'health_check: overall system health. recent_errors: last 24h errors. cron_status: check if crons ran today. agent_stats: agent usage and error rates.' },
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
    name: 'manage_knowledge',
    description: 'Manage Kiko\'s knowledge base AND create new agents. Use to: add a learning source, search knowledge, list sources, trigger learning, save insights, create a new specialist agent, or list custom agents. Use when: user says "learn about X", "add this source", "what do you know about X", "create an agent for Y", "show me your agents".',
    input_schema: { type: 'object', properties: {
      operation: { type: 'string', enum: ['add_source', 'search_knowledge', 'list_sources', 'learn_topic', 'save_insight', 'create_agent', 'list_agents', 'run_agent', 'set_mode', 'get_mode'], description: 'add_source: add URL/document. search_knowledge: search knowledge. list_sources: show sources. learn_topic: queue learning. save_insight: save a fact. create_agent: create dynamic agent. list_agents: show custom agents. run_agent: execute dynamic agent. set_mode: set operational mode (fundraising, race_week, outreach_sprint, deal_closing, product_launch). get_mode: show current mode.' },
      params: { type: 'object', description: 'For add_source: { name, url, category, content }. For search_knowledge: { query }. For list_sources: { category }. For learn_topic: { topic, category }. For save_insight: { insight, entity, category }. For create_agent: { name, display_name, description, system_prompt, data_queries, trigger_keywords, category }. For run_agent: { agent_name, question }.' },
    }, required: ['operation'] },
  },
];

// ── Tool Executor — Routes to agents ──
function agentError(agentName, err) {
  console.error(`[KIKO] ${agentName} FAILED:`, err.message);
  logError(`agent:${agentName.toLowerCase()}`, err.message, '', 'error');
  return `AGENT UNAVAILABLE: ${agentName} failed — ${err.message}. Tell Sunny this agent hit an error. Do NOT attempt to handle the task yourself.`;
}

export async function executeTool(name, input, userEmail = 'sunny@vanhawke.com', pageContext = null) {

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
      const result = await callDealAgent(input.instruction, userEmail);
      if (result.success) {
        const entity = input.instruction?.match(/(?:for|at|with|to)\s+([A-Z][a-zA-Z\s&]+)/)?.[1] || 'unknown';
        autoLogActivity('crm_action', entity.trim(), input.instruction?.slice(0, 200));
      }
      return result.success ? result.result : `Deal Agent failed: ${result.result}`;
    } catch (e) { return agentError('Deal Agent', e); }
  }

  // ── Data Agent ──
  if (name === 'ask_data_agent') {
    try {
      const { callDataAgent } = await import('./agents/data.js');
      return await callDataAgent(input.operation, input.params || {}, userEmail);
    } catch (e) { return agentError('Data Agent', e); }
  }

  // ── Outreach Agent ──
  if (name === 'ask_outreach_agent') {
    try {
      const { callOutreachAgent } = await import('./agents/outreach.js');
      const result = await callOutreachAgent(input.operation, input.params || {}, userEmail);
      const entity = input.params?.company || input.params?.recipient || input.params?.contactName || 'unknown';
      autoLogActivity('outreach', entity, `${input.operation}: ${JSON.stringify(input.params || {}).slice(0, 200)}`);
      return result;
    } catch (e) { return agentError('Outreach Agent', e); }
  }

  // ── Document Agent ──
  if (name === 'ask_document_agent') {
    try {
      const { callDocumentAgent } = await import('./agents/document.js');
      return await callDocumentAgent(input.operation, input.params || {});
    } catch (e) { return agentError('Document Agent', e); }
  }

  // ── Memory Engine ──
  if (name === 'ask_memory_engine') {
    try {
      const { callMemoryEngine } = await import('./agents/memory-engine.js');
      return await callMemoryEngine(input.operation, input.params || {});
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
  if (name === 'navigate_page') {
    const { page, reason } = input;
    return { navigated: true, page, reason: reason || `Opening ${page}` };
  }

  if (name === 'log_activity') {
    const { type, entity_name, description, deal_id } = input;
    try {
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({ type, entity_name, subject: description, deal_id: deal_id || null, status: 'completed', completed_at: new Date().toISOString(), metadata: { logged_by: 'kiko' } }) });
      return `Activity logged: ${type} — ${entity_name}: ${description}`;
    } catch (e) { return `Activity log error: ${e.message}`; }
  }

  // ── Lemlist Live Agent ──
  if (name === 'ask_lemlist_live') {
    try {
      return await executeLemlistLive(input.operation, input.params || {});
    } catch (e) { return agentError('Lemlist Live', e); }
  }

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
          await sbFetch('kiko_knowledge_sources', { method: 'POST', body: JSON.stringify({ name: srcName, type: 'document', category: category || 'general', content: content.slice(0, 50000), active: true }) });
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
        const sources = await sbFetch('kiko_knowledge_sources?active=eq.true&select=name,category,summary,key_facts&order=relevance_score.desc&limit=30');
        const learning = await sbFetch(`kiko_learning_log?category=in.(curriculum,knowledge_source,imported_knowledge)&order=created_at.desc&limit=50&select=content,entity_name,category`);
        let matches = [];
        for (const s of (sources || [])) {
          const text = `${s.name} ${s.summary || ''} ${JSON.stringify(s.key_facts || [])}`.toLowerCase();
          if (text.includes(query)) matches.push({ type: 'source', name: s.name, category: s.category, summary: (s.summary || '').slice(0, 150) });
        }
        for (const l of (learning || [])) {
          if ((l.content || '').toLowerCase().includes(query) || (l.entity_name || '').toLowerCase().includes(query)) {
            matches.push({ type: 'learned', category: l.category, content: l.content.slice(0, 200), entity: l.entity_name });
          }
        }
        if (!matches.length) return `No knowledge found for "${params.query}". I can learn about this — ask me to "learn about ${params.query}".`;
        let out = `KNOWLEDGE SEARCH: "${params.query}" — ${matches.length} results\n\n`;
        for (const m of matches.slice(0, 10)) {
          out += m.type === 'source' ? `📚 [${m.category}] ${m.name}: ${m.summary}\n` : `🧠 [${m.category}] ${m.content}\n`;
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
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app';
        // Trigger the ingestion endpoint with a synthetic source
        await sbFetch('kiko_knowledge_sources', { method: 'POST', body: JSON.stringify({ name: `On-demand: ${topic}`, type: 'topic', category: category || 'general', url: null, content: topic, scrape_frequency: 'once', active: true }) });
        return `Learning topic queued: "${topic}". I'll research this on the next learning cycle, or you can ask me to research it now using web search.`;
      }

      if (operation === 'save_insight') {
        const { insight, entity, category } = params;
        if (!insight) return 'Error: insight text is required';
        await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', category: category || 'conversation_insight', content: insight, entity_name: entity || null }) });
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
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app';
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
      const query = (input.query || '').toLowerCase();
      const limit = input.limit || 5;
      // Search conversations table — messages are jsonb arrays
      const convos = await sbFetch(`conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=50`);
      if (!convos?.length) return 'No past conversations found.';
      // Score conversations by keyword match in messages
      const scored = [];
      for (const c of convos) {
        const msgs = c.messages || [];
        const text = msgs.map(m => (m.content || '')).join(' ').toLowerCase();
        if (text.includes(query)) {
          const matchMsgs = msgs.filter(m => (m.content || '').toLowerCase().includes(query));
          scored.push({
            title: c.title || 'Untitled',
            date: c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '?',
            matches: matchMsgs.length,
            excerpts: matchMsgs.slice(0, 3).map(m => {
              const content = m.content || '';
              const idx = content.toLowerCase().indexOf(query);
              const start = Math.max(0, idx - 60);
              const end = Math.min(content.length, idx + query.length + 60);
              return `[${m.role}]: ...${content.slice(start, end)}...`;
            })
          });
        }
      }
      scored.sort((a, b) => b.matches - a.matches);
      if (!scored.length) return `No conversations found mentioning "${input.query}".`;
      let out = `CONVERSATION SEARCH: "${input.query}" — ${scored.length} conversations found\n\n`;
      for (const s of scored.slice(0, limit)) {
        out += `📅 ${s.date} — ${s.title} (${s.matches} mentions)\n`;
        for (const e of s.excerpts) out += `  ${e}\n`;
        out += '\n';
      }
      return out;
    } catch (e) { return `Conversation search error: ${e.message}`; }
  }

  return { error: `Unknown tool: ${name}` };
}

// ── Lemlist Live API ──
const lemHeaders = () => {
  const key = process.env.LEMLIST_KEY;
  return { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${key}`).toString('base64')}` };
};

async function executeLemlistLive(operation, params = {}) {
  const h = lemHeaders();

  if (operation === 'campaign_stats') {
    const res = await fetch('https://api.lemlist.com/api/campaigns', { headers: h });
    if (!res.ok) return `Lemlist API error: ${res.status}`;
    const campaigns = await res.json();
    const filtered = params.campaign_name 
      ? campaigns.filter(c => c.name?.toLowerCase().includes(params.campaign_name.toLowerCase()))
      : campaigns;
    
    if (!filtered.length) return 'No campaigns found matching that filter.';
    
    let out = `LEMLIST CAMPAIGN STATS (${filtered.length} campaigns):\n\n`;
    for (const c of filtered.slice(0, 10)) {
      const stats = c.stats || {};
      out += `▸ ${c.name}\n  Status: ${c.status || 'unknown'}\n`;
      if (stats.emailsSent) out += `  Sent: ${stats.emailsSent} | Opened: ${stats.emailsOpened || 0} (${stats.emailsSent ? Math.round((stats.emailsOpened||0)/stats.emailsSent*100) : 0}%) | Clicked: ${stats.emailsClicked || 0} | Replied: ${stats.emailsReplied || 0} (${stats.emailsSent ? Math.round((stats.emailsReplied||0)/stats.emailsSent*100) : 0}%)\n`;
      if (stats.emailsBounced) out += `  Bounced: ${stats.emailsBounced}\n`;
      out += '\n';
    }
    return out;
  }

  if (operation === 'lead_search') {
    const query = params.query || params.email || '';
    if (!query) return 'Need a query (email, name, or company) to search leads.';
    const res = await fetch(`https://api.lemlist.com/api/leads?search=${encodeURIComponent(query)}&limit=${params.limit || 10}`, { headers: h });
    if (!res.ok) return `Lemlist API error: ${res.status}`;
    const leads = await res.json();
    if (!leads?.length) return `No leads found for "${query}".`;
    let out = `LEMLIST LEADS (${leads.length} results for "${query}"):\n\n`;
    for (const l of leads) {
      out += `▸ ${l.firstName || ''} ${l.lastName || ''} — ${l.email || 'no email'}\n  Company: ${l.companyName || '—'} | Title: ${l.jobTitle || '—'}\n  Campaign: ${l.campaignName || '—'} | Status: ${l.status || '—'}\n\n`;
    }
    return out;
  }

  if (operation === 'lead_detail') {
    const email = params.email;
    if (!email) return 'Need an email address for lead detail.';
    const res = await fetch(`https://api.lemlist.com/api/leads/${encodeURIComponent(email)}`, { headers: h });
    if (!res.ok) return `Lead not found or API error: ${res.status}`;
    const lead = await res.json();
    let out = `LEMLIST LEAD DETAIL:\n\n`;
    out += `Name: ${lead.firstName || ''} ${lead.lastName || ''}\nEmail: ${lead.email}\n`;
    out += `Company: ${lead.companyName || '—'}\nTitle: ${lead.jobTitle || '—'}\n`;
    out += `Phone: ${lead.phone || '—'}\nLinkedIn: ${lead.linkedinUrl || '—'}\n`;
    out += `Campaign: ${lead.campaignName || '—'}\nStatus: ${lead.status || '—'}\n`;
    if (lead.enrichment) out += `\nEnrichment: ${JSON.stringify(lead.enrichment).slice(0, 500)}`;
    return out;
  }

  if (operation === 'warm_leads') {
    // Get recent activities showing intent
    const types = ['emailsReplied', 'emailsClicked', 'emailsInterested', 'linkedinReplied', 'linkedinInterested'];
    let allWarm = [];
    for (const type of types) {
      try {
        const res = await fetch(`https://api.lemlist.com/api/activities?type=${type}&limit=10`, { headers: h });
        if (res.ok) {
          const acts = await res.json();
          allWarm.push(...(acts || []).map(a => ({ ...a, signalType: type })));
        }
      } catch {}
    }
    if (!allWarm.length) return 'No warm leads detected in recent activity.';
    // Deduplicate by email
    const seen = new Set();
    const unique = allWarm.filter(a => { const k = a.email || a.leadEmail; if (seen.has(k)) return false; seen.add(k); return true; });
    let out = `WARM LEADS (${unique.length} showing intent):\n\n`;
    for (const a of unique.slice(0, 15)) {
      out += `▸ ${a.firstName || ''} ${a.lastName || ''} (${a.email || a.leadEmail || '—'})\n  Signal: ${a.signalType} | Campaign: ${a.campaignName || '—'} | Date: ${a.createdAt?.slice(0,10) || '—'}\n\n`;
    }
    return out;
  }

  if (operation === 'credits') {
    const res = await fetch('https://api.lemlist.com/api/team', { headers: h });
    if (!res.ok) return `Lemlist API error: ${res.status}`;
    const team = await res.json();
    return `LEMLIST CREDITS:\nTeam: ${team.name || 'Van Hawke'}\nCredits remaining: ${team.credits?.remaining ?? team.credits ?? 'unknown'}\nPlan: ${team.plan || 'unknown'}`;
  }

  if (operation === 'signals') {
    // Pull from kiko_alerts (signals already synced by cron/webhook)
    const alerts = await sbFetch(`kiko_alerts?type=eq.intent_signal&order=created_at.desc&limit=${params.limit || 10}`);
    if (!alerts?.length) return 'No intent signals detected recently. Signals flow from Lemlist watchlists via webhook.';
    let out = `INTENT SIGNALS (${alerts.length} recent):\n\n`;
    for (const a of alerts) {
      out += `▸ ${a.title}\n  ${a.detail || ''}\n  Severity: ${a.severity} | Created: ${a.created_at?.slice(0,10) || '—'}\n\n`;
    }
    return out;
  }

  if (operation === 'deliverability') {
    // Check bounce rates across campaigns
    const res = await fetch('https://api.lemlist.com/api/campaigns', { headers: h });
    if (!res.ok) return `Lemlist API error: ${res.status}`;
    const campaigns = await res.json();
    const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused');
    let out = `DELIVERABILITY HEALTH (${active.length} campaigns):\n\n`;
    let totalSent = 0, totalBounced = 0;
    for (const c of active) {
      const s = c.stats || {};
      const sent = s.emailsSent || 0;
      const bounced = s.emailsBounced || 0;
      totalSent += sent; totalBounced += bounced;
      const bounceRate = sent ? Math.round(bounced/sent*100) : 0;
      const status = bounceRate > 5 ? '🔴' : bounceRate > 2 ? '🟡' : '🟢';
      out += `${status} ${c.name}: ${bounceRate}% bounce (${bounced}/${sent})\n`;
    }
    const overall = totalSent ? Math.round(totalBounced/totalSent*100) : 0;
    out += `\nOverall: ${overall}% bounce rate (${totalBounced}/${totalSent} total)`;
    out += overall > 5 ? '\n⚠️ Bounce rate elevated — check sender reputation.' : '\n✅ Deliverability healthy.';
    return out;
  }

  return `Unknown Lemlist operation: ${operation}. Available: campaign_stats, lead_search, lead_detail, warm_leads, credits, signals, deliverability`;
}

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
        sbFetch(`kiko_alerts?created_at=gt.${today}T00:00:00Z&limit=5&select=created_at,alert_type`).catch(() => []),
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
    return `Unknown self-monitor operation: ${operation}. Available: health_check, recent_errors, cron_status, agent_stats`;
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
