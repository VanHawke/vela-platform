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

**Current bundle:** `index-CAoLhI05.js` | **Current tag:** `glassmorphism-v4.1` | **Deployment files:** 154

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

### 5.1 Chosen Direction: Dark Glassmorphism v4 (Dribbble Hotel Booking Grade)
The final design combines aurora orbs with Dribbble-grade frosted glass, pill shapes, and luminous borders.

**Background:** #07070B near-black void with 5 animated gradient orbs (canvas-rendered, 60fps):
- Purple (#8B6CF6) — top-left, r=550, alpha 0.22 peak
- Teal (#06D6A0) — bottom-right, r=500
- Pink (#EC4899) — scattered, r=380
- Blue (#3B82F6) — scattered, r=420
- Amber (#F59E0B) — pipeline page only, r=340

**Glass panels (v4 — Dribbble grade):**
- Background: `rgba(255,255,255,0.07)` (milky white tint visible against dark bg)
- Blur: `backdrop-filter: blur(40px) saturate(1.3)` (saturate adds colour richness)
- Border: `0.5px solid rgba(255,255,255,0.12)` (luminous edge catch)
- Shadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.35)` (inner glow + depth)
- Hover: bg→0.12, border→0.2, translateY(-3px), stronger inset glow (0.15)

**Shape language — ALL PILL (v4):**
- Nav tabs: borderRadius 50px
- Buttons/chips: borderRadius 50px
- Prompt bar: borderRadius 50px
- Status pills: borderRadius 50px
- Insight cards: borderRadius 20px
- Alert card: borderRadius 50px
- Modal panels: borderRadius 24px

**Header:** 56px height, `blur(60px) saturate(1.4)`, logo pill (radius 50, inner glow), nav pill container (radius 50, padding 4px, inner glow)

**Kiko's Avatar:** Smoke-trail voice ribbon — multiple translucent gradient layers (purple, teal, pink) with bright white edge thread. Animates continuously. On homepage: 85% width, 800px max, positioned ABOVE greeting text with 48px breathing room.

**Homepage layout (v5):** Wave → Greeting → Prompt bar → 4 chips → 3 insight cards → Alert pill

**Prompt bar:** 📎 Attachment → text input → 🎤 mic → 🎵 voice CTA (green equalizer, teal pill) → ▶ gradient send (purple→teal)

**Typography:** -apple-system / SF Pro Display / DM Sans. Weight 200-300.
- Greeting: 36px weight 200, -0.04em tracking
- Body: 14px weight 300
- Labels: 11px weight 300 uppercase, 0.06em letter-spacing

**Cards:** 20px border-radius, gradient edge indicators (3px), glass with inner glow, lift 3px + border brighten on hover.

**Nav:** Frosted glass pill tabs in header (50px radius). Active tab: rgba(255,255,255,0.1) + inner glow. Kiko logo: 7px gradient dot + "kiko" in 34px frosted pill.

**User messages:** Frosted purple glass (rgba(139,108,246,0.12) + blur(40px) + purple border 0.2)
**Kiko responses:** Plain text, no bubble, 300-weight, with compact wave indicator

### 5.2 Kiko Voice Mode — Option A: Ripple Expand (LOCKED)
**Activation:** User taps teal equalizer CTA in prompt bar
**Entry animation:**
1. Greeting, prompt, chips, cards, alert dissolve outward with blur(4px) + scale(0.96), staggered 40ms
2. Header slides up and blurs out
3. Wave expands from homepage position (85%, 800px) to full voice position (85%, 900px) centered
4. Green listening bar fades in below wave (280px wide, `kikoListenPulse` 2s infinite)
5. "Listening..." status label appears

**Listening state:** Idle wave (gentle amplitude) + green pulsating bar. No transcript. No text.
**Speaking state:** Large SmokeTrailWave (900px, scale 1.5, high amplitude) replaces idle wave. Status: "Kiko is speaking..."
**Deactivation:** User says "Bye, Kiko" OR taps stop button
**Exit animation:** Reverse — wave contracts back, elements un-blur and scale back in with spring easing, header returns

### 5.3 Design Options History
- **Option A:** Dark ambient void — approved
- **Option B:** Liquid glass (light mode) — saved
- **Option D:** Dark glassmorphism — evolved to final
- **Dribbble reference:** Hotel Booking App UI by Bhautik Domadiya (pill shapes, milky frosted glass, luminous borders)
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
| `glassmorphism-v2` | Smoke-trail wave, insight cards, alert card, mini wave |
| `glassmorphism-v4.1` | Dribbble-grade glass — 2x brighter orbs, inner glow, blur(40px) |

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
- [x] Build Kiko smoke-trail wave animation component (canvas-based)
- [x] Dribbble-grade glass (pill shapes, milky frosted, luminous borders) — v4
- [x] Homepage v5 layout (wave above greeting, 4 chips, attachment + voice CTA)
- [x] Option A voice animation (ripple expand, listening bar, no transcript)
- [x] Contacts page redesign (glass cards, quick actions, sidebar, alphabet nav)
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
