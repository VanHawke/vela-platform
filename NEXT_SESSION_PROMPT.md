# KIKO INTELLIGENCE OS — CONTINUATION PROMPT
# Paste this at the start of the next Claude chat window
# Last updated: 2 April 2026 | Commit: 090706d

You are continuing a build session on Kiko Intelligence OS — a commercial AI operating system built for Van Hawke Group (F1/Formula E sponsorship advisory + luxury eyewear + IP studio).

## MANDATORY FIRST STEPS
1. Read `/Users/sunny/Desktop/vela-platform/KIKO_SESSION_BRIEF.md`
2. Read `/Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md`

## PLATFORM
- **Live:** https://vela-platform-one.vercel.app
- **Codebase:** /Users/sunny/Desktop/vela-platform/
- **GitHub:** https://github.com/VanHawke/vela-platform
- **Supabase:** `dwiywqeleyckzcxbwrlb`
- **Deploy:** `npx vercel --prod --yes` (NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1)
- **Bundle:** 670KB (code-split, 11 lazy-loaded pages)
- **Monthly cost:** ~$35-40 (Vercel ~$20, Anthropic $15-20)

## KIKO'S COMPLETE INTELLIGENCE STACK (all deployed, verified)

### Closed-Loop Revenue Engine
1. **Ingestion** — 75 news feeds (business, VC/PE, marketing, psychology, design, sectors, leadership, paywalled headlines). 8am daily.
2. **Enrichment** — Company intelligence cron enriches pipeline companies with 30 structured fields (funding, leadership, competitors, sponsorship fit). 17 companies done. Weekly + on-demand ("Kiko, enrich X").
3. **Verification** — People verification cron detects role changes, departures. Pipeline hygiene cron flags stale deals.
4. **Proactive Intelligence** — 6-stream cross-reference (news + replies + stage changes + tasks + stale deals + race calendar). Urgency tinting. Convergence alerts.
5. **Psychologically Calibrated Outreach** — Cialdini's 6 principles + timing psychology + deal stage mapping. Email style feedback loop. Outreach outcome feedback (reply rates by approach).
6. **Execution** — Email drafting with auto-injected company intelligence + identity-driven communication + EmailDraft frame with tone CTAs + silent Gmail draft creation.
7. **Attribution** — Deal stage changes correlated with Kiko's actions. Impact data fed back into system prompt. Kiko knows what works.
8. **Identity** — 24 persistent strategic positions, opinions, behavioral principles. Kiko states positions with conviction, challenges the user.

### 30 Crons
health-check (30min), meeting-prep (hourly), learning-director (3am), partnership-scan + proactive (7am), inbox-triage (7:15am), morning-intelligence (7:30am), news-agent (8am, 75 feeds parallel), outreach-score (Mon 9am), edit-delta (10pm), deal-attribution (10:30pm), profile-synthesis (Sun 4am), company-enrich (Sun 4:30am), partnership-verify + relationship-intel (Sun 5am), people-verify (Sun 5:30am), preference-synthesis + document-scan (Sun 6am), pipeline-hygiene (Sun 6:30am), weekly-report (Sun 7pm)

### Key Tables
deals (308), contacts (5006), companies (2243), company_intelligence (17 enriched), kiko_identity (24 entries), kiko_deal_attribution (NEW), kiko_draft_tracking, kiko_learning_log (186), kiko_alerts (158), outreach_scores (27), race_calendar (61), news_articles (2858+)

## WHAT'S LEFT
1. **Enrichment backfill** — 17/36 done. Run /api/cron-company-enrich ~5 more times
2. **Mobile QA** — zero real-device testing
3. **Verify news-agent** — check 8am heartbeat tomorrow confirms 75-feed parallel processing
4. **Volume** — the feedback loops need 50-100 emails to start compounding meaningfully

## KEY RULES
- Read session brief + evolution plan before any code
- Deploy: `npx vercel --prod --yes` ONLY. NEVER --force or VERCEL_FORCE_NO_BUILD_CACHE=1
- `ANTHROPIC_KEY` not ANTHROPIC_API_KEY. `VITE_SUPABASE_URL` not SUPABASE_URL
- Gmail: @vanhawke.agency, Helvetica 12pt, no sign-off/name
- "Vela" = internal only. Kiko = product/platform/AI/OS. All financials USD.
