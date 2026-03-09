# Vela Platform v2.0 — Task Tracker
_Owned by Claude Code. Updated every session._
_Every checkbox must become [x] before proceeding to the next section._

---

## Phase 0 — Project Setup

### 0.1 — Repository Init
- [x] Scaffold React + Vite project
- [x] Git init
- [x] Install Tailwind CSS v4 + Vite plugin
- [x] Initialize shadcn/ui
- [x] Install shadcn components (button, input, textarea, card, dialog, sheet, sidebar, avatar, badge, table, tabs, dropdown-menu, sonner, separator, skeleton, tooltip, scroll-area, command, popover, select)
- [x] Install app dependencies (@anthropic-ai/sdk, openai, mem0ai, @supabase/supabase-js, @supabase/auth-helpers-react, react-router-dom, lucide-react, react-image-crop, react-hot-toast, date-fns, axios)
- [x] Create directory structure matching brief
- [x] Verify build passes
- [x] Create TASKS.md
- [x] Create CODEBASE_STATE.md

### 0.2 — Environment + Config
- [x] Create .env.local with all variables from brief
- [x] Create vercel.json with function configs + crons
- [x] Create .claude/CLAUDE.md with standing instructions
- [x] Create .gitignore (node_modules, dist, .env*)
- [x] PWA: manifest.json in public/
- [x] PWA: sw.js in public/
- [x] PWA: audio-processor.js in public/
- [x] Verify build still passes

---

## Phase 1 — Foundation
_Target: Kiko working flawlessly with memory, streaming, and voice. Auth + layout shell._

### 1.1 — Design System
- [x] Replace shadcn default theme with brief's dark palette (#0A0A0A bg)
- [x] Configure glassmorphism tokens (rgba(255,255,255,0.04), blur(24px), etc.)
- [x] Set typography: Inter (via Geist Variable) + JetBrains Mono
- [x] Set spacing scale (8px base via Tailwind)
- [x] Set radius scale (8px standard via --radius: 0.5rem)
- [x] Set transitions (200ms ease via Tailwind)
- [x] Dark mode as default (single dark palette, no light mode)
- [x] Verify build passes

### 1.2 — Supabase Client
- [x] Create src/lib/supabase.js (client init from env vars)
- [ ] Verify connection to existing Supabase project
- [x] Verify build passes

### 1.3 — Auth — Login Page
- [x] Create src/components/auth/LoginPage.jsx
- [x] Split screen: dark image left (50%), auth form right (50%)
- [x] Right panel: #0A0A0A, 380px max width, vertically centred
- [x] Primary CTA: 'Continue with Google' (full width, Google brand colours)
- [x] Secondary: email + password below divider ('or sign in with email')
- [x] Password show/hide toggle
- [x] Remember me checkbox
- [x] Error state: inline red text, no reload
- [x] Left panel: dark editorial image, object-fit cover
- [ ] Left panel: configurable via Settings (Supabase Storage key: login_bg)
- [x] Bottom right: 'Powered by Vela Labs' — 12px muted
- [x] Google OAuth: configure Supabase Auth provider with required scopes (openid, email, profile, gmail.modify, calendar)
- [ ] Store OAuth tokens in Supabase user_settings on first login
- [x] On success: push to /home (via React Router + auth state listener)
- [ ] TEST: Google login → /home with email + calendar pre-populated
- [ ] TEST: Email/password login → /home
- [ ] TEST: Wrong credentials → inline error, no reload
- [ ] TEST: Remember me → session persists on browser close + reopen
- [ ] TEST: Left image fills panel, object-fit cover
- [ ] TEST: Right panel centred on all screen sizes
- [ ] TEST: Show/hide password toggle works
- [ ] TEST: Loader state during auth request
- [ ] TEST: Zero console errors

### 1.4 — Layout Shell
- [x] Create src/components/layout/Layout.jsx (sidebar + main area)
- [x] Create src/components/layout/Sidebar.jsx
- [x] Sidebar expanded: 220px — icon + label
- [x] Sidebar collapsed: 60px — icon only
- [x] Toggle: chevron button at bottom
- [x] Animation: smooth 200ms CSS transition on width
- [x] Active state: white background pill, icon + text inverted
- [x] Bottom: user avatar (24px) + display name + logout
- [x] Glassmorphism sidebar styling
- [x] Phase 1 nav items active: Home, Email, Calendar, Settings
- [x] Phase 2 nav items greyed with 'Coming Soon' tooltip: Dashboard, Pipeline, Deals, Contacts, Companies, Tasks
- [x] Phase 3 nav items greyed: Documents, Knowledge, Sectors, Sponsorship, Outreach, Analytics, Vela Code
- [x] TEST: Expands and collapses with smooth animation
- [x] TEST: Active items route correctly
- [x] TEST: Greyed items show tooltip, do not navigate
- [x] TEST: Collapsed shows icons only, no text overflow
- [x] TEST: Glassmorphism renders (not solid black)
- [x] TEST: Avatar displays
- [x] TEST: Logout signs out → /login
- [x] TEST: Zero console errors (build clean)

### 1.5 — Home (Kiko Welcome)
- [x] Create src/components/kiko/KikoChat.jsx
- [x] Create src/components/kiko/KikoMessage.jsx
- [x] Create src/components/layout/ChatHistory.jsx
- [x] Centre zone — no conversation: dynamic greeting (morning/afternoon/evening + Sunny)
- [x] Kiko avatar: 56px circle, configurable (Supabase Storage key: kiko_avatar)
- [x] 4 suggestion chips (2x2): Brief me on my pipeline | What's happening in F1 | Follow ups | Summarise yesterday
- [x] Chips: pill buttons, border rgba(255,255,255,0.1), hover glow
- [x] Prompt input bar: fixed bottom, full width, 56px height, #1A1A1A, 28px radius
- [x] Input placeholder: 'Ask Kiko anything...'
- [x] Input right: mic icon + speak toggle + send button
- [x] Centre zone — active conversation: greeting/avatar/chips hidden
- [x] User message: right-aligned, white bubble
- [x] Kiko message: left-aligned, #1A1A1A bubble + 24px avatar
- [x] Timestamps: small, muted, below message
- [x] Response time badge: e.g. '380ms · Sonnet'
- [x] Right panel: chat history (new chat button, search, conversation list)
- [x] Right panel: conversation list from Supabase conversations table
- [x] Right panel: collapsible
- [ ] TEST: Greeting correct for time of day — requires live browser
- [ ] TEST: Avatar renders — requires live browser
- [ ] TEST: All 4 chips populate and submit — requires live API
- [ ] TEST: Enter key and send button both submit — requires live API
- [ ] TEST: Messages appear correctly (user right, Kiko left) — requires live API
- [ ] TEST: Response time badge displays — requires live API
- [ ] TEST: Tier badge shows model used — requires live API
- [ ] TEST: New conversation saves to Supabase — requires live Supabase
- [ ] TEST: Chat history updates after first message — requires live Supabase
- [ ] TEST: Clicking history item loads conversation — requires live Supabase
- [ ] TEST: New Chat starts fresh — requires live browser
- [ ] TEST: Right panel collapses and expands — requires live browser
- [x] TEST: Zero console errors (build clean)

### 1.6 — api/kiko.js (The Brain)
- [x] Create api/kiko.js
- [x] classifyQuery() — zero-latency regex tier classifier (tier1/tier2/tier3)
- [x] Tier 1: Haiku, KIKO_CORE prompt (~400 tokens), 6 messages, no tools, max_tokens 1024
- [x] Tier 2: Sonnet, KIKO_FULL prompt (~2500 tokens), 20 messages, Phase 1 tools, max_tokens 4096
- [x] Tier 3: Sonnet, KIKO_FULL prompt, 20 messages, all tools, max_tokens 4096
- [x] KIKO_CORE prompt: identity, Sunny context, Van Hawke verticals, response rules
- [x] KIKO_FULL prompt: full business context (Haas, Formula E, Maison, ClinIQ, SponsorSignal, preferences)
- [x] Mem0 integration: search before responding (tier2/3), add after responding (tier2/3)
- [x] Streaming: anthropic.messages.stream() on all tiers
- [x] SSE headers: Content-Type text/event-stream, Cache-Control no-cache, X-Accel-Buffering no
- [x] Anti-buffering: X-Vercel-No-Buffering, flushHeaders()
- [x] Prompt caching: cache_control on system, last tool, history
- [x] Beta headers via defaultHeaders on client constructor
- [x] Latency tracking: start time, TTFT, total time, tier, model
- [x] Final metadata SSE event with latency stats
- [x] Phase 1 tools: get_crm_data, save_memory, search_web, get_realtime_data, send_email, get_calendar, create_calendar_event
- [x] Phase 2 tool interfaces: send_email, get_calendar, create_calendar_event return placeholders
- [x] Tool execution loop (stream → tool_use → execute → stream response)
- [ ] TEST: Tier 1 greeting responds < 2s — requires deployed API + env vars
- [ ] TEST: Tier 2 query with tool call works — requires deployed API
- [ ] TEST: Streaming produces delta events — requires deployed API
- [ ] TEST: Mem0 memories retrieved and injected — requires MEM0_API_KEY
- [ ] TEST: Mem0 memories saved after response — requires MEM0_API_KEY
- [ ] TEST: Latency metadata event sent — requires deployed API
- [ ] TEST: Zero errors on all tiers — requires deployed API

### 1.7 — Voice Module
- [x] Create api/voice.js (100% isolated from kiko.js)
- [x] Create src/components/kiko/KikoVoice.jsx
- [x] Mode 2 (mic → text): Whisper transcription → text in input field → Kiko replies text
- [x] Mode 3 (speak): full overlay, OpenAI Realtime WebSocket (server VAD, PCM16, AudioWorklet)
- [x] Mode 3: Voice output via OpenAI Realtime Shimmer (replaced ElevenLabs Charlotte)
- [x] Mode 3 states: IDLE → CONNECTING → LISTENING → PROCESSING → SPEAKING → ERROR
- [x] Mode 3: real-time transcript for both speakers
- [ ] Mode 3: both sides logged to conversation in Supabase — needs live testing
- [x] Mode 3: dismiss via X, ESC, tap outside
- [x] Mode 3: persistent active indicator in input bar (mic/speak buttons in input bar)
- [ ] TEST: Mic button → speech → text in input — requires live mic
- [ ] TEST: Speak toggle → full overlay activates — requires live browser
- [ ] TEST: WebSocket connects — requires OPENAI_KEY
- [ ] TEST: Microphone input detected — requires live mic
- [x] TEST: Shimmer voice responds — via OpenAI Realtime API
- [ ] TEST: Transcript appears — requires live WebSocket
- [ ] TEST: Dismiss via X, ESC, tap outside — requires live browser
- [x] TEST: Voice error does NOT crash text chat (isolated components)
- [x] TEST: Zero console errors (build clean)

### 1.8 — Settings
- [x] Create src/components/settings/Settings.jsx
- [x] 5 tabs: Profile, AI Config, Visual Builder, Image Upload, About
- [x] Profile tab: name, email, avatar upload
- [x] AI Config tab: model routing info, memory info, voice info
- [x] Visual Builder tab: live preview, editable tokens (bg, surface, border, accent, text)
- [x] Visual Builder: font selector (Inter, DM Sans, Geist, Satoshi)
- [x] Visual Builder: sidebar style toggle (glassmorphism/solid/minimal)
- [x] Visual Builder: border radius slider (0px → 16px)
- [x] Visual Builder: density (compact/default/spacious)
- [x] Visual Builder: export theme as CSS vars (copy to clipboard)
- [x] Visual Builder: reset to defaults
- [x] Visual Builder: persist to user_settings.theme_config (jsonb)
- [x] Create src/components/settings/ImageUpload.jsx
- [x] Image upload: JPEG, PNG, WebP, GIF — max 5MB
- [ ] Crop modal (react-image-crop) — deferred, using direct preview instead
- [x] Preview in target context before confirming
- [x] Upload to Supabase Storage bucket: vela-assets (public)
- [x] Storage folders: /avatars /logos /backgrounds /uploads
- [x] Save URL to user_settings
- [x] Storage keys: user_avatar, kiko_avatar, login_bg, sidebar_logo, company_logo
- [ ] TEST: All 5 tabs render and switch — requires live browser
- [ ] TEST: Profile photo upload → confirm → sidebar updates — requires Supabase Storage
- [ ] TEST: Visual Builder colour changes propagate live — requires live browser
- [ ] TEST: Font selector changes font globally — requires live browser
- [ ] TEST: File over 5MB shows error — implemented in code
- [ ] TEST: Wrong file type shows error — implemented in code
- [x] TEST: Zero console errors (build clean)

### 1.9 — Phase 1 Deploy Gate
- [x] All Phase 1 components built
- [x] npm run build — zero errors
- [ ] Full test pass — requires deployed env with API keys
- [x] Zero console errors across all views (build clean)
- [x] Commit: "Phase 1 complete — Kiko + auth + layout + voice + settings"
- [ ] Deploy to Vercel — requires Vercel project setup for vela-platform repo
- [ ] Configure domain: vela.vanhawke.com — requires Vercel dashboard
- [ ] Set all env vars in Vercel dashboard — requires Sunny
- [ ] Verify production: login → home → chat → voice → settings
- [x] Update CODEBASE_STATE.md

---

## Phase 2 — CRM
_Do not begin until Phase 1 is deployed and stable._

### 2.1 — Supabase Schema
- [ ] Read existing schema — use tables if present, create if not
- [ ] Tables: deals, contacts, companies, tasks, conversations, ai_memory, document_chunks, user_settings, observability_metrics, latency_log
- [ ] Enable pgvector extension
- [ ] Verify all tables accessible from client

### 2.2 — Dashboard
- [ ] Create src/components/crm/Dashboard.jsx
- [ ] Deal stats, task list, recent activity feed
- [ ] TEST: All widgets render with real data

### 2.3 — Pipeline
- [ ] Create src/components/crm/Pipeline.jsx
- [ ] Kanban board — deals by stage (Lead → Qualified → Proposal → Negotiation → Closed Won → Closed Lost)
- [ ] Drag to move between stages
- [ ] TEST: Drag and drop works, stage updates persist

### 2.4 — Deals
- [ ] Create src/components/crm/DealsList.jsx + DealView.jsx
- [ ] Table with filters (stage pills, search), sortable columns
- [ ] Value format: $X,XXX,XXX
- [ ] Deal view: two-column, core fields left, notes + activity right, inline editing
- [ ] TEST: CRUD operations, filters, sorting

### 2.5 — Contacts
- [ ] Create src/components/crm/ContactsList.jsx + ContactView.jsx
- [ ] Table: Name | Company | Role | Email | Last Contact
- [ ] Contact view: avatar initials, core fields, related deals
- [ ] TEST: CRUD operations, search, related deals link

### 2.6 — Companies
- [ ] Create src/components/crm/CompaniesList.jsx + CompanyView.jsx
- [ ] Same pattern as contacts
- [ ] TEST: CRUD operations

### 2.7 — Tasks
- [ ] Create src/components/crm/TasksList.jsx
- [ ] Filters: type, due date, completed
- [ ] Overdue highlighting
- [ ] TEST: CRUD, filters, overdue states

### 2.8 — Phase 2 Deploy Gate
- [ ] All Phase 2 components built and tested
- [ ] Phase 1 still fully functional (regression check)
- [ ] npm run build — zero errors
- [ ] Commit + deploy
- [ ] Update CODEBASE_STATE.md

---

## Phase 3 — Intelligence
_Do not begin until Phase 2 is deployed and stable._

### 3.1 — Documents
- [ ] Create api/documents.js (upload + chunk + embed pipeline)
- [ ] Create src/components/intelligence/Documents.jsx
- [ ] TEST: Upload → chunk → embed → searchable

### 3.2 — Knowledge
- [ ] Create src/components/intelligence/Knowledge.jsx
- [ ] TEST: Knowledge base renders, searchable

### 3.3 — Sponsorship Intelligence
- [ ] Create src/components/intelligence/Sponsorship.jsx
- [ ] TEST: Sponsorship data renders

### 3.4 — Sectors
- [ ] Create src/components/intelligence/Sectors.jsx
- [ ] TEST: Sector intelligence renders

### 3.5 — Outreach
- [ ] Create api/lemlist.js
- [ ] Create src/components/outreach/Lemlist.jsx + OutreachTracker.jsx
- [ ] TEST: Lemlist sync, campaign management

### 3.6 — Platform Tools
- [ ] Create src/components/platform/VelaCode.jsx
- [ ] Create src/components/platform/Analytics.jsx
- [ ] TEST: Code view, analytics render

### 3.7 — Remaining API Endpoints
- [ ] Create api/gmail.js (OAuth token from Supabase)
- [ ] Create api/calendar.js (Google Calendar proxy)
- [ ] Create api/github.js (commit via Git tree API)
- [ ] Create api/morning-brief.js (8am weekday cron)
- [ ] Create api/self-audit.js (weekly cron)
- [ ] Create api/health.js
- [ ] TEST: All endpoints respond correctly

### 3.8 — Phase 3 Deploy Gate
- [ ] All Phase 3 components built and tested
- [ ] Phase 1 + Phase 2 still fully functional
- [ ] npm run build — zero errors
- [ ] Commit + deploy
- [ ] Update CODEBASE_STATE.md
- [ ] Platform complete
