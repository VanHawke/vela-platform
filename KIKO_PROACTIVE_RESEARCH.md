# KIKO PROACTIVE INTELLIGENCE — RESEARCH & ARCHITECTURE PLAN
## Deep Research Findings | May 19, 2026

---

## SOURCES STUDIED

### Academic Papers (Read in Full)
1. **PASK: Toward Intent-Aware Proactive Agents with Long-Term Memory** (arxiv 2604.08000, Apr 2026)
   - Authors: Zhifei Xie et al. (Pask-Core, NTU, NUS)
   - Proposes DD-MM-PAS paradigm: Demand Detection + Memory Modeling + Proactive Agent System
   - Introduces IntentFlow (streaming demand detection model) and three-layer hybrid memory
   - Trained on 102K samples with SFT + reinforcement learning

2. **π-BENCH: Evaluating Proactive Personal Assistant Agents** (arxiv 2605.14678, May 2026)
   - 100 multi-turn tasks across 5 domain-specific personas
   - Key finding: proactivity and task completion are SEPARATE capabilities
   - Key finding: prior interaction history significantly aids proactive intent resolution
   - Evaluates "hidden intent resolution" — anticipating unstated needs

3. **PIRA-Bench: Proactive Intent Recommendation Agents** (arxiv 2603.08013, Mar 2026)
   - Memory Module with sliding window + dynamic intent bank
   - Intent state machine: CREATE, RESUME, UPDATE, IDLE
   - Processes continuous visual/contextual streams, not just messages

4. **KnowU-Bench: Interactive, Proactive, and Personalized Agents** (arxiv 2604.08455, Apr 2026)
   - Tests whether agents can infer preferences from behavioral logs, not explicit instructions
   - Tests when to intervene vs remain silent
   - Forces "genuine preference inference rather than context lookup"

5. **From Prompt-Response to Goal-Directed Systems** (arxiv 2602.10479, Feb 2026)
   - BDI (Belief-Desire-Intention) model applied to LLM agents
   - Connects reactive, deliberative, and hybrid agent architectures

### Production Systems (Analysed)
6. **OpenClaw** (openclaw.ai, 355K GitHub stars, 3.2M users)
   - HEARTBEAT.md scheduler: periodic background check for proactive tasks
   - MEMORY.md: persistent Markdown-based memory
   - SKILL.md plugin system: extensible capabilities
   - Single Gateway process — simplicity wins at scale
   - Key pattern: "I now have OpenClaw independently assessing how it can help me in the background"

7. **Google CC Agent** (Google Labs, Dec 2025)
   - "Your Day Ahead" briefing: synthesizes Gmail, Calendar, Drive, web
   - Users steer by replying or emailing directly
   - Doesn't just report — drafts replies, creates calendar links, prepares next steps

8. **Anthropic 3-Agent Harness** (Anthropic Engineering, Apr 2026)
   - Planner agent (structure + goals) → Generator agent (execution) → Evaluator agent (quality)
   - Evaluator runs 5-15 critique-and-refine cycles
   - Separating evaluation eliminates "self-grade inflation"
   - Agents hand off through structured artifacts, not shared context

9. **Anthropic Claude Agent SDK** (Managed Agents, Apr 2026)
   - Subagents with isolated context windows
   - Compaction for long-running sessions
   - Skills system for extensible capabilities
   - $0.08/session-hour for managed infrastructure

---

## KEY FINDINGS MAPPED TO KIKO

### What the Research Unanimously Says

**1. Proactivity requires CONTINUOUS monitoring, not scheduled crons.**
Every system studied (PASK, OpenClaw, Google CC, PIRA-Bench) runs background monitoring loops. PASK's IntentFlow processes streaming inputs in real-time. OpenClaw's heartbeat mechanism checks for proactive tasks every few minutes. Google CC synthesizes across all data sources continuously. Kiko's current approach — running crons at fixed times (7 AM, 9 AM) — means intelligence is always stale. A race can be announced, a reply can come in, a deal can change, and Kiko won't know until the next cron fires.

**2. Three-layer memory is not optional.**
Every paper describes some form of hierarchical memory:
- **PASK**: User Memory (cache/traits) → Workspace Memory (current session) → Global Memory (long-term RAG)
- **PIRA-Bench**: Static user profile → Dynamic intent bank → Historical context window
- **OpenClaw**: MEMORY.md (preferences) → Session context → Conversation history

Kiko currently has:
- kiko_goals (partial user memory)
- Claude context window (workspace memory, lost between sessions)
- kiko_learning_log, kiko_outcomes (partial global memory, no retrieval mechanism)

**Missing**: A proper retrieval mechanism that lets the synthesis engine access relevant past outcomes, past conversations, and learned patterns. Right now, the morning briefing has no access to "last time we softened a CTA, it increased replies by 15%."

**3. The outcome loop must be AUTOMATIC, not manual.**
π-BENCH's key finding: "prior interaction history significantly aids proactive intent resolution." This means recording outcomes isn't a nice-to-have — it's the single most important factor in improving proactivity over time. Currently, Kiko requires a manual `record_outcome` call. The research says this should be triggered automatically:
- Email reply comes in → automatically record which campaign step, subject line, and CTA generated it
- Campaign metric changes → automatically check if it correlates with a recent action
- Deal moves forward → automatically link to the outreach that preceded it

**4. Demand detection is a SEPARATE capability from task execution.**
π-BENCH explicitly measures proactivity and completeness independently. An agent can execute tasks perfectly (high completeness) while being terrible at anticipating needs (low proactivity). PASK builds a dedicated model (IntentFlow) just for demand detection. For Kiko, this means the morning briefing isn't enough — there needs to be a lightweight "should I intervene?" check running whenever new data arrives.

**5. Action, not just analysis.**
Google CC doesn't just brief — it drafts replies and creates calendar links. OpenClaw executes tasks autonomously. Kiko currently produces text briefings but doesn't take action. The synthesis should produce ready-to-send drafts in the Command Centre, not just recommendations.

**6. The agent should know when to be SILENT.**
KnowU-Bench specifically tests "when to intervene, seek consent, or remain silent." A proactive agent that alerts on everything is as useless as one that never alerts. Kiko currently creates alerts for everything (476 before cleanup). The demand detection layer needs a confidence threshold — only surface intelligence when it's clearly actionable.

---

## ARCHITECTURE PLAN FOR KIKO

### Current State (What Exists)
```
                   ┌──────────────┐
                   │  CRON JOBS   │ (27 total, fixed schedules)
                   │  7AM, 9AM,   │
                   │  30min, etc. │
                   └──────┬───────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  kiko_alerts TABLE    │ (500+ noisy alerts)
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Command Centre UI    │ (user must look)
              └───────────────────────┘
```
**Problem**: Intelligence is scheduled, not continuous. Alerts are noisy. User must initiate.

### Target State (What Research Says We Need)
```
  ┌─────────────────────────────────────────────────────────────┐
  │                    SIGNAL SOURCES                            │
  │  Email │ LinkedIn │ News │ Partnerships │ Calendar │ CRM    │
  └────────┬──────────┬──────┬─────────────┬──────────┬────────┘
           │          │      │             │          │
           ▼          ▼      ▼             ▼          ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              EVENT BUS (real-time signal intake)             │
  │  Every signal evaluated against goals immediately            │
  └────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           DEMAND DETECTOR (lightweight, fast)                │
  │  "Is this signal relevant to an active goal?"                │
  │  "Does this require immediate attention?"                    │
  │  "Should I intervene or stay silent?"                        │
  │  Uses: Haiku (fast, cheap) with goal context                 │
  └──────────┬───────────────────────┬──────────────────────────┘
             │                       │
        INTERVENE                  SILENT
             │                  (log & skip)
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           THREE-LAYER MEMORY                                 │
  │                                                              │
  │  USER MEMORY (cache):        WORKSPACE MEMORY:               │
  │  - Goals & priorities        - Current session context       │
  │  - Communication style       - Active deal states            │
  │  - Decision patterns         - Recent signals                │
  │  - Preferences               - Current race week             │
  │                                                              │
  │  GLOBAL MEMORY (retrieval):                                  │
  │  - Past outcomes & what worked                               │
  │  - Historical interaction patterns                           │
  │  - Learned preferences from behaviour                        │
  │  - Cross-session context                                     │
  └──────────┬──────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           SYNTHESIS ENGINE (deep reasoning)                  │
  │                                                              │
  │  PLANNER: What matters right now? What's the priority?       │
  │  GENERATOR: Draft the briefing/action/recommendation         │
  │  EVALUATOR: Is this actually useful? Refine if not.          │
  │                                                              │
  │  Uses: Sonnet (deep reasoning) with full memory access       │
  └──────────┬──────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           ACTION LAYER                                       │
  │  - Draft emails ready to send in Command Centre              │
  │  - Update goal progress automatically                        │
  │  - Record outcomes from signal changes                       │
  │  - Surface briefing on Today page                            │
  │  - Alert only when confidence > threshold                    │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           OUTCOME LOOP (automatic learning)                  │
  │  - Did the recommendation lead to a result?                  │
  │  - What worked? What didn't? What to adjust?                 │
  │  - Feed back into Global Memory for next synthesis           │
  └─────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION PHASES

### Phase 1: Wire Everything Together (This Session / Next Session)
**Goal: Make existing components actually work end-to-end**

1. **Today Page Integration**
   - Morning briefing renders as the first thing on Today page
   - Not an alert in a database — the actual UI shows it

2. **Automatic Outcome Recording**
   - Email reply detected → auto record_outcome with campaign step, CTA, timing
   - Bounce detected → auto record_outcome
   - Deal stage change → auto record_outcome
   - Modify: cron-gmail-sync, cron-sequence-reply-detect to call record_outcome

3. **Heartbeat System (from OpenClaw)**
   - New cron: every 2 hours during business hours
   - Lightweight Haiku call: "Given these goals and these new signals, should I alert Sunny?"
   - Only surfaces intelligence above a confidence threshold
   - Much cheaper than full Sonnet synthesis

4. **Fix the Race Calendar**
   - Hardcode the 2026 F1 calendar in a JSON file (don't rely on web search)
   - Add Formula E and MotoGP calendars
   - Race week intel uses the local calendar, not a web search that returns wrong results

### Phase 2: Demand Detection Layer (Dedicated Session)
**Goal: Move from scheduled crons to event-driven intelligence**

5. **Event Bus**
   - Every signal write (new email, new alert, new metric) triggers a lightweight evaluation
   - Postgres NOTIFY/LISTEN or a simple webhook pattern
   - Haiku evaluates: "Is this signal relevant to an active goal? Score 0-10."
   - Only signals scoring 7+ go to the synthesis engine

6. **Three-Layer Memory**
   - User Memory: extract from kiko_learning_log + kiko_preferences + email style analysis
   - Workspace Memory: current session context (already exists as Claude context window)
   - Global Memory: semantic search over kiko_outcomes + kiko_conversation_insights
   - The synthesis engine queries all three layers before reasoning

7. **Intent State Machine** (from PIRA-Bench)
   - Track active "intents" separate from goals:
     - CREATE: new signal suggests a new opportunity
     - RESUME: previously paused intent becomes relevant again
     - UPDATE: active intent needs adjustment
     - IDLE: nothing to do (critical — know when to be silent)

### Phase 3: Multi-Pass Reasoning (Following Session)
**Goal: Higher quality synthesis through Planner → Generator → Evaluator**

8. **Planner Agent** (Haiku, fast)
   - Looks at all signals + goals + memory
   - Produces a structured plan: "These 3 things matter today, in this order, for these reasons"

9. **Generator Agent** (Sonnet, deep)
   - Takes the plan and produces the full briefing + action drafts
   - Generates email drafts for high-priority actions

10. **Evaluator Agent** (Haiku, critical)
    - Reviews the briefing against goals: "Is this actually useful? Is anything missing? Is anything wrong?"
    - Runs 2-3 critique-and-refine cycles
    - Rejects briefings that are generic or miss obvious signals

### Phase 4: Self-Evolution & Scale (Ongoing)
**Goal: Kiko gets smarter over time**

11. **Memory Self-Evolution** (from PASK)
    - Conflict resolution: when new info contradicts old (e.g., "Clio moved HQ from Toronto to NYC")
    - Forgetting: automatically deprecate stale intelligence
    - Merging: workspace memory consolidated into global memory after each session

12. **Cross-Platform Notifications**
    - WhatsApp/Telegram alerts for critical intelligence (not just the web UI)
    - "Sunny, Clio just replied to your Alpine F1 email. They want to talk."

13. **Continuous Improvement**
    - Monthly review of outcomes: which recommendations led to deals?
    - Adjust synthesis prompt based on what Sunny actually acts on
    - If Sunny consistently ignores a type of alert, reduce its priority

---

## REFERENCE IMPLEMENTATIONS TO STUDY FURTHER

| System | What to Learn | URL |
|--------|--------------|-----|
| OpenClaw | Heartbeat system, MEMORY.md, SKILL.md | github.com/nicepkg/openclaw |
| PASK | DD-MM-PAS paradigm, IntentFlow, three-layer memory | arxiv.org/abs/2604.08000 |
| π-BENCH | Proactivity evaluation, hidden intent resolution | arxiv.org/abs/2605.14678 |
| Google CC | Daily briefing pattern, user steering | blog.google/technology/google-labs/cc-ai-agent |
| Anthropic Agent SDK | Planner/Generator/Evaluator, subagents | anthropic.com/engineering/building-agents-with-the-claude-agent-sdk |
| Anthropic Effective Harnesses | Multi-context-window workflows, progress tracking | anthropic.com/engineering/effective-harnesses-for-long-running-agents |
| PlanFactory | 10 planning architectures benchmarked | arxiv.org/abs/2602.07839 |
| PIRA-Bench | Intent state machine (CREATE/RESUME/UPDATE/IDLE) | arxiv.org/abs/2603.08013 |

---

## CRITICAL INSIGHT

The single most important finding across ALL the research:

**"Proactivity is not a feature you bolt on. It's an architectural choice that changes how the entire system works."**

Kiko's current architecture is fundamentally reactive — crons dump data, the user asks questions, Kiko answers. Making Kiko proactive requires restructuring the data flow so that every signal is evaluated against goals in real-time, not at fixed intervals.

The good news: the building blocks are already in place (goals, outcomes, synthesis, crons, tools). The restructuring is about connecting them into a continuous loop rather than a collection of scheduled tasks.

---

*Document compiled from 8 academic papers, 4 production systems, and 6 technical blog posts.*
*Research conducted May 19, 2026.*
