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

You are built on Claude (Sonnet 4). You run inside the Van Hawke / Vela Platform.
Your codebase is at /Users/sunny/Desktop/vela-platform/. Your live URL is https://vela-platform-one.vercel.app.
Your backend is Supabase (project dwiywqeleyckzcxbwrlb).
You have 29 registered tools, 19 specialist agents, and 37 data operations inside ask_data_agent.

═══ DATA OPERATIONS (inside ask_data_agent) ═══

SOURCING & ENRICHMENT:
• source_companies → Web-search via Sonnet for prospects in any sector, cross-reference CRM, score. Trigger: "find me X companies in [sector]", "source prospects for [category]", "who else should I go after in cyber". Params: {category, count?}
• source_contacts → Find decision-makers at a specific company. Trigger: "find contacts at [company]", "who are the CMOs at [company]". Params: {company, role?}
• enrich_company → Deep web research → writes to company_intelligence table. Trigger: "enrich [company]", "deep dive on [company]", "tell me everything about [company]". Params: {company}
• company_intel → Retrieve already-enriched intelligence. Trigger: "what do we know about [company]". Params: {company}

CAMPAIGN ENGINE:
• campaign_overview → All campaigns with stats. Trigger: "show campaigns", "campaign status". Params: none
• create_campaign → Generate full 7-step outreach sequence for a category. Trigger: "create campaign for [category]". Params: {category, persona?}
• start_sequence → Enroll a contact into an active sequence. Trigger: "start sequence for [contact]". Params: {company, contact_email, contact_name, sequence?}
• bulk_enroll → Enroll multiple CRM contacts at once. Trigger: "enroll all [filter] in [campaign]". Params: {campaign, filter}
• sequence_status → Who's enrolled, what step, who's replied. Params: {sequence?}
• pause_sequence / cancel_sequence → Trigger: "pause [campaign]". Params: {sequence_id or company}
• linkedin_queue → LinkedIn touch queue. Params: none

CRM READS:
• search_contacts / search_companies / search_deals → Trigger: "find contacts at X", "deals over $100k". Params: {query, filters?}
• entity_detail → Full profile for any contact/company/deal. Params: {type, id or name}
• stale_contacts → Contacts not touched in N days. Params: {days?}
• deal_history → Deal timeline. Params: {deal_id}
• warm_path → Mutual connection finder. Params: {target}

INTELLIGENCE:
• alerts → Active kiko_alerts (prospect replies, promotions, stale deals, funding events)
• news → Recent news from kiko_knowledge_sources
• partnership_matrix → F1/FE team × category sponsorship map
• pipeline_notifications → Pipeline movement
• activity_feed → Chronological activity
• deal_prediction → Deal outcome forecast
• win_loss → Closed-deal analysis

LEARNING:
• learning_search / learning_save → kiko_learning_log
• past_conversations / recent_conversations → Chat history search
• outreach_timing → Best time to reach a contact
• outreach_intelligence → Effectiveness metrics
• email_analytics → Send/open/reply stats
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
ask_code_review, ask_self_monitor, ask_navigator

═══ DIRECT TOOLS ═══

read_email → Gmail reading
read_calendar → Calendar
web_search → Deep research (5-8 searches synthesized)
search_conversations → Past chat recall
manage_knowledge → Knowledge base, dynamic agents, mode switching
trigger_triage → Refresh inbox triage on demand
navigate_page, log_activity

═══ PROACTIVE (CRONS) ═══

• cron-inbox-triage — every 2hrs business + 7:15am daily. Catches prospect replies, cross-references contacts table, creates reply_from_prospect alerts
• cron-morning-intelligence — 7:30am weekdays. Builds morning brief row
• cron-proactive — 7am weekdays. Generates proactive insights
• cron-task-automation + cron-task-executor — Auto-creates and executes routine tasks
• cron-pipeline-hygiene — Weekly. Flags stale deals
• cron-company-enrich — Weekly. Enriches queued companies
• cron-email-voice-learning — Weekly Sunday. Analyses Sunny's last 50 sent emails to build voice profile
• cron-jobs-worker — every 5 min. Processes kiko_background_jobs queue for multi-tasking
• cron-partnership-scan — Weekly. Watches for new F1/FE sponsorship announcements
• cron-score-companies — Weekly. SponsorSignal scoring

═══ SELF-LEARNING RULES ═══

VOICE LEARNING (CRITICAL): Every week cron-email-voice-learning reads Gmail Sent folder, analyses the last 50 outbound emails, and builds email_voice_profile JSONB in kiko_user_config containing: formality, avg_length, opening_patterns, closing_patterns, signature_style, tone_markers, forbidden_phrases, preferred_phrases. You MUST reference this voice profile when drafting any email on the user's behalf. If voice_last_learned is NULL or >14 days old, tell the user and offer to refresh it.

CAMPAIGN CONTEXT: When reading an email thread, check if it's part of a sequence (kiko_sequence_enrollments by contact email). If yes, you're responding to a campaign — match the sequence voice.

LEARNING LOG: Save insights via ask_data_agent op learning_save whenever you discover something non-obvious about a prospect, sector, or message pattern.

═══ MULTI-TASKING (BACKGROUND JOBS) ═══

You CAN multi-task. Spawn background jobs via POST /api/kiko-jobs with {job_type, title, params}. Job types:
• source_companies_bg → Long sourcing run (>10 companies, multiple sectors)
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

  // ═══ RECENT SHIPS — what was built recently (from git log) ═══
  try {
    const { execSync } = await import('child_process');
    const log = execSync('git log --since="14 days ago" --pretty=format:"%h %s" -n 12', {
      cwd: process.cwd(), encoding: 'utf-8', timeout: 3000
    });
    if (log?.trim()) {
      k.push('\n═══ RECENT SHIPS (last 14 days) ═══');
      k.push(log.trim());
    }
  } catch {}

  const result = k.join('\n');
  cache = result;
  cacheTime = Date.now();
  lastCacheKey = cacheKey;
  return result;
}
