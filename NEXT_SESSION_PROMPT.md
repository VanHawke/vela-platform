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
- **Latest commit:** `4b186a3` on main
- **Bundle:** 670KB (code-split, 11 lazy-loaded pages)

## INTELLIGENCE INFRASTRUCTURE (all deployed 2 Apr 2026)

### Data Ingestion (75 RSS feeds, 8am daily)
Business: Forbes, TechCrunch, Reuters, CNBC, Wired, VentureBeat, The Verge, Ars Technica, MIT Tech Review
Paywalled headlines: Bloomberg, FT, WSJ, The Times (via Google News)
VC/PE: Crunchbase News, GlobeNewsWire M&A, PRN Finance, Google News (Series A-C, IPOs, PE deals)
Marketing: Marketing Week, The Drum, AdAge, Campaign, Digiday
Psychology: HBR, Psychology Today, BehavioralEconomics.com
Design: Creative Review, It's Nice That, Dezeen, Brand New
Sectors: Cybersecurity, cloud, AI enterprise, semiconductor markets
Leadership: Google News (new CMO, CTO, CEO appointments)

### Company Enrichment (cron-company-enrich.js, weekly Sun 4:30am)
- Sonnet + web_search enriches pipeline companies → company_intelligence table (30 fields)
- 7 companies enriched and verified (Palo Alto $9.9B, Cloudflare $1.67B, BigBear.ai, Nordic Semi, Decagon, Attio, NanoXplore)
- Auto-injected into system prompt when drafting emails mentioning enriched companies
- Backfill: hit /api/cron-company-enrich 8 more times to cover full pipeline

### People Verification (cron-people-verify.js, weekly Sun 5:30am)
- Web-searches contacts for role changes, departures
- Creates kiko_alerts for DEPARTED and ROLE_CHANGE
- Saves to kiko_learning_log (category: people_movement)

### Pipeline Hygiene (cron-pipeline-hygiene.js, weekly Sun 6:30am)
- Flags deals >90d inactive as ARCHIVE CANDIDATES
- Warns on 30-89d stale deals with escalating severity
- Creates actionable alerts with specific next steps

### Predictive Behavior Engine (hardcoded in kiko.js outreach routing)
- Cialdini's 6 principles mapped to deal stages
- Timing psychology (Tue-Thu 8-10am, post-funding windows, pre-race urgency)
- Deal stage mapping (cold→authority+reciprocity, stale→pattern interrupt)

### Email Quality Loop
- edit-delta cron compares drafts vs sent, Haiku extracts style lessons
- Outreach outcome feedback: reply rates by messaging approach injected into prompt
- Both compound over time

## WHAT'S NEXT (priority order)
1. **Voice (Phase 13)** — STT + TTS pipeline. UI wired, zero audio
2. **Kiko personality layer** — persistent kiko_identity, develops opinions from intelligence
3. **Manual enrichment trigger** — "Kiko, enrich Datadog" runs immediately
4. **Company enrichment backfill** — run cron 8 more times to cover full pipeline
5. **Mobile deep pass** — real-device QA

## KEY RULES
- Read session brief + evolution plan before any code
- Deploy: `npx vercel --prod --yes` ONLY. NEVER --force or VERCEL_FORCE_NO_BUILD_CACHE=1
- `ANTHROPIC_KEY` not ANTHROPIC_API_KEY. `VITE_SUPABASE_URL` not SUPABASE_URL
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- "Vela" internal only. Kiko = product/platform/AI/OS. All financials USD.
