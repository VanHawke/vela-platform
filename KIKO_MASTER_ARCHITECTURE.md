# KIKO MASTER ARCHITECTURE
## The Definitive Reference — March 28, 2026
## This document MUST be read before ANY code change.

---

## 1. WHAT KIKO IS

Kiko is an AI operating system. Not a chatbot. Not an assistant.
An operating system that runs the Van Hawke Group.

She must:
- Know everything about the platform, her own systems, and herself
- Access any data source (CRM, email, calendar, web) without restrictions
- Execute actions (move deals, create tasks, draft emails, navigate pages)
- Learn from every interaction (decisions, preferences, patterns)
- Monitor her own health and flag when something breaks
- Work flawlessly via text. Voice is a future transport layer.

## 2. WHAT IS CURRENTLY BROKEN (as of March 28, 2026)

### FIXED THIS SESSION:
- ✅ Text input surrogate corruption (emoji crash) — sanitiser on client + server
- ✅ Speech recognition duplication — dedup Set replacing accumulator closure
- ✅ Email queries failing — email_read intent now routes to Gmail MCP
- ✅ No self-knowledge — PLATFORM_KNOWLEDGE injected into system prompt
- ✅ No self-monitoring — kiko_error_log table + ask_self_monitor tool
- ✅ No error logging — all agent/coordinator/MCP failures logged automatically
- ✅ Dead code — realtime-token.js deleted, @11labs removed, vercel.json cleaned

### REMAINING:
- Google OAuth needs periodic reconnection (token expires, auto-refresh works on Vercel)
- Voice mode is GPT-4o Realtime (fabricates data) — DEFERRED, text-first
- Inbox triage cron may need manual trigger to catch up (3 days behind)
- macOS dictation may still produce intermediate keystrokes (browser-level, not our code)

---

## 3. COMPLETE SYSTEM MAP

### 3A. Frontend Components (what the user sees)

```
KikoFloat.jsx (548 lines) — floating chat panel on every page except home
├── Text input → handleSubmit() → POST /api/kiko (SSE stream)
├── Speech dictation → SpeechRecognition → setInput → handleSubmit()
├── File upload → Supabase storage → /api/documents → handleSubmit()
├── Voice mode button → opens KikoVoice.jsx overlay
└── Navigation handling → pendingNavRef → window.location.href after stream

KikoChat.jsx — full-page Kiko on homepage (mirrors KikoFloat logic)
KikoVoice.jsx (347 lines) — GPT-4o Realtime via WebRTC [BROKEN, DEFERRED]
DoubleHelix.jsx — animated ribbon (used on homepage + voice overlay)
AuroraCanvas.jsx — ambient background animation
```

### 3B. API Layer (the brain)

```
/api/kiko.js (670 lines) — THE COORDINATOR
├── Receives: { message, conversationHistory, currentPage, pageContext, pageEntity }
├── Step 1: Intent Classification (api/agents/intent-classifier.js)
│   ├── Deterministic nav matching (0ms)
│   ├── Keyword shortcuts: greetings, "brief me", "what am I looking at" (0ms)
│   └── Haiku classifier for everything else (~100ms)
├── Step 2: Route to handler
│   ├── intent=navigate → deterministic redirect, no Claude needed
│   ├── intent=screen → Screen Reader queries live Supabase → Claude composes
│   └── all other intents → routing hint injected → Claude tool loop
├── Step 3: Tool execution loop (max 10 rounds)
│   ├── Claude calls tools → executeTool() dispatches to agents
│   ├── Agent returns result → fed back to Claude → Claude may call more tools
│   └── Loop until stop_reason != tool_use
├── Step 4: Post-processing (non-blocking, fire-and-forget)
│   ├── logDecision() — writes to kiko_learning_log
│   ├── trackOutput() — writes to kiko_output_tracking
│   ├── journalInsight() — writes to kiko_thought_journal
│   └── extractConversationInsights() — writes to kiko_conversation_insights
├── Context injection (loaded before Claude call):
│   ├── Preferences from kiko_preferences (6 learned patterns)
│   ├── User profile from kiko_user_profiles (communication style, draft voice)
│   ├── Conversation memory from kiko_conversation_insights (recent decisions)
│   ├── Inbox triage from kiko_inbox_triage (today's email summary)
│   └── Entity context from pageEntity (if on a contact/org page)
└── Native tools available to Claude directly:
    ├── memory (read/write /memories filesystem in Supabase)
    ├── web_search (Anthropic web search, max 5 uses)
    └── MCP servers: Gmail + Google Calendar (when Google token available)
```

### 3C. Agent Registry (23 specialist agents)

```
LAYER 1: ORCHESTRATION
  intent-classifier.js — routes messages to correct agent
  screen-reader.js — queries live Supabase per page, describes what's on screen
  navigator.js — page navigation + screen awareness

LAYER 2: REVENUE ENGINE
  deal.js — CRM writes (move deals, create tasks, update contacts)
  data.js — CRM reads (search, stats, analytics, activity feed)
  outreach.js — email drafting, Gmail drafts, Lemlist campaigns
  pricing.js — sponsorship benchmarks, ROI modelling
  signal.js — news signals, funding events, deal triggers
  category-control.js — sponsorship category availability/conflicts

LAYER 3: INTELLIGENCE
  strategy.js — strategic evaluation, prioritisation
  negotiation.js — counter-offers, concession strategy
  finance.js — pipeline forecast, financial analysis
  investment.js — valuation, raise strategy, investor narrative
  memory-engine.js — cross-session recall, entity intelligence

LAYER 4: GOVERNANCE
  legal.js — contract review, risk flagging
  dispute.js — active disputes, procedural responses

LAYER 5: EXECUTION
  ea.js — morning brief (9 data sources), task prioritisation
  document.js — file generation (docx, xlsx, pptx, csv, images, QR)
  content.js — LinkedIn posts, case studies, newsletters
  travel.js — F1/FE race travel planning

LAYER 6: SPECIALIST
  website.js — digital presence
  product-dev.js — Van Hawke Maison eyewear
  ip.js — IP/licensing questions
```

### 3D. Data Layer (Supabase tables)

```
CRM CORE:
  deals (id, data jsonb: company, stage, value, pipeline, status)
  contacts (id, data jsonb: firstName, lastName, email, company, title)
  companies (id, data jsonb)
  activities (type, entity_name, subject, description, created_at)
  tasks (id, data jsonb: title, dueDate, completed)
  conversations (id, user_id, title, messages jsonb, bookmarked)
  documents (name, category, linked_team)
  deal_stage_history (deal_id, from_stage, to_stage, changed_at)
  pipeline_notifications (is_dismissed)
  followup_queue
  outreach_scores (outcome, sent_at)
  user_settings (email_signature)

INTELLIGENCE:
  kiko_learning_log (category, content, entity_name) — decision history
  kiko_preferences (category, preference, confidence) — 6 learned patterns
  kiko_user_profiles (draft_instructions, communication_style, language_fingerprint)
  kiko_relationships (contact_email, warmth_score, emails_sent/received, type)
  kiko_thought_journal (topic, insight, related_entities, confidence)
  kiko_output_tracking (agent, intent, user_message, output_preview)
  kiko_conversation_insights (key_facts, decisions_made, open_threads, entities)
  kiko_draft_actions (action_type, payload, status)
  kiko_draft_tracking (original_content, sent_content, edit_delta)
  kiko_meeting_prep (auto-generated prep docs)
  kiko_inbox_triage (triage_date, summary, priority_emails)
  kiko_memories (path, content, is_directory) — filesystem-style memory
  kiko_alerts (dismissed, expires_at)
  kiko_skills (name, category, trigger_keywords)

DOMAIN:
  f1_teams (name, full_name, engine, color)
  f1_partnerships (team_id, partner_name, category_id, tier, status)
  sponsor_categories (name, sort_order)
  race_calendar (date, event details)
  news_articles (title, source, relevance_score, deal_signal, matched_companies)
  lemlist_campaigns (name, status)
```

### 3E. Cron Jobs (12 scheduled functions)

```
HOURLY:    cron-meeting-prep — auto-generate meeting prep docs
4AM SUN:   cron-profile-synthesis — analyse 49+ emails → voice profile
5AM SUN:   cron-relationship-intel — map 79 contacts with warmth scores
6AM SUN:   cron-preference-synthesis — extract decision patterns
6AM SUN:   cron-document-scan — process new documents
6AM MON:   cron-enrich — enrich new contacts/companies
7AM MON:   cron-partnership-scan — scan F1 team websites for partner changes
7AM M-F:   cron-proactive — convergence detection + email alerts + drafts
7:15 M-F:  cron-inbox-triage — classify today's emails by priority
8AM M-F:   cron-task-automation — auto-manage tasks
8AM M-F:   cron-news-agent — scan news for deal signals
9AM MON:   cron-outreach-score — score outreach effectiveness
```

---

## 4. FIX PLAN — PRIORITY ORDER

### FIX 1: Text Input (deploy verified, cache-bust confirmed)
- The surrogate sanitiser and speech dedup fixes ARE deployed
- Need to verify: hard refresh, check bundle hash, test with emoji-heavy message
- If still broken: the issue is macOS dictation (system-level, not our code)
  producing incremental updates. Fix: debounce the submit, only send the
  FINAL input value, never intermediate states

### FIX 2: Email/Correspondence Access
The current routing sends email queries to the Data Agent which only has
Supabase CRM data. It needs MCP Gmail access.

OPTION A (simplest): Add `email_read` intent handling in kiko.js that
does NOT route to an agent — instead, lets Claude use MCP Gmail tools
directly. The intent classifier already has `email_read` as a valid intent.
The coordinator already has MCP Gmail connected. The only missing piece is
the routing hint for `email_read` intent telling Claude to use Gmail MCP.

OPTION B (thorough): Create a dedicated Email Agent that wraps MCP Gmail
calls with context (who is the contact, what's their warmth score, what
deals are active with their company).

RECOMMENDATION: Option A first (10 minutes), Option B as enhancement.

### FIX 3: Kiko Self-Awareness (Platform Knowledge Injection)
Create a PLATFORM_KNOWLEDGE constant in kiko.js that describes:
- Every page and what it shows
- Every agent and what it does
- Every capability Kiko has
- How to check her own health
- What tables she can query
This gets injected into the system prompt so Kiko can answer "what can you
do", "what pages exist", "how many agents do you have", "what went wrong".

### FIX 4: Self-Monitoring System
Create a kiko_error_log table. Every try/catch in kiko.js and agents that
currently silently swallows errors should ALSO write to this table:
  { timestamp, component, error_message, context }
Then add a tool: ask_self_monitor that queries this table. Kiko can then
answer "what errors happened today" and "is the inbox triage working".

### FIX 5: Change Process (for any future session)
Every code change must follow:
1. Read KIKO_MASTER_ARCHITECTURE.md
2. Identify which component is affected
3. Tag current state for rollback
4. Make the change
5. Build locally: npm run build
6. Verify build succeeds, check bundle hash
7. Deploy: npx vercel --prod --yes --force
8. Verify deploy: check live bundle hash changed
9. Test the specific fix in browser (hard refresh)
10. If broken: git checkout [tag], redeploy
11. If working: update this architecture doc if the change affects it

---

## 5. KIKO SELF-AWARENESS ARCHITECTURE

### 5A. Platform Knowledge (static, injected into system prompt)
Kiko must know at all times:
- She has 23 specialist agents across 6 layers
- She has 12 cron jobs running on schedule
- She has access to Gmail and Google Calendar via MCP
- She can search the web (5 searches per conversation)
- She has a memory filesystem in Supabase
- She tracks decisions, preferences, relationships, insights
- She can generate documents, images, QR codes
- She can move deals, create tasks, log activities
- She can navigate the user to any of 11 pages
- She is deployed on Vercel, data in Supabase
- Her coordinator is kiko.js, her tools are kiko-tools.js
- Her intelligence tables are listed in section 3D above

### 5B. Self-Monitoring (dynamic, queryable)
New table: kiko_error_log
New tool: ask_self_monitor
Kiko can answer:
- "Are you working properly?" → queries error log for last 24h
- "What failed today?" → lists errors by component
- "Is the inbox triage running?" → checks kiko_inbox_triage for today's date
- "When did you last learn something?" → checks kiko_learning_log timestamps

### 5C. Self-Improvement Loop
After every conversation, Kiko already extracts:
- key_facts, decisions_made, open_threads, entities_discussed
She should ALSO track:
- Queries she couldn't answer (and why)
- Tools that errored
- Intents that were misclassified (user corrected her)
This data feeds back into prompt tuning and agent improvements.

---

## 6. IMPLEMENTATION SEQUENCE

### PHASE A: Make Text Work (this session)
1. Verify text input fix is live (hard refresh, test with emojis)
2. Add email_read routing → MCP Gmail access
3. Inject PLATFORM_KNOWLEDGE into system prompt
4. Test: "When was my last email with BigBear" → real Gmail data
5. Test: "What tools do you have" → accurate self-description
6. Test: "Brief me" → real data from all 9 sources
7. Deploy and verify

### PHASE B: Self-Monitoring (next session)
1. Create kiko_error_log table in Supabase
2. Add error logging to all try/catch blocks
3. Create ask_self_monitor tool
4. Test: "What errors happened today" → real error data
5. Test: "Is inbox triage running" → checks today's triage

### PHASE C: Voice (dedicated session, 3-4 hours)
Voice is a TRANSPORT LAYER. The intelligence is identical to text.
Architecture: Mic → STT → /api/kiko (same endpoint) → TTS → Speaker
Provider decision needed before building:
- Web Speech API: free, browser-native, lower quality
- Deepgram STT + Cartesia TTS: $10/month, premium quality
- OpenAI Whisper + TTS: API cost, good quality
The choice does not affect intelligence — only audio quality and latency.

---

## 7. RULES FOR ANY ENGINEER (including Claude)

1. READ THIS FILE before touching any code
2. NEVER change kiko.js without understanding the tool loop
3. NEVER add a new agent without adding it to intent-classifier.js
4. NEVER deploy without: build → verify hash → hard refresh → test
5. EVERY try/catch must log to kiko_error_log (once Phase B is done)
6. NEVER remove or modify an agent's data access without testing that agent
7. The intent classifier is the FRONT DOOR — if routing is wrong, nothing works
8. MCP tools (Gmail, Calendar) are only available in the Coordinator, not agents
9. Voice changes NEVER affect text mode. They are separate codepaths.
10. When in doubt, add a routing hint rather than changing agent code

---

## 8. KNOWN TECHNICAL DEBT

1. KikoChat.jsx and KikoFloat.jsx share ~70% identical logic — should be one
   component with a `mode` prop (full-page vs floating panel)
2. Bundle is 890KB — needs code splitting via dynamic imports
3. LiveKit packages may still be in node_modules (21MB dead weight)
4. Some agents are thin wrappers (legal, dispute, travel) — could be consolidated
5. Voice file (KikoVoice.jsx) is GPT-4o dead code — should be deleted when
   new voice architecture is built
6. No automated tests — all testing is manual curl + browser
7. No error alerting — errors are swallowed silently
8. pageContext is sometimes stale — Screen Reader fixes this but not all agents
   use the Screen Reader's approach

---

## 9. FILE INDEX

```
/api/kiko.js — Coordinator (670 lines)
/api/kiko-tools.js — Tool definitions + agent dispatch (555 lines)
/api/agents/ — 22 agent files
/api/cron-*.js — 12 cron jobs
/api/realtime-token.js — GPT-4o voice token [DEPRECATED]
/src/components/kiko/KikoFloat.jsx — floating chat panel (548 lines)
/src/components/kiko/KikoChat.jsx — homepage chat
/src/components/kiko/KikoVoice.jsx — voice overlay [BROKEN, DEFERRED]
/src/components/kiko/DoubleHelix.jsx — animated ribbon
/src/lib/pageContext.js — page context builder
/KIKO_MASTER_ARCHITECTURE.md — THIS FILE
/KIKO_EVOLUTION_PLAN.md — original 19-phase spec (710 lines)
/KIKO_REBUILD_ARCHITECTURE.md — Phase 0-2 rebuild spec
```

---

END OF ARCHITECTURE DOCUMENT
Last updated: March 28, 2026


---

## 6. SESSION 2 CHANGES (March 28, 2026 — Evening)

### 6A. DYNAMIC SELF-KNOWLEDGE (kiko-self-knowledge.js)
Kiko's self-knowledge is now auto-generated at runtime, not hardcoded.
The generator scans:
1. TOOL_DEFINITIONS → discovers all agent tools + direct tools
2. INTENT_TO_AGENT → discovers all intents and routing
3. api/agents/ directory → discovers agent files on disk
4. vercel.json → discovers cron jobs + schedules
5. kiko_skills table → discovers learned skills
6. kiko_cron_heartbeats → checks cron health
7. Static capabilities (Gmail, Calendar, web search, memory, docs, CRM)

Cache: 5 minutes. Adding a new agent to kiko-tools.js makes Kiko aware of it automatically.

### 6B. ORCHESTRATION INTELLIGENCE
System prompt now includes:
- 4 complexity tiers (1 tool → 2-3 → 3-5 → 5+ tools)
- Decision framework (company mentioned → CRM first; drafting → context first; current events → web search)
- Self-correction loop (agent returns nothing → try alternative)
- Multi-agent chaining (routing hint no longer says "call immediately, don't deliberate")

### 6C. WEB ACCESS FIX
Added explicit WEB ACCESS block to system prompt. Kiko will never again say "I can't access the internet."
Also fixed: research intent now gets proper routing hint (was falling through with empty hint).
Also fixed: general intent routing hint changed from "don't call tools" to "you have FULL access to all tools."

### 6D. CRON HEARTBEATS
New table: kiko_cron_heartbeats (id, cron_name, status, started_at, finished_at, duration_ms, records_processed, error_message, metadata)
New helper: cronHeartbeat(name, status, extras) in kiko-tools.js
All 15 cron files import cronHeartbeat. All write 'started' on entry and 'error' on failure.
Self-monitor cron_status operation now queries heartbeats for 7-day history.

### 6E. SCREEN READER FIX
Added 'command-centre' to the switch statement in screen-reader.js. Previously only matched 'email' and 'outreach-intelligence'.

### 6F. CHAT UI CHANGES
- Action buttons (copy, thumbs up/down, retry) always visible below Kiko responses
- Edit + copy buttons below user messages
- Timestamp on same row as action icons
- Stop response pill button during streaming (both KikoChat + KikoFloat)
- DoubleHelix ribbon sits below action icons row
- Sidebar push layout (ChatHistory is flex child, not position:fixed)
- Alerts moved to right-side slide panel (KikoInsights rewritten)
- InsightsBadge on homepage below chips
- Dynamic chips (useDynamicChips.js) — homepage + per-page float chips from live data
- Homepage ribbon opacity boosted (purple 0.12, teal 0.10; mini 0.10, 0.08)

### 6G. NEW FILES
- api/kiko-self-knowledge.js — dynamic self-knowledge generator
- src/hooks/useDynamicChips.js — context-aware chip suggestions
- kiko_cron_heartbeats table in Supabase

### 6H. KIKO AVATAR STATUS
Extensive exploration of avatar alternatives to DoubleHelix. Crown, bars, fluid orbs, etc. None approved. DoubleHelix ribbon remains the active avatar across all screens. Avatar design deferred to dedicated session with visual references.

---

## 7. VERIFIED TEST MATRIX (end of session)

| Test | Status |
|------|--------|
| Navigation ("take me to pipeline") | PASS |
| Email routing ("correspondence with BigBear") | PASS |
| Screen reader ("what am I looking at" on command-centre) | PASS (fixed) |
| Web search ("research Nordic Semi") | PASS (fixed) |
| Self-knowledge ("how many agents do you have") | PASS (dynamic) |
| Self-monitor ("health check") | PASS |
| Brief ("brief me") | PASS |
| Multi-agent chaining | PASS (routing hint updated) |
| Dynamic chips (homepage) | PASS |
| Dynamic chips (float per page) | PASS |
| Notification panel | PASS |
| Cron heartbeats | DEPLOYED (tracking active) |



---

## 8. FINAL STATE — END OF SESSION 2

### What Changed (Before → After)

| Component | Before | After |
|-----------|--------|-------|
| Self-knowledge | Static hardcoded string | Dynamic runtime generator (kiko-self-knowledge.js) |
| Agent discovery | Manual — edit prompt when adding agent | Automatic — scans tool registry + agent directory |
| Hollow agents | 5 (legal, dispute, ip, product-dev, website) | 0 — all enriched with CRM/Supabase data |
| Web search | Available but Kiko denied having it | Explicit WEB ACCESS declaration + research routing |
| Routing | Single-agent, "call immediately, don't think" | Multi-agent orchestration, 4 complexity tiers |
| General intent | "Don't call tools" | "Full access to all tools, use web search if needed" |
| Activity logging | 2 rows across 308 deals | Auto-logs on every deal + outreach action |
| Conversation search | Impossible | search_conversations tool (163 conversations) |
| Correction learning | None | Detects rephrasing, logs to kiko_learning_log |
| Cron monitoring | Silent failures | 15 crons with heartbeat tracking |
| Inbox triage | 1 stale row, silent failures | Rewritten with error logging, always writes record |
| Task automation | Creates tasks only | Creates tasks + draft actions for overdue items |
| On-demand triage | N/A | trigger_triage tool calls cron endpoint |
| Screen reader | Missed command-centre | Fixed — all page aliases recognised |
| Signal agent | Basic article list | Pipeline cross-reference + company filtering |
| Tools registered | 23 | 25 (added search_conversations, trigger_triage) |
| Tool handlers | 23 | 25 (all matched) |

### Verification Counts
- Agent files: 23 (all with Supabase data access)
- Tools: 25 registered, 25 with handlers (1:1)
- Intents: 25 classified, all mapped to agents
- Crons: 15 in vercel.json, all with heartbeat imports
- Intelligence tables: 14 active (learning_log, preferences, user_profiles, relationships, thought_journal, conversation_insights, draft_actions, draft_tracking, inbox_triage, memories, alerts, error_log, cron_heartbeats, skills)
- CRM tables: deals(308), contacts(5006), companies(2243), activities(2+auto), tasks(12)
- Domain tables: f1_teams(11), f1_partnerships(389), sponsor_categories(20), race_calendar(21), news_articles(2578)

### What Kiko Can Now Do (verified)
1. Search the internet for current information
2. Chain multiple agents in a single conversation (up to 10 rounds)
3. Auto-discover new agents/tools/crons added to the codebase
4. Search her own conversation history (163 conversations)
5. Auto-log activities when she touches CRM entities
6. Detect when users rephrase (correction learning)
7. Monitor her own cron health via heartbeats
8. Trigger inbox triage on demand when data is stale
9. Create proactive draft actions for overdue tasks
10. Self-diagnose: errors, cron status, agent stats
11. Navigate users to any of 12 pages
12. Read live screen data on every page
13. Access Gmail (search, read, threads) and Google Calendar via MCP
14. Generate documents (Word, Excel, PowerPoint, CSV, images, QR codes)
15. Draft emails in Sunny's voice (from learned communication profile)
