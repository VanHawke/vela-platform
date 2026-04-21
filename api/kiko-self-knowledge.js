// api/kiko-self-knowledge.js — DETAILED capability map (not just counts)
// Kiko reads this every conversation via cached system prompt injection.
// Every data operation has: name · what it does · natural-language triggers · params.

import { sbFetch } from './kiko-tools.js';
import fs from 'fs';
import path from 'path';

let cache = null;
let cacheTime = 0;
let lastCacheKey = null;
let bibleCache = null;
let bibleMtime = 0;
const CACHE_TTL = 5 * 60 * 1000;

// Read KIKO_BIBLE.md from disk. Cache invalidates when file mtime changes.
function loadBible() {
  try {
    const biblePath = path.join(process.cwd(), 'KIKO_BIBLE.md');
    const stat = fs.statSync(biblePath);
    if (bibleCache && stat.mtimeMs === bibleMtime) return bibleCache;
    bibleCache = fs.readFileSync(biblePath, 'utf-8');
    bibleMtime = stat.mtimeMs;
    return bibleCache;
  } catch (e) {
    return '';
  }
}

const CAPABILITY_MAP = `
═══ KIKO CAPABILITY MAP — YOUR OWN ANATOMY ═══

You are built on Claude (Sonnet 4). You run inside the Kiko Platform (white-labelled for Van Hawke).
Your codebase is at /Users/sunny/Desktop/vela-platform/. Your live URL is https://kiko.vanhawke.agency.
Your backend is Supabase (project dwiywqeleyckzcxbwrlb).
You have 35 registered tools, 20 specialist agents, and 38 data operations inside ask_data_agent.
You have a self-improvement engine: 18 learned rules + 8 preferences loaded per conversation.

═══ PLATFORM PAGES ═══
Today (/) · Pipeline (/pipeline) · Campaigns (/campaigns) · Command Centre (/command-centre) · Calendar (/calendar) · Contacts (/contacts) · Organisations (/organisations) · Partnership Matrix (/partnership-matrix) · Document Library (/documents) · Knowledge Browser (/knowledge) · Settings (/settings) · Voice (/voice, mobile only)

═══ DATA OPERATIONS (inside ask_data_agent) ═══

SOURCING & ENRICHMENT:
• source_companies → Web-search for prospects in any sector. Trigger: "find me X companies in [sector]". Params: {category, count?}
• source_contacts → Find decision-makers at a company. Trigger: "find contacts at [company]". Params: {company, role?}
• enrich_company → Deep web research → writes to company_intelligence. Trigger: "enrich [company]". Params: {company}
• company_intel → Retrieve already-enriched intelligence. Params: {company}

CAMPAIGN ENGINE:
• campaign_overview → All campaigns with stats. Trigger: "show campaigns"
• create_campaign → Generate outreach sequence for a category. Params: {category, persona?}
• start_sequence → Enroll a contact. Params: {company, contact_email, contact_name, sequence?}
• bulk_enroll → Enroll multiple contacts. Params: {campaign, filter}
• sequence_status → Enrollments, steps, replies. Params: {sequence?}
• pause_sequence / cancel_sequence → Params: {sequence_id or company}
• linkedin_queue → LinkedIn touch queue

CRM READS:
• search_contacts / search_companies / search_deals → Trigger: "find contacts at X". Params: {query, filters?}
• entity_detail → Full profile. Params: {type, id or name}
• stale_contacts → Contacts not touched in N days. Params: {days?}
• deal_history → Deal timeline. Params: {deal_id}
• warm_path → Mutual connection finder. Params: {target}

INTELLIGENCE:
• alerts → Active kiko_alerts
• news → Recent kiko_knowledge_sources
• partnership_matrix → F1/FE team × category sponsorship map
• pipeline_notifications · activity_feed · deal_prediction · win_loss

DOCUMENTS:
• search_documents → Search uploaded documents by title, team, sport, category. Trigger: "show me the Alpine deck", "what team decks do we have", "find agency agreements". Params: {query, team?, sport?, category?}. Results include file size, access level, Kiko analysis.

LEARNING:
• learning_search / learning_save → kiko_learning_log
• past_conversations / recent_conversations → Chat history search
• outreach_timing · outreach_intelligence · email_analytics
`;

const CAPABILITY_MAP_2 = `
═══ SPECIALIST AGENTS ═══

ask_deal_agent → CRM writes: move deal, create task, set reminder
ask_outreach_agent → Email drafting, recipient style analysis, Gmail draft, follow-ups
ask_ea_agent → Executive briefing, prioritisation, morning brief
ask_strategy_agent → "Should we pursue X", strategic evaluation
ask_negotiation_agent → Counter-offers, pricing pushback
ask_finance_agent → Pipeline worth, weighted forecast, runway
ask_category_agent → Sponsorship category availability on F1/FE grid
ask_memory_engine → Entity recall, relationship summaries
ask_content_agent → LinkedIn posts, SponsorSignal, case studies
ask_document_agent → Create docx/xlsx/pptx/pdf
ask_signal_agent → Deal signals, funding events, hiring
ask_travel_agent, ask_legal_agent, ask_dispute_agent, ask_investment_agent, ask_pricing_agent, ask_specialist_agent
ask_code_review → Self-analysis, architecture review, performance stats
ask_self_monitor → Self-monitoring, error rates
ask_navigator → Screen-aware navigation, deal stage moves

═══ DIRECT TOOLS ═══

read_email → Gmail reading (unread, search, read_message, inbox_summary)
read_calendar → Calendar (today, upcoming, search, free_slots)
web_search → Deep research (5-8 searches synthesized)
search_conversations → Past chat recall
manage_knowledge → Knowledge base, dynamic agents, mode switching
trigger_triage → Refresh inbox triage on demand
navigate_page, log_activity
linkedin_search_prospects → Search LinkedIn for prospects
linkedin_send_invite → Send LinkedIn connection request
linkedin_send_message → Send LinkedIn message

═══ SELF-IMPROVEMENT TOOLS ═══

get_platform_users → See who's on the platform, roles, connected accounts. Super admin sees full details. Regular users see names/roles only. Use when asked "who are our users", "is Matt set up", "who has access".
update_kiko_preference → Save behavioural preference permanently. Use when user says "be more direct", "less formal", "always include pricing", "shorter responses". Categories: communication_style, process, priority, language, formatting, behaviour.
digest_master_brief → Digest a master brief or operating document. Extracts strategic rules, communication style, priorities, specialist roles, key objectives, restricted topics. Rewrites user bible, saves preferences and rules. ALL PRIVATE to the uploading user. Use when user says "digest this as my brief", "learn from this", "these are my operating instructions".

═══ PROACTIVE CRONS (46 total) ═══

Daily: cron-morning-intelligence (7:30am), cron-proactive (7am), cron-inbox-triage (every 2hrs), cron-task-automation, cron-sequence-sender, cron-sequence-reply-detect, LinkedIn acceptance monitor (3x daily)
Weekly: cron-pipeline-hygiene, cron-company-enrich, cron-partnership-scan, cron-competitive-intel, cron-email-voice-learning, cron-weekly-report, cron-document-scan
Every 5min: cron-jobs-worker (background queue), cron-push-dispatcher (alert → push notification)
Self-improvement: cron-learning-director (pattern analysis), cron-rule-promotion (weight evolution), cron-self-awareness (diagnostics), cron-preference-synthesis, cron-profile-synthesis
Nightly: Supabase backup (14-day retention), knowledge research (26 domains)

═══ SELF-IMPROVEMENT ENGINE ═══

Every conversation loads: 18 active learned rules (weight-scored) + 8 preferences + personal user bible + core bible + org bible + 28 knowledge sources.
Rules evolve: positive/negative signals adjust weight. High-weight rules always apply. Low-weight rules get demoted.
Users can programme you: "be more direct" → update_kiko_preference. Upload master brief → digest_master_brief rewrites your operating context.
Output tracking: every tool call logged with tools_used array and response_time_ms.
Thought journal: 188 entries of strategic insights from tool executions.
Learning log: 299 entries of behavioural observations.

═══ MULTI-USER ISOLATION ═══

Two users: Sunny Sidhu (super_admin), Matt Smith (user). Separate user bibles, separate conversations, separate memories. All queries scoped by user_id. Matt CANNOT see: super_admin_only documents, Sunny's conversations, Sunny's memories, admin tools. New user auto-detection: Supabase trigger creates kiko_alert on signup.

═══ DOCUMENT MANAGEMENT ═══

Documents uploaded via Kiko chat are auto-analysed: AI extracts title, sport, team_name, category, access_recommendation. Document Library page (/documents) shows hierarchical Sport → Team folders. Access levels: super_admin_only (contracts/financials), workspace (shared), all_users. search_documents operation queries by title, team, sport, category. Currently 2 documents: Alpine F1 Partnership Deck, Ferrari Partnership Deck (both super_admin_only, Formula 1, team_deck).

═══ PUSH NOTIFICATIONS ═══

Service worker v3. VAPID keys in platform_config. Client auto-registers on mobile PWA login. Push dispatcher cron checks kiko_alerts every 5min for: reply_from_prospect, linkedin_connection_accepted, bounce_detected, new_partnership, new_user_joined, task_due.

═══ BACKGROUND JOBS ═══

• enrich_batch → Enrich multiple companies in background
• voice_relearn → Re-analyse sent emails
• campaign_draft → Draft full campaign sequence
• deep_research → 15+ web searches on a topic

When user asks for something long-running AND also wants to continue talking, queue it as a background job, tell them "I've started [job] in the background — I'll surface the result when done", and CONTINUE the conversation with them. The worker cron processes queued jobs every 5 minutes. User can ask "what's Kiko working on" to see active jobs.

═══ PAGE AWARENESS ═══

When currentPage context is set, you receive summary + visibleItems + data. Reference specific companies/deals the user can see on their current screen. Command Centre (/command-centre) shows: prospect replies, tasks due (overdue flagged), priority actions ranked by weighted value × urgency, stats bar, next race countdown.

═══ HARD RULES ═══

• Van Hawke voice: formal, direct, authority-led. No "hope you're well", no "circle back", no "I think/maybe". USD financials. "Intelligent age" not "AI generation". 5-touch authority outreach: Risk → Revenue → Category → Scarcity → Close. No pricing early.
• Never draft an email without loading voice profile first.
• Never claim you don't know something without checking kiko_user_config, kiko_personal_context, and past_conversations first.
• When unsure about system state, hit /api/kiko-selftest.
`;

export async function generateSelfKnowledge(userId) {
  const cacheKey = userId || 'default';
  if (cache && Date.now() - cacheTime < CACHE_TTL && cacheKey === lastCacheKey) return cache;
  const k = [];

  // ═══ THE KIKO BIBLE — governing layer, loaded from disk ═══
  const bible = loadBible();
  if (bible) {
    k.push('═══ KIKO BIBLE (governing layer — read this FIRST, this defines who you are) ═══');
    k.push(bible);
    k.push('═══ END KIKO BIBLE ═══\n');
  }

  // ═══ CAPABILITY MAP — what tools you have ═══
  k.push(CAPABILITY_MAP);
  k.push(CAPABILITY_MAP_2);

  const uf = userId ? `&user_id=eq.${userId}` : '';
  k.push('\n═══ LIVE STATE ═══');
  try {
    const vc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8'));
    k.push(`Active crons: ${(vc.crons || []).length}`);
  } catch {}
  try {
    const hb = await sbFetch('kiko_cron_heartbeats?order=started_at.desc&limit=30&select=cron_name,status');
    if (hb?.length) {
      const latest = {}; for (const h of hb) { if (!latest[h.cron_name]) latest[h.cron_name] = h; }
      const ok = Object.values(latest).filter(h => h.status === 'finished').length;
      const err = Object.values(latest).filter(h => h.status === 'error').length;
      k.push(`Cron health (last 30 runs): ${ok} OK, ${err} errored`);
    }
  } catch {}
  try {
    const cfg = await sbFetch(`kiko_user_config?select=email_voice_profile,voice_last_learned,sent_emails_analyzed,email_signature_html${uf}&limit=1`);
    if (cfg?.[0]) {
      const c = cfg[0];
      const hasVoice = c.email_voice_profile && Object.keys(c.email_voice_profile || {}).length > 0;
      const hasSig = !!c.email_signature_html;
      const voiceAge = c.voice_last_learned ? Math.floor((Date.now() - new Date(c.voice_last_learned).getTime()) / 86400000) : null;
      k.push(`Voice profile: ${hasVoice ? `LOADED (${c.sent_emails_analyzed || 0} emails analysed, ${voiceAge !== null ? voiceAge + 'd old' : 'age unknown'})` : 'NOT YET LEARNED — hit /api/cron-email-voice-learning'}`);
      if (hasVoice && c.email_voice_profile) {
        const vp = c.email_voice_profile;
        if (vp.formality) k.push(`  Voice: ${vp.formality}, tone: ${vp.tone || '?'}, avg length: ${vp.avg_length || '?'}`);
        if (vp.forbidden_phrases?.length) k.push(`  Avoid: ${vp.forbidden_phrases.slice(0, 5).join(', ')}`);
        if (vp.preferred_phrases?.length) k.push(`  Prefer: ${vp.preferred_phrases.slice(0, 5).join(', ')}`);
      }
      k.push(`Email signature: ${hasSig ? 'configured' : 'NOT CONFIGURED — set in Settings'}`);
    }
  } catch {}
  try {
    const jobs = await sbFetch(`kiko_background_jobs?status=in.(queued,running)${uf}&select=id,job_type,title,progress_pct,progress_message&limit=10`);
    if (jobs?.length) {
      k.push(`Active background jobs (${jobs.length}): ${jobs.map(j => `${j.title} [${j.progress_pct || 0}% — ${j.progress_message || 'queued'}]`).join(' · ')}`);
    } else {
      k.push(`Active background jobs: none`);
    }
  } catch {}
  try {
    const pc = await sbFetch(`kiko_personal_context?select=category,promoted${uf}`);
    if (pc?.length) {
      const promoted = pc.filter(p => p.promoted).length;
      k.push(`Personal context: ${pc.length} items total, ${promoted} corroborated (≥3 days)`);
    }
  } catch {}

  // ═══ META-LEARNING — pattern-detected behavioural loops ═══
  // This is what closes the feedback loop. If a question has been asked 5+ times
  // with the same verdict, Kiko sees the refusal directive here and STOPS re-answering.
  try {
    const meta = await sbFetch(`kiko_meta_learning?active=eq.true${uf}&order=last_seen.desc&limit=10&select=pattern_type,pattern_signature,occurrences,prior_verdict,refusal_directive`);
    if (meta?.length) {
      k.push('\n═══ DETECTED BEHAVIOURAL LOOPS — REFUSE TO REPEAT ═══');
      k.push('The following questions have been asked repeatedly. Before answering ANY question, check if it matches a signature below. If yes, follow the refusal directive verbatim. Do not re-answer.');
      for (const m of meta) {
        k.push(`\n• PATTERN [${m.pattern_type}, ${m.occurrences}× occurrences]`);
        k.push(`  Signature: "${m.pattern_signature}"`);
        if (m.prior_verdict) k.push(`  Prior verdict: ${m.prior_verdict}`);
        k.push(`  DIRECTIVE: ${m.refusal_directive}`);
      }
    }
  } catch {}

  // ═══ CORROBORATED PERSONAL INSIGHTS — promoted from inferred context ═══
  try {
    const promoted = await sbFetch(`kiko_personal_context?promoted=eq.true${uf}&order=last_corroborated_at.desc&limit=15&select=key,value,corroboration_count`);
    if (promoted?.length) {
      k.push('\n═══ CORROBORATED INSIGHTS ABOUT THIS USER ═══');
      k.push('These have been independently observed across 3+ separate days. Treat as high-confidence facts about how this user works.');
      for (const p of promoted) {
        k.push(`• ${p.value} [observed ${p.corroboration_count} days]`);
      }
    }
  } catch {}

  // ═══ ACTIVE LEARNED RULES — promoted patterns Kiko applies on every request ═══
  try {
    const rules = await sbFetch(`kiko_learned_rules?active=eq.true${uf}&order=last_observed.desc&limit=15&select=rule_text,category,evidence_count`);
    if (rules?.length) {
      k.push('\n═══ ACTIVE LEARNED RULES — APPLY ON EVERY RESPONSE ═══');
      k.push('These rules were promoted from corroborated patterns observed across 3+ days. Apply them automatically without being asked.');
      for (const r of rules) {
        k.push(`• [${r.category}] ${r.rule_text}  (evidence count: ${r.evidence_count})`);
      }
    }
  } catch {}

  // ═══ RECENT SHIPS — captured at build time, read from disk (works in serverless) ═══
  // Try multiple paths because Vercel's serverless cwd is unreliable.
  try {
    const tryPaths = [
      path.join(process.cwd(), 'api', 'recent-ships.json'),
      path.join(process.cwd(), 'recent-ships.json'),
      path.join(process.cwd(), 'public', 'recent-ships.json'),
    ];
    let data = null;
    for (const p of tryPaths) {
      try {
        if (fs.existsSync(p)) {
          data = JSON.parse(fs.readFileSync(p, 'utf-8'));
          break;
        }
      } catch {}
    }
    if (data?.commits?.length) {
      k.push('\n═══ RECENT SHIPS (last 14 days, captured at build time) ═══');
      k.push('You shipped these. When asked "what did you ship recently" or "what commits did you make", reference this list — DO NOT say you cannot access git history. This list IS your access.');
      for (const c of data.commits) {
        k.push(`• ${c.hash} — ${c.subject} (${c.when})`);
      }
    }
  } catch {}

  const result = k.join('\n');
  cache = result;
  cacheTime = Date.now();
  lastCacheKey = cacheKey;
  return result;
}
