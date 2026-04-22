# CLAUDE CODE BRIEF — v0.0.65 LINKEDIN LAYER 2 (Sequence Engine + Safety Scaffolding)

**You are working in the repo at `/Users/sunny/Desktop/vela-platform`.**

This brief replaces the earlier draft of V065. It is the comprehensive, tightened version that ships safely on day one with rate limiting, kill switch, request logging, cookie expiry monitoring, and graduated quotas.

---

## 0. WHAT YOU ARE SHIPPING AND WHY

You are shipping **v0.0.65** — the second half of the Lemlist replacement. After this ships:

1. **LinkedIn becomes a fully executable step type in Kiko sequences.** AI-generated multi-channel sequences (4 emails + 3 LinkedIn over 14 days) execute end-to-end without manual intervention.
2. **The Layer 1 tools (search/invite/message) get hard rate limits, kill switch, and request audit logging** — which Layer 1 shipped without.
3. **Sunny is protected from a day-one LinkedIn account flag** by graduated daily caps: 25/day for week 1, automatic graduation to 40/day for week 2 onwards.
4. **A daily cookie health check** alerts Sunny via `kiko_alerts` + Gmail if LinkedIn cookies expire.

This is **part 2 of a 2-part build**. Part 1 (v0.0.64) shipped the LinkedIn API tools but with no rate limiting and no kill switch. v0.0.65 adds the safety scaffolding AND the sequence engine integration in one ship.

**Pre-deploy baseline (recorded ~07:30 BST Tue 14 Apr 2026):**
- Production: `https://kiko.vanhawke.agency` running v0.0.64
- kiko-health: **PASS, 1812ms, all 3 layers** `[core, org, personal]`
- v0.0.64 `api/linkedin-client.js` and `api/linkedin-test.js` deployed and live
- `/api/linkedin-test` currently returns `{authenticated: false, error: "LINKEDIN_LI_AT or LINKEDIN_JSESSIONID env var not set"}` — this is **expected and correct** — it means the graceful error path is working
- `LINKEDIN_LI_AT` and `LINKEDIN_JSESSIONID` env vars are NOT yet set in Vercel — Sunny will add them after v0.0.65 deploys, not before
- Existing Lemlist webhook safety net (v0.0.63) live and verified

---

## 1. THE TIGHTENING DECISIONS YOU MUST IMPLEMENT (these address gaps in v0.0.64)

The v0.0.64 brief shipped a working LinkedIn API wrapper but with several gaps. v0.0.65 closes them. **Each of the following is non-negotiable** — they are the safety guarantees Sunny has agreed to in exchange for shipping LinkedIn quickly:

### 1.1 Hard rate limits inside `linkedin-client.js` (NOT just in the cron)

Layer 1 has no daily counter. That means right now if Sunny asks Kiko in chat "send 100 LinkedIn invites to these prospects," nothing in v0.0.64 stops it from trying. v0.0.65 adds a database-backed daily counter that BOTH the chat-driven path AND the cron-driven path consult before EVERY action.

**Implementation:** A new function `checkAndIncrementLinkedinQuota(actionType)` in `api/linkedin-client.js` that:
1. Counts rows in `kiko_linkedin_audit` for today where `action_type` matches and `status='success'`
2. If count >= the current daily cap (see 1.2), throws `LinkedInQuotaExceededError`
3. Otherwise inserts an audit row with `status='pending'` and returns
4. Called as the first line of `linkedinSendInvite()` and `linkedinSendMessage()` BEFORE any voyager API call

**Search operations are NOT counted against the cap** — search is read-only and LinkedIn allows hundreds per day without flagging.

### 1.2 Graduated daily caps with automatic ramp

**Week 1 (days 1-7 from first cookie installation): 25 actions/day** (LinkedIn soft ceiling)
**Week 2 onwards: 40 actions/day**

Implementation: read `LINKEDIN_FIRST_USE_DATE` from a new row in `kiko_user_config` (or fall back to `process.env.LINKEDIN_FIRST_USE_DATE` if config table doesn't have it). On first successful action, write today's date. Every subsequent action computes days-since-first-use; if <7, cap=25; if >=7, cap=40.

**Per-action-type breakdown:**
- Invites: counted against the daily cap
- Messages (DMs to existing connections): counted against the daily cap
- Searches: NOT counted (unlimited)
- Profile fetches: NOT counted (unlimited, but only as side effect of invite)

### 1.3 Kill switch env var

Add a single env var `LINKEDIN_KILL_SWITCH`. If set to any truthy value (`"1"`, `"true"`, etc.), ALL LinkedIn write operations (invite, message) immediately throw `LinkedInKillSwitchEngagedError` without making any API call. Searches still work.

This means if Sunny notices anything off — a 999 status code, a strange LinkedIn email, account warning — he can flip ONE env var in Vercel and all LinkedIn write activity stops within seconds (Vercel env var changes take effect on next request).

**The kill switch check is the FIRST line of every write operation, before quota check, before auth check, before anything else.**

### 1.4 Request audit log table

New table `kiko_linkedin_audit`:
```sql
CREATE TABLE IF NOT EXISTS kiko_linkedin_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   text NOT NULL,  -- 'invite' | 'message' | 'search' | 'profile' | 'auth_test'
  target_url    text,           -- linkedin profile URL or query string
  request_body  jsonb,          -- redacted request body sent to voyager
  response_status integer,      -- HTTP status from voyager
  response_excerpt text,        -- first 500 chars of response body
  status        text NOT NULL,  -- 'pending' | 'success' | 'failed' | 'rate_limited' | 'kill_switch'
  error_message text,
  source        text,           -- 'chat' | 'cron-linkedin-sender' | 'manual_test'
  created_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX idx_kiko_linkedin_audit_created_at ON kiko_linkedin_audit (created_at DESC);
CREATE INDEX idx_kiko_linkedin_audit_status ON kiko_linkedin_audit (status);
ALTER TABLE kiko_linkedin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON kiko_linkedin_audit FOR ALL USING (true) WITH CHECK (true);
```

Every LinkedIn API call (read or write) writes a row to this table. Sensitive fields are NOT logged — `request_body` excludes the `cookie` and `csrf-token` headers, and `response_excerpt` is capped at 500 chars to prevent leaking entire profile responses.

### 1.5 Daily cookie expiry monitor cron

New cron `api/cron-linkedin-auth-check.js` runs every day at 7am UTC (8am BST):
1. Calls `linkedinTestAuth()` from `linkedin-client.js`
2. If `authenticated: true`: writes a heartbeat row, returns 200, done
3. If `authenticated: false`: 
   - Inserts `kiko_alerts` row with type=`linkedin_auth_failed`, severity=`high`, title `🚨 LinkedIn cookies expired — re-extraction needed`
   - Sends Gmail alert via `sendAlert()` with full re-extraction instructions
   - Continues failing every 24h until cookies are refreshed

This is the analog of the Lemlist webhook safety net but for the cookie expiry failure mode. **You will NOT find out about expired cookies the way Sunny found out about the Lemlist silent skip — proactively, not after another commercial near-miss.**

### 1.6 Abort conditions in synthetic tests

Layer 1's brief had a synthetic invite test that just sent an invite and reported `success: true`. v0.0.65 adds explicit abort conditions:
- If response shape doesn't match expected: STOP, do NOT retry, flag for manual inspection
- If first invite returns success but second test invite to a different profile fails: STOP, do not run more
- If audit log shows >3 'failed' rows in any 30-minute window: cron auto-pauses for 1 hour and writes a `kiko_alerts` row

### 1.7 Pacing: random delays between actions in same batch

Cron processes batches of up to 3 actions per run, with a random delay of 30-90 seconds BETWEEN actions in the same batch. **Never two actions back-to-back at exactly the same second.** This breaks the most obvious automation signal.

### 1.8 Business hours only

Cron runs every 30 min Mon-Fri **8am-5pm UTC** (9am-6pm BST during daylight savings). Never overnight. Never on weekends. Real humans don't send LinkedIn invites at 3am.

---

## 2. RECONNAISSANCE ALREADY COMPLETED (do not re-do this)

### 2.1 What ALREADY works (do not modify)

**`api/generate-sequence.js`** at line 93 generates sequences with the structure:
```
4 emails + 3 LinkedIn over 14 days
Step 1: Day 0, email
Step 2: Day 2, linkedin (connection request)
Step 3: Day 3, email
Step 4: Day 7, email
Step 5: Day 10, linkedin (direct message)
Step 6: Day 12, linkedin (engage)
Step 7: Day 14, email
```

Output JSON shape per step:
```json
{
  "step": 2,
  "delay_days": 2,
  "channel": "linkedin",
  "approach": "authority-led",
  "psychology": "reciprocity",
  "subject": "...",
  "template": "Hi {firstName}, ..."
}
```

**`api/cron-sequence-enqueue.js`** lines 303-326 ALREADY:
1. Detects `step.channel === 'linkedin'`
2. Inserts a row into `kiko_linkedin_queue` with: enrollment_id, contact_name, company, message_type (from `step.action || 'connection'`), message (from `step.template`), context, priority=8, status='pending'
3. Fires a `kiko_alerts` row of type 'linkedin_action' severity 'medium' with 7-day expiry
4. Advances the enrollment to next step
5. Continues the loop

**`api/agents/data.js`** has a `case 'linkedin_queue':` that reads pending rows from `kiko_linkedin_queue` and presents them in chat for manual action.

**`api/linkedin-client.js`** (v0.0.64) exports:
- `linkedinTestAuth()` 
- `linkedinGetProfile(publicIdOrUrl)`
- `linkedinSendInvite(profileUrl, message)`
- `linkedinSendMessage(profileUrlOrConversationUrn, message)` 
- `linkedinSearch(query, options)`
- `linkedinGetConversations(options)`

### 2.2 The kiko_linkedin_queue schema (already exists)

```
id            uuid (pk)
enrollment_id uuid → kiko_sequence_enrollments.id
contact_name  text not null
company       text not null
linkedin_url  text  ← may be null, fall back to enrollment.linkedin_url
message_type  text default 'connection'  -- 'connection' | 'message' | 'engage'
message       text not null
context       text
status        text default 'pending'  -- 'pending' | 'sent' | 'failed' | 'skipped'
priority      integer default 5
created_at    timestamptz default now()
actioned_at   timestamptz
```

**No new columns needed on this table.** The audit log goes in the new `kiko_linkedin_audit` table.

### 2.3 What is missing (the actual v0.0.65 scope)

- ❌ `kiko_linkedin_audit` table (NEW migration)
- ❌ Quota check function in `linkedin-client.js`
- ❌ Kill switch check in `linkedin-client.js`
- ❌ Audit logging wrapper in `linkedin-client.js`
- ❌ `cron-linkedin-sender.js` (the cron that processes pending LinkedIn queue rows)
- ❌ `cron-linkedin-auth-check.js` (the daily cookie expiry monitor)
- ❌ Cron schedule entries in `vercel.json`
- ❌ Reply detection extension to `cron-sequence-reply-detect.js` for LinkedIn inbox
- ❌ One-line patch to `cron-sequence-enqueue.js` to populate `linkedin_url` field

---

## 3. RING FENCE — ABSOLUTE DO-NOT-TOUCH RULES

Same as v0.0.63 and v0.0.64. Non-negotiable.

**Files you must NOT modify:**
- `api/kiko.js`
- `api/kiko-health.js`
- The three-layer Bible assembly anywhere
- `src/contexts/OrgContext.jsx` and anything in `src/contexts/`
- `api/_lib/get-user-role.js`
- `KIKO_BIBLE.md.archive`
- `api/lemlist-webhook.js`, `api/lemlist-backfill.js` (v0.0.63)
- `api/cron-sequence-sender.js` (existing email cron — leave alone, only mirror it)

**Files you ARE allowed to MODIFY in this session:**
- `api/linkedin-client.js` (add quota/kill-switch/audit wrappers — additive only, do not change existing function signatures)
- `api/cron-sequence-enqueue.js` (ONE line to populate linkedin_url)
- `api/cron-sequence-reply-detect.js` (additive extension for LinkedIn inbox scan)
- `api/kiko-tools.js` (only if needed — likely no changes)
- `vercel.json` (add 2 new cron schedule entries)
- `package.json` (version bump 0.0.64 → 0.0.65)
- `KIKO_MASTER_LOG.md` (append session notes)

**Files you ARE allowed to CREATE in this session:**
- `api/cron-linkedin-sender.js` (NEW — the execution cron)
- `api/cron-linkedin-auth-check.js` (NEW — daily cookie health check)

**Deploy rules:**
- `npm run build` locally first. No exceptions.
- Never `git push --force`.
- Never `VERCEL_FORCE_NO_BUILD_CACHE=1` ($830 lesson).
- Deploy via: `git push origin main` then `npx vercel --prod --yes`.
- kiko-health probe BEFORE and AFTER every deploy. Both must be PASS with all 3 layers. If post-deploy fails, roll back immediately.

**3-strike rule:** 3 consecutive failures = STOP. Write failure to KIKO_MASTER_LOG.md. Ask Sunny.

---

## 4. PRE-FLIGHT CHECKS (must all pass before writing any code)

### 4.1 Confirm pre-deploy kiko-health baseline
```bash
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health \
  -H "Content-Type: application/json" -d '{}' --max-time 30
```
**Expected:** `{"status":"pass","latency_ms":<2500,"bible_layers_loaded":["core","org","personal"],...}`
**If status is not "pass" or any layer is missing: STOP.**

### 4.2 Confirm package.json is at v0.0.64
```bash
cd /Users/sunny/Desktop/vela-platform && grep '"version"' package.json
```
**Expected:** `"version": "0.0.64",`

### 4.3 Confirm v0.0.64 LinkedIn files exist
```bash
ls -la api/linkedin-client.js api/linkedin-test.js
```
**Expected:** both files exist.

### 4.4 Confirm git is clean
```bash
git status --short
```
**Expected:** clean OR only `recent-ships.json` drift.

### 4.5 Confirm pending LinkedIn queue size
```sql
SELECT status, COUNT(*) FROM kiko_linkedin_queue GROUP BY status;
```
**Expected:** likely empty or all 'pending' from prior sessions. If there are >50 pending rows, NOTE the count — they'll be the first thing the new cron processes when it goes live AFTER cookies are added. Sunny may want to truncate or set them to 'skipped' before deploying to avoid a huge first run.

### 4.6 Note that LinkedIn cookies are NOT yet set
This is intentional and correct. v0.0.65 ships dormant. Cookies get added AFTER deploy verification, then the entire stack lights up at once. Do NOT try to add cookies as part of this session.

---

## 5. STEP-BY-STEP IMPLEMENTATION

### STEP 5.1 — Read existing patterns

```bash
cat api/linkedin-client.js
cat api/cron-sequence-sender.js
sed -n '290,340p' api/cron-sequence-enqueue.js
cat api/cron-sequence-reply-detect.js
cat api/alert-utils.js | head -80
```

Take notes on:
- Current `linkedin-client.js` exports and how `voyagerFetch` is structured
- The `cronHeartbeat` start/finish/error pattern
- The `sbFetch` PATCH pattern
- How `sendAlert(title, body, severity)` is called from alert-utils
- Where the LinkedIn step detection is in cron-sequence-enqueue.js (lines ~303-326)

### STEP 5.2 — Apply the database migration for `kiko_linkedin_audit`

Use the Supabase MCP tool `apply_migration` (NOT `execute_sql`):

```sql
-- Migration name: v065_kiko_linkedin_audit_table
CREATE TABLE IF NOT EXISTS kiko_linkedin_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type     text NOT NULL,
  target_url      text,
  request_body    jsonb,
  response_status integer,
  response_excerpt text,
  status          text NOT NULL,
  error_message   text,
  source          text,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kiko_linkedin_audit_created_at ON kiko_linkedin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiko_linkedin_audit_status ON kiko_linkedin_audit (status);
CREATE INDEX IF NOT EXISTS idx_kiko_linkedin_audit_action_type ON kiko_linkedin_audit (action_type);
ALTER TABLE kiko_linkedin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON kiko_linkedin_audit FOR ALL USING (true) WITH CHECK (true);
```

Verify the table exists after migration:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'kiko_linkedin_audit' ORDER BY ordinal_position;
```

### STEP 5.3 — Modify `api/linkedin-client.js` to add safety wrappers

This is an **additive** modification. Do NOT change the existing function signatures or remove any existing code. Add the following:

**At the top of the file, after the existing imports:**

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseAudit = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Custom error classes for clear failure semantics
export class LinkedInKillSwitchEngagedError extends Error {
  constructor() {
    super('LinkedIn kill switch is engaged (LINKEDIN_KILL_SWITCH env var set). All write operations are blocked. Unset the env var in Vercel to re-enable.');
    this.name = 'LinkedInKillSwitchEngagedError';
  }
}

export class LinkedInQuotaExceededError extends Error {
  constructor(actionType, currentCount, cap) {
    super(`LinkedIn daily ${actionType} quota exceeded: ${currentCount}/${cap}. Resets at midnight UTC.`);
    this.name = 'LinkedInQuotaExceededError';
    this.actionType = actionType;
    this.currentCount = currentCount;
    this.cap = cap;
  }
}

// Determine current daily cap based on first-use date
function getCurrentDailyCap() {
  const firstUseEnv = process.env.LINKEDIN_FIRST_USE_DATE;  // YYYY-MM-DD
  if (!firstUseEnv) return 25;  // Conservative default if not set yet
  const firstUse = new Date(firstUseEnv);
  const now = new Date();
  const daysSinceFirstUse = Math.floor((now - firstUse) / (1000 * 60 * 60 * 24));
  if (daysSinceFirstUse < 7) return 25;
  return 40;
}

// Kill switch check — called first in every write operation
function checkKillSwitch() {
  const killSwitch = process.env.LINKEDIN_KILL_SWITCH;
  if (killSwitch && killSwitch !== '0' && killSwitch !== 'false' && killSwitch !== '') {
    throw new LinkedInKillSwitchEngagedError();
  }
}

// Quota check + audit row insert — called before every write API call
async function checkAndIncrementQuota(actionType, source = 'unknown') {
  if (!supabaseAudit) return null;  // Fail open if no DB — don't block on infra issues
  const cap = getCurrentDailyCap();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countErr } = await supabaseAudit
    .from('kiko_linkedin_audit')
    .select('id', { count: 'exact', head: true })
    .eq('action_type', actionType)
    .eq('status', 'success')
    .gte('created_at', todayStart.toISOString());
  if (countErr) {
    console.error('[linkedin-client] quota count error:', countErr.message);
    // Fail open — don't let DB issues stop legitimate sends
    return null;
  }
  if (count >= cap) {
    throw new LinkedInQuotaExceededError(actionType, count, cap);
  }
  // Insert pending audit row, return id for later update
  const { data: inserted, error: insertErr } = await supabaseAudit
    .from('kiko_linkedin_audit')
    .insert([{
      action_type: actionType,
      status: 'pending',
      source: source,
    }])
    .select('id')
    .single();
  if (insertErr) {
    console.error('[linkedin-client] audit insert error:', insertErr.message);
    return null;
  }
  return inserted?.id || null;
}

// Update audit row after action completes
async function updateAuditRow(auditId, updates) {
  if (!supabaseAudit || !auditId) return;
  try {
    await supabaseAudit
      .from('kiko_linkedin_audit')
      .update({ ...updates, completed_at: new Date().toISOString() })
      .eq('id', auditId);
  } catch (e) {
    console.error('[linkedin-client] audit update error:', e.message);
  }
}
```

**Then wrap the existing write functions.** Use `edit_block` for surgical modification. The pattern for `linkedinSendInvite`:

```javascript
// BEFORE (existing code at top of function):
export async function linkedinSendInvite(profileUrl, message = '') {
  if (message.length > 200) {
    throw new Error('LinkedIn invite messages are limited to 200 characters');
  }

// AFTER (wrap with safety checks and audit):
export async function linkedinSendInvite(profileUrl, message = '', source = 'unknown') {
  checkKillSwitch();
  if (message.length > 200) {
    throw new Error('LinkedIn invite messages are limited to 200 characters');
  }
  const auditId = await checkAndIncrementQuota('invite', source);
  try {
```

And at the end of the function (before the `return`):

```javascript
// BEFORE:
  return { success: true, invitationUrn: result?.value?.entityUrn || null };
}

// AFTER:
    await updateAuditRow(auditId, { 
      status: 'success', 
      target_url: profileUrl,
      response_status: 200,
      response_excerpt: JSON.stringify(result).slice(0, 500),
    });
    return { success: true, invitationUrn: result?.value?.entityUrn || null };
  } catch (err) {
    await updateAuditRow(auditId, { 
      status: 'failed', 
      target_url: profileUrl,
      error_message: err.message,
    });
    throw err;
  }
}
```

**Apply the same pattern to `linkedinSendMessage`.** Search operations (`linkedinSearch`, `linkedinGetProfile`, `linkedinGetConversations`) get audit logging but NOT quota checks — they're read-only.

For search audit logging, simpler pattern (no try/catch wrap needed since no quota):
```javascript
// At start of linkedinSearch, after existing code:
const auditId = supabaseAudit ? (await supabaseAudit.from('kiko_linkedin_audit').insert([{
  action_type: 'search',
  target_url: query,
  status: 'pending',
  source: 'unknown',
}]).select('id').single()).data?.id : null;
```

And after success:
```javascript
if (auditId) await updateAuditRow(auditId, { status: 'success', response_status: 200 });
```

### STEP 5.4 — Create `api/cron-linkedin-sender.js`

```javascript
// api/cron-linkedin-sender.js — LinkedIn Sequence Action Sender
// Runs every 30min Mon-Fri 8am-5pm UTC. Picks up pending LinkedIn actions
// from kiko_linkedin_queue and executes via Layer 1 tools.
// Daily cap enforced inside linkedin-client.js (graduated 25→40).
// Random 30-90s delays between actions in same batch.
// STANDALONE — if this fails, actions stay 'pending' until next run.

import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { 
  linkedinSendInvite, 
  linkedinSendMessage,
  LinkedInKillSwitchEngagedError,
  LinkedInQuotaExceededError,
} from './linkedin-client.js';

export const config = { maxDuration: 300 };

const BATCH_SIZE = 3;
const MIN_DELAY_MS = 30000;
const MAX_DELAY_MS = 90000;

function randomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-sender', 'started');
  try {
    // 1. Fetch pending batch
    const pending = await sbFetch(
      `kiko_linkedin_queue?status=eq.pending&order=priority.desc,created_at.asc&limit=${BATCH_SIZE}`
    );
    const safe = Array.isArray(pending) ? pending : [];
    if (!safe.length) {
      await cronHeartbeat('cron-linkedin-sender', 'finished', { 
        heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 
      });
      return res.status(200).json({ ok: true, message: 'No pending LinkedIn actions', sent: 0 });
    }

    let sent = 0, failed = 0, killSwitchHit = false, quotaHit = false;
    
    for (const row of safe) {
      try {
        // Resolve linkedin_url
        let linkedinUrl = row.linkedin_url;
        if (!linkedinUrl && row.enrollment_id) {
          const enr = await sbFetch(
            `kiko_sequence_enrollments?id=eq.${row.enrollment_id}&select=linkedin_url&limit=1`
          );
          linkedinUrl = enr?.[0]?.linkedin_url || null;
        }
        if (!linkedinUrl) {
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }),
          });
          await logError('cron-linkedin-sender', `No linkedin_url for queue row ${row.id}`,
            `contact: ${row.contact_name} at ${row.company}`, 'warning');
          failed++;
          continue;
        }

        // Dispatch by message_type
        let result;
        if (row.message_type === 'connection' || row.message_type === 'invite') {
          const inviteMsg = (row.message || '').slice(0, 200);
          result = await linkedinSendInvite(linkedinUrl, inviteMsg, 'cron-linkedin-sender');
        } else if (row.message_type === 'message' || row.message_type === 'dm') {
          result = await linkedinSendMessage(linkedinUrl, row.message || '', 'cron-linkedin-sender');
        } else if (row.message_type === 'engage') {
          // Post-MVP — skip with clear status
          await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'skipped', actioned_at: new Date().toISOString() }),
          });
          continue;
        } else {
          throw new Error(`Unknown message_type: ${row.message_type}`);
        }

        // Success — update row
        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent', actioned_at: new Date().toISOString() }),
        });
        sent++;

        // Random delay before next action (skip after last item)
        if (sent + failed < safe.length) await sleep(randomDelay());
      } catch (err) {
        // Kill switch — abort whole batch immediately
        if (err instanceof LinkedInKillSwitchEngagedError) {
          killSwitchHit = true;
          break;
        }
        // Quota exceeded — abort whole batch, will retry next day
        if (err instanceof LinkedInQuotaExceededError) {
          quotaHit = true;
          break;
        }
        // Auth failure — abort whole batch and fire alert
        if (err.message?.includes('LinkedIn auth failed') || err.message?.includes('401') || err.message?.includes('403')) {
          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              type: 'linkedin_auth_failed',
              severity: 'high',
              title: '🚨 LinkedIn auth failed — cookies need re-extraction',
              detail: 'cron-linkedin-sender hit a 401/403 on LinkedIn voyager API. The LINKEDIN_LI_AT or LINKEDIN_JSESSIONID env vars need refreshing.',
              entity_type: 'system',
              entity_name: 'LinkedIn Auth',
              created_at: new Date().toISOString(),
            }),
          }).catch(() => {});
          break;
        }
        // Generic failure — log and continue
        console.error(`[LinkedInSender] row ${row.id} failed:`, err.message);
        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }),
        });
        await logError('cron-linkedin-sender', err.message,
          `row ${row.id} (${row.contact_name} at ${row.company})`, 'error');
        failed++;
      }
    }

    // Auto-pause check: if >3 failures in last 30min, write alert and pause
    try {
      const recentFailures = await sbFetch(
        `kiko_linkedin_audit?status=eq.failed&created_at=gte.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}&select=id`
      );
      if (Array.isArray(recentFailures) && recentFailures.length >= 3) {
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'linkedin_failure_burst',
            severity: 'high',
            title: '⚠️ LinkedIn burst-failure detected',
            detail: `${recentFailures.length} LinkedIn failures in last 30 min. Investigate before cron runs again.`,
            entity_type: 'system',
            entity_name: 'LinkedIn Sender',
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } catch {}

    await cronHeartbeat('cron-linkedin-sender', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sent + failed,
    });
    return res.status(200).json({ 
      ok: true, sent, failed, 
      killSwitchHit, quotaHit,
    });
  } catch (err) {
    console.error('[LinkedInSender] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-sender', 'error', {
      heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart,
    }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
```

### STEP 5.5 — Create `api/cron-linkedin-auth-check.js`

```javascript
// api/cron-linkedin-auth-check.js — Daily LinkedIn cookie health check
// Runs once per day at 7am UTC. Calls linkedinTestAuth(). 
// If cookies expired: fires high-severity kiko_alert + Gmail alert.
// If healthy: writes heartbeat row to indicate last-known-good state.

import { linkedinTestAuth } from './linkedin-client.js';
import { sendAlert } from './alert-utils.js';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-auth-check', 'started');
  try {
    const result = await linkedinTestAuth();
    
    if (result.authenticated) {
      await cronHeartbeat('cron-linkedin-auth-check', 'finished', {
        heartbeatId: __hbId, 
        durationMs: Date.now() - __hbStart, 
        recordsProcessed: 1,
      });
      return res.status(200).json({ 
        ok: true, 
        authenticated: true, 
        profile: result.profile,
      });
    }
    
    // Auth failed — fire alert
    const alertTitle = '🚨 LinkedIn cookies expired — re-extraction needed';
    const alertBody = [
      `LinkedIn auth check failed at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}.`,
      `Error: ${result.error}`,
      '',
      'ALL Kiko LinkedIn activity (sequences, search, manual actions) will fail until cookies are refreshed.',
      '',
      'TO FIX:',
      '1. Open Chrome, go to linkedin.com (log in if needed)',
      '2. Right-click → Inspect → Application tab → Cookies → https://www.linkedin.com',
      '3. Copy li_at value (long string starting with AQED...)',
      '4. Copy JSESSIONID value (includes surrounding quotes like "ajax:1234...")',
      '5. Open Vercel: https://vercel.com/sunny-9526s-projects/vela-platform/settings/environment-variables',
      '6. Update LINKEDIN_LI_AT and LINKEDIN_JSESSIONID with the new values',
      '7. Redeploy: cd /Users/sunny/Desktop/vela-platform && npx vercel --prod --yes',
      '8. Verify: curl https://kiko.vanhawke.agency/api/linkedin-test',
    ].join('\n');
    
    await sbFetch('kiko_alerts', {
      method: 'POST',
      body: JSON.stringify({
        type: 'linkedin_auth_failed',
        severity: 'high',
        title: alertTitle,
        detail: alertBody,
        entity_type: 'system',
        entity_name: 'LinkedIn Auth',
        created_at: new Date().toISOString(),
      }),
    }).catch(() => {});
    
    await sendAlert(alertTitle, alertBody, 'critical').catch(() => {});
    
    await cronHeartbeat('cron-linkedin-auth-check', 'error', {
      heartbeatId: __hbId, 
      errorMessage: result.error, 
      durationMs: Date.now() - __hbStart,
    });
    return res.status(200).json({ 
      ok: false, 
      authenticated: false, 
      error: result.error,
      alertSent: true,
    });
  } catch (err) {
    console.error('[LinkedInAuthCheck] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-auth-check', 'error', {
      heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart,
    }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
```

### STEP 5.6 — Update `vercel.json` to add the two new crons

Use `edit_block` to add inside the `crons` array (anywhere in the array, alphabetical or sequential is fine):

```json
{
  "path": "/api/cron-linkedin-sender",
  "schedule": "*/30 8-17 * * 1-5"
},
{
  "path": "/api/cron-linkedin-auth-check",
  "schedule": "0 7 * * *"
}
```

The first runs every 30 min Mon-Fri 8am-5pm UTC (= 9am-6pm BST during daylight savings).
The second runs once a day at 7am UTC (= 8am BST).

### STEP 5.7 — One-line patch to `cron-sequence-enqueue.js`

Use `edit_block`. Find this block:

```javascript
await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
  enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
  message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
  priority: 8, status: 'pending'
}) });
```

Replace with (adds `linkedin_url` field):

```javascript
await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
  enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
  linkedin_url: enrollment.linkedin_url || null,
  message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
  priority: 8, status: 'pending'
}) });
```

**Do NOT modify any other line of cron-sequence-enqueue.js.**

### STEP 5.8 — Extend `cron-sequence-reply-detect.js` to scan LinkedIn inbox

Use `edit_block`. Find the right insertion point — AFTER the existing Gmail scan loop completes and BEFORE the final `cronHeartbeat('finished', ...)` call.

Insert this block:

```javascript
// ── LinkedIn reply scan ──
// Scan LinkedIn inbox for replies to active enrollments, mirror email reply behavior
try {
  const { linkedinGetConversations } = await import('./linkedin-client.js');
  const conversations = await linkedinGetConversations({ limit: 30 });
  for (const conv of (conversations || [])) {
    const participantPids = (conv?.participants || [])
      .map(p => p?.miniProfile?.publicIdentifier || p?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile?.publicIdentifier)
      .filter(Boolean);
    if (!participantPids.length) continue;
    const hasUnread = (conv?.unreadCount || 0) > 0;
    if (!hasUnread) continue;
    for (const pid of participantPids) {
      const url = `https://www.linkedin.com/in/${pid}/`;
      const matching = await sbFetch(
        `kiko_sequence_enrollments?status=eq.active&linkedin_url=eq.${encodeURIComponent(url)}&select=id,company,contact_name,contact_email&limit=1`
      );
      if (!matching?.length) continue;
      const enrollment = matching[0];
      // Mark as replied
      await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'replied',
          reply_detected_at: new Date().toISOString(),
        }),
      });
      // Cancel queued items (both email and linkedin)
      await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, {
        method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }),
      });
      await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${enrollment.id}&status=eq.pending`, {
        method: 'PATCH', body: JSON.stringify({ status: 'skipped', actioned_at: new Date().toISOString() }),
      });
      // Fire alert
      await sbFetch('kiko_alerts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'reply_from_prospect',
          severity: 'high',
          title: `LinkedIn reply: ${enrollment.contact_name}`,
          detail: `${enrollment.contact_name} at ${enrollment.company} replied via LinkedIn. Sequence auto-stopped.`,
          entity_type: 'contact',
          entity_name: enrollment.contact_name,
          metadata: { source: 'linkedin_reply_detect', conversation_urn: conv?.entityUrn },
          created_at: new Date().toISOString(),
        }),
      });
      replies++;
    }
  }
} catch (linkedinErr) {
  // Don't fail the whole cron — Gmail scan already worked
  console.error('[ReplyDetect] LinkedIn scan failed:', linkedinErr.message);
}
```

**Be careful with the insertion point.** It MUST go after Gmail scan completes and BEFORE the heartbeat finish. If the file structure makes this unclear, ask before guessing.

### STEP 5.9 — Bump version

Edit `package.json`: `"version": "0.0.64"` → `"version": "0.0.65"`.

### STEP 5.10 — Local build

```bash
cd /Users/sunny/Desktop/vela-platform
npm run build 2>&1 | tail -40
```

**Expected:** Exit 0. If errors, fix and re-run.

### STEP 5.11 — Commit + push + deploy

```bash
git add api/linkedin-client.js api/cron-linkedin-sender.js api/cron-linkedin-auth-check.js api/cron-sequence-enqueue.js api/cron-sequence-reply-detect.js vercel.json package.json
git commit -m "v0.0.65: LinkedIn Layer 2 + safety scaffolding

- New api/cron-linkedin-sender.js: processes kiko_linkedin_queue pending rows
  via Layer 1 tools, with batch size 3, random 30-90s delays, business hours only
- New api/cron-linkedin-auth-check.js: daily 7am UTC cookie expiry monitor with
  high-severity alerts via kiko_alerts + Gmail
- linkedin-client.js: added kill switch, graduated quota (25/day week 1, 40/day 
  week 2+), audit log integration via new kiko_linkedin_audit table, custom 
  error classes for clear failure semantics
- cron-sequence-enqueue.js: one-line patch to populate linkedin_url at enqueue
- cron-sequence-reply-detect.js: extended to scan LinkedIn inbox via voyager
- vercel.json: 2 new cron schedules (linkedin-sender every 30min Mon-Fri 8-17 UTC,
  linkedin-auth-check daily 7am UTC)
- New env var supported: LINKEDIN_KILL_SWITCH (set to '1' to instantly halt all
  LinkedIn write operations)
- New env var supported: LINKEDIN_FIRST_USE_DATE (YYYY-MM-DD, controls cap ramp)

Migration: kiko_linkedin_audit table created with indexes on created_at, status,
action_type. RLS enabled with service-role full-access policy.

Dormant until cookies installed: every operation throws gracefully if 
LINKEDIN_LI_AT or LINKEDIN_JSESSIONID is unset, so deploy is safe with cookies 
still missing.

Ring fence: no changes to kiko.js, kiko-health.js, three-layer Bible, 
OrgContext.jsx, src/contexts/*, lemlist files, cron-sequence-sender.js."
git push origin main
npx vercel --prod --yes
```

### STEP 5.12 — Post-deploy kiko-health verification (CRITICAL GATE)

```bash
sleep 15
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health -H "Content-Type: application/json" -d '{}' --max-time 30
```
**Expected:** PASS, all 3 layers, latency within 500ms of 1812ms baseline.
**If anything else: roll back immediately via `git revert HEAD && git push && npx vercel --prod --yes`.**

### STEP 5.13 — Verify cron-linkedin-sender runs cleanly with empty queue

```bash
curl -s "https://kiko.vanhawke.agency/api/cron-linkedin-sender" --max-time 90 | jq
```
**Expected (queue empty):** `{ "ok": true, "message": "No pending LinkedIn actions", "sent": 0 }`

### STEP 5.14 — Verify cron-linkedin-auth-check runs cleanly with no cookies

```bash
curl -s "https://kiko.vanhawke.agency/api/cron-linkedin-auth-check" --max-time 30 | jq
```
**Expected:** `{ "ok": false, "authenticated": false, "error": "...env var not set...", "alertSent": true }`

This is correct behavior — cookies aren't set yet, so the alert fires. Sunny will see one alert in his Gmail and one row in `kiko_alerts`. Verify via:
```sql
SELECT id, type, severity, title, created_at 
FROM kiko_alerts 
WHERE type = 'linkedin_auth_failed' 
  AND created_at > NOW() - INTERVAL '5 minutes';
```

This is the **expected single alert** — it confirms the monitoring system works. Sunny will use this same alert flow if cookies expire later.

### STEP 5.15 — Verify the audit table migration applied

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'kiko_linkedin_audit';
```
**Expected:** Returns the 11 columns from the migration.

### STEP 5.16 — STOP. Brief Sunny on cookie installation.

Tell Sunny:

> v0.0.65 is shipped and verified. Next steps for you:
> 
> 1. Extract LinkedIn cookies from your browser (Chrome → linkedin.com → Inspect → Application → Cookies → li_at + JSESSIONID)
> 2. Add to Vercel env vars:
>    - `LINKEDIN_LI_AT` = (the li_at value)
>    - `LINKEDIN_JSESSIONID` = (the JSESSIONID value, with quotes)
>    - `LINKEDIN_FIRST_USE_DATE` = today's date in YYYY-MM-DD format (e.g. 2026-04-14)
> 3. Redeploy: `npx vercel --prod --yes`
> 4. Verify cookies work: `curl https://kiko.vanhawke.agency/api/linkedin-test` — should now return `authenticated: true`
> 5. Run cron-linkedin-auth-check once manually to confirm the alert STOPS firing:
>    `curl https://kiko.vanhawke.agency/api/cron-linkedin-auth-check`
>    Should now return `authenticated: true` instead of the failure alert.
> 
> Once those 5 steps are done, the entire LinkedIn stack is live with:
> - 25 invites/day cap until 2026-04-21, then 40/day
> - Kill switch via `LINKEDIN_KILL_SWITCH` env var (set to "1" to halt all writes instantly)
> - Daily 7am UTC cookie health check
> - Random 30-90s delays between actions
> - Audit log of every action in kiko_linkedin_audit
> - Auto-pause if >3 failures in 30 min
> - Business hours only (8-17 UTC, Mon-Fri)

### STEP 5.17 — Update KIKO_MASTER_LOG.md

Append:

```markdown
## v0.0.65 — LinkedIn Layer 2 + Safety Scaffolding — [DATE TIME BST]

**Goal:** Make LinkedIn fully executable in Kiko sequences with safety scaffolding 
(rate limits, kill switch, audit log, cookie expiry monitor).

**Pre-deploy:** kiko-health PASS, 1812ms, [core, org, personal]
**Post-deploy:** kiko-health PASS, <ms>, [core, org, personal]

**Migration applied:**
- kiko_linkedin_audit table (11 columns + 3 indexes + RLS)

**Files added:**
- api/cron-linkedin-sender.js (NEW)
- api/cron-linkedin-auth-check.js (NEW)

**Files modified:**
- api/linkedin-client.js (added kill switch, quota, audit wrappers — additive only)
- api/cron-sequence-enqueue.js (1-line: populate linkedin_url at enqueue)
- api/cron-sequence-reply-detect.js (extended for LinkedIn inbox scan)
- vercel.json (2 new cron schedules)
- package.json (0.0.64 → 0.0.65)

**New env vars supported (set by Sunny post-deploy):**
- LINKEDIN_LI_AT (cookie)
- LINKEDIN_JSESSIONID (cookie)
- LINKEDIN_FIRST_USE_DATE (YYYY-MM-DD, controls cap graduation)
- LINKEDIN_KILL_SWITCH (set to "1" to halt all writes instantly)

**Daily caps:** 25 actions for week 1, automatic graduation to 40 on day 8.
**Pacing:** 30-90s random delay between actions in same batch.
**Schedule:** 
- cron-linkedin-sender: every 30 min Mon-Fri 8-17 UTC
- cron-linkedin-auth-check: daily 7am UTC

**Verification:**
- empty-queue cron returned {ok:true, sent:0}
- auth-check cron correctly fired an alert (cookies not yet installed)
- migration applied and verified

**Ring fence intact:** No changes to api/kiko.js, api/kiko-health.js, three-layer 
Bible, OrgContext.jsx, src/contexts/*, lemlist files, cron-sequence-sender.js.

**What this enables:**
- AI-generated 4 email + 3 LinkedIn sequences execute end-to-end
- Reply detection works across both Gmail AND LinkedIn inbox
- The path is now clear to drop Lemlist's LinkedIn module after 1 week of 
  clean operation
- Sunny can flip kill switch via single env var change if anything looks off

**Outstanding:**
- Sunny installs cookies (5 min manual step)
- Sunny verifies linkedin-test returns authenticated:true
- 1 week observation window before considering Lemlist drop
- Next session candidates: Today daily workload view, sequence builder UI for 
  manually adding LinkedIn step types, Layer 3 Chrome extension
```

---

## 6. ACCEPTANCE CRITERIA

All MUST be true for v0.0.65 to be shipped:

- [ ] `npm run build` exits 0 locally
- [ ] Migration `v065_kiko_linkedin_audit_table` applied successfully
- [ ] `kiko_linkedin_audit` table queryable with 11 columns
- [ ] `git push origin main` succeeds
- [ ] `npx vercel --prod --yes` reports successful deployment
- [ ] Pre-deploy kiko-health: PASS, all 3 layers
- [ ] Post-deploy kiko-health: PASS, all 3 layers
- [ ] Empty-queue cron-linkedin-sender returns `{ok:true, sent:0}`
- [ ] cron-linkedin-auth-check correctly returns `{authenticated:false, alertSent:true}` AND a `kiko_alerts` row exists with type=`linkedin_auth_failed`
- [ ] Sunny receives one Gmail alert from the auth-check cron (this is the proof the alert pipeline works)
- [ ] `KIKO_MASTER_LOG.md` updated
- [ ] Brief shown to Sunny in chat with cookie installation instructions

---

## 7. ROLLBACK PROCEDURE

### 7.1 Code rollback (if kiko-health post-deploy fails)
```bash
git revert HEAD --no-edit
git push origin main
npx vercel --prod --yes
sleep 15
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health -H "Content-Type: application/json" -d '{}'
```

### 7.2 Migration rollback (if audit table causes issues)
```sql
DROP TABLE IF EXISTS kiko_linkedin_audit CASCADE;
```
The application will fail open (no audit logging) but won't crash — `supabaseAudit` checks are wrapped in try/catch.

### 7.3 Cron disable (if cron-linkedin-sender misbehaves)
Edit `vercel.json` to remove the cron-linkedin-sender entry, redeploy. Pending rows in `kiko_linkedin_queue` will sit untouched.

### 7.4 Kill switch (if LinkedIn account looks flagged)
```bash
npx vercel env add LINKEDIN_KILL_SWITCH production
# When prompted, enter: 1
npx vercel --prod --yes
```
All LinkedIn writes stop within seconds. Searches still work.

### 7.5 Full LinkedIn stack disable (nuclear option)
1. Set LINKEDIN_KILL_SWITCH=1 in Vercel
2. Delete LINKEDIN_LI_AT and LINKEDIN_JSESSIONID
3. Update all pending kiko_linkedin_queue rows to status='paused'
4. Wait 24-48 hours
5. Re-extract cookies, re-add env vars, unset kill switch when ready

---

## 8. TIME BUDGET

- Pre-flight checks: 5 min
- Read existing patterns: 15 min
- Apply migration: 5 min
- Modify linkedin-client.js (add safety wrappers): 30 min
- Write cron-linkedin-sender.js: 30 min
- Write cron-linkedin-auth-check.js: 15 min
- Update vercel.json: 2 min
- One-line edit to cron-sequence-enqueue.js: 3 min
- Extend cron-sequence-reply-detect.js: 30 min (most fiddly — careful insertion point)
- Build + commit + push + deploy: 10 min
- Post-deploy verification + audit table check: 10 min
- Empty-queue cron test + auth-check test: 10 min
- KIKO_MASTER_LOG.md update: 5 min

**Total: ~3 hours if everything works first try. Budget 5 hours including contingency.**

---

## 9. WHAT YOU ARE NOT DOING IN THIS SESSION

Out of scope for v0.0.65:

- ❌ Installing the cookies (Sunny does this AFTER deploy verification)
- ❌ Running a real synthetic invite test (deferred until after Sunny installs cookies)
- ❌ Sequence builder UI for manually adding LinkedIn step types (defer to v0.0.66)
- ❌ Profile visits, voice messages, content engagement (post-MVP)
- ❌ Sales Navigator search support (post-MVP)
- ❌ Chrome extension Manifest V3 (Layer 3, separate session)
- ❌ Job-change detector cron (Layer 4)
- ❌ Today daily workload view (separate track)
- ❌ Unified inbox UI (separate track)
- ❌ Dropping Lemlist subscription (wait 1 week of clean operation first)

If you find yourself wanting to fix any of the above mid-session, write it to KIKO_MASTER_LOG.md as a follow-up.

---

## 10. ONE SENTENCE SUMMARY

You are shipping a new audit table, two new crons, three additive safety wrappers in linkedin-client.js, two surgical edits to existing crons, and two new vercel.json schedules — all of which can deploy cleanly with cookies still missing because every operation fails gracefully until cookies are installed by Sunny in a separate post-deploy step.

**Pre-deploy baseline: PASS, 1812ms, [core, org, personal]. Match this post-deploy or roll back. Ring fence is absolute. Go.**

---

**END OF v0.0.65 BRIEF.**
