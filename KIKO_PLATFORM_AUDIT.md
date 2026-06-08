# KIKO PLATFORM — FULL CODE AUDIT
## Date: 8 June 2026 | Compiled by: Claude + Kiko (collaborative audit)

---

## 🔴 CRITICAL — Fix Immediately

### 1. `kiko-task-create.js` — Dead Vercel import (CAUSES ERRORS)
- **File:** `api/kiko-task-create.js` line 5
- **Issue:** `import { waitUntil } from '@vercel/functions'` — Vercel is cancelled
- **Fix:** Delete the entire file

### 2. Lemlist dead code across 8+ files (CONFUSES ROUTING)
- Intent classifier routes to non-existent `ask_lemlist_live` tool
- Files: intent-classifier.js, outreach.js, navigator.js, screen-reader.js, data.js, Settings.jsx, Settings.NEW_REDESIGN.jsx, cron-inbox-triage.js
- **Fix:** Remove all Lemlist code, update intent-classifier routing

### 3. Selfcheck endpoint returns 404
- `/api/kiko-selfcheck` not registered in server.js
- Self-monitoring cron broken
- **Fix:** Register route in server.js

### 4. `runInBackground` dead code in KikoChat.jsx
- Lines 333-334, 626+, 1328 — function, state, UI still exist
- **Fix:** Remove all bgTask/runInBackground code

### 5. Pipeline data corruption
- Corrupted float (2e+21M) in a deal record
- Thomson Reuters shows pipeline "Unknown"
- **Fix:** Query and fix in Supabase
