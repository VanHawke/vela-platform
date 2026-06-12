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


## SESSION 71 (June 11 2026) — Full Audit + Self-Repair Restored (Claude + Kiko collaborative)
- RUN_CODE FIXED: scripts now write to /home/kiko/kiko-worker/.tmp as .cjs with cwd anchored to worker root. Root cause of ALL run_code module-not-found errors: /tmp scripts cannot resolve node_modules (Node resolves from script location, not cwd). Generated JS must use require(), never import. VERIFIED live by Kiko: 3/3 PASS.
- SERVER FILESYSTEM TRUTH (Rule 9 in lean prompt + tool schemas): code root is /home/kiko/kiko-worker (api/, routes/, monitors/, lib/, src/cron-scheduler.js). Frontend SOURCE does NOT exist on the server — only on Sunny's Mac; built bundle at /var/www/kiko. The 22 kiko_self_modify errors were Kiko ls-ing src/pages/ which was never there.
- ask_data_agent DEPRECATED everywhere: lean prompt + detail file now route to crm_search / campaign_engine / pipeline_analytics / knowledge_ops / goals_intents. Compat shim retained in kiko-tools.js so stray calls still resolve.
- GIT RECOVERY: routes/ (5 files), lib/ (4 files), api/agents/research.js, api/enrich-on-demand.js, live linkedin-queue.js were server-only — never committed. All pulled into git (commit bd092da). Single point of failure eliminated.
- SERVER DEDUP: stale Jun 6 flat copies (api/data.js, models.js, intent-classifier.js, memory-engine.js, email-format.js) moved to .archive-flat-jun11/ — zero importers, canonical versions live in api/agents/ + api/lib/. Worker healthy after restart.
- CLOSED FROM PRIOR AUDITS: selfcheck route registered (no more 404), bible §1 model claim fixed Jun 10, thinking.type=enabled error dead since Jun 6 rebuild, 557 pm2 restarts = cumulative deploy counter (0 unstable, not a crash loop).
- STILL OPEN (Sunny decisions/actions): (1) RESOLVED Jun 12 — sunny LinkedIn restored via cookie import, verified alive through proxy; both identities now auto-rotating. (2) news-agent.js dormant since Apr 16 — wire to schedule or archive. (3) COMMAND_CENTRE_BUILD_BRIEF.md is missing from disk — field mappings must be re-documented before that rebuild. (4) Campaigns rebuild per CAMPAIGNS_BUILD_BRIEF.md. (5) Voice untested. (6) Alias-aware frontend dead-code scan pending.

## SESSION 71 PART 2 (June 11 2026) — LinkedIn Root Cause + Keepalive Hardening
- LINKEDIN sunny OUTAGE — FULL ROOT CAUSE (never re-litigate): LinkedIn remotely invalidated sunny's session June 5 ~12:00 UTC (likely Doha relocation login pattern). Detection WORKED — keepalive raised critical alerts every 6h from June 5. Surfacing FAILED — all alerts got dismissed via the UI endpoint, and every channel (daily briefing, heartbeat, EA agent) filters dismissed=false, so the system silenced itself for 6 days. Recovery layer 3 (kiko_linkedin_credentials auto-login) was EMPTY since creation and launched Playwright WITHOUT the proxy — it could never have worked. Cookie backups CANNOT revive a remotely-invalidated session by design — they are copies of the session LinkedIn killed. Only a fresh login revives it.
- KEEPALIVE FIXES DEPLOYED (4): (1)+(2) cookieStore.save() was called with objects in both success paths — save() throws unless given an array; even successful logins reported failure. (3) credential login now goes through PROXY_HOST like all LinkedIn traffic. (4) alert dedupe + re-raise: max ONE pending linkedin_session_expired alert per identity; if dismissed without fixing, it re-raises next cycle. Verified live: matt.smith=alive, sunny=expired (true state).
- HARD RULE: matt.smith backup syncs daily 06:00 (proof the stack works). sunny revival requires Sunny to either re-import cookies via the Kiko extension or add a row to kiko_linkedin_credentials (Supabase dashboard, never through chat). If his account has 2FA, credential auto-login will stop at checkpoint — cookie import is the reliable path.
- NEWS-AGENT: retired BY DESIGN (scheduler comment: "Opus 4.8 handles on demand"). File archived to match. Do NOT flag as dormant/broken — partnership/news intelligence = on-demand web search + signals layer.
- QUEUED SECURITY FIX: KIKO_WORKER_COOKIE_KEY not set — cookie store runs on insecure dev key. Needs careful migration (decrypt with dev key, re-encrypt with real key) — do NOT rush; matt's live cookies depend on it.
- DOUBLE-FIRE TRACE OPEN: keepalive alerts historically inserted in pairs ~300ms apart despite single scheduler entry — trace trigger duplication next session.

## SESSION 71 PART 3 (June 11 2026) — CRM Reconciliation COMPLETE + LinkedIn Architecture
CRM FINAL STATE (verified live, post-enrichment):
- Contacts 4,233 total. Tiers 1-3 (3,768 actionable): LinkedIn 99.7%, title 100%, sector 100%, company 100%, email 98%+. Tier 4 (465, low-priority): LinkedIn 99%, title/sector complete, email sparse by design.
- 72-contact backlog (LinkedIn+email gaps) run through enrich-on-demand cascade — LinkedIn URLs filled. 50 T1-T3 contacts have NO discoverable public email (cascade ran DNS+Hunter+Apollo+Sonnet, found none) — tagged email_searched_exhausted=true so they reconcile as verified-none-exists, NOT false gaps. This is a data-reality ceiling, not a system fault. Do NOT re-flag them.
- Companies 2,168: industry 99%, website/domain 87% (285 missing site — many are individuals/small entities with no web presence).
- enrich-on-demand.js WAS BROKEN on server since ~Jun 10 (literal "name: ," syntax error + escaped-backtick corruption from a bash-heredoc edit). FIXED + syntax-checked both ends. Lesson: NEVER write JS to server via unquoted heredoc; always scp from Mac after node --check.
- RECONCILIATION DOCTRINE: a field is "complete" when populated OR verified-cannot-exist (email_searched_exhausted, email_domain_dead, linkedin_not_found). Audits must count the latter as DONE.

LINKEDIN ARCHITECTURE (full truth for registry):
- 3 recovery layers, all now functional: L1 encrypted server cookie store (lib/cookieStore.js), L2 Supabase user_tokens backup, L3 kiko_linkedin_credentials auto-login (proxied, save()-fixed S71).
- PROVEN WORKING: matt.smith goes alive->verified-through-proxy->auto-rotates with zero human action every 6h. This proves the whole pipeline.
- sunny: remotely killed Jun 5, no credential row -> cannot auto-recover until creds stored OR fresh cookie imported. Cookie-import endpoint hardened S71 (now writes encrypted store + identity map, not just user_tokens).
- HARD LIMIT (state plainly, never pretend otherwise): if an account has 2FA, automated credential login stops at LinkedIn's checkpoint — NO automated path passes 2FA, by LinkedIn design. For 2FA accounts the durable path is cookie import (li_at from browser) which the keepalive then auto-rotates indefinitely. One manual import = months of hands-free operation.

## SESSION 71 CLOSE (June 12 2026) — LinkedIn FULLY RESTORED
- sunny cookie import completed by Sunny, verified live through proxy (9.4s check, authenticated=true). Keepalive confirms BOTH identities alive: sunny + matt.smith. Auto-rotation owns both sessions. 5 pending critical alerts dismissed (failure resolved — re-raise logic guards against silent recurrence). LinkedIn outbound fully operational for both users.

## SESSION 71 KNOWLEDGE IMPORTS (June 12 2026)
- Three documents imported into kiko_knowledge and retrieval-verified: imported-claude-session71-platform-audit-complete, imported-claude-qatar-registration-strategy, imported-claude-jessamy-road-tenancy. Retrieve via manage_knowledge -> search_knowledge.
- search_knowledge FIXED: was contiguous-substring matching (any multi-word query silently failed). Now term-based AND matching across content+domain, 1500-char previews, errors logged not swallowed. Command Centre build brief also survives in kiko_knowledge (domain: command-centre-build-brief).

## SESSION 71 — COST FAILSAFE ARCHITECTURE (June 12 2026)
- CIRCUIT BREAKER live in routes/kiko-chat.js: every cron-* invocation is counted in kiko_cron_runs; per-endpoint 24h caps set ~3x legitimate frequency (job-processor 400, sequence-sender 100, gmail-sync 100, default 50). Exceeding cap = hard 429 block + ONE critical alert. Runaway loops are now physically impossible platform-wide. Fail-open on DB errors so the breaker can never take the platform down.
- CONSOLIDATION ENGINE (consolidate-memory.cjs, in git): NEVER scheduled, NEVER self-runs. Failsafes: watermark in kiko_system_state (only post-watermark records processed; seeded 2026-06-12T06:48:23Z = the completed full sweep, history is NEVER reprocessed), MAX_CHUNKS=12 hard abort BEFORE any API call, lockfile against concurrent runs, cost estimate printed pre-run, watermark advances only on full success. Full re-sweep requires explicit CONSOLIDATION_FULL=1.
- CONSOLIDATION TRIGGER = SUNNY'S WORD ONLY: daily-intelligence runs a plain-SQL count (zero AI cost); at 150+ unconsolidated insights Kiko raises ONE info alert prompting Sunny with the cost (~$0.50-1.50). He says "consolidate", someone runs `node consolidate-memory.cjs` from the worker root. NO other trigger exists.
- RECOMMENDED TO SUNNY: set a hard monthly spend limit on the ANTHROPIC_KEY workspace in the Anthropic console — the provider-level ceiling no code bug can bypass.

## SESSION 71 PART 2 (June 12 2026) — FULL ASSIMILATION COMPLETE
- Archive: 443 imported conversations (390 ChatGPT Mar23-Jun26 + 53 Claude), ALL embedded (semantic search live over full history). Consolidated doctrine 2026-06-12 in Bible (timeline + psychology). Knowledge docs added: session71-part2, temi-departure (alias: semi/Muhammet), qfc-director-research + structure-decision, jessamy inventory analysis.
- Search overhauled: search_imported_convs RPC (full-depth), search_knowledge term-AND, embeddings backfilled. Cold-test protocol adopted: every session tests Kiko with cold questions against history.
- Failsafes live: cron circuit breaker (kiko_cron_runs caps), consolidation watermark/lockfile/chunk-cap, prompt-only trigger via consolidation_due alert.
- OPEN: CRM relationship-lifecycle updates (Temi staleness class), investigation-persistence doctrine line (escalate before asking user), verify next consolidation folds Claude corpus.

## SESSION 72 (June 12 2026) — CAMPAIGNS BUILD PHASE 1 SHIPPED
- /api/campaign-conflicts live: person conflicts (active enrollment in live sequence, any age), company overlaps, recent_contacts (terminal status within 90d). 8/8 assertions, Kiko-reviewed (her fix: no date filter on active conflicts).
- Wizard now 5 steps: new Step 4 Prospects (CRM sector/tier matching, conflict check, amber rows excluded by default, per-row override, summary bar). Review step 5 shows enroll count + conflicts excluded.
- handleSave FIXED (old one wrote non-existent category column — every wizard save silently failed) + now enrolls included prospects (status active, next_send_at now; enqueue gate api/cron-sequence-enqueue.js:183 keeps drafts dormant). metadata jsonb column added to kiko_sequences.
- E2E sim on server: 8/8 PASS (loader -> conflicts -> save -> enrollments -> readback -> cleanup).
- PENDING: visual pass in browser (Chrome extension was disconnected); [TEST] Conflict Engine Fixture + Maria Lobato enrollment KEPT ALIVE for the visual walk — purge after. Refinement queued: stagger next_send_at on enroll. NEXT: re-render + rebuild historic SequenceDetail drill-in (/campaigns/:id) and its edit-sequence layout.
- VISUAL PASS COMPLETE (12 Jun, headless Playwright on production via admin magic-link): 8/8 content assertions — wizard steps 1-5 rendered, Maria Lobato conflict visible + amber banner + summary bar + review conflicts-excluded line; historic SequenceDetail rendered (Alpine F1 - Legal AI). 9 screenshots delivered to Sunny's Desktop. Fixture purged (4 enrollments + sequence), DB pristine. Campaigns Phase 1 = DONE end to end. NEXT: renders then rebuild of SequenceDetail (4 tabs: sequence flow editor w/ conditions+test sends+refine, prospects w/ add-leads machinery, activity w/ reply triage, performance).
