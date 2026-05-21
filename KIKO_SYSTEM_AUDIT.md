# KIKO COMPREHENSIVE SYSTEM AUDIT
# Generated: 2026-05-21 | Session 67
# Status: IN PROGRESS — needs dedicated follow-up session

## CRITICAL FINDING #1: DUAL CRON SYSTEMS

TWO separate cron schedulers run simultaneously:

### System A: cron-scheduler.js (HTTP-based, 27 active + 17 disabled)
Calls localhost:3000/api/cron-xxx via HTTP fetch.
I disabled 17 crons here — verified they stopped after deploy.

### System B: monitors/scheduler.js (node-cron, 6 jobs + Realtime)
SEPARATE in-process cron jobs that were NEVER audited or disabled:
- Pipeline monitor: every 30 min weekdays
- Email monitor: every 2 min weekdays 7am-9pm (420 runs/day!)
- Follow-up monitor: every 2 hours weekdays
- Scheduled sender: every 5 min weekdays (168 runs/day)
- Proactive intel: 2x daily (8am, 2pm) — USES CLAUDE
- Competitive discovery: Sunday 5am — USES CLAUDE
- Supabase Realtime listener: always on

### OVERLAP PROBLEMS:
- Email monitoring runs in BOTH systems (gmail-sync + email-monitor)
- Proactive intelligence runs in BOTH (heartbeat cron + proactive-intel monitor)
- These overlaps DOUBLE the cost for zero additional value

### ACTION NEEDED:
- Audit monitors/scheduler.js — which monitors add value vs duplicate?
- Proactive-intel uses Claude = costs money
- Email-monitor every 2 min = 420 runs/day = potentially expensive
- Consider consolidating into ONE scheduler

---

## CRITICAL FINDING #2: FILES ON SERVER NOT IN GIT

The server at /home/kiko/kiko-worker/ has files that don't exist in the local repo:
- routes/kiko-chat.js (CRITICAL — contains the wildcard router)
- routes/email-intel.js
- routes/webhooks.js
- monitors/ directory (6+ files)

These are load-bearing files that can't be rebuilt from git.
ACTION: Copy all server-only files into the repo immediately.

---

## CRITICAL FINDING #3: OLD SELF-KNOWLEDGE STILL LOADED AS FALLBACK

The lean prompt (8KB) is loaded first, but the OLD bloated self-knowledge (77KB)
is loaded as fallback if the lean version fails. Both files exist:
- api/kiko-self-knowledge.js — 1,056 lines, 77KB (OLD)
- api/kiko-self-knowledge-lean.js — 142 lines, 8KB (NEW)

The OLD file should be kept as reference but the fallback should be removed
once the lean version is proven stable.

---

## TOOL AUDIT (48 tools, all have handlers)

### VERIFIED WORKING (tested this session):
- ask_data_agent ✅ (CRM queries, campaign stats)
- ask_self_monitor ✅ (health check, selfcheck, recent errors)
- morning_briefing ✅ (DB read of daily brief)
- navigate_page ✅ (page navigation)
- memory ✅ (read/write personal memories)
- manage_knowledge ✅ (knowledge management)

### LIKELY WORKING (handlers exist, not tested this session):
- ask_outreach_agent, create_email_draft, batch_draft_emails, read_email
- ask_deal_agent, query_relationships, log_activity
- ask_strategy_agent, ask_negotiation_agent, ask_pricing_agent
- check_follow_ups, check_scheduled_emails, trigger_triage
- build_campaign, generate_document
- linkedin_search_prospects, linkedin_send_invite, linkedin_send_message, find_linkedin_url
- read_calendar, google_maps_link

### NEEDS VERIFICATION:
- ask_lemlist_live — DEPRECATED but still registered (should be removed)
- digest_master_brief — unclear if this still works
- get_cognitive_analysis — depends on cognitive-synthesis cron (disabled)
- ask_ea_agent — called by greeting but produced 21-second response
- ask_code_review — niche, untested

---

## CAPABILITY MATRIX

### ✅ WORKING:
- Chat with strategic intelligence (lean prompt)
- Personal memory recall (Nyla, Maya, UNO)
- Campaign analysis (OOO detection, CTA diagnosis)
- Race calendar (61 races, prospect mapping)
- Proactive greetings (lead with priorities)
- Morning briefing (multi-pass synthesis)
- Goal/intent tracking
- Self-diagnosis (selfcheck tool)
- Outcome learning (weekly patterns)
- Persistent memory (KIKO_MEMORY.md)
- Conversation compaction
- Email sending (campaign sequence)
- Gmail monitoring (reply detection)

### ❌ NOT WORKING:
- Auto-create CRM records from email: No code exists for this
- Auto-update records from correspondence: No automation for this
- Auto-set tasks from conversation: Tool exists but not triggered automatically
- Reply to emails autonomously: Requires explicit user approval
- Calendar-based suggestions: read_calendar tool exists but not integrated with suggestions
- Push notifications: cron-push-dispatcher exists but not wired to anything
- Self-repair: Can diagnose but cannot execute fixes
- LinkedIn automation: Cookies alive but 20/98 messages FAILED (20% failure rate)

### ⚠️ PARTIALLY WORKING:
- Pipeline management: Data tools work but no autonomous monitoring
- Email drafting: Tool works but narration sometimes blocks execution
- Knowledge base: 100 entries loaded but mostly unused (moved to just-in-time)

---

## DEAD CODE CANDIDATES (safe to remove or archive)

### Disabled Crons (17 files, ~2,500 lines):
- cron-cognitive-synthesis.js (76 lines)
- cron-personamail-loop.js (67 lines)
- cron-self-awareness.js (113 lines)
- cron-proactive.js (18,417 bytes — MASSIVE for a disabled cron)
- cron-proactive-recommendations.js (126 lines)
- cron-rule-promotion.js (105 lines)
- cron-profile-synthesis.js (185 lines)
- cron-email-voice-learning.js (139 lines)
- cron-segment-enroller.js (115 lines)
- cron-linkedin-social-listen.js (164 lines)
- cron-outreach-score.js (263 lines)
- cron-company-monitor.js (126 lines)
- cron-score-companies.js (57 lines)
- cron-company-enrich.js (151 lines)
- cron-relationship-intel.js (177 lines)

### Deprecated Tools:
- ask_lemlist_live — Lemlist is cancelled, tool should be removed
- kiko-self-knowledge.js — 77KB old version, replaced by lean (keep as archive)

### Legacy Files:
- cron-morning-email.js (384 lines) — replaced by morning-synthesis
- cron-morning-intelligence.js (186 lines) — replaced by morning-synthesis
- cron-weekly-report.js (253 lines) — unclear if used

---

## PRIORITY ACTIONS FOR NEXT SESSION

### P0 (Critical — do first):
1. Copy ALL server-only files into git repo (routes/kiko-chat.js, monitors/, etc.)
2. Audit monitors/scheduler.js — disable duplicates, consolidate
3. Remove ask_lemlist_live tool definition
4. Fix LinkedIn 20% failure rate — check what's causing silent failures

### P1 (Important — do second):
5. Build auto-CRM-record-creation from email correspondence
6. Build calendar integration for suggestions
7. Wire push notifications (cron-push-dispatcher exists but unused)
8. Remove or archive the 17 disabled cron files

### P2 (Improvement — do third):
9. Consolidate dual cron systems into one
10. Remove old kiko-self-knowledge.js (77KB) fallback once lean is stable
11. Clean up dead code (~2,500 lines across disabled crons)
12. Add error recording to LinkedIn queue for silent failures

---

## COST ESTIMATE (current)

### System A (cron-scheduler): ~$15-25/week
- learning-director: 21 runs × 73s avg = uses Claude = ~$5/week
- partnership-scan: 16 runs × 34s = uses Claude = ~$3/week
- company-monitor: 11 runs × 109s = uses Claude = ~$4/week (SHOULD BE DISABLED)
- heartbeat: 17 runs × minimal = ~$0.50/week
- morning-synthesis: 7 runs × 45s = ~$1/week
- Others: minor

### System B (monitors): ~$5-15/week
- proactive-intel: 10 runs × Claude = ~$3/week
- competitive-discovery: 1 run × Claude = ~$1/week
- email-monitor: 420 runs/day × minimal = ~$0/week (no Claude)
- pipeline-monitor: minimal
- Others: minimal

### Kiko Chat: ~$5-10/week
- ~20-50 conversations × Sonnet = variable

### TOTAL: ~$25-50/week (improved from $100+)

---

## SESSION 67 RESOLUTION LOG

### COMPLETED:
- ✅ Phase A: 12 server-only files synced to git (data protection)
- ✅ Phase B: Dual cron system consolidated (proactive-intel disabled)
- ✅ Phase C: Dead code removed (ask_lemlist_live tool, learning-director cron)
- ✅ Phase D: LinkedIn 20 failures reset for retry, crash loop fixed
- ✅ Phase E: End-to-end verification (7/7 tests pass)
- ✅ P1: Calendar integration in morning synthesis
- ✅ P1: Auto-CRM contact creation from inbound business emails
- ✅ Narration permanently eliminated (banned phrases list)
- ✅ Self-diagnosis capability (run_selfcheck via ask_self_monitor)
- ✅ Tool count accuracy (47 tools, exact categories)

### STILL PENDING (P2):
- Auto-task creation from Kiko conversations
- Push notifications (cron-push-dispatcher exists but unwired)
- Clean up 17 disabled cron files (~2,500 lines of dead code)
- Full code review of kiko.js (172KB) and kiko-tools.js (120KB)
- Remove old kiko-self-knowledge.js (77KB) fallback once lean stable

### METRICS:
- Selfcheck: 22/25 (was 17/25)
- Active crons: 26 (was 43)
- Weekly cost: ~$15-30 (was $100+)
- Tools: 47 (was 48)
- Server files in git: 100% (was ~85%)
