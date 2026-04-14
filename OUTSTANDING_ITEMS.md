# OUTSTANDING ITEMS — Kiko / Vela Platform

**Compiled:** Tue 14 April 2026 13:20 BST
**Production:** v0.0.65 live at kiko.vanhawke.agency — kiko-health PASS 1569ms, 3 layers
**Purpose:** Single source of truth for every outstanding build/fix/commitment across the platform, regardless of size or priority. Ownership and sequencing decided by Sunny.

---

## 1. BUGS DISCOVERED TODAY (Tue 14 April)

### 1.1 LinkedIn voyager intermittent "fetch failed"
`/api/linkedin-test` returned `authenticated:true` on the first call after cookies were installed, then began returning `{"authenticated":false,"error":"fetch failed"}` on every subsequent call. Current state as of 13:15 BST: still returning `fetch failed`. Root cause likely Vercel Node.js undici TLS connection pool flakiness against LinkedIn's strict TLS, possibly combined with IP fingerprinting. Fix: retry wrapper around `voyagerFetch()` in `api/linkedin-client.js` — up to 3 retries with 1s/3s/8s backoff, catching `fetch failed`/`ECONNRESET`/`ETIMEDOUT` (NOT 401/403/429), `Connection: close` header to force fresh TCP. Estimated ~30 lines, ~60 min Claude Code.

### 1.2 `linkedinTestAuth()` returns empty profile object
First successful call returned `{"authenticated":true,"profile":{}}`. The profile parser in `api/linkedin-client.js` does not correctly extract `firstName`/`lastName`/`publicIdentifier` from the actual shape of the voyager `/me` response. Auth itself works — this is cosmetic. Fix: inspect actual response shape when voyager is reachable, adjust parser. ~5 lines.

### 1.3 "Hello Sunny" hardcoded in voice mode
Matt heard "Hello Sunny" from Kiko in voice mode under his own login. Root cause found: `api/voice-preview.js` line 14 contains the hardcoded string `'Hello Sunny, this is how I sound. What do you think?'`. Fix: replace with dynamic user name from `kiko_user_config.display_name`, fall back to neutral greeting. ~10 lines. **Also possible there is a second hardcoded "Sunny" in the frontend voice-mode opening line** — needs grep of `src/` to confirm.

### 1.4 New user auto-provisioning gap (Matt required 4 manual SQL fixes)
The trigger `handle_new_user()` on `auth.users` only inserts into `kiko_user_config`. It does NOT:
- Write `org_id` and `role` into `auth.users.raw_app_meta_data` (needed for JWT claim — without this, every RLS policy returns zero rows to the new user)
- Insert into `organization_members` (needed for `organizations` table RLS)
- Insert into `public.users` (needed for legacy-org RLS and other joins)

Result: every new Van Hawke hire will experience Matt's "I can see the platform but there's no data anywhere" failure unless I manually SQL-patch them. Fix: rewrite `handle_new_user()` to include all three additional inserts. Migration required.

### 1.5 Three false-positive `linkedin_auth_failed` alerts fired this morning
Cleaned up manually via DELETE. Cause: my retries on `/api/cron-linkedin-auth-check` each fired a fresh alert because the cron fires an alert on every failure, with no deduplication. Fix: add a 4-hour cooldown window on alerts of the same `type` in `cron-linkedin-auth-check.js` — don't fire a new alert if one of the same type already fired in the last 4 hours. ~10 lines.

---

## 2. ITEMS FLAGGED YESTERDAY (Mon 13 April)

### 2.1 Profile parsing bug
Same as 1.2 — also flagged yesterday.

### 2.2 LinkedIn cookie rotation (hygiene)
`li_at` and `JSESSIONID` cookie values are currently present in this conversation's context. Practical risk is low (Anthropic infrastructure is encrypted) but the correct hygiene is: at end of day, log out of LinkedIn manually, log back in (which invalidates the old `li_at` and mints a new one), re-extract both cookies, update Vercel env vars, redeploy. ~10 min manual, done by Sunny only.

### 2.3 `primary_colour` and `accent_colour` in `organisations.branding`
Both currently set to `#ffffff`. Should be `#7c5cfc` (brand purple) and a complementary accent. Cosmetic drift from the locked Warm Charcoal palette. Fix: single UPDATE statement.

### 2.4 `kiko-self-knowledge.js` framing
Current framing reads "Kiko Platform (white-labelled for Van Hawke)". Per the locked product identity, Kiko IS the product — not a white label of something else. Fix: update the self-knowledge string.

### 2.5 354 historical `kiko_alerts` rows have no UI surface
Alerts have been accumulating since the multi-user launch but there's no dedicated alerts page in the frontend. Users cannot see their own alert history. Absorbed by the planned "Today view" but could be a standalone alerts page in the meantime.

### 2.6 91 `pipeline_notifications` rows also have no UI surface
Same story as 2.5 — notifications accumulating, no frontend to view them.

### 2.7 Document upload UI missing
Backend works — there are 2 documents and 14 chunks in the database already — but no frontend UI to upload new documents. Users can't add reference material to Kiko through the UI.

### 2.8 Calendar sync is stale
`kiko_meeting_prep` is empty and `calendar_events` hasn't been updated since March 10. The calendar integration exists but isn't running or isn't being consumed.

### 2.9 Email inbox surfacing
`kiko_thread_tracker` has 298 rows and `kiko_inbox_triage` has 12 rows but neither surface in any UI. Email intelligence is being generated but not shown to the user.

### 2.10 Sequence builder UI — LinkedIn step types
The sequence engine can execute LinkedIn steps (v0.0.65) but the sequence BUILDER UI in `src/pages/SequenceDetail.jsx` has no drag-and-drop for adding LinkedIn step types manually. Currently LinkedIn steps only appear when Kiko generates them via `api/generate-sequence.js`. A user can't manually add a LinkedIn connect step to an existing sequence via the UI.

### 2.11 Kiko voice mode — known architecture decision not yet implemented
Phase 13 of the Kiko evolution plan calls for: Pipecat + Claude + Deepgram STT + Cartesia TTS (Serafina voice ID `4tRn1lSkEn13EVTuqb0g`), wrapping the same `/api/kiko` endpoint. Current voice mode is GPT-4o Realtime which fabricates data and is not integrated with the three-layer Bible. Dedicated 3-4 hour session required.

---

## 3. ONBOARDING & MULTI-USER GAPS

### 3.1 Trigger-based auto-provisioning
See 1.4 — rewrite `handle_new_user()` to handle all four tables.

### 3.2 Admin UI for managing team members
There's no frontend for Sunny to invite/remove/promote team members. Every addition or role change requires direct SQL. For a platform that wants to be used by a team, this is a standing gap.

### 3.3 Role promotion UI
Currently `super_admin` promotion happens via manual SQL UPDATE. No UI.

### 3.4 User page permissions
Table `user_page_permissions` exists (organization_id, user_id, page_key, can_view). Currently unused — no UI to grant/revoke per-page access. Sunny and Matt both have zero rows in this table. Either the system is designed to allow-all-by-default, or the feature was partially built and never completed.

### 3.5 Password-based login fallback
Currently only Google OAuth works. If Google OAuth breaks again (like this morning), there's no secondary login method. Supabase supports email+password natively — could be enabled as a fallback for admin access in emergencies.

---

## 4. LINKEDIN-SPECIFIC OUTSTANDING ITEMS

### 4.1 v0.0.66 retry wrapper (see 1.1)

### 4.2 Profile parsing fix (see 1.2)

### 4.3 Cookie rotation (see 2.2)

### 4.4 LinkedIn cookies — Vercel to add `LINKEDIN_KILL_SWITCH` env var
Currently the env var name is supported by the code, but not present in Vercel. The kill switch is armed only if the env var exists. Should be set to `0` (disabled) by default and flipped to `1` when needed. Pre-setting it now means you don't have to touch Vercel in an emergency — you only have to change its value.

### 4.5 LinkedIn Layer 3 — Chrome extension
Roadmap item, weeks 4-5. Manifest V3 browser extension with sidebar overlay on linkedin.com profile pages. Shows Kiko's opinion of the prospect (CRM match status, prior outreach, sponsor fit score). Deep work, not this week.

### 4.6 LinkedIn Layer 4 — Job-change detector cron
Roadmap item, week 5. Sonnet-powered cron that scans incoming LinkedIn replies and flags cases where the reply domain doesn't match the original outreach target domain (the J Lake → Lofted Spirits failure mode we discovered yesterday). Would fire `kiko_alerts` of type `contact_changed_company`.

### 4.7 LinkedIn daily cap graduation check
v0.0.65 shipped with `LINKEDIN_FIRST_USE_DATE` env var controlling the 25/day → 40/day ramp. Once LinkedIn actually runs, verify after day 8 that the cap graduation fires correctly. Not a build item — a verification checkpoint.

### 4.8 Drop Lemlist subscription
Commitment: 1 week after v0.0.66 ships clean and LinkedIn stack runs without auth failures. Contingent on 4.1 working reliably.

---

## 5. CAMPAIGN / PROSPECTING SURFACE

### 5.1 `src/pages/Campaigns.jsx` — status unknown
Exists in the repo but I have not audited it in this session. Need to verify: does it load, does it allow campaign creation, does it hook into `api/build-campaign.js`, is it tied to Lemlist or Kiko-native sequences or both, what state is it in from last session.

### 5.2 `api/build-campaign.js` — status unknown
Exists. Need to verify: does it actually construct a working campaign, what data shape, what enrollments does it create.

### 5.3 `api/activate-campaign.js` — status unknown
Exists. Need to verify.

### 5.4 `api/verify-campaign-targets.js` and `api/enrich-campaign-sponsorship.js` — status unknown
Exist. Need to verify they produce usable target lists.

### 5.5 `src/pages/OutreachIntelligence.jsx` — status unknown
Replaced the old Email page at some point. Not audited in this session.

### 5.6 `src/pages/LinkedInQueue.jsx` — status unknown
Exists. Presumably shows the pending rows in `kiko_linkedin_queue`. Not audited.

### 5.7 `src/pages/PartnershipMatrix.jsx` + `api/partnership-matrix.js` — status unknown
The partnership scoring engine. Not audited.

### 5.8 `src/pages/CommercialCalendar.jsx` — status unknown
Four motorsport series (F1, FE, MotoGP, WEC). Unsure current data freshness.

### 5.9 `src/pages/MemoryConsole.jsx` — status unknown
Not audited.

### 5.10 `src/pages/KikoCode.jsx` — status unknown
Not audited.

---

## 6. CRON / BACKGROUND INFRASTRUCTURE

The `api/` folder contains roughly 50 cron files. Status of each is not individually tracked in any document. At least the following need verification that they still run and still do what they say:

- `cron-morning-intelligence` / `cron-morning-email`
- `cron-outreach-score`
- `cron-news-classify` / `cron-competitive-intel`
- `cron-partnership-scan` / `cron-partnership-verify` / `cron-partner-reconcile`
- `cron-company-enrich` / `cron-score-companies`
- `cron-deal-attribution`
- `cron-pipeline-hygiene`
- `cron-inbox-triage`
- `cron-meeting-prep`
- `cron-people-verify`
- `cron-proactive`
- `cron-self-awareness` / `cron-selfcheck-watcher`
- `cron-preference-synthesis` / `cron-profile-synthesis`
- `cron-learning-director` / `cron-rule-promotion`
- `cron-task-automation` / `cron-task-executor`
- `cron-segment-enroller`
- `cron-email-template-learning` / `cron-email-voice-learning`
- `cron-health-check` / `cron-health-watcher`
- `cron-weekly-report`
- `cron-background-task-cleanup` / `cron-job-cleanup`
- `cron-jobs-worker`
- `cron-enrich`
- `cron-edit-delta`

Standing unknown: which of these fire heartbeats successfully, which are silently failing, which are duplicate to deleted ones (dead wood). A standalone audit session could cut the cron inventory and reduce Vercel costs.

---

## 7. DATA / CONTENT GAPS

### 7.1 `user_bibles` has only Sunny's row
See 1.4 context — Matt will need his own personal bible written for voice mode + chat personalisation. The org bible is shared; the personal layer is per-user.

### 7.2 `kiko_user_config.company_name` empty for Matt
Matt's row has `company_name: ''`. Sunny's has `Van Hawke Group`. Should be auto-populated from `organisations.name` during provisioning (part of the fix for 1.4).

### 7.3 Calendar events stale since March 10 (see 2.8)

### 7.4 LinkedIn audit table brand new (v0.0.65), no rows yet
Expected — no LinkedIn actions have run. Listed here so that when the first rows land, someone can verify logging is functioning as designed.

---

## 8. DOCUMENTATION / PROCESS

### 8.1 Five `*_PROGRESS.md` files with unknown completion state
Present in repo root:
- `BACKGROUND_P3_P4_PROGRESS.md`
- `BACKGROUND_TASK_PROGRESS.md`
- `COLOUR_REFACTOR_PROGRESS.md`
- `MULTI_USER_PROGRESS.md`
- `PHASE3_PROGRESS.md`

Each represents a sub-project that may or may not be complete. None have been audited in this session. Recommend a 30-minute reconciliation pass to either close them out (append "SHIPPED" with date) or extract the incomplete items into this master outstanding list.

### 8.2 `KIKO_BIBLE.md.archive` exists but current Bible is DB-backed
Historical reference only. No action needed unless Sunny wants to formally retire it.

### 8.3 `V064_BRIEF_LINKEDIN_LAYER1.md` and `V065_BRIEF_LINKEDIN_LAYER2.md` exist in repo root
Both shipped. Could be moved to an `/archive/briefs/` folder to tidy the repo root.

### 8.4 `KIKO_SESSION_BRIEF.md` and `KIKO_EVOLUTION_PLAN.md`
Mentioned as mandatory reads for every new Claude Code session but last session note in `KIKO_MASTER_LOG.md` confirms v0.0.64 + v0.0.65 shipped — unsure if these two docs have been kept current or if they're drifting.

### 8.5 No runbook for OAuth / auth failure recovery
When Matt's login failed this morning, the diagnostic path was ad-hoc. A runbook for "new user can't log in" covering the four failure modes we found today (Google Cloud Console JS origin missing, Google Cloud Console redirect URI missing, Supabase URL config out of sync, auth.users metadata missing) would cut time-to-resolution for the next occurrence from ~90 minutes to ~5 minutes.

---

## 9. ROADMAP / DEFERRED COMMITMENTS

### 9.1 Today daily workload view
`src/pages/Today.jsx` + `api/today-feed.js`. Estimated 1 week build. The unified daily dashboard that absorbs 2.5, 2.6, 2.9 and becomes the primary landing page.

### 9.2 Unified inbox UI
Separate track. Surfaces `kiko_thread_tracker`, `kiko_inbox_triage`, Gmail replies, LinkedIn replies in one place.

### 9.3 Sequence builder UI — LinkedIn step types (see 2.10)

### 9.4 LinkedIn Chrome extension Layer 3 (see 4.5)

### 9.5 LinkedIn job-change detector Layer 4 (see 4.6)

### 9.6 Drop Lemlist (see 4.8)

---

## 10. STANDING OPERATIONAL COMMITMENTS

### 10.1 1-week LinkedIn observation window
Once the v0.0.66 retry wrapper is shipped and LinkedIn auth is stable, run for 7 clean days before moving to higher cap (40/day → above) or dropping Lemlist. This is a commitment to operate conservatively for the first week of native LinkedIn activity.

### 10.2 Ring fence enforcement
Every deploy, every session: `api/kiko.js`, `api/kiko-health.js`, three-layer Bible, `src/contexts/OrgContext.jsx`, all `src/contexts/*`, `api/_lib/get-user-role.js`, `KIKO_BIBLE.md.archive`, `api/lemlist-webhook.js`, `api/lemlist-backfill.js`, `api/cron-sequence-sender.js` remain untouched without explicit approval.

### 10.3 kiko-health gate before AND after every deploy
Non-negotiable. Pre and post must both be PASS with all 3 layers loaded.

### 10.4 3-strike failure rule
3 consecutive failed deploys or health checks in a single session → STOP, write failure to `KIKO_MASTER_LOG.md`, ask Sunny.

### 10.5 Never `--force`, never `VERCEL_FORCE_NO_BUILD_CACHE=1`
$830 lesson. Permanent rule.

### 10.6 API doc verification before code
Before any code touching external APIs (OpenAI, Anthropic, Supabase, Mem0, ElevenLabs, Lemlist, Vercel, Google, GitHub, LinkedIn): search and read current official docs first. Never rely on training knowledge for API specs.

---

## 11. ITEMS I DON'T KNOW ABOUT

This list represents everything I've noted explicitly. There are almost certainly items in progress files (Section 8.1), half-built features across the ~15 frontend pages (Section 5), and cron state issues (Section 6) that I have NOT audited in this session. An additional 60-minute audit pass would likely surface another 10-20 items.

---

**End of list. Sequencing is Sunny's call.**


---

# SECTION 11 — AUDIT PASS FINDINGS (Tue 14 April 13:45 BST)

This section contains everything discovered in the 45-minute deep audit of progress files, cron inventory, TODO comments, Evolution Plan, frontend pages, and database tables. Items here are IN ADDITION to sections 1-10. Several items change the interpretation of items previously flagged.

## 11.A Items that CLOSE OUT previously-flagged items

### 11.A.1 Progress files (Section 8.1) are all DONE
All five `*_PROGRESS.md` files in repo root are marked `## Current phase: DONE` or `## Current step: DONE`. Each has "visual verification by Sunny in browser" as the only open checkbox — that is a manual acceptance task, not build work. They can be moved to `/archive/progress/` or left in place. Section 8.1 of the first list is closed — nothing to do.

### 11.A.2 Zero orphan crons (Section 6 partially closed)
Every `api/cron-*.js` file is scheduled in `vercel.json`. Only exception: `api/cron-utils.js` which is a shared utility module imported by other crons (not a cron itself). The Section 6 concern about "silently failing, duplicate, dead wood" is largely unfounded — the cron inventory is clean. **BUT see 11.B.1 for the one duplicate schedule found.**

### 11.A.3 Section 5 — all pages exist and are substantial
Every frontend page listed in Section 5 exists, is substantial (173-1470 lines), and is registered in `src/App.jsx` with routes. All are wrapped in `PermissionGate`. None are stubs. The "status unknown" from Section 5 is replaced by the specific audit findings below in 11.D.

## 11.B New bugs / gaps discovered in the audit

### 11.B.1 Duplicate `cron-inbox-triage` schedule
`vercel.json` schedules `/api/cron-inbox-triage` TWICE:
- `15 7 * * 1-5` (once per weekday at 07:15)
- `0 9-19/2 * * 1-5` (every 2 hours 9am-7pm weekdays)

Almost certainly one of these is legacy and the other is current. Either one runs twice and wastes compute, or one of them is stale and should be removed. Needs a 5-min audit to decide which to keep.

### 11.B.2 Two frontend TODOs hardcoding Van Hawke org_id
- `src/components/layout/Layout.jsx:122` — `const userOrgIdNew = '2c6b30da-2d1a-45e5-bbeb-dee1671deba3' // TODO: resolve dynamically when multi-org`
- `src/components/PermissionGate.jsx:7` — `const ORG_ID = '2c6b30da-2d1a-45e5-bbeb-dee1671deba3' // TODO: resolve dynamically when multi-org`

**Implication:** the platform is currently hardwired to a single organisation at the frontend level. The backend multi-tenant architecture (from the multi-user feature work, v0.0.50-v0.0.56) exists, but these two frontend components bypass it. If Van Hawke were ever to onboard a second organisation (e.g. for a future white-label deployment), these two files would need to resolve the org dynamically from `auth.users.raw_app_meta_data.org_id` or from the user's `organization_members` row. Not blocking today. Architectural debt.

### 11.B.3 `kiko_draft_actions` — Phase 14 is DEPLOYED but has no UI
This is the biggest finding of the audit. The Evolution Plan's Phase 14 ("Autonomous Draft Actions") is listed as "what kicks in after Phase 11" — prepared but not executed without approval. The table `kiko_draft_actions` exists with the expected schema (id, alert_id, action_type, payload, status, created_at, reviewed_at, user_id) and has **98 rows**. Columns confirm: `status` supports `pending/approved/rejected/expired`.

**Meaning:** Kiko has been preparing 98 autonomous draft actions (emails, deal moves, task creations) over time, all queued pending review. **There is NO UI to review, approve, or reject these drafts.** They are stuck in the database. This is a functional gap — Kiko is doing the work but Sunny can't see it or act on it.

This is more important than the "Today daily workload view" roadmap item because the backend is ALREADY generating the data. Surfacing even a minimal review panel would unlock real Chief-of-Staff behaviour Kiko is already attempting to provide.

### 11.B.4 `kiko_curiosity_queue` — no UI
671 rows. Columns: id, topic, category, reason, source_conversation, priority, status, user_id. This is Kiko's autonomous curiosity system — topics she wants to explore based on conversations. Part of Phase 11 (Proactive Engine). Invisible to Sunny.

### 11.B.5 `kiko_thought_journal` — no UI
170 rows. Columns: id, user_id, topic, insight, reasoning_thread, related_entities, confidence, source_conversation_id, superseded_by, created_at. This is Kiko's insight log with confidence scores — she is drawing conclusions and recording them but Sunny cannot see them. Part of Phase 11/12.

### 11.B.6 `kiko_audit_log` — no UI
8,492 rows. Columns: user_id, user_email, action_type, entity_type, entity_id, detail, intent, tool_name, ip_address, duration_ms, created_at. Full system audit trail. No admin surface to review.

### 11.B.7 `kiko_output_tracking` — no UI
7,327 rows. Columns: user_id, agent, intent, user_message, output_preview, follow_up_action, quality_signal. Every Kiko response is being tracked for quality analysis. No UI to view quality trends, intent distribution, or agent performance.

### 11.B.8 `news_articles` — 7,246 rows, surface unclear
RSS ingestion from the 75 RSS sources. May or may not surface via morning brief. No dedicated news feed UI that I found in the page audit.

### 11.B.9 `kiko_knowledge_sources` — 60 rows, no UI
Configuration for which RSS sources Kiko reads. No admin UI to add/remove/prioritise sources. Currently managed via direct SQL.

### 11.B.10 `ai_memory` vs `kiko_memories` — two memory tables
- `ai_memory` 115 rows, columns: user_email, type, content, source, tags, layer
- `kiko_memories` 1,043 rows, columns: path, content, is_directory, user_id, updated_at

Two different schemas. One is likely legacy. Unclear which is canonical in the current code. Could create confusion or orphaned writes.

### 11.B.11 `user_settings` has only 1 row
Only Sunny's. Matt has no user_settings row. Once he tries to use settings features (email signature, profile, notification prefs, etc.), they may fail or show defaults with no way to save. Another auto-provisioning gap — should be part of the `handle_new_user()` trigger rewrite (Section 1.4).

### 11.B.12 `kiko_alerts` grew from 354 to 376 in 24 hours
Previously flagged as 354 rows; current count is 376. Accumulating at roughly one alert per hour. Without a UI to triage them, they will continue to grow indefinitely. Needs either a dedicated alerts page OR absorption into the Today view — but the Today view is a 1-week build per Section 9.1.

### 11.B.13 `pipeline_notifications` reduced from 91 to 45
Previously flagged as 91 rows; current count is 45. Someone or something has been clearing them (possibly a cron). Still no UI surface.

## 11.C Evolution Plan — completion status unknown for Phases 6-14

The `KIKO_EVOLUTION_PLAN.md` document (710 lines, dated March 25 2026) defines 14 phases (numbered 6-14) of Kiko's intelligence evolution from dispatcher to Chief of Staff. **None of these phases are formally marked as complete in `KIKO_MASTER_LOG.md`.** Based on tables populated and crons running, here is my best guess at each phase's state:

| Phase | Description | Status Evidence | Best Guess |
|---|---|---|---|
| 6 | General Intelligence (unlock Claude's brain) | `api/kiko.js` exists, intent classifier running | **Likely done** |
| 7 | CRM Context for General Queries | Data-backed 23 agents reference CRM | **Likely done** |
| 8 | Learning Loop — Decision Logging | `kiko_learning_log` 231 rows | **Partially done** |
| 9 | Learning Loop — Pattern Matching | `cron-learning-director` runs | **Likely done** |
| 10 | Cross-Agent Synthesised Brief | `cron-morning-intelligence` runs | **Likely done** |
| 11 | Proactive Intelligence Engine | `cron-proactive`, `kiko_curiosity_queue` 671 rows, `kiko_thought_journal` 170 rows | **Partially done — backend, no UI** |
| 12 | Memory Synthesis (strategic preference model) | `kiko_preferences` 8 rows, `cron-preference-synthesis`, `cron-profile-synthesis` | **Partially done** |
| 13 | Voice Replacement (kill GPT-4o) | Section 2.11 — not done | **NOT done** |
| 14 | Autonomous Draft Actions | `kiko_draft_actions` 98 rows, no UI | **Backend done, UI missing** |

**Recommendation:** a dedicated 60-minute reconciliation session to verify each phase's actual completion against the original test criteria in `KIKO_EVOLUTION_PLAN.md` (each phase has documented tests), then formally close them out or extract the incomplete parts into explicit build items.

## 11.D Frontend page audit — what each page actually does

From reading each page's header, first 40 lines, and the queries it runs. Line counts indicate relative completeness.

| Page | Lines | Route | Purpose | Queries |
|---|---|---|---|---|
| KikoChat | — | `/`, `/home`, `/dashboard` | Main Kiko conversation interface | `/api/kiko` endpoint |
| Pipeline | 716 | `/pipeline` | Deal pipeline view | `deals`, `contacts` |
| Contacts | 207 | `/contacts` | Contact list | `contacts`, `contact_activities` |
| ContactDetail | 441 | `/contacts/:id` | Per-contact deep view | `contacts`, `contact_activities`, `deals` |
| Organisations | 903 | `/organisations` | Company/organisation list + detail | `companies` |
| OutreachIntelligence | 470 | `/command-centre` | **"Command Centre"** — replaced Email/Tasks/Inbox/Segments. Scoring + focus modes + 6 Kiko modes | `outreach_scores`, `email_scores`, `tasks` |
| PartnershipMatrix | 375 | `/partnership-matrix` | F1 partnership scoring engine | `f1_partnerships`, `f1_teams` |
| CommercialCalendar | 556 | `/calendar` | Motorsport calendar (F1/FE/MotoGP/WEC) | `race_calendar` |
| **Campaigns** | **877** | `/campaigns` | **THE CAMPAIGN PROSPECTING VIEW** — left rail campaign list + main prospect table. Pause/activate per-campaign and per-prospect. Bulk edit steps modal. | `kiko_sequences`, `kiko_sequence_enrollments`, `kiko_outreach_queue` |
| SequenceDetail | 1470 | `/campaigns/:id`, `/sequences/:id` | Per-sequence drill-down (largest page) | sequence-specific |
| LinkedInQueue | 185 | `/linkedin` | Pending LinkedIn actions view | `kiko_linkedin_queue` |
| MemoryConsole | 203 | `/memory` | Kiko memory browser | `kiko_memories` |
| KikoCode | 366 | `/kiko-code` | Code assistant view | — |
| Admin | 173 | `/admin` | Admin home | admin tables |
| AdminSystem | 325 | `/admin/system` | System health/diagnostics | `kiko_cron_heartbeats`, `kiko_error_log` |

### 11.D.1 Deprecated/redirected routes
- `/companies` → `/organisations`
- `/deals` → `/pipeline`
- `/tasks` → `/command-centre`
- `/email` → `/command-centre`
- `/inbox` → `/command-centre`
- `/segments` → `/campaigns`
- `/sequences` → `/campaigns`

**Implication:** OutreachIntelligence/Command Centre has absorbed Email, Tasks, Inbox, and Segments as four separate sub-features. Its 470 lines may or may not fully implement all four — unclear without a deeper read. Similarly Campaigns has absorbed Segments.

### 11.D.2 Campaigns.jsx is "the lead prospecting tool"
Confirmed by the first-line comment: `// src/pages/Campaigns.jsx — Campaign Prospecting view`. This is the page Sunny referred to. It exists, queries real data, supports pause/activate at both levels, has a bulk-edit-steps modal. What's unknown without a deeper inspection: does it have a "create campaign" flow from scratch, does it integrate with Lemlist or only Kiko-native, does it have prospect enrichment, does it have reply detection surfacing?

## 11.E Items I still cannot verify without more time

- Does `Campaigns.jsx` have a working "create new campaign" UX, or is it read-only?
- Does `OutreachIntelligence.jsx` surface the 12 `kiko_inbox_triage` rows and 298 `kiko_thread_tracker` rows, or are those genuinely orphan data?
- Do the Evolution Plan phases 6-14 actually pass their documented test criteria?
- Are the 8,492 `kiko_audit_log` rows surfaced in `AdminSystem.jsx`, or is that page only showing cron heartbeats and errors?
- Does `MemoryConsole.jsx` read from `kiko_memories` (1,043 rows) or `ai_memory` (115 rows) — which memory table is canonical?
- Are `kiko_sent_email_analysis` (76 rows) surfaced anywhere, or is voice learning data accumulating invisibly?
- Does the partnership matrix page use the 427 `f1_partnerships` rows, or is that data stale?

Each of these takes ~5 minutes to answer with a targeted grep + page read. Together ~35 minutes. Can be done in the next session if needed.

---

**End of Section 11.** Delta total: ~13 new bugs/gaps, 9 Evolution Plan phases with unknown completion, 7 items still needing verification. Sunny to decide what, if anything, of this to fold into v0.0.66.
