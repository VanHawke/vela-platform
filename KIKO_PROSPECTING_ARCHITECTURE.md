# KIKO AUTONOMOUS PROSPECTING ENGINE — SYSTEM ARCHITECTURE
## Forensic Audit + Lemlist Gap Analysis + Build Specification
## 6 April 2026

---

## PART 1: THE HARD TRUTH — FORENSIC AUDIT

### What's Actually Alive
| System | Status | Evidence |
|--------|--------|----------|
| Crons | ✅ Running | health-check, sequence-sender, meeting-prep, reply-detect all heartbeating today |
| Learning Log | ✅ Writing | 246 entries, most recent today |
| Preferences | ✅ Generating | 10+ preferences with 0.85-0.95 confidence, last synthesised Apr 5 |
| Proactive Alerts | ✅ Firing | task_due alerts generated at 8:30am today |
| Company Enrichment | ✅ Working | 17 companies enriched with 30 structured fields |
| News Agent | ✅ Running | 75 RSS feeds processing daily |
| Email Draft System | ✅ Working | Tone CTAs, Gmail integration, edit-delta feedback loop |

### What's Dead or Empty
| System | Status | Problem |
|--------|--------|---------|
| Campaigns | ❌ 1 campaign | Only "Haas F1 - Cybersecurity" exists. Zero from the 11 Lemlist campaigns replicated. |
| Enrollments | ❌ ZERO | Not a single lead enrolled in any Kiko campaign. |
| Outreach Queue | ❌ EMPTY | Zero emails queued, zero sent. The sender cron runs every 30 min but has nothing to send. |
| LinkedIn Queue | ❌ EMPTY | Table exists, zero entries. No LinkedIn actions executing. |
| Deal Attribution | ❓ Unclear | Table exists but no outreach to attribute. |

### Root Cause Diagnosis
**Kiko has intelligence but no autonomy.** Every piece of infrastructure works in isolation, but nothing connects end-to-end.

1. **No company sourcing** — Kiko can't find new companies. The 5,006 contacts are from a Pipedrive import.
2. **No contact sourcing** — Kiko can't find decision-makers. No email finder, no enrichment waterfall.
3. **No autonomous campaign creation** — Kiko generates a campaign only IF you click the wizard.
4. **No autonomous enrollment** — Leads must be manually added via UI clicks.
5. **No LinkedIn execution** — The linkedin_queue table exists but nothing executes actions.
6. **No conditional branching** — Email-only linear sequences.
7. **No reply-to-pipeline bridge** — Replies change enrollment status but don't create/move CRM deals.
8. **Kiko doesn't know her own campaign capabilities** — Not in her tool definitions.

**Why it feels like a chatbot:** Kiko learns, remembers, analyses — but never ACTS unprompted.

---

## PART 2: LEMLIST vs KIKO — HONEST COMPARISON

### What Lemlist Does That Kiko Doesn't
| Lemlist Feature | Kiko Status | Gap |
|----------------|-------------|-----|
| 450M+ lead database | ❌ No database | CRM has 5,006 imported contacts only |
| Waterfall email enrichment | ❌ None | No email finder/verifier |
| LinkedIn automation (invites, messages, profile visits) | ❌ Queue only | Table exists, no execution layer |
| Conditional branching (if open → LinkedIn, if accept → message) | ❌ None | Linear sequences only |
| Email warm-up (lemwarm) | ❌ None | No deliverability management |
| Multi-sender inbox rotation | ❌ Single sender | sunny@vanhawke.agency only |
| A/B subject line testing | ❌ None | Single variant per step |
| Unified inbox (all replies in one place) | ❌ Partial | Reply detection exists, no unified inbox UI |

### What Kiko Does That Lemlist Can't
| Kiko Advantage | Detail |
|---------------|--------|
| AI-native reasoning | Claude analyses every deal, company, decision — not template matching |
| Self-learning preferences | Builds a model of YOUR decision patterns (0.85-0.95 confidence) |
| Proactive intelligence | Cross-references news, pipeline, outreach, race calendar at 7am daily |
| Van Hawke voice | 16 real email templates across 8 categories |
| Company enrichment | 30 structured fields per company via AI + web search |
| CRM-aware drafting | Knows deal stage, contact history, company intel when writing |
| Category-exclusive logic | Understands Palo Alto in Cybersecurity blocks Cloudflare |

---

## PART 3: SYSTEM SCHEMATIC — AUTONOMOUS PROSPECTING ENGINE

### The End State
```
Kiko identifies category → Debates with Sunny → Sources companies →
Sources contacts → Creates campaign → Drafts messaging → Enrolls prospects →
Gets approval → Goes live → Sends → Monitors → Alerts on replies →
Replies go to pipeline → Progresses deals
```

### Architecture Diagram
```
┌──────────────────────────────────────────────────────────────────┐
│                     KIKO OPERATING SYSTEM                         │
│                  (Claude Sonnet — /api/kiko)                      │
│   23 Agents │ 41 Tools │ Identity │ Preferences │ Learning       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │            PROSPECTING ENGINE (NEW MODULE)                │    │
│  │                                                           │    │
│  │  CATEGORY RECOMMENDER ──► COMPANY SOURCER ──► CONTACT    │    │
│  │  (analyses open cats,      (web search for     SOURCER   │    │
│  │   market signals,           cos in category,   (web search│    │
│  │   pipeline gaps,            enriches via        for people│    │
│  │   race calendar)            Claude + web,       at target │    │
│  │                             scores fit)         cos)      │    │
│  │         │                       │                  │      │    │
│  │         ▼                       ▼                  ▼      │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │      CAMPAIGN BUILDER (EXISTS + EXTEND)             │   │    │
│  │  │  generate-sequence.js + auto-enroll + branching     │   │    │
│  │  └─────────────────────┬──────────────────────────────┘   │    │
│  │                        ▼                                   │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │      APPROVAL GATEWAY (NEW)                         │   │    │
│  │  │  Draft → Sunny reviews → [Approve] / [Edit]         │   │    │
│  │  └─────────────────────┬──────────────────────────────┘   │    │
│  │                        ▼                                   │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │      EXECUTION ENGINE (EXISTS)                      │   │    │
│  │  │  enqueue (6am) → send (30min) → reply-detect (2hr) │   │    │
│  │  │  + LinkedIn executor (NEW)                          │   │    │
│  │  └─────────────────────┬──────────────────────────────┘   │    │
│  │                        ▼                                   │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │      REPLY → PIPELINE BRIDGE (NEW)                  │   │    │
│  │  │  Reply → Create/update CRM deal → Alert Sunny       │   │    │
│  │  │  → Log in learning + deal attribution               │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  INTELLIGENCE │ CRM (308 deals, 5K contacts) │ CALENDAR (61 races)│
└──────────────────────────────────────────────────────────────────┘
```

---

## PART 4: BUILD SPECIFICATION — 12 FEATURES, PRIORITY ORDERED

### TIER 1: Activate What Exists (1 session, highest leverage)

**1. Wire Kiko's Brain to Campaigns**
Add campaign tools to kiko-tools.js (no new API functions):
- `source_companies` — web search for companies in a category, return structured list
- `source_contacts` — web search for decision-makers at a company
- `create_campaign` — calls generate-sequence.js programmatically
- `enroll_contacts` — bulk-enrolls contacts into a campaign
- `campaign_status` — returns stats for all campaigns
- `approve_campaign` — marks a draft campaign as live

Sunny says "Kiko, build me a Banking campaign for Haas" → Kiko sources, generates, enrolls, presents for approval.

**2. Category Recommender (Proactive Cron Addition)**
Add to cron-proactive.js: analyse open categories vs pipeline, market signals, race calendar.
Generates alert: "Banking is HIGH priority: 0 campaigns active, 847 contacts in CRM, Miami GP aligns with FinTech presence."

**3. Reply → Pipeline Bridge**
Modify cron-sequence-reply-detect.js: reply detected → auto-create/update CRM deal → move to "Contact Made" → alert Sunny → log in deal attribution.

### TIER 2: Company & Contact Sourcing (1-2 sessions)

**4. Company Sourcing Tool** — Web search for companies in a category, cross-ref CRM, score sponsorship fit, return ranked list of 15-25 companies.

**5. Contact Sourcing Tool** — Web search for decision-makers at target companies, extract name/title/email/LinkedIn, score by seniority, check CRM for duplicates.

**6. Auto-Enrich on Campaign Creation** — For contacts without email: attempt web-search enrichment. For contacts without LinkedIn: attempt URL discovery.

### TIER 3: Conditional Branching + LinkedIn (2-3 sessions)

**7. Conditional Step Type** — Add condition steps: "no_reply_after_step_3" → true_branch (LinkedIn) / false_branch (email). Requires UI, cron modification, event tracking.

**8. LinkedIn Execution Layer** — Build executor for linkedin_queue. Cleanest path: PhantomBuster API integration for session management. Handles profile visits, connection requests, messages.

**9. Branching UI** — Visual sequence builder with yes/no branches diverging from condition nodes.

### TIER 4: Intelligence Feedback Loop (1 session)

**10. Campaign Performance Learning** — After 2+ weeks: which approach got most replies? Which step converted? Feed back into generate-sequence.js.

**11. Contact Scoring Model** — Build scoring from reply data: which titles, company sizes, industries respond? Prioritise future sourcing.

**12. Campaign Recommendation Intelligence** — Weekly cron: categories with low reply rates → suggest adjustment. Categories with NO campaigns but high-fit CRM contacts → suggest launch.

---

## PART 5: SESSION ROADMAP

### Next Session: Wire Kiko's Brain to Campaigns (Tier 1, Items 1-3)
After this single session:
- "Kiko, what categories should we target?" → analyses pipeline, market, recommends
- "Build me a Banking campaign for Haas" → generates sequence, sources from CRM, enrolls, presents for approval
- When someone replies → auto-creates deal in pipeline, alerts Sunny
- Morning brief includes campaign performance

**Estimated:** 3-4 hours | **New API functions:** 0 | **Risk:** LOW

### Session +1: Company + Contact Sourcing (Tier 2, Items 4-6)
Kiko finds NEW companies and contacts via web search. Moves from "search your Rolodex" to "go find me prospects."

### Session +2: Conditional Branching (Tier 3, Item 7)
If opened but no reply → LinkedIn. If accepted → message. Matches Lemlist's core differentiator.

### Session +3: LinkedIn Execution (Tier 3, Item 8)
PhantomBuster API integration. Automated profile visits, connection requests, messages.

### Ongoing: Generate HIGH Campaigns
Banking, FinTech, Telecoms, Energy, Gaming — all flagged HIGH with zero campaigns.

---

## PART 6: UPDATED SYSTEM STATUS

### Remove from Plan
- Phase 13 Voice (using ChatGPT GPT-4o — working)
- Phases 6-12 (all already implemented and running)

### Current Stats (6 April 2026)
- 33 crons active | 49/50 Vercel functions (1 slot remaining)
- 1 campaign | 0 enrollments | 0 emails sent via Kiko
- 246 learning log entries | 10+ preference patterns at 0.85-0.95 confidence
- 17/36 companies enriched
- Lemlist: 11 active campaigns, 700+ leads — needs to migrate to Kiko

---

## THE BOTTOM LINE

Kiko has a brain but no hands. She can think, learn, remember, and advise — but she can't act. Fix these three things and the system transforms:

1. **Kiko doesn't know she has campaign tools** (not in her tool definitions)
2. **No company/contact sourcing** (can only search existing CRM imports)
3. **No reply → pipeline automation** (replies don't create deals)

Everything else is incremental. These three unlock the autonomous prospecting engine.
