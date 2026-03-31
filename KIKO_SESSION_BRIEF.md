# KIKO INTELLIGENCE OS — MASTER SESSION BRIEF
# ═══════════════════════════════════════════════
# Last updated: 31 March 2026, end of Session 6
# MANDATORY: Read this ENTIRE file before writing ANY code
# MANDATORY: Read KIKO_EVOLUTION_PLAN.md before writing ANY code
# ═══════════════════════════════════════════════

---

## ⛔ CRITICAL RULES — VIOLATE THESE AND YOU BREAK PRODUCTION

1. **NEVER deploy without explicit "deploy" approval from Sunny.**
2. **NEVER push colour/theme changes to production** — render locally first.
3. **NEVER say "deployed" without verifying the live bundle hash changed.**
4. **NEVER hardcode user IDs, emails, or UUIDs** — use `getActiveUsers()` from `api/cron-utils.js`.
5. **NEVER rewrite working agents** — add layers on top (additive only).
6. **ALWAYS read this file + KIKO_EVOLUTION_PLAN.md before any code changes.**
7. **ALWAYS wrap new features in try/catch** — failure must not break existing behaviour.
8. **ALWAYS test with curl before deploying** — see Foundation Tests below.

### Deploy command & env vars
```
VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force
```
- Live URL: `https://vela-platform-one.vercel.app`
- Local codebase: `/Users/sunny/Desktop/vela-platform/`
- Supabase project: `dwiywqeleyckzcxbwrlb` | Org: `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- Vercel env vars: `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY` (NOT `ANTHROPIC_API_KEY`)
- Supabase service role key: starts with `eyJhbG...jQd1_k` (in `.env.local` line 12)

### 8-step build process
1. `git tag pre-<feature>-$(date +%Y%m%d%H%M)` — backup tag
2. `npm run build` — must succeed
3. Verify key strings in built JS (`grep -c 'yourString' dist/assets/index-*.js`)
4. `git add -A && git commit -m "description"`
5. Deploy with `--force`
6. `curl -s https://vela-platform-one.vercel.app | grep -o 'index-[A-Za-z0-9_-]*\.js'` — verify hash changed
7. Test in browser (Cmd+Shift+R for hard refresh)
8. Only then confirm done

---

## WHAT KIKO IS

Kiko Intelligence OS is a **multi-user AI operating system** for Van Hawke Group. Not a chatbot — a platform. Kiko is Sunny's AI chief of staff. She knows his deals, contacts, calendar, emails, communication style, decision history, and proactively manages his day.

**The user:** Sunny Sidhu, CEO of Van Hawke Group (F1/Formula E sponsorship advisory, Van Hawke Maison eyewear, Van Hawke Group Inc. holding). Based in Weybridge, UK. Two daughters (Nyla, Maya). Communication style: formal, direct, commanding. No hedging words.

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 7, deployed on Vercel |
| Backend | Vercel serverless functions (Node.js ESM) at `/api/` |
| Database | Supabase Postgres with Row Level Security (RLS) |
| AI backbone | Claude (Anthropic) — Sonnet for agents, Haiku for intent classification |
| Voice | GPT-4o Realtime via WebRTC (broken, to be replaced with Pipecat+Deepgram+Cartesia) |
| Auth | Google OAuth via Supabase |
| File extraction | `/api/file-extract.js` — pdf-parse v1 (PDF), mammoth (DOCX), officeparser (XLSX/PPTX) |
| Storage | Supabase Storage bucket `vela-assets` (public, no size limit) |

---

## SYSTEM INVENTORY (verified 31 March 2026)

### 29 Tools (registered in `api/kiko-tools.js`)
ask_navigator, ask_deal_agent, ask_data_agent, ask_outreach_agent, ask_document_agent, ask_memory_engine, ask_strategy_agent, ask_negotiation_agent, ask_category_agent, ask_finance_agent, ask_ea_agent, ask_legal_agent, ask_dispute_agent, ask_content_agent, ask_investment_agent, ask_pricing_agent, ask_signal_agent, ask_travel_agent, ask_specialist_agent, navigate_page, log_activity, ask_lemlist_live, ask_self_monitor, search_conversations, trigger_triage, ask_code_review, read_email, read_calendar, manage_knowledge

### 25 Agents (in `api/agents/`)
category-control, code-review, content, data, deal, dispute, document, dynamic-runner, ea, finance, intent-classifier, investment, ip, legal, memory-engine, navigator, negotiation, outreach, pricing, product-dev, screen-reader, signal, strategy, travel, website

### 23 Crons (in `api/cron-*.js` + `api/cron-utils.js`)
competitive-intel, document-scan, edit-delta, email-template-learning, enrich, health-check, inbox-triage, learning-director, lemlist-enrich, lemlist-signals, meeting-prep, morning-intelligence, outreach-score, partnership-scan, preference-synthesis, proactive, profile-synthesis, relationship-intel, self-improvement, self-reflection, task-automation, task-executor + cron-utils (shared utilities)

**All crons use `getActiveUsers()` from `api/cron-utils.js` — zero hardcoded UUIDs or emails.**

### Cron Schedule
| Time | Job | Frequency |
|------|-----|-----------|
| Hourly | meeting-prep | Every hour |
| 4am Sun | profile-synthesis | Weekly |
| 5am Sun | relationship-intel | Weekly |
| 6am Sun | preference-synthesis, document-scan | Weekly |
| 6am Mon | enrich | Weekly |
| 6:30am Mon-Fri | task-automation | Weekdays |
| 7am Mon-Fri | partnership-scan, proactive | Weekdays |
| 7:15am Mon-Fri | inbox-triage | Weekdays |
| 7:30am Mon-Fri | morning-intelligence, lemlist-signals | Weekdays |
| 8am Mon-Fri | news-agent | Weekdays |
| 9am Mon | outreach-score | Weekly |
| 10pm Mon-Fri | edit-delta | Weekdays |
| 3am daily | learning-director | Daily |
| 3am Sun | self-improvement | Weekly |
| 4am Sun | self-reflection | Weekly |
| 2am Mon | competitive-intel | Weekly |
| 10am Sun | email-template-learning | Weekly |
| 6:15am Mon | lemlist-enrich | Weekly |

### Database Tables (113 tables in Supabase)
Key Kiko-specific tables: kiko_alerts, kiko_conversation_insights, kiko_cron_heartbeats, kiko_curiosity_queue, kiko_draft_actions, kiko_draft_tracking, kiko_dynamic_agents, kiko_error_log, kiko_imported_conversations, kiko_inbox_triage, kiko_knowledge_sources, kiko_learning_log, kiko_meeting_prep, kiko_memories, kiko_operational_mode, kiko_output_tracking, kiko_personal_context, kiko_preferences, kiko_relationships, kiko_skills, kiko_thought_journal, kiko_thread_tracker, kiko_user_config, kiko_user_profiles, kiko_win_loss_analysis

CRM tables: deals, contacts, companies, activities, tasks, pipelines, pipeline_stages, deal_stage_history, sponsor_categories, sponsorship_slots, f1_partnerships, f1_teams, race_calendar

---

## MULTI-USER ARCHITECTURE (verified bulletproof — 8/8 isolation tests pass)

- **PRIVATE per user** (RLS-isolated): Chats, email, calendar, personal context, conversation insights, imported conversations, learning log, thought journal, curiosity queue, relationships, preferences, user profiles, draft actions, memories
- **SHARED across org**: CRM pipeline, deals, contacts, companies, knowledge sources, skills, dynamic agents
- **Auth flow**: Google OAuth → auto-provisioned in `kiko_user_config` → `isRegistered` gate prevents UUID contamination
- **Roles**: super_admin / admin / user

---

## MULTI-USER FILE ARCHITECTURE

### How the main chat flow works (`api/kiko.js`)
1. **Request arrives**: message, userEmail, conversationHistory, currentPage, attachments
2. **User resolution**: `getUserConfig(email)` → gets userId, orgId, role, isRegistered
3. **Intent classification**: Haiku classifies into ~28 intents (navigation, pipeline, strategy, general, etc.)
4. **Routing**: Intent determines routing hint + pre-fetched context
5. **For general queries (Phase 6+7)**: Full tool access + live CRM context (4 parallel Supabase reads)
6. **Claude Sonnet runs**: System prompt + routing hint + context + tool definitions → streaming SSE response
7. **Tool loop**: If Claude calls tools, they execute via `kiko-tools.js`, results fed back
8. **Decision logging (Phase 8)**: Strategy/negotiation/deal decisions logged to `kiko_learning_log`
9. **Response streams**: SSE deltas to frontend, displayed in real-time

### Key frontend files
| File | What it does |
|------|-------------|
| `src/components/kiko/KikoChat.jsx` | Main chat interface. Textarea (uncontrolled-style but `value={input}`), file upload via `processFileForKiko`, message rendering with markdown cache, SSE streaming consumer. **PromptBar is defined inside the component and MUST be called as `{PromptBar({...})}` not `<PromptBar />`** — JSX component syntax causes React to destroy/recreate the textarea on every keystroke (root cause of the reversed text bug). |
| `src/components/kiko/KikoFloat.jsx` | Floating orb button (bottom-right). Opens a panel with its own chat. Uses `<input>` not `<textarea>`. Has its own file upload via Supabase Storage + `/api/documents`. |
| `src/components/layout/Layout.jsx` | Main layout wrapping all pages. Top nav bar, aurora canvas background, custom logo from localStorage, custom favicon from localStorage. **TABS order**: `topNavIds.map(id => ALL_NAV.find(n => n.id === id))` — respects user's Settings order. |
| `src/components/settings/Settings.jsx` | Settings page with tabs: Profile, Kiko, Skills, Navigation, Team, Appearance, Accounts. Appearance tab has: Navigation Logo, Login Brand Logo, Login Background Image, Browser Favicon uploads. |

---

## EVOLUTION PLAN — PHASE-BY-PHASE AUDIT (verified 31 March 2026)

### Phase 6: General Intelligence ✅ LIVE
**What it does**: Removes the restriction that lobotomised Kiko on general questions. General intent now gets "FULL access to all tools — CRM, web search, Gmail, Calendar, all 23 specialist agents."
**Where**: `api/kiko.js` line ~584, routing hint for `intent === 'general'`
**Verified**: "Explain how tariffs could affect our Haas sponsorship pipeline" → Strategy Agent invoked, real pipeline data referenced.

### Phase 7: CRM Context for General Queries ✅ LIVE
**What it does**: Before general queries, injects live CRM summary (active deals count, outstanding/overdue tasks, recent activity, recent decisions) into the system prompt.
**Where**: `api/kiko.js` line ~589, `if (isRegistered && intent === 'general')` block with 4 parallel `sbFetch` calls
**Verified**: "What should I prioritise this week" → Response mentioned NanoXplore by name with $300K weighted deal value.

### Phase 8: Decision Logging ✅ LIVE
**What it does**: After tool executions that represent DECISIONS (strategy, negotiation, deal, pricing agents), writes structured entries to `kiko_learning_log`.
**Where**: `api/kiko.js` — `logDecision()` function at line ~52, called at line ~893 after tool loop
**Verified**: "Should we pursue Nordic Semiconductor" → Entry created in kiko_learning_log with category=decision, full verdict captured.

### Phase 9: Pattern Matching ✅ LIVE
**What it does**: Strategy and Negotiation agents query `kiko_learning_log` for similar past decisions before reasoning. Keyword matching finds relevant entries.
**Where**: `api/agents/strategy.js` line ~106 (fetches learning_log, keyword matches, injects as PAST DECISIONS), `api/agents/negotiation.js` line ~55
**Verified**: Asked about Infineon after logging Nordic decision → Response said "pursue immediately alongside Nordic as parallel semiconductor strategy."

### Phase 10: Synthesised Brief ✅ LIVE
**What it does**: "Brief me" produces a Chief of Staff narrative with convergence detection, not a sectioned data dump. EA Agent passes all 9 data sources to Claude Sonnet with "SYNTHESISE" instruction.
**Where**: `api/agents/ea.js` line ~103 onwards — `briefData` JSON built, passed to `anthropic.messages.create()` with synthesis system prompt
**Verified**: "Brief me" → "URGENT ACTION: Contact Nima at NanoXplore NOW — his inbound response after 153 days silence coincides perfectly with today's F1 partnership surge."

### Phase 11: Proactive Intelligence Engine ✅ LIVE
**What it does**: `cron-proactive.js` runs 7am weekdays. Cross-references 5 data streams (news, outreach replies, deal stage changes, upcoming tasks, stale deals) via Haiku. Writes convergence alerts to `kiko_alerts` AND draft actions to `kiko_draft_actions`.
**Where**: `api/cron-proactive.js` — full implementation including Haiku convergence detection, email alerts for high-severity items
**Verified**: kiko_alerts table has 116+ entries. kiko_draft_actions table has entries with action_type, payload, status.

### Phase 12: Memory Synthesis ⚠️ 80% COMPLETE
**What EXISTS**:
- `kiko_preferences` table with 10 synthesised preferences (92% confidence "Prioritizes Cloudflare as Tier 1", 90% "Never shows pricing in early-stage outreach", 88% "Favors semiconductor companies", etc.)
- `cron-preference-synthesis.js` runs weekly (Sundays 6am), reads learning_log + conversation history, distils decision patterns via Sonnet

**What's MISSING**:
- ❌ **Preferences NOT injected into agent prompts.** `api/agents/strategy.js`, `api/agents/negotiation.js`, and `api/agents/ea.js` have ZERO references to `kiko_preferences`. The data exists but agents don't use it.
- **TO COMPLETE**: Add a parallel `sbFetch('kiko_preferences')` call in each agent's data-gathering phase, format as `[SUNNY'S PREFERENCES]` section, inject into the agent's system prompt. ~30 minutes work.

### Phase 13: Voice Replacement ❌ NOT DONE
**What EXISTS**: `src/components/kiko/KikoVoice.jsx` with GPT-4o Realtime WebRTC (partially working but hallucination-prone, persistent browser caching issues). Multiple git tags show failed attempts (LiveKit, relay patterns).
**What's NEEDED**: Kill GPT-4o. Replace with Pipecat + Claude + Deepgram STT + Cartesia TTS (Serafina voice ID: `4tRn1lSkEn13EVTuqb0g`). Voice becomes a transport layer — same `/api/kiko` endpoint handles voice and text.
**Effort**: 3-4 hours. Biggest remaining lift.

### Phase 14: Autonomous Draft Actions ⚠️ 70% COMPLETE
**What EXISTS**:
- `kiko_draft_actions` table with real data (follow_up actions, deal moves, etc.) created by the proactive cron (Phase 11)
- Draft actions include: action_type (follow_up, deal_move, task_create), payload (entity, context, suggested action), status (pending/approved/rejected)

**What's MISSING**:
- ❌ **No UI for review/approve/dismiss.** Draft actions are created but completely invisible to the user.
- **TO COMPLETE**: Build a homepage widget showing pending draft actions with [Review] [Approve] [Dismiss] buttons. On approve, execute the action (send email draft to compose, move deal stage, create task). ~1-2 hours work.

---

## FILE INTELLIGENCE — STATUS: ✅ LIVE

**Endpoint**: `/api/file-extract.js`
**Libraries**: pdf-parse v1.1.1 (PDF), mammoth (DOCX), officeparser (XLSX/PPTX)
**Frontend**: `processFileForKiko()` in KikoChat.jsx
**Flow for large files (>3MB base64)**:
1. Frontend uploads raw file to Supabase Storage at `tmp/{timestamp}_{filename}`
2. Sends tiny JSON `{filename, storagePath}` to `/api/file-extract`
3. API downloads file from Supabase Storage via REST API using service role key
4. Extracts text server-side
5. Returns extracted text + metadata (type, pages, chars, truncated)
6. Frontend sends clean display message to chat ("📎 Uploaded: filename.pdf (19 pages, 8K chars)")
7. Full extracted text sent as `hiddenContext` parameter to `handleSubmit()` — user never sees raw text
8. Temp file auto-cleaned from storage
**Flow for small files (<3MB)**: Base64 sent directly in JSON body to `/api/file-extract`
**Limits**: 15MB frontend cap, 80K char truncation, 30s function timeout
**Known issue**: Vercel edge proxy has hard 4.5MB body limit — that's why large files MUST go through Supabase Storage

---

## PLATFORM HARDENING — STATUS AUDIT

### Error Handling & Recovery ⚠️ BASIC
- `kiko_error_log` table exists, server-side errors logged via `logError()` in kiko-tools.js
- **MISSING**: No graceful user-facing error messages (raw errors or silence), no auto-retry on tool failures, no Gmail token refresh prompts when auth expires mid-conversation
- **TO BUILD**: Wrap tool call errors in kiko.js with user-friendly messages, add exponential retry for transient failures (network, rate limits), detect expired Google token and prompt user to re-auth

### Response Speed ⚠️ 4.2s greeting, 14-28s tools
- Greeting: 5.4s → 4.2s (22% improvement from Session 4 optimisations: compact self-knowledge 2510→232 tokens, context queries 12→3)
- **MISSING**: No Haiku routing for simple greetings/navigation, no parallel streaming (context loads sequentially before response starts), full 20-message conversation history always sent
- **TO BUILD**: Use Haiku for greetings + simple navigation (sub-1.5s), stream response while context still loading (parallel), trim conversation history to last 10 for non-research queries

### Backup & Disaster Recovery ⚠️ GIT TAGS ONLY
- Git tags created before major deploys (e.g., `pre-phase6-backup-202603311345`)
- Supabase handles DB backups automatically (Pro plan: daily, 7-day retention)
- **MISSING**: No formal rollback procedure document, no manual DB snapshot schedule, no recovery runbook
- **TO BUILD**: Document rollback steps (git checkout tag → deploy), enable Supabase Point-in-Time Recovery, write recovery runbook

### Automated Testing ❌ NONE
- Foundation tests exist as manual curl commands in KIKO_EVOLUTION_PLAN.md (F1-F6)
- Zero automated/CI test coverage
- **MISSING**: Integration tests for multi-user isolation, regression tests for cron multi-user, load tests for concurrent users
- **TO BUILD**: Test suite (Vitest or Jest), CI pipeline (GitHub Actions), isolation test that creates test user and verifies zero data leakage

### Monitoring & Alerting ⚠️ BASIC
- `cron-health-check.js` runs every 30 minutes, writes to kiko_cron_heartbeats table
- `/api/health` endpoint checks 10 systems (supabase, anthropic_api, intent_classifier, etc.) — last verified 10/10 ✅
- Proactive cron sends email alerts for high-severity convergences
- **MISSING**: No external uptime monitoring, no Slack/email alerts when crons fail or API errors spike, no real-time health dashboard
- **TO BUILD**: Better Stack or Uptime Robot for external pinging, Slack webhook for critical failures, simple health dashboard page

### Audit Logging ❌ NONE
- `kiko_audit_log` table does NOT exist (Supabase returns 404). There IS a `self_audit_log` table but it's for Kiko's self-reflection, not security audit.
- **MISSING**: No query/tool-call/data-access logging with user IDs and timestamps
- **TO BUILD**: Create `kiko_audit_log` table (user_id, action_type, entity_type, entity_id, detail, ip_address, created_at). Log every query to kiko.js, every tool call, every CRM data access. ~20 minutes.

### Mobile Responsiveness ❌ UNTESTED
- Completely untested on phone/tablet
- Layout.jsx has a `.desktop-top-nav` class but no mobile breakpoints
- KikoChat.jsx has no responsive adjustments

---

## UI DESIGN DIRECTION

### Current (LIVE):
- Background: `#000000` (pure black) with animated aurora canvas orbs (purple/teal/pink/blue/amber)
- Accent: `#8B6CF6` (purple) with teal `#06D6A0` secondary
- Glass: `rgba(255,255,255,0.04-0.07)` with `backdrop-filter: blur(40px)`
- Font: DM Sans (`T.font` in `src/lib/theme.js`)
- Navigation: Floating glass pill with tabs, custom logo top-left (36px height), glass search bar top-right, custom favicon
- Kiko voice avatar: smoke-trail ribbon (V7)
- Drag-drop overlay: Dark theme (`rgba(10,10,14,0.92)`) with purple dashed border, auto-dismiss after 4s

### Approved direction (NOT yet implemented — render only):
- References: Niva AI (warm light), Payrix FMS (teal gradient + glass), Sphere AI (luminescent orbs)
- Any colour/theme changes MUST be shown as local renders first — never push to production

---

## KNOWN BUGS (as of 31 March 2026)

1. ~~Prompt bar text reversed~~ — **FIXED** Session 6. Root cause: PromptBar defined inside render → React destroyed/recreated textarea every keystroke. Fix: call as function `{PromptBar({...})}`.
2. ~~Drag-drop white overlay / stuck~~ — **FIXED** Session 6. Dark theme overlay + 4s auto-dismiss timeout.
3. ~~Nav order ignoring Settings~~ — **FIXED** Session 6. TABS now maps from `topNavIds` order.
4. **Browser/CDN caching** — Voice mode and UI changes sometimes require incognito/fresh tabs. Workaround: `?v=N` query param or Cmd+Shift+R.
5. **Kiko error log: `(relationships || []).filter is not a function`** — Seen in error log 31 March 07:30. Non-critical (cron-level), but should be investigated.

---

## SESSION HISTORY

| Session | Date | Key Work |
|---------|------|----------|
| 1 | 29 Mar 2026 | Platform scoping, CRM import (306 deals, 5006 contacts, 2244 companies), initial Kiko build |
| 2 | 29 Mar 2026 | Agent architecture (23 components), Navigator + Deal agents, KikoFloat pageContext fix |
| 3 | 30 Mar 2026 | Voice interface attempts (LiveKit → GPT-4o Realtime WebRTC) |
| 4 | 30 Mar 2026 | Multi-user architecture (54/54 audit pass), speed optimisation (5.4s→4.2s), ChatGPT import (384 conversations) |
| 5 | 30 Mar 2026 | Data isolation verification (8/8 tests), chat history UI, cron multi-user conversion, UI exploration (Niva/Payrix refs) |
| 6 | 31 Mar 2026 | Fixed reversed text, dictation bugs, file intelligence endpoint, nav order, drag-drop overlay, logo size, favicon upload, full phase audit |

Transcripts: `/mnt/transcripts/` (read-only). Key: `/mnt/transcripts/2026-03-30-18-41-09-kiko-session5-full-day.txt`

---

## KIKO'S SYNTHESISED PREFERENCES (from kiko_preferences table)

These are Kiko's learned decision patterns from Sunny's behaviour. Phase 12 completion will inject these into agent prompts.

| Confidence | Category | Preference |
|-----------|----------|------------|
| 92% | deal_selection | Consistently prioritizes Cloudflare as Tier 1 target |
| 90% | communication | Never shows pricing in early-stage outreach |
| 88% | deal_selection | Heavily favors semiconductor companies as highest-value targets |
| 87% | communication | Positions all outreach at C-suite level (CEO, CFO, CMO, CISO) |
| 85% | deal_selection | Monitors but does not pursue companies with active competing sponsorships |
| 85% | sector_preference | Prefers technology companies (semiconductors, cybersecurity, SaaS) |
| 82% | deal_selection | Kills deals that create category conflicts with existing prospects |
| 80% | pricing | Targets $1M+ deal sizes as minimum threshold |
| 78% | timing | Sets aggressive 14-day deadlines for strategy to execution |
| 75% | risk_tolerance | Pursues multiple parallel campaigns in same sector |

---

## NEXT SESSION — PRIORITY ACTIONS

### Immediate (do these first):
1. **Phase 12 COMPLETION: Inject preferences into agents** (~30 min)
   - In `api/agents/strategy.js`: Add `sbFetch('kiko_preferences?user_id=eq.${userId}&order=confidence.desc&limit=10')` to the parallel fetch array. Format as `[SUNNY'S PREFERENCES]:\n- {preference} (confidence: {confidence})` and inject into the system prompt.
   - Same pattern in `api/agents/negotiation.js` and `api/agents/ea.js`
   - Test: "Should we pursue [company]" → response should reference known preferences

2. **Phase 14 COMPLETION: Draft actions UI** (~1-2 hours)
   - Create a widget on the homepage showing pending draft actions from `kiko_draft_actions` where `status='pending'`
   - Each card shows: action_type, entity name, suggested action, [Approve] [Dismiss] buttons
   - Approve → execute action (create task, draft email, move deal stage via appropriate tool)
   - Dismiss → update status to 'rejected'
   - Query: `sbFetch('kiko_draft_actions?status=eq.pending&order=created_at.desc&limit=10')`

3. **Error handling** (~30 min)
   - In kiko.js tool loop: catch tool errors, return user-friendly message instead of raw error
   - Detect Gmail/Calendar auth failures (401/403), prompt user to re-authenticate
   - Add retry logic (1 retry with 2s delay) for transient network errors

4. **Response speed** (~1-2 hours)
   - Route greetings + simple navigation through Haiku instead of Sonnet (sub-1.5s)
   - Stream SSE response while context queries still running (Promise.allSettled, don't await all before streaming)
   - Trim conversation history: last 10 messages for non-research queries, last 20 for research

### Next priority:
5. **Audit logging** — Create `kiko_audit_log` table, log queries/tool calls/data access
6. **Monitoring** — External uptime ping (Better Stack), Slack webhook for cron failures
7. **Backup/DR** — Enable Supabase PITR, document rollback procedure
8. **Mobile responsiveness** — Full responsive pass
9. **Phase 13: Voice** — Pipecat + Claude + Deepgram + Cartesia (3-4 hours)

---

## FOUNDATION TESTS (run before every deploy)

```bash
URL="https://vela-platform-one.vercel.app"

# F1: Navigation
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"take me to pipeline","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep '"navigate":"pipeline"' && echo "F1 PASS" || echo "F1 FAIL"

# F2: Brief
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"brief me","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "delta" | head -1 && echo "F2 PASS" || echo "F2 FAIL"

# F3: Screen reader
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"what am I looking at","userEmail":"sunny@vanhawke.com","currentPage":"pipeline"}' \
  | grep "Intent.*screen" && echo "F3 PASS" || echo "F3 FAIL"

# F4: CRM query
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"search contacts at Torq","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "delta" | head -1 && echo "F4 PASS" || echo "F4 FAIL"

# F5: Strategy
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"should we pursue Cloudflare","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "Intent.*strategy" && echo "F5 PASS" || echo "F5 FAIL"

# Health check
curl -s $URL/api/health | python3 -m json.tool | grep -E 'passed|failed'

# File extract test
curl -s -X POST $URL/api/file-extract -H 'Content-Type: application/json' \
  -d '{"filename":"test.txt","data":"aGVsbG8gd29ybGQ="}' | python3 -m json.tool
```

---

## IMPORTANT GOTCHAS FOR NEW SESSIONS

1. **PromptBar in KikoChat.jsx** — Defined inside the render function. MUST be called as `{PromptBar({welcome: true})}` and `{PromptBar({})}`, NEVER as `<PromptBar />`. JSX component syntax causes React to remount the textarea on every keystroke.

2. **Vercel body limit** — Hard 4.5MB edge proxy limit. Large files MUST go through Supabase Storage, not base64 in JSON body. This is why `/api/file-extract.js` accepts both `data` (small files) and `storagePath` (large files).

3. **pdf-parse version** — MUST be v1.1.1 (CommonJS). v2 crashes on Vercel serverless with constructor errors. Imported via `createRequire(import.meta.url)` since the API files use ESM.

4. **officeparser** for XLSX/PPTX — Returns different types depending on file. Sometimes string, sometimes object with `.toText()`. Always handle both: `typeof result === 'string' ? result : (result.toText ? result.toText() : JSON.stringify(result.content || result))`

5. **Env vars** — Vercel uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. API files should check both: `process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL`.

6. **Custom logo** — Stored in localStorage as `custom_logo_url`. If set, the `VAN HAWKE™` text in Layout.jsx is hidden and the image renders instead. Custom favicon at `custom_favicon_url`.

7. **composingRef removed from KikoChat** — The `onChange` handler is now `onChange={e => setInput(e.target.value)}` with no composingRef guard. This was removed because it blocked macOS system dictation and post-dictation editing.

8. **handleSubmit signature** — `handleSubmit(text, fileAttachments = [], hiddenContext = '')`. The `hiddenContext` parameter sends text to the API without showing it in the chat bubble. Used by file uploads.

*This brief was written at the end of Session 6, 31 March 2026. The platform is live and stable. All Phases 6-11 are verified working. Phases 12 and 14 need completion (data exists, UI/wiring missing).*
