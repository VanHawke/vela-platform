# MULTI-USER AUDIT — Vela Platform
## Generated: 2026-04-12
## Auditor: Claude Code (Sub-Phase A)

---

## EXECUTIVE SUMMARY

| Metric | Count |
|---|---|
| Total public tables | 91 |
| Tables with org_id (legacy) | 36 |
| Tables with user_id | 28 |
| Tables classified SHARED | ~36 (already have org_id) |
| Tables classified PERSONAL | ~28 (have user_id) |
| Tables classified REFERENCE | ~12 (f1_partnerships, sponsor_categories, etc.) |
| Tables classified SYSTEM | ~15 (heartbeats, error logs, audit logs) |
| RLS enabled | 62 of 91 |
| RLS disabled (risk) | 29 |
| Tables with `qual: true` public-role policies (LEAK RISK) | 18 |
| Service-role API files | 55 |
| Hardcoded Sunny user_id in code | 7 files |
| Export endpoints needing gating | 3 (export_pipeline, export_contacts, onExportCSV in MemoryTab) |
| Crons needing multi-user rewrite | ~5 (those using getActiveUsers already multi-user-ready) |
| Bible lines needing classification | ~360 (KIKO_BIBLE.md) |

### Top 5 Risks
1. **29 tables with RLS disabled** — any authenticated user can read/write. Most are system tables (cron heartbeats, logs) but some contain personal data (kiko_conversations, kiko_messages, kiko_learned_rules, kiko_meta_learning).
2. **18 policies with `qual: true` on public role** — effectively grant full access to anyone authenticated. Includes kiko_active_jobs, ai_memory, kiko_company_sources, kiko_sourcing_runs, lemlist_webhook_log.
3. **7 files with hardcoded Sunny's user_id** — api/import-conversations.js, api/process-imports.js, api/gmail-draft.js, api/packs.js, api/cron-sequence-enqueue.js, api/ingest-knowledge.js, src/pages/SequenceDetail.jsx. These will fail for any other user.
4. **conversations table has BOTH user_id RLS AND org_id RLS** — permissive policies stack with OR, meaning org members can see each other's conversations. Must drop org_id policies on conversations.
5. **SYSTEM_PROMPT is hardcoded in api/kiko.js:249** — KIKO_BIBLE.md is documentation only, not loaded at runtime. The 3-layer Bible split must modify the SYSTEM_PROMPT constant to load from DB.

### GO/NO-GO: **GO** — with mitigations
The existing `org_id` column (legacy) on 36 shared tables + the `auth.jwt() -> app_metadata -> org_id` RLS pattern means the org-scoping foundation already exists. The new `organizations` + `organization_members` tables add proper role management. Main work: fix the 29 no-RLS tables, drop org_id policies from PERSONAL tables, gate exports, split the Bible, fix hardcoded user_ids.

---

## A.1 — DATABASE TABLE INVENTORY

### SHARED tables (org-scoped, all org members see same data) — 36 tables with org_id
activities, calendar_events, companies, contacts, deal_stage_history, deals, document_chunks, documents, email_scores, email_sync_state, emails, followup_queue, invitations, kiko_company_scores, kiko_lead_segments, kiko_learning_log, kiko_linkedin_queue, kiko_outreach_queue, kiko_score_history, kiko_scoring_models, kiko_scoring_thresholds, kiko_sector_definitions, kiko_sequence_conditions, kiko_sequence_enrollments, kiko_sequences, kiko_skills, kiko_sourcing_runs, kiko_vertical_packs, news_articles, outreach_scores, pipelines, tasks, tool_connections, user_settings, users, campaign_targets

### PERSONAL tables (user_id scoped, private per user) — 28 tables with user_id
conversation_embeddings, conversations, kiko_active_jobs, kiko_alerts, kiko_audit_log, kiko_background_jobs, kiko_background_tasks, kiko_conversation_insights, kiko_conversations, kiko_curiosity_queue, kiko_draft_actions, kiko_draft_tracking, kiko_dynamic_agents, kiko_error_log, kiko_imported_conversations, kiko_inbox_triage, kiko_knowledge_sources, kiko_learned_rules, kiko_meeting_prep, kiko_memories, kiko_meta_learning, kiko_notifications, kiko_operational_mode, kiko_output_tracking, kiko_pack_assignments, kiko_personal_context, kiko_preferences, kiko_relationships, kiko_sent_email_analysis, kiko_thought_journal, kiko_thread_tracker, kiko_user_config, kiko_user_profiles, kiko_win_loss_analysis, latency_log

### REFERENCE tables (global, no user/org scope needed) — 12 tables
category_overlaps, company_intelligence, contact_activities, f1_partnerships, f1_teams, kiko_deal_attribution, kiko_email_style_reference, kiko_identity, kiko_messages, kiko_selftest_runs, kiko_signature_images, sponsor_categories

### SYSTEM tables (internal, service-role only)
kiko_cron_heartbeats, error_log, pipeline_notifications, lemlist_webhook_log, kiko_company_sources

---

## A.2 — RLS LEAK AUDIT

### Tables with RLS DISABLED (29 — HIGH RISK if they contain personal data):
campaign_targets, category_overlaps, company_intelligence, contact_activities, f1_partnerships, f1_teams, kiko_alerts(!), kiko_audit_log(!), kiko_background_jobs(!), kiko_conversations(!), kiko_deal_attribution, kiko_email_style_reference, kiko_identity, kiko_learned_rules(!), kiko_linkedin_queue, kiko_memories(!), kiko_messages, kiko_meta_learning(!), kiko_outreach_queue, kiko_selftest_runs, kiko_sent_email_analysis(!), kiko_sequence_enrollments, kiko_sequences, kiko_signature_images, latency_log(!), email_scores, followup_queue, pipelines, pipeline_notifications

(!) = contains user_id, personal data at risk

### Policies granting `qual: true` to public role (effectively open):
- ai_memory: ALL true/true
- kiko_active_jobs: ALL true/true (also has user_id SELECT)
- kiko_company_sources: ALL true
- kiko_conversation_insights: ALL true/true (service writes)
- kiko_cron_heartbeats: ALL true/true
- kiko_curiosity_queue: ALL true/true (service writes)
- kiko_draft_actions: ALL true/true
- kiko_draft_tracking: ALL true/true
- kiko_dynamic_agents: ALL true/true
- kiko_error_log: ALL true/true
- kiko_imported_conversations: ALL true/true (service writes)
- kiko_inbox_triage: ALL true/true
- kiko_knowledge_sources: ALL true/true
- kiko_learning_log: ALL true (service + user sees own)
- kiko_meeting_prep: ALL true/true
- kiko_operational_mode: ALL true/true
- kiko_output_tracking: ALL true/true
- kiko_sourcing_runs: ALL true

### conversations table — CRITICAL ISSUE:
Has BOTH `user_id = auth.uid()` policies AND `org_id = jwt->org_id` policies. Since Supabase RLS is PERMISSIVE by default, these OR together — meaning any org member can see ALL conversations in the org, not just their own. **Must drop org_id policies from conversations for privacy.**

---

## A.3 — API ROUTE AUTH AUDIT

55 API files use SUPABASE_SERVICE_ROLE_KEY. This bypasses RLS entirely. Most are cron jobs or internal endpoints. Files that accept user_id from request body AND use service_role are potential leak vectors:

**HIGH RISK (accept user_id from client, use service_role):**
- api/kiko-task-create.js — accepts user_id in body
- api/kiko-tools.js — sbFetch uses service_role for all agent calls
- api/memory-tab.js — accepts user_id in query
- api/settings.js — accepts user_id

**MITIGATION:** These endpoints validate user_id against the authenticated session or are called server-side only. But should be audited for JWT validation in Sub-Phase B.

---

## A.4 — KIKO_BIBLE.md CONTENT CLASSIFICATION

| Line Range | Content Preview | Layer | Reason |
|---|---|---|---|
| 1-5 | Title + governing rules | L1 Core | Universal platform identity |
| 7-16 | §1 IDENTITY — Kiko is a modular AI OS | L1 Core | Universal |
| 18-25 | §2 CORE PURPOSE — 5 pillars | L1 Core | Universal |
| 27-38 | §3 SYSTEM ARCHITECTURE AWARENESS | L1 Core | Universal |
| 40-48 | §4 CAPABILITY AWARENESS | L1 Core | Universal |
| 50-65 | §5 REASONING MODEL | L1 Core | Universal |
| 67-108 | §6-6.6 LEARNING LOOPS, SELF-CRITIQUE, KNOWLEDGE APPLICATION | L1 Core | Universal |
| 110-137 | §7-9 OPERATING PRINCIPLES, EXECUTION, CONTROL | L1 Core | Universal |
| 139-157 | §10 COMMUNICATION MODEL — forbidden phrases, USD, "intelligent age" | L2 Org | Van Hawke vocabulary |
| 159-174 | §11-11.5 SELF-AWARENESS, BEHAVIOURAL PERMISSION | L1 Core | Universal |
| 176-185 | §12 SYSTEM CONSTRAINTS | L1 Core | Universal |
| 187-193 | §13 SYSTEM INTEGRITY RULES | L1 Core | Universal |
| 195-229 | §14 ORGANISATION CONTEXT — VAN HAWKE | L2 Org | Van Hawke specific |
| 231-244 | §15 USER CONTEXT — SUNNY | L3 Personal | Sunny's profile |
| 246-265 | §16 C-SUITE ROLES | L1 Core | Universal |
| 267-285 | §17-18 BEHAVIOURAL EXPECTATION, GOVERNING MANDATE | L1 Core | Universal |
| 287-314 | §19 SHIP LOG — 8 APRIL 2026 | L2 Org | Van Hawke platform state |
| 316-331 | §20 PARTNERSHIP VERIFICATION — ABSOLUTE LAW | L2 Org | F1/Van Hawke rules |
| 333-350 | §21 CAMPAIGN PROPOSAL PROTOCOL | L2 Org | Van Hawke outreach doctrine |
| 352-360 | Tool Boundary Rule | L1 Core | Universal ops rule |

**Summary:** ~200 lines L1 Core, ~120 lines L2 Org, ~15 lines L3 Personal

---

## A.5 — HARDCODED USER_ID OCCURRENCES

7 files with Sunny's UUID `9f486437-4bf5-4111-abfe-fe19bfa76063`:

1. `api/ingest-knowledge.js:88` — hardcoded user_id for knowledge ingestion
2. `api/import-conversations.js:9` — `const USER_ID = '9f486...'`
3. `api/gmail-draft.js:68` — `const SUNNY_USER_ID = '9f486...'`
4. `api/process-imports.js:9` — `const USER_ID = '9f486...'`
5. `api/packs.js:8` — `const SUNNY_USER_ID = '9f486...'`
6. `api/cron-sequence-enqueue.js:130` — `const SUNNY_USER_ID = '9f486...'`
7. `src/pages/SequenceDetail.jsx:621` — `const userId = '9f486...'`

All must be replaced with dynamic user lookup (from session, from kiko_user_config, or from request context).

---

## A.6 — EXPORT ENDPOINTS NEEDING GATING

3 export paths identified:

1. **`src/components/settings/MemoryTab.jsx:184`** — `onExportCSV()` generates client-side CSV of kiko_personal_context. Should be gated: role='user' cannot export.
2. **`api/agents/document.js:71`** — `export_pipeline` operation generates XLSX of pipeline deals. Called via ask_document_agent tool. Must check role.
3. **`api/agents/document.js:81`** — `export_contacts` operation generates XLSX of contacts. Same — must check role.

Additional file-type references (xlsx/pdf/docx) in KikoChat and KikoFloat are FILE UPLOAD handlers, not export — safe.

---

## A.7 — GMAIL / SEND-FROM AUDIT

**Current Gmail token storage:** `user_tokens` table — stores Google OAuth refresh_token per user email. RLS: service_role full access + users read own (by email match).

**Current send pipeline:**
1. `api/cron-sequence-sender.js` — sends queued emails via Gmail API
2. Uses `getGoogleToken()` from `api/cron-utils.js` — fetches token from `user_tokens` by email
3. Currently sends FROM whatever token is stored — effectively Sunny's Gmail
4. No `send_from_user_id` column on campaigns or sequences yet

**What needs to change for multi-user send-as:**
- Add `send_from_user_id` to campaigns + sequences
- cron-sequence-sender looks up `send_from_user_id`, fetches THAT user's Google token
- Each org member must complete Google OAuth to store their own token in `user_tokens`

---

## A.8 — CRON AUDIT

42 cron files. Classification:

**Already multi-user ready (use getActiveUsers loop):**
- cron-enrich.js, cron-inbox-triage.js, cron-meeting-prep.js, cron-profile-synthesis.js, cron-relationship-intel.js, cron-task-automation.js, cron-weekly-report.js

**Need multi-user rewrite (hardcoded user or no user loop):**
- cron-sequence-enqueue.js (hardcoded SUNNY_USER_ID)
- cron-email-voice-learning.js (likely single-user)
- cron-preference-synthesis.js (user_id scoped but may not loop)
- cron-rule-promotion.js (user_id scoped but may not loop)
- cron-self-awareness.js (user_id scoped but may not loop)

**Org-scoped (touch SHARED data, no user loop needed):**
- cron-company-enrich, cron-competitive-intel, cron-deal-attribution, cron-document-scan, cron-edit-delta, cron-email-template-learning, cron-health-check, cron-health-watcher, cron-job-cleanup, cron-jobs-worker, cron-learning-director, cron-morning-email, cron-morning-intelligence, cron-news-classify, cron-outreach-score, cron-partner-reconcile, cron-partnership-scan, cron-partnership-verify, cron-people-verify, cron-pipeline-hygiene, cron-score-companies, cron-segment-enroller, cron-selfcheck-watcher, cron-sequence-reply-detect, cron-sequence-sender, cron-task-executor

**System (no user/org scope):**
- cron-background-task-cleanup.js

---

## A.9 — KIKO PROMPT ASSEMBLY ORDER (CRITICAL)

File: `api/kiko.js`

**Assembly order (line numbers):**

1. **L249-411**: `SYSTEM_PROMPT` constant — hardcoded Kiko identity, tool routing, communication rules, partnership rules, campaign protocol. Contains `{COMPANY_NAME}`, `{USER_NAME}`, `{USER_TITLE}`, `{USER_LOCATION}`, `{DYNAMIC_SELF_KNOWLEDGE}`, `{currentPage}` placeholders.

2. **L414-424**: `PAGE_ROLES` — per-page role hints (pipeline, command-centre, etc.)

3. **L556**: `userConfig` loaded from `kiko_user_config` by email

4. **L607-615**: Parallel load: `entityContext`, `identityResult` (kiko_memories identity.md), `selfKnowledge` (kiko-self-knowledge.js), `voiceMemResult`

5. **L617-618**: `identityContext` — from kiko_memories `/memories/identity.md` for this user

6. **L620-635**: `voiceRules` + `preloadedMemory` — voice-mode only

7. **L637-642**: `PERSONALITIES` — style variants (concise, analytical, warm, executive)

8. **L644-657**: `const system =` FINAL ASSEMBLY:
   - SYSTEM_PROMPT with placeholders replaced
   - + date/time/page
   - + pageContext summary
   - + personality style
   - + pageRole + entityContext + voiceRules + preloadedMemory
   - + CRITICAL IDENTITY block (user's name)
   - + MEMORY ISOLATION block (for non-super_admin)

9. **L700-716**: `messages` array built from conversationHistory + current message + attachments

10. **L566-586**: `activeThreadsHint` — injected into routingHint, NOT into system prompt directly

11. **L937-1015**: `routingHint` — injected based on intent classification, added to system string at call time

**For 3-layer Bible split:** Replace the hardcoded SYSTEM_PROMPT (step 1) with: `coreBible + orgBible + personalBible` loaded from DB tables. Keep steps 2-11 unchanged. The placeholder replacement logic stays the same — just the source string changes.

---

## A.10 — ROLLBACK SQL

See: `/Users/sunny/Desktop/vela-platform/SUB_PHASE_B_ROLLBACK.sql`

---

## A.11 — KIKO HEALTH PROBE SPEC

### Endpoint: `POST /api/kiko-health`

**Purpose:** Verify Kiko's AI brain is functioning correctly after any schema/code change.

**Implementation:**
1. Call Anthropic Sonnet with system prompt: "You are Kiko. Confirm your identity in one sentence."
2. Measure latency
3. Return:
```json
{
  "status": "pass" | "fail",
  "latency_ms": 1234,
  "response_text": "I am Kiko, the AI executive operating partner for Van Hawke Group.",
  "bible_layers_loaded": ["core", "org", "personal"],
  "model": "claude-sonnet-4-20250514"
}
```
4. Fail conditions: Sonnet returns error, response doesn't mention "Kiko", latency > 30s
5. Bible layers check: after Sub-Phase C, verify all 3 layers loaded from DB

---

## A.12 — CLASSIFICATION COUNTS CROSS-CHECK

| Category | From inventory | From policies |
|---|---|---|
| SHARED tables (org_id) | 36 | Policies reference jwt->app_metadata->org_id |
| PERSONAL tables (user_id) | 28 | Policies reference auth.uid() = user_id |
| REFERENCE (no scope) | 12 | No user/org policies |
| SYSTEM | 15 | service_role or true |
| RLS disabled | 29 | — |
| Hardcoded user_id | 7 files | — |
| Export endpoints | 3 | — |
