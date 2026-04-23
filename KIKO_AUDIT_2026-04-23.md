# KIKO INTELLIGENCE OS — FULL PLATFORM AUDIT
# Date: 23 April 2026
# Auditor: Claude (Anthropic)

## EXECUTIVE SUMMARY
Kiko is a 112-file API platform with 39 tools, 25 sub-agents, 27 pages, and 17 Kiko components.
After Hetzner migration, the platform runs in hybrid mode: Hetzner (heavy API) + Vercel (frontend + lightweight APIs).

---

## 1. ENDPOINT ROUTING AUDIT

### ✅ CORRECTLY ON HETZNER (heavy/streaming):
- /api/kiko (main chat) — KikoChat.jsx → api.vanhawke.agency ✅
- /api/kiko (title generation) — KikoChat.jsx → api.vanhawke.agency ✅
- /api/create-gmail-draft — EmailDraft.jsx → api.vanhawke.agency ✅
- /api/team-members — EmailDraft.jsx → api.vanhawke.agency ✅
- /api/rewrite-email — EmailDraft.jsx → api.vanhawke.agency ✅ (JUST FIXED)

### ⚠️ ON VERCEL (relative /api/ URLs) — 62 calls across 27 pages:
These stay on Vercel. Most are lightweight CRUD operations that work fine there.
RISK: If Vercel is eliminated later, ALL these need migrating.

HEAVYWEIGHT (should move to Hetzner in future):
- /api/competitor-research — can be slow (web search heavy)
- /api/generate-sequence — AI-powered sequence generation
- /api/source-prospects — web search + enrichment
- /api/build-campaign — multi-step AI campaign builder
- /api/enrich-campaign-sponsorship — AI enrichment
- /api/news-signals — web search for news

LIGHTWEIGHT (fine on Vercel):
- /api/admin/orgs, /api/user-permissions, /api/org-branding — admin CRUD
- /api/pipeline-notifications — simple DB reads
- /api/partnership-matrix — simple DB CRUD
- /api/documents — file management
- /api/selfcheck — health check
- /api/sync-google-token — OAuth token sync
- /api/memory-tab — memory display
- /api/org-bible, /api/user-bible — settings CRUD

### ❌ BROKEN/MISSING ROUTES ON HETZNER:
- /api/kiko-research — route added but NO LONGER USED (research routing removed)
- /api/kiko-code — NOT on Hetzner, still hits Vercel (code generation feature)
- /api/gmail-draft — old endpoint, may conflict with /api/create-gmail-draft

---

## 2. KIKO TOOLS AUDIT (39 tools in kiko-tools.js)

### VERIFIED WORKING:
- read_email — role-based permissions, super admin vs user ✅
- create_email_draft — sender selection, @vanhawke.agency signatures ✅
- web_search — used for research, verified in prompts ✅
- ask_data_agent — CRM queries ✅
- ask_outreach_agent — email drafting ✅
- pipeline_overview — deal summary ✅
- manage_knowledge — save/retrieve insights ✅
- learning_search / search_knowledge — knowledge bank queries ✅

### NOT VERIFIED (need end-to-end testing):
- batch_draft_emails — DESIGNED BUT NOT YET BUILT
- campaign_overview — may reference old Lemlist data
- create_campaign — multi-step AI campaign creation
- source_companies — web search + CRM cross-reference
- source_prospects — email finding cascade (6 APIs)
- verify_prospects — email verification
- enroll_prospects — campaign enrollment
- ask_strategy_agent — strategy analysis
- ask_legal_agent — legal analysis
- ask_research_agent — deep research
- ask_financial_agent — financial modeling
- ask_creative_agent — creative content
- competitive_analysis — competitor research
- market_intelligence — market research
- task_management — create/update/list tasks
- calendar_integration — calendar queries
- document_search — search uploaded docs
- file_intelligence — extract from uploads

---

## 3. SUB-AGENTS AUDIT (25 agents in api/agents/)

ALL 25 agent files exist on both Vercel AND Hetzner.
Each agent is a Claude prompt template invoked by the main kiko.js handler.

### NOT VERIFIED:
- Each agent's system prompt may be outdated
- Agents may reference tools/capabilities that have changed
- No end-to-end test of each agent's output quality
- Agent routing logic in kiko.js not audited for correctness

---

## 4. CRON JOBS / BACKGROUND PROCESSES

### ON HETZNER (kiko-worker PM2):
- Pipeline Monitor — every 30min (Mon-Fri) ✅ VERIFIED
- Email Monitor — every 15min (Mon-Fri 7am-9pm) ✅ VERIFIED
- LinkedIn connection acceptance — 3x daily (Mon-Fri) — NOT VERIFIED
- LinkedIn message reply detection — NOT VERIFIED
- Campaign sending cron — NOT VERIFIED

### ON VERCEL (pg_cron via Supabase):
- Nightly research (26 domains) — NOT VERIFIED
- Outreach scoring — NOT VERIFIED
- Morning brief generation — NOT VERIFIED
- Email voice learning — NOT VERIFIED
- Supabase backup — NOT VERIFIED

### ON HETZNER (root PM2 — kiko-crons.js):
- Multiple crons running under root — NOT VERIFIED
- May overlap with kiko user's PM2 processes

---

## 5. DATABASE SCHEMA ALIGNMENT

### VERIFIED TABLES:
- kiko_alerts — correct schema, RLS working (super admin sees all, users see own)
- deals — JSONB data column, 308 records
- contacts — JSONB data + verification fields
- companies — JSONB data
- users — id, email, role
- user_tokens — OAuth tokens per user per provider

### NOT VERIFIED:
- campaign_targets — may have schema drift
- outreach_sequences — may reference old Lemlist data
- kiko_knowledge — nightly research storage
- kiko_user_config — role definitions vs users table
- RLS policies on all tables — some may be too permissive or too restrictive

---

## 6. SELF-KNOWLEDGE ACCURACY

### UPDATED THIS SESSION:
- Email scanning permissions ✅
- Email draft sender selection ✅
- Real-time monitoring ✅
- Infrastructure (Hetzner) ✅
- Fact verification rules ✅
- Autonomous expertise switching ✅
- Source hierarchy ✅

### POTENTIALLY OUTDATED:
- Tool count (claims 39 — needs verification)
- Agent count (claims 25 — needs verification)
- Knowledge domain count (claims 26 — needs verification)
- Campaign engine capabilities — may reference Lemlist
- Voice mode — references GPT-4o Realtime which was reverted
- Pricing/financial references — may be stale

---

## 7. FRONTEND COMPONENTS

### VERIFIED:
- KikoChat.jsx — streaming, error recovery, auto-scroll, research routing removed ✅
- EmailDraft.jsx — sender selector, draft recipient, copy/edit, tone rewrite ✅
- Mobile responsiveness — touch targets 36px, dropdowns capped ✅

### NOT VERIFIED:
- KikoFloat.jsx — floating Kiko widget on other pages
- KikoVoice.jsx — voice mode (known broken)
- KikoWaveform.jsx — audio visualization
- CommandPalette.jsx — tool routing
- All 27 page components — may have stale data or broken features

---

## 8. CRITICAL ISSUES FOUND THIS SESSION

1. ❌ /api/kiko-research returned 404 on Hetzner — FIXED (routing removed)
2. ❌ /api/rewrite-email still hitting Vercel — FIXED (pointed to Hetzner)
3. ❌ Empty response handling left UI stuck — FIXED (finally block clears all state)
4. ❌ Research triggers stripped conversation history — FIXED (all routes through /api/kiko)
5. ❌ Pipeline monitor env vars evaluated at module load — FIXED (inline evaluation)
6. ❌ Email monitor alerts had user_id: null — FIXED (user-specific alerts)
7. ⚠️ Conversation summary only kicked in at 20 messages — FIXED (now 6)
8. ⚠️ Auto-scroll used 200px threshold — FIXED (always follows during streaming)

---

## 9. REMAINING RISKS

### HIGH:
- Voice mode is non-functional (GPT-4o Realtime reverted)
- Campaign sending cron not verified — may send broken sequences
- Knowledge bank freshness unknown — nightly crons not verified
- 62 API calls still on Vercel — if Vercel goes down, half the platform breaks

### MEDIUM:
- Sub-agent prompts may be outdated
- Outreach scoring engine may not be running
- Multiple PM2 instances (root vs kiko user) may conflict
- No automated testing — all verification is manual

### LOW:
- Mobile edge cases on real devices not tested
- Command palette tool routing not fully tested
- SponsorSignal LinkedIn posting not connected
