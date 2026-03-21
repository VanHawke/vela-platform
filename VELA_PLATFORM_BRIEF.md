# Vela Platform — Development Brief
## Updated: 21 March 2026 | For: Continued AI-assisted development

---

## 1. Platform Overview

**Vela** is an AI-native SaaS operating platform built for Van Hawke Group — an F1/Formula E sponsorship advisory firm led by Sunny Sidhu (CEO), based in Weybridge, UK. The platform functions as a single command centre for commercial intelligence, CRM, outreach, and pipeline management, with **Kiko** (Claude-powered AI) as the primary operating interface.

**Live URL:** https://vela-platform-one.vercel.app
**Repository:** github.com/VanHawke/vela-platform
**Local codebase:** `/Users/sunny/Desktop/vela-platform/` (authoritative)
**Stack:** React/Vite (frontend) · Vercel serverless (API) · Supabase/Postgres (database) · Claude Sonnet 4 (AI brain) · OpenAI GPT-4o Realtime (voice)
**Supabase project:** `dwiywqeleyckzcxbwrlb` · org_id `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
**User:** sunny@vanhawke.com · user_id `9f486437-4bf5-4111-abfe-fe19bfa76063` · role: super_admin
**Deploy command:** `cd /Users/sunny/Desktop/vela-platform && rm -rf dist && npm run build && git add -A && git commit -m "..." && git tag <tag> && VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`

**Current bundle:** `index-DTqDVGwl.js` | **Current tag:** `glassmorphism-v1` | **Deployment files:** 153

---

## 2. MANDATORY BUILD PROCESS

Before ANY deploy — no exceptions:
1. Backup/tag current state: `git tag backup-before-<change>`
2. Build locally: `rm -rf dist && npm run build`
3. Verify key strings in built JS: `grep -c "expected_string" dist/assets/index-*.js`
4. Commit to git: `git add -A && git commit -m "..."`
5. Deploy with force: `VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`
6. Verify live URL serves new bundle hash: `curl -s https://vela-platform-one.vercel.app/ | grep "index-"`
7. Test in browser
8. Only then confirm done. Never say "deployed" without verifying the live hash changed.

---

## 3. Architecture

### 3.1 Voice Architecture (Hybrid)
**GPT-4o Realtime** handles instant casual chat (~300ms). Memory facts pre-loaded into session instructions at connect time.
**Claude Sonnet 4** routes for tool-heavy queries (email, CRM, pipeline, calendar, documents, search).
**Refusal interceptor** catches GPT-4o denials mid-word, reroutes to Claude.

**Key mechanism: `suppressAutoRef`** prevents race condition — when routing to Claude, VAD is physically disabled AND suppress flag prevents stray auto-responses. Only Claude-injected `[KIKO_SAY]` responses pass through.

**CLAUDE_KEYWORDS** (trigger Claude routing): email, emails, inbox, correspondence, pipeline, deals, contacts, companies, search for, look up, news, latest, document, uploaded, calendar, meeting, brief me, summarise, draft, write an email

### 3.2 File/Image Pass-Through
Drop any file into chat → Claude analyses directly via Vision API. No storage pipeline.
- Images (PNG/JPG/WEBP) → base64 → Claude Vision content block
- PDFs → base64 → Claude document content block
- Text files (txt/md/csv/json/code) → read as text → send as message
- Other files → acknowledge with type/size

### 3.3 Knowledge Ingestion System
When documents are uploaded or the user teaches Kiko something:
- Claude automatically saves key facts to `kiko_memories` in Supabase
- Document type auto-detected and saved to categorised paths:
  - Contracts → `/memories/contracts/[company].md`
  - Pitch decks → `/memories/partnerships/[company].md`
  - Financial models → `/memories/financials/[topic].md`
  - Research → `/memories/research/[topic].md`
  - General → `/memories/documents.md`

### 3.4 Multi-Role Identity
Kiko adapts expertise per page via `PAGE_ROLES` in `api/kiko.js`:
- Pipeline → Sales Strategist
- Email → Communications Advisor
- Contacts → Relationship Manager
- Calendar → Chief of Staff
- News → Intelligence Analyst
- Documents → Research Analyst
- Partnership Matrix → Strategic Advisor
- Organisations → Due Diligence Analyst
- Home → Strategic Partner (proactive briefing)

### 3.5 Extended Thinking
Auto-triggers on keywords: analyse, analyze, deep dive, think through, strategic, evaluate, compare, assess, due diligence, comprehensive, thorough.
Uses `thinking: { type: 'enabled', budget_tokens: 10000 }` with 16K max_tokens.
Frontend shows reasoning steps in expandable UI.

### 3.6 Predictive Behaviour Engine
Kiko proactively surfaces insights without being asked:
- Flags deals with no activity in 7+ days
- Identifies unanswered email threads
- Surfaces contacts not touched in 30+ days
- Cross-references documents with active opportunities
- Saves pattern observations to `/memories/patterns.md`

### 3.7 Memory System
- **Table:** `kiko_memories` (id, path, content, is_directory, org_id, created_at, updated_at)
- **Core files:** `/memories/sunny_profile.md`, `/memories/identity.md`, `/memories/van_hawke.md`, `/memories/platform.md`
- **Voice mode:** Pre-loads `sunny_profile.md` + `identity.md` into system prompt (avoids slow tool calls)
- **Text chat:** Claude uses native `memory_20250818` tool to read/write full memory directory
- **Voice memory:** PARKED — GPT-4o ignores injected session instruction facts

---

## 4. File Structure

```
Frontend (React/Vite)
├── src/pages/           — All page components
├── src/components/      — Shared components
│   ├── kiko/            — KikoChat, KikoVoice, KikoFloat, ChatHistory, KikoSymbol
│   ├── layout/          — Layout, CommandPalette
│   ├── auth/            — LoginPage
│   └── settings/        — Settings, ImageUpload
├── src/lib/             — supabase.js, auth.js, theme.js
└── public/              — Static assets

Backend (Vercel Serverless — /api/) — 32 files
├── kiko.js              — PRIMARY: Claude brain, SSE streaming, all intelligence
├── kiko-tools.js        — Tool registry (51KB, 20+ tools)
├── kiko-code.js         — Code execution sandbox
├── voice.js             — GPT-4o ephemeral token + Whisper transcription
├── tts.js               — OpenAI TTS (shimmer voice)
├── email.js             — Gmail sync + operations
├── calendar.js          — Google Calendar integration
├── news-agent.js        — RSS aggregator + Haiku classifier (daily Mon-Fri 8am)
├── documents.js         — Document upload + vector search
├── enrichment-agent.js  — Company/contact enrichment
├── email-intelligence.js — Email relationship scoring
├── cron-enrich.js       — Weekly enrichment orchestrator
├── cron-outreach-score.js — Weekly outreach scoring
├── cron-partnership-scan.js — Weekly partnership intel
├── cron-document-scan.js — Weekly document scan
└── health.js            — Health check endpoint
```

---

## 5. UI Design Direction — LOCKED

### 5.1 Chosen Direction: Dark Glassmorphism (Aurora + Dribbble-inspired)
The final design combines elements from multiple explored concepts:

**Background:** #07070B near-black void with 4-5 animated gradient orbs (canvas-rendered, 60fps):
- Purple (#8B6CF6) — top-left
- Teal (#06D6A0) — bottom-right
- Pink (#EC4899) — scattered
- Blue (#3B82F6) — scattered
- Amber (#F59E0B) — on pipeline page

**Glass panels:** `rgba(255,255,255,0.035)` + `backdrop-filter: blur(24px)` + `0.5px border rgba(255,255,255,0.06)`. The ambient gradient orbs bleed through the frosted glass, creating living refraction that changes based on panel position.

**Kiko's Avatar:** Smoke-trail voice ribbon (V7 variant) — multiple translucent gradient layers (purple, teal, pink) with a bright white edge thread. Animates continuously. Shrinks to compact wave indicator in conversation mode.

**Typography:** -apple-system / SF Pro Display / DM Sans. Weight 200-300 throughout. Ultra-thin. 
- Greeting: 36px weight 200
- Body: 14px weight 300
- Labels: 11px weight 300 uppercase with letter-spacing
- All text: rgba(255,255,255, 0.15-0.9) depending on hierarchy

**Cards:** 18px border-radius, gradient edge indicators (vertical bars fading from colour to transparent), lift 3px + border brighten on hover. Glass status pills with semantic colour tints.

**Nav:** Frosted glass pill tabs in header (12px border-radius). Active tab: rgba white 0.07. Kiko logo: 7px gradient dot inside 28px frosted glass square + "kiko" lowercase text.

**Colour language:**
- Purple #8B6CF6 — intelligence, thinking, Kiko identity
- Teal #06D6A0 — action, data, opportunity, voice
- Amber #F59E0B — urgency, warnings, attention needed
- Pink #EC4899 — accent, secondary warmth
- Blue #3B82F6 — informational

**User messages:** Frosted purple glass (rgba(139,108,246,0.1) + blur + purple border)
**Kiko responses:** Plain text, no bubble, 300-weight, with a compact wave indicator
**Thinking state:** Purple glow dot with "Deep analysis" label + live mini wave

### 5.2 Design Options Explored (Saved for Reference)
- **Option A:** Dark ambient void — #0A0A0C, gradient orb, ultra-thin borders. User approved.
- **Option B:** Liquid glass (light mode) — frosted panels over gradient wash. Approved as potential light mode toggle.
- **Option C:** Zero UI / Spatial — no nav, orb IS the interface. Radical departure.
- **Option D:** Dark glassmorphism with ambient gradient orbs behind frosted glass. Evolved from A. User approved.
- **Final (Concept 3 — Aurora):** Dark void + animated aurora canvas + glassmorphism cards from Dribbble hotel booking reference. LOCKED AS BUILD TARGET.

### 5.3 Kiko Voice Animation
Smoke-trail ribbon chosen (V7 from 10 variants explored). Key characteristics:
- Multiple thick soft gradient layers (like aurora bands)
- Single bright white thread running through centre
- Purple → teal → pink colour gradient
- Continuous undulation with randomised amplitudes
- Scales down to compact version in conversation mode
- Scales down further to micro indicator in thinking state

### 5.4 Implementation Status
Currently deployed: **Glassmorphism v1** (Aurora canvas + frosted glass).
**COMPLETED:**
- Canvas-rendered animated gradient orbs on every page (+ amber on Pipeline)
- Backdrop-filter blur on all cards/panels across 32 files
- Frosted glass nav, dropdowns, command palette
- Glassmorphism deal cards on Pipeline with hover lift
- Frosted purple glass user messages, plain text Kiko responses
- Unified theme.js (all local T constants removed)
- FullCalendar dark glassmorphism CSS overrides
- Ultra-thin typography (weight 200-300) throughout

**REMAINING:**
- Smoke-trail wave animation as Kiko avatar
- Mobile responsive bottom tab bar
- Login page animated gradient orb

---

## 6. Git Tags (All Rollback Points)

| Tag | Description |
|-----|-------------|
| `backup-before-unified-voice` | Clean pre-session state |
| `backup-before-tts-rewrite` | Before TTS experiment |
| `backup-before-hybrid-rebuild` | Before hybrid voice architecture |
| `hybrid-rebuild-v1` | GPT-4o + Claude hybrid with suppressAutoRef |
| `file-passthrough-v1` | File/image drop → Claude Vision |
| `ui-fixes-v1` | ⌘K palette fix, voice transcript fix |
| `knowledge-ingestion-v1` | Auto-save document analysis to memory |
| `multi-role-thinking-v1` | 8 page roles + extended thinking |
| `smart-doc-classification-v1` | Contract/deck/financial auto-detection |
| `file-upload-fix-v1` | Correct file type routing (PDF/image/text) |
| `polish-v1` | Apple UI pass (pre-dark theme) |
| `apple-ui-v1` | Last light theme version |
| `backup-before-polish` | Before any UI changes |
| `dark-ambient-v1` | Full dark ambient theme (Option A) |
| `glassmorphism-v1` | Aurora canvas + frosted glass panels across all pages |

---

## 7. Dead Code Removed This Session (12 files, ~1,824 lines)

- `api/elevenlabs-auth.js` — ElevenLabs abandoned
- `api/backfill-activities.js` — one-time migration completed
- `api/backfill-campaigns.js` — one-time migration completed
- `api/brand-config.js` — unused
- `api/kiko-llm.js` — replaced by kiko.js
- `api/pipedrive-import.js` — one-time import completed
- `api/vela-code.js` — replaced by kiko-code.js
- `api/lemlist-setup-hooks.js` — one-time setup completed
- `api/lemlist-enrich.js` — unused
- `api/lemlist-find-email.js` — unused
- `src/components/layout/ChatHistory.jsx` — duplicate (active one in kiko/)
- `src/components/layout/Sidebar.jsx` — unused

---

## 8. Cost Structure

| Service | Monthly Cost |
|---------|-------------|
| Supabase | $25/mo |
| Vercel | $35-50/mo (target) |
| Claude API | Pay per token |
| OpenAI Realtime | Minutes-based |
| **Total target** | **~$100/mo excl. API usage** |

**Cron schedule (verified reasonable):**
- `cron-enrich` — Weekly (Mon 6am)
- `news-agent` — Daily Mon-Fri (8am)
- `cron-outreach-score` — Weekly (Mon 9am)
- `cron-partnership-scan` — Weekly (Mon 7am)
- `cron-document-scan` — Weekly (Sun 6am)

---

## 9. Environment Variables

Located in: `/Users/sunny/Desktop/vela-platform/.env.local`
```
ANTHROPIC_KEY, OPENAI_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
```
Supabase service key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3aXl3cWVsZXlja3pjeGJ3cmxiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyNjc0MiwiZXhwIjoyMDg4NDAyNzQyfQ.jQd1_k_R_XH5DJqSptLvQ_VIno-pAJ8CW7EOHUW-XH4`

---

## 10. Key Files Reference

| File | Purpose |
|------|---------|
| `api/kiko.js` | Core AI handler — Claude Sonnet 4, system prompt, tool loop, page roles, extended thinking, knowledge ingestion, SSE streaming |
| `api/kiko-tools.js` | All tool definitions + executors (51KB, 20+ tools) |
| `api/voice.js` | GPT-4o ephemeral token + Whisper transcription |
| `api/tts.js` | OpenAI TTS (shimmer voice) |
| `src/components/kiko/KikoChat.jsx` | Main chat UI — home screen, conversation, prompt bar, file drop, voice integration, thinking indicator |
| `src/components/kiko/KikoVoice.jsx` | Hybrid voice — GPT-4o Realtime + Claude routing, suppressAutoRef, echo cancellation |
| `src/components/kiko/KikoFloat.jsx` | Floating chat panel on non-home pages |
| `src/components/kiko/ChatHistory.jsx` | Conversation history sidebar |
| `src/components/layout/Layout.jsx` | App shell — header, nav tabs, dropdowns, avatar |
| `src/components/layout/CommandPalette.jsx` | ⌘K search palette |
| `src/components/auth/LoginPage.jsx` | Login with gradient orb + Google OAuth |
| `src/lib/theme.js` | Shared dark theme constants (NEW) |
| `src/index.css` | Global CSS variables + animations + dark overrides |
| `vercel.json` | Cron schedules + function duration limits |

---

## 11. Outstanding Work

### IMMEDIATE — UI Polish (Next Session)
- [x] Implement full glassmorphism design across all pages ✅ glassmorphism-v1
- [x] Theme all remaining pages ✅ 32 files updated
- [x] Implement glassmorphism deal cards on Pipeline page ✅
- [x] Frosted glass conversation messages ✅
- [ ] Build Kiko smoke-trail wave animation component (canvas-based)
- [ ] Mobile responsive design with bottom tab bar
- [ ] Login page with animated gradient orb + wave

### PARKED
- [ ] Voice memory — GPT-4o not reading injected session instruction facts

### MEDIUM PRIORITY
- [ ] Chat auto-rename verification in browser
- [ ] Responsive design (mobile/tablet)
- [ ] Settings page cleanup

### LOW PRIORITY
- [ ] Light mode toggle (Option B liquid glass as light theme)
- [ ] Cancel Pipedrive subscription
- [ ] git config user.name/email

---

## 12. Standing Instructions for AI Assistants

- **MANDATORY BUILD PROCESS** — see Section 2. Never skip steps. Never say "deployed" without verifying live hash.
- **Deliverables first**, commentary only if asked
- **Before any code involving external APIs** — always search and read current official docs first. Never rely on training knowledge for API specs.
- **All financials in USD**
- **Font:** `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'DM Sans'` — via theme.js or T constant
- **Colours:** Dark glassmorphism palette — see Section 5.1
- **Jump straight into action** without explanations unless explicitly asked
- **Tighten = cut 25-40%**
- **Use "intelligent age"** not "AI generation" in all brand materials
