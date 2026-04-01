# KIKO INTELLIGENCE OS — SESSION BRIEF
# Updated: 1 April 2026 (post v1.0-go-live, pre-voice build)
# Tag: v1.0-go-live | Commit: f943428

## PLATFORM
- **Live URL:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Supabase:** project `dwiywqeleyckzcxbwrlb` | org `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- **Stack:** React/Vite + Vercel serverless + Supabase/Postgres + Claude Sonnet + GPT-4o (voice planned)
- **Deploy:** `VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`
- **Env var:** `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY)

## SYSTEM STATS
- 39 tools, 25 agents, 26 crons, 16 pages
- 308 deals, 5,006 contacts, 2,243 companies, 389 partnerships, 389 embeddings
- 94 relationships, 10 preferences, 117 learning entries, 60 knowledge sources, 2,858 news
- DB: 71MB / 500MB free tier
- Monthly cost: ~$35-40 (Vercel $20, Anthropic $15-20, OpenAI <$1)

## ARCHITECTURE
- **System prompt:** Executive operating partner (CFO/CRO/COO/CMO/Chief of Staff) with EXECUTIVE LENS + REASONING DISCIPLINE (explicit 4-step chain-of-thought before tool calls)
- **Multi-user:** Auto-provision on Google login, RLS isolation, 3 roles (super_admin/admin/user)
- **Memory:** 3-layer — kiko_learning_log (facts), kiko_preferences (behaviours), conversation_embeddings (pgvector semantic search, auto-embed post-response)
- **Model routing:** Haiku (greetings/nav <2s) → Sonnet (standard 3-5s) → Opus + extended thinking 10k tokens (deep analysis 8-15s)
- **Avatar:** KikoWaveform.jsx — purple double-sided soundwave with independent up/down bars, gaussian envelope taper, no edge-fade rectangles

## UI DESIGN DIRECTION (APPROVED)
- Dark ambient: #0A0A0C bg, gradient orb purple #7C5CFC to teal #00D4AA
- Glassmorphism: frosted glass panels, backdrop-filter blur, ultra-thin borders
- Font: 300-weight, letterSpacing -0.03em
- Homepage: 40px greeting, 16px subtitle, 3 single-line chips, 64px prompt textarea
- Chat: 44px prompt textarea, two-row layout (textarea top, attachment left / actions right bottom)
- KikoFloat: FAB circle with waveform inside, green glow when voice active, no panel takeover for voice — prompt bar stays visible, EQ button toggles voice on/off (red stop square when active)
- Nav: flex-centered with content area (not viewport)
- Login: waveform centred with CSS mask fade (no canvas edge-fade)

## CRON STATUS (verified from live heartbeats 1 Apr 2026)
### CONFIRMED WORKING (heartbeat: "finished")
- meeting-prep ✅ (hourly, 1-2s)
- proactive ✅ (7am, 9s, 3 records)
- partnership-scan ✅ (7am, 31s)
- task-automation ✅ (6:30am, 4.5s)
- edit-delta ✅ (10pm, 1.7s)
- weekly-report ✅ (Sun 7pm, 7-18s, 40 records)
- health-check ✅ (every 30min, 20-30s, 8 records)

### FIXED BUT AWAITING FIRST RUN
- learning-director — was timing out (2 topics + curiosity = 90s+). Fixed: 1 topic per run + 80s time guard
- inbox-triage — scheduled 7:15am Mon-Fri, hasn't fired since deploy
- morning-intelligence — scheduled 7:30am Mon-Fri
- news-agent — scheduled 8am Mon-Fri

### FULL SCHEDULE (26 entries in vercel.json)
| Time | Cron | Freq |
|------|------|------|
| Every 30min | health-check | Continuous |
| Hourly | meeting-prep | Continuous |
| 7am Mon-Fri | partnership-scan, proactive | Daily |
| 7:15am Mon-Fri | inbox-triage | Daily |
| 7:30am Mon-Fri | morning-intelligence | Daily |
| 8am Mon-Fri | news-agent | Daily |
| 9am Mon | outreach-score | Weekly |
| 10pm Mon-Fri | edit-delta | Daily |
| 4am Sun | profile-synthesis | Weekly |
| 5am Sun | partnership-verify, relationship-intel | Weekly |
| 6am Sun | preference-synthesis, document-scan | Weekly |
| 7pm Sun | weekly-report | Weekly |
| 3am daily | learning-director | Daily |

## VOICE — PHASE 13 (NEXT PRIORITY)
### What's wired (UI — all working)
- KikoWaveform responds to `volume` and `speaking` props across entire platform
- KikoFloat FAB: green glow aura + animated waveform when voice active
- Green "Listening" pill in Layout.jsx header bar (driven by `kiko_voice_state` CustomEvent)
- EQ button in KikoFloat panel toggles voice on/off (red stop square when active)
- Homepage KikoChat: full-width 900×100 waveform in voice mode
- KikoVoice.jsx component exists and renders on homepage when voiceActive=true

### What's NOT wired (audio — nothing flows)
- No STT (speech-to-text) pipeline
- No TTS (text-to-speech) pipeline
- No WebRTC or WebSocket audio connection
- The waveform animates on idle breathing only — no real mic/speaker data

### Previous attempts (all failed or abandoned)
1. **LiveKit Agents (Python)** — tried and abandoned (too complex, wrong architecture)
2. **GPT-4o Realtime relay** — failed due to cascading refusal interceptor bugs
3. **GPT-4o Realtime WebRTC** — got session.updated accepted + audio playing + interruption working, but persistent browser/CDN caching blocker made it unreliable
4. **STT → /api/kiko → TTS** — correct architecture (wraps same endpoint as text), partially built but not completed

### Planned architecture
- **STT:** Deepgram (streaming, via WebSocket from browser)
- **Brain:** /api/kiko (same endpoint as text chat — ensures tool access, memory, personality)
- **TTS:** Cartesia (streaming, Serafina voice ID: `4tRn1lSkEn13EVTuqb0g`)
- **Alternative stack:** Pipecat framework for orchestration

### Key voice files
- `src/components/kiko/KikoVoice.jsx` — Full voice page component (renders when voiceActive)
- `src/components/kiko/KikoFloat.jsx` — Float voice mode (FAB glow, no panel takeover)
- `src/components/kiko/KikoWaveform.jsx` — Canvas waveform avatar (volume/speaking props)
- `src/components/layout/Layout.jsx` — Green listening pill (lines 62, 106, 277)
- `api/kiko.js` — Main brain endpoint (system prompt, tools, streaming)
- `api/voice.js` — Existing voice endpoint (transcribe action exists for push-to-talk STT)

### Voice state event system
```js
// Dispatch from anywhere:
window.dispatchEvent(new CustomEvent('kiko_voice_state', { 
  detail: { active: true, speaking: false, thinking: false, status: 'Listening' } 
}))
// Layout.jsx listens and shows/hides green pill
// KikoFloat FAB responds with green glow + waveform energy
```

## MANDATORY RULES
1. Read KIKO_EVOLUTION_PLAN.md before writing any code
2. 8-step build process: backup → build locally → verify strings → commit → deploy --force → verify live hash → test browser → confirm
3. Never say "deployed" without verifying the live hash changed
4. All cron catch blocks return 200 (never throw — prevents Vercel retry spam)
5. All crons must have "finished" heartbeat at every exit path
6. Before any code involving external APIs, search and read current official docs first

## KEY FILES
- `api/kiko.js` — Main brain endpoint, system prompt, auto-embed hook, model routing
- `api/kiko-tools.js` — 39 tool definitions
- `api/voice.js` — Existing voice endpoint (transcribe action for push-to-talk)
- `api/agents/` — 25 agent files
- `api/cron-*.js` — 26 cron files (all heartbeat-fixed)
- `src/components/kiko/KikoWaveform.jsx` — Purple soundwave avatar (volume/speaking/mini props)
- `src/components/kiko/KikoChat.jsx` — Homepage + chat UI (PromptBar, greeting, chips, voice mode)
- `src/components/kiko/KikoFloat.jsx` — Floating assistant (FAB circle + panel + voice toggle)
- `src/components/kiko/KikoVoice.jsx` — Full voice page component
- `src/components/layout/Layout.jsx` — Nav, header, green listening pill
- `src/hooks/useDynamicChips.js` — Context-aware 3-chip suggestions
- `vercel.json` — Cron schedule + function configs (maxDuration for all)
- `KIKO_EVOLUTION_PLAN.md` — 19-phase architectural spec (mandatory reading)

## WHAT'S LEFT (priority order)
1. **Voice (Phase 13)** — STT + TTS pipeline. UI fully wired, zero audio flowing. THIS IS NEXT.
2. **Verify 3 remaining crons** — inbox-triage, morning-intelligence, news-agent (check heartbeats)
3. **Proactive morning briefing** — Surface cron intelligence in first interaction
4. **Mobile deep pass** — Real-device QA
5. **Browser push notifications** — Service worker + Web Push API
6. **Code-splitting** — React.lazy() for pages (902KB bundle)
7. **F1 sponsorship agent** — Dedicated agent with race calendar, ROI calculators
8. **Redis/Upstash cache** — Hot-path memory data for 30-40% speed improvement
