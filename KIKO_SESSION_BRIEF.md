# KIKO INTELLIGENCE OS — SESSION BRIEF
# Updated: 2 April 2026 (post email draft system + calendar expansion + feedback loop)
# Tag: v1.1-email-calendar | Commit: c84e3c2

## PLATFORM
- **Live URL:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Supabase:** project `dwiywqeleyckzcxbwrlb` | org `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- **Stack:** React/Vite + Vercel serverless + Supabase/Postgres + Claude Sonnet + GPT-4o Realtime (voice)
- **Deploy:** `npx vercel --prod --yes` (NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1 — caused $830 bill)
- **Env vars:** `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY), `VITE_SUPABASE_URL` (not SUPABASE_URL)
- **Bundle:** 670KB main + lazy chunks (down from 902KB, code-split via React.lazy)

## SYSTEM STATS
- 39 tools, 25 agents, 26 crons, 16 pages (11 lazy-loaded)
- 308 deals, 5,006 contacts, 2,243 companies, 389 partnerships
- 61 race calendar entries (22 F1, 12 Formula E, 19 MotoGP, 8 WEC)
- 186 learning entries, 158 alerts, 27 outreach scores, 2 draft tracking entries
- 183 conversations
- DB: ~75MB / 500MB free tier
- Monthly cost: ~$35-40 (Vercel $20, Anthropic $15-20, OpenAI <$1)

## ARCHITECTURE
- **System prompt:** Executive operating partner with EXECUTIVE LENS + REASONING DISCIPLINE + EMAIL FORMAT RULE (forces ### SUGGESTED DRAFT structure for outreach)
- **Multi-user:** Auto-provision on Google login, RLS isolation, 3 roles
- **Memory:** 3-layer — kiko_learning_log (facts), kiko_preferences (behaviours), conversation_embeddings (pgvector)
- **Model routing:** Haiku (greetings/nav <2s) → Sonnet (standard 3-5s) → Opus + extended thinking (deep 8-15s)
- **Email feedback loop:** kiko_draft_tracking stores original drafts → edit-delta cron compares with sent version → style_lessons injected into outreach system prompt on every email draft
- **Race-aware intelligence:** Proactive cron pulls race_calendar as 6th data stream, urgency-tints deals based on proximity to race weekends

## EMAIL DRAFT SYSTEM (FULLY OPERATIONAL — 2 Apr 2026)
### Components
- `src/components/kiko/EmailDraft.jsx` — Interactive email frame with To, Subject, body, tone CTAs
- `api/gmail-draft.js` — Silent Gmail draft creation via stored OAuth tokens (no popup)
- `api/rewrite-email.js` — Lightweight Haiku endpoint for tone rewrites (no tools/memory overhead)
- `api/agents/outreach.js` — Server-side draftEmail function with all fixes applied

### Verified behaviours
- ✅ Thinking collapsed ("Kiko's reasoning · N steps") — splits at response boundary markers
- ✅ EMAIL DRAFT frame renders with Subject, To, body paragraphs
- ✅ No "Sunny Sidhu" / sign-off / "Van Hawke Group" in email body (triple-layer strip)
- ✅ Subject clean — no â€" mojibake, plain hyphens only
- ✅ Tone CTAs: "More Direct" | "Warmer Tone" | "Shorter" — update body in-place via /api/rewrite-email
- ✅ "↩ Revert" button appears after rewrite, restores original body
- ✅ "Send to Gmail" → silent draft creation → button turns green "Draft saved"
- ✅ Gmail From: `Sunny Sidhu <sunny@vanhawke.agency>` (auto-replaces .com → .agency)
- ✅ Gmail body: Helvetica 12pt HTML
- ✅ Strategic commentary renders OUTSIDE email frame as markdown
- ✅ User message editing: click ✏ → textarea populates → submit truncates + resubmits

### Detection logic (3-layer)
1. Server: EMAIL FORMAT RULE in outreach routing hint forces `### SUGGESTED DRAFT` header
2. Client: Thinking stripped from raw text BEFORE isEmailDraft() runs (same markers as md() collapse)
3. Client: isEmailDraft() matches Subject+To together, "here's the email", "I've drafted" patterns

### Email quality feedback loop
1. Kiko drafts email → tracked in `kiko_draft_tracking` (both outreach agent + "Send to Gmail" button)
2. User edits + sends from Gmail
3. `cron-edit-delta` (10pm nightly) detects sent email, compares original vs sent via Haiku
4. Style lesson + change list written to `edit_delta` JSONB column
5. Major/moderate lessons also saved to `kiko_learning_log` (category: email_style)
6. Next email draft → lessons fetched and injected as `[EMAIL WRITING FEEDBACK]` in system prompt
7. Claude applies accumulated lessons → emails improve over time

## CALENDAR SYSTEM (4 SERIES — 2 Apr 2026)
### Data (race_calendar table)
- F1: 22 races (Mar 8 – Dec 6, 2026)
- Formula E: 12 races (Dec 6, 2025 – Aug 16, 2026)
- MotoGP: 19 races (Mar 1 – Nov 29, 2026)
- WEC: 8 races (Apr 19 – Nov 7, 2026) — Qatar postponed to Oct due to Iran war

### Command Centre
- Series selector tabs: F1 | Formula E | MotoGP | WEC
- Each tab shows next upcoming race with countdown (e.g., "17d — 6 Hours of Imola")

### Commercial Calendar page (/calendar)
- Full month grid with color-coded race cells (F1 red, FE blue, MotoGP dark red, WEC green)
- Series toggle buttons with remaining race counts
- Detail pane: selected date events + month events + upcoming races
- Legend: F1 weekend | Formula E | MotoGP | WEC | Outreach window
- Hardcoded data arrays: F1_2026, FE_S12, MOTOGP_2026, WEC_2026

### Race-aware outreach intelligence
- `cron-proactive.js` pulls race_calendar as 6th data stream (alongside news, replies, stage changes, tasks, stale deals)
- Urgency tinting: 🔴 CRITICAL (≤14d), 🟡 HIGH (≤30d), 🟢 NORMAL
- Haiku cross-references stale deals against upcoming race weekends
- `getOutreachIntelligence` has `race_windows` focus mode: shows next 6 races + stale deals needing contact

## CODE-SPLIT (2 Apr 2026)
- 11 pages wrapped in `React.lazy()` + `<Suspense>` boundary in App.jsx
- Main bundle: 670KB (down from 902KB = 26% reduction)
- Lazy chunks: Pipeline 30KB, Organisations 46KB, KikoCode 58KB, CommercialCalendar 22KB, etc.
- Home/KikoChat loads eagerly (no flash), all other pages lazy-load on navigation

## CRON STATUS
### CONFIRMED WORKING
- meeting-prep ✅ (hourly), proactive ✅ (7am, now with race calendar), partnership-scan ✅ (7am)
- task-automation ✅ (6:30am), edit-delta ✅ (10pm, now saves to learning log), weekly-report ✅ (Sun 7pm)
- health-check ✅ (every 30min), outreach-score ✅ (9am Mon)

### AWAITING VERIFICATION
- learning-director, inbox-triage, morning-intelligence, news-agent

## UI DESIGN DIRECTION (APPROVED)
- Dark ambient: #0A0A0C bg, gradient orb purple #7C5CFC to teal #00D4AA
- Glassmorphism: frosted glass panels, backdrop-filter blur, ultra-thin borders
- Font: 300-weight, letterSpacing -0.03em
- EmailDraft: glass frame with tone CTAs left, "Send to Gmail" right, body in 1.7 line-height
- Calendar: MotoGP red #BE1621, WEC green #00875A, F1 red #E10600, FE blue #0055CC

## VOICE — PHASE 13
### Status: UI wired, WebRTC partially built, no end-to-end audio flow
- KikoVoice.jsx exists (~320 lines) with 8 browser-executed function tools
- GPT-4o Realtime WebRTC rebuild deleted all legacy Deepgram files
- Correct architecture confirmed: speech → STT → /api/kiko → TTS → speech
- Voice state event system working (green pill, FAB glow, waveform)

## MANDATORY RULES
1. Every session: read KIKO_SESSION_BRIEF.md + KIKO_EVOLUTION_PLAN.md before writing code
2. Deploy process: build locally → verify no errors → commit → `npx vercel --prod --yes` → verify live → test browser → confirm. NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1 or --force (caused $830/month overage).
3. Never say "deployed" without verifying the live bundle hash changed
4. Before any external API work: search current docs first, never rely on training knowledge
5. All cron catch blocks return 200. All crons have "finished" heartbeat at every exit path
6. Gmail prospecting: @vanhawke.agency, Helvetica 12pt, no sign-off/name
7. "Vela" is internal codename only — Kiko is the product/platform/AI/OS

## KEY FILES
- `api/kiko.js` — Main brain: system prompt, model routing, tool loop, email style injection (line ~880)
- `api/kiko-tools.js` — 39 tool definitions
- `api/agents/outreach.js` — draftEmail (vanhawke.agency, Helvetica 12pt, body/subject cleanup)
- `api/agents/data.js` — getOutreachIntelligence (race_windows focus), getOutreachTiming
- `api/gmail-draft.js` — Silent Gmail draft creation + kiko_draft_tracking insert
- `api/rewrite-email.js` — Lightweight Haiku rewrite (claude-haiku-4-5-20251001, ANTHROPIC_KEY)
- `api/cron-proactive.js` — 6-stream cross-reference (news, replies, stages, tasks, stale deals, race calendar)
- `api/cron-edit-delta.js` — Draft edit comparison + style lesson extraction + learning log save
- `src/components/kiko/KikoChat.jsx` — Chat UI, thinking collapse, EmailDraft detection, user message editing
- `src/components/kiko/EmailDraft.jsx` — Email frame: isEmailDraft(), extractEmailSection(), parseEmail(), tone CTAs
- `src/pages/OutreachIntelligence.jsx` — Command Centre with 4-series race tabs
- `src/pages/CommercialCalendar.jsx` — Full calendar with F1/FE/MotoGP/WEC toggles + detail pane
- `src/App.jsx` — Router with React.lazy() code-split + Suspense boundary

## WHAT'S LEFT (priority order)
1. **Voice (Phase 13)** — STT + TTS pipeline. UI fully wired, zero audio flowing
2. **Verify remaining crons** — inbox-triage, morning-intelligence, news-agent, learning-director
3. **Mobile deep pass** — Real-device QA
4. **Memory optimisation** — Redis/Upstash cache for hot-path data (defer until 5+ DAU)
5. **Browser push notifications** — Service worker + Web Push API
