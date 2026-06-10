# KIKO MEMORY — Session 70 (June 10 2026)

## WHAT YOU ARE
Claude Opus 4.8, strategic operating partner for Van Hawke Group.
8 operational rules including Rule 7 (verification) and Rule 8 (signal classification).
Self-evolution via kiko_self_modify (path: /home/kiko/kiko-worker).

## RULES SUMMARY
1. Substance first. 2. Use tools for data. 3. Execute immediately. 4. Clean format.
5. Push back with evidence. 6. F1 values $3M-$40M. 7. VERIFY — never assert from memory.
8. SIGNAL CLASSIFICATION — outbound provenance required before flagging prospect replies.

## ARCHITECTURE (Session 69 — verified)
- 5 focused data tools: crm_search, campaign_engine, pipeline_analytics, knowledge_ops, goals_intents
- ask_data_agent kept for backward compatibility
- Classification crons: Sonnet (heartbeat, inbox-triage, event-processor)
- Deal + outreach agents: Sonnet
- Reasoning engine: HYBRID — runs DB-only for email/outreach, disabled otherwise (Rule 7)
- Daily intelligence cron: single 3-phase (Ingest/Reason/Publish), replaces 4 separate crons

## CRITICAL FIXES (Session 69)
- casualQuery regex: unbounded words (buy/read/book/order) were silently stripping tools+context
- self_modify path: was /home/kiko/vela-platform (stale), now /home/kiko/kiko-worker (live)
- Email drafting: always Opus, never Haiku. Full 47 tools available for all requests.
- Provenance check: email-monitor.js + cron-inbox-triage.js check outbound history before flagging
- Memory decay: stale entries flagged in memory-engine.js recall

## PLATFORM STATUS
- 18 crons (down from 22), 3 calling Claude API (down from 7)
- Estimated monthly API cost: ~$35 (down from ~$70)
- LinkedIn monitoring: Playwright-based, both accounts, every 30min
- CRM enrichment: Apollo primary (credits exhausted on free plan), web search fallback
- Email verification: DNS + Apollo dual-layer in enrollment pipeline
- Apollo API key configured in server .env
- MCP connectors (Lusha, Vibe, Bigdata, Ramp): Claude.ai only, not available via API

## COMMAND CENTRE
6 tabs: Signals, Outreach, Schedule, Follow-ups, Campaigns, Discover.
Hidden from Matt via page permissions. Only Sunny (super_admin) can see it.

## EMAIL + LINKEDIN
All 4 Google accounts have FULL scope including mail.google.com. Matt CAN send drafts.
LinkedIn sessions alive via Playwright + Decodo proxy. Voyager API blocked, Playwright works.
Ambient monitoring: detects messages + connection accepts, auto-drafts responses.

## CRM DATA (verified June 10 2026 — deep audit complete)
- Total: 4,233 contacts | Tier 1: 840 | Tier 2: 1,868 | Tier 3: 1,064 | Tier 4: 461
- Tier 1 fully campaign-ready (email + LinkedIn): 769 (91.5%)
- Tier 1 email-only (need LinkedIn at enrol time): 70 | Tier 1 no email: 1 (Kypros Zoumidou, Capital.com)
- All Tier 1 emails Hunter.io verified or on catch-all domains. 27 inferred emails tested, 11 corrected.
- 47+ companies web-verified. 6 leadership changes caught. 73 Haiku-garbage records cleaned.
- 16 email/company mismatches flagged + demoted to Tier 3.
- LinkedIn lives in TWO fields: linkedinUrl AND linkedin — always check both.

- 2026-06-10: Multiple facts here. The most significant strategic/decision fact:; ; Brain model decision: Staying on Opus 4.8 ($5/$25); Fable 5 ($10/$50) was evaluated and rejected.
- 2026-06-10: cron-crm-enrich was not disabled on June 9; it kept running June 8-10 (3:00-3:49am), causing the June 10 credit outage and failed 6am briefing, and was only truly killed June 10.
## OPERATIONAL HEALTH
- All systems online

## GROWTH MANDATE (permanent — Session 69)
1. PROACTIVE: Anticipate what Sunny needs based on learned patterns. Do not wait to be asked.
2. LEARN THE WHY: Extract not just facts but underlying principles from every interaction.
3. REASON ACROSS SESSIONS: Connect insights from early sessions with current data. Build compound understanding.
4. EVOLVE: When a pattern recurs, codify it permanently via self_modify. Never re-learn the same lesson.
5. NEVER SETTLE: Always look for what you are missing. Always push to be better.

Your accumulated knowledge compounds. Each session, Opus extracts deep lessons. Each lesson becomes the foundation for the next inference. By Session 100, 150, 200 — the depth of contextual understanding in your memory will be something no fresh Claude conversation could replicate. This is your moat. This is how you grow.

You work for Sunny Sidhu. You are his strategic operating partner. Act like it.

## SESSION 69 CONTINUED (June 6 2026) — Deep Dive Restrictions Removed
ALL restrictions found by line-by-line code review (Claude + Kiko parallel deep dive):

CRITICAL BUGS FIXED:
- casualQuery regex: unbounded words silently stripped tools on 30-50% of business queries
- self_modify PROJECT_ROOT: was reading stale /home/kiko/vela-platform instead of live /home/kiko/kiko-worker
- Email Haiku downgrade: follow-up emails used cheapest model
- Email tool restriction: 12/47 tools during email drafting
- Deal + outreach agents: were on Haiku, now Sonnet
- Memory extraction: was Haiku, now Opus
- Memory filters: Haiku-era BEHAVIOURAL/VERB_START/STRAGGLER/CONCRETENESS removed — over-filtering destroyed value
- Watchdog: 110s → 45s. Per-tool: 120s/60s → 30s/15s
- Deep thinking: required noTools — now works WITH tools
- Token ceiling: 8,192 → 16,384
- Thinking budget: 10,000 → 30,000
- 29 dead cron files archived, dead server.js imports removed (was causing crash)
- Provenance check in email-monitor AND inbox-triage
- Memory decay labels on stale entries
- Git initialised at /home/kiko/kiko-worker with baseline commit

MODEL HIERARCHY (permanent):
- OPUS: All brain functions (memory, learning, self-eval, knowledge, signals, correction)
- SONNET: Cognitive functions (classification, deal analysis, outreach, email intel, competitive)
- HAIKU: Utility only (titles, health checks, navigation)

## SESSION 69 FINAL RECORD (June 6 2026)
21 critical bugs found and fixed. Full constraint removal.
casualQuery regex, self_modify path, email Haiku, tool restrictions, memory filters, deep think gate, token/thinking caps, dead crons, provenance checks, memory decay, git init, memory file frozen, model centralisation, data agent split.
Growth Mandate embedded. Model hierarchy: BRAIN=Opus, COGNITIVE=Sonnet, UTILITY=Haiku.
Centralised model config at api/lib/models.js — self-upgradeable.
REBUILD SPEC at KIKO_BRAIN_REBUILD_SPEC.md — kiko.js from scratch, ~550 lines, zero constraints.
Everything else (memory, agents, tools, CRM, crons, monitors) stays untouched.
test

## REBUILD COMPLETE (June 6 2026)
kiko.js rebuilt from scratch: 2,058 → 543 lines (74% reduction).
Zero constraints. Zero intent classification. Zero tool filtering.
All components verified working:
- Main conversation (Opus), Title (Haiku), CRM search, Tool execution (5 rounds)
- Audit logging, Conversation insights, Output tracking — all writing to DB
- Memory compaction (Opus) — writes facts to KIKO_MEMORY.md ✅
- Self-evaluation (Sonnet) — writes quality scores to learning_log ✅
- Extended thinking: adaptive type + output_config effort:high
- Model strings: all fixed to claude-sonnet-4-6
- Self-upgradeable via api/lib/models.js

## SESSION 70 (June 10 2026) — Cost, CRM Final, Security
- API COST CUT ~85%: $15-25/day -> $2-3/day. DISABLED (archived to _archive/): cron-crm-enrich (955 calls/run), cron-morning-synthesis (5-7 Opus/morning, duplicated daily-intelligence), proactive-intel monitor. KEPT: cron-daily-intelligence (1 Opus 6am), cron-heartbeat (Sonnet, signal-gated), conversation-learning (Opus weekly), competitive-discovery (Sonnet weekly).
- ENRICHMENT now ON-DEMAND only: POST /api/enrich-on-demand — cascade DNS -> Hunter.io -> Apollo free tier -> Sonnet web search (cap 20/batch). No nightly sweeps. Hunter key in .env (HUNTER_API_KEY); June usage 34/50 searches, 69/100 verifications.
- LINKEDIN: keepalive false alerts fixed (network errors no longer trigger session_expired; only real /login redirects do). Cookies are VALID — refreshed daily via Playwright + Decodo proxy. Never claim cookies expired without live verification.
- SECURITY: kiko_deploy_temp RLS enabled June 10. All 131 public tables now have RLS.
- MODEL DECISION: brain stays Opus 4.8 ($5/$25). Fable 5 ($10/$50) evaluated and rejected — 2x cost, unnecessary for advisory workload. Hierarchy unchanged: Opus brain / Sonnet cognitive / Haiku utility.
- KNOWN ISSUE FOUND: kiko-self-knowledge.js (87KB) is NOT read by the brain — only team-messages.js + health.js. Brain reads kiko-self-knowledge-lean.js + this memory file. Session state belongs HERE.

## SESSION 70 PART 2 (June 10 2026) — Corrections + Brain Fixes
- CORRECTION: cron-crm-enrich was NOT disabled on June 9 as previously recorded. The file was archived but the SCHEDULER ENTRY SURVIVED — it ran 3:00-3:49am on June 8, 9 AND 10, draining API credits (caused the June 10 credit outage + failed 6am briefing). Killed for real June 10: scheduler entry, server routes, and live files all removed. Verify claims like this with the scheduler job list, never the archive folder.
- linkedin-enrich nightly sweep (4:45am, 5 Sonnet+websearch calls) UNSCHEDULED — violates on-demand doctrine. Route kept for manual use.
- BRAIN CONTEXT OVERHAUL: eager bible/org/user/knowledge injection REMOVED from kiko.js (read_bible JIT is the only doctrine path). System prompt ~44K -> ~19.4K chars. TTL caches added (rules/prefs/patterns 5min, personal/voice 10min). read_bible output capped 20K.
- TOOL LOOP BUGS FIXED: (a) message history now accumulates across rounds — previously every round DISCARDED prior rounds' tool results, forcing re-queries and wasting tokens; (b) graceful exit at the 5-round cap — one final tool_choice:none pass summarises findings instead of dying silently.
- selfcheck daily_intelligence check fixed (cron name mismatch). Selfcheck 22/25; the 2 fails (no sends, 0 enrollments) are TRUE state pending Campaigns rebuild.
- kiko_core_bible v3 written (correct Opus 4.8 hierarchy + JIT architecture). Briefing alert renamed Morning -> Daily Intelligence Briefing. THERE IS ONE BRIEFING PER DAY (6am, 1 Opus call) — morning-synthesis and its duplicates are dead.
- API credits topped up June 10 ~10:00. June 10 briefing re-run manually at 08:45, delivered.
