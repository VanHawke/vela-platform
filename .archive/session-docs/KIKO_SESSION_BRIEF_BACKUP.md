# KIKO INTELLIGENCE OS — SESSION BRIEF
# Updated: 2 April 2026 (v1.2 — intelligence engine + personality layer)
# Latest commit: f8581e1 | Tag: v1.2-intelligence

## PLATFORM
- **Live URL:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Supabase:** project `dwiywqeleyckzcxbwrlb` | org `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- **Stack:** React/Vite + Vercel serverless + Supabase/Postgres + Claude Sonnet + GPT-4o Realtime
- **Deploy:** `npx vercel --prod --yes` (NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1 — caused $830 bill)
- **Env vars:** `ANTHROPIC_KEY` (not ANTHROPIC_API_KEY), `VITE_SUPABASE_URL` (not SUPABASE_URL)
- **Bundle:** 670KB main + lazy chunks (code-split via React.lazy, 11 pages)

## SYSTEM STATS
- 41 tools, 25 agents, 29 crons, 16 pages (11 lazy-loaded)
- 308 deals (36 open/active), 5,006 contacts, 2,243 companies
- 17 companies with structured intelligence (company_intelligence table)
- 61 race calendar entries (22 F1, 12 FE, 19 MotoGP, 8 WEC)
- 24 kiko_identity entries (strategic positions, communication style, market opinions, behavioral principles, self-awareness)
- 186 learning entries, 158 alerts, 27 outreach scores, 2 draft tracking entries
- 75 news feed sources across 10 categories
- 183 conversations
- Monthly cost: ~$35-40 (Vercel ~$20, Anthropic $15-20)

## ARCHITECTURE
- **System prompt:** Executive operating partner with EXECUTIVE LENS + REASONING DISCIPLINE + EMAIL FORMAT RULE + PREDICTIVE BEHAVIOR ENGINE + KIKO IDENTITY injection
- **Multi-user:** Auto-provision on Google login, RLS isolation, 3 roles
- **Memory:** 3-layer — kiko_learning_log, kiko_preferences, conversation_embeddings (pgvector)
- **Identity:** kiko_identity table — 24 accumulated strategic positions, opinions, behavioral principles injected into every interaction
- **Model routing:** Haiku (greetings <2s) → Sonnet (standard 3-5s) → Opus + extended thinking (deep 8-15s)
- **Intelligence pipeline:** 75 RSS feeds (8am daily) → partnership scan (7am) → proactive alerts (7am) → company enrichment (weekly) → people verification (weekly) → pipeline hygiene (weekly)

## EMAIL DRAFT SYSTEM (complete)
- EmailDraft.jsx: Interactive frame with tone CTAs + Send to Gmail
- 3-layer detection: server EMAIL FORMAT RULE + thinking strip + broad patterns
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off
- Tone rewrite via Haiku, email quality feedback loop (edit-delta → style lessons → prompt injection)
- Outreach outcome feedback: reply rates by approach injected into drafting prompt

## CALENDAR (4 series, 61 races)
- F1 (22), Formula E (12), MotoGP (19), WEC (8)
- Commercial Calendar: 4-series toggles, color coding, detail pane
- Race-aware outreach: urgency tinting in proactive cron

## INTELLIGENCE ENGINE
### News Feeds (75 sources, 8am daily)
Business (Forbes, TechCrunch, Reuters, CNBC, Wired, VentureBeat, MIT Tech Review), paywalled headlines (Bloomberg, FT, WSJ, Times), VC/PE (Crunchbase, GlobeNewsWire, PRN), marketing (AdAge, The Drum, Campaign, Digiday), psychology (HBR, Psychology Today), design (Creative Review, Dezeen), sectors, leadership moves

### Company Enrichment (weekly Sun 4:30am)
Sonnet + web_search → 30 structured fields per company. 17 enriched. Auto-injected into email drafting prompt when company mentioned. On-demand: "Kiko, enrich [company]"

### People Verification (weekly Sun 5:30am)
Web-searches contacts for role changes/departures. Creates alerts + learning log entries.

### Pipeline Hygiene (weekly Sun 6:30am)
Flags >90d inactive as ARCHIVE CANDIDATES. Warns on 30-89d stale deals.

### Predictive Behavior Engine
Cialdini's 6 principles + timing psychology + deal stage mapping hardcoded into outreach system prompt.

### Kiko Identity (24 entries)
Persistent personality: strategic positions, communication style, market opinions, behavioral principles, self-awareness. Injected into every interaction. Kiko states positions with conviction and challenges user when approaches contradict intelligence.

## CRON SCHEDULE (29 entries)
| Time | Cron | Status |
|------|------|--------|
| Every 30min | health-check | ✅ |
| Hourly | meeting-prep | ✅ |
| 3am daily | learning-director | ✅ Fixed (50s curiosity guard) |
| 7am Mon-Fri | partnership-scan, proactive (6-stream + race calendar) | ✅ |
| 7:15am Mon-Fri | inbox-triage | ✅ |
| 7:30am Mon-Fri | morning-intelligence | ✅ |
| 8am Mon-Fri | news-agent (75 feeds, parallel batches of 10) | ✅ Fixed (120s maxDuration) |
| 9am Mon | outreach-score | ✅ |
| 10pm Mon-Fri | edit-delta (email quality feedback) | ✅ |
| Sun 4:00am | profile-synthesis | ✅ |
| Sun 4:30am | company-enrich (4 companies/run) | ✅ |
| Sun 5:00am | partnership-verify, relationship-intel | ✅ |
| Sun 5:30am | people-verify (6 contacts/run) | ✅ NEW |
| Sun 6:00am | preference-synthesis, document-scan | ✅ |
| Sun 6:30am | pipeline-hygiene | ✅ NEW |
| Sun 7:00pm | weekly-report | ✅ |

## MANDATORY RULES
1. Every session: read KIKO_SESSION_BRIEF.md + KIKO_EVOLUTION_PLAN.md before code
2. Deploy: `npx vercel --prod --yes` ONLY. NEVER --force or VERCEL_FORCE_NO_BUILD_CACHE=1
3. Before external API work: search current docs first
4. Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
5. "Vela" = internal only. Kiko = product/platform/AI/OS
6. All financials USD. All crons return 200 + heartbeat at every exit

## KEY FILES
- `api/kiko.js` — Brain: system prompt, identity injection, email style feedback, predictive behavior, model routing
- `api/kiko-tools.js` — 41 tool definitions (incl. company_intel, enrich_company)
- `api/agents/data.js` — Data ops: company_intel, enrich_company, outreach_intelligence (race_windows), outreach_timing
- `api/agents/outreach.js` — draftEmail, recipient_style
- `api/cron-company-enrich.js` — Weekly company enrichment via Sonnet + web_search
- `api/cron-people-verify.js` — Weekly contact verification for role changes
- `api/cron-pipeline-hygiene.js` — Weekly stale deal flagging
- `api/cron-proactive.js` — 6-stream cross-reference (incl. race calendar)
- `api/cron-edit-delta.js` — Email draft comparison + style lessons
- `api/news-agent.js` — 75 RSS feeds, parallel batches, 120s maxDuration
- `src/components/kiko/EmailDraft.jsx` — Email frame with tone CTAs
- `src/components/kiko/KikoChat.jsx` — Chat UI, thinking collapse, email detection
- `src/pages/CommercialCalendar.jsx` — 4-series calendar
- `src/App.jsx` — Router with React.lazy() code-split

## WHAT'S LEFT
1. Mobile QA — real-device testing
2. Continue enrichment backfill — 17/36 companies done, run /api/cron-company-enrich ~5 more times
3. Verify news-agent runs successfully at 8am tomorrow (check heartbeats)
