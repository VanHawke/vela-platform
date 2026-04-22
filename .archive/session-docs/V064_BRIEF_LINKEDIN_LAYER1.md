# CLAUDE CODE BRIEF — v0.0.64 LINKEDIN LAYER 1 (LinkedIn Tools)

**Copy everything below into Claude Code in a fresh session opened at `/Users/sunny/Desktop/vela-platform`.**

---

## 0. WHAT YOU ARE SHIPPING AND WHY

You are shipping **v0.0.64** — Layer 1 of the Lemlist replacement. This adds **native LinkedIn API capability** to Kiko: the ability to search LinkedIn, send connection invites, and send messages to existing connections, all from inside Kiko's tool layer. After this ships, Kiko can do LinkedIn actions from chat (e.g. "send a connection invite to [URL] with this note") — but LinkedIn is NOT yet a step type in sequences. That's v0.0.65 (Layer 2).

**This is part 1 of a 2-part build.** v0.0.64 ships the tools. v0.0.65 ships the sequence engine integration that makes LinkedIn a drag-and-drop step type alongside email. Both are needed before you can drop Lemlist's LinkedIn module.

**Pre-deploy baseline (recorded by claude.ai session ~01:30 BST Tue 14 Apr 2026):**
- Production: `https://kiko.vanhawke.agency` running v0.0.63
- kiko-health: **PASS, 1394ms, all 3 layers** `[core, org, personal]`
- v0.0.63 webhook safety net is live and verified (Lemlist webhook URL is correctly pointing at kiko.vanhawke.agency/api/lemlist-webhook)

You must restore kiko-health to PASS with all 3 layers after every deploy. Same protocol as v0.0.63.

---

## 1. RECONNAISSANCE ALREADY COMPLETED (do not re-do this)

The claude.ai session burned tool budget mapping the existing LinkedIn surface area. Key findings:

### 1.1 LinkedIn-related tables that ALREADY EXIST in Supabase

```
kiko_linkedin_queue       ← EXISTS, has columns: id, enrollment_id, contact_name, company,
                             linkedin_url, message_type (default 'connection'), message,
                             context, status (default 'pending'), priority, created_at, actioned_at
kiko_outreach_queue       ← EXISTS, ALREADY has channel column (default 'email')
kiko_sequences            ← EXISTS, steps stored as JSONB array
kiko_sequence_enrollments ← EXISTS, ALREADY has linkedin_url, title, phone columns
kiko_sequence_conditions  ← EXISTS, supports conditional branching
```

**You do NOT need to add any tables for v0.0.64.** Layer 2 (v0.0.65) might add a column or two but Layer 1 is purely code.

### 1.2 Existing LinkedIn references in the codebase

The following files already mention LinkedIn:
- `api/kiko-self-knowledge.js` — Kiko knows it's supposed to do LinkedIn
- `api/build-campaign.js`, `api/verify-campaign-targets.js`, `api/enrich-campaign-sponsorship.js` — campaign builders that include LinkedIn URLs
- `api/agents/data.js` — references kiko_linkedin_queue (read pattern)
- `api/agents/intent-classifier.js`, `api/agents/navigator.js`, `api/agents/content.js`, `api/agents/document.js`, `api/agents/deal.js` — various LinkedIn URL handling
- `api/cron-sequence-enqueue.js` — already references kiko_linkedin_queue (writes pending LinkedIn actions when enqueueing sequences)
- `api/generate-sequence.js` — **CRITICAL**: already generates 4-email + 3-LinkedIn sequences via the Sonnet prompt at line 93. The sequence generator is already multi-channel.

### 1.3 What does NOT yet exist

- ❌ NO LinkedIn API client code (no fetch calls to linkedin.com/voyager)
- ❌ NO `cron-linkedin-sender.js` (the cron that processes pending LinkedIn queue rows)
- ❌ NO Kiko tools for `linkedin_search`, `linkedin_send_invite`, `linkedin_send_message`
- ❌ NO LinkedIn auth credentials in Vercel env vars
- ❌ NO sequence builder UI for adding LinkedIn step types manually (Layer 2)

### 1.4 The existing tool registration pattern in api/kiko-tools.js

Tools are registered via `TOOL_DEFINITIONS` (an array of tool spec objects with name/description/input_schema) and dispatched via `executeTool(name, input)` (a switch statement that calls the implementation). To add a new tool you:
1. Add an entry to TOOL_DEFINITIONS with the schema
2. Add a case to executeTool() that calls your implementation
3. Implement the function elsewhere in the file or in a separate import

### 1.5 The existing cron pattern in api/cron-sequence-sender.js

```javascript
// 216 lines. The pattern:
1. Heartbeat start
2. Daily limit check (counts sent_today, caps at 30)
3. Fetch queued rows: status=queued AND channel=email AND scheduled_for<=now LIMIT 5
4. For each row: resolve send-as user, get Gmail token, build MIME, send
5. Update row status to 'sent' or 'failed'
6. Heartbeat finish
```

The LinkedIn sender (Layer 2, v0.0.65) will mirror this exactly but filter on `channel LIKE 'linkedin_%'` and call the LinkedIn tools instead of Gmail.

### 1.6 Vercel runtime check
- vela-platform is currently 100% Node.js (no Python files in api/, no requirements.txt)
- Adding Python would require new build configuration and break the single-runtime simplicity
- Decision: **stay in JS for v0.0.64**, use fetch() against LinkedIn's voyager API directly

---

## 2. ARCHITECTURE DECISION (already made — do not re-litigate)

**Option C chosen: JS-native HTTP wrapper calling LinkedIn's voyager API directly.** Cookie auth via Vercel env var.

**Why this over Python (`linkedin-api` lib) or a separate microservice on Render:**
1. Stays in the existing Node.js Vercel deployment — zero new infrastructure
2. No new languages, no new build steps, no Python dependency hell
3. ~200ms cold start vs 1-3s for Python serverless functions
4. Single repo, single deploy, single rollback target
5. Operations needed for MVP are narrow (search + invite + message) — manageable to implement in raw fetch()
6. **Fallback path documented**: if LinkedIn changes voyager API and breaks v0.0.64, migrate to standalone Python microservice on Render in a future v0.0.66. The fallback is clean because Layer 2 (v0.0.65) only depends on the Layer 1 tool interfaces, not their implementation.

**The voyager API endpoints we need:**

```
GET   https://www.linkedin.com/voyager/api/identity/profiles/{publicId}
POST  https://www.linkedin.com/voyager/api/growth/normInvitations
POST  https://www.linkedin.com/voyager/api/messaging/conversations/{conversationUrn}/events
GET   https://www.linkedin.com/voyager/api/messaging/conversations
POST  https://www.linkedin.com/voyager/api/voyagerSearchDashClusters?q=all&query=...
```

**Required headers for every request:**

```
cookie: li_at=<value>; JSESSIONID="<value>"
csrf-token: <JSESSIONID value WITHOUT the quotes>
x-restli-protocol-version: 2.0.0
accept: application/vnd.linkedin.normalized+json+2.1
user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

**The csrf-token quirk**: LinkedIn's voyager API requires the `csrf-token` header to match the JSESSIONID cookie value, but with the surrounding double-quotes stripped. This is a real gotcha — many tutorials get it wrong.

---

## 3. RING FENCE — ABSOLUTE DO-NOT-TOUCH RULES

Same as v0.0.63. These are non-negotiable.

**Files you must NOT modify:**
- `api/kiko.js`
- `api/kiko-health.js`
- The three-layer Bible assembly anywhere
- `src/contexts/OrgContext.jsx`
- Anything in `src/contexts/`
- `api/_lib/get-user-role.js`
- `KIKO_BIBLE.md.archive`
- `api/lemlist-webhook.js` and `api/lemlist-backfill.js` (just shipped, don't touch)

**Deploy rules:**
- `npm run build` locally first. No exceptions.
- Never `git push --force`
- Never `VERCEL_FORCE_NO_BUILD_CACHE=1` ($830 lesson)
- Deploy via: `git push origin main` then `npx vercel --prod --yes`
- kiko-health probe BEFORE and AFTER every deploy. Both must be PASS with all 3 layers. If post-deploy fails, roll back immediately.

**3-strike rule:** 3 consecutive failures = STOP. Write failure to KIKO_MASTER_LOG.md. Ask Sunny.

**Files you ARE allowed to create/modify in this session:**
- `api/linkedin-client.js` (NEW — the LinkedIn HTTP wrapper)
- `api/kiko-tools.js` (MODIFY — add tool definitions and dispatcher cases)
- `package.json` (MODIFY — version bump 0.0.63 → 0.0.64)
- `KIKO_MASTER_LOG.md` (APPEND — session notes)
- Possibly `api/_lib/linkedin-utils.js` (NEW — shared utilities if needed)

**Files you may READ for reference:**
- `api/cron-sequence-sender.js` — cron pattern reference
- `api/cron-sequence-enqueue.js` — already references kiko_linkedin_queue
- `api/generate-sequence.js` — already produces LinkedIn step types
- `api/agents/data.js` — already reads kiko_linkedin_queue

---

## 4. PRE-FLIGHT CHECKS (must all pass before writing any code)

### 4.1 Confirm pre-deploy kiko-health baseline
```bash
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health \
  -H "Content-Type: application/json" -d '{}' --max-time 30
```
**Expected:** `{"status":"pass","latency_ms":<2500,"bible_layers_loaded":["core","org","personal"],...}`
**If status is not "pass" or any layer is missing: STOP. Do not continue.**

### 4.2 Confirm package.json is at v0.0.63
```bash
cd /Users/sunny/Desktop/vela-platform && grep '"version"' package.json
```
**Expected:** `"version": "0.0.63",`

### 4.3 Confirm git is reasonably clean
```bash
cd /Users/sunny/Desktop/vela-platform && git status --short
```
**Expected:** Clean OR only `recent-ships.json` modifications (auto-generated, harmless). If there are unrelated modifications, investigate before adding new files.

### 4.4 Verify required env vars are set in Vercel
```bash
npx vercel env ls production 2>&1 | grep -E "LINKEDIN_LI_AT|LINKEDIN_JSESSIONID"
```
**Expected:** Both `LINKEDIN_LI_AT` and `LINKEDIN_JSESSIONID` should already be set by Sunny before starting this session (see Sunny's prep step below). If they're missing, STOP and ask Sunny to extract and set them before continuing.

### 4.5 Confirm Sunny has done the cookie extraction prep step

This is a manual step Sunny must complete BEFORE starting this Claude Code session. The brief includes the instructions in Section 5.0 below. If LINKEDIN_LI_AT is not in Vercel env, the build cannot proceed.

---

## 5. STEP-BY-STEP IMPLEMENTATION

### STEP 5.0 — SUNNY'S PREP (must be done BEFORE Claude Code starts)

**Sunny needs to extract his LinkedIn session cookies from his browser and add them to Vercel env vars.** This is a 5-minute manual step.

Instructions for Sunny:

1. Open Chrome, log into LinkedIn at https://www.linkedin.com if not already logged in
2. Right-click anywhere on the page → "Inspect" → opens DevTools
3. In DevTools, click the "Application" tab (top bar — may be hidden behind ">>" arrow)
4. In the left sidebar, expand "Cookies" → click `https://www.linkedin.com`
5. Find the cookie named **`li_at`** → click it → copy the value from the "Value" column
   - The value will be a long string starting with something like `AQED...`
   - This is your authenticated LinkedIn session token
6. Find the cookie named **`JSESSIONID`** → click it → copy the value from the "Value" column
   - The value will look like `"ajax:1234567890123456789"` — INCLUDE the quotes when copying
7. Open Vercel: https://vercel.com/sunny-9526s-projects/vela-platform/settings/environment-variables
8. Add a new env var:
   - Name: `LINKEDIN_LI_AT`
   - Value: (paste the li_at value)
   - Environment: Production, Preview, Development (all three)
9. Add a second env var:
   - Name: `LINKEDIN_JSESSIONID`
   - Value: (paste the JSESSIONID value INCLUDING the quotes — e.g. `"ajax:1234..."`)
   - Environment: Production, Preview, Development (all three)
10. Click "Save"

**Important security note:** These cookies grant full access to Sunny's LinkedIn account. They should be treated like passwords. Vercel env vars are encrypted at rest and only readable by the deployment runtime.

**Cookie expiry:** `li_at` typically lasts ~1 year. `JSESSIONID` resets when LinkedIn pushes a session refresh, usually ~weekly. If LinkedIn invalidates the session, all linkedin tool calls will return 401 and Sunny will need to re-extract and update the env var. This is an expected operational cost of the chosen architecture.

### STEP 5.1 — Read existing code patterns

Before writing anything, read these files to understand the patterns:
```bash
cat /Users/sunny/Desktop/vela-platform/api/kiko-tools.js | head -100
cat /Users/sunny/Desktop/vela-platform/api/cron-sequence-sender.js | head -80
grep -A20 "kiko_linkedin_queue" /Users/sunny/Desktop/vela-platform/api/cron-sequence-enqueue.js
grep -A10 "kiko_linkedin_queue" /Users/sunny/Desktop/vela-platform/api/agents/data.js
```

### STEP 5.2 — Create `api/linkedin-client.js`

This is the core HTTP wrapper. Single file, ~250 lines. It exports:
- `linkedinSearch(query, options)` → Promise<Array of profile snippets>
- `linkedinSendInvite(profileUrl, message)` → Promise<{success, invitationUrn}>
- `linkedinSendMessage(profileUrlOrConversationUrn, message)` → Promise<{success, messageUrn}>
- `linkedinGetConversations()` → Promise<Array of conversations>
- `linkedinGetProfile(publicId)` → Promise<profile data>
- `linkedinTestAuth()` → Promise<{authenticated: boolean, profile?: {...}}>

Implementation skeleton:

```javascript
// api/linkedin-client.js — JS-native LinkedIn voyager API wrapper
// Cookie auth via LINKEDIN_LI_AT + LINKEDIN_JSESSIONID env vars
// Rate-limited internally: max 25 actions/day, randomized delays
// All operations are unauthenticated-LinkedIn-perspective: looks like the user

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getAuthHeaders() {
  const liAt = process.env.LINKEDIN_LI_AT;
  const jsessionid = process.env.LINKEDIN_JSESSIONID;
  if (!liAt || !jsessionid) {
    throw new Error('LINKEDIN_LI_AT or LINKEDIN_JSESSIONID env var not set');
  }
  // CRITICAL: csrf-token must be JSESSIONID value WITHOUT surrounding quotes
  const csrfToken = jsessionid.replace(/^"|"$/g, '');
  return {
    'cookie': `li_at=${liAt}; JSESSIONID=${jsessionid}`,
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'user-agent': USER_AGENT,
    'content-type': 'application/json; charset=UTF-8',
  };
}

async function voyagerFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${VOYAGER_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`LinkedIn auth failed (${res.status}) — li_at cookie may have expired. Re-extract and update LINKEDIN_LI_AT env var.`);
  }
  if (res.status === 429) {
    throw new Error('LinkedIn rate limit hit (429). Backing off.');
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LinkedIn API error ${res.status}: ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// Extract publicId from a LinkedIn URL like https://www.linkedin.com/in/username/
function publicIdFromUrl(url) {
  const m = (url || '').match(/\/in\/([^/?]+)/);
  return m ? m[1] : null;
}

export async function linkedinTestAuth() {
  try {
    const data = await voyagerFetch('/me');
    return {
      authenticated: true,
      profile: {
        firstName: data?.miniProfile?.firstName,
        lastName: data?.miniProfile?.lastName,
        publicIdentifier: data?.miniProfile?.publicIdentifier,
      },
    };
  } catch (e) {
    return { authenticated: false, error: e.message };
  }
}

export async function linkedinGetProfile(publicIdOrUrl) {
  const publicId = publicIdOrUrl.includes('/') ? publicIdFromUrl(publicIdOrUrl) : publicIdOrUrl;
  if (!publicId) throw new Error('Invalid LinkedIn URL or publicId');
  return await voyagerFetch(`/identity/profiles/${publicId}/profileView`);
}

export async function linkedinSendInvite(profileUrl, message = '') {
  if (message.length > 200) {
    throw new Error('LinkedIn invite messages are limited to 200 characters');
  }
  // Get profile to extract miniProfile.entityUrn (needed for invite)
  const publicId = publicIdFromUrl(profileUrl);
  if (!publicId) throw new Error('Invalid LinkedIn profile URL');
  const profile = await voyagerFetch(`/identity/profiles/${publicId}/profileView`);
  const profileUrn = profile?.profile?.miniProfile?.entityUrn;
  const memberId = profileUrn?.split(':').pop();
  if (!memberId) throw new Error('Could not extract member ID from profile');
  const body = {
    trackingId: generateTrackingId(),
    invitations: [],
    excludeInvitations: [],
    invitee: {
      'com.linkedin.voyager.growth.invitation.InviteeProfile': {
        profileId: memberId,
      },
    },
  };
  if (message) body.message = message;
  const result = await voyagerFetch('/growth/normInvitations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { success: true, invitationUrn: result?.value?.entityUrn || null };
}

export async function linkedinSendMessage(profileUrlOrConversationUrn, messageText) {
  // Two paths: existing conversation (urn provided) or new message to profile
  let conversationUrn = profileUrlOrConversationUrn;
  if (profileUrlOrConversationUrn.includes('/in/')) {
    // It's a profile URL — need to find or create conversation
    const publicId = publicIdFromUrl(profileUrlOrConversationUrn);
    const profile = await voyagerFetch(`/identity/profiles/${publicId}/profileView`);
    const memberUrn = profile?.profile?.miniProfile?.entityUrn;
    // Use the create-conversation endpoint
    // (implementation continues — see full file)
  }
  const body = {
    eventCreate: {
      value: {
        'com.linkedin.voyager.messaging.create.MessageCreate': {
          attributedBody: { text: messageText, attributes: [] },
          attachments: [],
        },
      },
    },
  };
  const result = await voyagerFetch(
    `/messaging/conversations/${encodeURIComponent(conversationUrn)}/events?action=create`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  return { success: true, messageUrn: result?.value?.backendEventUrn || null };
}

export async function linkedinSearch(query, { limit = 10 } = {}) {
  // Voyager search endpoint with cluster type "PEOPLE"
  const params = new URLSearchParams({
    q: 'all',
    query: `(keywords:${encodeURIComponent(query)},flagshipSearchIntent:SEARCH_SRP)`,
    count: String(limit),
    origin: 'GLOBAL_SEARCH_HEADER',
  });
  const data = await voyagerFetch(`/voyagerSearchDashClusters?${params}`);
  // Parse cluster response → flat array of profile snippets
  const profiles = [];
  for (const inc of (data?.included || [])) {
    if (inc?.$type === 'com.linkedin.voyager.dash.search.EntityResultViewModel') {
      profiles.push({
        title: inc?.title?.text,
        primarySubtitle: inc?.primarySubtitle?.text,
        secondarySubtitle: inc?.secondarySubtitle?.text,
        navigationUrl: inc?.navigationUrl,
      });
    }
  }
  return profiles.slice(0, limit);
}

export async function linkedinGetConversations({ limit = 20 } = {}) {
  const data = await voyagerFetch(`/messaging/conversations?count=${limit}`);
  return data?.elements || [];
}

function generateTrackingId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)).join(',');
}
```

**This is a SKELETON.** During implementation, you may need to adjust the exact request body shapes based on what LinkedIn's voyager API actually expects today. The endpoints and headers above are correct as of late 2025, but voyager API request bodies change occasionally. **If a request returns 400 or 422, the body shape is wrong** — inspect the response body and adjust.

**Reference for voyager API shapes:**
- The `linkedin-api` Python lib (`pip show linkedin-api` → find source on PyPI mirror) has the canonical request bodies
- Look at `linkedin_api/linkedin.py`, methods `add_connection`, `send_message`, `search_people`
- Translate the Python dict shapes to JS objects

### STEP 5.3 — Add LinkedIn tools to `api/kiko-tools.js`

Add three new tool definitions and three new dispatcher cases. Use the existing TOOL_DEFINITIONS array and executeTool function.

```javascript
// Add to TOOL_DEFINITIONS array
{
  name: 'linkedin_search_prospects',
  description: 'Search LinkedIn for prospects matching a query (keywords, company, title). Returns a list of profile snippets with name, headline, company, and profile URL. Use this to find new prospects to add to a campaign or to verify a prospect exists on LinkedIn before sending an invite.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "VP Marketing whiskey brand", "CISO fintech London")' },
      limit: { type: 'number', description: 'Max results to return (default 10, max 25)' },
    },
    required: ['query'],
  },
},
{
  name: 'linkedin_send_invite',
  description: 'Send a LinkedIn connection invitation to a prospect. Requires their LinkedIn profile URL and an optional personalised note (max 200 characters). Use this when the user explicitly asks to send a LinkedIn invite, or when a sequence step requires it. Will fail if the prospect is already a 1st-degree connection or has already received an invite.',
  input_schema: {
    type: 'object',
    properties: {
      profile_url: { type: 'string', description: 'LinkedIn profile URL (e.g. https://www.linkedin.com/in/username/)' },
      message: { type: 'string', description: 'Personal note (max 200 chars). Leave empty for a no-note invite.' },
    },
    required: ['profile_url'],
  },
},
{
  name: 'linkedin_send_message',
  description: 'Send a direct LinkedIn message to a 1st-degree connection. Requires either a LinkedIn profile URL or an existing conversation URN. Will fail if the recipient is not a 1st-degree connection (use linkedin_send_invite first to connect).',
  input_schema: {
    type: 'object',
    properties: {
      profile_url_or_conversation_urn: { type: 'string', description: 'LinkedIn profile URL or existing conversation URN' },
      message: { type: 'string', description: 'Message text (no length limit, but keep under 1000 chars for readability)' },
    },
    required: ['profile_url_or_conversation_urn', 'message'],
  },
},
```

Then add dispatcher cases in executeTool:

```javascript
case 'linkedin_search_prospects': {
  const { linkedinSearch } = await import('./linkedin-client.js');
  return await linkedinSearch(input.query, { limit: input.limit || 10 });
}
case 'linkedin_send_invite': {
  const { linkedinSendInvite } = await import('./linkedin-client.js');
  return await linkedinSendInvite(input.profile_url, input.message || '');
}
case 'linkedin_send_message': {
  const { linkedinSendMessage } = await import('./linkedin-client.js');
  return await linkedinSendMessage(input.profile_url_or_conversation_urn, input.message);
}
```

### STEP 5.4 — Create `api/linkedin-test.js` (auth verification endpoint)

A simple HTTP endpoint that calls `linkedinTestAuth()` and returns the result. Used to verify the cookies work BEFORE shipping any user-facing tools.

```javascript
// api/linkedin-test.js — GET-only endpoint to verify LinkedIn auth
import { linkedinTestAuth } from './linkedin-client.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Simple guard
  const providedKey = req.query?.key || req.headers?.['x-test-key'];
  if (process.env.KIKO_CRON_SECRET && providedKey !== process.env.KIKO_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const result = await linkedinTestAuth();
  return res.status(result.authenticated ? 200 : 500).json(result);
}
```

### STEP 5.5 — Local build verification

```bash
cd /Users/sunny/Desktop/vela-platform
npm run build 2>&1 | tail -40
```

**Expected:** Exit code 0. Warnings OK. If errors, fix and re-run.

### STEP 5.6 — Bump version in package.json

Edit `package.json`, change `"version": "0.0.63"` to `"version": "0.0.64"`.

### STEP 5.7 — Commit + push + deploy

```bash
git add api/linkedin-client.js api/linkedin-test.js api/kiko-tools.js package.json
git commit -m "v0.0.64: LinkedIn Layer 1 — voyager API wrapper + Kiko tools

- New api/linkedin-client.js: JS-native fetch wrapper for LinkedIn voyager API
  with cookie auth (LINKEDIN_LI_AT + LINKEDIN_JSESSIONID env vars)
- Three new Kiko tools: linkedin_search_prospects, linkedin_send_invite, linkedin_send_message
- New api/linkedin-test.js: GET endpoint for verifying cookie auth works
- Architecture decision: JS-native over Python (rationale in V064_BRIEF_LINKEDIN_LAYER1.md)
- Foundation for v0.0.65 sequence engine integration (Layer 2)

Ring fence: no changes to kiko.js, kiko-health.js, three-layer Bible, OrgContext.jsx, src/contexts/*"
git push origin main
npx vercel --prod --yes
```

### STEP 5.8 — Post-deploy kiko-health verification (CRITICAL GATE)

```bash
sleep 15
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health \
  -H "Content-Type: application/json" -d '{}' --max-time 30
```

**Expected:** PASS, all 3 layers. **If anything else: roll back immediately.**

### STEP 5.9 — LinkedIn auth verification

```bash
curl -s "https://kiko.vanhawke.agency/api/linkedin-test?key=$KIKO_CRON_SECRET" | jq
```

**Expected response:**
```json
{
  "authenticated": true,
  "profile": {
    "firstName": "Sunny",
    "lastName": "Sidhu",
    "publicIdentifier": "sunny-sidhu-..."
  }
}
```

**If `authenticated: false`:**
1. Check the error message — most likely "li_at cookie may have expired"
2. Sunny needs to re-extract cookies from his browser (Step 5.0) and update the Vercel env vars
3. Redeploy after env var update (Vercel automatically re-builds when env vars change)
4. Re-test

**Do NOT proceed past this gate until auth verification returns true.** All subsequent tools depend on this working.

### STEP 5.10 — Synthetic search test

```bash
curl -s -X POST https://kiko.vanhawke.agency/api/kiko \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Search LinkedIn for VP of Marketing at whiskey brands. Return 5 results."}
    ]
  }' | jq
```

**Expected:** Kiko response includes a list of 5 LinkedIn profiles with name, headline, company. The tool call should appear in the response showing `linkedin_search_prospects` was invoked.

### STEP 5.11 — Synthetic invite test (LIVE — be careful)

**This sends a real LinkedIn invite. Sunny must consent before running this test.** Pick a low-stakes target — ideally Sunny's own test LinkedIn account or a prospect Sunny is happy to send a real invite to.

```bash
curl -s -X POST https://kiko.vanhawke.agency/api/kiko \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Send a LinkedIn connection invite to https://www.linkedin.com/in/[TEST_PROFILE]/ with this note: Hi [Name], following up on my note re Haas F1 spirits partnership category. Worth a 15-min conversation? — Sunny"}
    ]
  }' | jq
```

**Expected:** Tool call to `linkedin_send_invite` with `success: true`. Sunny verifies the invite actually appeared in the target's LinkedIn account.

**If 401:** auth issue, see Step 5.9 troubleshooting
**If 422:** voyager API request body shape is wrong, inspect response, adjust `linkedinSendInvite()` body shape
**If 200 but invite doesn't appear:** the API call succeeded but LinkedIn flagged it as automation — back off, reduce volume, do not retry immediately

---

## 6. ACCEPTANCE CRITERIA

All MUST be true for v0.0.64 to be considered shipped:

- [ ] `npm run build` exits 0 locally
- [ ] `git push origin main` succeeds (no force, no conflicts)
- [ ] `npx vercel --prod --yes` reports successful deployment
- [ ] Pre-deploy kiko-health: PASS, all 3 layers
- [ ] Post-deploy kiko-health: PASS, all 3 layers
- [ ] `LINKEDIN_LI_AT` and `LINKEDIN_JSESSIONID` env vars set in Vercel production
- [ ] `/api/linkedin-test` returns `authenticated: true` with Sunny's profile data
- [ ] Synthetic search test (5.10) returns 5 real profile results
- [ ] Synthetic invite test (5.11) returns `success: true` AND Sunny verifies the invite landed in the target account
- [ ] No `kiko_alerts` rows of type 'monitoring' severity 'critical' in the last 30 minutes
- [ ] `KIKO_MASTER_LOG.md` updated with session notes

---

## 7. ROLLBACK PROCEDURE

### 7.1 Code rollback (if kiko-health post-deploy fails)
```bash
cd /Users/sunny/Desktop/vela-platform
git revert HEAD --no-edit
git push origin main
npx vercel --prod --yes
sleep 15
curl -s -X POST https://kiko.vanhawke.agency/api/kiko-health -H "Content-Type: application/json" -d '{}'
```

### 7.2 Env var rollback (if cookies leak or are wrong)
- Delete LINKEDIN_LI_AT and LINKEDIN_JSESSIONID from Vercel env
- Tools will fail gracefully with "env var not set" error
- Sunny re-extracts and re-adds when ready

### 7.3 LinkedIn account safety rollback
If LinkedIn flags the account for automation (you'll see 999 status codes or temporary restrictions on Sunny's LinkedIn account):
- Delete LINKEDIN_LI_AT immediately (stops all Kiko LinkedIn activity)
- Have Sunny log into LinkedIn manually, complete any verification challenges
- Wait 24-48 hours before re-extracting cookies and re-enabling
- Reduce daily action limit in linkedin-client.js (if v0.0.65 has been deployed)

---

## 8. AFTER SHIPPING — UPDATE KIKO_MASTER_LOG.md

```markdown
## v0.0.64 — LinkedIn Layer 1 (Tools) — [DATE TIME BST]

**Goal:** Add native LinkedIn API capability to Kiko via JS-native voyager wrapper.

**Architecture decision:** JS-native (Option C) over Python lib (A) or Render microservice (B).
Documented in V064_BRIEF_LINKEDIN_LAYER1.md.

**Pre-deploy:** kiko-health PASS, 1394ms, [core, org, personal]
**Post-deploy:** kiko-health PASS, <ms>, [core, org, personal]

**Files added:**
- api/linkedin-client.js (NEW — voyager API wrapper)
- api/linkedin-test.js (NEW — auth verification endpoint)

**Files modified:**
- api/kiko-tools.js (added 3 tool definitions + 3 dispatcher cases)
- package.json (0.0.63 → 0.0.64)

**Env vars added in Vercel:**
- LINKEDIN_LI_AT (Sunny's li_at cookie)
- LINKEDIN_JSESSIONID (Sunny's JSESSIONID cookie, with quotes preserved)

**Test results:**
- /api/linkedin-test: authenticated=true, profile=Sunny Sidhu
- linkedin_search_prospects: returned 5 results for "VP Marketing whiskey"
- linkedin_send_invite: real invite sent to [test target], verified delivered

**Known limitations:**
- Cookies expire periodically (~weekly for JSESSIONID, ~yearly for li_at)
- No automatic refresh; Sunny will need to re-extract when auth fails
- No internal rate limiting yet (Layer 2 cron will add daily caps)
- Search results limited to people clusters; companies/jobs need extra work

**Ring fence intact:** No changes to api/kiko.js, api/kiko-health.js, three-layer Bible, OrgContext.jsx, src/contexts/*.

**Next session:** v0.0.65 — Layer 2 sequence engine integration (cron-linkedin-sender + sequence builder UI)
```

---

## 9. TIME BUDGET

- Pre-flight checks: 5 min
- Read existing patterns: 10 min
- Write linkedin-client.js: 60 min (most of the time — voyager API request shapes need careful translation)
- Write linkedin-test.js: 5 min
- Modify kiko-tools.js: 15 min
- Build + commit + push + deploy: 10 min
- Post-deploy verification + auth test: 15 min
- Synthetic search test: 5 min
- Synthetic invite test (with Sunny consent): 10 min
- KIKO_MASTER_LOG.md update: 5 min

**Total: ~2.5 hours if voyager API request bodies work first try. Budget 4 hours including contingency for body shape iteration.**

If you hit 4 hours without shipping, STOP and write the partial state to KIKO_MASTER_LOG.md.

---

## 10. WHAT YOU ARE NOT DOING IN THIS SESSION

Out of scope for v0.0.64:

- ❌ Building cron-linkedin-sender.js (that's v0.0.65 Layer 2)
- ❌ Updating cron-sequence-enqueue.js to handle LinkedIn step types (already done in a previous session)
- ❌ Updating the sequence builder UI to show LinkedIn step types (v0.0.65)
- ❌ Building the Today daily workload view (separate session)
- ❌ Building the unified inbox UI (separate session)
- ❌ Implementing voice messages (advanced LinkedIn feature, post-MVP)
- ❌ Implementing profile visits (post-MVP — low value vs the implementation cost)
- ❌ Implementing Sales Navigator support (post-MVP)
- ❌ Reading LinkedIn inbox messages (Layer 2 + reply detector cron)
- ❌ Building a Chrome extension (Layer 3, weeks 3-4)

If you find yourself wanting to fix any of the above mid-session, write it to KIKO_MASTER_LOG.md as a follow-up and stay focused on v0.0.64 alone.

---

## 11. ONE SENTENCE SUMMARY

You are shipping a JS-native LinkedIn voyager API wrapper plus three Kiko tool definitions, gated on a manual cookie-extraction step Sunny does in his browser, with kiko-health PASS verified before and after deploy.

**Pre-deploy baseline: PASS, 1394ms, [core, org, personal]. Match this post-deploy or roll back. Ring fence is absolute. Go.**

---

**END OF v0.0.64 BRIEF.**
