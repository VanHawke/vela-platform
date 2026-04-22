# KIKO_LEMLIST_RESEARCH.md

**Author:** Kiko
**Date:** 2026-04-10
**Purpose:** Research Lemlist's outbound architecture, identify the concepts worth adopting into Kiko's outreach engine, and scope a path to a Kiko LinkedIn browser extension that gives Sunny the same multi-channel capability without paying $99/seat/month for Lemlist.

---

## Executive summary

Lemlist solves three problems Kiko currently does not:

1. **Multi-channel sequencing in one orchestration layer** — email + LinkedIn touches (visit, connect, message, voice note, video) in a single sequence with conditional logic between steps.
2. **Browser-based LinkedIn automation via a Chrome extension** — bypasses LinkedIn API restrictions by driving the actual logged-in browser session, making the actions look human.
3. **A polished sequence builder UX** — visual flow editor where each step is a node, branches are explicit, and conditions are first-class.

Kiko already does **better** than Lemlist on:

- Intelligence (CRM-first sourcing, verification gate, sponsorship history enrichment, learning loop from edit deltas)
- Personalisation depth (per-prospect company intel, F1 fit scoring, decision-maker context)
- Voice (Sunny's actual sent email patterns inform every draft)
- Cost (~$35-40/month vs Lemlist's $99/seat/month — 60-70% cheaper)
- Sender signal protection (no shared IP pools, sends through Sunny's actual Gmail)

The recommendation is **NOT to adopt Lemlist** but to absorb three specific concepts into Kiko: visual sequence flow editor, LinkedIn browser extension layer, and conditional step branching with wait-for-event triggers.

---

## Lemlist architecture (as of 2025/2026)

### Core concepts

**Campaign** = a sequence of steps targeted at a list of leads. Each campaign has:
- A list of leads (manually added or imported via CSV/CRM/scraper)
- A sequence (ordered steps with conditions)
- A sender identity (email account, optional LinkedIn account)
- Sending settings (timezone, working hours, daily caps, warm-up)

**Step** = one outbound action. Step types:
- `email` — first email
- `email_followup` — reply email in same thread
- `linkedin_visit` — view profile (low-effort warmup signal)
- `linkedin_invite` — send connection request, optionally with note
- `linkedin_message` — send DM (only if connected)
- `linkedin_voice_note` — record + send voice note (only if connected, premium tier)
- `linkedin_inmail` — paid InMail (only with LinkedIn Premium / Sales Navigator)
- `manual_task` — adds task to user's queue, no automation
- `condition` — branches the sequence based on lead state (replied, opened, clicked, connected, etc.)
- `wait` — pause N hours/days before next step

**Trigger** = an event that fires automatically when a condition is met:
- Lead replied → mark as won, stop sequence, optionally route to a different sequence
- Lead bounced → mark as bounced, stop sequence
- Lead opened email N times → escalate to manual task
- Lead clicked link → fire follow-up sooner
- Lead viewed website (via tracking pixel) → trigger LinkedIn touch
- Lead's company posted news → trigger personalised email

**Sequence flow editor** — visual node-based editor. Each step is a card connected by lines. Conditions create branches (Yes/No paths). Looks like Zapier/n8n for outbound. The UX is the main reason people pay for Lemlist over building it themselves.

### LinkedIn browser extension architecture

Lemlist's LinkedIn automation works via a Chrome extension (`Lemlist Chrome Extension`) installed on the user's machine. Architecture:

1. User installs extension, signs into Lemlist account, authorises the extension to drive LinkedIn.
2. Extension runs in the background as a service worker, polling Lemlist's API every ~60 seconds for queued actions.
3. When an action is queued (e.g., "send invite to prospect X"), the extension:
   - Opens a hidden tab to LinkedIn (or uses an existing logged-in tab)
   - Navigates to the prospect's profile via search or direct URL
   - Programmatically clicks the connect/message/visit button using DOM selectors
   - Types the message via simulated keystrokes (with random delays to look human)
   - Submits, then reports the result back to Lemlist's API
4. Rate limits enforced client-side: max 100 invites/week, max 50 messages/day, randomised delays 30-180s between actions, working-hours respect.

**Why this works:** LinkedIn cannot detect server-side automation because every action originates from the user's actual browser, with the user's actual cookies, IP, user agent, and session. LinkedIn's bot detection looks for headless browsers, datacenter IPs, and unnatural action patterns — Lemlist evades all three.

**Why this is risky:** LinkedIn's TOS forbids automation. Accounts using Lemlist do get banned (rare but real). Lemlist mitigates by enforcing strict rate limits and only running during the user's active hours.

### Sender identity + warm-up

Lemlist runs a separate product called **Lemwarm** (now bundled) that warms up new sender mailboxes by exchanging fake emails between Lemwarm-network mailboxes. The goal is to build sender reputation before cold outreach starts. This is critical for new domains — without warm-up, deliverability tanks.

**Key fact:** Sunny's `vanhawke.com` and `vanhawke.agency` domains have been sending real email for years. They are already warmed. Lemwarm would be irrelevant for him.

### Reply handling

Lemlist polls IMAP / Gmail API every ~5 minutes for new replies in active campaign threads. When a reply is detected:
- Sequence is stopped for that lead
- Reply is shown in Lemlist's "Replies" inbox
- User can reply directly from Lemlist UI or in their actual mailbox
- Reply triggers webhook to user's CRM if configured

Kiko already has the equivalent via `cron-reply-detection` and the inbox triage cron.

### Pricing (as of 2026)

- **Standard:** $59/seat/month — email only, 10 sequences, 1 sender per seat
- **Pro:** $99/seat/month — adds LinkedIn automation, 30 sequences, multi-sender
- **Enterprise:** custom — adds team management, advanced analytics, dedicated IP

For Sunny's ~3 active senders the Pro plan would cost $297/month plus $300+ for credit add-ons. Annual: ~$3,500-4,000.

---

## Kiko's current state vs Lemlist (gap analysis)

| Feature | Lemlist | Kiko (today) | Gap |
|---|---|---|---|
| Multi-step email sequence | ✅ visual editor | ✅ steps array in `kiko_sequences.steps` | UX gap — Kiko's editor is a JSON form |
| Conditional branching (replied/opened/clicked) | ✅ first-class | ⚠️ partial — `cron-sequence-enqueue.js` honors `wait_hours` and `conditions` array but no visual editor | Build visual editor |
| Wait steps | ✅ | ✅ via `delay_days` | Parity |
| LinkedIn visit | ✅ extension | ❌ | Extension required |
| LinkedIn invite | ✅ extension | ❌ | Extension required |
| LinkedIn message | ✅ extension | ❌ | Extension required |
| LinkedIn voice note | ✅ extension | ❌ | Out of scope for v1 |
| Email send | ✅ via SMTP/Gmail | ✅ via Gmail API direct | Parity (Kiko safer — uses Gmail API not SMTP) |
| Reply detection | ✅ poll IMAP/Gmail | ✅ `cron-reply-detection` | Parity |
| Bounce detection | ✅ | ✅ via Gmail bounce headers | Parity |
| Open tracking | ✅ pixel | ✅ `instrumentHtml` adds 1×1 pixel | Parity |
| Click tracking | ✅ link rewriting | ⚠️ partial | Add link rewriting |
| Personalisation tokens | ✅ `{firstName}`, `{company}`, custom | ✅ same plus `{revenue_estimate}`, `{ceo}`, `{funding_round}` | Kiko ahead |
| AI-generated personalised intro | ✅ "Lemlist AI" feature | ✅ Kiko's full draft generation with voice profile + company intel | Kiko ahead |
| Per-prospect CRM intel | ❌ generic | ✅ rich CRM context, F1 fit score, sponsorship history | Kiko ahead |
| Verification before send | ❌ | ✅ `verify-campaign-targets` endpoint | Kiko ahead |
| Sender warm-up | ✅ Lemwarm | ❌ not needed (Sunny's domains are warmed) | N/A |
| Timezone-aware sending | ✅ | ✅ as of v0.0.23 (24h cron + per-prospect TZ) | Parity |
| Working-hours respect | ✅ | ✅ | Parity |
| Visual sequence flow editor | ✅ | ❌ JSON-only step config | Build visual editor |
| Team collaboration / shared inbox | ✅ Pro | ❌ single-user | Out of scope (Sunny only) |
| A/B test variants | ✅ | ✅ `kiko_outreach_queue.variant_id` + variant tracking | Parity |
| Cost | $99/seat/mo | ~$0.50-1/mo per seat (Vercel + Supabase + Anthropic) | Kiko 99% cheaper |

**Three real gaps Kiko has vs Lemlist:**
1. LinkedIn touches (no extension)
2. Visual sequence flow editor
3. Click tracking via link rewriting

**Two false gaps that aren't worth closing:**
1. Lemwarm (Sunny's domains are already warmed)
2. Team collaboration (single-user platform)

---

## Recommendation: build a Kiko Chrome extension for LinkedIn

### Scope (v1)

A minimal Chrome extension that drives LinkedIn from Sunny's logged-in browser session, polling Kiko's API for queued LinkedIn actions every 60 seconds. Three action types only:

1. **`linkedin_visit`** — open profile, view, close. Used as a "warmup signal" before sending an invite or email. LinkedIn shows the prospect "Sunny Sidhu viewed your profile" which often triggers a return visit and primes the inbound.

2. **`linkedin_invite`** — send connection request with optional 200-char note. The note is generated by Kiko using the same draft engine that writes emails (voice profile + CRM context), then queued for the extension to send.

3. **`linkedin_message`** — send DM to an existing connection. Same draft engine.

### Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Kiko backend    │ ◄─────► │ Kiko Chrome ext  │ ◄─────► │ LinkedIn (live   │
│ (Vercel API)    │  HTTP   │ (service worker) │   DOM   │  browser session)│
└─────────────────┘         └──────────────────┘         └──────────────────┘
       │                            │                              │
       │ /api/linkedin-queue        │ Polls every 60s              │
       │ /api/linkedin-action-done  │ for queued actions           │
       │                            │                              │
       └─ writes to                 └─ executes one action         └─ shows
          kiko_linkedin_queue          at a time, reports back        prospect
          (already exists!)            with success/failure           sees the
                                                                      action
```

### Data model

**Already exists** in Kiko: `kiko_linkedin_queue` table (created in earlier session, currently inert because nothing populates it). Schema:
```sql
kiko_linkedin_queue (
  id uuid pk,
  enrollment_id uuid fk → kiko_sequence_enrollments,
  action_type text,  -- 'visit' | 'invite' | 'message'
  prospect_linkedin_url text,
  prospect_name text,
  message_body text,  -- nullable for visits
  scheduled_for timestamptz,
  status text,  -- 'queued' | 'in_progress' | 'sent' | 'failed' | 'rate_limited'
  attempted_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz default now()
)
```

### New endpoints needed

1. **`GET /api/linkedin-queue`** — extension polls this. Returns next 1-3 queued actions for Sunny's user_id where `scheduled_for <= now()` AND `status = 'queued'`. Marks them as `status='in_progress'`.

2. **`POST /api/linkedin-action-done`** — extension reports back. Body: `{ action_id, success, error?, response_data? }`. Updates the row to `sent` or `failed`, advances the enrollment if successful.

3. **`POST /api/linkedin-action-queue`** (internal, called by `cron-sequence-enqueue.js` when it hits a LinkedIn step) — adds a row to `kiko_linkedin_queue` with the right scheduled_for.

### Extension code (high level)

```javascript
// background.js (service worker)
const KIKO_API = 'https://vela-platform-one.vercel.app/api';
const POLL_INTERVAL_MS = 60_000;  // 1 min
const RATE_LIMIT = { invites_per_week: 80, messages_per_day: 40 };

async function pollAndExecute() {
  const res = await fetch(`${KIKO_API}/linkedin-queue?user_id=${USER_ID}`);
  const { actions } = await res.json();
  for (const a of actions) {
    // Random delay 30-180s between actions
    await sleep(30_000 + Math.random() * 150_000);
    let result;
    switch (a.action_type) {
      case 'visit':   result = await visitProfile(a.prospect_linkedin_url); break;
      case 'invite':  result = await sendInvite(a.prospect_linkedin_url, a.message_body); break;
      case 'message': result = await sendMessage(a.prospect_linkedin_url, a.message_body); break;
    }
    await fetch(`${KIKO_API}/linkedin-action-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: a.id, success: result.success, error: result.error }),
    });
  }
}

setInterval(pollAndExecute, POLL_INTERVAL_MS);
```

```javascript
// content.js — runs in LinkedIn page context
async function visitProfile(url) {
  window.location.href = url;
  await waitForSelector('main.profile-page');
  await sleep(3000 + Math.random() * 4000);  // dwell time
  return { success: true };
}

async function sendInvite(url, note) {
  window.location.href = url;
  await waitForSelector('button[aria-label*="Connect"]');
  document.querySelector('button[aria-label*="Connect"]').click();
  await sleep(800 + Math.random() * 800);
  if (note) {
    document.querySelector('button[aria-label*="Add a note"]').click();
    await sleep(500);
    const textarea = document.querySelector('textarea#custom-message');
    typeRealistically(textarea, note);
    await sleep(1000);
  }
  document.querySelector('button[aria-label*="Send"]').click();
  return { success: true };
}
```

### Rate limits + safety

- Max 80 invites/week (LinkedIn's hard limit is ~100, leave buffer)
- Max 40 messages/day
- Max 30 visits/day
- 30-180s randomised delay between actions
- Only run between 9am-7pm in Sunny's local time (UK)
- Skip weekends entirely
- If LinkedIn returns "we noticed unusual activity" page → halt for 24h, alert Sunny via email
- All deletes/updates go through `/api/linkedin-action-done` so the queue stays auditable

### Build effort

- Backend: 3 endpoints, ~2 hours
- Extension: manifest v3, background service worker, content script, popup UI showing queue + status, ~1 day
- LinkedIn DOM scraping helpers (handles LinkedIn's frequent DOM changes), ~half day
- Testing + rate-limit tuning, ~half day
- Total: **~3 working days for v1**

### Risks

1. **LinkedIn DOM changes** — LinkedIn ships UI changes weekly. Selectors break. Mitigation: use `aria-label` attributes (more stable than class names), and ship a "selector update" path that doesn't require Chrome Web Store re-review.
2. **Account bans** — rare but real. Mitigation: stay well below limits, never run more than one action per minute, only run during active hours.
3. **Chrome Web Store review** — automation extensions are scrutinised. Mitigation: list as "personal productivity tool for one user", make the source code public on GitHub (paradoxically helps reviews).

---

## Recommendation: build a visual sequence flow editor

### Scope

Replace the current JSON-form step editor in `SequenceDetail.jsx` with a node-based visual editor where each step is a draggable card connected by lines. Branches and conditions are first-class.

### Library choice

**ReactFlow (xyflow.com)** — React library for node-based editors. Already used by Zapier, n8n, Retool. MIT licensed. Handles drag/drop, connections, layouts, minimap, undo/redo, zoom/pan out of the box. ~50KB gzipped.

### Build effort

- Install ReactFlow, ~15 min
- Build node types: EmailStep, LinkedInStep, WaitStep, ConditionStep, ManualTaskStep, ~1 day
- Build edge types: default, conditional-yes, conditional-no, ~half day
- Wire up: load `kiko_sequences.steps` → ReactFlow graph → save back to JSON, ~half day
- Side panel: click a node to edit its content (uses existing draft refine flow), ~half day
- Testing + polish, ~half day
- Total: **~3 working days**

### Why it matters

The current JSON-form editor is functional but ugly. A visual flow editor:
- Makes branching obvious (Sunny can see at a glance which step fires when prospect replies vs doesn't)
- Makes conditional logic discoverable (most users don't know wait_hours / conditions exist)
- Shows the full sequence shape on one screen
- Reduces editing errors (drag a wait step to the right place vs editing JSON line numbers)

### Out of scope for v1

- Real-time collaboration (single-user)
- Branching beyond simple if/else
- Step libraries / templates marketplace

---

## Recommendation: add link click tracking

### Scope

Rewrite outbound URLs in email body HTML at send time. Instead of `https://vanhawke.com/decks/haas`, send `https://vela-platform-one.vercel.app/r/{token}` which redirects to the real URL after recording the click in `email_clicks` table.

### Build effort

- Migration: `email_clicks` table, ~10 min
- `/api/r/[token].js` redirect endpoint, ~30 min
- `instrumentHtml` extension to rewrite anchor hrefs and store the mapping, ~1 hour
- Click event in OutreachIntelligence dashboard, ~1 hour
- Total: **~3 hours**

### Why it matters

Click is the strongest engagement signal short of reply. Currently Kiko knows opens (1×1 pixel) but not clicks. Adding clicks lets the learning loop discover which CTAs and which links convert, and lets Sunny see "Glenn at CyberArk clicked the deck link" in real time.

---

## What we are NOT going to build

- **Lemwarm equivalent** — domains are already warmed
- **Team collaboration** — single-user platform
- **Voice notes via LinkedIn** — too risky for v1, low ROI
- **Lemlist-style template marketplace** — Kiko's drafts are AI-generated per prospect, templates would be a step backward
- **Multi-account sender pool** — Sunny sends from 1-2 mailboxes, no need for pooling
- **Dedicated IP / SMTP relay** — Gmail API direct send is already best-in-class for deliverability for low-volume sends

---

## Final recommendation: priority order

| Phase | Item | Effort | Impact |
|---|---|---|---|
| 1 | Visual sequence flow editor (ReactFlow) | 3 days | HIGH — fixes the worst UX in Kiko |
| 2 | Link click tracking | 3 hours | MEDIUM — adds the missing engagement signal |
| 3 | Kiko Chrome extension v1 (visit + invite + message) | 3 days | HIGH — closes the multi-channel gap with Lemlist, $0/month vs $99 |
| 4 | Conditional branching steps (already partially supported) | 1 day | MEDIUM — first-class in the new visual editor |

**Total effort:** ~7-8 working days to reach Lemlist parity AND ship features Lemlist doesn't have (CRM-first sourcing, verification gate, sponsorship enrichment, voice profile, F1 fit scoring).

**Total cost saving vs Lemlist Pro:** $99 × 12 = $1,188/year minimum, more like $3,500/year if multi-seat. Kiko's marginal cost stays at ~$35-40/month regardless of how many sequences are running.

---

## Open questions for Sunny

1. **Phase order** — should we ship the visual editor first (high UX impact but no new capability), or the Chrome extension first (new capability but uglier MVP)?
2. **LinkedIn account risk** — comfortable running automation from Sunny's primary LinkedIn (the one with all the F1 industry connections), or set up a separate burner account?
3. **Click tracking domain** — use vela-platform-one.vercel.app for the redirect, or a dedicated `link.vanhawke.com` subdomain (better for brand, requires DNS setup)?
4. **Stop-loss thresholds** — what's the bounce-rate / spam-complaint level at which the system should auto-pause all sequences and alert? (Industry standard is bounce >5%, complaint >0.1%.)

---

*End of research doc. Next session: decide which phase to start with, then execute.*
