# KIKO REBUILD — DEFINITIVE ARCHITECTURE
## From broken bot to working operating system
### March 24, 2026

---

## PART 1: ROOT CAUSE ANALYSIS — WHY KIKO DOESN'T WORK

### Problem 1: Navigation says "done" but nothing happens
**Root cause:** SSE stream sends `{"navigate":"pipeline"}`. KikoFloat receives it inside a `while(true)` read loop, calls `navigate('/pipeline')` via React Router. React batches state updates during streaming, navigation gets swallowed.
**Correct fix:** Navigation executes AFTER stream completes, not during.

### Problem 2: "What am I looking at" gives generic descriptions
**Root cause:** Navigator Agent reads stale `pageContext.summary` set at page load. Has no live Supabase access. Uses Haiku with 500-token limit.
**Correct fix:** "What am I looking at" triggers a LIVE Supabase query for the current page, not a cached summary.

### Problem 3: "Brief me" gives generic output
**Root cause:** EA Agent pulls from 4 tables (tasks, deals, alerts, activities). Missing: Gmail, Calendar, news signals, outreach scores, pipeline notifications. No cross-referencing.
**Correct fix:** 9-source brief with prioritised recommendations.

### Problem 4: Voice hallucinations
**Root cause:** GPT-4o handles voice. Knows nothing about platform/data. Fabricates responses.
**Correct fix:** Replace with Pipecat/LiveKit + Claude. Phase 4 — after text works.

### Problem 5: Agents are thin wrappers
**Root cause:** Many agents (Content, Legal, Investment) just call Claude with a prompt. No data injection, no skill loading, no context gathering.
**Correct fix:** Every agent gathers real data before calling Claude.

---

## PART 2: DESIGN PRINCIPLES

1. **Navigation is an action, not a side-effect.** Post-stream execution, not mid-stream.
2. **Every agent queries data before generating.** No thin Claude wrappers.
3. **Page context is live.** Supabase query per "what am I looking at", not cached string.
4. **One brain.** Claude only. No GPT-4o competing.
5. **Deterministic before generative.** Database ops return results, not essays.
6. **Integration-aware.** Agents know about Supabase (20+ tables), Gmail (MCP), Calendar (MCP), Lemlist (REST), web search.

---

## PART 3: THE REBUILD

### A. KikoFloat.jsx — Navigation Fix
**Current:** Navigation during SSE streaming → React batches → silently fails.
**New:** Navigation queued during stream, executed AFTER stream completes + messages committed.

### B. Coordinator (kiko.js) — Intent Classification
**Current:** 24 routing rules in system prompt. Claude picks the tool. Slow, error-prone.
**New:** Two-step: (1) Haiku classifies intent (~100ms), (2) Direct dispatch to agent, (3) Sonnet composes response.

Intent categories: navigate, screen, crm_write, crm_read, outreach, brief, strategy, content, research, general.

### C. Navigator → Pure Alias Lookup
**Current:** Haiku LLM call to match navigation intent.
**New:** Deterministic string matching. "pipeline" → /pipeline. No LLM needed. ~0ms.

### D. Screen Description → Live Data Agent
**Current:** Navigator reads stale pageContext.summary.
**New:** Data Agent pulls live Supabase data for the current page. Real numbers, real deals, real contacts.

### E. Agent Intelligence — Data First, Claude Second
Every agent follows: GATHER (Supabase) → LOAD (skills) → COMPOSE (Claude).
Content Agent pulls news + sponsors before writing. EA Agent pulls 9 sources before briefing. Strategy Agent pulls deals + outreach before evaluating.

### F. Morning Brief — 9 Sources
1. Tasks (outstanding, overdue, due today)
2. Pipeline (active count, weighted value, stale, recently moved)
3. Alerts (active, undismissed)
4. Activities (recent logged)
5. Calendar (today's meetings via MCP)
6. Email (unread, replies via MCP)
7. News (today's deal signals)
8. Outreach scores (hot leads)
9. Pipeline notifications (recent movements)

---

## PART 4: PHASED BUILD PLAN

### Phase 0: Fix Frontend (1 session)
- Rewrite KikoFloat navigation → post-stream execution
- Add console logging at every step
- Test: "Take me to pipeline" physically navigates
- **Exit criteria:** Navigation works. Console shows event flow.

### Phase 1: Intent Classifier + Coordinator (1-2 sessions)
- Build Haiku-based intent classifier (~10 intents)
- Rewrite kiko.js: classify → dispatch → compose
- Remove tool definitions from coordinator
- **Exit criteria:** 20 test queries route correctly. <2s response.

### Phase 2: Core Agents Deep Rebuild (2-3 sessions)
- Data Agent: add weighted pipeline, deal momentum
- Deal Agent: add confirmation patterns
- Navigator: pure alias lookup, no LLM
- EA Agent: 9-source morning brief
- Outreach Agent: context-first drafting
- **Exit criteria:** "Brief me" returns rich data. "Draft email" pulls history first.

### Phase 3: Intelligence Agents (1-2 sessions)
- Strategy: data-injected decisions
- Content: data-backed composition
- Finance: live computation
- **Exit criteria:** "Should we pursue X" uses real data.

### Phase 4: Voice (2-3 sessions)
- Replace GPT-4o with Pipecat/LiveKit + Claude
- STT: Deepgram. TTS: Cartesia. Transport: WebRTC.
- **Exit criteria:** All agents work via voice.

### Phase 5: Remaining Agents (1-2 sessions)
- Enhance: Category Control, Negotiation, Legal, Dispute, Investment, Pricing, Travel, Signal
- **Exit criteria:** All 21 agents data-aware and tested.

---

## PART 5: SUCCESS CRITERIA

| # | Test | Expected |
|---|---|---|
| 1 | "Take me to the pipeline" | Page navigates physically |
| 2 | "What am I looking at?" | Live data from current page |
| 3 | "Brief me" | 9-source brief with recommendations |
| 4 | "Move Decagon to Qualified" | Deal moves, confirmation, history logged |
| 5 | "Create task: call Ryan in 3 days" | Task created with correct due date |
| 6 | "Draft follow-up to CFO at Torq" | Pulls context FIRST, then drafts |
| 7 | "What's our weighted pipeline?" | Exact number from live data |
| 8 | "Should we pursue Cloudflare?" | Research + verdict with real data |
| 9 | "LinkedIn post about cybersecurity in F1" | Grounded in real news + sponsors |
| 10 | "What categories are open on Haas?" | Live partnership matrix |

---

## PART 6: DATA MAP

**Supabase tables (20+):** deals, contacts, companies, tasks, activities, news_articles, email_scores, outreach_scores, documents, f1_teams, sponsor_categories, f1_partnerships, kiko_alerts, pipeline_notifications, deal_stage_history, contact_activities, conversations, kiko_memories, kiko_learning_log, kiko_skills, race_calendar

**External:** Gmail (MCP), Google Calendar (MCP), Lemlist (REST), Web Search (Anthropic native)

---

*This document is the source of truth for the Kiko rebuild.*
*All build sessions reference this document.*
*Do not write code that contradicts this architecture.*
