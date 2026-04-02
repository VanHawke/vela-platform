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
- **Bundle:** 670KB (code-split, 11 lazy-loaded pages)

## WHAT'S OPERATIONAL (all deployed, verified)

### Intelligence Infrastructure
- **75 news feeds** across 10 categories (business, VC/PE, marketing, psychology, design, sectors, leadership, paywalled headline capture for Bloomberg/FT/WSJ/Times)
- **Company enrichment cron** (weekly): Sonnet + web_search → 30 structured fields per pipeline company. 17 companies enriched with revenue, funding, leadership, competitors, sponsorship fit scores
- **Company intel auto-injection**: When drafting emails, enriched data for mentioned companies injected into system prompt automatically
- **On-demand enrichment**: "Kiko, enrich [company]" runs immediately
- **People verification cron** (weekly): Detects role changes, departures. Creates alerts + learning log entries
- **Pipeline hygiene cron** (weekly): Flags stale deals >90d, warns on 30-89d inactive
- **Race-aware proactive alerts**: Race calendar as 6th data stream, urgency tinting (critical ≤14d, high ≤30d)
- **Outreach outcome feedback**: Reply rates by messaging approach injected into drafting prompt

### Email System
- EmailDraft frame: thinking collapse + Subject/To/body + tone CTAs (More Direct/Warmer/Shorter) + Send to Gmail
- 3-layer detection: server EMAIL FORMAT RULE + thinking strip + broad patterns
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- Email quality feedback loop: edit-delta cron → style lessons → system prompt injection

### Predictive Behavior Engine
- Cialdini's 6 principles mapped to deal stages + recipient seniority
- Timing psychology (Tue-Thu 8-10am, post-funding windows, pre-race urgency)
- Hardcoded into outreach system prompt

### Kiko Identity (24 entries)
- Persistent personality in kiko_identity table
- Strategic positions, communication style, market opinions, behavioral principles, self-awareness
- Injected into EVERY interaction
- Kiko states positions with conviction and challenges user when approaches contradict her intelligence

### Calendar (4 series, 61 races)
- F1 (22), Formula E (12), MotoGP (19), WEC (8)
- Commercial Calendar page with full toggles + detail pane
- Command Centre with series tabs + countdown

### Code-Split
- React.lazy() on 11 pages, bundle 902KB → 670KB

## 29 CRONS (all verified working)
health-check (30min), meeting-prep (hourly), learning-director (3am), partnership-scan+proactive (7am), inbox-triage (7:15am), morning-intelligence (7:30am), news-agent (8am, 75 feeds), outreach-score (Mon 9am), edit-delta (10pm), profile-synthesis (Sun 4am), company-enrich (Sun 4:30am), people-verify (Sun 5:30am), pipeline-hygiene (Sun 6:30am), weekly-report (Sun 7pm)

## WHAT'S LEFT
1. **Mobile QA** — zero real-device testing done across all pages
2. **Enrichment backfill** — 17/36 pipeline companies enriched. Run `/api/cron-company-enrich` ~5 more times
3. **Verify news-agent** — check 8am heartbeat tomorrow confirms 75-feed parallel processing works

## KEY ENV VARS (Vercel)
- `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY)
- `VITE_SUPABASE_URL` (not SUPABASE_URL)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## KEY RULES
- Read session brief + evolution plan before any code
- Deploy: `npx vercel --prod --yes` ONLY. NEVER VERCEL_FORCE_NO_BUILD_CACHE=1 or --force
- `ANTHROPIC_KEY` not ANTHROPIC_API_KEY. `VITE_SUPABASE_URL` not SUPABASE_URL
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- "Vela" = internal codename only. Kiko = product/platform/AI/OS
- All financials USD. All crons return 200 + heartbeat at every exit
- Before external API work: search current docs, never rely on training knowledge

## DB STATS
- 308 deals (36 open/active), 5,006 contacts, 2,243 companies
- 17 company_intelligence records (structured enrichment)
- 24 kiko_identity entries (personality layer)
- 61 race_calendar (4 series)
- 186 learning_log, 158 alerts, 27 outreach_scores
- 75 news feed sources
