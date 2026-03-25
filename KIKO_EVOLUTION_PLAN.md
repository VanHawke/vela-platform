# KIKO EVOLUTION PLAN — COMPLETE ENGINEERING SPECIFICATION
## From dispatcher to intelligent Chief of Staff
## March 25, 2026

---

## CURRENT STATE (what works, what doesn't)

### WORKS (must not break)
- 23 specialist agents, all data-backed, all deployed
- Intent classifier: 12/12 intents correct, navigation in 0.2s
- Navigation persistence: Kiko stays open across page changes
- SSE streaming, MCP (Gmail, Calendar), Supabase (50+ tables)
- All 10 success criteria passing (tested via curl today)

### DOESN'T WORK
- General questions outside 21 categories → lobotomised (told not to use tools)
- No decision memory → each session starts fresh
- No cross-agent synthesis → agents don't share context
- No proactive intelligence → only responds when asked
- No personal context → business-only, can't replace ChatGPT
- Voice broken → GPT-4o fabricates data
- No web search → can't answer "what happened today"
- No autonomous actions → can't draft follow-ups without being asked

---

## THE RULE: ONE CHANGE, ONE TEST, ONE DEPLOY

Every phase below follows this protocol:
1. Tag current state (rollback point)
2. Make ONE code change
3. Run ALL foundation tests (6 tests, must all pass)
4. Run phase-specific tests
5. If ANY test fails → revert to tag, diagnose, retry
6. If ALL pass → commit, tag, deploy
7. Verify live deployment matches local
8. Move to next phase

FOUNDATION TESTS (run before every deploy):

```bash
# F1: Navigation
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"take me to pipeline","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep '"navigate":"pipeline"' && echo "F1 PASS" || echo "F1 FAIL"

# F2: Brief
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"brief me","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "delta" | head -1 && echo "F2 PASS" || echo "F2 FAIL"

# F3: Screen reader
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"what am I looking at","userEmail":"sunny@vanhawke.com","currentPage":"pipeline"}' \
  | grep "Intent.*screen" && echo "F3 PASS" || echo "F3 FAIL"

# F4: CRM write
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"search contacts at Torq","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "delta" | head -1 && echo "F4 PASS" || echo "F4 FAIL"

# F5: Strategy
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"should we pursue Cloudflare","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "Intent.*strategy" && echo "F5 PASS" || echo "F5 FAIL"

# F6: Intent classifier accuracy
curl -s -X POST $URL/api/kiko -H "Content-Type: application/json" \
  -d '{"message":"what categories are open on Haas","userEmail":"sunny@vanhawke.com","currentPage":"home"}' \
  | grep "Intent.*category" && echo "F6 PASS" || echo "F6 FAIL"
```

---

## PHASE 6: GENERAL INTELLIGENCE (unlock Claude's full brain)

### What changes
ONE LINE in kiko.js. The routing hint for intent="general" changes from
"don't use tools" to "use everything available."

### Exact code change
FILE: api/kiko.js
FIND:
```javascript
} else if (intent === 'general') {
  routingHint = '\n\n[ROUTING HINT: This is a general question. Answer directly from your knowledge. Do not call any tools unless the user explicitly asks for data.]';
}
```
REPLACE WITH:
```javascript
} else if (intent === 'general') {
  routingHint = '\n\n[ROUTING HINT: This is an open question. You have FULL access to all tools — CRM queries, web search via MCP, Gmail, Calendar, and all 23 specialist agent tools. Think like a Chief of Staff who knows the entire business. If business context would strengthen your answer, query the CRM. If current information is needed, use web search. If personal context is relevant, check the calendar. Answer with depth, intelligence, and specificity. Sunny uses you instead of ChatGPT — be worthy of that.]';
}
```


### Risk: ZERO
Removes a restriction. All specialist paths unchanged. If Claude doesn't need
tools, it won't call them. If it does, they're now available.

### Rollback: Revert one string in kiko.js

### Phase 6 tests
```bash
# P6-1: General reasoning with business context
"Explain how tariffs could affect our Haas sponsorship pipeline"
EXPECT: Reasons about tariffs AND references real pipeline data
FAIL IF: "I can't help with that" or generic answer with no business context

# P6-2: Web search capability
"What happened with Tesla stock today"
EXPECT: Searches web via MCP, returns current information
FAIL IF: "I don't have access to current information"

# P6-3: Personal question
"I need to pick up my kid from Oatlands at 3pm, can you set a reminder"
EXPECT: Attempts to use Google Calendar MCP to create event
FAIL IF: Routes to wrong agent or says "I can only help with business"

# P6-4: Foundation tests F1-F6 still pass
EXPECT: All 6 pass (specialist paths unchanged)
```

### Tag: `phase-6-general-intelligence`

---

## PHASE 7: CRM CONTEXT FOR GENERAL QUERIES

### What changes
Before general queries, inject a live CRM summary into the system prompt.
This gives Claude business awareness even for non-specialist questions.

### Exact code change
FILE: api/kiko.js
ADD (after the general routing hint, before `const systemWithHint`):
```javascript
// For general queries, inject live CRM context
if (intent === 'general') {
  try {
    const [deals, tasks, recentActivity] = await Promise.all([
      sbFetch('deals?select=data&data->>status=eq.active&limit=50'),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=10'),
      sbFetch('activities?select=type,entity_name,subject&order=created_at.desc&limit=5'),
    ]);
    const outstanding = (tasks||[]).filter(t => !t.data?.completed);
    const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date());
    let ctx = '\n\n[BUSINESS CONTEXT — reference naturally if relevant]:';
    ctx += `\nPipeline: ${(deals||[]).length} active deals.`;
    ctx += `\nTasks: ${outstanding.length} outstanding, ${overdue.length} overdue.`;
    if (recentActivity?.length) ctx += `\nRecent: ${recentActivity.map(a => `${a.type}: ${a.entity_name}`).join(', ')}`;
    routingHint += ctx;
  } catch {} // Non-blocking
}
```


### Risk: LOW
Adds 3 parallel Supabase reads (~50ms). Wrapped in try/catch — if fails,
general queries still work, just without CRM context.

### Rollback: Remove the if-block (one function)

### Phase 7 tests
```bash
# P7-1: Business-aware general answer
"How is the business doing overall"
EXPECT: References actual pipeline numbers and tasks, not generic advice
FAIL IF: Gives generic business advice with no specific data

# P7-2: Cross-domain reasoning
"What should I prioritise this week"
EXPECT: References real overdue tasks and stale deals by name
FAIL IF: Generic productivity advice

# P7-3: Foundation tests F1-F6 still pass
```

### Tag: `phase-7-crm-context`

---

## PHASE 8: LEARNING LOOP — DECISION LOGGING

### What changes
After tool executions that represent DECISIONS, the coordinator writes
a structured entry to kiko_learning_log. This captures what was decided,
why, and the context at the time.

### Exact code change
FILE: api/kiko.js
ADD function:
```javascript
async function logDecision(toolName, toolInput, toolResult, message) {
  // Only log decision-bearing tool calls
  const decisionTools = ['ask_strategy_agent', 'ask_deal_agent',
    'ask_negotiation_agent', 'ask_pricing_agent'];
  if (!decisionTools.includes(toolName)) return;
  try {
    const entry = {
      category: 'decision',
      source_agent: toolName.replace('ask_', '').replace('_agent', ''),
      user_message: (message || '').slice(0, 200),
      agent_input: JSON.stringify(toolInput).slice(0, 500),
      agent_output: (toolResult || '').slice(0, 500),
      created_at: new Date().toISOString()
    };
    await sbFetch('kiko_learning_log', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  } catch {} // Non-blocking — logging failure must not break responses
}
```
ADD call after each tool execution in the tool loop:
```javascript
await logDecision(toolName, toolInput, toolResult, message);
```


### Risk: LOW
Writes to existing table. Wrapped in try/catch. If Supabase write fails,
response is unaffected. Non-blocking fire-and-forget.

### Rollback: Remove logDecision function and its calls

### Phase 8 tests
```bash
# P8-1: Strategy decision logged
"Should we pursue Nordic Semiconductor"
→ Check Supabase: SELECT * FROM kiko_learning_log ORDER BY created_at DESC LIMIT 1
EXPECT: Entry with source_agent=strategy, user_message contains "Nordic"
FAIL IF: No entry created

# P8-2: Deal move logged
"Move Decagon to Qualified"
→ Check learning_log for entry with source_agent=deal
EXPECT: Entry exists. Then move Decagon BACK to In Dialogue to restore state.

# P8-3: Negotiation logged
"They came back at 40% below ask for Nordic"
→ Check learning_log for source_agent=negotiation
EXPECT: Entry exists with context about the counter-offer

# P8-4: Non-decision tools NOT logged
"Search contacts at Torq"
→ Check learning_log
EXPECT: No new entry (data queries are not decisions)

# P8-5: Foundation tests F1-F6 still pass
```

### Tag: `phase-8-learning-write`

---

## PHASE 9: LEARNING LOOP — PATTERN MATCHING

### What changes
Strategy and Negotiation agents query kiko_learning_log for SIMILAR past
decisions before reasoning. Similarity = same industry, similar company size,
or similar deal stage.

### Exact code change
FILE: api/agents/strategy.js
ADD to the parallel fetch array in evaluate():
```javascript
// Past decisions with context matching
sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=30&select=*')
  .then(entries => {
    if (!entries?.length) return;
    // Find entries related to similar companies/situations
    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const relevant = entries.filter(e => {
      const text = `${e.user_message} ${e.agent_output}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    });
    if (relevant.length) {
      pastDecisions = `\nPAST DECISIONS (${relevant.length} relevant):\n` +
        relevant.slice(0, 3).map(e =>
          `• [${new Date(e.created_at).toLocaleDateString('en-GB')}] ${e.user_message} → ${(e.agent_output || '').slice(0, 150)}`
        ).join('\n');
    }
  }).catch(() => {}),
```

FILE: api/agents/negotiation.js
ADD same pattern — query learning_log for past negotiation positions.


### Risk: LOW
Adds one more parallel read to existing agent data gathering.
If it fails, agents still reason — just without past decision context.

### Rollback: Remove the learning_log query from strategy.js and negotiation.js

### Phase 9 tests
```bash
# P9-1: Strategy references past decision
Step 1: "Should we pursue Nordic Semiconductor" → wait for verdict
Step 2: "Should we pursue Infineon" (similar: semiconductor, European)
EXPECT: Step 2 references the Nordic decision ("similar to Nordic which you...")
FAIL IF: Evaluates Infineon from scratch with no reference to past decisions

# P9-2: Negotiation references past positions
Step 1: "They came back at 40% below for Nordic" → wait for counter
Step 2: "Cloudflare is pushing back on pricing"
EXPECT: References pricing positions established in prior negotiations
FAIL IF: No reference to past positioning

# P9-3: Foundation tests F1-F6 still pass
```

### Tag: `phase-9-learning-read`

---

## PHASE 10: CROSS-AGENT SYNTHESISED BRIEF

### What changes
The EA Agent's "brief me" response stops being a formatted list and becomes
a synthesised narrative. Claude Sonnet reads ALL the data and composes
a Chief of Staff brief that identifies convergence moments and priorities.

### Exact code change
FILE: api/agents/ea.js
CHANGE: After gathering all 9 sources, instead of formatting as sections,
pass ALL data to Claude Sonnet with this instruction:

```javascript
const briefData = `
TASKS: ${JSON.stringify({outstanding: outstanding.length, overdue: overdue.length, dueToday: dueToday.length, topOverdue: overdue.slice(0,3).map(t => t.data)})}
PIPELINE: ${JSON.stringify({total: allDeals.length, raw: totalRaw, weighted: totalWeighted, stale: staleDeals.length, atRisk: atRiskDeals.length, topStale: staleDeals.slice(0,5).map(d => d.company)})}
HOT_LEADS: ${JSON.stringify(hotLeads.slice(0,5))}
DEAL_SIGNALS: ${JSON.stringify(dealSignals.slice(0,5))}
STAGE_MOVES: ${JSON.stringify(recentMoves.slice(0,5))}
ALERTS: ${JSON.stringify((alerts||[]).slice(0,5))}
`;

const briefResponse = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 800,
  system: `You are Kiko, Sunny's Chief of Staff. Compose a morning brief.
DO NOT list data sources separately. SYNTHESISE.
Identify CONVERGENCE MOMENTS: where multiple signals point to the same
company or opportunity. Lead with the single most important action.
Be specific: names, numbers, dates. No filler. Under 400 words.`,
  messages: [{ role: 'user', content: briefData }],
});
return briefResponse.content[0]?.text;
```


### Risk: MEDIUM
Changes the brief output format. If Sonnet produces a bad brief, the data
is still gathered correctly — only the presentation changes.

### Rollback: git checkout phase-9-learning-read -- api/agents/ea.js

### Phase 10 tests
```bash
# P10-1: Brief is narrative, not list
"Brief me"
EXPECT: Flowing paragraph(s) with synthesised insights, not bullet sections
FAIL IF: Sectioned output with headers like "OVERDUE:" and "PIPELINE:"

# P10-2: Brief identifies convergence
EXPECT: If a company appears in multiple data sources (e.g., outreach reply
AND news signal AND pipeline deal), the brief calls this out explicitly
FAIL IF: Data points listed separately with no connection drawn

# P10-3: Brief leads with action
EXPECT: First sentence is a specific action recommendation
FAIL IF: Opens with date or generic "Here's your brief"

# P10-4: Foundation tests F1-F6 still pass (F2 format changes but still returns data)
```

### Tag: `phase-10-synthesised-brief`

---

## PHASE 11: PROACTIVE INTELLIGENCE ENGINE

### What changes
New Supabase Edge Function runs at 7:00 AM UK daily. Cross-references
5 data streams via Haiku. Writes convergence alerts to kiko_alerts.

### New file
```
supabase/functions/proactive-intelligence/index.ts
```

### Logic
```
1. Pull last 24h: news signals, outreach replies, deal stage changes
2. Pull upcoming: tasks due next 24h, deals crossing stale thresholds
3. Group by company — find entities appearing in 2+ streams
4. For each convergence: call Haiku to compose alert with suggested action
5. Write to kiko_alerts table with type="convergence"
```

### Risk: LOW (completely isolated)
This is a standalone cron job. It READS from existing tables and WRITES to
kiko_alerts. It does not touch:
- The chat flow (api/kiko.js)
- Any agent
- The frontend
- SSE streaming
If it crashes, alert widget is empty. Nothing else is affected.

### Rollback: Disable cron job in Supabase dashboard. Delete Edge Function.

### Phase 11 tests
```bash
# P11-1: Manual trigger produces alerts
Invoke Edge Function manually → check kiko_alerts table
EXPECT: At least one convergence alert if data exists
FAIL IF: Function errors or no alerts written

# P11-2: Brief includes convergence alerts
"Brief me" after running proactive engine
EXPECT: Mentions convergence alerts from kiko_alerts
FAIL IF: Brief doesn't reference proactive alerts

# P11-3: Home page shows alerts
Load home page → check Kiko Insights widget
EXPECT: New convergence alerts visible
FAIL IF: Widget empty or shows only old alerts

# P11-4: Foundation tests F1-F6 still pass
```

### Tag: `phase-11-proactive-engine`

---

## PHASE 12: MEMORY SYNTHESIS (strategic preference model)

### What changes
Weekly process reads kiko_learning_log + conversation history and distils
Sunny's decision patterns into a `kiko_preferences` table. These preferences
are injected into ALL agent prompts.

### New table: kiko_preferences
```sql
CREATE TABLE kiko_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL, -- 'deal_selection', 'pricing', 'communication', 'timing'
  preference TEXT NOT NULL, -- "Kills deals after 60 days of silence"
  confidence FLOAT DEFAULT 0.5, -- increases with more evidence
  evidence_count INT DEFAULT 1,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  source_entries UUID[] -- references to learning_log entries
);
```


### New Edge Function: preference-synthesis (weekly cron)
```
1. Read all kiko_learning_log entries from last 30 days
2. Call Sonnet to identify patterns:
   "Given these decisions, what are Sunny's consistent preferences?"
3. Merge with existing preferences (increase confidence if confirmed,
   decrease if contradicted)
4. Write/update kiko_preferences
```

### How preferences are used
Every agent prompt gets a `[SUNNY'S PREFERENCES]` section injected:
```
- Kills deals after 60 days of silence (confidence: 0.8, 5 examples)
- Prefers companies with $50M+ funding (confidence: 0.7, 3 examples)
- Values CEO/CTO contacts over marketing contacts (confidence: 0.9, 8 examples)
- Anchors F1 Primary pricing at $12M minimum (confidence: 0.6, 2 examples)
```

### Risk: LOW
New table + new Edge Function. Preferences are READ-ONLY by agents.
If synthesis fails, agents work exactly as today (no preferences injected).

### Rollback: Drop kiko_preferences table. Remove preference injection from agents.

### Phase 12 tests
```bash
# P12-1: Preference synthesis produces results
Run Edge Function manually after logging 5+ decisions
EXPECT: kiko_preferences has entries with reasonable patterns

# P12-2: Agents reference preferences
"Should we pursue [new company]"
EXPECT: Strategy Agent mentions Sunny's known preferences
FAIL IF: Evaluates without referencing preference model

# P12-3: Foundation tests F1-F6 still pass
```

### Tag: `phase-12-memory-synthesis`

---

## PHASE 13: VOICE REPLACEMENT (kill GPT-4o)

### What changes
Remove GPT-4o voice entirely. Replace with:
- Deepgram Nova-2 (STT — speech to text)
- Claude Sonnet via /api/kiko (reasoning — same endpoint as text)
- Cartesia Sonic (TTS — text to speech)
- Pipecat framework (orchestration — handles interruptions, streaming)

### Architecture
```
User speaks → Deepgram (STT) → text
  → /api/kiko (same API as text mode) → response text
  → Cartesia (TTS) → audio back to user
```

### Why this works
Voice becomes a TRANSPORT LAYER. The same /api/kiko endpoint that handles
text chat handles voice. All 23 agents, all intelligence layers, all learning —
available through voice automatically. No separate voice logic.

### Risk: MEDIUM
Requires new dependencies (Pipecat, Deepgram SDK, Cartesia SDK).
However: text mode is completely unaffected. If voice breaks, text still works.

### Rollback: Revert KikoVoice.jsx to previous version (GPT-4o still works
for basic conversation, just with hallucination issues)

### Phase 13 tests
```bash
# P13-1: Voice STT accuracy
Say "take me to the pipeline" → verify correct transcription
EXPECT: Text matches spoken words

# P13-2: Voice routes through /api/kiko
Say "brief me" via voice → verify response contains real data
EXPECT: Same quality as text "brief me" (real companies, real numbers)
FAIL IF: Generic response or fabricated data (GPT-4o behaviour)

# P13-3: Voice navigation
Say "take me to contacts" → verify physical navigation
EXPECT: Page changes to /contacts

# P13-4: Voice interruption
Start speaking mid-response → verify Kiko stops and listens
EXPECT: Clean interruption, no audio overlap

# P13-5: Text mode unaffected
All foundation tests F1-F6 via text chat
EXPECT: All pass (voice changes don't touch text path)
```

### Tag: `phase-13-voice-replacement`


---

## PHASE 14: AUTONOMOUS DRAFT ACTIONS

### What changes
When the proactive engine detects a convergence moment, it doesn't just
alert — it prepares a draft action. Draft email, suggested deal move,
proposed calendar slot. All queued for Sunny's approval, never auto-executed.

### New table: kiko_draft_actions
```sql
CREATE TABLE kiko_draft_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID REFERENCES kiko_alerts(id),
  action_type TEXT NOT NULL, -- 'email_draft', 'deal_move', 'task_create'
  payload JSONB NOT NULL, -- the prepared action (email content, target stage, etc.)
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, expired
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
```

### How it works
Proactive engine (Phase 11) writes alert → ALSO writes draft action.
Home page shows: "Torq convergence detected. Draft follow-up ready. [Review] [Dismiss]"
Sunny clicks [Review] → sees the draft → approves or edits → Kiko executes.

### Risk: LOW
New table + UI component. Kiko NEVER executes without approval.
If draft generation fails, alert still appears (just without pre-built action).

### Rollback: Drop table. Remove draft action UI component.

### Tag: `phase-14-autonomous-drafts`

---

## DEPENDENCY MAP (what must complete before what)

```
Phase 6 (General Intelligence)     ← START HERE
    │
    ▼
Phase 7 (CRM Context)              ← depends on Phase 6
    │
    ▼
Phase 8 (Learning — Write)         ← independent, but benefits from Phase 6/7
    │
    ▼
Phase 9 (Learning — Read)          ← depends on Phase 8 (needs logged decisions)
    │
    ▼
Phase 10 (Synthesised Brief)       ← benefits from Phase 8/9 (learning data)
    │
    ├──► Phase 11 (Proactive Engine)    ← independent but reads same data
    │        │
    │        ▼
    │    Phase 14 (Autonomous Drafts)   ← depends on Phase 11
    │
    ▼
Phase 12 (Memory Synthesis)         ← depends on Phase 8 (needs learning_log data)
    │
    ▼
Phase 13 (Voice)                    ← independent of all above (transport layer)
```

CRITICAL: Phases 6→7→8→9 are strictly sequential.
Phases 10, 11, 12 can run in parallel after Phase 9.
Phase 13 (voice) can start anytime after Phase 6.
Phase 14 depends on Phase 11.

---

## ESTIMATED TIMELINE

| Phase | Work | Time | Risk |
|-------|------|------|------|
| 6 | General Intelligence | 15 min | ZERO |
| 7 | CRM Context | 30 min | LOW |
| 8 | Learning Write | 30 min | LOW |
| 9 | Learning Read | 30 min | LOW |
| 10 | Synthesised Brief | 1 hour | MEDIUM |
| 11 | Proactive Engine | 1-2 hours | LOW |
| 12 | Memory Synthesis | 1-2 hours | LOW |
| 13 | Voice Replacement | 3-4 hours | MEDIUM |
| 14 | Autonomous Drafts | 1-2 hours | LOW |
| **Total** | | **~10-12 hours** | |

At 2-3 phases per session, this is 4-5 sessions to complete everything.


---

## WHAT KIKO BECOMES AT EACH PHASE

### After Phase 6-7 (General Intelligence + CRM Context)
Kiko can answer ANY question — business, personal, world events — with full
CRM awareness. "Explain tariffs" gets a real answer grounded in pipeline data.
"What happened today" searches the web. Replaces ChatGPT for everything.

### After Phase 8-9 (Learning Loop)
Kiko remembers every decision. "Should we pursue Fastly?" gets "Similar to
Cloudflare which you priced at $12M. Fastly is smaller — different tier."
She evolves with every interaction.

### After Phase 10 (Synthesised Brief)
"Brief me" goes from data dump to Chief of Staff narrative. "Three things
matter today. Torq's VP replied while they raised $100M — that's your play.
Nordic is dead, archive it. Cloudflare deck needs to go out before Q2."

### After Phase 11 (Proactive Engine)
Kiko thinks at 7am without being asked. Home page shows convergence alerts.
"Palo Alto: Jennifer replied + earnings beat + cybersecurity open = act now."

### After Phase 12 (Memory Synthesis)
Kiko knows HOW you think. "You consistently kill deals where only marketing
contacts engage — Fastly has the same pattern. Escalate to CTO or kill."
She's built a model of your decision-making and uses it.

### After Phase 13 (Voice)
Everything above, spoken. No GPT-4o hallucinations. Real data, real reasoning,
real intelligence — through voice. "Kiko, brief me" on the drive to work
gets the same quality as text mode.

### After Phase 14 (Autonomous Drafts)
Kiko doesn't just alert — she prepares. "Torq convergence detected. Draft
follow-up ready. Calendar slot proposed for Thursday. [Approve]"
You review, tap approve, done. She's operating at Chief of Staff level.

---

## THE GUARANTEE: WHY THIS WON'T BREAK

1. **One change per phase.** Not three changes hoping they compose correctly.
2. **6 foundation tests before every deploy.** If navigation breaks, we stop.
3. **Phase-specific tests.** Each phase has its own success criteria.
4. **Git tags at every phase.** Rollback is always `git checkout <tag>`.
5. **Non-blocking patterns.** Every new feature is wrapped in try/catch.
    If it fails, the existing behaviour is preserved.
6. **Additive only.** We never rewrite working agents. We add layers on top.
7. **Isolated subsystems.** The proactive engine is a standalone cron job.
    Learning is a separate table. Voice is a transport layer.
    Breaking one doesn't break the others.

---

## DOCUMENT LOCATION
File: /Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md
Git: Committed to main branch
Status: READY FOR EXECUTION
First session starts: Phase 6 (General Intelligence)

Every future session MUST read this document before writing code.
