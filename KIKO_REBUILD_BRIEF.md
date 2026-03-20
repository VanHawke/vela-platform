# KIKO — Platform Architecture & Development Brief
## Definitive specification — Updated 20 March 2026
## All references to "Vela" are deprecated. The product is KIKO.

---

## 1. WHAT KIKO IS

Kiko is a voice-first sponsorship operations platform. The user speaks to Kiko or types.
Kiko has access to emails (Gmail), CRM data (Supabase), the web, documents, and calendars.
The visual interface shows pipeline management, a commercial calendar, contacts, and news.

Kiko is the ENTIRE product. Not "a platform with an AI assistant." Kiko IS the platform.
The brand is Kiko. The login screen says Kiko. The avatar is Kiko. Every page is a Kiko view.
White-label ready: clients upload their brand logo, Kiko becomes their intelligence engine.

---

## 2. USERS & CONTEXT

- Primary user: Sunny Sidhu, CEO of Van Hawke Group (Weybridge, Surrey, UK)
- Primary client: Haas F1 Team (sponsorship advisory)
- Use case: F1 and Formula E sponsorship sales — prospecting, outreach, deal management
- Interaction mode: Voice-first (dictation), with visual dashboard for data views
- Kiko ALWAYS knows the user is Sunny Sidhu, based in Weybridge UK — never asks for name or location

---

## 3. TECH STACK

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | React + Vite | Single-page app |
| Hosting | Vercel | Serverless functions for API routes |
| Database | Supabase (Postgres) | Project: dwiywqeleyckzcxbwrlb |
| Auth | Supabase Auth | Implicit flow, Google OAuth |
| AI (text) | Claude API (Anthropic) | claude-sonnet-4-20250514 via native tool_use |
| AI (voice) | OpenAI Realtime API | GPT-4o voice, 300ms latency |
| Memory | Supabase kiko_memories table | File-based memory system |
| Repo | github.com/VanHawke/vela-platform | |
| Local | /Users/sunny/Desktop/vela-platform/ | |
| Deploy | npm run build && npx vercel --prod --yes | NO git push auto-deploy |

---

## 4. CURRENT UI ARCHITECTURE (implemented 20 March 2026)

### 4a. Homepage — Two States

The homepage (KikoChat.jsx) has TWO states managed by `voiceActive` React state.
NO overlays. NO popups. NO route changes. Everything inline on the same page.

**STATE 1: IDLE (default)**
- Kiko avatar: 120px black rounded square (border-radius 30px), centered
- Inside avatar: 4-dot Kiko symbol with staggered opacity animation (0.35→1.0, each dot offset 0.3s)
- Two pulse rings around avatar — pulse in place (opacity 0.3→0.7, scale 1.0→1.04, 2.5s ease-in-out)
- Avatar breathing animation: scale 1.0→1.015 over 4s
- Time-of-day greeting: "Good morning/afternoon/evening, Sunny" (28px, weight 400)
- Subtitle: "What would you like to do?" (14px, rgba(0,0,0,0.3))
- Green "Talk to Kiko" CTA pill: animated equalizer bars (5 bars, 3.5px wide, green) + text label
- Prompt bar directly below CTA (liquid glass: backdrop-filter blur(16px), white border, inner shadow)
- Icons in prompt bar: paperclip (file upload) | text input | mic (dictation/STT) | send arrow (black)
- Suggestion chips below prompt bar (liquid glass treatment)
- Everything vertically centered as one cohesive block

**STATE 2: VOICE ACTIVE (triggered by clicking avatar or "Talk to Kiko" CTA)**
- Smooth transition: 0.6s cubic-bezier(0.4, 0, 0.2, 1) on ALL properties
- Avatar shrinks: 120px → 64px, border-radius 30→18, moves to top
- Pulse rings tighten and change color: gray → green (rgba(34,197,94,0.15))
- Inside avatar: dots show when LISTENING. Equalizer bars (7 bars, green) show ONLY when Kiko is SPEAKING
- When Kiko stops speaking, bars fade out, dots return — this signals the state visually
- Greeting + CTA + idle prompt bar collapse (maxHeight→0, opacity→0)
- Conversation area expands: scrollable middle between fixed avatar (top) and fixed prompt bar (bottom)
- User messages: right-aligned, dark background, 14px border-radius
- Kiko messages: left-aligned with 26px Kiko avatar, white bg, 0.5px border
- Prompt bar moves to fixed footer with red stop button replacing mic icon
- Nav bar shows green "Listening" pill (top-right, between tabs and ⌘K)
- Pill text updates dynamically: "Listening" / "Kiko is speaking" / "Thinking..." / "Connecting..."
- NO status pill below avatar — ONLY in the nav bar
- Clicking stop button or avatar returns to idle (reverse transition)

### 4b. Navigation (top bar)

- Header: liquid glass (backdrop-filter blur(20px), rgba(255,255,255,0.7), z-index 100)
- Left: Brand logo (reads from localStorage 'custom_logo_url') or default Kiko icon + "Kiko" text
- Center: Liquid glass pill tab group (backdrop-filter blur(16px), border-radius 16px, inner shadow)
  - Tabs: Home (active = dark bg with shadow), Pipeline, Calendar, Contacts, More
  - Active tab: background rgba(0,0,0,0.85), color #fff, box-shadow for depth
  - Inactive: color rgba(0,0,0,0.45)
- "More" dropdown: 200px wide, white, border-radius 12px, z-index 300
  - Items: Outreach, News Signals, Matrix, Documents, Email (each with icon)
  - Divider, then Settings
- Right: Green Listening pill (when voice active) + ⌘K search pill (liquid glass) + user avatar

### 4c. Login Page (approved design — Option C, NOT YET BUILT)

Premium split layout:
- Left side (60%): Brand logo area (from localStorage or default), platform subtitle, time greeting, Google OAuth button, email/password form, "Powered by Kiko" footer
- Right side (40%): Dark panel (#1A1A1A) with Kiko avatar (100px, breathing), pulse rings, "Kiko" text, "Intelligence engine" subtitle, "Created by Van Hawke Labs" at bottom
- Responsive: below 768px, hide right panel, show Kiko avatar above greeting on left
- Branding: reads from localStorage ('kiko_brand_logo', 'kiko_login_bg', 'kiko_platform_subtitle')

### 4d. Settings Page

Tabs: Profile, Kiko, Navigation, Team, Appearance, Accounts
- Navigation tab: "Top Navigation Bar" only (sidebar order REMOVED)
- Appearance tab: Navigation Logo, Profile Picture, Login Brand Logo, Login Background Image (sidebar logos REMOVED)
- All working with Supabase user_settings + localStorage for branding

### 4e. Chat History Panel

- Fixed position right panel (280px width, z-index 200)
- Toggle tab on right edge when collapsed (z-index 200)
- Shows conversation list with auto-generated titles (Claude Haiku)
- Voice conversations prefixed with 🎤
- New chat button, rename, delete per conversation

---

## 5. BACKEND ARCHITECTURE (current, as of 20 March 2026)

### 5a. /api/kiko.js (219 lines — REWRITTEN)

Single Claude API call with native tool_use. No custom orchestration.
- Model: claude-sonnet-4-20250514
- System prompt includes: user identity (Sunny Sidhu, Weybridge UK), commercial doctrine, memory instructions, tool usage priorities
- Native tools: memory_20250818 (file-based memory), web_search_20250305 (with user_location Weybridge)
- Custom tools: search_contacts, search_companies, search_deals, get_entity_detail, search_emails, get_email_thread, draft_email, etc. (from kiko-tools.js)
- SSE streaming format: data: {"delta":"text"}\n\n + data: {"toolStatus":"label"}\n\n + data: [DONE]\n\n
- Title generation endpoint: action='title' → Claude Haiku generates 3-5 word title
- Tool execution loop: up to 8 rounds of tool calls

### 5b. /api/kiko-tools.js (simplified)

CRM query tools for Supabase. No OpenAI embeddings (removed).
Functions: search_contacts, search_companies, search_deals, get_entity_detail, search_emails, get_email_thread, draft_email, get_email_analytics, get_calendar, create_calendar_event, get_stale_contacts, generate_followup, get_followup_queue, get_alerts, get_news, get_partnership_matrix, get_pipeline_notifications, navigate_page, search_documents

### 5c. /api/voice.js

Handles:
- Whisper transcription (speech-to-text for dictation)
- Realtime session tokens (ephemeral keys for OpenAI Realtime API)
- Session instructions embedded in ephemeral token creation (name + location)
- TTS proxy (ElevenLabs, currently unused)

### 5d. /api/documents.js (simplified)

File upload and storage. No embeddings. Text-based search only.

### 5e. Memory System

- Table: kiko_memories (path, content, is_directory, org_id, updated_at)
- File-based: /memories/sunny_profile.md, /memories/identity.md, /memories/van_hawke.md, etc.
- Text chat (Claude): uses memory tool to read/write — WORKS
- Voice chat (GPT-4o): loads memories into session instructions at connect time — LIMITED (GPT-4o sometimes ignores)
- System prompt instructs Kiko to: read /memories at conversation start, save important facts proactively

---

## 6. KEY FILES

| File | Lines | Purpose |
|------|-------|---------|
| src/components/kiko/KikoChat.jsx | ~590 | Homepage, text chat, voice inline, prompt bar |
| src/components/kiko/KikoVoice.jsx | ~733 | OpenAI Realtime voice engine (DO NOT TOUCH) |
| src/components/kiko/ChatHistory.jsx | ~207 | Right-side chat history panel |
| src/components/kiko/KikoFloat.jsx | ~200 | Floating Kiko button on data pages |
| src/components/kiko/KikoSymbol.jsx | ~31 | 4-dot Kiko symbol component |
| src/components/layout/Layout.jsx | ~295 | Top nav bar, routing, liquid glass |
| src/components/auth/LoginPage.jsx | ~126 | Current login (needs rebuild to Option C) |
| src/components/settings/Settings.jsx | ~600 | Settings page (all tabs) |
| src/contexts/OrgContext.jsx | ~54 | Org branding, title override (Vela→Kiko fixed) |
| src/App.jsx | ~130 | Routes, auth flow |
| src/index.css | ~130 | Keyframe animations (eq bars, pulse, breathe) |
| api/kiko.js | ~230 | Claude API + tools, SSE streaming |
| api/kiko-tools.js | ~300 | CRM tool definitions + executors |
| api/voice.js | ~211 | Voice tokens, transcription, TTS |
| api/documents.js | ~318 | Document upload/search |

---

## 7. DESIGN SYSTEM

### Liquid Glass Treatment (Apple-inspired)
Applied to: nav pill tabs, ⌘K search, prompt bar, suggestion chips
- backdrop-filter: blur(16px)
- background: rgba(255,255,255,0.6)
- border: 0.5px solid rgba(255,255,255,0.8)
- box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.6)

### Colour Palette
- Accent: #1A1A1A (near-black)
- Background: #FAFAFA
- Surface: #FFFFFF
- Text: #1A1A1A / rgba(0,0,0,0.45) / rgba(0,0,0,0.3)
- Green (voice): rgba(34,197,94,*) — CTA, equalizer, listening pill
- Red (stop): rgba(239,68,68,*) — stop button
- Borders: rgba(0,0,0,0.06) / rgba(255,255,255,0.8)

### Typography
- Font: DM Sans (system fallback: -apple-system, BlinkMacSystemFont, Segoe UI)
- Greeting: 28px, weight 400, letter-spacing -0.02em
- Nav tabs: 12px, weight 500
- Body: 13-14px
- Chips: 12px

### Animations (defined in index.css)
- kikoPulseRing: opacity 0.3→0.8, scale 1→1.04 (2.5s)
- kikoBreatheScale: scale 1→1.015 (4s)
- kikoDotPulse: opacity 0.35→1.0 (2.5s, staggered per dot)
- eqBar0-6: height 3px→14-34px (0.4-0.55s, per bar)
- eqBarS0-4: height 3px→12-24px (CTA bars)
- kikoBreathe: scale+opacity pulse for loading dots

---

## 8. ENVIRONMENT VARIABLES

| Key | Purpose |
|-----|---------|
| ANTHROPIC_KEY | Claude API (NOTE: not ANTHROPIC_API_KEY) |
| OPENAI_KEY | OpenAI Realtime (voice only) |
| SUPABASE_URL | https://dwiywqeleyckzcxbwrlb.supabase.co |
| SUPABASE_SERVICE_KEY | Supabase service role key |
| GOOGLE_CLIENT_ID | Gmail OAuth |
| GOOGLE_CLIENT_SECRET | Gmail OAuth |
| GOOGLE_REFRESH_TOKEN | Gmail OAuth (sunny@vanhawke.com) |
| ELEVENLABS_API_KEY | Can be removed (nothing depends on it) |

---

## 9. SUPABASE

- Project ID: dwiywqeleyckzcxbwrlb
- Org ID: 35975d96-c2c9-4b6c-b4d4-bb947ae817d5
- User ID: 9f486437-4bf5-4111-abfe-fe19bfa76063
- Role: super_admin
- 50+ tables including: contacts, companies, organisations, activities, pipelines, pipeline_stages, outreach_scores, kiko_alerts, kiko_memories, conversations, documents, users, user_settings, invitations

---

## 10. KNOWN ISSUES & PENDING ITEMS

### Must Fix
- [ ] Login page rebuild (Option C premium split) — design approved, not yet built
- [ ] ⌘K command palette — icon exists, full search modal not built
- [ ] Voice mode memory — GPT-4o sometimes ignores session instructions (name/location). Instructions embedded at both ephemeral token creation AND session.update. Improvement deployed but needs testing.
- [ ] Cross-conversation context — conversations are isolated (last 20 messages only). For full context across sessions, Kiko must save key facts to memory proactively.

### Recently Fixed (20 March 2026)
- [x] Site crash: React hooks called inside IIFEs in Settings.jsx Appearance tab
- [x] Tab title "Vela" → "Kiko": OrgContext.jsx was overriding from Supabase branding data
- [x] Voice mode overlay → inline: KikoVoice now renders within KikoChat, no full-screen overlay
- [x] "Talk to Kiko" CTA: green pill with animated equalizer bars + text label
- [x] Navigation: liquid glass pill tabs centred, logo left, ⌘K+avatar right
- [x] "More" dropdown z-index: header has z-index 100, dropdown 300
- [x] Chat history panel z-index: bumped to 200, collapsible
- [x] Prompt bar position: directly below CTA, centred as one block (not at page bottom)
- [x] Status pill removed from below avatar: only in nav bar
- [x] Equalizer only when speaking: dots show when listening, bars when Kiko speaks
- [x] Settings: sidebar order section removed
- [x] Settings: sidebar logo uploads removed
- [x] Text chat memory: system prompt instructs proactive memory read/write
- [x] Voice identity: instructions in ephemeral token creation + session.update
- [x] Voice chat auto-rename: Haiku title generator (prefixed 🎤)
- [x] Liquid glass: nav tabs, ⌘K search, prompt bar, suggestion chips
- [x] Vercel billing: spend cap $50, GitHub auto-deploy disabled, duplicate builds fixed

---

## 11. COST TARGETS

| Service | Purpose | Target |
|---------|---------|--------|
| Anthropic (Claude API) | Text chat, tools, titles | $20-40/month |
| OpenAI | Voice mode (Realtime API) | $10-20/month |
| Supabase | Database, auth, storage, cron | Free tier |
| Vercel | Hosting, serverless | ~$20/month |
| ElevenLabs | CANCEL (nothing depends on it) | $0 |
| **TOTAL** | | **$50-80/month** |

---

## 12. ROADMAP

### Phase 1: Backend Simplification ✅ COMPLETE
- [x] /api/kiko.js rewritten (Claude API + native tool_use)
- [x] /api/kiko-tools.js simplified (removed OpenAI embeddings)
- [x] /api/tool.js deleted (Claude native web search)
- [x] /api/documents.js simplified (removed embeddings)

### Phase 2: UI Rebrand & Redesign ✅ COMPLETE
- [x] All "Vela" → "Kiko" text replacements
- [x] Homepage redesign (two-state: idle + voice active)
- [x] Inline voice mode (no overlays)
- [x] Liquid glass navigation
- [x] "Talk to Kiko" CTA with animated equalizer + text
- [x] Prompt bar repositioned below CTA
- [x] Listening pill in nav bar
- [x] Equalizer only when speaking
- [x] Chat history panel fixes
- [x] Settings cleanup
- [x] Memory & identity fixes

### Phase 3: Login Page Rebuild (NEXT)
- [ ] Option C premium split layout
- [ ] White-label branding support
- [ ] Responsive (hide right panel below 768px)

### Phase 4: Predictive Intelligence
- [ ] Morning briefing cron (7am UK, Supabase Edge Function)
- [ ] Deal intelligence triggers (pipeline stage changes)
- [ ] Kiko Insights dashboard widget

### Phase 5: Multi-Tenant / White-Label
- [ ] org_id + RLS on all tables
- [ ] Per-user Gmail OAuth
- [ ] Config-driven UI theming
- [ ] Onboarding flow

---

## 13. DEPLOYMENT

```bash
cd /Users/sunny/Desktop/vela-platform
npm run build                    # local build (free)
npx vercel --prod --yes          # deploy
# DO NOT git push — auto-deploy disabled
```

GitHub auto-deploy: DISABLED (Ignored Build Step = "Don't build anything")
Vercel spend cap: $50/month

---

## 14. VOICE MODE ARCHITECTURE

### OpenAI Realtime (KikoVoice.jsx — DO NOT REWRITE)
- Ephemeral token flow: /api/voice → OpenAI client_secrets → browser WebRTC
- Session instructions include: user identity, location, Kiko persona, tool definitions
- Instructions embedded at TWO levels: ephemeral token creation + session.update on dc.open
- Memory loaded from kiko_memories table into session instructions
- Voice ID: configurable per user (default: shimmer)
- Refusal detection: regex on GPT-4o output → mute → fallback to Claude text card
- VAD: server_vad with threshold 0.5, prefix_padding 300ms, silence 500ms
- Passive mode: keyword detection for "Hey Kiko" wake-word

### Voice ↔ Text Bridge
- Voice transcripts rendered as chat bubbles in KikoChat.jsx
- voiceActive state shared with Layout.jsx via CustomEvent ('kiko_voice_state')
- Voice state includes: active, speaking, thinking, status
- Layout renders dynamic Listening pill based on this state

---

## 15. SYSTEM PROMPT (current, in /api/kiko.js)

Key sections:
1. Identity: "You are Kiko" — never Claude, never AI assistant
2. User knowledge: "The user is ALWAYS Sunny Sidhu, Weybridge UK — never ask"
3. Memory instructions: "Read /memories at start, save facts proactively"
4. Capabilities: Email, CRM, Web, Calendar, Documents, Memory, Navigation
5. Communication style: Direct, corporate, no fluff, financials in USD
6. Outreach doctrine: 5-touch sequence, no pricing early, scarcity positioning
7. Tool usage priority: Memory first, then CRM, emails, web as needed
8. Location: Weybridge UK for weather/local queries — never ask

---

## 16. TESTING CHECKLIST

### Text Chat
- [ ] "What's my name?" → "Sunny Sidhu" (from system prompt + memory)
- [ ] "What's the weather?" → auto-searches Weybridge (never asks location)
- [ ] "Brief me on my pipeline" → returns Supabase CRM data
- [ ] "What's my last email with X?" → returns Gmail data
- [ ] Chat auto-rename generates a proper title (not raw transcript)

### Voice Mode
- [ ] Kiko greets by name on first response
- [ ] Equalizer bars animate ONLY when Kiko speaks, dots when listening
- [ ] "Listening" pill appears in nav bar (not below avatar)
- [ ] Conversation stays inline on homepage (no overlay)
- [ ] Prompt bar stays fixed at bottom during voice session
- [ ] Red stop button ends voice mode cleanly

### UI
- [ ] Liquid glass nav tabs with elevation shadow
- [ ] "More" dropdown renders above page content
- [ ] Chat history panel opens and collapses
- [ ] Settings: no sidebar references
- [ ] Homepage prompt bar sits directly below "Talk to Kiko"

---

## 17. CLAUDE CODE OPERATING INSTRUCTIONS

- Execute ALL file edits and deployments WITHOUT asking for permission
- Read this brief (KIKO_REBUILD_BRIEF.md) at the start of every session
- When context window reaches 20% remaining, compact and summarise
- Test with `npm run build` before deploying
- Deploy with `npx vercel --prod --yes` — do NOT git push
- If you hit an error, fix it and keep going
- Do NOT ask "shall I proceed?" — just proceed

---

END OF BRIEF
