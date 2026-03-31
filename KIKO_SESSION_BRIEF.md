# KIKO OS — SESSION HANDOVER BRIEF
# Last updated: 31 March 2026, Session 6
# Author: Session 6 (31 March 2026)

---

## CRITICAL RULES — READ BEFORE DOING ANYTHING

1. **NEVER deploy to production without explicit approval.** The mandatory 8-step build process applies.
2. **Read KIKO_EVOLUTION_PLAN.md before writing any code.**
3. **NEVER push colour/theme changes to production** — create local HTML renders for approval first.
4. The live platform is: https://vela-platform-one.vercel.app
5. Local codebase: `/Users/sunny/Desktop/vela-platform/`
6. Supabase project ID: `dwiywqeleyckzcxbwrlb`, org: `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
7. Deploy command: `VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`
8. Key env var: `ANTHROPIC_KEY` (not `ANTHROPIC_API_KEY`)
9. Vercel env vars: `SUPABASE_URL` or `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## WHAT KIKO IS

Kiko Intelligence OS is a multi-user AI operating system. Not a chatbot — a platform.
Kiko is Sunny's AI chief of staff — she knows his deals, contacts, calendar, emails, communication style, and proactively manages his day.

### System Stats (verified 31 March 2026)
| Component | Count |
|-----------|-------|
| Tools | 29 |
| Intents | 28 |
| Agents | 22 (+ 7 direct tools) |
| Crons | 24 (all multi-user) |
| Tables | 25 + kiko_user_config |
| Knowledge sources | 60 |
| Personal context items | 365 |
| Relationships | 94 |
| Preferences (synthesised) | 10 |
| Memories | 46 |

### Tech Stack
- **Frontend**: React/Vite, deployed on Vercel
- **Backend**: Vercel serverless API routes (`/api/kiko.js` is the main coordinator)
- **Database**: Supabase/Postgres with RLS
- **AI**: Claude (Anthropic) as primary backbone, GPT-4o Realtime for voice (to be replaced)
- **Auth**: Google OAuth via Supabase
- **File extraction**: `/api/file-extract.js` — mammoth (DOCX), officeparser (XLSX/PPTX), pdf-parse v1 (PDF), Supabase Storage for large files (>3MB)

---

## EVOLUTION PLAN — PHASE STATUS AUDIT

| Phase | Feature | Status | Evidence |
|-------|---------|--------|----------|
| 6 | General Intelligence | ✅ LIVE | Routing hint says "FULL access to all tools". General queries use CRM, web search, all agents. |
| 7 | CRM Context | ✅ LIVE | 4 parallel queries (deals, tasks, activities, learning_log) injected into general queries. |
| 8 | Decision Logging | ✅ LIVE | `logDecision()` in kiko.js called after tool executions. Verified: Nordic Semiconductor verdict logged. |
| 9 | Pattern Matching | ✅ LIVE | strategy.js and negotiation.js query learning_log for past decisions. Verified: Infineon referenced Nordic. |
| 10 | Synthesised Brief | ✅ LIVE | ea.js passes raw data to Claude Sonnet with "SYNTHESISE" instruction. Narrative output verified. |
| 11 | Proactive Engine | ✅ LIVE | cron-proactive.js runs 7am weekdays. Cross-references signals via Haiku. Writes to kiko_alerts + kiko_draft_actions. |
| 12 | Memory Synthesis | ⚠️ PARTIAL | kiko_preferences table EXISTS with 10 entries. cron-preference-synthesis.js EXISTS and runs weekly. **BUT preferences NOT injected into agent prompts** (0 references in strategy/negotiation/ea agents). |
| 13 | Voice Replacement | ❌ NOT DONE | KikoVoice.jsx exists but still uses GPT-4o WebRTC. No Pipecat/Deepgram/Cartesia integration. Git tags show multiple voice attempts. |
| 14 | Autonomous Drafts | ⚠️ PARTIAL | kiko_draft_actions table EXISTS with data from proactive cron. **BUT no UI for review/approve/dismiss.** Draft actions are created but invisible to the user. |

### Additional Feature Status

| Feature | Status | Detail |
|---------|--------|--------|
| File Intelligence | ✅ LIVE | `/api/file-extract.js` — PDF (pdf-parse v1), DOCX (mammoth), XLSX/PPTX (officeparser). Large files upload to Supabase Storage first. Clean UX: short display message in chat, full text as hidden context. |
| Error Handling | ⚠️ BASIC | `kiko_error_log` table exists, errors logged server-side. BUT: no graceful user-facing messages, no auto-retry, no Gmail token refresh prompts. Raw errors shown or silent failures. |
| Response Speed | ⚠️ 4.2s | Greeting 4.2s (down from 5.4s). Tool queries 14-28s. No Haiku routing for simple queries, no parallel streaming while context loads. |
| Backup/DR | ⚠️ GIT ONLY | Git tags created before deploys. No formal rollback procedure, no DB snapshot schedule, no recovery runbook. |
| Automated Testing | ❌ NONE | Zero test coverage. Foundation tests exist as manual curl commands in Evolution Plan. No CI/CD. |
| Monitoring/Alerting | ⚠️ BASIC | `cron-health-check` writes to DB. No external monitoring (Uptime Robot, Better Stack), no Slack/email alerts, no real-time dashboard. |
| Audit Logging | ❌ NONE | `kiko_audit_log` table does NOT exist. No query/tool-call/data-access logging with user IDs. |
| Mobile Responsiveness | ❌ UNTESTED | Completely untested on phone. |
| Onboarding Flow | ❌ NONE | No new user setup wizard. |
| Billing | ❌ NONE | No Stripe integration. |

---

## SESSION 6 COMPLETED WORK (31 March 2026)

1. ✅ Deployed UI fixes (commit c448790 — logo, search bar, glassmorphism, nav reorder)
2. ✅ Fixed reversed text input — root cause: PromptBar defined inside render causing React to destroy/recreate textarea on every keystroke. Fix: call as function not JSX component.
3. ✅ Fixed dictation bugs — composingRef guard was blocking onChange after Kiko dictation and Mac system dictation
4. ✅ File intelligence — `/api/file-extract` endpoint (DOCX/XLSX/PPTX/PDF). Large files route through Supabase Storage to bypass Vercel's 4.5MB body limit.
5. ✅ Clean file upload UX — hidden context pattern (short display message, full text sent to API)
6. ✅ Nav order bug fixed — TABS now maps from topNavIds order, not ALL_NAV static order
7. ✅ Dark drag-drop overlay with auto-dismiss safety timeout (was white/invisible text, could get stuck)
8. ✅ Larger logo (28px → 36px, maxWidth 120→160)
9. ✅ Favicon upload in Settings > Appearance
10. ✅ Removed duplicate Profile Picture from Appearance (already in Profile tab)
11. ✅ Verified Phases 6-11 all working via live tests

---

## PRIORITY ACTIONS — NEXT SESSIONS

### Tier 1: Complete the Evolution Plan
1. **Phase 12 COMPLETION** — Inject preferences into agent prompts (strategy, negotiation, ea). Data exists, cron exists, just not wired into agents.
2. **Phase 13: Voice Replacement** — Kill GPT-4o. Pipecat + Claude + Deepgram STT + Cartesia TTS. Biggest lift (~3-4 hours).
3. **Phase 14 COMPLETION** — Build UI for draft actions: review/approve/dismiss on homepage. Data exists, just needs frontend.

### Tier 2: Platform Hardening (Sunny's additions)
4. **Error handling & recovery** — Graceful user-facing error messages, Gmail token auto-refresh, retry logic for tool failures. Currently: raw error text or silence.
5. **Response speed < 3s** — Use Haiku for greetings/simple queries, stream response while context still loading (parallel not sequential), trim conversation history to last 10 messages for non-research queries.
6. **Backup & DR** — Formal rollback procedure, Supabase DB snapshot schedule (daily via dashboard), recovery runbook document.
7. **Automated testing** — Integration tests for multi-user isolation, regression tests for cron multi-user, load tests for concurrent users. CI/CD pipeline.
8. **Monitoring & alerting** — External uptime monitoring (Better Stack or Uptime Robot), Slack/email alerts when crons fail or API errors spike, real-time health dashboard.
9. **Audit logging** — Create `kiko_audit_log` table. Log every query, tool call, and data access with timestamps and user IDs. Every enterprise buyer asks for this.

### Tier 3: Scale
10. **Mobile responsiveness** — Completely untested, needs full pass
11. **Onboarding flow** — New user setup wizard
12. **Billing** — Stripe integration
13. **SSO/SAML** — Supabase supports it, needs config
14. **GDPR** — Data export/deletion

### Tier 4: Differentiators
15. **Kernel extraction** — Separate Kiko intelligence from Vela application
16. **Agent marketplace**, **Workflow automation**, **Desktop app**

---

## KNOWN BUGS

1. ~~Prompt bar text reversed~~ — FIXED Session 6 (PromptBar inside render)
2. ~~Drag-drop white overlay~~ — FIXED Session 6 (dark theme + auto-dismiss)
3. ~~Nav order not matching Settings~~ — FIXED Session 6 (topNavIds.map)
4. **Browser/CDN caching** — Voice mode and some UI changes require incognito/fresh tabs
5. **PDF extraction with very large files** — Works via Supabase Storage path, but extraction can be slow for 50+ page documents

---

## MANDATORY 8-STEP BUILD PROCESS

Before ANY deploy:
1. Backup/tag current state
2. Build locally (`npm run build`)
3. Verify key strings in built JS
4. Commit to git
5. Deploy with `--force`
6. Verify live URL serves new bundle hash
7. Test in browser
8. Only then confirm done

**NEVER say "deployed" without verifying the live hash changed.**

---

## KEY FILES

| File | Purpose |
|------|---------|
| `api/kiko.js` | Main AI coordinator — intent routing, context loading, streaming, decision logging |
| `api/kiko-tools.js` | Tool registry (29 tools), sbFetch helper, error logging |
| `api/file-extract.js` | Server-side document extraction (PDF/DOCX/XLSX/PPTX) |
| `api/agents/ea.js` | EA Agent — synthesised morning brief (Phase 10) |
| `api/agents/strategy.js` | Strategy Agent — with past decision pattern matching (Phase 9) |
| `api/agents/negotiation.js` | Negotiation Agent — with past position matching (Phase 9) |
| `api/cron-proactive.js` | Proactive intelligence — convergence detection + draft actions (Phase 11/14) |
| `api/cron-preference-synthesis.js` | Weekly preference model synthesis (Phase 12) |
| `src/components/kiko/KikoChat.jsx` | Main chat — textarea, file upload, message rendering |
| `src/components/kiko/KikoFloat.jsx` | Floating Kiko orb |
| `src/components/layout/Layout.jsx` | Main layout — top nav, tabs, search, aurora, favicon |
| `src/components/settings/Settings.jsx` | Settings — nav config, appearance, favicon upload |
| `src/lib/theme.js` | Central theme object (T) |
| `KIKO_EVOLUTION_PLAN.md` | 19-phase architecture spec — MANDATORY reading |

---

## WHAT TO DO FIRST IN A NEW SESSION

1. Read this file (`KIKO_SESSION_BRIEF.md`)
2. Read `KIKO_EVOLUTION_PLAN.md`
3. Check git state: `git log --oneline -5`
4. Run health check: `curl -s https://vela-platform-one.vercel.app/api/health | python3 -m json.tool`
5. Ask Sunny what the priority is

*Updated at end of Session 6, 31 March 2026.*
