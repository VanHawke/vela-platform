# CLAUDE CODE BRIEF — v0.0.65 LINKEDIN LAYER 2 (Sequence Engine Integration)

**Copy everything below into Claude Code in a fresh session opened at `/Users/sunny/Desktop/vela-platform`.**

**PREREQUISITE: v0.0.64 must be shipped, verified, and `/api/linkedin-test` must return `authenticated: true`.** Do not start v0.0.65 until v0.0.64 is fully green.

---

## 0. WHAT YOU ARE SHIPPING AND WHY

You are shipping **v0.0.65** — Layer 2 of the Lemlist replacement. After this ships, **LinkedIn becomes a fully executable step type in Kiko sequences**, exactly like email. AI-generated multi-channel sequences will execute end-to-end without manual intervention. Sunny can build a sequence that says "Day 0 email → Day 2 LinkedIn invite → Day 5 LinkedIn message → Day 7 email" and Kiko will execute the entire flow autonomously.

**This is part 2 of a 2-part build.** v0.0.64 shipped the LinkedIn API tools (search, send_invite, send_message). v0.0.65 ships the cron that consumes the existing `kiko_linkedin_queue` table and calls those tools.

**Pre-deploy baseline (recorded by claude.ai session ~01:30 BST Tue 14 Apr 2026):**
- Production: `https://kiko.vanhawke.agency` running v0.0.64 (after Layer 1 ships)
- kiko-health: must be PASS, all 3 layers `[core, org, personal]`
- v0.0.64 `/api/linkedin-test` must return `authenticated: true`

---

## 1. RECONNAISSANCE ALREADY COMPLETED (do not re-do this)

The claude.ai session mapped the entire existing LinkedIn integration. **80% of Layer 2 is already wired up by a previous session.**

### 1.1 What ALREADY works (do not modify)

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

### 1.2 The kiko_linkedin_queue schema (already exists, no migration needed)

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

**Note: there is no `error` column.** If a send fails, log the error to `kiko_error_log` (existing pattern from `logError()` in kiko-tools.js) and update status to 'failed'. Do NOT add a new column for v0.0.65 — keep the migration footprint at zero.

### 1.3 What is missing (the actual v0.0.65 scope)

- ❌ NO `cron-linkedin-sender.js` — the cron that processes `kiko_linkedin_queue` pending rows
- ❌ NO Vercel cron schedule entry for the new cron
- ❌ Reply detection (`cron-sequence-reply-detect.js`) does NOT yet check LinkedIn inbox for replies
- ❌ The `linkedin_url` column on `kiko_linkedin_queue` is sometimes null because `cron-sequence-enqueue.js` doesn't populate it from `enrollment.linkedin_url` — needs a one-line patch

**That's it.** Three small changes. v0.0.65 is dramatically smaller than originally scoped.

### 1.4 The cron-sequence-sender.js pattern to mirror

`api/cron-sequence-sender.js` (216 lines) is the canonical pattern. Key elements to copy:
1. Heartbeat start via `cronHeartbeat('cron-name', 'started')`
2. Daily limit check (count rows already actioned today, return early if >= cap)
3. Fetch a small batch of pending rows (LIMIT 5)
4. For each row: try the action, catch errors, update row status
5. Heartbeat finish

The LinkedIn version differs in three ways:
- Filters `kiko_linkedin_queue?status=eq.pending` instead of `kiko_outreach_queue?status=eq.queued&channel=eq.email`
- Daily cap is 25 (LinkedIn's soft limit) not 30
- Calls Layer 1 tools (`linkedinSendInvite`, `linkedinSendMessage`) instead of Gmail send

---

## 2. ARCHITECTURE (already decided)

**The enqueue side is unchanged** — `cron-sequence-enqueue.js` already writes LinkedIn steps to `kiko_linkedin_queue`. We do NOT touch it for v0.0.65 (one tiny exception: populate `linkedin_url` field — see Step 5.4).

**The execution side is new** — we add `cron-linkedin-sender.js` that mirrors `cron-sequence-sender.js` but processes LinkedIn queue rows. Schedule: every 30 minutes Mon-Fri 9am-6pm UK time. Daily cap: 25 actions.

**The reply detection side is extended** — `cron-sequence-reply-detect.js` currently scans Gmail for replies to sequenced contacts. We extend it to also scan LinkedIn inbox via the Layer 1 `linkedinGetConversations()` function. When a LinkedIn reply is detected for a sequenced contact, the sequence is auto-stopped exactly like an email reply.

---

## 3. RING FENCE — ABSOLUTE DO-NOT-TOUCH RULES

Same as v0.0.63 and v0.0.64.

**Files you must NOT modify:**
- `api/kiko.js`
- `api/kiko-health.js`
- The three-layer Bible assembly anywhere
- `src/contexts/OrgContext.jsx` and anything in `src/contexts/`
- `api/_lib/get-user-role.js`
- `KIKO_BIBLE.md.archive`
- `api/lemlist-webhook.js`, `api/lemlist-backfill.js` (v0.0.63)
- `api/linkedin-client.js` (v0.0.64 — only modify if a clear bug is found)
- `api/kiko-tools.js` (v0.0.64 added LinkedIn tools — only modify if needed for v0.0.65)
- `api/cron-sequence-sender.js` (existing email cron — leave alone, only mirror it)
- `api/cron-sequence-enqueue.js` (the LinkedIn detection code at lines 303-326 is already correct — only the linkedin_url one-line patch in Step 5.4)

**Deploy rules:** identical to v0.0.63 and v0.0.64. `npm run build` first. Never `--force`. Never `VERCEL_FORCE_NO_BUILD_CACHE=1`. kiko-health PASS gate before AND after.

**Files you ARE allowed to create/modify in this session:**
- `api/cron-linkedin-sender.js` (NEW)
- `vercel.json` (MODIFY — add ONE new cron schedule entry)
- `api/cron-sequence-enqueue.js` (MODIFY — ONE line to populate linkedin_url field)
- `api/cron-sequence-reply-detect.js` (MODIFY — extend to scan LinkedIn inbox)
- `package.json` (MODIFY — version bump 0.0.64 → 0.0.65)
- `KIKO_MASTER_LOG.md` (APPEND — session notes)

---

## 4. PRE-FLIGHT CHECKS (must all pass)

### 4.1 Confirm v0.0.64 shipped successfully and LinkedIn auth works
```bash
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health -H "Content-Type: application/json" -d '{}' --max-time 30
curl -s "https://kiko.vanhawke.agency/api/linkedin-test?key=$KIKO_CRON_SECRET" | jq
```
**Expected:**
- kiko-health: PASS, 3 layers
- linkedin-test: `authenticated: true` with Sunny's profile

**If linkedin-test returns false: STOP. Cookies expired. Sunny needs to re-extract before v0.0.65 can ship.**

### 4.2 Confirm v0.0.64 deployed and at version 0.0.64
```bash
cd /Users/sunny/Desktop/vela-platform && grep '"version"' package.json
ls -la api/linkedin-client.js api/linkedin-test.js
```
**Expected:** version `"0.0.64"`, both linkedin files exist.

### 4.3 Confirm git is clean
```bash
git status --short
```
**Expected:** clean OR only `recent-ships.json` drift.

### 4.4 Confirm pending LinkedIn queue is empty (or known)
```sql
SELECT status, COUNT(*) FROM kiko_linkedin_queue GROUP BY status;
```
**Expected:** likely empty since the execution cron didn't exist before. If there are existing pending rows, NOTE the count — they'll be the first thing the new cron processes when it goes live, so if there are 50 pending invites you might want to truncate the table or set them all to 'skipped' before deploying to avoid a huge first run.

---

## 5. STEP-BY-STEP IMPLEMENTATION

### STEP 5.1 — Read the patterns to mirror

```bash
cat /Users/sunny/Desktop/vela-platform/api/cron-sequence-sender.js
cat /Users/sunny/Desktop/vela-platform/api/cron-sequence-enqueue.js | sed -n '290,340p'
cat /Users/sunny/Desktop/vela-platform/api/cron-sequence-reply-detect.js
cat /Users/sunny/Desktop/vela-platform/api/linkedin-client.js  # the v0.0.64 file
```

Take notes on:
- The `cronHeartbeat` start/finish/error pattern
- The daily-limit count query style
- The batch fetch + per-row try/catch loop
- How `sbFetch` is used for PATCH updates
- What the linkedin-client.js exports (linkedinSendInvite, linkedinSendMessage, linkedinGetConversations)

### STEP 5.2 — Create `api/cron-linkedin-sender.js`

```javascript
// api/cron-linkedin-sender.js — LinkedIn Sequence Action Sender
// Runs every 30min Mon-Fri 9am-6pm UK time. Picks up pending LinkedIn actions
// from kiko_linkedin_queue and executes them via Layer 1 tools.
// Daily cap: 25 actions (LinkedIn soft limit). Random delays between sends to
// reduce automation-detection risk.
// STANDALONE — if this fails, actions stay in 'pending' until next run.

import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { linkedinSendInvite, linkedinSendMessage } from './linkedin-client.js';

export const config = { maxDuration: 60 };

const DAILY_CAP = 25;
const BATCH_SIZE = 3;  // small batches to spread actions across runs
const MIN_DELAY_MS = 30000;  // 30 seconds
const MAX_DELAY_MS = 90000;  // 90 seconds

function randomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-sender', 'started');
  try {
    // 1. Daily cap check
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const sentToday = await sbFetch(
      `kiko_linkedin_queue?status=eq.sent&actioned_at=gte.${todayStart.toISOString()}&select=id`
    );
    const dailyCount = Array.isArray(sentToday) ? sentToday.length : 0;
    if (dailyCount >= DAILY_CAP) {
      await cronHeartbeat('cron-linkedin-sender', 'finished', {
        heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0,
      });
      return res.status(200).json({ ok: true, message: `Daily cap reached (${dailyCount}/${DAILY_CAP})`, sent: 0 });
    }

    // 2. Fetch pending batch (small to spread load)
    const remaining = DAILY_CAP - dailyCount;
    const batchSize = Math.min(BATCH_SIZE, remaining);
    const pending = await sbFetch(
      `kiko_linkedin_queue?status=eq.pending&order=priority.desc,created_at.asc&limit=${batchSize}`
    );
    const safe = Array.isArray(pending) ? pending : [];
    if (!safe.length) {
      await cronHeartbeat('cron-linkedin-sender', 'finished', {
        heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0,
      });
      return res.status(200).json({ ok: true, message: 'No pending LinkedIn actions', sent: 0 });
    }

    // 3. Process each row with random delays
    let sent = 0, failed = 0;
    for (const row of safe) {
      try {
        // Resolve linkedin_url: prefer queue row, fall back to enrollment
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
          // LinkedIn invite messages capped at 200 chars
          const inviteMsg = (row.message || '').slice(0, 200);
          result = await linkedinSendInvite(linkedinUrl, inviteMsg);
        } else if (row.message_type === 'message' || row.message_type === 'dm') {
          result = await linkedinSendMessage(linkedinUrl, row.message || '');
        } else if (row.message_type === 'engage') {
          // 'engage' (like/comment) is post-MVP — skip with a clear status
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
          body: JSON.stringify({
            status: 'sent',
            actioned_at: new Date().toISOString(),
          }),
        });
        sent++;

        // Random delay before next action (skip after last item)
        if (sent + failed < safe.length) await sleep(randomDelay());
      } catch (err) {
        console.error(`[LinkedInSender] row ${row.id} failed:`, err.message);
        await sbFetch(`kiko_linkedin_queue?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', actioned_at: new Date().toISOString() }),
        });
        await logError('cron-linkedin-sender', err.message,
          `row ${row.id} (${row.contact_name} at ${row.company})`, 'error');
        failed++;

        // If auth error, abort the whole batch — don't waste retries
        if (err.message?.includes('LinkedIn auth failed') || err.message?.includes('401') || err.message?.includes('403')) {
          await sbFetch('kiko_alerts', {
            method: 'POST',
            body: JSON.stringify({
              type: 'linkedin_auth_failed',
              severity: 'high',
              title: 'LinkedIn auth failed — cookies need re-extraction',
              detail: 'cron-linkedin-sender hit a 401/403 on LinkedIn voyager API. The LINKEDIN_LI_AT or LINKEDIN_JSESSIONID env vars need refreshing. See V064_BRIEF_LINKEDIN_LAYER1.md Step 5.0 for re-extraction steps.',
              entity_type: 'system',
              entity_name: 'LinkedIn Auth',
              created_at: new Date().toISOString(),
            }),
          }).catch(() => {});
          break;  // Stop processing the rest of the batch
        }
      }
    }

    await cronHeartbeat('cron-linkedin-sender', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sent + failed,
    });
    return res.status(200).json({ ok: true, sent, failed, total_today: dailyCount + sent });
  } catch (err) {
    console.error('[LinkedInSender] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-sender', 'error', {
      heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart,
    }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
```

### STEP 5.3 — Add cron schedule to `vercel.json`

Add ONE entry to the `crons` array:

```json
{
  "path": "/api/cron-linkedin-sender",
  "schedule": "*/30 8-17 * * 1-5"
}
```

This runs every 30 minutes Mon-Fri 8am-5pm UTC (which is 9am-6pm UK time during BST). Be careful about cron timezone — Vercel crons are in UTC.

### STEP 5.4 — One-line patch to `cron-sequence-enqueue.js`

The existing code at line 305-309 inserts into `kiko_linkedin_queue` but doesn't include `linkedin_url`. The new sender falls back to enrollment lookup, but it's cleaner to populate it at enqueue time. Use `edit_block`:

```javascript
// Find this exact block:
await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
  enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
  message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
  priority: 8, status: 'pending'
}) });

// Replace with (adds linkedin_url field):
await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
  enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
  linkedin_url: enrollment.linkedin_url || null,
  message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
  priority: 8, status: 'pending'
}) });
```

This is a single field addition to one POST body. Low-risk surgical edit. **Do not modify any other line of cron-sequence-enqueue.js.**

### STEP 5.5 — Extend `cron-sequence-reply-detect.js` to also scan LinkedIn

The existing cron scans Gmail for replies. Add a parallel scan of LinkedIn inbox. Use `edit_block` to add a new section AFTER the existing Gmail scan loop.

Conceptual addition (find the right insertion point in the existing file):

```javascript
// ── LinkedIn reply scan ──
// After the existing Gmail loop, scan LinkedIn inbox for replies
// to any sequenced contact. If found, mark sequence as 'replied'.
try {
  const { linkedinGetConversations } = await import('./linkedin-client.js');
  const conversations = await linkedinGetConversations({ limit: 30 });
  // For each conversation, check the participant against active enrollments
  for (const conv of conversations) {
    // Extract participant LinkedIn URLs from conv.participants
    const participantUrls = (conv.participants || [])
      .map(p => p?.miniProfile?.publicIdentifier)
      .filter(Boolean)
      .map(pid => `https://www.linkedin.com/in/${pid}/`);
    if (!participantUrls.length) continue;
    // Check if conversation has unread messages newer than the last enrollment touch
    const hasUnread = conv.unreadCount > 0;
    if (!hasUnread) continue;
    // Find matching enrollment by linkedin_url
    for (const url of participantUrls) {
      const matching = await sbFetch(
        `kiko_sequence_enrollments?status=eq.active&linkedin_url=eq.${encodeURIComponent(url)}&select=id,company,contact_name&limit=1`
      );
      if (!matching?.length) continue;
      const enrollment = matching[0];
      // Mark as replied (mirrors the email reply path)
      await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'replied',
          reply_detected_at: new Date().toISOString(),
        }),
      });
      // Cancel queued items
      await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.queued`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${enrollment.id}&status=eq.pending`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'skipped', actioned_at: new Date().toISOString() }),
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
          metadata: { source: 'linkedin_reply_detect', conversation_urn: conv.entityUrn },
          created_at: new Date().toISOString(),
        }),
      });
      replies++;
    }
  }
} catch (linkedinErr) {
  console.error('[ReplyDetect] LinkedIn scan failed:', linkedinErr.message);
  // Don't fail the whole cron — Gmail scan already worked
}
```

**Be careful where you insert this.** It should run AFTER the existing Gmail scan loop and BEFORE the final heartbeat finish. Use `edit_block` with sufficient context to place it correctly.

### STEP 5.6 — Bump version

```bash
# Edit package.json: 0.0.64 → 0.0.65
```

### STEP 5.7 — Local build

```bash
cd /Users/sunny/Desktop/vela-platform
npm run build 2>&1 | tail -40
```

### STEP 5.8 — Commit + push + deploy

```bash
git add api/cron-linkedin-sender.js api/cron-sequence-enqueue.js api/cron-sequence-reply-detect.js vercel.json package.json
git commit -m "v0.0.65: LinkedIn Layer 2 — sequence engine integration

- New api/cron-linkedin-sender.js: processes kiko_linkedin_queue pending rows
  via Layer 1 tools, with daily cap (25), random delays, auth failure handling
- vercel.json: new cron schedule (every 30min Mon-Fri 8-17 UTC)
- cron-sequence-enqueue.js: one-line patch to populate linkedin_url at enqueue
- cron-sequence-reply-detect.js: extended to scan LinkedIn inbox for replies
  to active enrollments and auto-stop matching sequences
- Completes the email + LinkedIn multi-channel sequence engine
- Foundation for dropping Lemlist's LinkedIn module entirely

Ring fence: no changes to kiko.js, kiko-health.js, three-layer Bible, OrgContext.jsx, src/contexts/*, linkedin-client.js, kiko-tools.js"
git push origin main
npx vercel --prod --yes
```

### STEP 5.9 — Post-deploy kiko-health verification

```bash
sleep 15
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health -H "Content-Type: application/json" -d '{}' --max-time 30
```
**Expected:** PASS, all 3 layers. **If anything else: roll back.**

### STEP 5.10 — Manually invoke the new cron once

```bash
curl -s "https://kiko.vanhawke.agency/api/cron-linkedin-sender" --max-time 90 | jq
```
**Expected (if queue empty):**
```json
{ "ok": true, "message": "No pending LinkedIn actions", "sent": 0 }
```
**Expected (if queue has pending rows):**
```json
{ "ok": true, "sent": <number>, "failed": <number>, "total_today": <number> }
```

### STEP 5.11 — End-to-end sequence test

This is the proof v0.0.65 actually works. Build a tiny test sequence and watch it execute.

```sql
-- 1. Create a test sequence with 1 LinkedIn step
INSERT INTO kiko_sequences (name, description, target_persona, steps, is_active)
VALUES (
  'v065 LinkedIn Test',
  'Single-step test sequence to verify cron-linkedin-sender end-to-end',
  'test',
  '[{"step":1,"delay_days":0,"channel":"linkedin","action":"connection","subject":"","template":"Hi {firstName}, testing v0.0.65 — please ignore. — Sunny"}]'::jsonb,
  true
);

-- 2. Enroll a real test contact (use a LinkedIn URL Sunny is happy to send a real invite to)
INSERT INTO kiko_sequence_enrollments (sequence_id, contact_email, contact_name, company, linkedin_url, current_step, status, next_send_at)
SELECT id, 'test@example.com', 'Test Recipient', 'Test Co',
       'https://www.linkedin.com/in/[REAL_TEST_PROFILE]/',  -- Sunny picks this
       1, 'active', now()
FROM kiko_sequences WHERE name = 'v065 LinkedIn Test' LIMIT 1;
```

Then trigger the enqueue cron manually so the LinkedIn step lands in `kiko_linkedin_queue`:
```bash
curl -s "https://kiko.vanhawke.agency/api/cron-sequence-enqueue" --max-time 60 | jq
```

Then trigger the LinkedIn sender manually:
```bash
curl -s "https://kiko.vanhawke.agency/api/cron-linkedin-sender" --max-time 90 | jq
```

**Expected:**
- enqueue cron: writes 1 row to `kiko_linkedin_queue` with status='pending'
- linkedin-sender cron: returns `{ok:true, sent:1, failed:0}` AND the queue row updates to status='sent' AND a real LinkedIn invite arrives at the test profile

**Verify in DB:**
```sql
SELECT id, contact_name, company, message_type, status, actioned_at
FROM kiko_linkedin_queue
WHERE message LIKE '%v0.0.65%';
```
Should show 1 row with status='sent', actioned_at set.

**Verify on LinkedIn:** Sunny opens his LinkedIn account and confirms the invite was sent to the test recipient.

### STEP 5.12 — Clean up the test sequence

```sql
DELETE FROM kiko_linkedin_queue WHERE message LIKE '%v0.0.65%';
DELETE FROM kiko_sequence_enrollments WHERE company = 'Test Co';
DELETE FROM kiko_sequences WHERE name = 'v065 LinkedIn Test';
```

(Note: the LinkedIn invite itself stays sent — there's no API to retract a sent invite. Sunny may want to manually withdraw it from his LinkedIn sent invitations list.)

### STEP 5.13 — Confirm `kiko_alerts` doesn't have new auth_failed rows

```sql
SELECT id, type, severity, title, created_at
FROM kiko_alerts
WHERE type = 'linkedin_auth_failed'
  AND created_at > NOW() - INTERVAL '15 minutes';
```
**Expected:** zero rows. If any rows exist, the cron hit a 401/403 — investigate cookies before declaring victory.

---

## 6. ACCEPTANCE CRITERIA

All MUST be true for v0.0.65 to be considered shipped:

- [ ] `npm run build` exits 0 locally
- [ ] `git push origin main` succeeds (no force, no conflicts)
- [ ] `npx vercel --prod --yes` reports successful deployment
- [ ] Pre-deploy kiko-health: PASS, all 3 layers
- [ ] Post-deploy kiko-health: PASS, all 3 layers
- [ ] Empty-queue cron invocation returns `{ ok: true, message: "No pending LinkedIn actions" }`
- [ ] End-to-end test (5.11): test sequence enrolled → enqueue cron writes pending row → sender cron sends invite → row marks 'sent' → real LinkedIn invite delivered
- [ ] Test sequence cleaned up (zero rows remaining)
- [ ] No `kiko_alerts` rows of type 'linkedin_auth_failed' after deploy
- [ ] `KIKO_MASTER_LOG.md` updated with session notes

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

### 7.2 Cron disable (if cron-linkedin-sender goes rogue)
Edit `vercel.json` to remove the cron schedule entry, redeploy. Pending rows in `kiko_linkedin_queue` will sit untouched until you re-enable.

### 7.3 LinkedIn account safety (if account flagged)
1. Delete `LINKEDIN_LI_AT` env var in Vercel — kills all Kiko LinkedIn activity instantly
2. Update all pending `kiko_linkedin_queue` rows to status='paused'
3. Wait 24-48 hours, complete any LinkedIn verification challenges manually
4. Re-extract cookies, re-add env vars, re-enable

---

## 8. AFTER SHIPPING — UPDATE KIKO_MASTER_LOG.md

```markdown
## v0.0.65 — LinkedIn Layer 2 (Sequence Engine Integration) — [DATE TIME BST]

**Goal:** Make LinkedIn a fully executable step type in Kiko sequences.

**Pre-deploy:** kiko-health PASS, <ms>, [core, org, personal]
**Post-deploy:** kiko-health PASS, <ms>, [core, org, personal]

**Files added:**
- api/cron-linkedin-sender.js (NEW — processes kiko_linkedin_queue pending rows)

**Files modified:**
- api/cron-sequence-enqueue.js (ONE line — populate linkedin_url at enqueue time)
- api/cron-sequence-reply-detect.js (extended to scan LinkedIn inbox)
- vercel.json (added cron schedule for cron-linkedin-sender)
- package.json (0.0.64 → 0.0.65)

**Daily cap:** 25 LinkedIn actions/day (LinkedIn soft limit)
**Pacing:** 30-90s random delay between actions in same batch
**Schedule:** every 30 min Mon-Fri 8am-5pm UTC (9am-6pm BST)

**End-to-end test:** built test sequence, enqueued, sender cron processed,
real LinkedIn invite delivered to [test profile], cleaned up cleanly.

**The platform now has full multi-channel sequence execution.** AI-generated
sequences (4 emails + 3 LinkedIn) execute end-to-end without manual intervention.

**Ring fence intact:** No changes to api/kiko.js, api/kiko-health.js, three-layer Bible,
OrgContext.jsx, src/contexts/*, api/linkedin-client.js, api/kiko-tools.js.

**What this enables:**
- Sunny can build sequences in Kiko that mix email and LinkedIn steps
- AI-generated sequences via /campaigns or generate-sequence already produce LinkedIn steps and now they actually execute
- Reply detection works on both Gmail AND LinkedIn inbox
- The path is now clear to drop Lemlist's LinkedIn module

**What this does NOT yet enable:**
- Sequence builder UI for manually adding LinkedIn step types (deferred to v0.0.66)
- Profile visits, voice messages, content engagement (deferred — low value vs cost)
- Chrome extension sidebar overlay on linkedin.com (Layer 3, 2-3 weeks out)
- Job-change detector (Layer 4)
- Unified inbox UI (separate track)

**Outstanding for next session:**
- Today daily workload view
- Quick wins: primary_colour/accent_colour fix
- Layer 3: Chrome extension
```

---

## 9. TIME BUDGET

- Pre-flight checks: 5 min
- Read existing patterns: 15 min
- Write cron-linkedin-sender.js: 45 min
- One-line edit to cron-sequence-enqueue.js: 5 min
- Extend cron-sequence-reply-detect.js: 30 min (most fiddly part — careful insertion point)
- Update vercel.json: 2 min
- Build + commit + push + deploy: 10 min
- Post-deploy verification: 10 min
- End-to-end test (5.11): 20 min including cleanup
- KIKO_MASTER_LOG.md update: 5 min

**Total: ~2.5 hours if everything works first try. Budget 4 hours including contingency.**

---

## 10. WHAT YOU ARE NOT DOING IN THIS SESSION

Out of scope for v0.0.65:

- ❌ Sequence builder UI (`src/pages/Sequences.jsx`) for adding LinkedIn step types manually — defer to v0.0.66
- ❌ Profile visits as a step type — post-MVP
- ❌ Voice messages — post-MVP
- ❌ Content engagement (likes/comments) as a step type — implementation marked 'skipped' in cron, build later
- ❌ Sales Navigator search support — post-MVP
- ❌ Chrome extension Manifest V3 — Layer 3, separate session
- ❌ Job-change detector — Layer 4
- ❌ Today daily workload view — separate track
- ❌ Unified inbox UI — separate track
- ❌ Dropping the Lemlist subscription — wait until v0.0.65 has run for 1+ week with zero issues

If you find yourself wanting to fix any of the above mid-session, write it to KIKO_MASTER_LOG.md as a follow-up.

---

## 11. ONE SENTENCE SUMMARY

You are shipping a single new cron file (cron-linkedin-sender.js) plus three small surgical edits (one line to cron-sequence-enqueue.js, an extension to cron-sequence-reply-detect.js, one entry in vercel.json) that wires the existing already-built LinkedIn queue infrastructure to the v0.0.64 LinkedIn API tools, completing the multi-channel sequence engine.

**Pre-deploy baseline: PASS, [latency], [core, org, personal]. Match this post-deploy or roll back. Ring fence is absolute. Go.**

---

**END OF v0.0.65 BRIEF.**
