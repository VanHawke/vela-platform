# KIKO INTELLIGENCE ARCHITECTURE — DEFINITIVE BLUEPRINT
## The single source of truth for how Kiko thinks, learns, and operates
### March 25, 2026

---

## THE PROBLEM (stated plainly)

Kiko is a dispatcher, not an advisor. She routes messages to 23 specialist agents
that each query their own data and respond in isolation. No agent talks to another.
No learning happens between sessions. No proactive thinking. When asked something
outside the 21 categories, she's told NOT to use tools — deliberately lobotomised.

This document defines how to make Kiko genuinely intelligent without breaking
what already works.

---

## DESIGN PRINCIPLE: ADDITIVE, NOT DESTRUCTIVE

Every change in this architecture is ADDITIVE. We do not rewrite working agents.
We do not restructure the database. We do not change the intent classifier.
We ADD layers on top of what works.

What works today and MUST NOT break:
- 23 specialist agents (all tested, all deployed)
- Intent classifier (12/12 intents correct)
- Navigation (deterministic, 0.2s)
- Kiko persistence across pages (sessionStorage + Supabase)
- SSE streaming to frontend
- MCP integration (Gmail, Google Calendar)

---

## ARCHITECTURE: THREE LAYERS


```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 3: PROACTIVE ENGINE                │
│   Daily cron → cross-reference all data → generate alerts   │
│   "Nordic replied + funding news + stale task = CONVERGE"   │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 2: LEARNING LOOP                   │
│   Every decision logged with context → pattern matching     │
│   "This looks like Nordic — you killed that one"            │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                LAYER 1: GENERAL INTELLIGENCE                │
│   Claude at full power + CRM context + web search           │
│   Any question, any topic, with business context available  │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│              EXISTING FOUNDATION (DO NOT TOUCH)             │
│   Intent classifier → 23 specialist agents → SSE stream     │
│   Navigation, persistence, MCP, Supabase                    │
└─────────────────────────────────────────────────────────────┘
```

---

## LAYER 1: GENERAL INTELLIGENCE

### What changes
Currently when intent = "general", the routing hint says:
"Answer directly from your knowledge. Do not call any tools."

This is the lobotomy. We REMOVE this restriction.

### New behaviour for general intent
Claude gets:
1. ALL tools available (same as any specialist query)
2. CRM context injected: pipeline summary, recent deals, active tasks
3. Web search via MCP (for current events, research, fact-checking)
4. Learning log context (what has Sunny decided recently)
5. Full Opus reasoning (not Haiku, not restricted Sonnet)

### What this enables
- "Explain how tariffs affect our Haas deal" → Claude knows the deal context AND can reason about tariffs
- "What happened with Tesla today" → web search + relates to pipeline if relevant
- "Help me think through the Maison pricing strategy" → full strategic reasoning with business context
- "Write a business plan for the US expansion" → all CRM data available for grounding

### What does NOT change
- Specialist intents still route to specialist agents (faster, more focused)
- Intent classifier still runs first (Haiku, ~100ms)
- Navigation still deterministic (0.2s)
- The general path is a FALLBACK for anything that doesn't match a specialist

### Implementation (one code change)
In kiko.js, change the general routing hint from:
```
"Answer directly from your knowledge. Do not call any tools."
```
To:
```
"You have full access to all tools and CRM data. Answer this question
with the depth and intelligence Sunny expects. If business context would
help, check the CRM. If current information is needed, search the web.
Think like a Chief of Staff who knows everything about the business."
```
Plus: inject a CRM context summary (pipeline stats, recent activity,
active tasks) into the system prompt for ALL general queries.

### Risk: ZERO
This change is purely additive. It removes a restriction. If Claude
doesn't need tools, it won't call them. If it does, they're available.
No existing agent is affected.


---

## LAYER 2: LEARNING LOOP

### The problem
Kiko has no memory of decisions. You say "kill the Nordic deal" today.
Next week someone similar comes up and Kiko evaluates from scratch.
A Chief of Staff would say "this looks like Nordic — same funding stage,
same hesitation. You killed that one. Different approach needed here."

### How it works

```
User makes a decision ──► Coordinator writes to kiko_learning_log
                            - what: "Kill Nordic deal"
                            - why: "54 days stale, no exec engagement"
                            - context: company profile, stage, value
                            - outcome: pending (updated later if revisited)

User asks strategy question ──► Strategy Agent reads learning_log
                                  - Finds similar past decisions
                                  - Includes them in context for Claude
                                  - "You killed Nordic (similar profile).
                                     This one differs because X."
```

### What gets logged (automatically by coordinator)
1. DECISIONS: pursue/kill/deprioritise/escalate (from strategy agent)
2. STAGE MOVES: deal moved forward/backward (from deal agent)
3. OUTREACH OUTCOMES: email sent, reply received, no response (from outreach agent)
4. PRICING POSITIONS: what we asked for, what they countered (from negotiation agent)
5. CONTENT PATTERNS: what LinkedIn content performed (future — needs analytics)

### What reads the log (before reasoning)
- Strategy Agent: "Any past decisions about companies like this?"
- Negotiation Agent: "What pricing positions have we taken before?"
- EA Agent: "What did Sunny decide about similar stale deals?"
- Outreach Agent: "What email approaches worked for this sector?"

### The coordinator's role (kiko.js)
After every tool execution that represents a DECISION, the coordinator
writes a structured log entry:
```json
{
  "category": "decision",
  "action": "kill_deal",
  "entity": "Nordic Semiconductor",
  "reasoning": "54 days stale, no exec engagement despite 3 outreach attempts",
  "context": { "stage": "Contact Made", "value": 0, "industry": "Semiconductors" },
  "created_at": "2026-03-25T20:00:00Z"
}
```

### Implementation
1. Add a `logDecision()` function to kiko.js (10 lines)
2. Call it after deal moves, strategy verdicts, negotiation positions
3. Strategy/Negotiation agents already read kiko_learning_log — just need
   better queries (match by industry, company size, deal stage)

### Risk: LOW
The learning_log table already exists. Agents already read it.
We're just writing to it more consistently and querying it more precisely.


---

## LAYER 3: PROACTIVE INTELLIGENCE

### The problem
Kiko only thinks when asked. A Chief of Staff doesn't wait to be asked.
They walk in at 7am and say "three things happened overnight that change
your priorities today."

### How it works

```
Daily cron (7:00 AM UK) ──► Supabase Edge Function runs
  │
  ├─► Pull: news signals (last 24h)
  ├─► Pull: outreach replies (last 24h)
  ├─► Pull: deal stage changes (last 24h)
  ├─► Pull: tasks going overdue (next 24h)
  ├─► Pull: stale deals crossing threshold (7d, 14d, 30d)
  │
  ▼
  Cross-reference engine (Claude Haiku):
  "Given these 5 data streams, identify CONVERGENCE MOMENTS
   where multiple signals point to the same company/opportunity."
  │
  ▼
  Write to kiko_alerts table:
  {
    type: "convergence",
    severity: "high",
    title: "Torq: VP replied + $100M raise + overdue task",
    detail: "Cole Robbins replied to outreach 2h ago. Torq announced
             $100M Series C yesterday. You have an overdue follow-up
             task. This is a convergence moment — act today.",
    entity_name: "Torq",
    action_suggested: "Draft authority follow-up referencing funding",
    expires_at: "2026-03-26T23:59:59Z"
  }
  │
  ▼
  Surface on Home page (Kiko Insights widget)
  AND available in "brief me" response
  AND pushable via future notification system
```

### Types of convergence Kiko detects
1. REPLY + NEWS: Someone replied AND their company is in the news
2. STALE + SIGNAL: Deal going cold BUT company just raised/hired/expanded
3. COMPETITOR + GAP: Competitor signed a sponsor in a category we sell
4. DEADLINE + OPPORTUNITY: Race calendar approaching + open categories
5. PATTERN + REPEAT: Similar company to one we pursued/killed before

### What does NOT happen proactively
- No emails sent automatically (always human approval)
- No deals moved automatically
- No content published automatically
- Kiko SURFACES intelligence and RECOMMENDS actions. Sunny DECIDES.

### Implementation
1. Supabase Edge Function: `proactive-intelligence` (~80 lines)
2. Haiku call to cross-reference data streams (~15 lines of prompt)
3. Write results to existing `kiko_alerts` table
4. Home page Kiko Insights widget already reads this table

### Risk: LOW
This is a standalone cron job that WRITES to an existing table.
It doesn't touch the chat flow, the agents, or the frontend.
If it breaks, alerts stop appearing. Nothing else is affected.


---

## COMPLETE MESSAGE FLOW (how every message is processed)

```
User message arrives at /api/kiko
         │
         ▼
┌─── INTENT CLASSIFIER (Haiku, ~100ms) ───┐
│                                          │
│  "take me to pipeline" → NAVIGATE        │
│  "brief me" → BRIEF (keyword, 0ms)      │
│  "what am I looking at" → SCREEN (0ms)   │
│  "search contacts at Torq" → DATA        │
│  "should we pursue X" → STRATEGY         │
│  "explain how tariffs work" → GENERAL    │
│  ... 21 categories total ...             │
└──────────────┬───────────────────────────┘
               │
               ▼
    ┌────── ROUTE ──────┐
    │                    │
    ▼                    ▼
SPECIALIST           GENERAL
(23 agents)          (full Claude)
    │                    │
    │  Agent gathers     │  Inject CRM context:
    │  its own data      │  - Pipeline summary
    │  (parallel)        │  - Recent decisions
    │                    │  - Active tasks
    │  Claude reasons    │  - Learning log
    │  with context      │
    │                    │  Claude has ALL tools:
    │                    │  - Web search (MCP)
    │                    │  - CRM queries
    │                    │  - Gmail / Calendar
    │                    │  - All 23 agent tools
    │                    │
    ▼                    ▼
┌─── COORDINATOR POST-PROCESSING ───┐
│                                    │
│  1. Stream response to user (SSE)  │
│  2. Log decision if applicable     │
│     → kiko_learning_log            │
│  3. Handle navigation if queued    │
│  4. Save conversation to Supabase  │
│                                    │
└────────────────────────────────────┘
```


---

## IMPLEMENTATION PLAN (strict order, each step tested before next)

### Step 1: General Intelligence Path (30 min, zero risk)
CHANGE: One routing hint in kiko.js
TEST: "Explain how tariffs affect sponsorship deals" → should reason freely
TEST: "What happened with Tesla today" → should search the web
TEST: "Brief me" → should still work (specialist path unchanged)
TEST: "Take me to pipeline" → should still work (0.2s)
ROLLBACK: Revert one line in kiko.js

### Step 2: CRM Context Injection for General Queries (30 min, low risk)
CHANGE: Before general queries, pull pipeline summary + recent activity
         + active tasks + recent decisions. Inject into system prompt.
TEST: "What should I prioritise this week" via general path → should
       reference real deals and tasks, not generic advice
TEST: "How is the business doing" → should cite actual pipeline numbers
ROLLBACK: Remove the context injection block (one function)

### Step 3: Learning Loop — Write (30 min, low risk)
CHANGE: After deal moves, strategy verdicts, negotiation positions,
         coordinator writes structured entry to kiko_learning_log
TEST: "Move Decagon to Qualified" → check learning_log has entry
TEST: "Should we pursue Nordic" → give verdict → check log
ROLLBACK: Remove logDecision() calls (coordinator only)

### Step 4: Learning Loop — Read (30 min, low risk)
CHANGE: Strategy and Negotiation agents query learning_log for
         similar past decisions before reasoning
TEST: "Should we pursue [company similar to one we killed]" →
       should reference the past decision
ROLLBACK: Remove learning_log query from agents

### Step 5: Cross-Agent Brief (1 hour, medium complexity)
CHANGE: EA Agent "brief me" now synthesises across all data sources
         into a narrative, not a list. Uses learning log for context.
         Identifies convergence moments manually.
TEST: Full morning brief with real data → narrative format
TEST: Specialist queries still work independently
ROLLBACK: Revert ea.js to Phase 2 version (git tag)

### Step 6: Proactive Intelligence Cron (1 hour, isolated)
CHANGE: New Supabase Edge Function that runs at 7am UK time
         Cross-references 5 data streams via Haiku
         Writes convergence alerts to kiko_alerts
TEST: Run manually → check alerts table
TEST: Home page shows new alerts
TEST: "Brief me" includes convergence alerts
ROLLBACK: Disable cron job. Nothing else affected.

### Step 7: Voice (Phase 4 — separate workstream)
CHANGE: Replace GPT-4o with Pipecat + Claude + Deepgram + Cartesia
NOTE: This is entirely independent of Layers 1-3.
         Voice is a transport layer. It calls the same /api/kiko endpoint.
         If text mode works, voice works.


---

## TESTING PROTOCOL (non-negotiable)

Before ANY deploy, ALL of these must pass:

### Foundation tests (must still work after every change)
1. "Take me to pipeline" → navigates in <1s ✅
2. "Brief me" → returns real data with real company names ✅
3. "What am I looking at" on pipeline → live deal data ✅
4. "Move Decagon to Qualified" → executes, logs activity ✅
5. "Search contacts at Torq" → returns real contacts ✅
6. Navigation persistence → Kiko stays open after navigating ✅

### Intelligence tests (new — must pass after each Layer)
7. "Explain how tariffs affect F1 sponsorship pricing" → reasons
     freely with business context, doesn't say "I can't help with that"
8. "What happened in tech news today" → searches the web, returns
     current information, relates to pipeline if relevant
9. "Help me think through whether to raise the Maison valuation" →
     uses pipeline data, past decisions, full reasoning
10. After killing a deal: "Should we pursue [similar company]" →
      references the killed deal and explains the difference

### Proactive tests (after Layer 3)
11. Run proactive cron manually → alerts table has convergence entries
12. "Brief me" includes proactive alerts with suggested actions
13. Home page Kiko Insights shows new convergence alerts

---

## WHAT INTELLIGENCE LOOKS LIKE (the vision)

### Today (dispatcher)
User: "Should we pursue Cloudflare?"
Kiko: [routes to Strategy Agent → pulls 6 data sources → verdict]

### After Layer 1 (general intelligence)
User: "I've been thinking about whether we're positioned right
       for the AI infrastructure wave"
Kiko: [doesn't match a specialist → FULL Claude reasoning with CRM
       context → connects Cloudflare deal + pipeline gaps + market
       trends → strategic thesis, not a routing error]

### After Layer 2 (learning)
User: "Should we pursue Fastly?"
Kiko: "Fastly has a similar profile to Cloudflare — both CDN/edge
       companies, both in the AI infrastructure space. However, you
       pursued Cloudflare aggressively at $8-15M range. Fastly's
       $2.1B market cap vs Cloudflare's $67.7B suggests a different
       tier. Recommend Official Supplier level ($1-3M), not Primary."
[references past Cloudflare decision automatically]

### After Layer 3 (proactive)
Kiko (7:02am, unprompted alert on home page):
"CONVERGENCE: Palo Alto Networks
 - Jennifer Wu replied to your outreach yesterday (first reply)
 - Palo Alto announced Q2 earnings beat (+14% revenue) this morning
 - Cybersecurity category on Haas is OPEN
 - You have no competing deal in this category
 → Suggested action: Authority follow-up to Jennifer referencing
   earnings momentum. Draft ready — review?"

---

## WHY THIS WON'T BREAK KIKO

1. Layer 1 changes ONE routing hint. All specialist paths untouched.
2. Layer 2 ADDS writes to an existing table. Agents already read it.
3. Layer 3 is a standalone cron job. If it fails, zero impact on chat.
4. Every step has a specific rollback (git tag or single-line revert).
5. Every step is tested against the foundation tests BEFORE proceeding.
6. The implementation order is strict: 1→2→3→4→5→6→7. No skipping.

The reason Kiko broke before: we made multiple entangled changes
without testing each one independently. This plan makes ONE change,
tests it, confirms it works, THEN makes the next.

---

## FILE: /Users/sunny/Desktop/vela-platform/KIKO_INTELLIGENCE_ARCHITECTURE.md
## STATUS: APPROVED — Ready to implement
## AUTHOR: Kiko rebuild session, March 25, 2026
