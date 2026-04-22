# KIKO PLATFORM FULL AUDIT — April 22, 2026

## 1. CLEANUP COMPLETED
- **24 HTML/CSS/JS mockup files** → moved to `.archive/mockups/`
- **47 markdown session docs** → moved to `.archive/session-docs/`
- **5 essential docs kept**: README.md, KIKO_BIBLE.md, KIKO_SESSION_BRIEF.md, KIKO_EVOLUTION_PLAN.md, this audit

## 2. DEAD API FILES — FLAG FOR REMOVAL
These 45+ API files are NOT referenced by frontend, crons, or imports:
- cron-background-task-cleanup.js, cron-competitive-intel.js, cron-compute-outreach-windows.js
- cron-deal-attribution.js, cron-document-scan.js, cron-edit-delta.js
- cron-email-template-learning.js, cron-health-check.js, cron-health-watcher.js
- cron-job-cleanup.js, cron-jobs-worker.js, cron-knowledge-seed.js
- cron-linkedin-auth-check.js, cron-linkedin-sender.js, cron-meeting-prep.js
- cron-news-classify.js, cron-partner-reconcile.js, cron-partnership-verify.js
- cron-people-verify.js, cron-preference-synthesis.js, cron-reputation-monitor.js
- cron-self-improvement.js, cron-signal-detector.js, cron-stale-contacts.js
- cron-task-automation.js, cron-voice-learning.js, cron-warm-path.js
- plus ~15 more utility files (_orgGuard.js, alert-utils.js, etc.)
**Action**: Move to `.archive/dead-api/` in next session after verifying none are imported

## 3. ACTIVE CRON JOBS (21 on Hetzner)
All running via PM2 kiko-crons process:
- sequence-sender (30min, weekdays) ✓ CRITICAL
- linkedin-sender (60min, weekdays) ✓ CRITICAL — runs on Hetzner local
- sequence-reply-detect (60min, weekdays) ✓ CRITICAL
- inbox-triage (2hr) ✓
- push-dispatcher (5min) ✓
- proactive (7am daily) ✓
- morning-intelligence (7:30am daily) ✓
- morning-email (7:45am daily) ✓
- linkedin-accept-check (9am/1pm/5pm, weekdays) ✓
- learning-director (3am daily) ✓
- self-awareness (2:30am daily) ✓
- rule-promotion (3:30am daily) ✓
- company-monitor (6am daily) ✓
- knowledge-research (4am daily) ✓
- supabase-backup (2am daily) ✓
- partnership-scan (5am Sunday) ✓
- company-enrich (4:30am Sunday) ✓
- pipeline-hygiene (6:30am Sunday) ✓
- weekly-report (8am Sunday) ✓

## 4. KIKO TOOLS (36 total)
### Agent Tools (19):
ask_navigator, ask_deal_agent, ask_data_agent, ask_outreach_agent,
ask_document_agent, ask_memory_engine, ask_strategy_agent,
ask_negotiation_agent, ask_category_agent, ask_finance_agent,
ask_ea_agent, ask_legal_agent, ask_dispute_agent, ask_content_agent,
ask_investment_agent, ask_pricing_agent, ask_signal_agent,
ask_travel_agent, ask_specialist_agent

### Action Tools (17):
navigate_page, log_activity, get_platform_users, google_maps_link,
create_email_draft, linkedin_search_prospects, linkedin_send_invite,
linkedin_send_message, read_email, read_calendar, search_conversations,
trigger_triage, ask_lemlist_live, ask_self_monitor, ask_code_review,
digest_master_brief, manage_knowledge, update_kiko_preference

## 5. KIKO SELF-KNOWLEDGE — NEEDS UPDATE
File: api/kiko-self-knowledge.js (327 lines)
Missing from self-knowledge:
- Email Intelligence Engine (Hunter.io, Snov.io, Norbert, Skrapp, Prospeo, Clearout, SMTP)
- Gmail draft creation for any team member
- Condition evaluation engine in sequence sender
- Multichannel sequence generation (one-click)
- Bulk prospect management (select, sort, duplicate)
- Campaign page UI improvements
- LinkedIn automation fully working on Hetzner

## 6. WHAT'S WORKING ✓
- [x] Kiko chat (streaming, tool use, context awareness)
- [x] CRM (contacts, companies, deals, pipeline)
- [x] Campaign builder (Lemlist-style flow editor)
- [x] Sequence sender (cron, timezone-aware, condition evaluation)
- [x] Email sending via Gmail API
- [x] LinkedIn automation (Playwright + Decodo on Hetzner)
- [x] Reply detection (email + LinkedIn)
- [x] Email Intelligence Engine (6 APIs + SMTP)
- [x] Prospect sourcing (Claude + web search + email verification)
- [x] Gmail draft creation (for any team member)
- [x] Calendar integration
- [x] Document library
- [x] Push notifications
- [x] Knowledge base (26 research domains)
- [x] Self-improvement engine (learning + rules)
- [x] Voice (GPT-4o Realtime via WebRTC)
- [x] All Chats (desktop + mobile)
- [x] Google Maps tool
- [x] Multi-user auth (zero data leakage)
- [x] Supabase backup (14-day retention)

## 7. WHAT'S MISSING / NEEDS WORK
1. **Condition evaluation edge cases** — connection_accepted only checks invite status, not "already connected" scenario
2. **Background prospect sourcing** — button exists but no proper job queue
3. **Prospect data quality display** — UI doesn't show email confidence scores or verification status
4. **Move prospects between campaigns** — only duplicate exists, not move (remove from source)
5. **Campaign page UI** — functional but could be more polished
6. **Kiko self-knowledge update** — missing 6+ features from recent builds
7. **SponsorSignal** — LinkedIn posting system not connected to new platform
8. **ClinIQ Copilot** — separate project, not integrated
9. **Voice latency on mobile** — slow connection, microphone permission resets
10. **Dead code cleanup** — 45+ unused API files consuming deploy time
11. **Vercel function count** — approaching limits with 141 API files
12. **Kiko doesn't know about email intel engine** — can't tell user "I verified this email via Hunter.io"
13. **No prospect deduplication across campaigns** — same person can be in multiple campaigns
14. **No A/B testing** — removed by design, but may be needed at scale
15. **No webhook/API for external integrations** — everything is internal
