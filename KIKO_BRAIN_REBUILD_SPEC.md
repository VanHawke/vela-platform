# KIKO BRAIN REBUILD SPEC v2
# Session 70 — Clean rebuild from ZERO

## PHILOSOPHY
Kiko IS Claude Opus. The rebuild removes ALL artificial constraints.
No intent classification. No tool filtering. No model switching.
No keyword-based gates. No token caps below Claude's natural range.
Start from a blank file. Build only what is needed.

## THE ONLY THINGS THE FILE NEEDS

### 1. Authentication (~30 lines)
- getUserConfig(email) — load user from kiko_user_config
- Domain mapping (.com ↔ .agency)
- Role check (super_admin vs user)

### 2. Context Loading (~80 lines)
- ALWAYS load full context. No gates. No isLightweight.
- Parallel: lean knowledge, KIKO_MEMORY.md, goals, intents, preferences
- Entity context from current page
- Knowledge base (scored by relevance)
- NO casualQuery regex. NO earlyGreeting skip. ALWAYS full context.

### 3. System Prompt (~40 lines)
- One clean system prompt. Not assembled from 15 routing hints.
- Identity + rules + context + tools. That's it.
- No intent-specific prompt injection.

### 4. Opus Stream (~60 lines)
- Always Opus. Never Haiku. Never Sonnet in the brain.
- Full tools (all 47). Never filtered.
- max_tokens: 16384 (or higher)
- Extended thinking: always available for super_admin
- Thinking budget: 30000
- Deep thinking works WITH tools (no noTools gate)

### 5. Tool Execution (~100 lines)
- Tool round loop (max 5 rounds)
- Per-tool timeout: 15s normal, 30s complex
- Heartbeat pings during execution
- Error handling + auth detection
- NO model switching during tool rounds

### 6. Streaming (~40 lines)
- SSE streaming to client
- stripToolXml for output cleaning
- Watchdog: 45s max, but save partial memory BEFORE killing

### 7. Memory Save (~100 lines)
- Opus extracts facts from conversation (NOT Haiku, NOT Sonnet)
- Save to KIKO_MEMORY.md (with OPERATIONAL HEALTH marker fallback)
- Self-evaluation with Opus
- Conversation insights extraction
- CRITICAL: Save BEFORE watchdog kills response

### 8. Learning (~100 lines)
- Decision logging (strategic tool calls)
- Output tracking (quality measurement)
- Thought journal (strategic insights)
- Correction detection (learn from feedback)
- Positive pattern learning

## TOTAL: ~550 lines (vs current 2,058)

## WHAT IS NOT IN THE FILE
- No intent classifier (Opus routes naturally)
- No casualQuery regex (destroyed 30-50% of business queries)
- No FAST_INTENTS (Opus can call navigate tool itself)
- No isLightweight gate (always full context)
- No isEmailIntent (no tool restriction for emails)
- No lightEmailTools (always full tools)
- No useHaiku/useHaikuForEmail/useHaikuForGreeting flags
- No model switching in the brain
- No SKIP_REASONING list
- No routing hints assembled per intent
- No tool filtering based on intent
- No token caps below 16K
- No thinking budget below 30K
- No Vercel references
- No dead code

## WHAT PLUGS IN (unchanged)
- kiko-tools.js (tool definitions + handlers)
- kiko-self-knowledge-lean.js (system prompt + 8 rules)
- KIKO_MEMORY.md (persistent memory + Growth Mandate)
- api/data/KIKO_MEMORY.md (auto-loading memory file)
- All 25 agent files (agents/*.js)
- reasoning-engine.js (hybrid mode — email only)
- All database tables
- All 13 active crons
- All monitor files
- LinkedIn engine, email engine

## ANTI-PATTERNS (never reintroduce)
- ANY keyword regex that restricts tools or context
- ANY intent-based model downgrade
- ANY "lightweight" path that skips context loading
- ANY filter that discards Opus-extracted memory facts
- ANY watchdog that kills response without saving learning
- ANY hardcoded model string that isn't Opus for the brain
