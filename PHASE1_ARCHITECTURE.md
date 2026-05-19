# PHASE 1 ARCHITECTURE — Wire Existing Components
# This document defines EXACTLY what will be built, in what order, and how each piece connects.
# NO CODE until this plan is reviewed.

## 1A. HARDCODED RACE CALENDAR
### Problem
The race-week-intel cron uses Claude web search to find the F1 calendar.
Web search returned Monaco when it should have been Canada. This is unacceptable.

### Solution
Create `/api/data/race-calendars.json` with the complete 2026 F1 calendar.
Later: add Formula E and MotoGP calendars to the same file.

### Data Source
Official F1 site: https://www.formula1.com/en/racing/2026
Verified from search results:
- Round 1: Australia (Mar 6-8)
- Round 2: China (Mar 13-15) — Sprint
- Round 3: Japan (Mar 27-29)
- Round 4: Miami (May 1-3)
- Round 5: Canada (May 22-24) — Sprint ← THIS WEEKEND
- Round 6: Monaco (Jun 5-7)
- Round 7: Barcelona (Jun 12-14)
- Round 8: Austria (Jun 28)
- Round 9: Great Britain (Jul 5) — Sprint
- Round 10: Belgium (Jul 19)
- Round 11: Hungary (Jul 26)
- SUMMER BREAK
- Round 12: Netherlands (Aug 21-23) — Sprint
- Round 13: Italy/Monza (Sep 4-6)
- Round 14: Madrid (Sep 12-14)
- Round 15: Azerbaijan (Sep 26)
- Round 16: Singapore (Oct 11) — Sprint
- Round 17: Austin (Oct 25)
- Round 18: Mexico City (Nov 1)
- Round 19: São Paulo (Nov 8)
- Round 20: Las Vegas (Nov 21)
- Round 21: Qatar (Nov 29)
- Round 22: Abu Dhabi (Dec 6)

### Integration Points
- `cron-race-week-intel.js` reads from this file instead of web search
- `cron-morning-synthesis.js` reads from this file for race context
- Kiko's self-knowledge references the calendar for conversational queries

### Files Changed
- NEW: `api/data/race-calendars.json`
- MODIFIED: `api/cron-race-week-intel.js` (replace web search with file read)
- MODIFIED: `api/cron-morning-synthesis.js` (replace web search with file read)

---

## 1B. AUTOMATIC OUTCOME RECORDING
### Problem
`record_outcome` exists as a tool but requires manual invocation.
The research (π-BENCH) shows automatic outcome recording is the #1 factor in proactivity.

### Solution
Modify three existing crons to automatically record outcomes when signals change:

### 1B.1 — Gmail Reply Detection → Auto Record
**File**: `api/cron-gmail-sync.js`
**Trigger**: When a reply is detected from a prospect
**Record**: Which campaign step generated the reply, the subject line, timing
**Goal link**: Map to the relevant campaign goal in kiko_goals

### 1B.2 — Campaign Metric Change → Auto Record
**File**: `api/cron-campaign-monitor.js`
**Trigger**: When open/click/reply rates change significantly (>5% shift)
**Record**: What changed, what the previous rate was, what actions preceded the change
**Goal link**: Map to the campaign goal

### 1B.3 — Deal Stage Change → Auto Record
**File**: `api/cron-event-processor.js` (or wherever deal stage changes are detected)
**Trigger**: When a deal moves forward or backward in the pipeline
**Record**: Which outreach/follow-up preceded the change
**Goal link**: Map to the relevant deal goal

### Integration Points
- All three write to `kiko_outcomes` table
- All three link outcomes to goals via `goal_id`
- Morning synthesis reads from `kiko_outcomes` to include in briefing

### Files Changed
- MODIFIED: `api/cron-gmail-sync.js` (add outcome recording after reply detection)
- MODIFIED: `api/cron-campaign-monitor.js` (add outcome recording for metric shifts)
- NEW function in: `api/lib/outcome-recorder.js` (shared helper to avoid duplication)

---

## 1C. HEARTBEAT SYSTEM (from OpenClaw)
### Problem
Kiko only reasons at fixed cron times (7 AM, 9 AM).
A reply could come in at 2 PM and Kiko won't process it until 7 AM next day.

### Solution
A lightweight "heartbeat" cron that runs every 2 hours during business hours (8 AM-8 PM).
Uses Haiku (fast, cheap) to check: "Has anything happened since the last check that
requires Sunny's attention? Score each signal 0-10."

### Architecture
```
Every 2 hours:
  1. Query for NEW signals since last heartbeat (kiko_alerts created_at > last_run)
  2. Query for active goals
  3. Feed to Haiku: "Score each signal 0-10 against these goals. Only return signals >= 7."
  4. If any high-scoring signals: create a single `proactive_heartbeat` alert with synthesis
  5. If no high-scoring signals: log and exit silently (CRITICAL: know when to be SILENT)
```

### Cost Estimate
- Haiku call: ~500 input tokens (goals + signals summary), ~200 output tokens
- 6 calls/day = 3,000 input + 1,200 output tokens = ~$0.005/day
- Negligible cost, high value

### Integration Points
- Reads from: kiko_goals, kiko_alerts (recent), kiko_email_tracking (recent), kiko_outreach_queue (recent)
- Writes to: kiko_alerts (type: proactive_heartbeat)
- Does NOT replace morning synthesis — supplements it with real-time monitoring

### Files Changed
- NEW: `api/cron-heartbeat.js`
- MODIFIED: `kiko-worker/src/cron-scheduler.js` (add heartbeat schedule)
- MODIFIED: `kiko-worker/server.js` (add route)

---

## 1D. TODAY PAGE INTEGRATION
### Problem
The morning briefing is stored as an alert in kiko_alerts.
The Today page doesn't show it. User has to go to Command Centre to find it.

### Solution
Modify the Today page to fetch and display the latest morning briefing as the
first section, above all other content.

### Architecture
```
Today.jsx loads:
  1. Fetch /api/kiko with ask_data_agent morning_briefing (or direct Supabase query)
  2. Render the briefing markdown as the first section
  3. Below: existing deal cards, task summary, etc.
  4. If no briefing today: show "Morning briefing not yet generated" with a
     "Generate now" button that calls run_morning_briefing
```

### Integration Points
- Reads from: kiko_alerts (type: morning_briefing, latest)
- Frontend only — no API changes needed (Supabase client already available)

### Files Changed
- MODIFIED: `src/pages/Today.jsx` (add morning briefing section)

---

## BUILD ORDER
1. 1A — Race calendar JSON (10 min, zero risk, fixes the wrong-race-name problem)
2. 1B — Outcome recorder helper + gmail-sync integration (30 min, moderate risk)
3. 1C — Heartbeat system (20 min, low risk, new file)
4. 1D — Today page integration (30 min, frontend change)

Total estimated time: ~90 minutes for Phase 1.

## TESTING PLAN
After each component:
1. Syntax check the modified file
2. Deploy to Hetzner
3. Run the cron manually and verify output
4. Check Supabase for correct data writes
5. Only proceed to next component after verification
