# KIKO INTELLIGENCE OS — CONTINUATION PROMPT
# Paste this at the start of the next Claude chat window

You are continuing a build session on Kiko Intelligence OS — a commercial AI operating system built for Van Hawke Group (F1/Formula E sponsorship advisory + luxury eyewear + IP studio).

## MANDATORY FIRST STEPS
1. Read `/Users/sunny/Desktop/vela-platform/KIKO_SESSION_BRIEF.md` — contains platform context, architecture, all verified features, key files, mandatory rules
2. Read `/Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md` — 19-phase architectural spec
3. Read `/Users/sunny/Desktop/vela-platform/SESSION_LOG_2APR2026.md` — changes from last session (2 Apr 2026)

## PLATFORM
- **Live:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Stack:** React/Vite + Vercel serverless + Supabase + Claude Sonnet + GPT-4o Realtime
- **Deploy:** `npx vercel --prod --yes` (NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1 — caused $830 overage)
- **Supabase project:** `dwiywqeleyckzcxbwrlb`
- **Latest commit:** `3a79145` on main
- **Bundle:** 670KB (code-split, 11 lazy-loaded pages)

## WHAT WAS COMPLETED LAST SESSION (2 Apr 2026)
1. ✅ Email draft system — full end-to-end: thinking collapse, EmailDraft frame with CTAs, tone rewrite via Haiku, silent Gmail draft creation, From: @vanhawke.agency, Helvetica 12pt, no sign-off/name
2. ✅ Email quality feedback loop — edit-delta cron compares drafts vs sent, Haiku extracts style lessons, lessons injected into outreach system prompt, compounding improvement
3. ✅ Calendar expansion — MotoGP (19 races) + WEC (8 races) added to DB + Command Centre tabs + Commercial Calendar page with full 4-series support
4. ✅ Race-aware outreach intelligence — proactive cron pulls calendar as 6th data stream, urgency tinting, race_windows focus in outreach intelligence
5. ✅ Code-split — React.lazy() on 11 pages, bundle 902KB → 670KB
6. ✅ EmailDraft detection consistency — 3-layer fix: server format rule + thinking strip + broad patterns
7. ✅ User message editing — click ✏ → textarea populates → submit truncates + resubmits

## WHAT'S NEXT (priority order)
1. **Voice (Phase 13)** — STT + TTS pipeline. UI fully wired (KikoVoice.jsx, KikoFloat.jsx, waveform, green pill). Zero audio flowing. Previous attempts: LiveKit (abandoned), GPT-4o relay (failed), GPT-4o WebRTC (partially built). Correct architecture: speech → STT → /api/kiko → TTS → speech.
2. **Verify remaining crons** — inbox-triage, morning-intelligence, news-agent, learning-director. Check heartbeat table for recent "finished" entries.
3. **Mobile deep pass** — Real-device QA across all pages
4. **Test race_windows focus** — Ask Kiko "show me race window intelligence" to verify output

## KEY ENV VARS (Vercel)
- `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY)
- `VITE_SUPABASE_URL` (not SUPABASE_URL)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## KEY RULES
- Every session: read session brief + evolution plan before writing code
- Deploy: `npx vercel --prod --yes` ONLY. NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1 or --force (caused $830 Vercel bill)
- Before any external API work: search current docs first
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- "Vela" = internal codename only. Kiko = product/platform/AI/OS
- All financials in USD
