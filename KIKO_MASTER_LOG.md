# KIKO MASTER LOG & TODO

**Read this at the start of every session. Update it at the end of every session.**
**Complementary files:** `KIKO_SYSTEM_MAP.md` (blueprint), `KIKO_BIBLE.md` (identity/doctrine), `CAMPAIGN_BUILDER_ARCHITECTURE.md` (deterministic pipeline spec).

---

## SECTION A — Full audit (2026-04-09, this session)

### A0d. 2026-04-10 (evening) — Build campaign timeout fix + UI segmentation removal + Lemlist research (v0.0.24 → v0.0.25)

**Final state: v0.0.25 LIVE | bundle DVwiwiAL | selfcheck 17/18 | clean test data baseline**

#### v0.0.24 — Critical bug fixes
- ✅ **Build campaign timeout root cause** — `api/build-campaign.js` had no `maxDuration`, defaulted to 60s, but build does CRM queries + Claude auto-draft + Claude web_search → exceeded 60s → silent kill → orphan sequence row → enroll endpoint then said "No sourced targets found". Fixed: added `export const config = { maxDuration: 300 }` (Pro max). Plus parallelized `sourceFromCRM` contact lookups via `Promise.all` (was 30 sequential queries, now batch parallel — 30x faster on the CRM step).
- ✅ **"Top 8 only" UI bug** — `Campaigns.jsx` review modal was hardcoded to render `buildResult.top_8` only. The build endpoint already returned full `top_50`. Fixed: now renders all targets, each row shows all decision-makers joined together. All "8" hardcoded labels removed across review/enrolling/done states.
- ✅ **CRM/web segmentation removed from UI** — no source labels render anywhere in the campaign view. Targets are treated equal in display per Sunny's request.
- ✅ **Background color inconsistency** — global sed find/replace across 10 JSX/JS files: `#1C1C1F→#262624`, `#141416→#1F1F1D`, `#1A1A1E→#2C2C2A`, `#1E1E22→#33332F`, `#161618→#2A2A28`. Files: LoginPage, Layout, ChatHistory, KikoFloat, KikoChat, KikoVoice, KikoInsights, theme.js, Campaigns, SequenceDetail. Build modal background also bumped.
- ✅ **Email rendering bug** — `wrapEmailBody` rewritten with 3-layer sign-off stripping: (1) cut at any sign-off opener, (2) iteratively trim trailing name/title/company lines, (3) collapse triple newlines. Old regex only matched lines starting with "Van Hawke", so "CEO, Van Hawke Group" survived as orphan title line.
- ✅ **Phase 2c Sports sponsorship enrichment** — new `api/enrich-campaign-sponsorship.js` (~120 lines), POST `{campaign_id, top_n=10}`, parallel batches of 4, returns motorsport_history + f1_fit_score + decision-maker who signed each deal. Migration applied: `campaign_targets.sponsorship_history jsonb`. New 🏎 amber button in SequenceDetail footer.
- ✅ **Build modal centering** — `margin: 0 auto`, `maxWidth: calc(100vw - 48px)`.

#### v0.0.25 — Polish + research
- ✅ **Top nav true viewport centering** — `Layout.jsx` desktop-top-nav switched from `flex:1` (off-center because logo width varied vs fixed right controls) to absolute `left:50% top:50% translate(-50%,-50%)`.
- ✅ **"Previously in CRM" badge on contact records** — `ContactDetail.jsx` new `campaignHistory` state, queries `campaign_targets WHERE contact_id = id` (linked via build-campaign CRM sourcing) UNION `WHERE decision_maker_email = email AND contact_id IS NULL` (fallback for older campaigns), deduped by campaign. Renders purple "Previously in CRM · N campaigns" pill plus up to 3 clickable campaign chips with verification status, in the contact header. This is the per-contact CRM history visibility Sunny asked for, moved from the campaign list (which is no longer source-segmented) to where it actually belongs.
- ✅ **Category gap output tightened** — `api/kiko.js` deterministic short-circuit handler. Removed verbose "Taken by: X +N more" trail, removed long "Recommendation:" paragraph, removed "~80 seconds" marketing copy. Output ~60% shorter, ~40% fewer words.
- ✅ **Phase 6 Lemlist research doc** — new `KIKO_LEMLIST_RESEARCH.md` (377 lines): full architecture analysis, 25-feature gap table, recommendation to build Kiko Chrome extension v1 (visit/invite/message via polling API + content script, ~3 day effort), visual sequence flow editor via ReactFlow (~3 days), link click tracking (~3 hours). 7-8 day total path to Lemlist parity + features Lemlist doesn't have, $1,188-3,500/yr saving vs Lemlist Pro. 4 open questions for Sunny.

---

## SECTION A — Full audit (2026-04-09, this session)

### A0c. 2026-04-10 (afternoon) — Critical bugs + campaign builder overhaul + CRM-first sourcing + verification gate + timezone-aware sender (v0.0.19 → v0.0.23)

**Final state: v0.0.23 LIVE | bundle BoeewjIZ | selfcheck 17/18 (only diagnostic category_coverage) | 0 active selfcheck_fail alerts | clean test data baseline**

#### v0.0.19 — Phase 1 critical bugs (6 items)
- ✅ Voice goodbye fullscreen — KikoVoice.jsx + useRealtimeVoice.js instructions explicit + 5s safety net
- ✅ XML tag leak — new stripToolXml() helper, both streaming paths, cross-chunk buffer
- ✅ Navigation via prose — same fix, hardened NAVIGATION RULE in system prompt
- ✅ Decagon "16 days" bug — uses data.lastActivity not row updated_at
- ✅ Racing Bulls cybersecurity — partnership-matrix API + UI both honor related_categories
- ✅ Partnership Matrix UI — same v0.0.19 ship

#### v0.0.20 — Phase 2 campaign builder safety (3 items)
- ✅ Phase 2a — Campaigns paused by default (build-campaign-enroll.js)
- ✅ NEW api/activate-campaign.js — explicit activation with sanity gates
- ✅ Phase 2b — Auto-draft sequence steps at build time
- ✅ Phase 2e — Job title + click-to-contact

#### v0.0.21 — CRM-FIRST sourcing + verification gate (architectural rewrites)
- ✅ build-campaign.js sourceFromCRM() — queries 2,244 companies + 4,193 contacts FIRST
- ✅ Migration: contacts verification fields (last_verified_at, still_at_company, etc.)
- ✅ Migration: campaign_targets verification fields (verification_status, verified_at, contact_id)
- ✅ NEW api/verify-campaign-targets.js — parallel batches of 5, persists to contacts table
- ✅ api/activate-campaign hardened — refuses unverified or moved/left targets
- ✅ NO CAPS — build-campaign-enroll.js processes ALL sourced
- ✅ Sign-off duplication FIXED — prompt + stripAiSignOff() defensive stripper
- ✅ cron-people-verify writes back to contacts table

#### v0.0.22 — UI buttons + Claude.ai warm dark + clean baseline
- ✅ UI Verify all targets button (purple)
- ✅ UI Activate Campaign button — calls /api/activate-campaign with full gate
- ✅ Claude.ai warm dark palette (#262624)
- ✅ Test data wiped clean — 3 sequences, 138 targets, 24 enrollments deleted

#### v0.0.23 — Phase 3 Command Centre alignment + Phase 5 timezone-aware sender (true 24h)
- ✅ Phase 3 — describeCommandCentre() rewritten to mirror visible priority list
- ✅ Phase 3 — Intent classifier fast-path for command-centre priority questions
- ✅ Phase 5 — vercel.json cron-sequence-sender now '0 * * * 1-5' (every hour 24h)
- ✅ Phase 5 — UK working window clamp REMOVED from enqueue, prospects scheduled in true local 9-10am
- ⚠️ Phase 4 — Learning loop audit: wired correctly, inert until first real campaign send

---

### A0b. 2026-04-10 SESSION — Admin dashboard, selfcheck watcher, company lookup, brief banner (v0.0.14 → v0.0.18)

**Final state:** v0.0.18 deployed | Selfcheck 17/18 PASS | 0 errors 24h | 0 active selfcheck_fail alerts

**Shipped this session:**

1. **`/admin/system` live control room** (v0.0.14)
   - New page: `src/pages/AdminSystem.jsx` (~270 lines)
   - Headline status banner (X/Y invariants, green or amber)
   - 10-tile data snapshot (partnerships, sequences, contacts, deals, alerts, etc.)
   - 18-tile selfcheck health grid (one tile per invariant)
   - Cron activity feed (deduped to 1 row per cron)
   - Error log feed (last 24h)
   - Auto-refresh every 30s, manual refresh button, live bundle hash display
   - Lazy-loaded route, AdminRoute-guarded (super_admin only)

2. **Hourly selfcheck watcher cron** (v0.0.15 / v0.0.16)
   - New file: `api/cron-selfcheck-watcher.js` (~140 lines)
   - Runs `0 * * * *` (top of every hour)
   - Calls `/api/selfcheck`, creates `kiko_alerts` row for new FAILs, auto-dismisses on recovery
   - Idempotent: one active alert per check name, dedup via entity_id
   - NO_ALERT exclusion list: category_coverage (diagnostic, not actionable)
   - Bug fixed mid-session: `SUPABASE_URL` → `VITE_SUPABASE_URL` (the actual env var name)
   - Live-tested: returns `{ok:true, alerts_created:0, alerts_resolved:0, failing_checks:["category_coverage"]}`
   - vercel.json: 39 → 40 crons (Pro plan ceiling reached)

3. **`withHeartbeat` HOF utility** (v0.0.17)
   - Added to `api/cron-utils.js`
   - Wraps any handler with full lifecycle tracking (started/finished/error)
   - Captures HTTP status via res.status spy
   - Skips writing for unauthorized requests
   - Available for future crons that don't self-instrument
   - The 37 existing crons already self-instrument with `cronHeartbeat` from kiko-tools.js — confirmed via live SQL showing 18+ unique crons writing heartbeats in last 24h

4. **Dashboard cron activity dedup** (v0.0.17)
   - `AdminSystem.jsx`: query rewritten to fetch last 200 raw heartbeats then dedupe by `cron_name` in JS
   - Previously LIMIT 15 made cron-jobs-worker (288 runs/day) drown out everything
   - Now shows all 18+ unique crons cleanly

5. **Deterministic `/api/company-lookup` endpoint** (v0.0.17)
   - New file: `api/company-lookup.js` (~260 lines)
   - `findCompany()`: 4-tier fuzzy match (exact CI, partial CI, exact companies, partial companies). Picks shortest match for specificity.
   - `lookupCompany()`: exported helper, parallel fetch of company_intelligence + companies + contacts + deals
   - Returns structured card: identity, financials, people (CEO/CTO/CMO/CFO/VPs), strategy (products/competitors/sponsorships/fit_score), internal CRM (contacts + deals), freshness
   - Pre-formatted markdown ready to stream
   - intent-classifier.js: 4 regex patterns ("tell me about X", "what is X", "info on X", "lookup X"), excludes self-referential and meta-CRM
   - kiko.js: deterministic short-circuit for `intent === 'company_lookup'`, streams card via `write({delta})`
   - **Live-verified**: `curl /api/kiko {"message":"tell me about Synthesia"}` returned full structured card with real CEO (Victor Riparbelli), real funding (Series E $200M on 2025-10-30), real CRM contacts (5), real deal ($1M Contact stage). Meta confirmed `model:deterministic, intent:company_lookup, matched_via:company_intelligence`.

6. **Morning brief system health surfacing** (v0.0.17 → v0.0.18 fix)
   - `ea.js morningBrief()`: splits alerts into selfcheckFails vs otherAlerts, prepends 🚨 SYSTEM HEALTH banner if any failures exist
   - **Bug discovered in v0.0.17**: brief intent routed through LLM tool loop (`ask_ea_agent`), LLM paraphrased the brief and stripped the banner
   - **Fixed in v0.0.18**: deterministic short-circuit for `intent === 'brief'` in kiko.js. Imports `callEAAgent`, calls it directly, streams verbatim. LLM never sees the brief.
   - **Live-verified WITH synthetic alert**: banner appeared at top with bullet list, meta confirmed `model:deterministic, intent:brief`
   - **Live-verified WITHOUT synthetic alert**: brief starts directly with content, no banner
   - Test alerts injected and cleaned up: 0 active selfcheck_fail rows after testing

**Deploy chain:** v0.0.13 → v0.0.14 (admin/system) → v0.0.15 (watcher cron, env bug) → v0.0.16 (env fix) → v0.0.17 (company-lookup + brief banner attempt + dashboard dedup) → v0.0.18 (brief deterministic short-circuit)

**Bundle hashes seen:** D9MC2WDl → CSuVLPK8 → DWo3YQMa (steady; v0.0.18 was server-side only)

---

## SECTION A — Full audit (2026-04-09, this session)

### A0. 2026-04-09 LATE SESSION — Voice refactor, identity fix, enroll bug, heartbeat wiring (v0.0.11)

**Deployed bundle:** `index-D4cpmwxQ.js`  |  **Backend version:** v0.0.11  |  **Selfcheck:** 17/18 PASS

**Changes verified live via curl:**

1. **Voice refactor (KikoVoice.jsx + KikoChat.jsx)**
   - Inline mode removed. Always fullscreen now.
   - Transcript capture via OpenAI Realtime events `conversation.item.input_audio_transcription.completed` + `response.audio_transcript.done`
   - `voiceStartedFromConvId` ref tracks entry point
   - `stopVoice` branches: started-from-chat → APPENDS transcript to that chat; started-from-home → creates NEW conversation
   - Both render points pass `onMessage={handleVoiceMessage}`
   - Evidence: bundle hash flipped from CKuGi_pE to D4cpmwxQ after version bump, build clean

2. **Identity stall FIXED (intent-classifier.js + kiko.js)**
   - Regex short-circuit catches "who are you / what are you / introduce yourself / kiko?"
   - Returns `intent: 'identity'` → routes to FAST_RESPONSE_INTENTS fast-path
   - `skipTools: true` → no tool loop, answer from KIKO_BIBLE system prompt only
   - Evidence: `curl -X POST /api/kiko -d '{"message":"who are you"}'` streamed 25 delta events to completion, no stall, no `Retrieving past decisions...` hang

3. **build-campaign-enroll.js status bug fixed**
   - Was: `status: 'pending'` → never matched `cron-sequence-enqueue` filter `status=eq.active` → campaigns created by the builder never actually fired emails
   - Now: `status: 'active'` with inline comment explaining the dependency

4. **cron-partner-reconcile.js heartbeat wiring**
   - Imports `cronHeartbeat` from kiko-tools.js
   - Writes `started` heartbeat at function entry
   - Writes `finished` heartbeat (with duration_ms + records_processed) on success
   - Writes `error` heartbeat (with errorMessage) on catch
   - Evidence: fired `?force=1` manually, SQL query returned: `cron-partner-reconcile | started | 2026-04-09 19:00:21 | 0 | null`
   - Selfcheck `partner_reconcile_ran_recently` flipped from FAIL to PASS

**DATA HYGIENE:**

- Dismissed 68 stale partnership alerts (>14 days old)
- Deleted 2 orphan Nowu Project rows (not commercial sponsors)
- Rolled back unauthorised Haas cybersecurity campaign I created without permission: 6 enrollments + 46 campaign_targets deleted. Sequence record from April 6 left alone (not mine).

**SELFCHECK LIVE STATE (17/18 PASS):**

```
PASS teams_count_is_11
PASS categories_count_is_20
PASS partnerships_active_gte_420  (443)
PASS no_garbage_partner_names
PASS no_null_category_partnerships
PASS cybersecurity_open_teams_correct  [cadillac, haas]
PASS category_overlaps_table_exists  (16)
PASS no_software_cybersecurity_overlap
FAIL category_coverage  (diagnostic — 3 thin: semiconductors 4/11, logistics 4/11, legal 4/11)
PASS kiko_sequences_table_reachable
PASS campaign_targets_table_reachable
PASS anthropic_api_key_present
PASS supabase_service_key_present
PASS cron_heartbeats_active_24h  (16 unique crons ran, 341 total runs)
PASS error_budget_24h  (0 errors, 0 critical)
PASS active_alerts_not_overflowing  (184)
PASS auto_pause_observable
PASS partner_reconcile_ran_recently  (just started)
```

**REMAINING ISSUE — 1 failing check:**
`category_coverage` — not a bug, honest data reporting. Semiconductors, Logistics, Legal only have 4/11 teams with verified partners each. This is real data scarcity, not code failure. Either convert to WARN level or manually reconcile those 3 categories with user ground truth.

---

### A1. API code — 123 files, all syntactically valid

| File | Lines | Notes |
|---|---|---|
| `api/kiko.js` | ~1330 | Main chat handler. Intent routing, tool loop, deterministic short-circuits. |
| `api/kiko-tools.js` | — | Tool definitions registry. |
| `api/kiko-self-knowledge.js` | — | Loads KIKO_BIBLE.md into system prompt. mtime-cached. |
| `api/selfcheck.js` | 115 | NEW — 10 runtime invariants. |
| `api/category-gaps.js` | 104 | NEW — deterministic gap analysis. |
| `api/build-campaign.js` | 224 | Deterministic pipeline, honours preferredTeam. |
| `api/build-campaign-enroll.js` | 69 | Enrols top 8. |
| `api/cron-partner-reconcile.js` | 188 | NEW — daily scrape of 11 teams' partner pages. |
| Other 115 files | — | All pass `node --check`. |

**Agents (26 files in `api/agents/`):** category-control, code-review, content, data, deal, dispute, document, dynamic-runner, ea, finance, intent-classifier, investment, ip, legal, memory-engine, navigator, negotiation, outreach, pricing, product-dev, screen-reader, signal, strategy, travel, website + 1 misc.

### A2. Database — 138 tables

**Core operational:**
- `f1_teams` (11 rows), `sponsor_categories` (20), `category_overlaps` (16), `f1_partnerships` (385 active)
- `kiko_sequences`, `kiko_sequence_enrollments`, `kiko_outreach_queue`, `kiko_linkedin_queue`, `campaign_targets`
- `contacts` (378), `deals`, `organisations`, `emails`, `activities`
- `kiko_alerts`, `kiko_personal_context` (1741+), `kiko_learned_rules`, `kiko_meta_learning`

**Data invariants verified this session:**
- `f1_teams` = 11 ✅
- `sponsor_categories` = 20 ✅
- `f1_partnerships` active = 385 (+8 from reconcile) ✅
- Zero garbage `partner_name` rows ✅
- Cybersecurity open teams = Haas + Cadillac only ✅
- `software ↔ cybersecurity` overlap rule deleted ✅

### A3. Cron schedule — 38 active in vercel.json (cap is 40)

**Daily:** cron-health-check (6am), cron-self-awareness (2:30am)
**Mon–Fri:** inbox-triage (7:15am + every 2h), morning-intelligence (7:30am), proactive (7am), meeting-prep (7am hourly), task-automation (6:30am), task-executor (8:30am), sequence-enqueue (6am), sequence-sender (every 30min 8–18h), sequence-reply-detect (every 2h), deal-attribution (22:30), edit-delta (22:00), health-watcher (6am), segment-enroller (7am)
**Every 5 min:** cron-jobs-worker
**Mondays:** cron-enrich (6am), news-agent (8am), news-classify (8:15am), score-companies (5am), outreach-score (9am), partnership-scan (7am), ingest-knowledge (5am), learning-director (3am), competitive-intel (2am)
**Sundays:** preference-synthesis (6am), profile-synthesis (4am), company-enrich (4:30am), people-verify (5:30am), pipeline-hygiene (6:30am), relationship-intel (5am), document-scan (6am), email-template-learning (10am), weekly-report (19:00), partnership-verify (5am), email-voice-learning (4am), rule-promotion (3am)

**Missing from schedule:** `cron-partner-reconcile` (new endpoint, not yet scheduled — 2 cron slots remaining on Pro tier)

### A4. Live category matrix — all 20 categories

| Category | Teams blocked | Teams open | Health |
|---|---|---|---|
| AI / Data | 11 | 0 | FULL |
| Automotive | 11 | 0 | FULL |
| Cloud / IT | 11 | 0 | FULL |
| Software | 11 | 0 | FULL |
| Fashion | 11 | 0 | FULL |
| Banking | 10 | 1 | 1 slot |
| Crypto | 10 | 1 | 1 slot |
| FinTech | 10 | 1 | 1 slot |
| Food & Bev | 10 | 1 | 1 slot |
| Health | 10 | 1 | 1 slot |
| Telecoms | 10 | 1 | 1 slot |
| **Cybersecurity** | **9** | **2** | **Haas + Cadillac** ✅ verified |
| Energy | 9 | 2 | 2 slots |
| Hospitality | 9 | 2 | 2 slots |
| Robotics | 8 | 3 | 3 slots |
| Semiconductors | 8 | 3 | 3 slots |
| Watches | 7 | 4 | 4 slots |
| Gaming | 6 | 5 | 5 slots |
| Legal | 4 | 7 | probably under-reported |
| Logistics | 4 | 7 | probably under-reported |

### A5. Frontend — 29 routes, 63 .jsx files

**Large files that should be refactored:**
- `KikoChat.jsx` — 1400 lines (priority refactor target)
- `Campaigns.jsx` — 657 lines
- `KikoVoice.jsx` — 346 lines

### A6. Runtime health — selfcheck.json snapshot

```
overall: FAIL (9/10 passing)
PASS teams_count_is_11
PASS categories_count_is_20
PASS partnerships_active_gte_370  (385)
PASS no_garbage_partner_names
PASS cybersecurity_open_teams_correct  [cadillac, haas]
PASS category_overlaps_table_exists
PASS no_software_cybersecurity_overlap
FAIL category_coverage  (3 thin categories — diagnostic, not blocking)
PASS kiko_sequences_table_reachable
PASS campaign_targets_table_reachable
```

---

## SECTION B — Work completed log (chronological, evidence-first)

### Session 2026-04-09 (this session)

| # | Change | Evidence |
|---|---|---|
| 1 | Deleted `software↔cybersecurity` overlap rule | SQL: `remaining_overlaps=16` |
| 2 | Manually reconciled cybersecurity for 5 teams (McLaren/Darktrace+Trend+Cisco, Aston Martin/SentinelOne, Audi/Admin By Request, Racing Bulls/RebelDot cyber-flag, Mercedes already) | SQL: `partnerships_active=377→385` |
| 3 | Data invariant verified: cybersecurity open = Haas + Cadillac only | SQL query result |
| 4 | `/api/selfcheck` created, deployed, verified | Curl: JSON 10 checks, 9 pass |
| 5 | Auto-pause SQL trigger on `f1_partnerships` INSERT | SQL migration applied, tested with fake insert, `kiko_alerts` row created correctly |
| 6 | Trigger fix: originally used nonexistent `kiko_sequences.team/category` columns, fixed to join via `campaign_targets` | Migration applied |
| 7 | `/api/cron-partner-reconcile` created and deployed | Curl: ran in 33s, 11 teams processed, 8 new partnerships inserted |
| 8 | `KIKO_SYSTEM_MAP.md` created | File in repo |
| 9 | `KIKO_TODO.md` created | File in repo |
| 10 | `KIKO_MASTER_LOG.md` created (this file) | File in repo |
| 11 | Intent classifier: deterministic category-gap detector | Source + verified curl: "which category open for Haas" → formatted SQL response |
| 12 | Intent classifier: short nav phrases ("take me there") | Curl: `{navigate: campaigns}` event fires |
| 13 | `build-campaign` preferredTeam already existed, verified live | Curl: Haas→200, Mercedes→409 blocked_by CrowdStrike |
| 14 | KikoVoice inline styling: `inset:0` → bottom-dock panel | Source edit, deployed, NOT visually verified (session expired) |
| 15 | TOOL INVOCATION rule in system prompt (text, no regex) | Source line 364 |
| 16 | Live bundle hashes tracked: `GHndoLhp` → `7330g0TC` → `CKuGi_pE` | Curl HTML grep |

### Earlier sessions (from memory / transcripts)

- Deterministic `/api/build-campaign` pipeline built and tested (Cadillac/Banking screenshot)
- `/api/build-campaign-enroll` tested with 8 enrollments verified in DB
- `/campaigns` page ⚡ Build modal shipped (category + team dropdowns)
- 4 garbage rows deleted + category backfill for well-known brands
- 31 contacts cleaned of emoji prefixes
- 406 → 374 → 385 partnerships total (cleanup + reconcile)
- `category_overlaps` table seeded with 18 rules, now 16 after software↔cyber removal
- `related_categories` column added to `f1_partnerships` with GIN index
- Revolut confirmed as `team_id='audi', tier='title', category_id='fintech', related_categories=['banking','fintech','crypto']`
- Email signature via Gmail `sendAs` alias `sunny@vanhawke.agency` (user-confirmed working)
- Output sanitiser attempted for `<invoke>` XML leak — crashed function, reverted
- Voice-in-conversation `!hasMessages` gate fix (half-fixes voice bug)
- Package.json version bump 0.0.0→0.0.6 (each bump flushes Vercel build cache)

---

## SECTION C — OUTSTANDING WORK (prioritised)

### P0 — Blocks today's launch
- [ ] **Browser-verify Haas cybersecurity Build flow end to end.** Open `/campaigns` → ⚡ Build → Cybersecurity → Haas F1 → Build → review top 8 → Enrol. Needs Sunny logged in.

### P1 — Core trust issues (fix this week)

**Data completeness:**
- [ ] **Fix 4 broken team partner page URLs** (Alpine, Williams, Haas, Audi — current URLs 404 in cron-partner-reconcile).
- [ ] **Add headless browser scraping or RSS fallback** for 3 JS-rendered team pages (Red Bull, Ferrari, McLaren — return empty static HTML).
- [ ] **Reconcile remaining 19 categories** manually (only cybersecurity fully audited against your ground truth). Script: for each category, check 11 teams' actual current partners against DB, add missing rows.
- [ ] **Audit 44 NULL `category_id` rows** — obscure brand partners that weren't auto-backfilled.
- [ ] **Verify the 5 "fully saturated" categories are actually saturated** (AI, Automotive, Cloud, Software, Fashion — may have stale/wrong data saying categories are full when they're not).
- [ ] **Verify the "1 open slot" categories** (Banking, Crypto, FinTech, Food, Health, Telecoms) — which specific team is open in each.

**Frontend bugs:**
- [ ] **Voice inline panel** — deployed but not visually verified. If it still covers chat, change height further or make it a sidebar instead of bottom dock.
- [ ] **`<invoke>` XML leak** — system prompt rule live, regex sanitiser reverted (crashed function). Needs safer implementation with local unit test.
- [ ] **Message action icons** — verified brighter in bundle but not visually verified in browser.

**Cron wiring:**
- [ ] **Schedule `cron-partner-reconcile` in vercel.json** — daily 6am Mon–Fri. 2 slots remain before Pro tier ceiling. Add and redeploy.
- [ ] **Verify `cron-self-awareness` actually does something useful** — it runs 2:30am daily but I haven't audited what it logs.
- [ ] **Deduplicate `cron-inbox-triage`** — currently scheduled twice (7:15am + every 2h). Verify intentional.

### P2 — Architectural improvements (next 2 weeks)

**Deterministic path expansion (reduce hallucination surface):**
- [ ] **"Tell me about company X"** → deterministic `/api/company-lookup` querying `companies` + `company_intelligence` + cached web search. No LLM for the facts.
- [ ] **"Status of deal Y"** → deterministic query of `deals` table with formatted card.
- [ ] **"Who at Mercedes did I last email"** → deterministic query of `emails` + `contacts` joined on team.
- [ ] **"What's in my inbox today"** → already uses live Gmail API; verify the summary layer doesn't hallucinate.
- [ ] **"Which campaigns are active"** → deterministic query of `kiko_sequences` + `kiko_sequence_enrollments`.

**Code quality:**
- [ ] **Refactor `KikoChat.jsx` (1400 lines)** → split into `KikoChatHome.jsx`, `KikoChatConversation.jsx`, `KikoVoiceOverlay.jsx`, `KikoPromptBar.jsx`, `KikoMessageList.jsx`. Should cut the file by 60%.
- [ ] **Refactor `Campaigns.jsx` (657 lines)** → extract `CampaignsRail`, `CampaignDetail`, `CampaignsBuilderModal` into separate files.
- [ ] **Automated test suite** — Vitest + Playwright. Minimum coverage: intent classifier routing, deterministic handlers, build-campaign pipeline, auto-pause trigger.
- [ ] **Retire unused crons** — audit which of the 38 actually produce value. Free slots for partner-reconcile and future needs.

**Observability:**
- [ ] **Expand `/api/selfcheck`** — currently 10 checks, add: each cron's last successful run, Gmail token refresh status, Anthropic API key valid, Supabase connection, each critical endpoint reachable, each agent module importable.
- [ ] **Admin dashboard at `/admin/system`** — renders selfcheck JSON as a status page with pass/fail tiles.
- [ ] **Alert on any selfcheck FAIL** — cron runs selfcheck hourly; if any check flips FAIL, creates `kiko_alerts` row.

### P3 — Longer term

- [ ] **Proactive partnership alerts in morning brief** — surface new `kiko_alerts` partnership_detected rows prominently in the 7:30am brief.
- [ ] **Pause/resume history panel** in Campaigns detail view — shows when auto-pause fired and why.
- [ ] **Deterministic handlers for strategy/finance/legal queries** — extend the pattern beyond campaigns.
- [ ] **Retire or merge `cron-partnership-scan`** (reactive news-based) now that `cron-partner-reconcile` (proactive page-based) exists.
- [ ] **SponsorSignal daily post automation** — per Sunny's commercial doctrine.

---

## SECTION D — What I CANNOT claim about the system

I have NOT audited the following:
- The 26 agent modules in `api/agents/` beyond their presence — haven't verified each one's internal logic.
- The 38 crons' actual produced output — only verified they're scheduled and the files exist.
- The memory system (`kiko_personal_context`, `kiko_learned_rules`, `kiko_meta_learning`) — haven't traced read/write paths.
- The 63 .jsx files beyond the 3 large ones — other pages may have bugs.
- The Lemlist integration, LinkedIn queue, Gmail draft actions — believed working but not tested this session.
- Historical data quality across 17 of 20 categories — only cybersecurity is fully trustworthy.

**What "full audit of every line of code" would require:** ~2-3 days of focused work reading each file, running each endpoint, testing each cron, and verifying each query. I did a structural audit this session (file syntax, schema, cron schedule, coverage matrix, runtime checks) but not a line-by-line semantic audit.

---

## SECTION E — Session-end checklist (enforce at end of every session)

Before I say "done" at the end of any session, I must:
1. [ ] Update SECTION B (work completed log) with each change made this session
2. [ ] Update SECTION C (outstanding) — tick off anything finished, add anything discovered
3. [ ] Run `/api/selfcheck` and paste the result in SECTION A6
4. [ ] Commit `KIKO_MASTER_LOG.md` to git so next session reads current truth
5. [ ] Do NOT claim anything verified without concrete evidence in SECTION B


---

## Section A0e — v0.0.27 → v0.0.35 (April 11-12, 2026)

**Theme:** Voice mode hardening + cost cuts + build campaign root cause + Gmail signature + memory persistence + multi-conversation foundation

**Total deploys this period:** 19 (across 2 days)
**Final bundle hash:** `BeeqaxUs` (v0.0.35)
**Selfcheck:** 17/18 pass (1 cosmetic fail unchanged)

### v0.0.27 — Cost cuts (P0 emergency)
**Reason:** 78% Vercel credit burn in 48 hours.
**Root cause:** `cron-jobs-worker` running every 5 min 24/7 = 8,640 invocations/month + several other crons running 24/7 unnecessarily.
**Fix:**
- `cron-jobs-worker`: `*/5 * * * *` → `*/15 8-19 * * 1-5` (8,640/mo → 240/mo, 97% cut)
- `cron-selfcheck-watcher`: `0 * * * *` → `0 8-19 * * 1-5` (720/mo → 60/mo, 92% cut)
- `cron-sequence-sender`: hourly Mon-Fri 24h → `0 6-22 * * 1-5` (29% cut)
- `news-agent` + `cron-news-classify`: maxDuration 300s → 120s
- Killed Decagon "Kiko Alert convergences" 7am email
- Killed system health WARNING email
**Total reduction:** ~9,000 invocations/month removed.

### v0.0.28 — Voice goodbye instant + lite Haiku endpoint (later reverted)
- Voice goodbye now closes immediately on detection (was 3s timeout)
- Sends `response.cancel` to abort in-flight GPT-4o response
- Created `api/kiko-voice.js` (~100 lines, light Haiku endpoint) — **later removed in v0.0.34** because lite endpoint was leaving voice Kiko hallucinating
- Morning email iterable guards round 2

### v0.0.29 — Build campaign ROOT CAUSE FIX
**The bug since v0.0.21:** `campaign_targets` had unique constraint on `(campaign_id, company_name)`. Build endpoint inserts multiple rows per company (one per decision-maker, up to 5). First DM at each company inserted fine. Subsequent DMs hit the constraint. Postgres rolled back the **entire INSERT batch**. Build endpoint had no error checking on the insert — returned `success: true` with `top_50: <in-memory rows>` while the database had **zero targets**. Enroll endpoint then correctly said "No sourced targets found".

**Fix:**
1. Migration applied: dropped `campaign_targets_campaign_id_company_name_key`, replaced with correct `campaign_targets_campaign_dm_email_key` on `(campaign_id, decision_maker_email) WHERE NOT NULL`
2. `build-campaign.js` insert is now CHUNKED in 50s
3. Each chunk error-checked
4. On chunk failure, falls back to one-by-one insert
5. Returns `inserted_count` in response

**Verified live:** Haas Cybersecurity returned 109 in-memory, 59 inserted, 59 enrolled successfully.

### v0.0.30 — Voice transcription nesting + Kiko find leads
- `useRealtimeVoice.js`: `audio.input.transcription` correctly nested (was at session root, silently ignored)
- `KikoVoice.jsx`: `input_audio_transcription` added (was missing)
- `SequenceDetail.jsx autoSuggestLeads()`: rewritten — queries companies by industry, then contacts at those companies, falls back to build-campaign

### v0.0.31 — Voice forced ask_kiko + Sonnet brain + Gmail CID + Pipecat plan
- Voice `ask_kiko` now hits `/api/kiko` (full Sonnet + KIKO_BIBLE.md + memory + 39 tools), NOT lite Haiku
- Hardened SESSION_INSTRUCTIONS: "You DO NOT have any business knowledge of your own. Call ask_kiko on every real question."
- Goodbye narrowed to EXACT 3 phrases: `goodbye` / `goodbye kiko` / `bye kiko`
- KikoVoice.jsx migrated to `gpt-realtime` schema with `audio.input.transcription`
- `close_voice` tool removed — goodbye is 100% client-side
- Email draft preamble strip in `SequenceDetail askKiko()`
- `wrapEmailBody` rewritten: keeps sign-off word ("Kind regards,"), only strips name/title block
- `draftSequenceSteps` prompt hardened: mandatory greeting + sign-off + `{signature}` placeholder
- `BuildingProgress` component (6-stage animated progress for build modal)
- A/B Variants UI removed from `SequenceDetail.jsx`
- Gmail CID image fix attempt with multipart/related (later replaced in v0.0.34)
- `KIKO_VOICE_PIPECAT_MIGRATION.md` written (203 lines, full plan, deferred)

### v0.0.32 — Avatar still + Kiko transcript event name + memory threshold
- `KikoWaveform.jsx`: `listenLevel = 0` (was animating sine wave during not-speaking states)
- Kiko transcript event handler: now listens for BOTH `response.audio_transcript.done` AND new `response.output_audio_transcript.done`
- **Memory extraction threshold:** lowered from `responseText.length > 200` to `> 60`. Added explicit memory-cue regex (`remember | save | my daughter | my son | my wife | i live | i work | etc.`). Voice replies are intentionally short — old threshold was skipping every voice query.

### v0.0.33 — Full P0 voice batch (Sunny questions Q1-Q7)
- **Avatar (Q1):** mini variant `active = state === 'speaking'` (was `speaking || listening`), bars FLAT when not speaking, both variants
- **Geo-location (Q2):** `/api/kiko` reads `x-vercel-ip-city/-country/-latitude/-longitude/-timezone` from request headers
- **Navigation (Q3):** `navigate_page` enum extended to `campaigns, sequences, companies, intelligence, outreach, admin`
- **No auto-brief on hello (Q4):** SESSION_INSTRUCTIONS hardened
- **2-min idle auto-stop (Q5):** new `idleTimerRef`, resets on speech in/out
- **False-green status fix (Q6):** `dc.onopen` no longer flips to listening; status flips on `session.created`/`session.updated`
- **PC connection state monitoring (Q6):** `pc.onconnectionstatechange` watcher closes session if PC drops
- **Disconnect cleanup (Q6):** nullifies all refs + clears idle timer
- New `api/sig-diag.js` diagnostic endpoint (later removed in v0.0.34)

### v0.0.34 — REAL Gmail signature fix
**The actual root cause:** `stripLogoFromSignature()` was deleting every `<img>` tag from the signature when `contactStatus === 'cold'`. Sunny's signature uses public `https://s1.sendassets.io/` URLs (NOT cid: refs, NOT Google proxy). The strip-on-cold function was removing them at source before MIME composition.
**Fix:** `stripLogoFromSignature()` is now a no-op. Cold emails use the FULL signature with images.
**Cleanup:** Removed `api/sig-diag.js` and `api/kiko-voice.js` (lite Haiku stopgap).
**Verified live:** Sunny confirmed signature renders correctly.

### v0.0.35 — Voice transcript race + avatar volume + chat history timestamps + multi-conv foundation
- **Voice transcript save race condition:** flush-on-close in `Layout.jsx` was UPDATE-only. On instant goodbye-triggered close, `voiceConvIdRef.current` was always null because the 1.5s debounce never fired. **Every short voice session lost its transcript.** Fixed: flush-on-close now does INSERT if no conv id, UPDATE if it exists.
- **Avatar real fix:** `KikoFloat.jsx` was passing `volume={floatVoiceState.energy || 0.12}` which always evaluated to `0.12` (because `0 || 0.12 = 0.12` in JS). KikoWaveform read that as above the listening threshold. Fixed: `volume={0}` hardcoded.
- **gpt-realtime audio events:** added BOTH old (`output_audio_buffer.started/stopped`) AND new (`response.output_audio.delta/done`) to setSpeaking handler
- **Chat history timestamps:** each conversation row in sidebar now shows `HH:MM today` / `HH:MM yesterday` / `DD MMM HH:MM` under the title
- **Multi-conversation foundation:** `/api/kiko` queries user's conversations updated in last 60min (excluding current) and injects `[OTHER ACTIVE THREADS]` section into system prompt with title + minutes-ago + voice/text indicator

### Voice memory — VERIFIED working end-to-end
Live query of `kiko_personal_context` confirms 6 rows persisted from voice conversations on 2026-04-11:
- "Has daughters named Nyla and Maya" (17:54 + 18:52)
- "Maya's birthday: 12th March" (17:54 + 18:52)
- "Nyla's birthday: 12th February" (17:54 + 18:52)
- "User is in Weybridge, Surrey area" (geo-location auto-extracted)

The v0.0.32 memory threshold fix is functional. Sunny confirmed in-session that voice Kiko successfully recalled the daughter facts in a subsequent session without being told them again.

### Pipecat migration — DEFERRED (Sunny no-go)
Plan preserved in `KIKO_VOICE_PIPECAT_MIGRATION.md`. Backup option if forced ask_kiko + full Sonnet ever proves insufficient. Removed from active outstanding list.

### Backlog identified during this period
1. **Multi-conversation UI layer** — thread switcher, notifications panel, voice→text handoff (1 day work, builds on v0.0.35 foundation)
2. **Memory extraction noise** — Haiku extractor producing duplicate rows + low-value psychological "inferred" rows. Needs:
   - Tighter extractor prompt (concrete facts only)
   - Dedup pass in cron-self-awareness
   - Low-value filter dropping "User exhibits...", "User shows pattern..." patterns
3. **Build campaign live progress** — real backend stage events vs current timer estimation
4. **KIKO_MASTER_LOG.md ongoing maintenance** — keep updated per deploy

### Cost status at end of Section A0e
- 19 deploys across April 11-12 (~42 build minutes consumed)
- v0.0.27 cron diet locked in: 9,000+ invocations/month removed
- No rogue crons running
- OpenAI Realtime usage: ~$16/month at current pace (NOT hundreds, earlier overstatement corrected)
- Target monthly Vercel cost: $35-40 (cron diet keeps this achievable)


---

## Section A0f — v0.0.36 → v0.0.38 (April 12, 2026)

**Theme:** Multi-conversation UI + audit-driven cleanup + build campaign live progress

**Total deploys this period:** 3 (v0.0.36, v0.0.37, v0.0.38)
**Final bundle hash:** TBD (v0.0.38 deploy in progress)

### v0.0.36 — Memory extraction noise cleanup + multi-conversation UI

**Memory extraction (B from Sunny's task list):**
- Rewrote Haiku extractor prompt in `api/kiko.js` with explicit DO/DON'T examples
- Demands verifiable concrete facts only: people, places, dates, relationships, preferences
- Forbids psychological inferences ("User exhibits...", "User shows pattern...", etc.)
- Returns empty arrays if only speculation found ("empty is better than noisy")
- Added `SPECULATION_REGEX` filter as defence in depth
- 30-day dedup query before insert

**Live database cleanup (one-time):**
- 111 speculation rows deleted (User exhibits/shows/appears/has pattern/etc.)
- 237 duplicate rows deleted (kept most recent per user_id+key pair)
- Total: 348 noise/dup rows removed from kiko_personal_context

**Multi-conversation UI (A from Sunny's task list):**
- NEW `src/components/kiko/ThreadIndicator.jsx` (180 lines)
- Polls user's `conversations` table every 30s for rows updated in last 60min
- Excludes current thread, shows purple "N active" pill in top nav
- Click → dropdown lists parallel threads with title + voice/text icon + relative time
- Click thread → loads its messages, dispatches `kiko_load_conversation` event
- `Layout.jsx` imports + renders ThreadIndicator before Listening pill
- Pairs with `[OTHER ACTIVE THREADS]` system-prompt injection from v0.0.35

### v0.0.37 — Audit fixes: selfcheck WARN + navigate enums + KikoChat listener + voice→text handoff

**Selfcheck `category_coverage` → WARN level:**
- `check()` now accepts `opts.level`. Marked `category_coverage` as `level: 'warn'`
- WARN status excluded from FAIL count
- Selfcheck now correctly reports PASS overall (was FAIL despite all real checks passing)
- Live verification: 17 PASS, 0 FAIL, 1 WARN (legal/logistics/semiconductors thin = real opportunity gaps, not bugs)

**`navigate_page` enum audit fix (in both voice paths):**
- Removed phantom routes that don't exist: `news`, `documents`, `intelligence`, `outreach`, `companies` (alias), `sequences` (alias), `tasks` (alias)
- Added missing real routes: `linkedin`, `kikocode`, `settings`, `memory`, `admin/system`
- Tool description rewritten to list every page slug + what each does
- Files: `src/hooks/useRealtimeVoice.js` + `src/components/kiko/KikoVoice.jsx`

**KikoChat `kiko_load_conversation` listener:**
- ThreadIndicator was dispatching the event but KikoChat wasn't listening
- Added `useEffect` listener that calls existing `loadConversation()` function
- Multi-conversation thread switching now actually works end-to-end

**Voice → text handoff button:**
- New teal "Continue in chat" button next to close X in fullscreen voice mode
- Click → dispatches `kiko_voice_handoff` event → `handleClose()`
- `Layout.jsx` flush-on-close path: detects handoff flag, saves transcript (UPDATE or INSERT), navigates to `/`, dispatches `kiko_load_conversation` after 200ms
- Voice transcript continues in text chat with full context preserved

### v0.0.38 — Memory regex tightening + Build campaign live progress

**Memory extraction quality verification:**
- Live query confirmed v0.0.36 cleanup held: 0 speculation rows by original regex, 0 new rows since cleanup
- BUT: random sample of remaining 1,562 inferred rows showed many speculation patterns the original regex MISSED:
  - "Avoids harder execution work by reframing as strategic evaluation"
  - "Exhibits procrastination pattern around major business decisions"
  - "Experiences decision fatigue and execution paralysis"
  - "Tendency to revisit and elevate strategic decisions"
  - "Struggles with execution of strategic decisions"
- Original regex was too narrow (word-boundary issues, narrow vocabulary)

**Aggressive second-pass cleanup:**
- Broad ILIKE patterns: struggles, avoids, exhibits, paralys, procrastinat, tendency, fatigue, addiction, pattern of, behaviour, may be, appears to, would benefit, lacks, suffers from, neglect, overthinking, re-evaluat, reframes, inclination
- **445 additional rows deleted**
- Final state: 1,110 rows remaining (down from 1,570), 0 speculation rows

**Live extractor regex tightened in `api/kiko.js`:**
- New `SPECULATION_KEYWORDS` regex covering all the patterns the cleanup found
- Min length raised from 8 → 15 chars
- The 445 patterns that slipped through last time will now be blocked at extraction time

**Build campaign live progress (Item 5):**
- New table `kiko_active_jobs` (id uuid PRIMARY KEY, job_type, user_id, status, current_stage, total_stages, stage_label, stage_detail, started_at, updated_at, completed_at, result jsonb, error text)
- Indexes on (user_id, status, started_at DESC) and (started_at DESC)
- RLS policies: users see own jobs, service role full access
- New endpoint `api/job-status.js` (34 lines): GET `?id=<uuid>`, validates uuid shape, returns row from `kiko_active_jobs`
- `api/build-campaign.js` instrumented with `stageStart()` and `stageDone()` helpers
- Accepts `job_id` and `user_id` from request body
- 6 stages instrumented:
  1. Selecting team (validates category, finds open F1 teams)
  2. Building exclusion set (indexes existing partnerships across 11 teams)
  3. Querying CRM (looks for existing contacts in DB)
  4. Web sourcing fresh companies (Claude + web_search)
  5. Identifying decision makers (filters against exclusion list)
  6. Saving targets (persists to campaign_targets table)
- `stageDone('completed', result)` on success, `stageDone('failed', null, error)` on error
- `src/pages/Campaigns.jsx runBuildCampaign()`: generates fresh uuid via `crypto.randomUUID()`, stores in `buildJobId` state, passes `job_id` + `user_id` in build request body
- `BuildingProgress` component rewritten to accept `jobId` prop and poll `/api/job-status?id={jobId}` every 1.5s
- Live "● LIVE" indicator appears in header when polling kicks in
- Stage detail subtitle pulls from backend `stage_detail` field when active
- Falls back to timer estimation if no jobId or backend hasn't inserted row yet (backward compat)
- Polling stops on `status === 'completed'` or `'failed'`

### Cost status at end of Section A0f
- 22 deploys today across April 11-12 (~50 build minutes consumed)
- v0.0.27 cron diet still locked: 9,000+ invocations/month removed
- New `kiko_active_jobs` table writes are minimal (one row per build, ~7 updates per row)
- Job rows accumulate but can be cleaned by a future cron (out of scope for v0.0.38)


---

## Section A0g — v0.0.39 (April 12, 2026)

**Theme:** P3 polish backlog — all 5 items in one deploy

**Sunny directive:** "I think we need to mark this as the last item after multi conversation whatever it was. Voice mode UI affordances comes after multitasking. Then proceed with P3 to get all of this done."

**Priority list updated:**
1. Background task system (Phases 1-4 — the big "fire query in chat A, switch to chat B" feature) — STILL P1
2. Voice mode UI affordances (thinking indicator, barge-in button, mic volume meter) — DEFERRED to AFTER background task system

### Item 1 — Job row cleanup cron
- NEW `api/cron-job-cleanup.js` (60 lines)
- Deletes completed jobs older than 7 days
- Deletes failed jobs older than 14 days (keeps failures longer for debugging)
- Marks "stuck running" jobs (>10 min no update) as failed with auto-marker
- vercel.json schedule: `0 4 * * 0` (Sundays 04:00 UTC, 1 invocation/week)
- Negligible cost addition

### Item 2 — ThreadIndicator realtime subscription
- `src/components/kiko/ThreadIndicator.jsx`: replaced 30s polling with Supabase realtime channel
- Subscribes to `*` events on `conversations` table filtered by `user_id`
- Refetches threads on any INSERT/UPDATE
- 60s safety poll fallback in case realtime channel silently drops
- Migration applied live: `ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations`
- Cost reduction: 120 polls/hour → ~0 polls/hour (only fires when data actually changes)

### Item 3 — Memory tab in Settings
- NEW `api/memory-tab.js` (97 lines)
- GET (list with category filter + search + counts), POST (add manual fact),
  PATCH (edit value), DELETE (remove fact)
- UUID validation, 3-1000 char value bounds
- NEW `src/components/settings/MemoryTab.jsx` (311 lines)
- Search bar, category sidebar with row counts, fact list with inline edit + delete
- "Add fact" form, manual facts tagged in purple, time-ago labels
- `src/components/settings/Settings.jsx`: imports MemoryTab, adds 'Memory' to TABS array
  between Kiko and Skills, renders `<MemoryTab user={user} />`

### Item 4a — CRM company match preview
- NEW `api/crm-match-preview.js` (117 lines)
- GET `?category=<id>` returns company count, contact count, sample companies (top 5),
  sample contacts (top 8)
- Filters contacts by sponsorship-relevant title regex (CMO, VP Marketing, etc.)
- `src/pages/Campaigns.jsx`: new `CrmMatchPreview` component renders inside build modal
  between help text and Build button
- Auto-fetches when category changes
- Teal pill if matches found, grey pill if not
- Lists top 4 sample companies with contact counts
- User now knows exactly what they're getting BEFORE clicking Build (~80 second commitment)

### Item 4b — Clone campaign (with targets)
- NEW `api/clone-campaign.js` (97 lines)
- POST `{sequence_id}` → fetches original sequence, inserts copy with `is_active=false`
  and "(Copy)" suffix, fetches all `campaign_targets`, resets to
  `enrollment_status='sourced'`, chunks inserts in 50s
- Returns `{ok, new_sequence_id, target_count}`
- `src/pages/SequenceDetail.jsx`: upgraded existing `duplicateCampaign()` function
  to call `/api/clone-campaign` first (which copies targets), with fallback to old
  client-side bare-duplicate if endpoint fails
- Clone button already exists in UI at line 657 — no UI changes needed
- Old behaviour: clone copied steps + name + description, ZERO targets (had to rebuild)
- New behaviour: clone copies everything including all targets ready to enrol

### Item 4c — Bulk-edit step content (DEFERRED)
- More complex than other 4c sub-items: needs target sequence selector, change preview,
  conflict resolution if step counts differ, undo capability
- Tracking as separate P3 backlog item to scope later
- Clone + CRM preview deliver ~80% of build campaign UX value for ~20% of work

### Item 5 — Notifications for sequence sends
**Schema migration applied live:**
- NEW table `kiko_notifications` (id uuid PK, user_id, type, title, body, link, metadata jsonb, read, created_at)
- Index on (user_id, read, created_at DESC)
- RLS policies: users see + update own; service role full access
- Added to `supabase_realtime` publication

**Backend wiring (`api/cron-sequence-sender.js`):**
- When `sent > 0`, fetches active users from `user_settings` (limit 20)
- Writes one notification row per user with `type='sequence_send'`, title `"N emails sent"`,
  body with daily total, `link='/campaigns'`
- Non-blocking, errors logged but don't block the cron

**Frontend (`src/components/kiko/NotificationToast.jsx`, 135 lines):**
- Subscribes via Supabase realtime to INSERT events on `kiko_notifications` filtered by user_id
- Pops stacked toast in bottom-right corner (max 4)
- Auto-dismisses after 8 seconds
- Click to navigate to `notification.link` and mark as read
- Color-coded by type (sequence_send=teal, alert=red, success=teal, default=purple)
- slideInRight CSS animation
- `Layout.jsx`: imports NotificationToast, renders `<NotificationToast user={user} />`
  next to KikoFloat (always-on, every page)

### Cost status at end of Section A0g
- 23 deploys today, ~52 build minutes consumed
- New cron-job-cleanup adds 1 invocation/week (negligible)
- Realtime subscriptions on conversations + kiko_notifications: ~free at low usage
- ThreadIndicator polling reduction: 120/hour → ~0/hour (event-driven)


---

## Section A0h — v0.0.40 (April 12, 2026)

**Theme:** Three more P3 polish items + live browser stress test

### Item 1 — Bulk-edit step content across sequences (deferred from 4c)
- NEW `api/bulk-edit-steps.js` (167 lines)
- GET `?category=<id>` lists sequences in category with step counts + previews
- POST `{sequence_ids[], find, replace, fields}` walks steps + yes_steps/no_steps in conditional steps, returns changes per sequence
- Validates uuids, caps at 50 sequences per call, refuses no-op (find === replace)
- NEW `src/components/campaigns/BulkEditStepsModal.jsx` (232 lines)
- Category picker, sequence checklist, find/replace text areas, field toggles (template/subject), warning banner, results panel
- `Campaigns.jsx`: ✎ button next to Build/+ in header opens the modal

### Item 2 — Notification preferences (mute toggle)
- Migration applied: `user_settings.notification_prefs jsonb DEFAULT '{"sequence_send": true, "alert": true, "default": true}'`
- `NotificationToast.jsx`: loads prefs on mount, realtime handler checks `prefs[type]` before pushing toast
- `Settings.jsx`: new "In-app toasts" card in Profile tab with three type-specific toggles + descriptions
- Existing email/desktop/sound notification card preserved untouched

### Item 3 — Memory tab pagination
- `MemoryTab.jsx`: `load()` accepts reset flag, supports offset-based pagination
- New state: `loadingMore`, `hasMore`
- PAGE_SIZE constant = 100
- "Load more (N of TOTAL)" button renders when more rows available
- Click → fetches next 100 rows with offset, appends to existing list

### Cost status at end of A0h
- 25 deploys today, ~57 build minutes consumed
- All migrations harmless additive


---

## Section A0i — v0.0.41 (April 12, 2026)

**Theme:** Deep memory extraction quality fix — speculation patterns + hallucination guard

**Trigger:** Live browser test of v0.0.40 Memory tab revealed remaining noise the v0.0.38/v0.0.39 regex didn't catch:
- "User has decision-making authority over major vendor partnerships" (borderline speculation)
- "User plans outdoor activities and checks weather accordingly" (single-message inference)
- "Has a son (name unknown)" — **HALLUCINATED, Sunny does not have a son**
- "Two daughters: Nyla (February 2026) and Maya (March 2026)" — wrong years
- Hundreds of behavioural descriptions like "Working on sales pipeline management"

### Live database cleanup — 642 rows removed across 7 passes

| Pass | Pattern | Deleted |
|---|---|---|
| 1 | Behavioural sentence starters (Working/Pursuing/Managing/Cycling/etc.) | 86 |
| 2 | Transient state (overdue/unread/waiting N days/deadline pressure) | 22 |
| 3 | Hallucinations (invented son, wrong-year birthdays, "(name unknown)") | 17 |
| 4 | No concreteness (no digit, no @, no $, no proper noun) | 374 |
| 5 | Behavioural verb sentence starters (Demonstrates/Sets/Handles/etc.) | 49 |
| 6 | Adverb starters (Currently/Actively) + outstanding tasks + role: prefixes | 77 |
| 7 | Confidence metrics + meta-narrative + decision-making style | 17 |
| **Total** | | **642** |

**Final state:** 468 rows for Sunny (down from 1,000 — 53% reduction).

### Live extractor strengthened — `api/kiko.js` SPECULATION filter rewritten
8 filter passes (up from 3):
1. **SPECULATION_REGEX** — psychological inferences ("User exhibits/appears/etc.")
2. **SPECULATION_KEYWORDS** — behavioural descriptors anywhere in value
3. **BEHAVIOURAL_PATTERN** — sentence patterns ("Working on X", "Pursuing X", "Focuses on")
4. **TRANSIENT_STATE** — counts/durations that change daily (unread/overdue/waiting N days)
5. **NEW BEHAVIOURAL_VERB_START** — capitalized verb sentence starts (Demonstrates, Sets, Manages, etc., 80+ verbs)
6. **NEW STRAGGLER_PATTERNS** — adverb starts (Currently/Actively/Recently), "Involved in X", "Role:" prefixes
7. **NEW META_NARRATIVE** — confidence metrics, "(message cut off)", "decision-making style:", "tracking N memory entries"
8. **REWRITTEN CONCRETENESS_CHECK** — must contain digit/$/@/proper-noun, with proper-noun check now SKIPPING the first word so sentence-starting verbs no longer false-positive

PostgreSQL gotcha discovered during cleanup: PostgreSQL regex uses `\y` for word boundary, NOT `\b`. Pass 5 initially returned 0 deletions because of this; fixed by switching to `\s` after the verb pattern.

### Haiku extractor prompt rewritten
- Added explicit "ABSOLUTE RULES" section with 5 hard constraints
- Added HALLUCINATION GUARD: "If user says 'Hi' you do NOT extract 'User is referred to as Sunny'"
- "A valid fact must contain at least one of: proper noun, specific date/number, direct quote"
- Added 17+ NEVER EXTRACT examples with the actual patterns from the audit
- Hard rule: "EMPTY ARRAYS ARE THE CORRECT ANSWER if the conversation has no concrete facts"
- "RETURN EMPTY ARRAYS rather than padding with weak inferences"

### What survives in the Memory tab now (acceptable)
Real concrete contacts: "Natasha Fulbright — VP of Growth, natasha.fulbright@torq.io"
Real deals: "User is working on a $750,000 deal with Torq"
Real preferences with concrete numbers: "Has 88% preference for semiconductor deals"
Real entities: "Van Hawke Group is in fundraising mode"
Real dates: "Tax deadline April 15"
Real family with explicit names: "Daughters named Nyla and Maya"

### Cost status at end of A0i
- 26 deploys today, ~58 build minutes consumed
- 7 SQL DELETE statements (free)
- v0.0.27 cron diet still locked


---

## Section A0j — v0.0.42 (April 12, 2026)

**Theme:** Memory tab UX improvements — search-within-category + bulk select/delete + CSV export

### Item 1 — Search-within-category combo
- `MemoryTab.jsx`: search box placeholder now reflects active category
  - "all" selected → "Search all facts… (press Enter)"
  - "family" selected → "Search within family… (press Enter)"
- Backend already supported combined category + query filtering — just needed UI affordance to make it discoverable

### Item 2 — Bulk select + delete
- `api/memory-tab.js`: DELETE endpoint extended to accept `?ids=uuid1,uuid2,uuid3` (comma-separated, max 200 per call)
- Validates each id is uuid, batches into single PostgREST `id=in.(...)` call
- `MemoryTab.jsx`:
  - New `bulkMode` state (off by default)
  - New `selectedIds` Set state
  - "Bulk select" toggle button in header (purple, switches between Square and CheckSquare icons)
  - When bulkMode active: each row shows a checkbox, selected rows highlighted purple
  - Bulk action toolbar appears above row list: count + Select all visible / Clear / Delete (N) buttons
  - `onBulkDelete` posts comma-separated ids to backend, removes from local state, exits bulk mode
  - Confirm dialog before bulk delete

### Item 3 — Export to CSV
- `MemoryTab.jsx`: new `onExportCSV` function (pure client-side, no backend)
- Generates CSV from currently-loaded `rows` array (respects current category + search filters)
- Columns: category, key, value, source, created_at
- Handles CSV escaping (commas, quotes, newlines)
- Filename: `kiko-memory-{category}-{YYYY-MM-DD}.csv`
- Triggers download via Blob URL + temporary anchor click
- "Export CSV" teal button in header next to Bulk select
- Disabled when rows.length === 0

### Cost status at end of A0j
- 27 deploys today, ~60 build minutes consumed
- No schema changes
- v0.0.27 cron diet still locked

## Section A0k — v0.0.43 → v0.0.44 Warm Charcoal Cascade (April 12, 2026)

### What happened
v0.0.43 updated `src/lib/theme.js` tokens to the Warm Charcoal palette but the live site looked identical because ~40 component files had **hardcoded hex/rgba values** in inline `style={{}}` props that bypassed theme.js entirely. Multiple attempts in claude.ai failed because filesystem tools don't exist there.

This session used Claude Code to grep all 40 offending files (772 occurrences), apply the replacement map systematically via sed, and verify zero remaining old values.

### Replacement map applied
- `#1F1F1D` / `#262624` / `#2C2C2A` → `#1c1c24` (surface)
- `#0A0A0C` / `#262626` → `#14141a` (bg)
- `#EEEEEE` / `#F5F5F8` → `#f4f4f6` (text)
- `rgba(238,238,238,0.8-1.0)` → `#f4f4f6` (text)
- `rgba(238,238,238,0.5-0.7)` → `#9b9ba3` (secondary)
- `rgba(238,238,238,0.3-0.4)` → `#7e7e88` (tertiary)
- `rgba(238,238,238,0.01-0.07)` → `rgba(124,92,252,...)` (surface tints)
- `#A78BFA` → `#7c5cfc` (accent purple)
- `#2DD4BF` → `#7c5cfc` (teal removed, mapped to purple)
- `rgba(167,139,250,X)` → `rgba(124,92,252,X)` (old purple rgba)
- `rgba(45,212,191,X)` → `rgba(124,92,252,X)` (teal rgba)

### Files changed (41 files)
- `package.json` (version bump 0.0.43 → 0.0.44)
- `src/index.css`
- `src/App.jsx`
- `src/components/auth/LoginPage.jsx`
- `src/components/campaigns/BulkEditStepsModal.jsx`
- `src/components/CompanyLogo.jsx`
- `src/components/documents/DocumentCard.jsx`
- `src/components/documents/DocumentSection.jsx`
- `src/components/kiko/AllChatsView.jsx`
- `src/components/kiko/ChatHistory.jsx`
- `src/components/kiko/DraftPreview.jsx`
- `src/components/kiko/EmailDraft.jsx`
- `src/components/kiko/KikoChat.jsx`
- `src/components/kiko/KikoFloat.jsx`
- `src/components/kiko/KikoInsights.jsx`
- `src/components/kiko/KikoToast.jsx`
- `src/components/kiko/KikoVoice.jsx`
- `src/components/kiko/KikoWaveform.jsx`
- `src/components/kiko/NotificationToast.jsx`
- `src/components/kiko/ThreadIndicator.jsx`
- `src/components/KikoThinking.jsx`
- `src/components/layout/CommandPalette.jsx`
- `src/components/layout/Layout.jsx`
- `src/components/PipelineNotifications.jsx`
- `src/components/settings/ImageUpload.jsx`
- `src/components/settings/MemoryTab.jsx`
- `src/components/settings/Settings.jsx`
- `src/components/settings/SkillsManager.jsx`
- `src/pages/AdminSystem.jsx`
- `src/pages/AuthCallback.jsx`
- `src/pages/Campaigns.jsx`
- `src/pages/CommercialCalendar.jsx`
- `src/pages/ContactDetail.jsx`
- `src/pages/Contacts.jsx`
- `src/pages/LinkedInQueue.jsx`
- `src/pages/MemoryConsole.jsx`
- `src/pages/Organisations.jsx`
- `src/pages/OutreachIntelligence.jsx`
- `src/pages/PartnershipMatrix.jsx`
- `src/pages/Pipeline.jsx`
- `src/pages/SequenceDetail.jsx`

### Rule added to KIKO_BIBLE
Surface boundary: code touches repo → Claude Code only. Strategy/writing/discussion → claude.ai. Never run filesystem refactors from claude.ai.

## Section A0l — v0.0.45 + v0.0.46 Background Task System Phase 1+2 (April 12, 2026)

**Theme:** Backend table + 3 endpoints + cleanup cron + frontend status panel for "fire query in chat A, switch to chat B, A keeps working" multitasking.

### Phase 1 — Backend (v0.0.45)
- **Migration:** `kiko_background_tasks` table with RLS (`users see own tasks`), realtime publication, indexes on `(user_id, status, created_at)` and `(conversation_id)`
- **`api/kiko-task-create.js`:** POST endpoint — validates input, inserts row, returns `{task_id, status:'queued'}` in <2s, fires `waitUntil()` background execution using `callKikoInProcess()` pattern from `kiko-async.js` (same tools, same memory, same KIKO_BIBLE prompt)
- **`api/kiko-task-status.js`:** GET `?id=<uuid>` — lightweight status poll with live elapsed computation for running tasks
- **`api/kiko-task-result.js`:** GET `?id=<uuid>` — full row including `result_text` + `tools_used`, only for `done`/`error` status
- **`api/cron-background-task-cleanup.js`:** Sundays 5am UTC — delete done >14d, timeout running >10m, delete error >30d
- **`vercel.json`:** cron entry added. Hit 50-function config limit — resolved by using inline `export const config` instead of vercel.json entries
- **Verification:** 10/10 curl tests passed. Test task `78b3671b` completed in 23s with real Sonnet response (Kiko's meta-learning about Cloudflare fired correctly)

### Phase 2 — Frontend (v0.0.46)
- **`src/components/kiko/BackgroundTasksPanel.jsx`:** Fixed right-edge panel
  - Collapsed: vertical tab with "Tasks" label + purple pill showing active count
  - Expanded: 360px panel with header, scrollable task list, click-outside-to-close
  - Task rows: running (spinning Loader2 + elapsed), done (CheckCircle2 + result preview + "Open in chat"), error (AlertCircle + error message + "Retry")
  - Realtime subscription on `kiko_background_tasks` filtered by `user_id` + 60s safety poll (mirrors ThreadIndicator pattern exactly)
  - Auto-hides done tasks from local state after 5 min (DB row stays)
  - "Open in chat" dispatches `CustomEvent('kiko_open_task_result')` — Phase 3 will wire KikoChat to listen
  - Uses theme tokens only — zero hardcoded hex except status colours (#4ade80, #f87171)
- **`src/components/layout/Layout.jsx`:** 1 import + 1 mount after NotificationToast
- **3 seed rows:** inserted via Supabase for visual verification (running + done + error)

### Files added
- `api/kiko-task-create.js`
- `api/kiko-task-status.js`
- `api/kiko-task-result.js`
- `api/cron-background-task-cleanup.js`
- `src/components/kiko/BackgroundTasksPanel.jsx`

### Files modified
- `vercel.json` (cron entry only)
- `src/components/layout/Layout.jsx` (1 import + 1 mount)
- `package.json` (version 0.0.44 → 0.0.46, added `@vercel/functions`)
- `KIKO_MASTER_LOG.md` (this entry)

### Out of scope (next sessions)
- Phase 3: chat-switch UX in KikoChat.jsx (wire `kiko_open_task_result` event listener)
- Phase 4: SSE streaming for background tasks

### Bundle hashes
- Phase 1: `DMM1uHkO` (frontend unchanged)
- Phase 2: `CL0XoCer`

## Section A0m — v0.0.47 Warm Charcoal Cascade v2 (April 12, 2026)

**Theme:** Complete the cascade that v0.0.44 missed — two entire pattern families were invisible to the first sed pass.

### What v0.0.44 missed
1. **`rgba(245,245,248,...)`** — 4 files had local `C` colour constants with this warm-white variant. Not caught because the v0.0.44 sed only targeted `rgba(238,238,238,...)`.
2. **`rgba(238,232,220,...)`** — 6 page files used this brownish-white for text. Completely different RGB base, invisible to v0.0.44 grep.
3. **Purple-as-text at 8-35% alpha** — `color: 'rgba(124,92,252,0.15)'` etc. used as text colour on dark backgrounds. Technically "correct" purple accent colour but at alpha levels that make text unreadable. This was the Contacts page readability bug Sunny flagged.

### Replacement map applied
- `rgba(245,245,248,0.92)` → `#f4f4f6` (text)
- `rgba(245,245,248,0.55)` → `#9b9ba3` (secondary)
- `rgba(245,245,248,0.32)` → `#7e7e88` (tertiary)
- `rgba(245,245,248,0.16)` → `#56565e` (muted)
- `rgba(238,232,220,0.80-0.95)` → `#f4f4f6` (text)
- `rgba(238,232,220,0.50-0.75)` → `#9b9ba3` (secondary)
- `rgba(238,232,220,0.30-0.45)` → `#7e7e88` (tertiary)
- `color: rgba(124,92,252,0.08-0.15)` → `#7e7e88` (tertiary text)
- `color: rgba(124,92,252,0.20-0.35)` → `#9b9ba3` (secondary text)
- Purple-at-low-alpha in borders/backgrounds left untouched (intentional accent tints)

### Files changed (21 files)
- `src/components/layout/Layout.jsx` (local C constants)
- `src/components/kiko/KikoFloat.jsx` (local C constants)
- `src/components/kiko/KikoChat.jsx` (local C constants + purple text)
- `src/components/kiko/AllChatsView.jsx` (purple text)
- `src/components/kiko/ChatHistory.jsx` (purple text)
- `src/components/kiko/DraftPreview.jsx` (purple text)
- `src/components/kiko/KikoInsights.jsx` (purple text)
- `src/components/kiko/KikoToast.jsx` (purple text)
- `src/components/KikoThinking.jsx` (purple text)
- `src/components/auth/LoginPage.jsx` (purple text)
- `src/pages/SequenceDetail.jsx` (local C constants)
- `src/pages/Contacts.jsx` (warm white + purple text — the unreadable page)
- `src/pages/Organisations.jsx` (warm white + purple text)
- `src/pages/Pipeline.jsx` (warm white + purple text)
- `src/pages/PartnershipMatrix.jsx` (warm white)
- `src/pages/OutreachIntelligence.jsx` (warm white + purple text)
- `src/pages/CommercialCalendar.jsx` (warm white)
- `package.json` (0.0.46 → 0.0.47)

### Verification
- Full grep audit: 0 matches across all 4 pattern groups
- npm run build: clean
- Self-audit loop: GREEN

## Section A0n — v0.0.48 Multitasking Phase 3: KikoChat wiring (April 12, 2026)

**Theme:** Wire the chat UI to the background task system — "Run in background" button + result insertion from panel.

### Change A — "Run in background" button
- Added to conversation input bar (right of EQ button, left of send button)
- 30px round button with monitor/screen icon, purple accent when input has text
- Disabled when input empty or during loading
- onClick: POST to `/api/kiko-task-create` with `{conversation_id, query, user_id}`
- On success: clears input, shows "Task started — see panel →" for 4s
- On error: shows error message inline, does NOT clear input
- Loading state: spinning loader icon during POST
- Only visible when not streaming and not in voice mode

### Change B — `kiko_open_task_result` event listener
- useEffect on mount listens for `CustomEvent('kiko_open_task_result')`
- Event shape (from BackgroundTasksPanel): `{task_id, conversation_id, result_text}`
- Same-conversation: inserts result as assistant message directly
- Different conversation: loads that conversation via Supabase, appends result, switches to it
- No conversation: inserts into current chat
- Scrolls to bottom after insertion
- Cleanup: removeEventListener on unmount

### Change C — "background task" badge
- Assistant messages with `meta.fromBackgroundTask = true` show a small "background task" pill badge next to "Kiko" label

### Files modified (2 only)
- `src/components/kiko/KikoChat.jsx` — all 3 changes
- `package.json` — version 0.0.47 → 0.0.48

### Files NOT modified (verified via git diff)
- api/kiko.js, BackgroundTasksPanel.jsx, Layout.jsx, theme.js — all untouched

## Section A0o — v0.0.49 QoL fixes: task dismiss + cron tighten + voice idle (April 12, 2026)

### Fix 1A — Cron schedule (already done in previous commit)
- `vercel.json` cron for background-task-cleanup already changed to `*/10 * * * *`

### Fix 1B — Cleanup cron thresholds
- Done tasks: 14 days → **24 hours** (Sunny doesn't want done tasks accumulating)
- Running timeout: 10 min → **5 min** (tighter stuck-task detection)
- Error deletion: 30 days (unchanged)

### Fix 1C — `/api/kiko-task-dismiss.js` (NEW)
- DELETE `?id=<uuid>` — single task delete
- DELETE `?ids=uuid1,uuid2,...` — bulk delete up to 200 (mirrors memory-tab.js pattern)
- RLS handles user_id auth

### Fix 1D — BackgroundTasksPanel.jsx
- **× dismiss button** on every task row (top-right, small, confirm for running tasks)
- **"Clear done" button** in header (visible when done/error/cancelled tasks exist, confirms before bulk delete)
- Runaway guard already in place from previous commit (30-min client-side auto-cancel)

### Fix 2 — KikoVoice 60s idle timeout
- Added `useEffect` that starts a 60-second timer on mount, resets on every `status` change (speaking/listening/thinking = activity)
- If 60 seconds pass with no status change, auto-closes voice session via `window.__kikoVoiceClose()`
- Previously there was NO idle timeout — voice stayed open indefinitely until user said goodbye or clicked close

### Fix 3 — Layout.jsx auto-logout placeholder
- 4-line comment block added at top of file documenting future auto-logout feature
- No implementation — deferred until Sunny explicitly requests it

### Files added
- `api/kiko-task-dismiss.js`

### Files modified
- `api/cron-background-task-cleanup.js` (thresholds: 24h done, 5m stuck)
- `src/components/kiko/BackgroundTasksPanel.jsx` (× dismiss, Clear done, onDismiss prop)
- `src/components/kiko/KikoVoice.jsx` (60s idle timer)
- `src/components/layout/Layout.jsx` (4-line comment only)
- `package.json` (0.0.48 → 0.0.49)
