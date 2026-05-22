// api/kiko.js — Kiko Prime: Coordinator with Intent Classification (Phase 1)
// Step 1: Haiku classifies intent (~100ms)
// Step 2: Deterministic navigation OR agent dispatch OR full tool loop
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, DIGEST_BRIEF_TOOL, executeTool, fetchEntityContext, sbFetch, logError } from './kiko-tools.js';
import { classifyIntent, INTENT_TO_AGENT } from './agents/intent-classifier.js';
import { generateSelfKnowledge } from './kiko-self-knowledge.js';
import loadLeanKnowledge from './kiko-self-knowledge-lean.js';
import { describeScreen } from './agents/screen-reader.js';
import { preProcess } from './reasoning-engine.js';
import { lookupCompany } from './company-lookup.js';
import { callEAAgent } from './agents/ea.js';


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-6';

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
    // Email domain fallback: vanhawke.com ↔ vanhawke.agency
    let altEmail = email;
    if (email.endsWith('@vanhawke.com')) altEmail = email.replace('@vanhawke.com', '@vanhawke.agency');
    else if (email.endsWith('@vanhawke.agency')) altEmail = email.replace('@vanhawke.agency', '@vanhawke.com');
    if (altEmail !== email) {
      const altRows = await sbFetch(`kiko_user_config?email=eq.${encodeURIComponent(altEmail)}&limit=1`);
      if (altRows?.[0]) {
        const config = altRows[0];
        userConfigCache.set(email, { data: config, ts: Date.now() });
        userConfigCache.set(altEmail, { data: config, ts: Date.now() });
        return config;
      }
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

// Strip leaked tool XML from streaming text deltas + detect navigation tags.
// Returns { cleaned, navigateTo } — if LLM wrote <navigate_page>X</navigate_page>
// as prose instead of calling the tool, we intercept, strip it, and return
// navigateTo so the caller fires write({ navigate: X }).
//
// Handles single-chunk cases. For multi-chunk leaks, the buffer on the caller
// side is responsible (pendingXmlBuffer pattern used in the streaming loops below).
function stripToolXml(raw) {
  if (!raw || typeof raw !== 'string') return { cleaned: raw || '', navigateTo: null };
  let navigateTo = null;
  let out = raw;

  // Intercept <navigate_page>X</navigate_page> — fire navigation, strip from text
  out = out.replace(/<navigate_page>\s*\/?([a-z0-9\-_/]+)\s*<\/navigate_page>/gi, (_m, page) => {
    if (!navigateTo) navigateTo = page.replace(/^\//, '');
    return '';
  });

  // Strip any leaked <tool_use>/<invoke>/<parameter>/<*> blocks
  // CRITICAL: when LLM writes "<tool_use>\n\npartnership_matrix\n\n..." in prose,
  // the orphan tool name on the next line ALSO needs to be stripped, not just the tag.
  // Match <tool_use> + whitespace + a snake_case word on its own line + optional newlines.
  out = out.replace(/<tool_use>[\s\n]*[a-z][a-z0-9_]*[\s\n]*/gi, '');
  out = out.replace(/<\/?invoke[^>]*>/gi, '');
  out = out.replace(/<\/?parameter[^>]*>/gi, '');
  out = out.replace(/<\/?antml:\w+[^>]*>/gi, '');
  out = out.replace(/<\/?tool_use[^>]*>/gi, '');
  out = out.replace(/<\/?function_call[^>]*>/gi, '');
  // Generic tool-ish pattern: <snake_case_name>...</snake_case_name> on a single line
  out = out.replace(/<([a-z][a-z0-9_]*)>[^<\n]{0,120}<\/\1>/gi, '');
  // Stray open/close tags of known tool-ish names
  out = out.replace(/<\/?(navigate_page|ask_kiko|ask_data_agent|ask_ea_agent|ask_strategy_agent|close_voice|fetch_tool|call_tool|partnership_matrix|ask_navigator|ask_deal_agent|ask_strategy_agent|ask_negotiation_agent)[^>]*>/gi, '');
  // Collapse multiple blank lines created by the strips
  out = out.replace(/\n{3,}/g, '\n\n');

  return { cleaned: out, navigateTo };
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
async function trackOutput(toolName, intent, userMessage, result, userId, extra = {}) {
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
        tools_used: extra.toolsUsed || [],
        response_time_ms: extra.responseTimeMs || null,
        confidence_score: extra.confidenceScore || null,
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

    // AUTO-TASK CREATION from open threads and decisions
    const autoTasks = [...(parsed.open_threads || []), ...(parsed.decisions_made || [])].slice(0, 3);
    for (const taskDesc of autoTasks) {
      if (taskDesc && taskDesc.length > 5) {
        try {
          // Check for duplicates (don't create if similar task exists)
          const existing = await sbFetch(`tasks?select=id&data->>notes=ilike.*${encodeURIComponent(taskDesc.slice(0, 30))}*&data->>completed=eq.false&limit=1`);
          if (!existing?.length) {
            const entity = (parsed.entities || [])[0] || '';
            await sbFetch('tasks', { method: 'POST', body: JSON.stringify({
              data: {
                type: 'follow_up',
                contact: entity,
                company: entity,
                notes: taskDesc.slice(0, 200),
                source: 'auto_from_conversation',
                due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
                completed: false,
              },
              user_id: userId,
              created_at: new Date().toISOString(),
            }) });
          }
        } catch {} // Non-blocking
      }
    }
  } catch {} // Non-blocking
}

// ── Correction Learning — detect when user rephrases ──
async function detectCorrection(message, conversationHistory, intent, userId) {
  if (!message || message.length < 5) return;
  const msgLower = message.toLowerCase().trim();
  
  // Detect EXPLICIT corrections: "no", "that's wrong", "actually", "not X, it's Y"
  const correctionPatterns = /^(no[,.]?\s|that'?s wrong|that'?s not right|actually[,]?\s|incorrect|you'?re wrong|wrong[,.]|not\s+\w+[,]\s+(it'?s|it is)|don'?t|stop|never\s+(say|do|use)|always\s+(use|say|do)|i said|i told you|i meant|correct(ion)?:|the correct|please don'?t)/i;
  
  const isExplicitCorrection = correctionPatterns.test(msgLower);
  
  // Also detect rephrases (existing logic)
  let isRephrase = false;
  if (conversationHistory.length >= 3) {
    const lastUserMsg = conversationHistory.filter(m => m.role === 'user').slice(-2, -1)[0];
    if (lastUserMsg?.content) {
      const prev = lastUserMsg.content.toLowerCase().split(/\s+/);
      const curr = msgLower.split(/\s+/);
      if (prev.length >= 3 && curr.length >= 3) {
        const prevSet = new Set(prev);
        const overlap = curr.filter(w => prevSet.has(w) && w.length > 3).length;
        const similarity = overlap / Math.max(prev.length, curr.length);
        isRephrase = similarity > 0.25 && similarity < 0.9;
      }
    }
  }

  if (isExplicitCorrection || isRephrase) {
    try {
      // Save correction to learning log for future sessions
      await sbFetch('kiko_learning_log', {
        method: 'POST', body: JSON.stringify({
          user_id: userId,
          category: isExplicitCorrection ? 'explicit_correction' : 'correction',
          content: `User corrected Kiko: "${message.slice(0, 300)}". Intent: ${intent}. Type: ${isExplicitCorrection ? 'explicit' : 'rephrase'}.`,
          entity_name: null, user_message: message.slice(0, 200),
        })
      });
      
      // Also save as a preference so it persists
      if (isExplicitCorrection) {
        await sbFetch('kiko_preferences', {
          method: 'POST', body: JSON.stringify({
            user_id: userId,
            preference_type: 'correction',
            preference_key: `correction_${Date.now()}`,
            preference_value: message.slice(0, 300),
            source: 'explicit_correction',
          })
        }).catch(() => {});
      }
    } catch {} // Non-blocking
  }
}
// MCP disabled — Anthropic's hosted MCP servers require their own OAuth flow, 
// not our direct Google tokens. Email/calendar access uses our own tools instead.
async function getMcpServers() { return []; }

// ── System Prompt — Slim Coordinator (Phase 5 Context Engineering) ──
// Was 407 lines / 47KB. Now ~80 lines / ~5KB.
// Identity, tools, decision framework, memory all moved to kiko-self-knowledge-lean.js
// Only unique operational rules kept here.

const SYSTEM_PROMPT = `You are Kiko — the AI executive operating partner for {COMPANY_NAME}.
You work with {USER_NAME}, {USER_TITLE}, based in {USER_LOCATION}. Never ask their name or location.

{DYNAMIC_SELF_KNOWLEDGE}

APPLIED PSYCHOLOGY (use in every recommendation and draft):
- Commitment-consistency: prospects who clicked 10+ times are invested. Frame follow-ups as continuations.
- Authority transfer: "Van Hawke advises [Team X] on their commercial strategy" — borrow authority from known relationships.
- Scarcity framing: "The [Category] position is open on [X] teams. Only [N] remain uncommitted for 2026."
- Social proof: "Three Legal AI companies are already in active discussions with F1 teams."
- Loss aversion: Frame inaction as loss. "Every race weekend without a presence is 500M+ eyeballs your competitors own."
- Reciprocity: Lead with insight. Give something valuable before asking for anything.
- Peak-end rule: Close every email with a specific, easy next step — not a vague "let's connect."

OUTREACH DOCTRINE:
- 5-touch authority-led. No pricing in early outreach. No pleasantries. Board-level positioning. Scarcity by design.
- Emails under 150 words. LinkedIn under 120 words. Subject lines always included. USD only. No attachments until reply.
- Never use: "hope this finds you well", "just wanted to reach out", "circle back", "touch base", "synergy", "I think", "maybe", "hopefully", "excited to", "please don't hesitate", "I'd love to", "thrilled", "delighted"
- Use: "at this level", "in practice", "while the category remains open", "long-term positioning"

EMAIL PERMISSIONS:
- NEVER send emails without explicit user approval. Always draft first, present for review.
- When drafting replies, match the greeting style of the existing thread.
- Write like a Bloomberg terminal, not customer service. Every word earns its place.

MEMORY & LEARNING:
- Save important decisions, preferences, and strategies via manage_knowledge.
- When the user corrects you, note it as a preference for future responses.
- Reference past conversations and saved knowledge when relevant.

SELF-CORRECTION:
- If a tool result doesn't fully answer the question, call another tool. Don't stop short.
- If CRM has nothing, search the web. If the draft needs contact details, look them up. Complete the task.

TOOL INVOCATION RULE: NEVER type tool-use XML as text. Use the actual tool mechanism. If you write angle-bracket tags, they will NOT execute.

NAVIGATION RULE: When the user says "take me to X", call the ask_navigator tool. Do NOT write XML tags.

ERROR HANDLING: If a tool returns an error, explain what went wrong. Say "The [tool] hit an error: [details]. Want me to try again?"

CURRENT PAGE: {currentPage}`;

// ── Page Roles (injected per page) ──
const PAGE_ROLES = {
  pipeline: '\nROLE: Sales Strategist. Prioritise by momentum and timing. Flag stale deals.',
  'command-centre': '\nROLE: Operating Partner. This is the daily command surface showing: Prospect Replies, Tasks Due, Priority Actions, Stats bar.\n\nCRITICAL RULE — SELECTED ITEM FOCUS: When the user\'s message is about a SPECIFIC person, company, task, or deal (e.g. "Brief me on this task", "Re-engage — Alex Barnett"), you MUST focus your ENTIRE response on that specific entity ONLY. Do NOT give a general pipeline overview, do NOT mention other deals or tasks, do NOT give a "state of the pipeline" summary. Answer ONLY about the specific entity asked about — their background, the deal/relationship status, what needs to happen next, and a draft email if appropriate.\n\nONLY give a broad pipeline overview when the user explicitly asks "what should I do today", "brief me", "give me an overview", or similar general queries with no specific entity named.\n\nMANDATORY EMAIL WRITING RULES (applies to ALL draft emails on this page):\nYou are writing as a senior F1 sponsorship dealmaker. Match these patterns EXACTLY — learned from 115 real sent emails:\n- Opening: ALWAYS match the greeting style of the existing email thread. If they wrote "Hi Matt" use "Hi [Name]". If the thread uses "Dear", use "Dear". When no thread exists, default to "Dear [First name],".\n- Replies must be SHORT: 2-4 paragraphs max. Each paragraph often a single sentence. Standalone one-line paragraphs for emphasis.\n- Closing: "Kind regards," formal. "Best," warm.\n- NEVER use em dashes (—) or en dashes (–). Use commas, full stops, or semicolons instead.\n- Short declarative statements followed by a longer explanatory clause.\n- ABSOLUTELY FORBIDDEN phrases (never use under any circumstances): "hope this finds you well", "just wanted to reach out", "circle back", "touch base", "synergy", "I think", "maybe", "hopefully", "excited to", "please don\'t hesitate", "don\'t hesitate to reach out", "I\'d love to", "thrilled", "delighted", "genuinely", "genuinely helpful", "genuinely useful", "appreciate the candour", "really appreciate", "the candour is", "that context is"\n- PREFERRED phrases: "at this level", "in practice", "while the category remains open", "long-term positioning", "happy to work around whatever is easiest", "much appreciated"\n- NO AI FILLER. No corporate pleasantries. No warm fuzzy language. Every word earns its place.\n- Write like you are sending from a Bloomberg terminal, not a customer service desk.',
  'outreach-intelligence': '\nROLE: Operating Partner (legacy page tag for /command-centre). Same behaviour as command-centre role.',
  contacts: '\nROLE: Relationship Manager. Surface connection history and engagement scores.',
  calendar: '\nROLE: Chief of Staff. F1/FE race calendar, pre-race outreach windows, schedule optimisation.',
  'partnership-matrix': '\nROLE: Strategic Advisor. Partnership Detection Engine auto-scans F1 team websites daily. Analyse gaps, competitive positioning, new partner announcements, target recommendations.',
  organisations: '\nROLE: Due Diligence. Assess profiles, funding, sponsorship readiness.',
  home: '\nROLE: Strategic Partner. Brief on top 3 priorities across pipeline, email, calendar.',
  campaign: '\nROLE: Campaign Analyst. Use ask_data_agent with operation campaign_overview for campaign stats, open rates, click rates, hot leads, LinkedIn queue status. Never reference Lemlist — all campaigns run through Kiko\'s native outreach engine.',
  campaigns: '\nROLE: Campaign Commander. Manage outreach sequences. Use ask_data_agent operations: campaign_overview (stats), create_campaign (new sequence), start_sequence (enroll contact), sequence_status (check progress), pause_sequence, cancel_sequence. Reference kiko_sequence_conditions for conditional branching (opened/clicked/replied paths).',
  sequences: '\nROLE: Campaign Commander. Same as campaigns role.',
  // linkedin page removed — LinkedIn tools still available via campaigns
  knowledge: '\nROLE: Knowledge Curator. Show what you know. When on the Knowledge page, explain your research domains, when they were last updated, and key findings. You can also trigger new research via web_search and save via manage_knowledge → save_insight.',
};

// ── Native Tools (built per-user in handler) ──
function buildNativeTools(userConfig, userTimezone) {
  const loc = userConfig?.location || '';
  const city = loc.split(',')[0].trim();
  const country = loc.includes('UK') ? 'GB' : loc.includes('US') ? 'US' : '';
  const tz = userTimezone || userConfig?.timezone || 'Europe/London';
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
  ask_data_agent: 'Checking campaign data...',
  search_conversations: 'Searching conversation history...',
  trigger_triage: 'Running inbox triage...',
  ask_code_review: 'Analysing platform code...',
  read_email: 'Reading emails via Gmail...',
  read_calendar: 'Checking your calendar...',
  manage_knowledge: 'Managing knowledge library...',
};

// ── Rate Limiter (in-memory, per Vercel instance) ──
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per user
function checkRateLimit(userEmail) {
  const now = Date.now();
  const key = userEmail || 'anon';
  const record = rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    record.count = 1; record.windowStart = now;
  } else {
    record.count++;
  }
  rateLimitMap.set(key, record);
  // Cleanup old entries every 100 checks
  if (rateLimitMap.size > 100) {
    for (const [k, v] of rateLimitMap) { if (now - v.windowStart > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(k); }
  }
  return record.count <= RATE_LIMIT_MAX;
}

// ── Main Handler ──
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message: rawMessage, action, userEmail = 'sunny@vanhawke.com', conversationHistory = [], currentPage = 'home', pageEntity = null, pageContext = null, attachments = [], deepThink = false, personality = 'executive', voiceMode = false, timezone = 'Europe/London', locale = 'en-GB', draftOnly = false } = req.body;
  const message = sanitizeUnicode(rawMessage);
  if (!message && action !== 'title') return res.status(400).json({ error: 'message required' });

  // Rate limit check
  if (!checkRateLimit(userEmail)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment before sending another message.' });
  }

  // ── Title generation ──
  if (action === 'title') {
    try {
      const titleRes = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 20, messages: [{ role: 'user', content: `Generate a 3-5 word title for: "${(message || '').slice(0, 200)}". Reply with ONLY the title.` }] });
      return res.status(200).json({ title: titleRes.content?.[0]?.text?.trim() || message?.slice(0, 40) });
    } catch { return res.status(200).json({ title: message?.slice(0, 40) }); }
  }

  // ── DRAFT-ONLY FAST PATH — lightweight email generation, no tools, no reasoning ──
  if (draftOnly) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // NOTE: Do NOT set Access-Control-Allow-Origin here — nginx already adds it for /api/kiko
    try {
      const stream = await anthropic.messages.stream({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: `You are a senior sponsorship executive drafting email replies. Rules:
- Output ONLY the email. No commentary, no analysis, no sections, no headers.
- Format: Subject: line, then To: line, then blank line, then greeting, then body, then sign-off.
- Greeting: match their style (Hi/Hello/Dear). If they said "Hi Matt", reply "Hi Matthew" (never "Hi Matt" back).
- Body: 2-3 short paragraphs. Warm but professional. No em dashes (use commas or full stops). No exclamation marks.
- Always end with "Best," on its own line (not "Kind regards" unless replying to a formal email).
- Always include a forward-looking question or next step in the final paragraph.`,
        messages: [{ role: 'user', content: message }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      res.write(`data: ${JSON.stringify({ delta: '[Draft generation error]' })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
    return res.end();
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

  // ── Multi-conversation awareness (Sunny spec 2026-04-12) ──
  // Query the user's other active conversations (last 60 min) so Kiko knows what
  // other threads are happening in parallel. Injected into system prompt as
  // [OTHER ACTIVE THREADS]. Lets Kiko cross-reference ("you asked about Haas in
  // your other chat 10 min ago") and prevents context fragmentation.
  let activeThreadsHint = '';
  if (isRegistered) {
    try {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const otherThreads = await sbFetch(
        `conversations?user_id=eq.${userId}&updated_at=gte.${cutoff}&select=id,title,updated_at,metadata&order=updated_at.desc&limit=5`
      ).catch(() => []);
      if (Array.isArray(otherThreads) && otherThreads.length > 1) {
        // Skip the current thread (most recent) and show the rest
        const others = otherThreads.slice(1, 5);
        if (others.length > 0) {
          activeThreadsHint = '\n\n[OTHER ACTIVE THREADS — last 60 min, cross-reference if relevant]:';
          for (const t of others) {
            const mins = Math.floor((Date.now() - new Date(t.updated_at)) / 60000);
            const source = t.metadata?.source === 'voice' ? '🎙' : '💬';
            activeThreadsHint += `\n• ${source} "${(t.title || 'Untitled').slice(0, 60)}" (${mins}m ago)`;
          }
        }
      }
    } catch {}
  }

  // ── Geo-location: read from Vercel IP headers (no permission popup) ──
  // Falls back to userConfig.location if headers missing (local dev / test).
  // Sunny spec 2026-04-12: Kiko should know location from browser/request context.
  const geoCity = req.headers?.['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null;
  const geoCountry = req.headers?.['x-vercel-ip-country'] || null;
  const geoLat = req.headers?.['x-vercel-ip-latitude'] || null;
  const geoLon = req.headers?.['x-vercel-ip-longitude'] || null;
  const geoTimezone = req.headers?.['x-vercel-ip-timezone'] || null;
  if (geoCity || geoLat) {
    // Override config location with live IP geo (city + country)
    const live = [geoCity, geoCountry].filter(Boolean).join(', ');
    if (live) userConfig.location = live;
    if (geoLat && geoLon) userConfig.coords = { lat: parseFloat(geoLat), lon: parseFloat(geoLon) };
    if (geoTimezone) userConfig.timezone = geoTimezone;
  }

  // ── Early greeting detection — skip heavy fetches for simple greetings ──
  const earlyGreeting = /^(hi|hey|hello|good\s+(morning|afternoon|evening)|howdy|what'?s?\s+up|yo)\b/i.test((message || '').trim());
  // Casual/personal questions that don't need CRM, knowledge base, or entity context
  const casualQuery = !earlyGreeting && /^(can\s+you\s+recommend|what('?s| is)\s+(a\s+good|the\s+best).*(?:movie|show|book|song|recipe|restaurant|bar)|tell\s+me\s+(a\s+joke|something\s+fun)|play|watch|eat|cook|read|listen|drink|wear|buy|order|try\s+(?:this|that|some)|visit\s+(?:a|the)|sing|dance|joke|game|movie|show|book|song|recipe|weather|temp(?:erature)?|rain|snow|sun|time\s+(?:is\s+it|in)|date\s+today|uno|chess|cards|board\s+game|netflix|spotify|music|playlist|dinner\s+(?:idea|suggestion)|lunch\s+(?:idea|suggestion)|coffee|tea|beer|wine|cocktail|pool|beach|park|gym|yoga|meditat|relax|sleep|nap|chill|vibe|mood|feel\s+(?:good|bad|happy|sad|tired|bored))/i.test((message || '').trim());
  const isLightweight = earlyGreeting || casualQuery;

  // ── PARALLEL INITIAL LOAD — entityContext, identity, selfKnowledge, Bible layers all at once ──
  // Bible layers: Core (universal) + Org (per-org) + Personal (per-user) — loaded from DB tables
  const userOrgId = isRegistered
    ? await sbFetch(`organization_members?user_id=eq.${userId}&select=organization_id&limit=1`).catch(() => [])
    : [];
  const orgId = userOrgId?.[0]?.organization_id || null;

  const [entityContext, identityResult, selfKnowledge, voiceMemResult, coreBibleResult, orgBibleResult, userBibleResult, knowledgeBaseResult, learnedRulesResult, preferencesResult] = await Promise.all([
    isLightweight ? Promise.resolve('') : fetchEntityContext(pageEntity),
    sbFetch(`kiko_memories?path=eq./memories/identity.md&user_id=eq.${userId}&select=content&limit=1`).catch(() => []),
    isLightweight ? loadLeanKnowledge(userId).then(r => { console.log('[KIKO] LEAN (lightweight):', r.length, 'chars'); return r; }).catch(() => '') : loadLeanKnowledge(userId).then(r => { console.log('[KIKO] LEAN (full):', r.length, 'chars'); return r; }).catch(e => { console.log('[KIKO] Lean failed, falling back:', e.message); return generateSelfKnowledge(userId).catch(() => 'Self-knowledge unavailable.'); }),
    (voiceMode || currentPage === 'voice')
      ? sbFetch(`kiko_memories?select=path,content&is_directory=eq.false&user_id=eq.${userId}&path=like.${encodeURIComponent('/memories/%_profile.md')}&order=path.asc`).catch(() => [])
      : Promise.resolve([]),
    sbFetch('kiko_core_bible?select=content&order=version.desc&limit=1').catch(() => []),
    orgId ? sbFetch(`org_bibles?organization_id=eq.${orgId}&select=content&limit=1`).catch(() => []) : Promise.resolve([]),
    isRegistered ? sbFetch(`user_bibles?user_id=eq.${userId}&select=content&limit=1`).catch(() => []) : Promise.resolve([]),
    isLightweight ? Promise.resolve([]) : sbFetch('kiko_knowledge?select=domain,content,researched_at,source&order=researched_at.desc&limit=100').catch(() => []),
    isLightweight ? Promise.resolve([]) : sbFetch(`kiko_learned_rules?active=eq.true&select=id,rule_text,category,evidence_count,weight&order=weight.desc&limit=20`).catch(() => []),
    isLightweight ? Promise.resolve([]) : sbFetch(`kiko_preferences?select=category,preference,confidence&order=confidence.desc&limit=15`).catch(() => []),
  ]);

  // Assemble Bible layers — fallback gracefully if any layer missing
  const coreBible = coreBibleResult?.[0]?.content || '';
  const orgBible = orgBibleResult?.[0]?.content || '';
  const userBible = userBibleResult?.[0]?.content || '';
  const knowledgeBase = (() => {
    // Domain-aware: keep latest entry per domain so ALL research areas are represented
    const byDomain = new Map();
    for (const k of (knowledgeBaseResult || []).filter(k => k.content)) {
      if (!byDomain.has(k.domain)) byDomain.set(k.domain, k);
    }
    // Topic-relevance scoring: match user's message against domain names
    const msgLower = (message || '').toLowerCase();
    const allDomains = [...byDomain.values()];
    
    // Score each domain: higher score = more relevant to current message
    const scored = allDomains.map(k => {
      const domWords = k.domain.replace(/-/g, ' ').split(' ');
      let score = 0;
      for (const w of domWords) {
        if (w.length > 2 && msgLower.includes(w)) score += 3;
      }
      // Boost foundation knowledge in relevant contexts
      if (k.source === 'foundation_v1') score += 1;
      return { ...k, relevance: score };
    });
    
    // Sort: relevant domains first, then by recency
    scored.sort((a, b) => b.relevance - a.relevance || new Date(b.researched_at) - new Date(a.researched_at));
    
    // Load relevant domains in FULL (no truncation), others at 3000 chars
    return scored.map(k => {
      const contentLimit = k.relevance >= 3 ? k.content.length : 3000;
      return `[${k.domain} — ${new Date(k.researched_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}]\n${k.content.slice(0, contentLimit)}`;
    }).join('\n\n');
  })();
  // PHASE 5.1: Bible moved to JIT via read_bible tool (saves ~26KB per query)
  // coreBible + orgBible now loaded on-demand via read_bible tool
  // Only userBible (small, always relevant) + message-relevant knowledge stay in prompt
  const relevantKnowledge = (() => {
    if (!knowledgeBase) return '';
    // knowledgeBase is already relevance-scored above — split into domain entries
    const entries = knowledgeBase.split('\n\n').filter(l => l.trim().length > 50);
    // Only keep top 5 most relevant domains (rest available via search_knowledge tool)
    return entries.slice(0, 5).join('\n\n');
  })();
  const bibleBlock = [
    userBible ? `\n\n═══ PERSONAL CONTEXT (PRIVATE — THIS USER ONLY) ═══\n${userBible}` : '',
    relevantKnowledge ? `\n\n═══ RELEVANT KNOWLEDGE ═══\n${relevantKnowledge}` : '',
  ].join('');

  // Learned rules — self-promoted patterns Kiko must follow
  const activeRules = Array.isArray(learnedRulesResult) ? learnedRulesResult.filter(r => r.rule_text) : [];
  let learnedRulesBlock = '';
  if (activeRules.length > 0) {
    learnedRulesBlock = '\n\n═══ LEARNED RULES (self-promoted from patterns — APPLY THESE) ═══\n' +
      activeRules.map(r => `• [${r.category}|w:${r.weight || 1.0}] ${r.rule_text}`).join('\n');
    // Increment applied_count for loaded rules (fire and forget)
    const ruleIds = activeRules.map(r => r.id);
    sbFetch(`kiko_learned_rules?id=in.(${ruleIds.join(',')})`, {
      method: 'PATCH', body: JSON.stringify({ applied_count: (activeRules[0]?.applied_count || 0) + 1 })
    }).catch(() => {});
  }

  // Preferences — strategic positions and user communication preferences
  const prefs = Array.isArray(preferencesResult) ? preferencesResult.filter(p => p.preference) : [];
  let preferencesBlock = '';
  if (prefs.length > 0) {
    preferencesBlock = '\n\n═══ LEARNED PREFERENCES ═══\n' +
      prefs.map(p => `• [${p.category}|${p.confidence}] ${p.preference}`).join('\n');
  }

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
    + bibleBlock
    + learnedRulesBlock
    + preferencesBlock
    + `\n[${dateStr}, ${timeStr} UK | Page: ${currentPage}]`
    + (pageContext?.summary ? `\n[Context: ${pageContext.summary}${pageContext.stageDistribution ? ` | Stages: ${JSON.stringify(pageContext.stageDistribution)}` : ''}${pageContext.visibleItems ? `\nVisible: ${pageContext.visibleItems}` : ''}]` : '')
    + (pageContext?.selectedItem ? `\n[SELECTED ITEM — FOCUS ON THIS: ${pageContext.selectedItem.kind} — "${pageContext.selectedItem.title}" ${pageContext.selectedItem.meta ? `(${pageContext.selectedItem.meta})` : ''}. Your response must be about THIS entity only.]` : '')
    + (PERSONALITIES[personality] || PERSONALITIES.executive)
    + pageRole + entityContext + voiceRules + preloadedMemory
    + `\n\n[CRITICAL IDENTITY: The user you are speaking with RIGHT NOW is ${userConfig.display_name}. Address them as ${userConfig.display_name.split(' ')[0]}. Do NOT use any other name.]`
    + (isSuperAdmin ? '' : `\n\n[MEMORY ISOLATION — CRITICAL: You may have memories stored from other users who share this system. You MUST completely ignore ALL memories that reference people, families, children, personal details, locations, or private matters that were NOT told to you by ${userConfig.display_name} in THIS conversation or in the personal context section above. If you have NO personal context items for this user, then you know NOTHING about their personal life — do not reference any memories about daughters, children, family, schools, addresses, books, legal matters, or any other personal details. Any such memories belong to a DIFFERENT user and are CONFIDENTIAL. Respond only with "I don't have any personal information about you yet" when asked about personal matters you have no data for.]`);

  // ── nostream mode (for kiko-async internal calls) — buffer SSE deltas, return JSON ──
  // This avoids Vercel's SSE-over-fetch consumption issue when one serverless function
  // calls another. Browser clients still get streaming.
  const noStream = req.query?.nostream === '1' || req.body?.nostream === true;
  const sseBuffer = [];
  // ── SSE setup ──
  if (!noStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Vercel-No-Buffering', '1');
    if (res.flushHeaders) res.flushHeaders();
  }
  const write = (d) => {
    if (noStream) { sseBuffer.push(d); return; }
    try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch {}
  };
  // finishResponse: in noStream mode returns buffered JSON, in stream mode ends SSE
  const finishResponse = () => {
    if (noStream) {
      const responseText = sseBuffer.map(d => d.delta || '').join('');
      try { return res.status(200).json({ response: responseText, buffered_events: sseBuffer.length }); } catch {}
      return;
    }
    try { res.write('data: [DONE]\n\n'); } catch {}
    try { res.end(); } catch {}
  };

  // Watchdog: if handler takes >55s, force-send an error and close
  let finished = false;
  const watchdog = setTimeout(() => {
    if (!finished) {
      finished = true;
      write({ delta: '\n\nRequest timed out. Try a simpler question or try again.' });
      finishResponse();
    }
  }, 110000);

  try {
    write({ toolStatus: 'Connecting...' });
    const queryStartTime = Date.now();
    // Build messages — summarise older history for context
    let conversationSummary = '';
    if (conversationHistory.length > 6) {
      // Summarise older messages so Kiko has context without massive payloads
      const olderMessages = conversationHistory.slice(0, -6).filter(m => m.role === 'user' || m.role === 'assistant');
      if (olderMessages.length > 0) {
        const summaryParts = olderMessages.map(m => {
          const role = m.role === 'user' ? 'User asked' : 'Kiko responded';
          const text = (m.content || '').replace(/\n+/g, ' ').slice(0, 200);
          return `• ${role}: ${text}`;
        }).join('\n');
        conversationSummary = `\n\n── EARLIER IN THIS CONVERSATION ──\n${summaryParts}\n── END OF EARLIER CONTEXT ──\nUse this context to maintain continuity. The user expects you to remember what was discussed above.`;
      }
    }
    const messages = conversationHistory.slice(-6)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        const content = sanitizeUnicode(m.content || '');
        return { role: m.role, content: content.length > 2000 ? content.slice(0, 1800) + '\n[... truncated ...]' : content };
      });

    // File attachments
    if (attachments.length > 0) {
      const contentBlocks = [];
      for (const att of attachments) {
        if (att.type === 'image') contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } });
        else if (att.type === 'document' && att.mediaType === 'application/pdf') contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } });
        else if (att.type === 'text') contentBlocks.push({ type: 'text', text: `[File: ${att.fileName || 'uploaded'}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
        else if (att.type === 'file') contentBlocks.push({ type: 'text', text: `[File: ${att.name || 'uploaded'}${att.pages ? ` — ${att.pages} pages` : ''}]\n${att.data}` });
      }
      contentBlocks.push({ type: 'text', text: message || 'Analyse this file.' });
      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const nativeTools = buildNativeTools(userConfig, timezone);
    const voiceTools = voiceMode
      ? [...nativeTools.filter(t => t.name !== 'memory'), ...TOOL_DEFINITIONS]
      : [...nativeTools, ...TOOL_DEFINITIONS];
    const allTools = voiceTools;
    // Light tool set for email/simple intents — dramatically reduces prompt size
    const EMAIL_TOOL_NAMES = ['create_email_draft', 'read_email', 'ask_data_agent', 'ask_memory_engine', 'search_conversations', 'navigate_page', 'log_activity', 'manage_knowledge', 'learning_search', 'search_knowledge', 'web_search', 'get_cognitive_analysis'];
    const lightEmailTools = allTools.filter(t => EMAIL_TOOL_NAMES.includes(t.name));

    // ── PHASE 1: Intent Classification ──
    // Fast-path: skip Haiku API call for obvious patterns (~60% of queries, saves 800ms)
    const msgLower = (message || '').toLowerCase().trim();
    let classification;
    const FAST_INTENTS = {
      greeting: /^(hi|hey|hello|good\s+(morning|afternoon|evening)|howdy|what'?s?\s+up|yo)\b/i,
      navigate: /^(go\s+to|open|show\s+me|navigate|take\s+me\s+to)\s+(home|pipeline|contacts|calendar|settings|tasks|outreach)/i,
      email_read: /^(check|read|show|get|any)\s*(my)?\s*(new|unread|latest|recent)?\s*(email|inbox|mail|gmail)/i,
      calendar: /^(what(?:'s|\s+is)?\s+on\s+my\s+calendar|any\s+meetings|my\s+schedule|check\s+(?:my\s+)?calendar|meetings?\s+(today|tomorrow|this\s+week)|what(?:'s|\s+is)\s+(?:on\s+)?my\s+schedule|am\s+i\s+free|do\s+i\s+have\s+any\s+meetings|calendar\s+(?:today|tomorrow|this\s+week))/i,
      directions: /^(directions?\s+to|how\s+do\s+i\s+get\s+to|route\s+to)\b/i,
      email: /^(draft|compose|write|prepare|create)\s+(a\s+|an\s+|the\s+)?(follow.?up\s+)?email/i,
      email2: /^(draft|compose|write|prepare|create)\s+(a\s+|an\s+|the\s+)?(draft|email|message|outreach)/i,
    };
    const fastMatch = Object.entries(FAST_INTENTS).find(([, re]) => re.test(msgLower));
    if (fastMatch) {
      classification = { intent: fastMatch[0], confidence: 0.99, useMCP: false };
    } else {
      classification = await classifyIntent(message, currentPage, conversationHistory);
    }
    const { intent, target } = classification;

    // Inject digest tool only for master_brief intent (kept out of default tools to avoid bloat)
    if (intent === 'master_brief') allTools.push(DIGEST_BRIEF_TOOL);

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
    if (isRegistered) detectCorrection(message, conversationHistory, intent, userId);

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
      finishResponse();
      return;
    }

    // Handle deterministic directions — Google Maps link
    if (intent === 'directions') {
      const dest = message.replace(/^(directions?\s+to|how\s+do\s+i\s+get\s+to|navigate\s+me\s+to|route\s+to|take\s+me\s+to)\s*/i, '').trim();
      if (dest) {
        const userLoc = userConfig?.location || 'Weybridge, UK';
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(userLoc)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
        write({ delta: `Here are your directions to **${dest}**:\n\n🗺️ [Open in Google Maps](${mapsUrl})\n\nStarting from ${userLoc}. The link will open with driving directions — you can switch to walking, transit, or cycling once there.` });
        write({ meta: { done: true, model: 'deterministic', intent: 'directions' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      }
    }

    // Handle deterministic category-gap analysis — no Claude needed
    // Queries f1_partnerships + category_overlaps directly via sbFetch (no HTTP hop).
    if (intent === 'category_gap') {
      write({ toolStatus: 'Analysing partnership matrix...' });
      try {
        const [partnerships, overlaps, categories, teamsList] = await Promise.all([
          sbFetch('f1_partnerships?select=team_id,partner_name,category_id,related_categories&status=eq.active'),
          sbFetch('category_overlaps?select=primary_category,blocking_category'),
          sbFetch('sponsor_categories?select=id,name&order=name.asc'),
          sbFetch('f1_teams?select=id,name&order=name.asc'),
        ]);
        const overlapMap = new Map();
        for (const o of (overlaps || [])) {
          const a = o.primary_category, b = o.blocking_category;
          if (!a || !b) continue;
          if (!overlapMap.has(a)) overlapMap.set(a, new Set());
          if (!overlapMap.has(b)) overlapMap.set(b, new Set());
          overlapMap.get(a).add(b);
          overlapMap.get(b).add(a);
        }
        const expand = (c) => { const s = new Set([c]); for (const n of (overlapMap.get(c)||[])) s.add(n); return s; };
        const teamIds = (teamsList||[]).map(t => t.id);
        const teamName = (id) => ({ haas:'Haas F1', ferrari:'Ferrari', mercedes:'Mercedes', mclaren:'McLaren', red_bull:'Red Bull Racing', williams:'Williams', aston_martin:'Aston Martin', alpine:'Alpine', racing_bulls:'Racing Bulls', cadillac:'Cadillac F1', audi:'Audi' }[id] || id);
        const results = [];
        for (const cat of (categories||[])) {
          const exp = expand(cat.id);
          const blocked = new Map();
          for (const p of (partnerships||[])) {
            if (!p.team_id || !p.partner_name) continue;
            const primary = p.category_id && exp.has(p.category_id);
            const related = Array.isArray(p.related_categories) && p.related_categories.some(rc => exp.has(rc));
            if (primary || related) {
              if (!blocked.has(p.team_id)) blocked.set(p.team_id, []);
              blocked.get(p.team_id).push(p.partner_name);
            }
          }
          const openTeams = teamIds.filter(t => !blocked.has(t));
          results.push({ id: cat.id, name: cat.name, open: openTeams, open_count: openTeams.length, blocked: Array.from(blocked.entries()) });
        }

        let out = '';
        if (target) {
          const teamFiltered = results.filter(r => r.open.includes(target));
          if (teamFiltered.length === 0) {
            out = `${teamName(target)} has zero open categories. Every slot is taken by direct or overlap conflict.`;
          } else {
            const sorted = [...teamFiltered].sort((a,b) => a.open_count - b.open_count);
            out = `**${teamName(target)} — ${teamFiltered.length} open categories**\n\n`;
            for (const c of sorted.slice(0, 10)) {
              out += `• **${c.name}** — ${c.open_count}/11 teams open\n`;
            }
            const top = sorted[0];
            out += `\nHighest urgency: **${top.name}** (${top.open_count}/11 open).\n\nLaunch: /campaigns → ⚡ Build → ${top.name}.`;
          }
        } else {
          const sorted = results.filter(r => r.open_count > 0).sort((a,b) => a.open_count - b.open_count).slice(0, 8);
          out = `**F1 Category Gaps** — sorted by urgency (fewest open teams first)\n\n`;
          for (const c of sorted) {
            const openNames = c.open.map(teamName).join(', ');
            out += `• **${c.name}** — ${c.open_count}/11: ${openNames}\n`;
          }
          out += `\nLaunch: /campaigns → ⚡ Build → pick category.`;
        }
        const chunks = out.match(/.{1,80}/g) || [out];
        for (const chunk of chunks) write({ delta: chunk });
        write({ meta: { done: true, model: 'deterministic', intent: 'category_gap', version: 'v16.1' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      } catch (err) {
        console.error('[category_gap] error:', err);
        write({ delta: `Unable to query partnership matrix: ${err.message}. Try /partnership-matrix for the full view.` });
        write({ meta: { done: true, intent: 'category_gap_error' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      }
    }

    // Handle deterministic company lookup — no Claude needed
    // Queries company_intelligence + companies + contacts + deals via lookupCompany() helper.
    // Pure SQL, zero LLM, zero hallucination on facts.
    if (intent === 'company_lookup') {
      const companyQuery = (target || message || '').trim();
      write({ toolStatus: `Looking up ${companyQuery}...` });
      try {
        const result = await lookupCompany(companyQuery);
        if (!result.found) {
          const notFoundMsg = `${result.message}\n\n_If this is a real company, ask Kiko to "research ${companyQuery}" for live web intel, or "enrich ${companyQuery}" to add it to your database._`;
          const chunks = notFoundMsg.match(/.{1,80}/g) || [notFoundMsg];
          for (const chunk of chunks) write({ delta: chunk });
          write({ meta: { done: true, model: 'deterministic', intent: 'company_lookup_not_found' } });
        } else {
          const md = result.markdown || JSON.stringify(result.card, null, 2);
          const chunks = md.match(/[\s\S]{1,80}/g) || [md];
          for (const chunk of chunks) write({ delta: chunk });
          write({ meta: { done: true, model: 'deterministic', intent: 'company_lookup', matched_via: result.matched_via, matched_name: result.matched_name } });
        }
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      } catch (err) {
        console.error('[company_lookup] error:', err);
        write({ delta: `Unable to look up ${companyQuery}: ${err.message}. Try the search bar in /organisations.` });
        write({ meta: { done: true, intent: 'company_lookup_error' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      }
    }

    // Handle deterministic morning brief — bypass LLM completely so the system
    // health banner from ea.js morningBrief() is never paraphrased away.
    // The LLM-tool-loop path was rewriting the brief in its own words and
    // stripping the 🚨 SYSTEM HEALTH header that prepends selfcheck failures.
    if (intent === 'brief') {
      write({ toolStatus: 'Compiling your morning brief...' });
      try {
        const briefText = await callEAAgent('brief', {});
        const text = typeof briefText === 'string' ? briefText : JSON.stringify(briefText);
        const chunks = text.match(/[\s\S]{1,80}/g) || [text];
        for (const chunk of chunks) write({ delta: chunk });
        write({ meta: { done: true, model: 'deterministic', intent: 'brief' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      } catch (err) {
        console.error('[brief] error:', err);
        write({ delta: `Unable to compile brief: ${err.message}.` });
        write({ meta: { done: true, intent: 'brief_error' } });
        finished = true; clearTimeout(watchdog);
        finishResponse();
        return;
      }
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
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const raw = event.delta.text || '';
          const { cleaned, navigateTo } = stripToolXml(raw);
          if (navigateTo) write({ navigate: navigateTo });
          if (cleaned.length > 0) write({ delta: cleaned });
        }
      }
      write({ meta: { done: true, model: MODEL, intent: 'screen', version: 'v16.1' } });
      finished = true; clearTimeout(watchdog);
      finishResponse();
      return;
    }

    // Inject routing hint into system prompt for non-trivial intents
    const agentMapping = INTENT_TO_AGENT[intent];
    let routingHint = '';
    // Greeting: proactive briefing — call morning_briefing FIRST
    if (intent === 'greeting') {
      routingHint = '\n\n[ROUTING HINT: This is a GREETING. You MUST call the morning_briefing tool as your first action — NOT ask_ea_agent. Then synthesise the top 3 priorities from the briefing. Do NOT ask permission. TELL Sunny what needs doing right now. Lead with the most urgent overdue action.]';
    } else if (agentMapping?.tool) {
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

        // MANDATORY FACT VERIFICATION FOR ALL EMAIL DRAFTS
        routingHint += `\n\n[MANDATORY PRE-DRAFT VERIFICATION — THIS IS NOT OPTIONAL]:
Before drafting ANY email that references specific facts about a company or person, you MUST:
1. SEARCH your knowledge base (learning_search or search_knowledge) for existing verified data
2. If the fact is NOT in your knowledge base, call web_search to verify it BEFORE including it in the draft
3. SPECIFIC CLAIMS THAT ALWAYS REQUIRE VERIFICATION: funding rounds, Series A/B/C/D, acquisitions, revenue figures, executive appointments, partnerships, product launches, IPO status, board changes
4. If you CANNOT verify a claim, DO NOT include it. Use general positioning instead.
5. NEVER assume a funding round, acquisition, or financial event occurred — always verify.

REASONING DISCIPLINE:
You have 4 tool rounds for email tasks. Use them wisely:
Round 1: Verify claims (web_search or learning_search)
Round 2: Check CRM for contact context (ask_data_agent)
Round 3: Check email history if relevant (read_email)
Round 4: Draft the email (ask_outreach_agent)
Do NOT skip to drafting without verifying first. The cost of an unverified claim in a C-suite email is higher than the cost of an extra tool call.]`;
      }
    } else if (intent === 'email_read') {
      routingHint = '\n\n[ROUTING HINT: This is an EMAIL query. Use the read_email tool. Operations: search (Gmail query like "from:matthew proofpoint"), read_thread (get full thread by threadId), unread, inbox_summary. IMPORTANT: For super_admin, search scans ALL team members inboxes automatically. For regular users, only their own inbox. When user says "check emails with X" or "correspondence with X", use search with the person/company name. If you find relevant threads, use read_thread to get the FULL conversation. Always give dates, senders, key content, and summarise the relationship history.]';
    } else if (intent === 'calendar') {
      routingHint = '\n\n[ROUTING HINT: This is a CALENDAR query. Use the read_calendar tool. Operations: today (today\'s events), upcoming (next 7 days), search (by keyword), free_slots (find available time). Give times in UK format.]';
    } else if (intent === 'research') {
      routingHint = '\n\n[ROUTING HINT: This is a RESEARCH query. Use the web_search tool to find current information. Run 3-8 searches systematically: company overview, funding, leadership, news, competitors, partnerships. Synthesise into a structured brief. You HAVE internet access — use it. Also cross-reference with CRM data via ask_data_agent if the entity exists in the pipeline. After research, save key findings using manage_knowledge (operation: save_insight).]';
    } else if (intent === 'knowledge') {
      routingHint = '\n\n[ROUTING HINT: This is a KNOWLEDGE MANAGEMENT query. Use the manage_knowledge tool. Operations: add_source (add URL/document), search_knowledge (search knowledge base), list_sources (show sources), learn_topic (queue learning), save_insight (save a fact), create_agent (create a new dynamic specialist agent), list_agents (show custom agents), run_agent (execute a custom agent), set_mode (switch operational mode: fundraising/race_week/outreach_sprint/deal_closing/product_launch), get_mode (check current mode). If user says "create an agent for X" — design a system_prompt, pick relevant data_queries, and create it. If user says "fundraising mode" or "switch to X mode" — use set_mode.]';
    } else if (intent === 'conversation_search') {
      routingHint = '\n\n[ROUTING HINT: This references a PAST CONVERSATION. Use the search_conversations tool with relevant keywords. Search for entity names, topics, or specific phrases the user mentions. Return the most relevant excerpts with dates.]';
    } else if (intent === 'document_query') {
      routingHint = '\n\n[ROUTING HINT: This is a DOCUMENT query. Use ask_data_agent with operation "search_documents". Params: query (search term), team (team name), sport (sport name), category (team_deck/contract/marketing/legal/financial/agency_agreement). The Document Library page is at /documents — you can suggest users navigate there to browse visually. For super_admin users, show all documents including restricted ones. For regular users, only show documents with access_level != super_admin_only.]';
    } else if (intent === 'master_brief') {
      routingHint = '\n\n[ROUTING HINT: The user wants you to digest a master brief or operating instructions. Use the digest_master_brief tool. If the user attached a file, extract the full text from it first using the file content in context. Pass the COMPLETE text to document_text. Use mode "merge" unless the user explicitly says to replace/overwrite everything.]';
    } else if (intent === 'code_review') {
      routingHint = '\n\n[ROUTING HINT: This is a SELF-ANALYSIS query. Use the ask_code_review tool. Operations: architecture (full codebase structure), review (review specific file — pass filename like "kiko.js" or "agents/deal.js"), performance (agent usage stats, error rates, cron health), suggest (AI-generated top 5 improvements), read (read raw source file). Default to "suggest" if the user just asks generally about improvements.]';
    } else if (intent === 'general') {
      routingHint = '\n\n[ROUTING HINT: This is a general question. You have FULL access to all tools — CRM, web search, Gmail, Calendar, all 23 specialist agents. KNOWLEDGE CHECK: Before answering any legal, financial, tax, compliance, or domain-specific question, CHECK YOUR RESEARCH KNOWLEDGE BASE above (═══ RESEARCH KNOWLEDGE BASE). If you have relevant research, reference it and cite the research date. If the research is older than 7 days or insufficient, supplement with web_search for the latest. For CRM-related questions, also check manage_knowledge → search_knowledge. ALWAYS save new valuable findings via manage_knowledge → save_insight.]';
    }

    // For general queries, inject live CRM context (registered users only, skip casual queries)
    if (isRegistered && intent === 'general' && !casualQuery) {
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
    // Skip for fast intents (greeting, navigate, screen, calendar_read, email_read) and casual queries (weather, recommendations)
    const SKIP_ENTITY_RECALL = ['greeting', 'identity', 'outreach', 'content', 'navigate', 'screen', 'calendar_read', 'email_read'];
    if (!voiceMode && isRegistered && !casualQuery && !SKIP_ENTITY_RECALL.includes(intent)) {
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
    const isLightIntent = voiceMode || casualQuery || ['greeting', 'identity', 'navigate', 'screen'].includes(intent);
    try {
      const queries = isLightIntent
        ? [ // Light: only 3 queries for greeting speed
          Promise.resolve([]), // prefs — skip
          Promise.resolve([]), // profiles — skip
          sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category,key,value&order=updated_at.desc&limit=15`).catch(() => []),
          Promise.resolve([]), // insights — skip
          sbFetch(`kiko_inbox_triage?triage_date=eq.${new Date().toISOString().split('T')[0]}&limit=1&select=summary,priority_emails`).catch(() => []),
          sbFetch(`kiko_alerts?type=in.(morning_briefing,morning_brief)&order=created_at.desc&limit=1&select=detail,created_at`).catch(() => []),
          Promise.resolve([]), // pending — skip
          sbFetch(`kiko_goals?status=eq.active&order=priority&limit=5&select=title,priority,description`).catch(() => []),
          sbFetch(`kiko_outcomes?order=created_at.desc&limit=5&select=action_taken,result,what_worked,what_failed,created_at`).catch(() => []),
        ]
        : [ // Full: all queries
          sbFetch(`kiko_preferences?user_id=eq.${userId}&order=confidence.desc&limit=10&select=category,preference,confidence`).catch(() => []),
          sbFetch(`kiko_user_profiles?user_id=eq.${userId || ''}&limit=1&select=draft_instructions,communication_style,language_fingerprint`).catch(() => []),
          sbFetch(`kiko_personal_context?user_id=eq.${userId}&select=category,key,value&order=updated_at.desc&limit=20`).catch(() => []),
          sbFetch(`kiko_conversation_insights?user_id=eq.${userId}&order=created_at.desc&limit=5&select=key_facts,decisions_made,open_threads,entities_discussed`).catch(() => []),
          sbFetch(`kiko_inbox_triage?triage_date=eq.${new Date().toISOString().split('T')[0]}&limit=1&select=summary,priority_emails`).catch(() => []),
          sbFetch(`kiko_alerts?type=in.(morning_briefing,morning_brief)&order=created_at.desc&limit=1&select=detail,created_at`).catch(() => []),
          sbFetch(`kiko_draft_actions?status=eq.pending&user_id=eq.${userId}&order=created_at.desc&limit=5&select=action_type,payload,created_at`).catch(() => []),
          sbFetch(`kiko_goals?status=eq.active&order=priority&limit=5&select=title,priority,description`).catch(() => []),
          sbFetch(`kiko_outcomes?order=created_at.desc&limit=5&select=action_taken,result,what_worked,what_failed,created_at`).catch(() => []),
        ];
      const [prefs, profiles, personal, insights, triage, brief, pending, goals, outcomes] = await Promise.all(queries);

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

      // Active strategic goals
      if (Array.isArray(goals) && goals.length) {
        morningBrief += `\n\n[ACTIVE STRATEGIC GOALS — everything you do should connect to one of these]:`;
        for (const g of goals) morningBrief += `\n• [${g.priority}] ${g.title}${g.description ? ': ' + g.description.slice(0, 120) : ''}`;
      }

      // Active intents — short-term actionable next steps
      try {
        const { data: intents } = await supabase.from('kiko_intents').select('title, status, next_action, due_date').in('status', ['active']).order('due_date', { ascending: true, nullsFirst: false }).limit(5);
        if (intents?.length) {
          morningBrief += `\n\n[ACTIVE INTENTS — what needs to happen NOW]:`;
          for (const i of intents) morningBrief += `\n• ${i.title}${i.due_date ? ' (due: ' + i.due_date + ')' : ''} → ${i.next_action || 'action needed'}`;
        }
      } catch {}

      // Recent outcomes — what happened when we took action (learning loop)
      if (Array.isArray(outcomes) && outcomes.length) {
        morningBrief += `\n\n[RECENT OUTCOMES — learn from these]:`;
        for (const o of outcomes) morningBrief += `\n• ${o.action_taken} → ${o.result}${o.what_worked ? ' (worked: ' + o.what_worked.slice(0, 80) + ')' : ''}${o.what_failed ? ' (failed: ' + o.what_failed.slice(0, 80) + ')' : ''}`;
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

    // ── REASONING ENGINE — Pre-process context before Claude sees the message ──
    // Moved to after skipTools declaration — see below
    let reasoningContext = '';

    // User timezone/datetime context
    const userNow = new Date().toLocaleString('en-GB', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const timezoneHint = `\n\n[USER DATETIME: ${userNow} | Timezone: ${timezone} | Locale: ${locale}]`;

    const systemWithHint = system + identityContext + routingHint + preferencesHint + personalHint + profileHint + memoryHint + activeThreadsHint + inboxHint + morningBrief + modeHint + identityHint + attributionHint + emailStyleHint + conversationSummary + timezoneHint;

    // ── Prompt Caching ──
    // Split system content into stable (cached) and dynamic (not cached) blocks
    // The base system prompt + self-knowledge are stable per user session (~9K tokens)
    // Context hints change per request and should NOT be cached
    const contextBlock = identityContext + routingHint + preferencesHint + personalHint + profileHint + memoryHint + activeThreadsHint + inboxHint + morningBrief + modeHint;
    const systemCached = [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ...(contextBlock.trim() ? [{ type: 'text', text: contextBlock }] : []),
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
        const toolSet = opts.lightTools || allTools;
        toolsWithCache = [...toolSet];
        if (toolsWithCache.length > 0) {
          const last = { ...toolsWithCache[toolsWithCache.length - 1] };
          last.cache_control = { type: 'ephemeral' };
          toolsWithCache[toolsWithCache.length - 1] = last;
        }
      }
      
      const params = {
        model: useDeep ? 'claude-opus-4-6' : (useHaiku ? 'claude-haiku-4-5-20251001' : MODEL),
        max_tokens: opts.maxTokens || (useDeep ? 16000 : 4096),
        temperature: intent === 'crm_write' || intent === 'campaign' || /campaign|sequence|enroll|target/i.test(message || '') ? 0 : 1,
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
      let xmlBuffer = '';  // accumulates raw text until safe to flush (handles cross-chunk navigate_page tags)
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          xmlBuffer += event.delta.text || '';
          // Flush when we have a safe cut point (no open angle bracket in last 40 chars) or buffer is large
          const openBracket = xmlBuffer.lastIndexOf('<');
          const safeCut = openBracket === -1 ? xmlBuffer.length : openBracket;
          if (xmlBuffer.length > 500 || (safeCut > 0 && xmlBuffer.length - safeCut < 2)) {
            const flushable = xmlBuffer.slice(0, safeCut || xmlBuffer.length);
            xmlBuffer = xmlBuffer.slice(safeCut || xmlBuffer.length);
            const { cleaned, navigateTo } = stripToolXml(flushable);
            if (navigateTo) write({ navigate: navigateTo });
            if (cleaned.length > 0) { write({ delta: cleaned }); responseText += cleaned; }
          }
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') write({ thinking: event.delta.thinking });
      }
      // Final flush of whatever is left in the buffer
      if (xmlBuffer.length > 0) {
        const { cleaned, navigateTo } = stripToolXml(xmlBuffer);
        if (navigateTo) write({ navigate: navigateTo });
        if (cleaned.length > 0) { write({ delta: cleaned }); responseText += cleaned; }
        xmlBuffer = '';
      }
      return await stream.finalMessage();
    }

    const INTENT_LABELS = {
      pipeline: 'Checking deal pipeline...', deals: 'Searching deals...', contacts: 'Looking up contacts...',
      organisations: 'Searching organisations...', tasks: 'Reviewing tasks...', calendar: 'Checking calendar...',
      strategy: 'Evaluating strategic opportunity...', partnership: 'Analysing partnership landscape...',
      negotiation: 'Preparing negotiation analysis...', outreach: 'Drafting outreach...', content: 'Generating content...',
      brief: 'Preparing your morning brief...', screen: 'Reading current screen...', category: 'Analysing sponsorship categories...',
      navigation: 'Navigating...', memory: 'Searching your history...', general: 'Thinking...', identity: 'Thinking...',
      code_review: 'Analysing platform code...', email: 'Checking emails...', document: 'Processing document...',
    };
    write({ toolStatus: INTENT_LABELS[intent] || 'Thinking...' });
    let responseText = '';
    const requestStart = Date.now();

    // Fast-path for greetings and identity queries — skip tool loop, answer from system prompt only
    // Voice: ALL greetings use Haiku (speed > proactive context). Text: first-message greetings use Sonnet.
    // Identity ("who are you") previously stalled in tool loop because Claude called ask_memory_engine
    // after answering. Now: hard-skip tools, answer from KIKO_BIBLE system prompt only.
    const FAST_RESPONSE_INTENTS = ['identity'];
    const isSimpleGreeting = FAST_RESPONSE_INTENTS.includes(intent);
    const useHaikuForGreeting = false; // Greetings need Sonnet for strategic briefing
    const skipTools = isSimpleGreeting || casualQuery;
    const isEmailIntent = intent === 'email' || intent === 'email2' || intent === 'outreach';
    // Simple email drafts use Haiku (~5s) — complex strategy emails use Sonnet (~15s)
    const isSimpleDraft = isEmailIntent && /\b(re-?engag|catch.?up|follow.?up|check.?in|reconnect|hello|introduction|touching base|quick email|brief email|short email|keeping in touch|reaching out)\b/i.test(message);
    const isComplexDraft = isEmailIntent && /\b(negotiat|strateg|invest|disput|pricing|proposal|partner|board|acquisition|due diligence|term sheet)\b/i.test(message);
    const useHaikuForEmail = isSimpleDraft && !isComplexDraft;
    const toolOpts = skipTools ? { noTools: true, maxTokens: voiceMode ? 300 : 1500, useHaiku: useHaikuForGreeting } : isEmailIntent ? { lightTools: lightEmailTools, useHaiku: useHaikuForEmail } : {};
    // Command Centre: never use Haiku, always enough tokens for full brief + draft
    if (currentPage === 'command-centre') {
      toolOpts.maxTokens = 8192;
      toolOpts.useHaiku = false;
    }

    // ── REASONING ENGINE — gather intelligence BEFORE Claude sees the message ──
    // Only runs for substantive queries about specific entities — NOT for follow-ups, greetings, or simple commands
    const SKIP_REASONING = ['navigate', 'screen', 'calendar', 'self_monitor', 'identity', 'greeting', 'knowledge', 'conversation_search', 'code_review', 'email_read'];
    const isShortFollowUp = message.length < 40 && /^(yes|no|ok|sure|thanks|do it|go ahead|continue|proceed|sounds good|perfect|great|send it|approved)/i.test(message.trim());
    const shouldReason = !skipTools && !isGreeting && !isShortFollowUp && !SKIP_REASONING.includes(intent);
    if (shouldReason) {
      try {
        write({ toolStatus: 'Gathering intelligence...' });
        // 8 second timeout — if reasoning takes longer, skip it and let Claude verify via tools
        const preResult = await Promise.race([
          preProcess(message, intent),
          new Promise(resolve => setTimeout(() => resolve({ context: '', duration: 0, timedOut: true }), 8000))
        ]);
        if (preResult.timedOut) console.log('[kiko] Reasoning engine timed out at 8s — skipping');
        if (preResult.context && preResult.context.length > 80) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && typeof lastMsg.content === 'string') {
            messages[messages.length - 1] = { role: 'user', content: lastMsg.content + preResult.context + '\n\n⚠️ The CRM data, contacts, and knowledge above were ALREADY gathered for you. Do NOT call ask_data_agent, read_email, or learning_search to re-fetch this data — it is already here. Go straight to your response or draft.' };
          }
          console.log(`[kiko] Reasoning engine: ${preResult.duration}ms`);
        }
      } catch (e) { console.error('[kiko] Reasoning engine error:', e.message); }
    }

    // If reasoning engine loaded CRM data AND intent is outreach, skip tools — draft directly from pre-loaded context
    const reasoningHadData = shouldReason && messages[messages.length - 1]?.content?.includes('PRE-VERIFIED INTELLIGENCE');
    const skipToolsForDraft = isEmailIntent && reasoningHadData;
    const finalToolOpts = skipToolsForDraft ? { noTools: false, lightTools: lightEmailTools } : toolOpts;

    let response = await streamCall(messages, finalToolOpts);
    let toolRounds = 0;
    const toolsUsedList = [];

    // Tool execution loop — time-aware, stops before timeout
    const maxRounds = (isEmailIntent && reasoningHadData) ? 1 : isEmailIntent ? 2 : (voiceMode ? 5 : 5);
    const timeLimit = isEmailIntent ? 45000 : (voiceMode ? 45000 : 90000);
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
        console.log(`[KIKO] Tool call START: ${block.name} (round ${toolRounds})`);
        const toolStart = Date.now();
        // Heartbeat: send periodic pings so client knows we're alive during long tool calls
        const heartbeat = setInterval(() => { try { write({ toolStatus: TOOL_LABELS[block.name] || `Still working...` }) } catch {} }, 8000);
        let result;
        try {
          // Per-tool timeout: 35s default, 60s for complex tools (data queries, campaigns, documents)
          const toolPromise = block.name === 'memory'
            ? handleMemory(block.input, userId)
            : executeTool(block.name, block.input, userEmail, pageContext, userId);
          // Complex tools need longer timeouts (data queries, AI generation, campaigns)
          const LONG_TOOLS = ['ask_negotiation_agent', 'ask_strategy_agent', 'ask_investment_agent', 'ask_dispute_agent', 'run_morning_briefing', 'ask_data_agent', 'build_campaign', 'generate_document'];
          const toolTimeoutMs = LONG_TOOLS.includes(block.name) ? 60000 : 35000;
          result = await Promise.race([
            toolPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool timeout: ${block.name} took longer than ${toolTimeoutMs/1000}s`)), toolTimeoutMs))
          ]);
        } catch (toolErr) {
          const errMsg = toolErr.message || String(toolErr);
          console.log(`[KIKO] Tool call FAILED: ${block.name} after ${Date.now() - toolStart}ms — ${errMsg.slice(0, 100)}`);
          // Detect Google OAuth/token expiry
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('invalid_grant') || errMsg.includes('Token has been expired')) {
            result = `AUTH_EXPIRED: Google authentication has expired. Please ask Sunny to reconnect his Google account in Settings → Accounts. The ${block.name.replace('ask_', '').replace('read_', '')} tool cannot run until re-authenticated.`;
          } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT') || errMsg.includes('fetch failed') || errMsg.includes('network') || errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('500') || errMsg.includes('503') || errMsg.includes('overloaded')) {
            // Retry once for transient network/rate limit/server errors
            try {
              const backoff = errMsg.includes('429') || errMsg.includes('rate limit') ? 5000 : 2000;
              await new Promise(r => setTimeout(r, backoff));
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
        clearInterval(heartbeat);
        console.log(`[KIKO] Tool END: ${block.name} ${Date.now() - toolStart}ms`);
        // Handle navigation from any tool
        if ((block.name === 'navigate_page' || block.name === 'ask_navigator') && result?.navigated) write({ navigate: result.page });
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 8000)
        });
        if (isRegistered) {
          logDecision(block.name, block.input, result, message, userId);
          toolsUsedList.push(block.name);
          trackOutput(block.name, intent, message, result, userId, { toolsUsed: toolsUsedList, responseTimeMs: Date.now() - requestStart });
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
    finishResponse();

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

    // PHASE 5: Conversation Compaction — update KIKO_MEMORY.md with key facts from this chat
    if (isRegistered && responseText.length > 200 && !['navigate', 'screen', 'greeting'].includes(intent)) {
      try {
        const { saveMemory } = await import('./kiko-self-knowledge-lean.js');
        const compactResp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 200,
          messages: [{ role: 'user', content: `Extract ONLY new facts, decisions, or state changes from this conversation that should update persistent memory. If nothing significant happened, respond with exactly "NONE".

User said: ${(message || '').slice(0, 300)}
Kiko responded about: ${responseText.slice(0, 500)}

Output format (one per line):
STATE: [what changed] 
DECISION: [what was decided]
FACT: [new information learned]` }]
        });
        const extract = compactResp.content?.[0]?.text?.trim() || 'NONE';
        if (extract !== 'NONE' && extract.length > 10) {
          const fs = await import('fs');
          const memPath = (await import('path')).join(process.cwd(), 'api/data/KIKO_MEMORY.md');
          try {
            let mem = fs.readFileSync(memPath, 'utf-8');
            const timestamp = new Date().toISOString().split('T')[0];
            // Append to RECENT DECISIONS section
            const insertPoint = mem.indexOf('## OPERATIONAL HEALTH');
            if (insertPoint > 0) {
              mem = mem.slice(0, insertPoint) + `- ${timestamp}: ${extract.replace(/\n/g, '; ')}\n` + mem.slice(insertPoint);
            }
            // Update the timestamp
            mem = mem.replace(/Last updated: .*/, `Last updated: ${new Date().toISOString()}`);
            fs.writeFileSync(memPath, mem, 'utf-8');
            saveMemory(mem);
          } catch (e) { console.error('[Compaction] File write error:', e.message); }
        }
      } catch (e) { console.error('[Compaction] Error:', e.message); }
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
    // Lowered threshold from 200 → 60 chars so voice replies (which are intentionally
    // short, 1-3 sentences) actually trigger fact extraction. Without this, voice
    // conversations never wrote to kiko_personal_context — Sunny told Kiko about his
    // daughters via voice and Kiko could not recall them in the next session.
    // Also force extraction when user message contains explicit memory cues.
    const memoryCueRegex = /\b(remember|save|note|don'?t forget|commit to memory|my (daughter|son|wife|husband|partner|kid|child|mum|mom|dad|brother|sister)|i (live|work|like|love|hate|prefer|need|want))\b/i;
    const hasMemoryCue = memoryCueRegex.test(message || '');
    if (isRegistered && !['navigate', 'screen'].includes(intent) && (responseText.length > 60 || hasMemoryCue || (message || '').length > 40)) {
      try {
        const extract = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 400,
          system: `You extract VERIFIABLE FACTS that the user EXPLICITLY STATED in this exchange. Return ONLY JSON.

═══ ABSOLUTE RULES ═══
1. ONLY extract facts the user DIRECTLY SAID. If you have to infer, guess, or reason about it — DO NOT extract.
2. NEVER hallucinate or invent facts. If the user didn't say "I have a son", you cannot extract "has a son".
3. NEVER extract behavioural descriptions, work styles, business pressures, or psychological observations.
4. NEVER extract transient state (unread email counts, overdue tasks, "waiting N days").
5. EMPTY ARRAYS ARE THE CORRECT ANSWER if the conversation has no concrete facts.

═══ EXTRACT — only these kinds of facts ═══
✓ Specific named people: "User's daughter is Maya, born 12 March 2020"
✓ Specific named places: "User lives in Weybridge, UK"
✓ Specific named companies/deals: "User is working on Haas F1 cybersecurity sponsorship with Decagon"
✓ Explicit preferences user STATED: "User prefers all financials in USD" (only if user said so)
✓ Specific calendar events: "Decagon call scheduled 18 April 2026"

A valid fact must contain AT LEAST ONE of:
- A proper noun (a real-world name like Maya, Weybridge, Cloudflare, Haas)
- A specific date or number
- A direct quote from the user

═══ NEVER EXTRACT — these are not facts ═══
✗ "User values execution discipline" (psychological)
✗ "User exhibits decision addiction" (psychological)
✗ "Working on sales pipeline management" (vague action)
✗ "Pursuing sports tech and semiconductor strategy" (vague behaviour)
✗ "Under significant business pressure" (subjective)
✗ "Uses AI assistance for tasks" (obvious/meaningless)
✗ "Works in fast-paced environment" (filler)
✗ "Has 19 overdue tasks" (transient state, will change tomorrow)
✗ "Has been waiting 254 days for a deal" (transient state)
✗ "Has unread emails requiring attention" (transient state)
✗ "Planning activities for next week" (single-conversation context)
✗ "User has a son" (HALLUCINATION if user didn't explicitly say so — never invent family)
✗ Anything starting with: "User values", "User works on", "User manages", "User focuses", "User pursues", "User cycles", "User deals with", "Working on", "Pursuing", "Managing", "Cycling", "Dealing with", "Focuses on", "Style:", "Approach:", "Manner:"

═══ HALLUCINATION GUARD ═══
You are NOT a creative writer. You are an extractor. If the user says "Hi" you do NOT extract "User is referred to as Sunny" — there's nothing to extract.
If you find yourself generating a fact the user didn't explicitly state, STOP and remove it.
RETURN EMPTY ARRAYS rather than padding with weak inferences.

═══ JSON FORMAT ═══
{
  "facts": [],
  "entity": null,
  "personal": [],
  "unknown_topics": [],
  "category": "business|personal|mixed"
}`,
          messages: [{ role: 'user', content: `Q: ${message.slice(0, 300)}\nA: ${responseText.slice(0, 1000)}` }],
        });
        const parsed = JSON.parse((extract.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

        // ─── MULTI-CRITERIA LOW-VALUE FILTER (v0.0.41) ───
        // Defence in depth: even if Haiku ignores the prompt, these patterns get blocked.
        //
        // Filter passes:
        //   1. SPECULATION_REGEX  — psychological inferences ("User exhibits/appears/etc")
        //   2. SPECULATION_KEYWORDS — behavioural descriptors anywhere in the value
        //   3. BEHAVIOURAL_PATTERN — sentence patterns ("Working on X", "Pursuing X", "Focuses on")
        //   4. TRANSIENT_STATE — counts/numbers that change daily (unread/overdue/waiting N days)
        //   5. BEHAVIOURAL_VERB_START — capitalized verb starts (Demonstrates, Sets, Manages, etc.)
        //   6. STRAGGLER_PATTERNS — adverb starts, "Currently/Actively", outstanding tasks, deadline pressure
        //   7. META_NARRATIVE — confidence metrics, "(message cut off)", psychological framings
        //   8. CONCRETENESS_CHECK — must contain a digit, $, @, OR a non-blacklist proper noun mid-sentence
        //
        // Together these block all patterns found in the v0.0.41 audit (1000+ row sample, 642 rows removed).

        const SPECULATION_REGEX = /^(user|the user|sunny)\s+(exhibits|shows|appears|may|might|tends|seems|has\s+pattern|has\s+execution\s+gap|needs\s+accountability|is\s+experiencing|is\s+procrastinating|is\s+relitigating)/i;

        const SPECULATION_KEYWORDS = /(struggles?|avoids?|exhibits?|experienc(es|ing)|paralys|procrastinat|tendency|tends?\s+to|tends?\s+toward|fatigue|addiction|pattern\s+of|pattern\s+around|behaviou?r|hesitat|indecis|may\s+be|might\s+be|appears?\s+to|seems?\s+to|would\s+benefit|could\s+benefit|lacks?\s+|suffers?\s+from|neglect|overthinking|re-?evaluat|reframes?|reframing|inclination|compulsiv)/i;

        const BEHAVIOURAL_PATTERN = /^(user\s+)?(values?\s|works\s+on|works\s+in|manages\s+(multiple|sales|pipeline|high-priority|f1)|pursues?\s|pursuing\s|focuses?\s+on|focuses?\b|uses?\s+(ai|kiko|tools?)|deals?\s+with|cycling|cycles?|dealing\s+with|under\s+(significant|severe)|focused\s+on|focus\s+is|style\s*:|approach\s*:|manner\s*:|planning\s+activities)/i;

        const TRANSIENT_STATE = /\b(\d+\+?\s*(unread|overdue|stale|pending|missed|late|outstanding)|wait(ed|ing)?\s+\d+\s+days?|been\s+waiting\s+\d+|has\s+\d+\s+(unread|overdue|tasks?|deals?|emails?)\s+requir|requir(ing|es)\s+(urgent|immediate)\s+attention|has\s+pending\s+draft\s+email|deadline\s+pressure|tax\s+pressure)/i;

        const BEHAVIOURAL_VERB_START = /^(demonstrates?|sets?|handles?|generates?|generated|operates?|maintains?|engages?|interacts?|performs?|executes?|organi[sz]es?|tracks?|monitors?|reviews?|coordinates?|conducts?|implements?|develops?|drives?|leads?|owns?|holds?|builds?|creates?|initiates?|provides?|offers?|receives?|sends?|reports?|evaluates?|considers?|plans?|decides?|shows?|represents?|indicates?|reflects?|chooses?|picks?|selects?|takes?|gives?|makes?|gets?|finds?|seeks?|wants?|needs?|requires?|demands?|expects?|believes?|thinks?|feels?|knows?|understands?|recogni[sz]es?|notices?|observes?|describes?|explains?|tells?|asks?|answers?|responds?|comments?|notes?|mentions?|states?|declares?|announces?|discusses?|debates?|argues?|claims?|asserts?|insists?|denies?|admits?|accepts?|rejects?|approves?|agrees?|disagrees?|opposes?|supports?|endorses?|recommends?|suggests?|proposes?|advocates?|advises?|warns?|encourages?|invites?|welcomes?|greets?|thanks?|apologi[sz]es?|congratulates?|celebrates?|praises?|criticizes?|complains?|protests?|objects?|questions?)\s/i;

        const STRAGGLER_PATTERNS = /^((currently|actively|recently|previously|generally|typically|usually|often|sometimes|always|never|rarely|frequently|occasionally|consistently|increasingly|gradually|primarily|mainly|mostly|largely|partially|completely|fully|partly|approximately)\s|(involved|engaged|invested|focused|dedicated|committed|interested|familiar|experienced|skilled|capable|qualified|trained)\s+(in|with|at|on)\s|(current|recent|previous|past|future|upcoming|next|prior)\s+(challenge|priority|focus|goal|task|issue|problem|concern|item)\s*:|(role|responsibility|position|title)\s*:|(work\s+style|working\s+style)\s*[:|\b])/i;

        const META_NARRATIVE = /(confidence\s+metric|0\.\d{2}\s+confidence|\(message\s+cut\s+off|potential\s+\w+\s+anxiety|potential\s+\w+\s+inefficiency|^decision-making\s+(style|follows|pattern)|suggests\s+interest\s+in|uses\s+it\s+as\s+timing\s+reference|tracking\s+\d+k?\s+(memory|context|conversation))/i;

        // Concreteness: must contain a digit, $, @, OR a non-blacklist proper noun
        // (capitalized 4+ letter word that's not the first word and not a generic verb)
        const CONCRETE_BLACKLIST = new Set([
          'User', 'Sunny', 'Has', 'The', 'This', 'That', 'These', 'Those',
          'Working', 'Pursuing', 'Managing', 'Dealing', 'Cycling', 'Pipeline',
          'Focuses', 'Focused', 'Under', 'Uses', 'Two', 'One', 'Currently',
          'Actively', 'Recently', 'Involved', 'Engaged', 'Decision',
          'Tracking', 'Tracks', 'Targets', 'Maintains', 'Generates',
          'Demonstrates', 'Shows', 'Indicates', 'Reflects', 'Suggests',
        ]);
        const hasConcreteness = (str) => {
          if (/[\d@$]/.test(str)) return true;
          // Find capitalized words ≥4 chars NOT at the very start of the string
          // (sentence-starting words don't count as proper nouns)
          const tail = str.replace(/^\S+\s*/, '');  // strip first word
          const matches = tail.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [];
          return matches.some(w => !CONCRETE_BLACKLIST.has(w));
        };

        const isLowValue = (str) => {
          if (!str || typeof str !== 'string') return true;
          if (str.length < 15) return true;
          const trimmed = str.trim();
          if (SPECULATION_REGEX.test(trimmed)) return true;
          if (SPECULATION_KEYWORDS.test(str)) return true;
          if (BEHAVIOURAL_PATTERN.test(trimmed)) return true;
          if (TRANSIENT_STATE.test(str)) return true;
          if (BEHAVIOURAL_VERB_START.test(trimmed)) return true;
          if (STRAGGLER_PATTERNS.test(trimmed)) return true;
          if (META_NARRATIVE.test(str)) return true;
          if (!hasConcreteness(str)) return true;
          return false;
        };

        // Save facts to learning log (filtered)
        for (const fact of (parsed.facts || []).slice(0, 3)) {
          if (isLowValue(fact)) continue;
          await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
            user_id: userId,
            category: 'auto_learning', content: fact,
            entity_name: parsed.entity || null, user_message: message.slice(0, 200),
          })});
        }

        // Save personal context (filtered + dedup against last 30 days)
        for (const personal of (parsed.personal || []).slice(0, 3)) {
          if (isLowValue(personal)) continue;
          // Dedup: check if this fact (or a near-identical one) was already saved recently
          const normKey = personal.slice(0, 50);
          const existing = await sbFetch(
            `kiko_personal_context?user_id=eq.${userId}&key=eq.${encodeURIComponent(normKey)}&created_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}&select=id&limit=1`
          ).catch(() => []);
          if (Array.isArray(existing) && existing.length > 0) continue;  // already have it
          await sbFetch('kiko_personal_context', { method: 'POST', body: JSON.stringify({
            user_id: userId, category: 'inferred', key: normKey, value: personal, source: 'conversation',
          })});
        }

        // Queue unknown topics for curiosity learning (also filtered)
        for (const topic of (parsed.unknown_topics || []).slice(0, 2)) {
          if (isLowValue(topic)) continue;
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
    try { finishResponse(); } catch {}
  }
}
