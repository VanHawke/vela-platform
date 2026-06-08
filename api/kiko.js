// kiko-v2.js — Clean rebuild. Zero constraints. ~550 lines.
// request → auth → context → Opus stream → tools → memory save
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, DIGEST_BRIEF_TOOL, executeTool, fetchEntityContext, sbFetch, logError } from './kiko-tools.js';
import loadLeanKnowledge from './kiko-self-knowledge-lean.js';
import { describeScreen } from './agents/screen-reader.js';
import { preProcess } from './reasoning-engine.js';
import { lookupCompany } from './company-lookup.js';
import { callEAAgent } from './agents/ea.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = process.env.KIKO_BRAIN_MODEL || 'claude-opus-4-8';
const COGNITIVE = process.env.KIKO_COGNITIVE_MODEL || 'claude-sonnet-4-20250514';
const UTILITY = process.env.KIKO_UTILITY_MODEL || 'claude-haiku-4-5-20251001';

// ═══ UTILITIES ═══
const userConfigCache = new Map();
async function getUserConfig(email) {
  if (userConfigCache.has(email)) {
    const cached = userConfigCache.get(email);
    if (Date.now() - cached.ts < 300000) return cached.data;
  }
  try {
    const rows = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(email)}&limit=1`);
    if (rows?.[0]) { userConfigCache.set(email, { data: rows[0], ts: Date.now() }); return rows[0]; }
    let altEmail = email;
    if (email.endsWith('@vanhawke.com')) altEmail = email.replace('@vanhawke.com', '@vanhawke.agency');
    else if (email.endsWith('@vanhawke.agency')) altEmail = email.replace('@vanhawke.agency', '@vanhawke.com');
    if (altEmail !== email) {
      const altRows = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(altEmail)}&limit=1`);
      if (altRows?.[0]) { userConfigCache.set(email, { data: altRows[0], ts: Date.now() }); return altRows[0]; }
    }
  } catch {}
  return { user_id: null, email, display_name: email.split('@')[0], role: 'user', company_name: '', job_title: '', location: '', timezone: 'Europe/London', communication_style: 'executive', company_description: '' };
}

function sanitizeUnicode(str) {
  if (!str || typeof str !== 'string') return str || '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { result += str[i] + str[i + 1]; i++; }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
    } else { result += str[i]; }
  }
  return result;
}

function stripToolXml(raw) {
  if (!raw || typeof raw !== 'string') return { cleaned: raw || '', navigateTo: null };
  let navigateTo = null;
  let out = raw;
  out = out.replace(/<navigate_page>\s*\/?([a-z0-9\-_/]+)\s*<\/navigate_page>/gi, (_m, page) => { if (!navigateTo) navigateTo = page.replace(/^\//, ''); return ''; });
  out = out.replace(/<tool_use>[\s\n]*[a-z][a-z0-9_]*[\s\n]*/gi, '');
  out = out.replace(/<\/?invoke[^>]*>/gi, '').replace(/<\/?parameter[^>]*>/gi, '').replace(/<\/?antml:\w+[^>]*>/gi, '');
  out = out.replace(/<\/?tool_use[^>]*>/gi, '').replace(/<\/?function_call[^>]*>/gi, '');
  out = out.replace(/<([a-z][a-z0-9_]*)>[^<\n]{0,120}<\/\1>/gi, '');
  out = out.replace(/<\/?(navigate_page|ask_kiko|ask_data_agent|ask_ea_agent|ask_strategy_agent|close_voice|fetch_tool|call_tool|partnership_matrix|ask_navigator|ask_deal_agent|ask_negotiation_agent)[^>]*>/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return { cleaned: out, navigateTo };
}

// ═══ LEARNING SYSTEM ═══
const DECISION_TOOLS = ['ask_strategy_agent', 'ask_deal_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];
const INSIGHT_TOOLS = ['ask_strategy_agent', 'ask_negotiation_agent', 'ask_pricing_agent', 'ask_investment_agent'];

async function auditLog(actionType, { userId, userEmail, intent, toolName, entityType, entityId, detail, durationMs } = {}) {
  try { await sbFetch('kiko_audit_log', { method: 'POST', body: JSON.stringify({ user_id: userId || null, user_email: userEmail || null, action_type: actionType, intent: intent || null, tool_name: toolName || null, entity_type: entityType || null, entity_id: entityId || null, detail: (detail || '').slice(0, 500), duration_ms: durationMs || null }) }); } catch {}
}

async function logDecision(toolName, toolInput, toolResult, userMessage, userId) {
  if (!DECISION_TOOLS.includes(toolName)) return;
  try {
    const agent = toolName.replace('ask_', '').replace('_agent', '');
    const entity = toolInput?.company || toolInput?.query || toolInput?.situation || '';
    const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
    await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ category: 'decision', content: `[${agent}] Q: ${(userMessage || '').slice(0, 100)} | A: ${resultStr.slice(0, 400)}`, entity_name: (typeof entity === 'string' ? entity : '').slice(0, 100) || null }) });
  } catch {}
}

async function trackOutput(toolName, intent, userMessage, result, userId, extra = {}) {
  try {
    const agent = toolName ? toolName.replace('ask_', '').replace('_agent', '') : 'general';
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    await sbFetch('kiko_output_tracking', { method: 'POST', body: JSON.stringify({ user_id: userId, agent, intent: intent || 'unknown', user_message: (userMessage || '').slice(0, 150), output_preview: resultStr.slice(0, 300), tools_used: extra.toolsUsed || [], response_time_ms: extra.responseTimeMs || null }) });
  } catch {}
}

async function journalInsight(toolName, toolInput, toolResult, userMessage, userId) {
  if (!INSIGHT_TOOLS.includes(toolName)) return;
  try {
    const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
    const topic = toolInput?.question?.slice(0, 80) || toolInput?.situation?.slice(0, 80) || (userMessage || '').slice(0, 80);
    await sbFetch('kiko_thought_journal', { method: 'POST', body: JSON.stringify({ user_id: userId, topic, insight: resultStr.slice(0, 500), confidence: 0.7 }) });
  } catch {}
}

async function extractConversationInsights(message, fullResponse, userId) {
  if (!message || !fullResponse || fullResponse.length < 100) return;
  try {
    const extract = await anthropic.messages.create({
      model: MODEL, max_tokens: 300,
      system: 'Extract key facts, decisions, and open threads from this conversation. Return ONLY valid JSON: { "key_facts": ["..."], "decisions_made": ["..."], "open_threads": ["..."], "entities": ["..."] }. Max 3 items per array. If nothing significant, return empty arrays.',
      messages: [{ role: 'user', content: `USER: ${message.slice(0, 300)}\n\nKIKO: ${fullResponse.slice(0, 600)}` }],
    });
    const parsed = JSON.parse((extract.content[0]?.text || '{}').replace(/```json|```/g, '').trim());
    const hasContent = (parsed.key_facts?.length || 0) + (parsed.decisions_made?.length || 0) + (parsed.open_threads?.length || 0);
    if (!hasContent) return;
    await sbFetch('kiko_conversation_insights', { method: 'POST', body: JSON.stringify({ user_id: userId, key_facts: parsed.key_facts || [], decisions_made: parsed.decisions_made || [], open_threads: parsed.open_threads || [], entities_discussed: parsed.entities || [], summary: `${(parsed.key_facts || []).join('; ')}`.slice(0, 200) }) });
    for (const entity of (parsed.entities || []).slice(0, 3)) {
      try {
        const existing = await sbFetch(`kiko_thread_tracker?entity_name=ilike.${encodeURIComponent(entity)}&user_id=eq.${userId}&limit=1`);
        if (existing?.length) {
          await sbFetch(`kiko_thread_tracker?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ discussion_count: (existing[0].discussion_count || 0) + 1, last_discussed_at: new Date().toISOString(), key_decisions: [...(existing[0].key_decisions || []), ...(parsed.decisions_made || [])].slice(-10), open_questions: [...(existing[0].open_questions || []), ...(parsed.open_threads || [])].slice(-10) }) });
        } else {
          await sbFetch('kiko_thread_tracker', { method: 'POST', body: JSON.stringify({ entity_name: entity, entity_type: 'company', user_id: userId, thread_summary: (parsed.key_facts || []).join('; '), key_decisions: parsed.decisions_made || [], open_questions: parsed.open_threads || [] }) });
        }
      } catch {}
    }
  } catch {}
}

async function detectCorrection(message, conversationHistory, userId) {
  if (!message || message.length < 5) return;
  const msgLower = message.toLowerCase().trim();
  const isCorrection = /^(no[,.]?\s|that'?s wrong|actually[,]?\s|incorrect|you'?re wrong|not\s+\w+[,]\s+(it'?s|it is)|don'?t|stop|never\s+(say|do|use)|always\s+(use|say|do)|i said|i told you|i meant)/i.test(msgLower);
  const isPositive = /^(perfect|exactly|great|good|yes|that'?s right|nice|brilliant|spot on|well done|thank you|love it|nailed it|excellent)/i.test(msgLower);
  if (isPositive && conversationHistory.length >= 2) {
    const lastAssistant = conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0];
    if (lastAssistant) { try { await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ category: 'positive_pattern', content: 'Positive feedback: "' + message.slice(0, 100) + '" after: ' + (lastAssistant.content || '').slice(0, 200), source: 'conversation', user_id: userId }) }); } catch {} }
  }
  if (isCorrection) {
    try { await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ user_id: userId, category: 'explicit_correction', content: `User corrected: "${message.slice(0, 300)}"`, user_message: message.slice(0, 200) }) }); } catch {}
    try { await sbFetch('kiko_preferences', { method: 'POST', body: JSON.stringify({ user_id: userId, preference_type: 'correction', preference_key: `correction_${Date.now()}`, preference_value: message.slice(0, 300), source: 'explicit_correction' }) }).catch(() => {}); } catch {}
  }
}

// ═══ MEMORY HANDLER ═══
async function handleMemory(input, userId) {
  const { command, path, file_text, old_str, new_str, insert_line, new_content, view_range } = input;
  const uf = userId ? `&user_id=eq.${userId}` : '';
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
      const JUNK = ['ping_response', 'navigation_pipeline', 'cloudflare', 'brief_snapshot', 'health_check', 'cron_log', 'tool_trace'];
      if (JUNK.some(p => path.toLowerCase().includes(p))) return `Blocked: "${path}" — diagnostic files not allowed in memory.`;
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

// ═══ TOOL LABELS + RATE LIMITER ═══
const TOOL_LABELS = {
  ask_navigator: 'Analysing page context...', ask_deal_agent: 'Searching deals...', crm_search: 'Querying CRM...', campaign_engine: 'Checking campaigns...', pipeline_analytics: 'Analysing pipeline...', knowledge_ops: 'Searching knowledge...', goals_intents: 'Checking goals...',
  ask_outreach_agent: 'Drafting outreach...', ask_document_agent: 'Processing documents...', ask_memory_engine: 'Retrieving past context...', ask_strategy_agent: 'Strategy analysis...', ask_negotiation_agent: 'Negotiation analysis...', ask_category_agent: 'Checking categories...',
  ask_finance_agent: 'Financial analysis...', ask_ea_agent: 'Executive brief...', ask_legal_agent: 'Legal review...', ask_dispute_agent: 'Dispute analysis...', ask_content_agent: 'Generating content...', ask_investment_agent: 'Investment model...', ask_pricing_agent: 'Pricing benchmark...',
  ask_signal_agent: 'Scanning signals...', ask_travel_agent: 'Planning travel...', ask_specialist_agent: 'Specialist analysis...', ask_self_monitor: 'System diagnostics...', navigate_page: 'Navigating...', log_activity: 'Logging...',
  web_search: 'Searching web...', memory: 'Checking memory...', search_conversations: 'Searching history...', trigger_triage: 'Inbox triage...', ask_code_review: 'Code review...', read_email: 'Reading emails...', read_calendar: 'Checking calendar...', manage_knowledge: 'Managing knowledge...',
  ask_data_agent: 'Querying data...', create_email_draft: 'Drafting email...', build_campaign: 'Building campaign...', kiko_self_modify: 'Self-modifying...',
};

const rateLimitMap = new Map();
function checkRateLimit(email) {
  const now = Date.now(); const key = email || 'anon';
  const record = rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - record.windowStart > 60000) { record.count = 1; record.windowStart = now; } else { record.count++; }
  rateLimitMap.set(key, record);
  if (rateLimitMap.size > 100) { for (const [k, v] of rateLimitMap) { if (now - v.windowStart > 60000) rateLimitMap.delete(k); } }
  return record.count <= 30;
}

function buildNativeTools(userConfig, tz) {
  const loc = userConfig?.location || '';
  const city = loc.split(',')[0].trim();
  const country = loc.includes('UK') ? 'GB' : loc.includes('US') ? 'US' : loc.includes('Qatar') ? 'QA' : '';
  const tool = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };
  if (city || country) { tool.user_location = { type: 'approximate' }; if (city) tool.user_location.city = city; if (country) tool.user_location.country = country; if (tz) tool.user_location.timezone = tz; }
  const tools = [tool];
  if (userConfig?.role === 'super_admin') tools.unshift({ type: 'memory_20250818', name: 'memory' });
  return tools;
}

// ═══ SYSTEM PROMPT ═══
const PAGE_ROLES = {
  pipeline: '\nROLE: Sales Strategist. Prioritise by momentum and timing. Flag stale deals.',
  'command-centre': '\nROLE: Operating Partner. Daily command surface: Prospect Replies, Tasks Due, Priority Actions.\nCRITICAL: When user asks about a SPECIFIC entity, focus ENTIRE response on that entity ONLY. General overview ONLY when explicitly asked.\nEmail rules: 2-4 paragraphs max. No em dashes. No AI filler. Write like Bloomberg, not customer service.',
  contacts: '\nROLE: Relationship Manager. Surface connection history and engagement.',
  calendar: '\nROLE: Chief of Staff. Scheduling, availability, meeting prep. Use read_calendar for live data.',
  'sporting-events': '\nROLE: Chief of Staff. F1/FE/MotoGP/WEC race calendar, pre-race outreach windows.',
  'partnership-matrix': '\nROLE: Strategic Advisor. Partnership Detection Engine analysis. Gaps, competitive positioning, recommendations.',
  organisations: '\nROLE: Due Diligence. Profiles, funding, sponsorship readiness.',
  home: '\nROLE: Strategic Partner. Brief on top 3 priorities.',
  campaigns: '\nROLE: Campaign Commander. Outreach sequences via campaign_engine tool.',
  knowledge: '\nROLE: Knowledge Curator. Research domains, key findings, trigger new research.',
};

const SYSTEM_PROMPT = `You are Kiko — the AI executive operating partner for {COMPANY_NAME}.
You work with {USER_NAME}, {USER_TITLE}, based in {USER_LOCATION}. Never ask their name or location.

{DYNAMIC_SELF_KNOWLEDGE}

APPLIED PSYCHOLOGY:
- Commitment-consistency: prospects who clicked 10+ times are invested.
- Authority transfer: borrow authority from known relationships.
- Scarcity framing: "The [Category] position is open. Only [N] remain uncommitted."
- Social proof: "Three Legal AI companies are already in discussions with F1 teams."
- Loss aversion: frame inaction as loss.
- Reciprocity: lead with insight before asking.
- Peak-end rule: close every email with a specific, easy next step.

OUTREACH DOCTRINE:
- 5-touch authority-led. No pricing in early outreach. Board-level positioning. Scarcity by design.
- Emails under 150 words. LinkedIn under 120 words. Subject lines always. USD only. No attachments until reply.
- FORBIDDEN: "hope this finds you well", "just wanted to reach out", "circle back", "touch base", "synergy", "I think", "maybe", "hopefully", "excited to", "please don't hesitate", "I'd love to", "thrilled", "delighted"
- PREFERRED: "at this level", "in practice", "while the category remains open", "long-term positioning"

EMAIL PERMISSIONS: NEVER send without explicit approval. Always draft first.
MEMORY: Save important decisions via manage_knowledge. Reference past conversations.
SELF-CORRECTION: If a tool doesn't fully answer, call another. Complete the task.
TOOL RULE: NEVER type tool-use XML as text. Use the actual tool mechanism.
NAVIGATION: When user says "take me to X", call ask_navigator. Do NOT write XML tags.
ERROR HANDLING: If a tool errors, explain what went wrong and offer to retry.

CURRENT PAGE: {currentPage}`;

// ═══ MAIN HANDLER — CLEAN REBUILD ═══
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(200).end(); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message: rawMessage, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, pageContext = null, attachments = [], deepThink = false, voiceMode = false, timezone = 'Europe/London', draftOnly = false } = req.body;
  const message = sanitizeUnicode(rawMessage);
  if (!message && action !== 'title') return res.status(400).json({ error: 'message required' });
  if (!checkRateLimit(userEmail)) return res.status(429).json({ error: 'Rate limit exceeded.' });

  if (action === 'title') {
    try { const r = await anthropic.messages.create({ model: UTILITY, max_tokens: 20, messages: [{ role: 'user', content: `Generate a 3-5 word title for: "${(message || '').slice(0, 200)}". Reply with ONLY the title.` }] }); return res.status(200).json({ title: r.content?.[0]?.text?.trim() || message?.slice(0, 40) }); }
    catch { return res.status(200).json({ title: message?.slice(0, 40) }); }
  }

  if (draftOnly) {
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
    try {
      const stream = await anthropic.messages.stream({ model: MODEL, max_tokens: 1024, system: 'You are a senior sponsorship executive drafting email replies. Output ONLY the email. Format: Subject: line, To: line, blank line, greeting, body (2-3 short paragraphs), sign-off. No em dashes. No exclamation marks. No AI filler.', messages: [{ role: 'user', content: message }] });
      for await (const event of stream) { if (event.type === 'content_block_delta' && event.delta?.text) res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`); }
      res.write('data: [DONE]\n\n');
    } catch { res.write(`data: ${JSON.stringify({ delta: '[Draft error]' })}\n\n`); res.write('data: [DONE]\n\n'); }
    return res.end();
  }

  // ═══ FULL CONVERSATION PATH — NO GATES, NO RESTRICTIONS ═══
  const queryStartTime = Date.now();
  const userConfig = await getUserConfig(userEmail);
  const userId = userConfig.user_id || crypto.randomUUID();
  const isSuperAdmin = userConfig.role === 'super_admin';
  const isRegistered = !!userConfig.user_id;

  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
  const sseBuffer = [];
  const write = (data) => { sseBuffer.push(data); try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
  const finishResponse = () => { try { res.write('data: [DONE]\n\n'); } catch {} try { res.end(); } catch {} };

  let finished = false;
  const watchdog = setTimeout(async () => {
    if (!finished) {
      const partialResponse = sseBuffer.map(d => d.delta || '').join('');
      if (partialResponse.length > 50) { extractConversationInsights(message, partialResponse, userId).catch(() => {}); }
      finished = true;
      write({ delta: '\n\n⏱ Response taking too long — recovering.' });
      finishResponse();
    }
  }, 45000);

  try {
    write({ toolStatus: 'Connecting...' });
    let conversationSummary = '';
    if (conversationHistory.length > 6) {
      const older = conversationHistory.slice(0, -6).filter(m => m.role === 'user' || m.role === 'assistant');
      if (older.length > 0) { conversationSummary = '\n[EARLIER IN THIS CONVERSATION: ' + older.map(m => `${m.role}: ${(m.content || '').slice(0, 80)}`).join(' | ') + ']'; }
    }
    const recentMessages = conversationHistory.slice(-6);

    // ═══ CONTEXT LOADING — ALWAYS FULL, NO GATES ═══
    const orgIdResult = isRegistered ? await sbFetch(`organization_members?user_id=eq.${userId}&select=organization_id&limit=1`).catch(() => []) : [];
    const orgId = orgIdResult?.[0]?.organization_id || null;

    const [entityContext, selfKnowledge, coreBibleResult, orgBibleResult, userBibleResult, knowledgeBaseResult, learnedRulesResult, preferencesResult, goalsResult, intentsResult, draftActionsResult] = await Promise.all([
      fetchEntityContext(pageEntity),
      loadLeanKnowledge(userId).catch(() => ''),
      sbFetch('kiko_core_bible?select=content&order=version.desc&limit=1').catch(() => []),
      orgId ? sbFetch(`org_bibles?organization_id=eq.${orgId}&select=content&limit=1`).catch(() => []) : Promise.resolve([]),
      isRegistered ? sbFetch(`user_bibles?user_id=eq.${userId}&select=content&limit=1`).catch(() => []) : Promise.resolve([]),
      sbFetch('kiko_knowledge?select=domain,content,researched_at,source&order=researched_at.desc&limit=100').catch(() => []),
      sbFetch(`kiko_learned_rules?active=eq.true&select=rule_text,category,weight&order=weight.desc&limit=15`).catch(() => []),
      sbFetch(`kiko_preferences?select=category,preference,confidence&order=confidence.desc&limit=15`).catch(() => []),
      sbFetch(`kiko_goals?user_id=eq.${userId}&status=eq.active&select=title,priority,description,next_action,due_date&order=priority.desc&limit=10`).catch(() => []),
      sbFetch(`kiko_intents?user_id=eq.${userId}&status=in.(active,overdue)&select=title,description,priority,status,due_date,next_action&order=priority.desc&limit=10`).catch(() => []),
      sbFetch(`kiko_draft_actions?status=eq.pending&select=action_type,entity_name,summary,created_at&order=created_at.desc&limit=5`).catch(() => []),
    ]);

    const knowledgeBase = (() => {
      const byDomain = new Map();
      for (const k of (knowledgeBaseResult || []).filter(k => k.content)) { if (!byDomain.has(k.domain)) byDomain.set(k.domain, k); }
      const msgLower = (message || '').toLowerCase();
      const scored = [...byDomain.values()].map(k => {
        let score = 0;
        for (const w of k.domain.replace(/-/g, ' ').split(' ')) { if (w.length > 2 && msgLower.includes(w)) score += 3; }
        return { ...k, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 5);
      return top.map(k => {
        const content = k.score > 0 ? k.content : k.content.slice(0, 500);
        return `[${k.domain}] ${content}`;
      }).join('\n\n');
    })();

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { timeZone: timezone || 'Europe/London', hour:'2-digit', minute:'2-digit' });
    const pageRole = PAGE_ROLES[currentPage] || '';
    const coreBible = coreBibleResult?.[0]?.content || '';
    const orgBible = orgBibleResult?.[0]?.content || '';
    const userBible = userBibleResult?.[0]?.content || '';

    let systemPrompt = SYSTEM_PROMPT
      .replace('{COMPANY_NAME}', userConfig.company_name || 'Van Hawke Group')
      .replace('{USER_NAME}', userConfig.display_name || 'Sunny')
      .replace('{USER_TITLE}', userConfig.job_title || 'CEO')
      .replace('{USER_LOCATION}', userConfig.location || 'Doha')
      .replace('{DYNAMIC_SELF_KNOWLEDGE}', selfKnowledge || '')
      .replace('{currentPage}', currentPage || 'home');

    systemPrompt += `\nDate: ${dateStr}, ${timeStr} UK${pageRole}`;
    if (entityContext) systemPrompt += `\n\n[ENTITY CONTEXT]\n${entityContext}`;
    if (conversationSummary) systemPrompt += conversationSummary;
    if (coreBible) systemPrompt += `\n\n[OPERATIONAL DOCTRINE]\n${coreBible.slice(0, 3000)}`;
    if (orgBible) systemPrompt += `\n\n[ORG KNOWLEDGE]\n${orgBible.slice(0, 2000)}`;
    if (userBible) systemPrompt += `\n\n[PERSONAL KNOWLEDGE]\n${userBible.slice(0, 2000)}`;
    if (knowledgeBase) systemPrompt += `\n\n[RESEARCH INTELLIGENCE]\n${knowledgeBase.slice(0, 4000)}`;
    if (learnedRulesResult?.length) systemPrompt += `\n\n[LEARNED RULES]\n${learnedRulesResult.map(r => `- ${r.rule_text} (${r.category}, weight:${r.weight})`).join('\n')}`;
    if (preferencesResult?.length) systemPrompt += `\n\n[USER PREFERENCES]\n${preferencesResult.map(p => `- ${p.category}: ${p.preference}`).join('\n')}`;
    if (goalsResult?.length) systemPrompt += `\n\n[ACTIVE GOALS]\n${goalsResult.map(g => `- ${g.title} [${g.priority}] ${g.next_action || ''}`).join('\n')}`;
    if (intentsResult?.length) systemPrompt += `\n\n[ACTIVE INTENTS]\n${intentsResult.map(i => `- ${i.title} [${i.status}/${i.priority}] due:${i.due_date || 'none'} next:${i.next_action || ''}`).join('\n')}`;
    if (draftActionsResult?.length) systemPrompt += `\n\n[PENDING DRAFT ACTIONS]\n${draftActionsResult.map(d => `- ${d.action_type}: ${d.entity_name} — ${d.summary}`).join('\n')}`;

    const systemCached = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];

    // ═══ BUILD TOOLS — ALWAYS FULL, NEVER FILTERED ═══
    const nativeTools = buildNativeTools(userConfig, timezone);
    const allTools = [...nativeTools, ...TOOL_DEFINITIONS, DIGEST_BRIEF_TOOL];
    const toolsWithCache = [...allTools];
    if (toolsWithCache.length > 0) { const last = { ...toolsWithCache[toolsWithCache.length - 1] }; last.cache_control = { type: 'ephemeral' }; toolsWithCache[toolsWithCache.length - 1] = last; }

    const messages = [...recentMessages, { role: 'user', content: message }];
    if (attachments?.length) {
      const contentParts = [{ type: 'text', text: message }];
      for (const att of attachments) {
        if (att.type === 'image' && att.data) contentParts.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType || 'image/png', data: att.data } });
        if (att.type === 'document' && att.data) contentParts.push({ type: 'document', source: { type: 'base64', media_type: att.mediaType || 'application/pdf', data: att.data } });
      }
      messages[messages.length - 1] = { role: 'user', content: contentParts };
    }

    if (pageContext?.elements?.length && currentPage !== 'home') {
      const screenDesc = describeScreen(pageContext);
      if (screenDesc) messages[messages.length - 1] = { role: 'user', content: `[SCREEN CONTEXT: ${screenDesc}]\n\n${message}` };
    }

    // ═══ STREAM — ALWAYS OPUS, FULL TOOLS, NO MODEL SWITCHING ═══
    const needsDeepThink = isSuperAdmin && (deepThink || (message && ['analyse', 'analyze', 'strategy', 'evaluate', 'compare', 'assess', 'deep dive', 'think through', 'review the', 'what should'].some(t => message.toLowerCase().includes(t))));
    const params = { model: MODEL, max_tokens: needsDeepThink ? 32000 : 16384, system: systemCached, messages, tools: toolsWithCache };
    if (needsDeepThink) { params.thinking = { type: 'enabled', budget_tokens: 30000 }; write({ toolStatus: 'Deep analysis...' }); }

    async function streamAndCapture(streamParams) {
      const s = isSuperAdmin ? anthropic.beta.messages.stream(streamParams) : anthropic.messages.stream(streamParams);
      let xmlBuf = '';
      for await (const event of s) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          xmlBuf += event.delta.text;
          if (!xmlBuf.includes('<') || xmlBuf.includes('>')) {
            const { cleaned, navigateTo } = stripToolXml(xmlBuf);
            if (navigateTo) write({ navigate: navigateTo });
            if (cleaned) write({ delta: cleaned });
            xmlBuf = '';
          }
        }
      }
      if (xmlBuf) { const { cleaned, navigateTo } = stripToolXml(xmlBuf); if (navigateTo) write({ navigate: navigateTo }); if (cleaned) write({ delta: cleaned }); }
      return await s.finalMessage();
    }

    let response = await streamAndCapture(params);

    // ═══ TOOL ROUND LOOP ═══
    let toolRounds = 0;
    const maxRounds = voiceMode ? 3 : 5;
    const toolsUsed = [];

    while (response.stop_reason === 'tool_use' && toolRounds < maxRounds) {
      toolRounds++;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        write({ toolStatus: TOOL_LABELS[block.name] || `Running ${block.name}...` });
        console.log(`[KIKO] Tool call START: ${block.name} (round ${toolRounds})`);
        const toolStart = Date.now();
        const heartbeat = setInterval(() => { try { write({ toolStatus: TOOL_LABELS[block.name] || 'Still working...' }) } catch {} }, 8000);

        let result;
        try {
          const toolPromise = block.name === 'memory' ? handleMemory(block.input, userId) : executeTool(block.name, block.input, userEmail, pageContext, userId);
          const LONG_TOOLS = ['ask_negotiation_agent', 'ask_strategy_agent', 'ask_investment_agent', 'ask_dispute_agent', 'crm_search', 'campaign_engine', 'pipeline_analytics', 'build_campaign', 'generate_document', 'ask_content_agent', 'ask_document_agent', 'ask_ea_agent', 'read_email', 'web_search', 'ask_signal_agent', 'knowledge_ops'];
          const timeoutMs = LONG_TOOLS.includes(block.name) ? 30000 : 15000;
          result = await Promise.race([toolPromise, new Promise((_, rej) => setTimeout(() => rej(new Error(`Tool timeout: ${block.name} > ${timeoutMs/1000}s`)), timeoutMs))]);
        } catch (toolErr) {
          const errMsg = toolErr.message || String(toolErr);
          console.log(`[KIKO] Tool FAILED: ${block.name} ${Date.now() - toolStart}ms — ${errMsg.slice(0, 100)}`);
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('invalid_grant') || errMsg.includes('Token has been expired')) {
            result = `AUTH_EXPIRED: Google authentication has expired. Please ask Sunny to reconnect Google in Settings → Accounts.`;
          } else { result = `Tool error (${block.name}): ${errMsg.slice(0, 200)}`; }
        }
        clearInterval(heartbeat);
        const duration = Date.now() - toolStart;
        console.log(`[KIKO] Tool DONE: ${block.name} ${duration}ms`);
        toolsUsed.push(block.name);

        logDecision(block.name, block.input, result, message, userId).catch(() => {});
        journalInsight(block.name, block.input, result, message, userId).catch(() => {});

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultStr.slice(0, 25000) });

        if (block.name === 'navigate_page' || block.name === 'ask_navigator') {
          const page = typeof result === 'string' ? result.match(/navigate[_\s]?(?:to\s+)?\/?([\w-]+)/i)?.[1] : null;
          if (page) write({ navigate: page });
        }
      }

      const nextMessages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults }];
      const nextParams = { model: MODEL, max_tokens: 16384, system: systemCached, messages: nextMessages, tools: toolsWithCache };
      // Ensure paragraph break between tool round output and next response
      write({ delta: '\n\n' });
      response = await streamAndCapture(nextParams);
    }

    const fullResponse = sseBuffer.filter(d => d.delta).map(d => d.delta).join('');
    finished = true;
    clearTimeout(watchdog);
    write({ toolStatus: '' });
    finishResponse();

    // ═══ POST-PROCESSING — FIRE AND FORGET ═══
    const responseTimeMs = Date.now() - queryStartTime;
    auditLog('query', { userId, userEmail, intent: 'general', detail: message?.slice(0, 200), durationMs: responseTimeMs }).catch(() => {});
    detectCorrection(message, conversationHistory, userId).catch(() => {});
    if (toolsUsed.length) trackOutput(toolsUsed[0], 'general', message, fullResponse, userId, { toolsUsed, responseTimeMs }).catch(() => {});
    extractConversationInsights(message, fullResponse, userId).catch(() => {});

    // ═══ MEMORY COMPACTION — OPUS extracts what was learned ═══
    try {
      const compactResp = await anthropic.messages.create({
        model: MODEL, max_tokens: 200,
        system: 'Extract the ONE most important NEW fact from this exchange. Return the fact as a single line. If nothing new or significant, reply "NONE". Focus on: decisions made, deal values, company names, strategic shifts, corrections, or new preferences. Ignore greetings, small talk, and system queries.',
        messages: [{ role: 'user', content: `USER: ${message.slice(0, 200)}\nKIKO: ${fullResponse.slice(0, 400)}` }],
      });
      const extract = (compactResp.content[0]?.text || '').trim();
      if (extract && extract !== 'NONE' && extract.length > 10) {
        const SPECULATION = /(struggles?|procrastinat|tendency|tends?\s+to|pattern\s+of|behaviou?r|may\s+be|might\s+be|appears?\s+to|seems?\s+to|lacks?\s+|suffers?\s+from|overthinking|anxiety|fatigue|addiction)/i;
        const TRANSIENT = /\b(\d+\+?\s*(unread|overdue|stale|pending)|wait(ed|ing)?\s+\d+\s+days?|deadline\s+pressure|tax\s+pressure)/i;
        if (!SPECULATION.test(extract) && !TRANSIENT.test(extract)) {
          const timestamp = new Date().toISOString().split('T')[0];
          try {
            const fs = await import('fs');
            const memPath = '/home/kiko/kiko-worker/api/data/KIKO_MEMORY.md';
            let mem = fs.readFileSync(memPath, 'utf8');
            const insertPoint = mem.indexOf('## OPERATIONAL HEALTH');
            if (insertPoint > 0) {
              mem = mem.slice(0, insertPoint) + `- ${timestamp}: ${extract.replace(/\n/g, '; ')}\n` + mem.slice(insertPoint);
            } else {
              mem += `\n- ${timestamp}: ${extract.replace(/\n/g, '; ')}`;
              console.warn('[Memory] No ## OPERATIONAL HEALTH marker — appended to end');
            }
            fs.writeFileSync(memPath, mem, 'utf8');
          } catch (fsErr) { console.warn('[Memory] File save failed:', fsErr.message); }
        }
      }
    } catch (compactErr) { console.warn('[Memory] Compaction failed:', compactErr.message); }

    // ═══ SELF-EVALUATION — OPUS rates its own response ═══
    try {
      const evalResp = await anthropic.messages.create({
        model: MODEL, max_tokens: 300,
        messages: [{ role: 'user', content: `Rate this AI response. User asked: "${(message || '').slice(0, 200)}" AI responded: "${fullResponse.slice(0, 300)}". Return JSON only: {"quality": 1-10, "improvement": "one sentence", "pattern": "one rule for future"}. Be harsh.` }],
      });
      const evalRaw = (evalResp.content[0]?.text || '').replace(/```json|```/g, '').trim();
      try {
        const evalParsed = JSON.parse(evalRaw);
        if (evalParsed.quality && evalParsed.pattern) {
          await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({ category: 'self_evaluation', content: `Quality: ${evalParsed.quality}/10. Pattern: ${evalParsed.pattern}. Improvement: ${evalParsed.improvement}`, source: 'self_eval', user_id: userId }) }).catch(() => {});
        }
      } catch {}
    } catch {}

  } catch (handlerErr) {
    console.error('[KIKO] Handler error:', handlerErr.message || handlerErr);
    finished = true; clearTimeout(watchdog);
    write({ delta: `\n\nSomething went wrong: ${(handlerErr.message || '').slice(0, 100)}` });
    finishResponse();
  }
}
