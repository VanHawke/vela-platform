# KIKO INTELLIGENCE OS — CONTINUATION PROMPT
# Paste this at the start of the next Claude chat window

You are continuing a build session on Kiko Intelligence OS — a commercial AI operating system built for Van Hawke Group (F1/Formula E sponsorship advisory + luxury eyewear + IP studio).

## MANDATORY FIRST STEPS
1. Read `/Users/sunny/Desktop/vela-platform/KIKO_SESSION_BRIEF.md`
2. Read `/Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md`

## PLATFORM
- **Live:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Supabase:** `dwiywqeleyckzcxbwrlb`
- **Deploy:** `npx vercel --prod --yes` (NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1 — caused $830 bill)
- **Latest commit:** `c61c221` on main
- **Bundle:** 670KB (code-split, 11 lazy-loaded pages)

## WHAT WAS COMPLETED (2 Apr 2026 — full session)

### EMAIL SYSTEM (complete, verified live)
- EmailDraft frame: thinking collapse + Subject/To/body + tone CTAs + Send to Gmail
- 3-layer detection: server EMAIL FORMAT RULE + thinking strip + broad isEmailDraft patterns
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- Tone rewrite via Haiku (claude-haiku-4-5-20251001)
- Email quality feedback loop: edit-delta cron → style lessons → system prompt injection

### CALENDAR (4 series, 61 races)
- F1 (22), Formula E (12), MotoGP (19), WEC (8) in race_calendar DB table
- Commercial Calendar page: full grid with 4-series toggles, color coding, detail pane
- Command Centre: series selector tabs with countdown to next race

### INTELLIGENCE ENGINE
- **75 news feeds** (up from 20): Forbes, TechCrunch, Reuters, CNBC, Wired, VentureBeat, Bloomberg/FT/WSJ/Times via Google News, Crunchbase, VC/PE funding, M&A, marketing (AdAge, The Drum, Campaign), psychology (HBR, Psychology Today), design (Creative Review, Dezeen), leadership moves, sector intelligence
- **Company enrichment cron** (weekly Sun 4:30am): Sonnet + web_search enriches top pipeline companies → structured data in company_intelligence table (funding, revenue, leadership, competitors, sponsorship fit score). 7 companies already enriched and verified.
- **Company intelligence auto-injection**: When drafting emails, Kiko pulls enriched data for mentioned companies from company_intelligence table and injects into system prompt
- **company_intel data operation**: "Kiko, show me intelligence on Cloudflare" returns structured enrichment data
- **Outreach outcome feedback**: Reply rates by messaging approach injected into email drafting prompt
- **Race-aware proactive alerts**: Calendar as 6th data stream in proactive cron, urgency tinting
- **Predictive behavior engine**: Cialdini's 6 principles + timing psychology + deal stage mapping hardcoded into outreach system prompt

### INFRASTRUCTURE
- Code-split: React.lazy() on 11 pages, bundle 902KB → 670KB
- Vercel cost fix: removed VERCEL_FORCE_NO_BUILD_CACHE=1 (was causing $830/month)
- Deploy via `npx vercel --prod --yes` only

## BACKFILL COMMAND
Hit this URL 8 times (60sec between each) to enrich all pipeline companies:
https://vela-platform-one.vercel.app/api/cron-company-enrich

## WHAT'S NEXT (priority order)
1. **People verification cron** — web-search contacts to detect role changes, flag stale people
2. **Voice (Phase 13)** — STT + TTS pipeline, UI wired, zero audio flowing
3. **Kiko personality layer** — persistent kiko_identity table, accumulated opinions from intelligence
4. **Pipeline hygiene cron** — auto-flag >90d inactive, bounced emails, suggest archival
5. **Manual enrichment trigger** — "Kiko, enrich Datadog" runs enrichment immediately
6. **Mobile deep pass** — real-device QA

## KEY RULES
- Read session brief + evolution plan before any code
- Deploy: `npx vercel --prod --yes` ONLY. NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1 or --force
- `ANTHROPIC_KEY` not ANTHROPIC_API_KEY. `VITE_SUPABASE_URL` not SUPABASE_URL
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- "Vela" = internal codename only. Kiko = product/platform/AI/OS
- All financials in USD
