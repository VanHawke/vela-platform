# PHASE 2 ARCHITECTURE — Event-Driven Intelligence
# Builds on Phase 1 (goals, outcomes, briefing, heartbeat)
# Goal: Move from scheduled intelligence to real-time intelligence

## 2A. EVENT-DRIVEN DEMAND DETECTION

### Problem
The heartbeat runs every 2 hours. A reply can come in at 2:01 PM and
Kiko won't evaluate it against goals until 4:00 PM. By then the outreach
window may have passed.

### Solution: Signal Evaluation on Every Write
When a signal enters the system (reply, bounce, metric change, news article),
evaluate it immediately against active goals using Haiku.

### Implementation
Use Postgres NOTIFY/LISTEN or a webhook pattern:

1. Add a Supabase database webhook on INSERT to kiko_email_tracking (replies)
2. Webhook calls /api/signal-evaluator with the new row
3. Signal evaluator loads active goals, scores the signal 0-10
4. If score >= 7, creates a proactive_heartbeat alert immediately
5. If score < 7, logs and exits (SILENT principle)

### Tables That Should Trigger Evaluation
- kiko_email_tracking (reply detected, bounce detected)
- kiko_alerts (new high-severity alert from any cron)
- kiko_outreach_queue (campaign metric changes)
- kiko_news_articles (high-relevance news)

### New File: api/signal-evaluator.js
- Lightweight Haiku call (~200ms, $0.001 per evaluation)
- Loads goals from kiko_goals
- Loads race context from race-calendars.json
- Evaluates: "Is this signal relevant to an active goal? Score 0-10"
- Only alerts if >= 7

### Risk: Cost
At 50 signals/day * $0.001 = $0.05/day. Negligible.

---

## 2B. THREE-LAYER MEMORY

### Problem
Kiko's system prompt loads goals and outcomes, but doesn't have access to
learned patterns, past conversation insights, or cross-session context.
When Sunny says "do the same thing we did for the Haas campaign," Kiko
can't reference that past context.

### Solution: Hierarchical Memory Access

#### Layer 1: User Memory (Cache) — Already Exists Partially
- kiko_goals (strategic objectives)
- kiko_preferences (decision patterns)
- kiko_user_profiles (communication style)
- kiko_personal_context (personal facts)
→ Already loaded into system prompt. No change needed.

#### Layer 2: Workspace Memory — Already Exists
- Claude context window (current conversation)
- kiko_conversation_insights (session summaries)
→ Already loaded. No change needed.

#### Layer 3: Global Memory (Retrieval) — MISSING
- kiko_outcomes (past outcomes — what worked, what failed)
- kiko_learning_log (learned patterns from past sessions)
- Past conversation search (semantic search over chat history)
→ Need: A retrieval function that searches these tables semantically
→ Implementation: Use Haiku to generate search queries, then Supabase
  text search over outcomes and learning log

### New: Global Memory Retrieval Function
When the morning synthesis or heartbeat needs context:
1. Generate search query from current signal + goal
2. Search kiko_outcomes for similar past actions
3. Search kiko_learning_log for relevant patterns
4. Include top 3 results in the synthesis prompt

### File Changes
- NEW: api/lib/memory-retrieval.js
- MODIFIED: api/cron-morning-synthesis.js (add memory retrieval step)
- MODIFIED: api/cron-heartbeat.js (add memory retrieval for high-scoring signals)

---

## 2C. INTENT STATE MACHINE (from PIRA-Bench)

### Problem
Kiko tracks goals but not active "intents" — things she's working toward
in the moment. A goal is "Close Alpine F1 Legal AI category." An intent is
"Draft Canada-themed outreach for Clio by Wednesday."

### Solution: Intent Tracking Table

### New Table: kiko_intents
- id, goal_id, title, status (active/suspended/completed/abandoned)
- created_at, due_date, last_actioned_at
- context (what triggered this intent)
- next_action (what should happen next)

### State Machine
- CREATE: New signal suggests a new action (e.g., "Canadian GP in 5 days" → create intent "Draft Canada outreach")
- RESUME: Previously suspended intent becomes relevant (e.g., "Joe Paulo back from leave" → resume Helsing intent)
- UPDATE: Active intent needs adjustment (e.g., "Campaign CTA needs softening" → update intent with new approach)
- IDLE: Nothing to do — critical for knowing when to be SILENT

### Integration
- Morning synthesis checks active intents and reports on them
- Heartbeat creates new intents when signals score >= 7
- Kiko can list/update intents via conversation

---

## 2D. FORMULA E + MOTOGP CALENDARS

### Simple Addition
- Add formula_e_2026 and motogp_2026 arrays to race-calendars.json
- Update getUpcomingRaces() to check all three series
- Update race-week-intel to generate separate alerts per series

---

## BUILD ORDER FOR PHASE 2
1. 2D — FE/MotoGP calendars (15 min, zero risk)
2. 2A — Signal evaluator (30 min, new file, moderate risk)
3. 2C — Intent state machine (20 min, new table + operations)
4. 2B — Global memory retrieval (45 min, moderate complexity)

## VERIFICATION PLAN
After each component:
1. Syntax check
2. Deploy to Hetzner
3. Trigger manually and verify output
4. Check Supabase for correct writes
5. Ask Kiko a question and verify she uses the new capability
