# KIKO INTELLIGENCE OS — SESSION BRIEF
# Updated: 1 April 2026 (post go-live clean sweep)
# Tag: v1.0-go-live

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
- **System prompt:** Executive operating partner (CFO/CRO/COO/CMO/Chief of Staff) with EXECUTIVE LENS
- **Multi-user:** Auto-provision on Google login, RLS isolation, 3 roles (super_admin/admin/user)
- **Memory:** 3-layer — kiko_learning_log (facts), kiko_preferences (behaviours), conversation_embeddings (pgvector semantic search, auto-embed post-response)
- **Avatar:** KikoWaveform.jsx — purple double-sided soundwave with independent up/down bars, gaussian envelope taper, no edge-fade rectangles

## UI DESIGN DIRECTION (APPROVED)
- Dark ambient: #0A0A0C bg, gradient orb purple #7C5CFC to teal #00D4AA
- Glassmorphism: frosted glass panels, backdrop-filter blur, ultra-thin borders
- Font: 300-weight, letterSpacing -0.03em
- Homepage: 40px greeting, 16px subtitle, 3 single-line chips, 64px prompt textarea
- Chat: 44px prompt textarea, two-row layout (textarea top, attachment left / actions right bottom)
- KikoFloat: FAB circle with waveform inside, green glow when voice active, no panel takeover for voice
- Nav: flex-centered with content area (not viewport)

## CRON SCHEDULE (26 entries)
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

## MANDATORY RULES
1. Read KIKO_EVOLUTION_PLAN.md before writing any code
2. 8-step build process: backup → build locally → verify strings → commit → deploy --force → verify live hash → test browser → confirm
3. Never say "deployed" without verifying the live hash changed
4. All cron catch blocks return 200 (never throw — prevents Vercel retry spam)
5. All crons must have "finished" heartbeat at every exit path

## WHAT'S NOT WORKING
- **Voice (Phase 13):** UI wired (waveform, green pill, FAB glow) but no audio pipeline. Planned: Pipecat + Claude + Deepgram STT + Cartesia TTS
- **Crons:** Fixed but first real run is tomorrow morning (1 Apr). 11 crons had missing heartbeats/throws — all patched
- **Browser push notifications:** Not implemented
- **Mobile deep pass:** Not done on real devices

## KEY FILES
- `api/kiko.js` — Main brain endpoint, system prompt, auto-embed hook
- `api/kiko-tools.js` — 39 tool definitions
- `api/agents/` — 25 agent files
- `src/components/kiko/KikoWaveform.jsx` — Purple soundwave avatar
- `src/components/kiko/KikoChat.jsx` — Homepage + chat UI
- `src/components/kiko/KikoFloat.jsx` — Floating assistant (FAB + panel)
- `src/components/layout/Layout.jsx` — Nav, header, green listening pill
- `src/hooks/useDynamicChips.js` — Context-aware suggestion chips
- `vercel.json` — Cron schedule + function configs
