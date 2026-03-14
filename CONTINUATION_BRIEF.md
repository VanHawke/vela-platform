# VELA PLATFORM — CONTINUATION BRIEF
## Date: 14 March 2026 | Session handoff document

---

## WHAT IS VELA

Vela is a custom CRM and intelligence platform for Van Hawke Group, built with React/Vite frontend, Vercel Serverless API layer, and Supabase (Postgres + JSONB) backend. Kiko is the AI operating system layer powered by Claude Sonnet 4.6, with Mem0 for cross-session memory, web search for real-time intelligence, and proactive alerting.

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
- Container pushes via: `git push https://VanHawke:[PAT]@github.com/VanHawke/vela-platform.git main` (PAT in Claude memory)
- api.lemlist.com NOT accessible from container; use Chrome JS tool for Lemlist calls
- ALWAYS build test (`npm run build`) before committing
- ALWAYS syntax check API files (`node -c api/kiko.js`) before pushing
- Commit after every change, deploy after every meaningful change
- No single file over 400 lines

## ROLLBACK TAGS

- `v3.0-stable` — before enrichment session
- `v3.1-stable` — before org clickthrough fixes
- `v3.2-stable` — before Kiko OS phases
- `v3.3-kiko-os` — after all 8 Kiko OS phases complete


---

## CURRENT FILE ARCHITECTURE

```
api/
  kiko.js              (295 lines) — Kiko orchestrator: system prompt, Mem0, SSE streaming, tool routing
  kiko-tools.js        (188 lines) — Modular tool registry: CRM tools, nav, alerts (MCP-ready)
  kiko-tools.js.bak    — Original monolithic kiko.js backup (273 lines, pre-Phase 1)
  kiko-alerts.js       (124 lines) — Proactive intelligence: stale deals, bottlenecks, data quality
  news-signals.js      (56 lines)  — Web search powered org news (Claude Haiku + web_search)
  enrichment-agent.js  — Claude Haiku batch: titles, industry, country, domains, funding
  backfill-activities.js — Pull Lemlist activity history into contact_activities
  backfill-campaigns.js  — Pull Lemlist campaign assignments
  enrich-companies.js    — Original company enrichment
  lemlist-find-email.js  — Email finder (Lemlist API doesn't support REST email lookup — see notes)
  lemlist-enrich.js      — Lemlist enrichment + webhook registration
  lemlist-webhook.js     — Receives all Lemlist events, upserts contacts, logs to contact_activities
  cron-enrich.js         — Daily 6am cron: enrichment + campaigns + activities + alerts scan
  voice.js               — Whisper transcription + OpenAI Realtime API tokens
  news-signals.js        — Claude Haiku web search for org intelligence

src/
  App.jsx                — Routing
  pages/
    Pipeline.jsx         — Deal Pipeline kanban with org logos, slide-out panel, drag-and-drop
    Contacts.jsx         — Contact list with A-Z/Z-A sort, email/LinkedIn icons
    ContactDetail.jsx    — Contact detail with deal stage, campaigns, correspondence
    Organisations.jsx    — Org list with sort, slide-out panel with funding, news signals, deal stage
  components/
    kiko/
      KikoChat.jsx       — Home page chat (Kiko Insights widget, prompt chips)
      KikoOS.jsx         — Floating Kiko widget (3-stage: icon → prompt bar → conversation)
      KikoVoice.jsx      — Voice interface (Whisper + OpenAI Realtime)
      KikoSymbol.jsx     — Kiko logo component
    layout/
      Layout.jsx         — Top nav (Home resets Kiko conversation), Sidebar
      Sidebar.jsx        — 9 nav items
```


---

## DATABASE STATE (Supabase)

### contacts (5,006 rows)
JSONB fields: firstName, lastName, email, company, companyId, title, linkedin, picture, lastCampaign, lemlistCampaigns[], outreachStatus, lastActivity, source, status, owner, activities[], external_id
- Titles: 4,991 (99.7%)
- Emails: 2,574 (51.4%) — 2,432 are name-only records from Pipedrive with no email
- LinkedIn: 1,753 (35%)
- Pictures: 1,115 (22.3%)
- Campaigns: 2,473 (49.4%)

### companies (2,244 rows)
JSONB fields: name, industry, country, website, linkedin, lastRound, totalFunding, valuation, employees, revenueEst, founded, openDeals, wonDeals
- Industry: 2,232 (99.5%)
- Country: 1,986 (88.5%)
- Funding data: 1,321 (58.9%) — enrichment was running, may have progressed further
- Website/domain: 1,834 (81.7%)

### deals (306 rows)
JSONB: title, company, contactName, pipeline, stage, value, owner, lastActivity, status
Pipelines: Haas F1, Alpine F1, Formula E, ONE Championship, Esports

### contact_activities (8,061 rows)
Schema: id, contact_id, type, campaign_name, campaign_id, sequence_step, email_subject, details (jsonb), created_at

### kiko_alerts
Schema: id, type, severity, title, detail, entity_type, entity_id, entity_name, dismissed, created_at, expires_at
Currently has 7 active alerts (stale deals, bottleneck, data quality)

### kiko_memories
Schema: id, path, content, is_directory, org_id, updated_at
Used by Kiko's built-in memory tool (separate from Mem0)


---

## KIKO OS — 8 PHASES (ALL COMPLETE)

### Phase 1: CRM Tools ✅ (commit 8e1c3b9)
Replaced single generic `get_crm_data` with 4 specific tools:
- `search_contacts` — fuzzy name/company/title/email matching via Supabase `ilike`
- `search_companies` — fuzzy name/industry/country matching
- `search_deals` — pipeline/stage filtering with summary stats
- `get_entity_detail` — full briefing with funding, campaigns, activities, related records
VERIFIED: "Brief me on Decagon" returned full intelligence with CRM + web search + funding + recommendation

### Phase 2: Auto-Context Injection ✅ (commit aab8c47)
Frontend extracts pageEntity from URL (`/contacts/{id}`, `?org={id}`), sends to API.
Backend fetches entity data and injects as ACTIVE CONTEXT in system prompt.
VERIFIED: On contact c3416, "What should I do?" → identified Darren Jordan, 44d silence, recommendation

### Phase 3: Structured Response Formatting ✅ (commit 590d056)
Prompt engineering rules for company briefings, deal flags, staleness warnings.
Instructs Kiko to end with specific next actions, flag CRM vs web search discrepancies.

### Phase 4: Proactive Intelligence Engine ✅ (commit c368be2)
- `kiko_alerts` Supabase table
- `/api/kiko-alerts.js` — scans for stale deals (36 detected), pipeline bottlenecks, data quality
- `get_alerts` tool added to Kiko
- Daily cron at 6am runs scan alongside enrichment
VERIFIED: "What should I focus on?" → 3 prioritized alerts with severity + next steps

### Phase 5: Cross-Session Memory (Mem0) ✅ (commit 9e269ed)
- `mem0Search(query)` — searches Mem0 before each response, injects as CROSS-SESSION MEMORY
- `mem0Add(userMsg, assistantMsg)` — fire-and-forget stores conversation after response
- Uses env var MEM0_API_KEY (already in Vercel)
- Non-blocking — if Mem0 unavailable, Kiko works normally

### Phase 6: Modular Tool Registry ✅ (commit 12ccf9b)
- kiko.js: 515 → 295 lines
- kiko-tools.js: 188 lines — all tool definitions + handlers exported
- kiko.js imports: `{ TOOL_DEFINITIONS, executeTool, fetchEntityContext, sbFetch }`
- MCP-ready: each tool module can later become an MCP server
VERIFIED: "How many deals in Haas F1?" → 15 deals with stage breakdown via imported tools

### Phase 7: Voice Optimisation ✅ (commit c396532)
When currentPage === 'voice', injects VOICE MODE rules:
- Max 3-5 sentences, no markdown, natural spoken numbers, limit lists to top 3

### Phase 8: Dashboard Intelligence Widget ✅ (commit e55b58e)
- KikoChat.jsx fetches `/api/kiko-alerts` on mount
- Shows top 3 severity-coded alerts between prompt bar and suggestion chips
- Each alert is clickable → triggers Kiko conversation about that issue
VERIFIED: Home page shows 3 alerts (data quality, bottleneck, stale deal)


---

## POST-OS CHANGES (same session)

### Home button fix ✅ (commit 8a03c83)
Layout.jsx: clicking Home resets kikoMessages and kikoConvId, returns to welcome screen

### A-Z / Z-A Sort ✅ (commit c891806)
Both Contacts.jsx and Organisations.jsx have `sortDir` state with dropdown selector.
Uses `localeCompare` on firstName (contacts) and name (organisations).

### Kiko Context Inference ✅ (commit e31c709)
System prompt updated with CONTEXT INFERENCE rules:
1. Check ACTIVE CONTEXT first
2. Scan conversation history for most recently discussed entity
3. Fall back to currentPage value
4. NEVER say "I can't see your screen"

---

## WHAT'S BEEN BUILT — COMPLETE FEATURES

| Feature | Status |
|---|---|
| Deal Pipeline kanban with drag-and-drop, org logos, slide-out panel | ✅ |
| Organisations page with slide-out panel, funding, news signals, deal stage | ✅ |
| Contacts list with A-Z/Z-A sort, email/LinkedIn icons | ✅ |
| ContactDetail page with deal stage, campaigns, correspondence | ✅ |
| Org clickthrough from Pipeline → specific org (direct Supabase lookup) | ✅ |
| Lemlist webhook (live events) | ✅ Registered |
| 8,061 activity records backfilled | ✅ |
| 4,991 contact titles enriched (99.7%) | ✅ |
| 2,232 company industries enriched (99.5%) | ✅ |
| 1,321+ companies with funding data | ✅ |
| 400+ company domains inferred by Claude | ✅ |
| News Signals (web search powered, type-coded) | ✅ |
| Funding & Intelligence section on org panel | ✅ |
| Kiko Insights widget on home page | ✅ |
| Kiko 4 CRM tools with fuzzy search | ✅ |
| Kiko auto-context injection | ✅ |
| Kiko proactive alerts (stale deals, bottlenecks) | ✅ |
| Kiko cross-session memory (Mem0) | ✅ |
| Kiko modular tool registry (MCP-ready) | ✅ |
| Kiko voice optimisation | ✅ |
| Kiko conversation-history context inference | ✅ |
| Daily 6am cron (enrichment + alerts scan) | ✅ |
| Continuous enrichment cron configured | ✅ |


---

## REMAINING WORK / ROADMAP

### HIGH PRIORITY
1. **2,432 contacts missing email/LinkedIn** — Lemlist email finder API does NOT exist as REST endpoint. Options: (a) Export CSV → import into Lemlist campaign for auto-enrichment, (b) Apollo.io/Hunter.io API, (c) Clay. Recommend option (a) — free, uses existing credits.
2. **Funding enrichment completion** — 1,321 of 2,244 done (~59%). Enrichment was running in browser when session ended. Rerun: call `/api/enrichment-agent` with `action: 'enrich-funding'` in batches of 30-40.
3. **Verify Mem0 is actively storing/retrieving** — MEM0_API_KEY env var exists in Vercel. Test by having a conversation, then in a new session asking about something from the previous one.

### MEDIUM PRIORITY
4. **Kiko tool for drafting emails** — System prompt references "draft emails" but no email drafting tool exists yet. Would use Claude to generate email text based on contact/deal context.
5. **Kiko tool for creating/updating tasks** — Tasks page exists but no Supabase table or Kiko integration.
6. **Calendar integration** — Google Calendar MCP connected. Kiko doesn't yet use it for scheduling.
7. **Pipeline page: add "Meeting Arranged" column visibility** — currently hidden if no deals in that stage.

### LOWER PRIORITY / FUTURE
8. **MCP server migration** — kiko-tools.js is structured to become an MCP server. Would allow Kiko to be used from Claude Desktop, mobile, etc.
9. **Cloudflare migration** — planned post-stabilisation for better edge performance.
10. **Cancel Pipedrive** — once CRM confirmed fully working, Pipedrive subscription can be cancelled.
11. **Formula E / ONE Championship deal pipeline data** — exists but less populated than Haas F1.
12. **SponsorSignal integration** — daily LinkedIn content system, not yet connected to Vela.

---

## KNOWN ISSUES / TECHNICAL DEBT

1. **Lemlist email finder endpoint** — `/api/lemlist-find-email.js` was built but Lemlist's API returns HTML not JSON for email-finder. The endpoint exists but doesn't work. Need alternative approach.
2. **Duplicate BancFirst entries** — Organisations page shows BancFirst twice (likely duplicate company records in Supabase).
3. **Contacts page shows 1,000 not 5,006** — Supabase default limit. The query doesn't paginate beyond 1,000 server-side. Same issue exists on Organisations (shows 1,000 of 2,244).
4. **kiko.js.bak still in repo** — Can be removed once confident in modular architecture.
5. **Vercel on-demand charges** — $26.03 over $20 credit. Monitor usage.
6. **News signals sometimes include cite tags** — Strip logic exists but Claude occasionally uses different tag formats.

---

## VERCEL ENVIRONMENT VARIABLES

| Key | Purpose |
|---|---|
| ANTHROPIC_KEY | Claude API (Kiko + enrichment) |
| OPENAI_KEY | Voice (Whisper + Realtime API) |
| MEM0_API_KEY | Mem0 cross-session memory |
| LEMLIST_KEY | Lemlist API |
| PIPEDRIVE_API_KEY | Pipedrive (legacy) |
| GOOGLE_MAPS_API_KEY | Google Maps |
| VITE_SUPABASE_URL | Supabase URL |
| VITE_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role |

---

## API ENDPOINTS

| Endpoint | Method | Purpose |
|---|---|---|
| /api/kiko | POST | Kiko chat (SSE streaming) |
| /api/voice | POST | Voice: transcribe, preview-voice, realtime token |
| /api/kiko-alerts | POST | get, dismiss, scan alerts |
| /api/news-signals | POST | Web search org intelligence |
| /api/enrichment-agent | POST | enrich-contacts, enrich-companies, find-domains, enrich-funding |
| /api/backfill-activities | POST | Lemlist activity history backfill |
| /api/backfill-campaigns | POST | Lemlist campaign assignment backfill |
| /api/lemlist-webhook | POST | Lemlist webhook receiver |
| /api/lemlist-enrich | POST | Lemlist enrichment actions |
| /api/cron-enrich | GET/POST | Daily 6am enrichment + alerts cron |

---

## KIKO SYSTEM PROMPT STRUCTURE (in kiko.js)

1. IDENTITY — Kiko, never Claude, direct/precise
2. USER — Sunny Sidhu, CEO, Weybridge, board-level framing
3. RESPONSE RULES — 2-3 sentences default, expand when warranted
4. TOOLS — search_contacts, search_companies, search_deals, get_entity_detail, search_conversations, navigate_page, get_alerts, web_search, memory
5. TOOL USAGE RULES — person→search_contacts, company→search_companies, "brief me"→get_entity_detail
6. RESPONSE FORMATTING — company briefings, deal flags, staleness warnings, active context handling
7. NAVIGATION RULES — navigate_page for show/pull up/go to
8. CONTEXT INFERENCE — scan conversation history when "what am I looking at"
9. PAGE AWARENESS — per-page descriptions for all routes
10. VOICE MODE — injected when currentPage === 'voice'
11. ACTIVE CONTEXT — auto-injected entity data from pageEntity
12. CROSS-SESSION MEMORY — Mem0 search results injected before response

---

## HOW TO RESUME

1. Read this brief
2. `cd ~/Desktop/vela-platform && git log --oneline -15` to see recent commits
3. Check Supabase state: `SELECT count(*) FROM contacts; SELECT count(*) FROM companies WHERE data->>'lastRound' IS NOT NULL;`
4. Open https://vela-platform-one.vercel.app and verify Kiko responds
5. Pick up from REMAINING WORK section above

---

*Generated 14 March 2026. Session covered: Lemlist webhook, org panel, contact detail, pipeline panel, enrichment (titles/industry/country/domains/funding), activity backfill, news signals, 8-phase Kiko OS transformation, sort, context inference, home button fix.*
