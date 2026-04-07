# KIKO REALITY — System Audit + Locked Architecture (v1.1)

**Date:** 7 April 2026
**Status:** SINGLE SOURCE OF TRUTH. Replaces all prior master plans, sprint plans, wave plans.
**Scope:** Audit (Sections A-F) + Locked Learning Architecture (Section G).

---

## EXECUTIVE SUMMARY

| Metric | Reality |
|---|---|
| Codebase | 91 API endpoints → 84 after Step 3 deletes, 25 agent files, 23 frontend pages, 38 → 33 cron jobs |
| Kiko tools registered | 29 |
| Data operations available via `ask_data_agent` | 37 |
| Database state | 4,193 contacts (100% reachable), 2,244 companies, 308 deals, 1 active vertical pack, 8 sectors |
| Sequence enrollments in production | **0** (every campaign still going through Lemlist) |
| Cron runs/week before Step 3 | 450 |
| Cron runs/week after Step 3 | ~125 (-72%) |
| Company scores produced | **6** of 2,244 (daily scoring cron barely doing useful work — fixed by weekly batch) |
| Active alerts in DB | 116 (most never surfaced to user — fixed by Morning Brief in Step 4) |
| Lemlist replaceable today | **NO** — sequencer has zero production usage (resolved in Step 7) |

**Verdict:** 70-80% of capability exists. 0% is assembled into a daily operating ritual. Build discipline going forward: **does it exist? is it core? what's the cost? does it improve revenue/pipeline/decision quality?** No to any → don't build.


---

## A. CAPABILITY MAP — What Kiko Can Actually Do

### A.1 Tools registered (`api/kiko-tools.js`) — 29 total

**Specialist agents (19 routing layers):** `ask_navigator`, `ask_deal_agent`, `ask_data_agent`, `ask_outreach_agent`, `ask_document_agent`, `ask_memory_engine`, `ask_strategy_agent`, `ask_negotiation_agent`, `ask_category_agent`, `ask_finance_agent`, `ask_ea_agent`, `ask_legal_agent`, `ask_dispute_agent`, `ask_content_agent`, `ask_investment_agent`, `ask_pricing_agent`, `ask_signal_agent`, `ask_travel_agent`, `ask_specialist_agent`

**Direct tools (10):** `navigate_page`, `log_activity`, `ask_lemlist_live`, `ask_self_monitor`, `search_conversations`, `trigger_triage`, `ask_code_review`, `read_email`, `read_calendar`, `manage_knowledge`

### A.2 Operations inside `ask_data_agent` (37 — the real limbs)

**WORKING & verified live:** `source_companies` (returned Palo Alto, CrowdStrike with category-conflict flag, Fortinet on a real test), `search_contacts`, `search_companies`, `search_deals`, `entity_detail`, `alerts`, `stale_contacts`, `news`, `pipeline_notifications`, `activity_feed`, `past_conversations`, `recent_conversations`, `learning_search`, `learning_save`, `outreach_timing`, `warm_path`, `win_loss`, `deal_history`, `bookmark`

**EXISTS, status unverified (assumed working from code):** `source_contacts`, `enrich_company`, `company_intel`, `start_sequence`, `sequence_status`, `cancel_sequence`, `linkedin_queue`, `campaign_overview`, `create_campaign`, `bulk_enroll`, `partnership_matrix`, `email_analytics`, `outreach_intelligence`, `deal_prediction`, `refresh_partnerships`, `search_documents`, `thread_history`, `skills`

### A.3 Critical gaps

| Gap | Impact | Fix |
|---|---|---|
| Reply matcher for Lemlist-era inbound emails | Jim Lake's reply missed | Done in code (deploys this session) |
| Kiko sequencer has 0 production enrollments | Cannot replace Lemlist | Step 7 — first real campaign |
| **No morning brief surface** | Kiko has data, alerts, insights — none assembled. **The biggest gap.** | **Step 4 — the actual product** |
| No email signature wrapper | Outbound emails ship unstyled | Step 5 — 15 mins |
| No Lemlist-parity Campaigns page | Can't run outreach day-to-day | Step 6 |
| No proactive "tell me what to do today" | The whole point of an OS | Step 4 (Morning Brief) |


---

## B. CODEBASE TRUTH — After Step 3 cleanup

### B.1 Files DELETED in Step 3 (this session)

| File | Reason |
|---|---|
| `api/cron-lemlist-enrich.js` | Lemlist being cancelled |
| `api/cron-lemlist-signals.js` | Lemlist being cancelled |
| `api/lemlist-data.js` | Lemlist plumbing |
| `api/lemlist-webhook.js` | Lemlist plumbing |
| `src/pages/Lemlist.jsx` | Lemlist UI page |
| `src/pages/Leads.jsx` | Orphan — never wired into routes |
| `api/leads.js` | Companion to orphan Leads page |
| `api/source-web.js` | Already deleted last session — duplicate of `data.js source_companies` |
| `src/pages/Sourcing.jsx` | Already deleted — Kiko chat is the surface |
| `api/lemlist-drain.js` | Already deleted — utility done |
| `src/pages/LemlistDrain.jsx` | Already deleted |

### B.2 Pages KEPT (will merge into Command Centre in Step 4, not Step 3)

These remain in place until the Morning Brief surface exists. **They are accessible but de-prioritised in nav.** Once Step 4 ships, they get folded in and the standalone pages get deleted.

- `Targets.jsx` → will become Command Centre widget
- `Inbox.jsx` → will become Command Centre "Needs your reply" section
- `News.jsx` → will become Command Centre "Signals" section
- `Tasks.jsx` → will fold into Command Centre tasks section
- `Segments.jsx` → will merge into Campaigns rebuild (Step 6)
- `Packs.jsx` → will move to Settings
- `OutreachIntelligence.jsx` → will merge into Campaigns rebuild
- `PartnershipMatrix.jsx` → keep, demote in nav

### B.3 Pages KEPT permanently

- `Pipeline.jsx` (CRM kanban — daily use)
- `Contacts.jsx` + `ContactDetail.jsx`
- `Organisations.jsx`
- `Sequences.jsx` + `SequenceDetail.jsx` (to be REBUILT in Step 6 as Lemlist-parity Campaigns page)
- `Documents.jsx`
- `CommercialCalendar.jsx` (F1/FE race calendar)
- `MemoryConsole.jsx` / `KikoCode.jsx` (super_admin debug)
- `Admin.jsx` / `AuthCallback.jsx` (auth)

### B.4 Pages to audit later (low priority)

- `Calendar.jsx` vs `CommercialCalendar.jsx` — likely duplicate, consolidate to one


---

## C. INFORMATION ARCHITECTURE — Final Surfaces

**3 primary surfaces. Everything else is secondary or admin.**

### PRIMARY (Daily Use)

1. **Command Centre (Home)** — *the operating partner surface*
   - **Morning Brief** (Step 4 — top hero): Yesterday / Today's Top 3 with drafts / This Week's metrics / Signals
   - **Needs Your Reply** section (replaces Inbox page)
   - **Today's Tasks** (replaces Tasks page)
   - **Top Targets** widget (replaces Targets page)
   - **Signals** widget (replaces News page)
   - **Pipeline snapshot**

2. **Campaigns** — *outreach execution cockpit (Step 6 rebuild)*
   - Left panel: campaign list with status + key stats
   - Right panel: top stats card / sequence visualization / contact list / activity timeline / inline reply triage
   - Segments management folded in (delete standalone Segments page)

3. **Pipeline** — *deal cockpit*
   - Existing kanban, kept as-is

### SECONDARY (Inspection / Records)

Contacts + ContactDetail, Organisations, Documents, CommercialCalendar, Settings

### TERTIARY (Admin / Debug)

MemoryConsole, KikoCode, Admin (super_admin only)

**Net result:** 23 pages → 11 primary surfaces + admin.


---

## D. CRON CUTS APPLIED IN STEP 3 (this session)

| Cron | Before | After | Reason |
|---|---|---|---|
| `news-agent` | Daily M-F | **Weekly Mon** | News doesn't change daily for sponsorship purposes |
| `cron-news-classify` | Daily M-F | **Weekly Mon** | Pairs with news-agent |
| `cron-score-companies` | Daily M-F | **Weekly Mon** | Only 6 of 2,244 companies scored after weeks running — wrong cadence |
| `cron-partnership-scan` | Daily M-F | **Weekly Mon** | Sponsorship deals announce weekly at most |
| `ingest-knowledge` | Daily M-F | **Weekly Mon** | Knowledge sources don't update daily |
| `cron-learning-director` | Daily M-F | **Weekly Mon** | Strategic learning is weekly per locked architecture |
| `cron-meeting-prep` | Every 4hrs | **Daily 7am** | Meetings don't need 4hr refresh |
| `cron-health-check` | Every 6hrs | **Daily 6am** | Daily is enough |
| `cron-sequence-enqueue` | Daily M-F | **PAUSED** | 0 enrollments — wastes runs |
| `cron-sequence-sender` | Every 30min business hrs | **PAUSED** | 0 enrollments — wasted 200 runs/week |
| `cron-sequence-reply-detect` | Every 2hrs M-F | **PAUSED** | 0 enrollments — wasted 50 runs/week |
| `cron-lemlist-enrich` | Mon weekly | **DELETED** | Lemlist being cancelled |
| `cron-lemlist-signals` | Daily M-F | **DELETED** | Lemlist being cancelled |

**Resume policy:** The 3 paused sequencer crons resume automatically when Step 7 (first real Kiko-sent campaign) ships and verifies the pipeline.

**Cost impact:**
- Cron runs/week: 450 → ~125 (**-72%**)
- LLM-heavy crons cut to weekly cadence
- Monthly Anthropic spend (estimate): $15-20 → $5-8 (**-60-65%**)
- Plus Lemlist subscription elimination once cancelled (~$59-99/mo)
- **Total recurring savings: $70-110/month**


---

## E. THE BIGGEST FINDING — Why Kiko Doesn't Feel Like an OS

**Kiko's brain knows what she can do** (system prompt at `api/kiko.js` line 209 documents the campaign engine, sequence ops, sourcing, enrichment).

**Kiko's body has 37 working data operations** in `api/agents/data.js`.

**Brain ↔ body wiring is complete.** Live test confirmed: *"Find me 5 cybersecurity companies over $100M revenue in the US"* returned a tier-ranked analysis of Palo Alto Networks ($9.9B), CrowdStrike (with explicit "already sponsors Mercedes F1 — category conflict" flag), and Fortinet, with current financials and strategic positioning.

**She works.** So why does it feel broken?

1. You were never told what natural-language phrases trigger which capabilities → standalone pages competed with chat
2. Standalone pages competed with Kiko chat for primary access → trained you not to use chat
3. **No daily ritual surfaces what Kiko produces overnight** → `cron-proactive`, `cron-morning-intelligence`, `cron-task-automation` all run and write data, nothing assembles it

**Step 4 (Morning Brief) is the assembly that turns Kiko from a chatbot into an OS.**

---

## F. EXECUTION ORDER — Locked

| Step | What | Status |
|---|---|---|
| 1 | Lock reset protocol | ✅ Done |
| 2 | Audit (`KIKO_REALITY.md`) | ✅ Done |
| 3 | Strip + cut crons (-72%) + smoke test | ✅ Shipped |
| 4 | Command Centre + page-aware Kiko + selftest | ✅ Shipped |
| 5 | Voice profile (38 emails) + signatures + jobs queue | ✅ Shipped |
| 6 | Campaigns Lemlist-parity rebuild (Parts 1+2) | ✅ Shipped |
| 7 | First real Kiko-sent campaign — wired & verified | ✅ Shipped |
| 8 | Learning System Layer 1 (Tactical) | ⏭️ Locked, blocked on real send data |
| 9 | Learning System Layer 2 (Strategic) | ⏭️ Locked, blocked on Step 8 |
| 10 | Behavioural integration | ⏭️ Locked, blocked on Steps 8-9 |
| 11 | Cost discipline rule | ✅ Permanent |

**Step 7 verification (7 April 2026):** Test enrollment for sunny@vanhawke.com → Haas F1 Cybersecurity sequence → manual cron-sequence-enqueue trigger → queued row inspected. Helvetica wrapper applied ✅, signature appended ✅, voice patterns from Sunny's 38 sent emails injected into Haiku refinement ✅ ("At this level, the structuring of Formula One partnerships requires a foundational layer..."), UK BST timezone bug fixed ✅ (lands at 09:26 UK morning, not afternoon). Selftest 32/32. The 3 sequencer crons are live in vercel.json: enqueue 6am M-F, sender every 30min 8-18 M-F, reply-detect every 2hr M-F. cron-sequence-reply-detect kiko_alerts schema drift fixed (now writes type='reply_from_prospect' matching Command Centre + Sequences UI filters).

**What ships when Sunny launches first real campaign tomorrow:**
- Settings → paste real Gmail signature (warm) + text-only signature (cold)
- Pick one of 4 draft Haas F1 campaigns (Banking / FinTech / Telecoms / Gaming)
- Add 3-5 real prospects via Add from CRM or Manual add
- Click Launch → next 6am cron-sequence-enqueue picks it up → wraps with voice + sig → cron-sequence-sender ships it
- Activity tab on /sequences/:id streams events live (sent / opened / clicked / replied)
- Inline reply triage banner appears at top of campaign when reply detected
- Command Centre Priority section also surfaces it
- Reply alerts type=reply_from_prospect in kiko_alerts (verified schema-correct)

**What needs to happen before Lemlist subscription is cancelled:**
1. Sunny launches one real campaign through Kiko (his move)
2. First real reply triaged through Command Centre (depends on #1)
3. Migrate remaining Lemlist campaigns one at a time (depends on #2)
4. Cancel Lemlist subscription (final)

**Build rule (permanent):** Every new feature must declare (1) what it does, (2) run frequency, (3) monthly $, (4) revenue/pipeline/decision-quality justification. Missing or weak answer → don't build.


---

# 🔒 G. LOCKED ARCHITECTURE — KIKO LEARNING SYSTEM

**Status:** LOCKED on 7 April 2026. Do not revisit. Implementation deferred until Steps 8-10 (after Step 7 ships first real Kiko-sent campaign and there is real data to learn from).

## G.1 Two Layers

### Layer 1 — Tactical Intelligence (Real-Time)

**Purpose:** Execution awareness + immediate action.
**Cadence:** Every 1–2 hours, aligned with `cron-inbox-triage` and the future sequence sender.
**Inputs:** Email sends, opens, replies, contact-level engagement events.
**Outputs (must surface into Morning Brief immediately):**
- *"Reply received from [Company / Person] → draft ready"*
- *"High-intent signal: opened 3 times → follow-up recommended"*
- *"No response after X days → trigger follow-up"*

**System behaviour:** updates pipeline status, flags priority contacts, suggests next actions with pre-drafted content.
**Storage:** `interactions`, `kiko_alerts`, `pipeline_updates`.

### Layer 2 — Strategic Learning (Learning Director)

**Purpose:** System optimisation + decision improvement.
**Cadence:** Weekly, fixed (Mon 3am via `cron-learning-director` per Step 3 cuts).
**Inputs:** Campaign-level performance, sector performance, role-level response rates, per-message performance.

**Outputs (structured, never narrative):**
```
Sector ranking:
  Cybersecurity: 14% reply rate
  Fintech: 6% reply rate

Role effectiveness:
  CISO > CMO by 2.1x

Message diagnostics:
  Email 2 underperforming by -35%

Recommendations:
  Increase cybersecurity weighting
  Adjust message 2 framing
```

**Storage:** `kiko_learning_reports`, `scoring_adjustments`, `campaign_insights`.

## G.2 Behavioural Integration (Critical)

**Learning is useless unless it changes outputs.** Kiko must:

**A. Adjust Scoring** — increase weights for high-performing sectors, decrease for underperforming. Writes to `scoring_adjustments`, applied by `cron-score-companies` on next run.

**B. Adjust Targeting** — prioritise sectors with highest conversion in next sourcing run, deprioritise weak segments. Surfaces in Morning Brief.

**C. Adjust Messaging** — replace underperforming sequence steps, reinforce high-performing narratives. `sequence_variants` table; sender picks the highest-performing variant per step.

## G.3 Surface Layer (Morning Brief Integration)

Morning Brief MUST present:

**"This Week's Intelligence":**
- *Cybersecurity outperforming fintech (+8%) → prioritise*
- *CISO outreach converting 2x → shift targeting*

**"Actionable Changes":**
- *Switch next campaign to cybersecurity*
- *Use revised message sequence (v2)*

Both sections click-to-execute.

## G.4 System Logic (Implementation Contract)

```
IF event_type == "interaction"
  → update Tactical Layer
  → trigger alerts/actions

IF time == weekly_cycle
  → run Learning Director
  → generate structured insights
  → update scoring + targeting rules

IF morning_brief_generated
  → pull tactical alerts
  → pull strategic insights
  → convert into top 3 priorities
```

## G.5 Guardrails (NON-NEGOTIABLE)

- **Minimum data threshold** before scoring changes apply (≥30 sends per sector). No premature optimisation.
- **No daily learning recalculation.** Strategic learning is weekly, full stop.
- **No narrative-only outputs.** Every insight = structured + actionable + tied to a downstream change.
- **All insights tie to:** targeting, messaging, or pipeline. If it doesn't change a downstream output, don't surface it.

## G.6 Implementation order

Locked but not built. Ships in Steps 8-10 after Step 7 produces real campaign data. Building learning loops on synthetic data wastes money and produces noise. **Do not start Steps 8-10 until Step 7 ships.**

---

*End of `KIKO_REALITY.md` v1.1. This document is the only build doc that matters. Update in place; do not replace.*
