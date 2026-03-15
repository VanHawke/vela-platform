# VELA PLATFORM — CONTINUATION BRIEF
## Date: 15 March 2026 | Session handoff document

---

## WHAT IS VELA

Vela is a custom CRM and intelligence platform for Van Hawke Group, built with React/Vite frontend, Vercel Serverless API layer, and Supabase (Postgres + JSONB) backend. Kiko is the AI operating system layer powered by Claude Sonnet 4.6, with Mem0 for cross-session memory, web search for real-time intelligence, Gmail integration, and proactive alerting.

## ACCESS & CREDENTIALS

- **Live URL**: https://vela-platform-one.vercel.app
- **GitHub**: https://github.com/VanHawke/vela-platform (public)
- **GitHub PAT**: [stored in Claude memory — do not commit to repo]
- **Supabase Project ID**: dwiywqeleyckzcxbwrlb
- **Supabase URL**: https://dwiywqeleyckzcxbwrlb.supabase.co
- **Lemlist API Key**: [stored in Claude memory]
- **Pipedrive API Key**: [stored in Claude memory]
- **Mem0 API Key**: [stored in Claude memory / Vercel env as MEM0_API_KEY]
- **Anthropic Key**: in Vercel env as ANTHROPIC_KEY
- **Auth**: sunny@vanhawke.com / [stored in Claude memory]
- **Van Hawke org_id**: 35975d96-c2c9-4b6c-b4d4-bb947ae817d5

## DEPLOYMENT RULES (CRITICAL)

- Local git (`~/Desktop/vela-platform`) is the AUTHORITY — push from Mac only
- GitHub → Vercel auto-deploy (~60s)
- ALWAYS build test (`npm run build`) before committing
- ALWAYS syntax check API files (`node -c api/kiko.js`) before pushing
- Commit after every change, deploy after every meaningful change
- No single file over 400 lines

## ROLLBACK TAGS

- `v3.0-stable` — before enrichment session
- `v3.1-stable` — before org clickthrough fixes
- `v3.2-stable` — before Kiko OS phases
- `v3.3-kiko-os` — after all 8 Kiko OS phases complete
- `v3.4-email` — Gmail restyle + thread view + compose
- `v3.5-email-complete` — + signatures + Kiko draft tool
- `v3.6-full-email` — all 6 email items shipped

---

## CURRENT FILE ARCHITECTURE

```
api/
  kiko.js              (323 lines) — Kiko orchestrator: system prompt, Mem0, SSE streaming, tool routing
  kiko-tools.js        (389 lines) — Tool registry: CRM, email, analytics, nav, alerts (MCP-ready)
  kiko-calendar.js     (46 lines)  — Calendar tool handlers (get + create events)
  kiko-alerts.js       (124 lines) — Proactive intelligence: stale deals, bottlenecks, data quality
  email.js             (398 lines) — Gmail API proxy: sync, send, reply, trash, star, labels, search, threads, list-live, attachments
  email-helpers.js     (85 lines)  — Gmail message parsing and MIME building utilities
  google-token.js      (118 lines) — Google OAuth token management with auto-refresh
  cron-email-sync.js   (104 lines) — 5-minute Gmail sync cron for all connected users
  cron-enrich.js       (58 lines)  — Daily 6am enrichment + alerts cron
  voice.js             (229 lines) — Whisper transcription + OpenAI Realtime (gpt-realtime model)
  news-signals.js      (56 lines)  — Web search powered org news
  enrichment-agent.js  — Claude Haiku batch: titles, industry, country, domains, funding
  backfill-activities.js — Lemlist activity history
  backfill-campaigns.js  — Lemlist campaign assignments
  lemlist-webhook.js     — Lemlist event receiver

src/
  App.jsx                — Routing
  pages/
    Email.jsx            (290 lines) — Gmail inbox: folders, labels, thread list, compose, auto-refresh
    EmailThread.jsx      (212 lines) — Thread viewer: expand/collapse, HTML rendering, reply/forward
    EmailCompose.jsx     (249 lines) — Rich text compose: formatting toolbar, attachments, signature auto-append
    Pipeline.jsx         — Deal Pipeline kanban
    Contacts.jsx         — Contact list (paginated, all 5,006)
    ContactDetail.jsx    — Contact detail page
    Organisations.jsx    — Org list (paginated, all 2,244)
  components/
    kiko/
      KikoChat.jsx       — Home page chat (Kiko Insights widget, prompt chips, passes userEmail)
      KikoFloat.jsx      — Floating Kiko widget (sends pageEntity + userEmail)
      KikoVoice.jsx      — Voice interface (gpt-realtime model)
      KikoSymbol.jsx     — Kiko logo
      ChatHistory.jsx    — Chat history panel with rename (pencil icon) + delete
    layout/
      Layout.jsx         — Top nav (Home resets via kikoResetKey), Sidebar
      Sidebar.jsx        — Nav items
    settings/
      Settings.jsx       — Profile, Kiko voice, Team, Appearance, Accounts + HTML signature editor
```


---

## DATABASE STATE (Supabase)

### contacts (5,006 rows)
- Titles: 4,991 (99.7%)
- Emails: 2,574 (51.4%)
- LinkedIn: 1,753 (35%)
- Pictures: 1,115 (22.3%)
- Campaigns: 2,473 (49.4%)

### companies (2,244 rows)
- Industry: 2,232 (99.5%)
- Country: 1,986 (88.5%)
- Funding data: 1,684 (75%) — enriched from 1,428 this session
- Website/domain: 1,834 (81.7%)

### deals (306 rows)
Pipelines: Haas F1, Alpine F1, Formula E, ONE Championship, Esports

### contact_activities (8,061 rows)
### kiko_alerts (7 active alerts)
### emails (70+ cached, live fetch from Gmail API)
### email_sync_state (1 row — sunny@vanhawke.com, incremental sync active)
### user_tokens (1 row — Google OAuth with refresh token, gmail.modify + calendar scopes)

---

## KIKO TOOLS (13 total)

1. search_contacts — fuzzy CRM contact search
2. search_companies — fuzzy CRM company search
3. search_deals — pipeline/stage filtering
4. get_entity_detail — full briefing on contact/company/deal
5. search_conversations — past Kiko chat search
6. navigate_page — control Vela interface
7. get_alerts — proactive intelligence alerts
8. search_emails — Gmail search via API (dynamic userEmail)
9. get_email_thread — full thread fetch
10. draft_email — create Gmail draft with auto-signature
11. get_email_analytics — communication frequency, recency, engagement patterns
12. get_calendar — upcoming calendar events (Google Calendar API)
13. create_calendar_event — create events with attendees, location, Google Meet

Plus native: web_search, memory


---

## GMAIL INTEGRATION (COMPLETE)

### Architecture
- **Auth**: Supabase Google OAuth with `gmail.modify` + `calendar` scopes, offline access, refresh tokens stored in `user_tokens`
- **Token management**: `api/google-token.js` auto-refreshes expired tokens (5-min buffer)
- **API proxy**: `api/email.js` handles all Gmail operations (sync, list-live, thread, send, reply, star, trash, labels, search)
- **Real-time**: 5-min server cron (`cron-email-sync.js`) + 60s frontend polling
- **RLS**: org-level on emails/email_sync_state, user-level on user_tokens

### Features Live
- Real-time Gmail inbox (live fetch, not stale cache)
- Folder navigation (Inbox, Starred, Sent, Drafts, Spam, Bin)
- Custom Gmail labels in sidebar
- Thread grouping in list view
- Full thread view with expand/collapse per message
- HTML email rendering in sandboxed iframe (preserves signatures, formatting)
- Rich text compose (Bold, Italic, Underline, Links, Lists toolbar)
- Reply, Reply All, Forward with quoted content
- File attachments in compose (multi-file, 10MB limit, base64 MIME encoding)
- Rich HTML paste support (copy/paste signatures from Gmail)
- HTML email signature editor in Settings (contentEditable + paste)
- Signature auto-appended on new/reply/forward compose
- Star/Trash actions synced to Gmail
- Gmail search with full query syntax
- Auto-sync on page mount + 60s polling
- Multi-user support (dynamic userEmail, no hardcoded values)
- Kiko: search emails, read threads, draft emails, email analytics

---

## VERCEL CRONS

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron-enrich` | `0 6 * * *` (daily 6am) | Enrichment + campaigns + activities + alerts |
| `/api/cron-email-sync` | `*/5 * * * *` (every 5 min) | Gmail sync for all connected users |


---

## WHAT'S BEEN BUILT — COMPLETE FEATURES (as of 15 March 2026)

Everything from previous session (see v3.3 brief) PLUS:

| Feature | Status |
|---|---|
| Home button resets Kiko conversation (kikoResetKey) | ✅ |
| KikoFloat sends pageEntity + search params for context awareness | ✅ |
| Contacts pagination — all 5,006 load | ✅ |
| Organisations pagination — all 2,244 load | ✅ |
| Chat rename (pencil icon in sidebar) | ✅ |
| Kiko Insights centred under prompt bar | ✅ |
| Gmail full restyle — Apple light theme | ✅ |
| Gmail thread view with expand/collapse | ✅ |
| Gmail rich text compose with formatting toolbar | ✅ |
| Gmail live API fetch (not stale Supabase cache) | ✅ |
| Gmail auto-sync on page mount | ✅ |
| Gmail folder navigation (Inbox, Starred, Sent, Drafts, Spam, Bin) | ✅ |
| Gmail custom labels in sidebar | ✅ |
| Gmail attachment support in compose | ✅ |
| Gmail HTML email signature editor in Settings | ✅ |
| Gmail signature auto-append in compose | ✅ |
| Gmail search with full query syntax | ✅ |
| Gmail 5-min cron sync (all connected users) | ✅ |
| Gmail 60s frontend auto-refresh | ✅ |
| Multi-user email (dynamic userEmail, RLS on user_tokens) | ✅ |
| Kiko search_emails tool | ✅ |
| Kiko get_email_thread tool | ✅ |
| Kiko draft_email tool (creates Gmail drafts with signature) | ✅ |
| Kiko get_email_analytics tool (frequency, recency, engagement) | ✅ |
| Kiko get_calendar tool (upcoming events from Google Calendar) | ✅ |
| Kiko create_calendar_event tool (create with attendees, location) | ✅ |
| Email attachment download (metadata extraction + download endpoint + UI) | ✅ |
| Enriched entity context (contact: email/campaigns/outreach, company: key contacts) | ✅ |
| File splits: email-helpers.js, kiko-calendar.js — all files under 400 lines | ✅ |
| Voice model upgrade (gpt-4o-realtime-preview → gpt-realtime) | ✅ |
| Funding enrichment: 1,428 → 1,684 companies (75%) | ✅ |

---

## REMAINING WORK / ROADMAP

### HIGH PRIORITY
1. **2,432 contacts missing email/LinkedIn** — Lemlist email finder API dead end. Options: CSV export → Lemlist campaign, Apollo.io/Hunter.io API, or Clay.
2. **Email signature testing** — Set up Sunny's actual HTML signature in Settings, verify it renders correctly in sent emails.
3. **Google Cloud Pub/Sub for push email sync** — Currently polling. Push would eliminate 5-min delay. Requires Google Cloud project config.

### MEDIUM PRIORITY
4. **Email templates** — Saved templates for common outreach patterns (sponsorship intro, follow-up, etc).
5. **Pipeline: "Meeting Arranged" column visibility** — currently hidden if no deals in that stage.
6. **Calendar page UI** — Calendar page exists but needs restyle to match email page (Apple light theme).

### LOWER PRIORITY / FUTURE
7. **MCP server migration** — kiko-tools.js structured for MCP. Would allow Kiko from Claude Desktop, mobile.
8. **Cloudflare migration** — planned post-stabilisation.
9. **Cancel Pipedrive** — once CRM confirmed fully working.
10. **SponsorSignal integration** — daily LinkedIn content, not yet connected.
11. **Kiko voice selection** — Voice audition panel built (artifact), user hasn't picked yet. Current: shimmer on gpt-realtime.

---

## HOW TO RESUME

1. Read this brief
2. `cd ~/Desktop/vela-platform && git log --oneline -15`
3. Check DB: `SELECT count(*) FROM contacts; SELECT count(*) FROM companies WHERE data->>'lastRound' IS NOT NULL;`
4. Open https://vela-platform-one.vercel.app and verify Email page + Kiko respond
5. Pick up from REMAINING WORK section above

---

*Generated 15 March 2026. Session covered: Home button fix, pagination, Gmail full integration (8 chunks), Kiko 13 tools (email search/thread/draft/analytics, calendar get/create), voice model upgrade, funding enrichment, chat rename, attachment downloads, entity context enrichment, file splits.*
