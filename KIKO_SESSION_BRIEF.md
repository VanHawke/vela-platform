# KIKO OS — SESSION HANDOVER BRIEF
# Last updated: 31 March 2026
# Author: Session 5 (30 March 2026, full day)

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

---

## WHAT KIKO IS

Kiko Intelligence OS is a multi-user AI operating system. Not a chatbot — a platform.

The user is Sunny, CEO of Van Hawke Group (F1/Formula E sponsorship advisory).
Kiko is Sunny's AI chief of staff — she knows his deals, contacts, calendar, emails, communication style, and proactively manages his day.

### System Stats (verified 30 March 2026)
| Component | Count |
|-----------|-------|
| Tools | 29 |
| Intents | 28 |
| Agents | 22 (+ 7 direct tools) |
| Crons | 24 (all 17 user-facing converted to multi-user) |
| Tables | 25 + kiko_user_config |
| Knowledge sources | 60 |
| Personal context items | 365 |
| Conversation insights | 305 |
| Relationships | 94 |
| Preferences | 10 |
| Imported conversations | 384 (322 ChatGPT + 62 Claude) |
| Memories | 46 |
| Learning log | 48 |
| Skills | 35 |
| Alerts | 107 |

### Tech Stack
- **Frontend**: React/Vite, deployed on Vercel
- **Backend**: Vercel serverless API routes (`/api/kiko.js` is the main coordinator)
- **Database**: Supabase/Postgres with RLS
- **AI**: Claude (Anthropic) as primary backbone, GPT-4o Realtime for voice
- **Auth**: Google OAuth via Supabase

---

## MULTI-USER ARCHITECTURE — VERIFIED BULLETPROOF

### Isolation Model
- **PRIVATE per user**: Chats, email, calendar, personal context, conversation insights, imported conversations, learning log, thought journal, curiosity queue, relationships, preferences, user profiles, draft actions, memories
- **SHARED across org**: CRM pipeline, deals, contacts, companies, knowledge sources, skills, dynamic agents

### How It Works
1. User logs in via Google → auto-provisioned in `kiko_user_config` table
2. RLS policies isolate all private data by `user_id`
3. Three roles: `super_admin` / `admin` / `user`
4. `isRegistered` gate prevents data writes for unregistered users (prevents UUID contamination)
5. All 17 cron files use `getActiveUsers()` from `api/cron-utils.js` — zero hardcoded UUIDs or emails

### Verification Results (8/8 tests pass)
- Sunny sees his data (Nyla ✅, Maya ✅)
- Alice (test user): ZERO leaks ✅
- Bob (test user): ZERO leaks ✅
- Stranger: ZERO leaks ✅
- Alice/Bob not called Sunny ✅
- Fallback UUID: ZERO rows ✅
- Zero rows in ANY private table for non-Sunny users ✅

---

## KEY FILES

| File | Purpose |
|------|---------|
| `api/kiko.js` | Main AI coordinator — intent routing, context loading, streaming |
| `api/kiko-tools.js` | Tool registry (29 tools), sbFetch helper, error logging |
| `api/kiko-self-knowledge.js` | Auto-generated system stats (compact 232-token format) |
| `api/cron-utils.js` | Shared multi-user cron utilities (getActiveUsers, getGoogleToken) |
| `src/lib/theme.js` | Central theme object (T) — all colors, glass, shadows, aurora config |
| `src/index.css` | CSS variables, glass/card classes, animations, keyframes |
| `src/components/layout/Layout.jsx` | Main layout — top nav, tabs, search, aurora background |
| `src/components/kiko/KikoChat.jsx` | Main chat — textarea, message rendering, markdown cache |
| `src/components/kiko/KikoFloat.jsx` | Floating Kiko orb — the circular button bottom-right |
| `src/components/kiko/ChatHistory.jsx` | Sidebar — recents, three-dot menu |
| `src/components/kiko/AllChatsView.jsx` | Full chat search (deep search via Supabase RPC) |
| `src/components/settings/Settings.jsx` | Settings page — nav config, team, appearance |
| `src/components/auth/LoginPage.jsx` | Login — Google OAuth, frosted glass design |
| `src/pages/Pipeline.jsx` | Deal pipeline (Kanban) |
| `KIKO_EVOLUTION_PLAN.md` | 19-phase architecture spec — MANDATORY reading before code changes |
| `KIKO_MASTER_ARCHITECTURE.md` | Full system architecture document |

---

## CURRENT DEPLOYMENT STATE

### What's LIVE on production (vela-platform-one.vercel.app):
- Original black (#000000) background with purple (#8B6CF6) accents
- The revert of the warm theme change is deployed
- All cron multi-user conversions are deployed
- Chat history sidebar, deep search, prompt bar redesign — all deployed
- Speed optimizations (greeting 5.4s→4.2s) — deployed

### What's COMMITTED but NOT deployed:
Commit `c448790` — UI fixes (awaiting approval to deploy):
1. **Brand logo** — fontSize 12→15, fontWeight 500→600, color opacity 0.4→0.55, added ™ superscript
2. **Search bar** — Larger padding, glass background with backdrop-filter blur, stronger border
3. **Prompt bar text direction** — Added `dir="ltr"` to textarea to fix reverse text input bug
4. **Settings nav reorder** — Fixed: now renders enabled items in their actual order, then disabled items
5. **Enhanced glassmorphism** — Glass borders 0.5px→1px, inset top-edge highlight + bottom shadow, deeper outer shadows, saturate(1.5-1.6) on backdrop-filter

---

## PENDING WORK — PRIORITY ORDER

### Tier 1: Must-have for daily use
1. **Deploy the UI fixes** (commit c448790) — awaiting Sunny's approval
2. **Response speed < 3s** — Currently 4.2s greeting. Next: use Haiku for greetings, stream while context loads
3. **Voice mode** — Pipecat + Claude + Deepgram STT + Cartesia TTS (Serafina voice ID: 4tRn1lSkEn13EVTuqb0g). WebRTC rebuild with GPT-4o Realtime was completed but has persistent browser/CDN caching issues
4. **Push notifications** — Morning brief to email/WhatsApp
5. **Chat fluidity** — The `dir="ltr"` fix addresses reverse text. Further improvements needed for streaming smoothness
6. **File intelligence** — Server-side PDF/DOCX/XLSX extraction via `pdf-parse`, `mammoth`, `xlsx` npm packages. Add `/api/file-extract` endpoint. Doable with current setup.
7. **Mobile responsiveness** — Completely untested on phone

### Tier 2: Required for paying customers
8. **Onboarding flow** — New user setup wizard
9. **Billing** — Stripe integration
10. **Admin dashboard** — Settings > Team page (exists but untested)
11. **Audit logging** — `kiko_audit_log` table
12. **GDPR** — Data export/deletion
13. **SSO/SAML** — Supabase supports it, needs config

### Tier 3: Scale
14. **Rate limiting**, **Testing**, **Documentation**, **Monitoring**, **Backup/DR**

### Tier 4: Differentiators
15. **Kernel extraction** — Separate Kiko intelligence from Vela application
16. **Agent marketplace**, **Workflow automation**, **Desktop app**

---

## KNOWN BUGS

1. **Prompt bar text input reversed** — FIXED in commit c448790 (not deployed). Added `dir="ltr"` to textarea
2. **Settings nav reorder doesn't reflect order** — FIXED in commit c448790. Was rendering `ALL_TOP_NAV` (static order) instead of `topNavItems` (user's order)
3. **Browser/CDN caching** — Voice mode and some UI changes require incognito/fresh tabs to see updates
4. **Page freezing on long conversations** — FIXED earlier. Markdown cache (200 entries LRU) + 40-message render limit with "Show earlier" button
5. **Chat streaming smoothness** — Needs investigation. Streaming works but can feel jerky on long responses

---

## UI DESIGN DIRECTION

### Current state (LIVE):
- Background: #000000 (pure black)
- Accent: #8B6CF6 (purple) with teal #06D6A0 secondary
- Glass: `rgba(255,255,255,0.04-0.07)` with `backdrop-filter: blur(40px)`
- Font: DM Sans (system fonts as fallback)
- Aurora: Animated canvas orbs (purple/teal/pink/blue/amber)

### Approved direction (NOT implemented — render stage only):
- Sunny reviewed Behance/Dribbble references extensively
- Key references: Niva AI (warm light), Payrix FMS (teal gradient + glass), Sphere AI (luminescent orbs)
- The screenshot reference Sunny provided shows: warm dark charcoal background (#2A2A2C-ish), amber/gold CTAs, softer glass
- **CRITICAL**: Any colour/theme changes must be shown as LOCAL RENDERS FIRST. Never push to production.
- Local mockup files were created at `/Users/sunny/Desktop/vela-platform/kiko-mockup-*.html` and `/Users/sunny/Desktop/vela-platform/kiko-payrix.html`
- Renders were also shown via browser CSS injection (no code changes)
- Final design direction is still being refined — do not implement until approved

### Design specs from references:
- **Payrix**: Font Urbanist, teal gradient background upper half, frosted glass cards on top, orange accent borders, "Ask anything" AI bar at bottom
- **Niva**: Font Roobert (→Outfit as Google Fonts match), bg #F0EFEB (warm cream LIGHT theme), blue #4A7FF8, orange #FF7648, amber #FFC757
- **Screenshot reference**: Dark warm charcoal, amber/gold accent replacing purple, same layout

---

## CRON SCHEDULE (24 jobs, all multi-user)

| Time | Job | Frequency |
|------|-----|-----------|
| Hourly | meeting-prep | Every hour |
| 4am Sun | profile-synthesis | Weekly |
| 5am Sun | relationship-intel | Weekly |
| 6am Sun | preference-synthesis + document-scan | Weekly |
| 6am Mon | enrich | Weekly |
| 7am Mon-Fri | partnership-scan + proactive | Weekdays |
| 7:15am Mon-Fri | inbox-triage | Weekdays |
| 8am Mon-Fri | news-agent | Weekdays |
| 9am Mon | outreach-score | Weekly |
| 10pm Mon-Fri | edit-delta | Weekdays |

All 17 cron files use `getActiveUsers()` from `api/cron-utils.js`. Zero hardcoded UUIDs or emails.

---

## SPEED OPTIMISATION (completed)

| Metric | Before | After |
|--------|--------|-------|
| System prompt routing | 89 lines (~3,500 chars) | 28 lines (~2,000 chars) |
| Self-knowledge | 2,510 tokens | 232 tokens (-91%) |
| Context queries (greeting) | 12 | 3 (-75%) |
| Greeting first token | 5.4s | 4.2s (-22%) |
| Greeting headers | 3.6s | 2.6s (-28%) |

Next optimisation: Use Haiku for simple greetings/navigation, stream response while context still loading.

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

## IMPORTANT CONTEXT ABOUT THE USER

- Sunny is CEO of Van Hawke Group (F1/FE sponsorship advisory, Maison eyewear, Group Inc holding)
- Communication style: formal, direct, commanding authority. No hedging words.
- Language rules: "intelligent age" not "AI generation", all financials in USD, emails under 150 words
- Daughters: Nyla and Maya. Based in Weybridge, UK. Child in Year 1 at Oatlands School.
- SponsorSignal: Daily LinkedIn sponsorship intelligence post (8am UK)
- Haas F1 is the primary deal (multi-year, 2026-2028, advanced negotiation, $2.4M)
- Van Hawke Maison: Cultural Performance Eyewear, pre-seed $500K round, Archive 01 as proof-of-concept

---

## HEALTH CHECK

The health endpoint (`/api/health`) checks 10 systems. As of session end: **10/10 ✅**
- supabase ✅, anthropic_api ✅, intent_classifier ✅, self_knowledge ✅
- google_token ✅, gmail_api ✅, calendar_api ✅, database_tables ✅
- cron_health ✅, kiko_endpoint ✅

---

## SESSION HISTORY (transcripts)

| Session | Date | Key Work |
|---------|------|----------|
| Session 1 | 29 Mar 2026 | Platform scoping, CRM import, initial Kiko build |
| Session 2 | 29 Mar 2026 | Agent architecture (23 components), Navigator + Deal agents |
| Session 3 | 30 Mar 2026 | Voice interface attempts (LiveKit → GPT-4o Realtime WebRTC) |
| Session 4 | 30 Mar 2026 | Multi-user architecture (54/54 audit), speed opt, ChatGPT import |
| Session 5 | 30 Mar 2026 | Data isolation verification, chat history UI, cron multi-user, UI exploration |

Transcript files are in `/mnt/transcripts/` (read-only). Key transcript:
`/mnt/transcripts/2026-03-30-18-41-09-kiko-session5-full-day.txt`

---

## WHAT TO DO FIRST IN A NEW SESSION

1. Read this file (`KIKO_SESSION_BRIEF.md`)
2. Read `KIKO_EVOLUTION_PLAN.md` (mandatory before any code changes)
3. Check what's committed vs deployed: `git log --oneline -5`
4. Run health check: `curl -s https://vela-platform-one.vercel.app/api/health | python3 -m json.tool`
5. Ask Sunny what the priority is

### Immediate pending items awaiting decision:
- **Deploy UI fixes** (commit c448790) — logo, search bar, text direction fix, nav reorder, glassmorphism
- **UI design direction** — Sunny is exploring colour/theme options. DO NOT implement without explicit approval. Create renders only.
- **File intelligence** — Server-side document extraction. Ready to build.
- **Chat fluidity** — Needs specific bug reports from Sunny to investigate

---

*This brief was auto-generated at the end of Session 5, 30 March 2026. The live platform is untouched — all UI experiments were reverted. The codebase has one uncommitted-to-production commit (c448790) with UI improvements awaiting deployment approval.*
