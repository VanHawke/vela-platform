# KIKO SYSTEM MAP — Source of Truth

> Generated: 2026-04-09 | Purpose: Every session starts by reading this + running `/api/selfcheck`
> This file is the blueprint. `/api/selfcheck` verifies the running system matches the blueprint.
> If they don't match, the system is broken and we fix it before doing anything else.

## 1. Data layer — what SHOULD exist

### Core tables (Supabase project `dwiywqeleyckzcxbwrlb`)
| Table | Purpose | Expected row count | Critical columns |
|---|---|---|---|
| `f1_teams` | 11 F1 teams | 11 | id, name |
| `sponsor_categories` | Category taxonomy | 20 | id, name |
| `category_overlaps` | Which categories block which (e.g. banking↔fintech↔crypto) | 16+ | primary_category, blocking_category |
| `f1_partnerships` | All known F1 team → partner relationships | 377+ | team_id, partner_name, category_id, related_categories, status, verified, last_verified_at |
| `kiko_sequences` | Outreach campaigns | varies | id, target_persona, category, team, is_active |
| `kiko_sequence_enrollments` | Enrolled prospects per campaign | varies | sequence_id, contact_id, status |
| `campaign_targets` | 50 sourced prospects per campaign | varies | campaign_id, company_name, decision_maker_*, rank |
| `contacts` | CRM contacts (cleaned, 31 emoji prefixes stripped) | 378+ | id, firstName, lastName, email, company |
| `kiko_alerts` | User-facing alerts | varies | type, title, body, urgency, actioned_at |
| `kiko_personal_context` | Memory entries | 1741+ | topic, content |

### Data invariants — SQL should always return these
1. `SELECT count(*) FROM f1_teams` = 11
2. `SELECT count(*) FROM sponsor_categories` = 20  
3. `SELECT count(*) FROM f1_partnerships WHERE status='active'` >= 370
4. Every row in `f1_partnerships` has non-null `partner_name`
5. Zero garbage rows (`partner_name` ILIKE '%unknown%' or '%not specified%')
6. Cybersecurity open teams = Cadillac + Haas ONLY (verified 2026-04-09)

## 2. API surface — what endpoints SHOULD exist

### Deterministic endpoints (no LLM — cannot hallucinate)
| Endpoint | Input | Output | Status |
|---|---|---|---|
| `/api/category-gaps` | `?team=X` optional | JSON: per-category open/blocked team lists | ACTIVE |
| `/api/build-campaign` | `{category, preferredTeam?}` | JSON: team pick, 50 targets, top 8 DMs | ACTIVE |
| `/api/build-campaign-enroll` | `{campaign_id}` | JSON: 8 enrollments created, sequence activated | ACTIVE |
| `/api/selfcheck` | none | JSON: pass/fail for every system component | **NEW THIS TURN** |
| `/api/cron-partner-reconcile` | none (cron) | Scrapes 11 teams' partner pages, diffs DB, alerts on new | **NEW THIS TURN** |

### Chat endpoint (LLM routed carefully)
| Endpoint | Behavior |
|---|---|
| `/api/kiko` | 1. Classify intent. 2. If navigate/category_gap/screen → deterministic handler (no LLM). 3. Otherwise → LLM with tools and system prompt. 4. Output sanitiser strips `<invoke>` XML hallucinations. |

### Intent routing (in `api/agents/intent-classifier.js`)
| Intent | Route | LLM involved? |
|---|---|---|
| `navigate` | Short-circuit: emit `{navigate: target}` event | NO |
| `category_gap` | Short-circuit: call inline sbFetch → format → stream | NO |
| `screen` | Inject live screen data → LLM composes natural description | YES (with grounded data) |
| `campaign` (old) | REDIRECT to `/campaigns` page builder | NO |
| everything else | LLM tool loop | YES |

## 3. Cron schedule — what SHOULD be running

| Cron | Schedule | Purpose |
|---|---|---|
| `cron-partner-reconcile` | 6am Mon-Fri | **NEW** — Scrape 11 teams' partners pages, diff DB |
| `cron-partnership-scan` | Daily | News-article-based detection (RSS) |
| `cron-partnership-verify` | Daily | Re-check existing rows haven't been dropped |
| `cron-morning-intelligence` | 7am Mon-Fri | Brief summary to Sunny |
| `cron-proactive` | 7am Mon-Fri | Proactive alerts |
| `cron-inbox-triage` | 7:15am Mon-Fri | Reply classification |
| `cron-news-classify` | hourly | Classify news signals |
| `cron-meeting-prep` | hourly | Pre-meeting briefs |
| `cron-sequence-enqueue` | 8am daily | Enqueue outreach emails |
| `cron-sequence-sender` | 8:05am daily | Send enqueued emails |
| `cron-edit-delta` | 10pm Mon-Fri | Learn from user email edits |

## 4. Deterministic vs LLM paths — the architectural principle

**Hallucination happens when the LLM is asked factual questions whose answer exists in a database.**

Current deterministic paths:
- Navigation: "take me to X" → direct route event
- Category gap: "which sector for Haas" → SQL query → formatted output
- Campaign build: "source 50 cyber prospects" → `/api/build-campaign` pipeline

Paths that STILL use LLM (candidates for deterministic conversion):
- "Tell me about company X" — could query `companies` + `web_search` deterministically
- "What's the status of deal Y" — could query `deals` table directly
- "Who did I last email at Mercedes" — could query `emails` + `contacts` directly
- "What's in my inbox today" — already uses live Gmail API but LLM summarises

## 5. Auto-pause — the loop Sunny asked for

**Trigger:** New row inserted into `f1_partnerships` where `status='active'`.
**Action:**
1. Find all `kiko_sequences` where `(team=<new_partner_team>, category=<new_partner_category>)` AND `is_active=true`
2. Set those sequences to `is_active=false, paused_reason='slot_taken_by_<partner_name>'`
3. Insert a `kiko_alerts` row: "⚠️ <Team> signed <Partner> in <Category> — paused your <campaign>"
4. Next morning brief includes the alert

Implementation: Postgres trigger on `f1_partnerships` INSERT → see SQL migration below.

## 6. Self-check protocol

Every session begins with: `curl https://vela-platform-one.vercel.app/api/selfcheck`
Output format:
```json
{
  "overall": "PASS" | "FAIL",
  "checks": [
    {"name": "teams_count_11", "status": "PASS", "actual": 11, "expected": 11},
    {"name": "partnerships_active_370_plus", "status": "PASS", "actual": 377, "expected": ">=370"},
    {"name": "cybersecurity_open_teams", "status": "PASS", "actual": ["cadillac","haas"], "expected": ["cadillac","haas"]},
    {"name": "api_build_campaign_reachable", "status": "PASS"},
    {"name": "cron_partner_reconcile_last_run", "status": "PASS", "last_run": "2026-04-09T06:00:00Z"}
  ],
  "timestamp": "..."
}
```
If any check is FAIL, Kiko announces it at next chat turn and refuses to answer factual questions until fixed.

## 7. What's broken RIGHT NOW (2026-04-09 11:50 UK)

- [ ] `f1_partnerships` missing data for 7 of 20 categories (we've only manually reconciled cybersecurity). Estimated ~100 missing partnerships.
- [ ] Voice-in-conversation still covers the chat pane (inline positioning fix only half-works — needs bottom-dock panel)
- [ ] No `/api/selfcheck` endpoint yet
- [ ] No `cron-partner-reconcile` — existing `cron-partnership-scan` is reactive (news-based) not proactive (team-page-based)
- [ ] No auto-pause trigger on new partnership insertions
- [ ] System prompt still tells Kiko she has tools that let her analyse; she claims data she doesn't query. The `<invoke>` XML hallucination is a symptom.

## 8. What's verified working (2026-04-09 11:50 UK)

- [x] `/api/build-campaign` → deterministic, tested with Banking + Cybersecurity
- [x] `/api/build-campaign-enroll` → 8 enrollments verified in DB
- [x] `/api/category-gaps` → returns correct cybersecurity matrix
- [x] `/api/kiko` category_gap intent routing → curl returns correct Haas categories
- [x] `/api/kiko` navigate intent routing → "take me there" fires `{navigate: campaigns}`
- [x] `/campaigns` page with ⚡ Build modal → end-to-end flow screenshotted
- [x] Data hygiene for cybersecurity: Haas + Cadillac only open (matches Sunny's ground truth)
- [x] Email signature via Gmail sendAs alias `sunny@vanhawke.agency` (Sunny's live test confirmed)
