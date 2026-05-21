# KIKO INTELLIGENCE ARCHITECTURE — Based on Anthropic's Context Engineering (2026)
# Research Sources: Anthropic Context Engineering blog, Persistent Memory (Apr 23),
# Dreaming (May 6), Effective Harnesses, Claude Code patterns

## THE CORE PROBLEM

Kiko's system prompt is ~37,000 tokens:
- KIKO_BIBLE.md: ~15,000 tokens
- kiko-self-knowledge.js: ~8,000 tokens  
- Goals/intents/outcomes: ~1,000 tokens
- Morning briefing: ~3,000 tokens
- Tool definitions: ~10,000 tokens

Anthropic's research says: "context rot — as tokens increase, the model's ability
to accurately recall information decreases." Every unnecessary token in the system
prompt REDUCES Kiko's intelligence. We're drowning her in instructions.

## THE FIX (from Anthropic)

"Find the SMALLEST set of high-signal tokens that maximize the likelihood
of your desired outcome."

### PHASE 5A: Slim System Prompt (IMMEDIATE)

Current: 37K tokens of system prompt. Everything loaded every message.
Target: ~8K tokens. Identity + behavior + tools only.

KEEP in system prompt:
- Identity (who Kiko is — 200 tokens)
- Decision framework (how to think — 500 tokens)  
- Reasoning justification template (300 tokens)
- Active goals (5 lines — 200 tokens)
- Active intents with due dates (5 lines — 200 tokens)
- Tool list with brief descriptions (2,000 tokens)
- Today's race context (1 line — 50 tokens)

REMOVE from system prompt, load JUST-IN-TIME via tools:
- KIKO_BIBLE.md (15,000 tokens — Kiko reads this on demand when needed)
- Detailed self-knowledge (sequence doctrine, campaign rules, etc.)
- Full morning briefing (3,000 tokens — load when asked about today)
- Email style analysis, communication preferences
- Conversation history summaries

### PHASE 5B: KIKO_MEMORY.md (Structured Note-Taking)

From Anthropic: "agents regularly write notes persisted to memory outside the
context window. These notes get pulled back at later times."

Create: /api/data/KIKO_MEMORY.md — Kiko's persistent memory file
- Updated after every meaningful conversation
- Contains: key decisions, learned patterns, relationship status, deal state
- Read at the START of every conversation (compact version)
- Full version available via tool when needed

Format:
```markdown
# KIKO MEMORY — Last updated: 2026-05-21

## CURRENT STATE
- Campaign: 110 active, 0 real replies, CTA needs rewrite
- Canadian GP: 3 days away, Clio/NanoXplore/Clear Street are targets
- Helsing: Joe Paulo back from OOO, follow-up overdue 2 days

## LEARNED PATTERNS
- 56% opens + 0% replies = CTA problem, not reach problem
- Intro-framed subject lines outperform cold outreach
- Race week outreach should deploy T-3 days

## RECENT DECISIONS
- 2026-05-21: Restored campaign templates (steps 1,3,5,7)
- 2026-05-20: Disabled 17 non-essential crons (cost saving)
- 2026-05-19: Added OOO detection to gmail sync

## RELATIONSHIPS
- Helsing/Joe Paulo: 31 clicks, OOO ended May 11, follow-up overdue
- Icertis: 3 contacts clicking (buying committee signal)
- Haas F1: Partnership in advanced discussion, needs proactive check-in
```

This is ~500 tokens. Loaded every conversation. Contains the essential state.

### PHASE 5C: Dreaming (Between-Session Processing)

Anthropic's Dreaming: "reviews past work, prunes stale memories, merges duplicates,
surfaces patterns that no single session could identify."

Implementation: Modify the weekly learning cron to also:
1. Read KIKO_MEMORY.md
2. Check all outcomes from the past week
3. Update KIKO_MEMORY.md with new patterns, prune stale entries
4. Resolve conflicts (e.g., deal status changed)
5. Write the updated file back

This runs Sunday 8 PM (already scheduled). The Monday morning synthesis
then reads the freshly curated memory.

### PHASE 5D: Conversation Compaction

From Anthropic: "distill contents of context window in high-fidelity manner"

After each conversation that contains important decisions or new information:
1. Extract key facts, decisions, and next steps
2. Append to KIKO_MEMORY.md under "RECENT DECISIONS"
3. Update any changed state (deal moved, reply received, etc.)

This happens INSIDE the conversation handler (kiko.js), not as a separate cron.
When the conversation ends, a lightweight Haiku call extracts the summary.

### PHASE 5E: Just-In-Time Context Loading

From Anthropic: "maintain lightweight identifiers and use references to
dynamically load data into context at runtime using tools"

Instead of loading the full morning briefing into every system prompt:
- System prompt says: "You generated a daily briefing this morning. Use morning_briefing tool to access it."
- When asked about today's priorities, Kiko calls the tool
- The tool returns the briefing + relevant patterns from memory

Instead of loading the full KIKO_BIBLE.md:
- System prompt says: "Your strategic doctrine is in KIKO_BIBLE.md. Read it when you need to reference operational rules."
- Kiko only reads it when the query requires it

This cuts the system prompt from ~37K to ~8K tokens.
The model's attention is focused. Responses are sharper.

## IMPLEMENTATION ORDER

1. Create KIKO_MEMORY.md with current state (10 min)
2. Slim the system prompt — remove KIKO_BIBLE.md and heavy context from auto-load (30 min)
3. Add memory reading at conversation start — compact 500-token summary (15 min)
4. Add conversation compaction — extract key facts after each chat (20 min)
5. Update Dreaming (weekly learning) to maintain KIKO_MEMORY.md (20 min)
6. Test end-to-end: ask Kiko questions, verify faster + smarter responses (30 min)

## EXPECTED IMPACT

- Faster responses (less context to process)
- Smarter responses (attention focused on high-signal tokens)
- Cross-session continuity (KIKO_MEMORY.md persists)
- Self-improving (Dreaming curates memory weekly)
- Lower cost (fewer tokens per request = less API spend)
