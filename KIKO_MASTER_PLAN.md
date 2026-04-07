# KIKO MASTER PLAN v1.0
**Confirmed: 7 April 2026 — Sunny Sidhu, Van Hawke Group**

This is the source of truth for Kiko's build. Every future session reads this file FIRST.

---

## OBJECTIVE
Build Kiko as a modular, white-label AI operating system: C-suite decision engine, execution orchestrator, memory system, learning system. End state: user gives high-level instruction → Kiko runs full workflow autonomously.

---

## ARCHITECTURE (3 LAYERS)

### Layer 1 — Kiko Core OS (Universal, fixed)
Natural language UI · Memory · Decision router · Workflow orchestration · Context awareness. **No industry logic.**

### Layer 2 — Functional Modules (Vertical-agnostic)
- M1: Lead Sourcing
- M2: Data Enrichment
- M3: Scoring Engine ← MISSING KEYSTONE (built in Phase A)
- M4: Campaign Builder ✅
- M5: Outreach Execution ✅
- M6: CRM/Pipeline ✅
- M7: Analytics + Feedback (partial)

### Layer 3 — Vertical Intelligence Packs (Pluggable)
First pack: **Van Hawke F1 Sponsorship**
- Sectors: cyber, AI, cloud, fintech, semiconductors, robotics, legal, banking
- SponsorSignal weights: Revenue 25% · Geo 15% · Category 25% · Growth 15% · Narrative 20%
- Target roles: CEO, CMO, CRO, CISO
- 5-touch framework: Risk/trust → Revenue → Category ownership → Scarcity → Institutional close


---

## EXECUTION SEQUENCE — 12 SPRINTS

### PHASE A — Foundation Retrofit (the missing keystone)
- **A1** Vertical Pack Infrastructure ← **NEXT**
- **A2** SponsorSignal Scoring Engine
- **A3** Scoring UI + Workflow Integration

### PHASE B — Lead Sourcing (Apollo.io confirmed, $49/mo)
- **B1** Lead Sourcing Module
- **B2** Sourcing Automation

### PHASE C — Execution Layer (4 sprints already shipped — listed as legacy)
- **C1** LinkedIn Execution
- **C2** Multi-Channel Sequencing
- **C3** Custom Variables + Spintax
- **C4** Sequence Polish

### PHASE D — Learning Loop Closure
- **D1** Score Feedback Loop
- **D2** Performance Dashboard

### PHASE E — Modularisation
- **E1** Pack Marketplace

---

## EXTERNAL DEPENDENCIES
- Apollo.io basic ($49/mo) — needed for Sprint B1
- Anthropic API — already paying
- Chrome extension for LinkedIn (free, TOS-compliant) — Sprint C1

---

## BUILD DISCIPLINE (NON-NEGOTIABLE)
1. One sprint per session. Complete, deployed, tested.
2. Schema first, code second. Migrations atomic.
3. No retroactive scope creep.
4. Smoke test before deploy.
5. Heartbeats on every cron.
6. After each sprint, update SPRINT LOG below.

---

## SPRINT LOG
| Sprint | Phase | Title | Status | Commit |
|---|---|---|---|---|
| Legacy | C | Trigger conditions engine | ✅ shipped | 4642523 |
| Legacy | C | A/B testing engine + UI | ✅ shipped | 9ce2a37 |
| Legacy | C | Unified reply inbox | ✅ shipped | 2a45068 |
| Legacy | C | Lead segments + auto-enrollment | ✅ shipped | b1101e3 |
| **A1** | A | Vertical Pack Infrastructure | ✅ shipped | 119d6d8 |
| A2 | A | SponsorSignal Scoring Engine | ✅ shipped | 21a96a8 |
| A3 | A | Scoring UI + Workflow Integration | ✅ shipped | 7fff5be |
| B1 | B | Lead Sourcing Module (Apollo) | ⏭️ | — |
| B2 | B | Sourcing Automation | ⏭️ | — |
| C1 | C | LinkedIn Execution | ⏭️ | — |
| C2 | C | Multi-Channel Sequencing | ⏭️ | — |
| C3 | C | Custom Variables + Spintax | ⏭️ | — |
| C4 | C | Sequence Polish | ⏭️ | — |
| D1 | D | Score Feedback Loop | ⏭️ | — |
| D2 | D | Performance Dashboard | ⏭️ | — |
| E1 | E | Pack Marketplace | ⏭️ | — |


---

## KNOWN ISSUES (logged, scheduled, not blocking)
| Issue | Found | Severity | Fix slot |
|---|---|---|---|
| `cron-news-classify` errors with HTML response (calls authenticated /api/news-agent over HTTP) | Sprint A1 smoke test | Medium | End of Phase A — refactor to import classify function directly instead of HTTP call |
| News-agent classification backlog (~5,000 unclassified articles) | Sprint A1 | Low | Self-resolving once cron-news-classify is fixed (above) |
| Performance learning loop has zero data | Sprint A1 | Low (dormant, not broken) | Activates automatically when first real campaign sends |
