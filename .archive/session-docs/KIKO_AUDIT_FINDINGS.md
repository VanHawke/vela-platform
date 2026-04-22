# KIKO AUDIT — Option C Findings (Tool Surface + Agent Layer)

**Date:** 2026-04-09
**Scope:** Complete line-by-line read of `api/kiko-tools.js` + all 26 files in `api/agents/`
**Lines audited:** 4,829
**Purpose:** Identify stubs, dead code, bugs, broken references, and capability gaps

---

## Summary

| Metric | Count |
|---|---|
| Files audited | 27 |
| Lines read | 4,829 |
| Tools registered in kiko-tools.js | 29 |
| Tools with executeTool handlers | 29 ✅ parity |
| Agent files with real implementations | 26 ✅ zero stubs |
| Bugs found | 2 (1 already fixed, 1 fixed this turn) |
| Orphaned code | 0 functions |
| Tables referenced but empty | 4 (feature fossils, not broken) |

---

## Tool-by-tool verdict

### Tool surface (kiko-tools.js, 1,123 lines)

| Tool | Handler | Status |
|---|---|---|
| `ask_navigator` | → agents/navigator.js | ✅ real |
| `ask_deal_agent` | → agents/deal.js | ✅ real |
| `ask_data_agent` | → agents/data.js | ✅ real, 40+ operations |
| `ask_outreach_agent` | → agents/outreach.js | ✅ real |
| `ask_document_agent` | → agents/document.js | ✅ real (HTTP proxy) |
| `ask_memory_engine` | → agents/memory-engine.js | ✅ real |
| `ask_strategy_agent` | → agents/strategy.js | ✅ real, uses Opus |
| `ask_negotiation_agent` | → agents/negotiation.js | ✅ real, uses Opus |
| `ask_category_agent` | → agents/category-control.js | ✅ real |
| `ask_finance_agent` | → agents/finance.js | ✅ real |
| `ask_ea_agent` | → agents/ea.js | ✅ real (bug fixed this turn) |
| `ask_legal_agent` | → agents/legal.js | ✅ real |
| `ask_dispute_agent` | → agents/dispute.js | ✅ real |
| `ask_content_agent` | → agents/content.js | ✅ real |
| `ask_investment_agent` | → agents/investment.js | ✅ real, uses Opus |
| `ask_pricing_agent` | → agents/pricing.js | ✅ real |
| `ask_signal_agent` | → agents/signal.js | ✅ real (no LLM) |
| `ask_travel_agent` | → agents/travel.js | ✅ real |
| `ask_specialist_agent` | → agents/website.js / product-dev.js / ip.js | ✅ real (3 sub-agents) |
| `navigate_page` | inline in kiko-tools.js | ✅ real |
| `log_activity` | inline in kiko-tools.js | ✅ real |
| `ask_lemlist_live` | inline `executeLemlistLive` in kiko-tools.js | ✅ real, hits Lemlist API |
| `ask_self_monitor` | inline `handleSelfMonitor` in kiko-tools.js | ✅ real |
| `manage_knowledge` | inline in kiko-tools.js | ✅ real, 10 sub-ops |
| `ask_code_review` | → agents/code-review.js | ✅ real, reads own source via fs |
| `trigger_triage` | inline, calls `/api/cron-inbox-triage` | ✅ real |
| `search_conversations` | inline, semantic + keyword hybrid | ✅ real |
| `read_email` | inline, Gmail API | ✅ real |
| `read_calendar` | inline, Google Calendar API | ✅ real |

**No stubs. No placeholders. Every tool has a working implementation.**

### Agent-by-agent details

**data.js (952 lines) — The campaign engine.**
- 40+ operations across CRM reads, analytics, campaigns, sequencing, enrichment
- `source_companies` uses Claude Sonnet 4 + web_search with a proper exclusion set against 320+ known F1 partners. Double-filters server-side after LLM response.
- `refresh_partnerships` web-searches current F1 sponsors per team
- `predictDealOutcomes` has real scoring: stage probability × freshness × value
- `enrich_company` writes structured intel to `company_intelligence`
- All `contacts` and `deals` queries use `data->>field` JSONB path syntax (matches schema)
- Found bug (already fixed earlier this session): `getAlerts` expires_at filter

**deal.js (180 lines) — Natural language CRM writes.**
- Uses Haiku 4.5 to parse natural instructions into JSON ops
- Handles move_stage, create_task, create_deal, update_contact
- Auto-triggers win/loss analysis on Won/Lost stage moves
- Writes to deal_stage_history, activities, kiko_win_loss_analysis, kiko_learning_log
- Stage name alias map covers common typos and shorthand

**ea.js (226 lines) — Morning brief + task prioritisation.**
- Pulls 11 data sources in parallel (tasks, deals, alerts, activities, news, outreach, notifications, stage history, draft actions, calendar, preferences)
- **BUG FIXED this turn:** `expires_at=gt.NOW` filter was hiding partnership_detected alerts
- Synthesises via Claude Sonnet 4 (not a formatted list) — outputs narrative brief
- Fallback returns raw data if Claude fails

**memory-engine.js (214 lines) — Cross-session intelligence.**
- `recall()` queries 7 sources: learning_log, deals, deal_stage_history, contacts, conversations, kiko_thought_journal (709 rows), kiko_conversation_insights (1193 rows)
- `extractAndStore()` uses Haiku to extract facts from conversation transcripts
- `draft_context()` gathers everything before writing to someone
- All tables queried exist and have data

**strategy.js (214 lines) — Opus-powered decision engine.**
- Uses claude-opus-4-6 for strategic questions
- Pulls CRM + company enrichment + outreach + news + pipeline + past decisions + preferences + thought journal in parallel
- Never hedges — delivers verdicts

**negotiation.js (144 lines) — Opus-powered adversarial thinking.**
- Analyses negotiation positions with power mapping
- Pulls deals + company enrichment + outreach engagement + past decisions
- Counter-offer builder with trade extraction
- References kiko_preferences for Sunny's patterns

**intent-classifier.js (211 lines) — Haiku-based intent routing.**
- Deterministic short-circuits: `detectCategoryGap()` (zero LLM), `detectNavigation()` (zero LLM)
- Keyword shortcuts for greetings, brief, screen, email_read, knowledge, conversation_search, code_review
- Haiku fallback for ambiguous cases (~100ms)
- 28-intent → agent mapping

**outreach.js (168 lines) — Email drafting + Lemlist.**
- Voice-matched drafts: loads voice profile, re-runs body through Claude Sonnet 4 alignment
- Gmail MIME wrapping with proper `vanhawke.com → vanhawke.agency` From alias
- Signature wrapping via `lib/email-format.js`
- Recipient style analysis via Haiku on up to 12 past emails
- Lemlist API: list campaigns, add leads, get activities

**content.js (106 lines) — SponsorSignal LinkedIn posts.**
- Gathers real news + partnerships + deals for grounding before generating
- Enforces SponsorSignal format (headline, brand signals, move of week, Van Hawke Viewpoint, CTA)
- Uses "intelligent age" not "AI generation"

**category-control.js (90 lines) — Team × category availability checks.**
- Pure SQL-backed, no hallucination
- Supports team-level, category-level, and specific combo views
- Conflict check scans for existing partnerships

**finance.js (109 lines) — Pipeline forecast + financial analysis.**
- Pipeline forecast uses real stage probability table (0.05 → 0.95)
- Groups by stage and pipeline
- Analyse mode pulls pipeline context before Claude call

**signal.js (63 lines) — News signal detection.**
- Zero LLM
- Queries news_articles with relevance_score and deal_signal flags
- Cross-references with active deals for pipeline matches

**document.js (103 lines) — File generation proxy.**
- HTTP proxy to /api/generate-doc, /api/generate-image, /api/generate-qr, /api/fetch-url
- Export handlers for pipeline and contacts (xlsx)

**navigator.js (149 lines) — UI-aware screen description.**
- Complete platform map in system prompt
- Detects navigation intent only from user's raw instruction (ignores appended page context)
- Returns target page ID for front-end routing

**screen-reader.js (140 lines) — Live page-specific data.**
- Queries Supabase directly per page (no stale pageContext)
- Pipeline, contacts, organisations, command centre, tasks, matrix, lemlist
- Real SQL, real output

**code-review.js (132 lines) — Kiko reads her own code.**
- Uses fs.readFileSync to read api/*.js files
- Analytics from kiko_output_tracking + kiko_error_log + kiko_cron_heartbeats
- Architecture analysis, file review, performance analytics, improvement suggestions

**dynamic-runner.js (75 lines) — Agent creation without code changes.**
- Loads agent definitions from `kiko_dynamic_agents` table
- Runs them with per-agent system prompt + data queries + model
- **INFO:** `kiko_dynamic_agents` table has **0 rows** — feature built, never used

**Small focused agents (investment, pricing, legal, dispute, ip, product-dev, website, travel):**
All follow the same clean pattern: pull relevant CRM context, build prompt, call Claude Sonnet 4 (or Opus for investment/negotiation/strategy), return structured output. All 42–109 lines each. Zero dead code.

---

## Bugs found

### 1. `getAlerts()` in data.js — expires_at filter hid partnership alerts
**Status:** ✅ Fixed in a previous session turn (verified by reading current file)
**Root cause:** `kiko_alerts?expires_at=gt.NOW` filtered out any alert with NULL expires_at. The auto-pause trigger I built did not set expires_at.
**Fix:** Changed to `or=(expires_at.is.null,expires_at.gt.NOW)`

### 2. `morningBrief()` in ea.js — same expires_at bug
**Status:** ✅ Fixed this turn
**Impact:** Every morning brief was silently dropping partnership_detected alerts. Sunny would never see auto-pause triggers in his morning intelligence unless he asked separately.
**Fix:** Same pattern — accept NULL or future expires_at.

---

## Informational findings (not bugs)

- **`kiko_dynamic_agents`** has 0 rows. The dynamic-runner.js agent works but has no agents to run. Kiko can create one on demand via `manage_knowledge.create_agent`.
- **`kiko_thread_tracker`**, **`kiko_win_loss_analysis`** — queried by memory-engine and deal.js respectively. Low/zero rows currently. Queries return empty gracefully.
- **`race_calendar`** — queried by travel.js. Has data per earlier inventory.
- **`kiko_preferences`** — queried by ea.js, strategy.js, negotiation.js for Sunny's decision patterns. Needs the preference-synthesis cron to populate it (runs Sundays 6am).

---

## Capability matrix — what Kiko can actually do (verified by reading code)

| Capability | Tool | Real data source | Confidence |
|---|---|---|---|
| Search contacts by name/company | ask_data_agent | contacts table | ✅ high |
| Pipeline forecast with weighting | ask_finance_agent | deals + stage probability | ✅ high |
| Morning brief with 11 data sources | ask_ea_agent | 11 tables in parallel | ✅ high |
| Category gap analysis | ask_category_agent | f1_partnerships + sponsor_categories | ✅ high |
| Partner conflict check | ask_category_agent | f1_partnerships | ✅ high |
| ROI case with real enrichment | ask_pricing_agent | companies + partnerships + outreach | ✅ high |
| Deal scoring + prediction | ask_data_agent | deals with scoring model | ✅ high |
| Win/loss analysis | ask_data_agent | kiko_win_loss_analysis | ✅ high (auto-populated) |
| Warm path / relationship discovery | ask_data_agent | contacts + kiko_relationships | ⚠️ needs relationships populated |
| Outreach intelligence | ask_data_agent | outreach_scores (real daily cron) | ✅ high |
| Company enrichment via web search | ask_data_agent | Claude Sonnet 4 + web_search | ✅ high |
| Partnership refresh via web search | ask_data_agent | Claude Sonnet 4 + web_search | ✅ high |
| Gmail draft with voice match | ask_outreach_agent | voice profile + Gmail API | ✅ high |
| Recipient style analysis | ask_outreach_agent | Gmail API + Haiku | ✅ high |
| Lemlist live campaign stats | ask_lemlist_live | Lemlist API | ✅ high (needs LEMLIST_KEY) |
| Warm leads detection | ask_lemlist_live | Lemlist activities API | ✅ high |
| System self-monitor | ask_self_monitor | kiko_error_log + cron heartbeats | ✅ high |
| Self-code review | ask_code_review | fs read own source + Claude | ✅ high |
| Past conversation search | search_conversations | pgvector + keyword | ✅ high |
| Memory recall (7 sources) | ask_memory_engine | 7 tables queried | ✅ high |
| Screen-aware navigation | ask_navigator | Platform map + page context | ✅ high |
| Live screen description | ask_data_agent / screen-reader | Real SQL per page | ✅ high |
| Strategic verdicts | ask_strategy_agent | Opus + 6-source context | ✅ high |
| Negotiation analysis | ask_negotiation_agent | Opus + power mapping | ✅ high |

**Kiko's claimed capabilities match her implemented capabilities.** The hallucination problem is NOT that she claims tools she doesn't have — it's that the LLM layer sometimes narrates capabilities conversationally instead of invoking them. That's a prompting/routing issue, not a capability gap.
