# KIKO PLATFORM REDESIGN — BUILD SPEC v1.0
## Single Source of Truth for the UI Rebuild
### Authored: June 7, 2026 | Claude + Kiko + Sunny

---

## 0. PREAMBLE — READ THIS FIRST

This document is the complete specification for rebuilding the Kiko platform UI. Every future session MUST read this before writing code. The redesign is NOT a cosmetic reskin — it is a structural simplification that preserves every feature while reducing cognitive load.

**Golden rule:** A tab earns its place only if it's something you must SEE and DECIDE on with your own eyes. Everything else, Kiko operates through chat.

**Build location:** `redesign` branch on `/Users/sunny/Desktop/vela-platform/`
**Production:** Untouched until Sunny explicitly approves switchover.
**Methodology:** Migrate existing components into new layout shell. Do NOT rewrite from scratch. Surgical restructuring, not demolition.

---

## 1. NAVIGATION — FINAL AGREED STRUCTURE

```
Kiko        Today    Pipeline    Records    Messenger    Campaigns    Partnership Matrix        🔍  [SS]
(logo)                                                                                       search  avatar
```

### Layout
- **Pattern:** CSS Grid 3-column (`1fr auto 1fr`) matching existing LegoraTopNav
- **Brand (left):** "Kiko" in Source Serif 4, 24px, weight 400, letter-spacing -0.02em
- **Tabs (centre):** 6 items, icon + label pills, 30px gap
- **Right cluster:** Search icon + avatar (Settings dropdown from avatar click)
- **Height:** 56-60px
- **Background:** #FFFFFF
- **Active state:** pill background rgba(0,0,0,0.06) — NOT underline
- **Messenger badge:** Orange (#E8700A) unread dot

### What was removed from nav (12 → 6)
| Removed Tab | New Location | Decision Date |
|---|---|---|
| Command Centre | Absorbed into Today (priority actions) | Jun 7 2026 |
| Calendar | Home strip + Kiko queries | Jun 7 2026 |
| Sporting Events | Home banner + Kiko queries | Jun 7 2026 |
| Contacts | Merged into Records (People tab) | Jun 7 2026 |
| Organisations | Merged into Records (Companies tab) | Jun 7 2026 |
| Document Library | Kiko retrieval ("find the Helsing deck") | Jun 7 2026 |

### What was removed from UI entirely
| Element | Rationale | Decision Date |
|---|---|---|
| Background tasks indicator | If it's background, it stays background. Kiko notifies on completion. | Jun 7 2026 |
| Kiko Float on Today page | Redundant — prompt bar IS Kiko on this page | Jun 7 2026 |
| Settings gear icon | Lives in avatar dropdown | Jun 7 2026 |

---

## 2. DESIGN SYSTEM — NON-NEGOTIABLE TOKENS

All values from `/src/lib/theme.js` and `/src/styles/kiko-polish.css`. No deviations.

### Typography
- **Logo "Kiko":** Source Serif 4, 24px, weight 400, letter-spacing -0.02em
- **Page titles:** Source Serif 4, 36px, weight 300, letter-spacing -0.018em
- **Section headers:** Source Serif 4, 18px, weight 300
- **Stat values:** Source Serif 4, 22px, weight 300
- **Body text:** Inter, weight 450
- **Nav links:** Inter, 13px, weight 450 (active: 500)
- **Eyebrow labels:** Inter, 11px, uppercase, weight 500, letter-spacing 0.10em
- **Table headers:** Inter, 11px, uppercase, weight 500, letter-spacing 0.06em

### Colours
- Background: #FEFEFC (warm white)
- Card: #FFFFFF
- Border: rgba(0,0,0,0.08)
- Border hover: rgba(0,0,0,0.14)
- Text primary: #0A0A0A
- Text secondary: #6B6B6B
- Text tertiary: #A0A0A0
- Accent: #0A0A0A (pure black)
- Success/Sage: #7d8a64
- Warning/Amber: #B89C5C
- Danger/Terra: #B8643E
- Info/Slate: #5A6470
- Unread badge: #E8700A (orange)
- Online presence: #16A34A (green)

### Layout
- Card radius: 14px
- Standard radius: 8px
- Pill radius: 24px
- Card shadow: 0 1px 2px rgba(0,0,0,0.04)
- Hover shadow: 0 4px 16px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)
- Float shadow: 0 20px 60px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)

### Page Header Pattern (PageHead component)
- Eyebrow: uppercase category label (e.g. "REVENUE", "CRM", "OUTREACH")
- Title: Source Serif 4, 36px, weight 300
- Stats: Source Serif 4, 22px, weight 300 alongside uppercase label
- Toolbar: right-aligned action buttons
- Padding: 24px 44px 18px

---

## 3. PAGE-BY-PAGE SPECIFICATION

### 3.1 TODAY / HOME (`/`)

**Purpose:** The landing experience. Kiko IS this page. Decide your day in 30 seconds.

**Layout:**
- Content vertically centred on initial load (Google-style), transitions to top-aligned on scroll
- Max-width: 780px, centred

**Components (top to bottom):**
1. **Greeting:** Source Serif 4, 36px, weight 300. "Good morning, Sunny."
2. **Date:** Inter, 13px, secondary colour. "Sunday, 7 June 2026"
3. **Prompt bar:** Centre stage, max-width 560px
   - Pill-shaped input, 14px placeholder
   - Right side: + button (attachments), mic button (voice/WebRTC), send arrow
   - Below: 4-5 dynamic suggestion chips
4. **Priority Actions:** Section header "Priority Actions" in Source Serif 4 weight 300
   - 3-5 cards max (provenance-filtered — only items where WE initiated contact)
   - Auto-clearing: items disappear once actioned (reactive to CRM data)
   - Each card: priority dot (terra/amber/slate) + title + detail + time
   - Click → Kiko briefs on that item
5. **Calendar strip:** Compact horizontal scroll of today's events (from Google Calendar via `read_calendar`)
6. **Next Race banner:** Card with flag icon, race name, date, circuit, days countdown

**Data sources (from Kiko):**
- `kiko_alerts` (provenance-verified only, dismiss stale)
- `tasks` table (JSONB `data` field, filtered by due date)
- `kiko_draft_actions` (status=pending, auto-expire >7 days)
- Google Calendar via `read_calendar`
- `sporting_events` for next race

**What was absorbed from Command Centre:**
- Hot replies → priority actions
- Draft actions → Kiko chat ("you have 3 drafts pending, want to review?")
- Follow-up tracking → priority actions
- Scheduled sends → Kiko chat
- Campaign health → Campaigns page

**Kiko Float:** HIDDEN on this page (prompt bar is Kiko)

---

### 3.2 PIPELINE (`/pipeline`)

**Purpose:** Visual deal decision surface. See stages, move deals, assess forecast.

**Layout:** Full-width kanban

**Components:**
1. **PageHead:** Eyebrow "REVENUE", title "Pipeline"
   - Stats: Total value, Weighted value, Deal count (Source Serif 4 weight 300)
   - Toolbar: Pipeline manager dropdown + "+ New deal" button
2. **Pipeline Manager:** Dropdown to switch between pipelines (Haas F1 2026, Formula E, etc.)
   - Manage visibility/ordering
   - Add new pipeline
3. **Kanban columns:** Real stages from schema:
   - To Revisit → Contact Made → In Dialogue → Qualified → Meeting Arranged → Won → Lost
4. **Deal cards:**
   - Company name (13px, weight 500)
   - Contact name (12px, secondary)
   - Value in Source Serif 4
   - Sector badge
   - Probability %
   - Days since activity
   - **NEW: Partnership conflict indicator** (from f1_partnerships table) — if the company sponsors a competing team/category, show a warning badge
5. **Deal detail:** Side panel (not full page) with:
   - Stage progress bar
   - All deal fields from JSONB `data`
   - Communication history
   - Associated contacts
   - Kiko's cognitive analysis
   - Partnership conflict status

**Data sources:**
- `deals` table (JSONB `data` field)
- `f1_partnerships` for conflict badges
- `pipeline_analytics` for forecast
- `deal_prediction` for probability

**Data cleanup required (pre-build):**
- Archive 38 dead Pipedrive imports to separate "Archive" view
- Only show live deals in main kanban

**Kiko Float:** Visible (bottom-right)

---

### 3.3 RECORDS (`/records`)

**Purpose:** Unified people + companies database. Browse, search, drill into profiles.

**Layout:** Full table with segmented toggle

**Components:**
1. **PageHead:** Eyebrow "CRM", title "Contacts" or "Organisations" (reactive to toggle)
   - Stats: record count
   - Toolbar: People/Companies segmented control + "+ Add" button + dedup tool
2. **Search:** Built into header area
3. **People table:**
   - Avatar (initials, hue-rotated) + Name (weight 500)
   - Company, Title, Status badge, Last Contacted
   - Hover: preview popup (existing pattern from Contacts.jsx)
   - Sort: recent | name_asc | name_desc | company_asc
   - Pagination: 50 per page
4. **Companies table:**
   - Company name (weight 500)
   - Industry, Size, Location, Deal count, Contact count
5. **Contact Detail (drill-in, full route `/records/contact/:id`):**
   - **Header:** Name, title, company, avatar, status badge
   - **Partnership conflict status** (auto-fired from f1_partnerships) — shown inline in header
   - **Kiko's Cognitive Analysis:** Psychology profile + recommended approach + what to say next (from `get_cognitive_analysis`)
   - **Communication timeline:** All emails (from `read_email`), LinkedIn messages, with direction indicators (inbound/outbound)
   - **Relationship graph:** From `query_relationships`
   - **Cross-session intelligence:** From `ask_memory_engine`
   - **Deal associations**
   - **Campaign enrollment status**
   - **Enrichment gaps:** Flag missing email/LinkedIn, offer one-click enrichment
   - **Notes/tags**
   - **Draft email workflow:** If Kiko has a pending draft for this contact, show EmailDraft component (approve/edit/reject)
6. **Organisation Detail (drill-in, full route `/records/company/:id`):**
   - **Header:** Company name, industry, location
   - **Partnership conflict status** — MUST show inline in header automatically. "Celsius: F1 seat taken at McLaren" or "Category open at Haas"
   - **Company intel:** From `enrich_company` and `deep_research`
   - **Warm path:** From `crm_search.warm_path`
   - **Contacts at this company:** Clickable list
   - **Deal associations**
   - **Funding/financial data** (if available from enrichment)
   - **ROI analysis:** From `ask_pricing_agent`

**Data sources:**
- `contacts` table (JSONB `data`, 4,193 records)
- `companies` table (JSONB `data`, 2,249 records)
- `f1_partnerships` for conflict checks
- `kiko_relationships` for warmth scores
- Google accounts via `read_email` for thread history

**Data cleanup required:**
- Quarantine 455 contacts with no email AND no LinkedIn
- Batch-enrich company LinkedIn URLs (currently 0)

**Kiko Float:** Visible

---

### 3.4 MESSENGER (`/messenger`)

**Purpose:** Internal team communication (Microsoft Teams-level). NOT email inbox.

**Layout:** Sidebar + chat area (matching existing Messages.jsx architecture)

**Components:**
1. **Sidebar:**
   - Search input (search conversations)
   - **Chats / Calls tabs** (segmented)
   - **Direct Messages section:** Avatar + name + presence dot (online/away/busy/offline) + last message preview + time + unread count
   - **Channels section:** # prefix + channel name + last message + time + unread count
   - **Presence footer:** Current user status (online indicator)
   - Team members: Sunny Sidhu, Matt Smith, Kiko
2. **Chat header:**
   - For DMs: Avatar + name + presence status
   - For channels: # + name + member count
   - Actions: Call button, Search, Files panel
3. **Message thread:**
   - Avatars + names + timestamps
   - **Reactions on hover:** Emoji toolbar (👍❤️😂🔥👀🎉 + more)
   - **Reply-to threading**
   - **File attachments** with preview cards (images inline, files as download cards)
   - **Link previews** (auto-unfurl)
   - **Edit/delete** on own messages
   - **Pin messages**
   - **@mention** with autocomplete popup
   - **NEW: Provenance badge** — "outbound first" vs "cold inbound" on message threads
   - **NEW: LinkedIn health indicator** — session status for LinkedIn monitoring
4. **Compose area:**
   - Input with placeholder "Message #channel-name…" or "Message Person…"
   - + button (file attach, drag-and-drop, 50MB limit, 10 files)
   - Emoji picker
   - @mention trigger
   - Send button
   - Shift+Enter for new line
5. **Call history tab:**
   - Incoming/outgoing with duration or "Missed"
   - Click to call back
6. **Contact card popup:** Click on avatar → profile card with role, status, Message/Call buttons

**Data sources:**
- Supabase realtime channels for messages
- `team-chat` storage bucket for files
- Presence via Supabase broadcast
- Gmail via `read_email` for email thread context
- LinkedIn via Playwright sessions

**Kiko Float:** Visible

---

### 3.5 CAMPAIGNS (`/campaigns`)

**Purpose:** Outreach sequence management. Build, monitor, optimise campaigns.

**Layout:** Card list (main view) + Builder wizard (creation flow) + Detail drilldown

**Components:**
1. **PageHead:** Eyebrow "OUTREACH", title "Campaigns"
   - Stats: sequence count, total enrolled
   - Toolbar: "+ New Campaign" button → opens Builder
2. **Campaign cards:** One per sequence
   - Name (14px, weight 500) + status badge (active/paused/draft/completed)
   - Metrics row: Enrolled, Sent, Open %, Reply %, Bounced (Source Serif 4 weight 300 for values)
   - Click → Campaign Detail drilldown
3. **Campaign Detail (drilldown):**
   - PageHead with campaign name, stats
   - Metric tiles: Enrolled, Sent, Opened, Replied, Bounced
   - **Sequence steps:** Numbered list showing step type (Email/LinkedIn), subject, delay, per-step sent/opened/replied
   - **Prospects table:** Name, Company, Title, Status (active/replied/bounced/completed/paused/needs_email/stale), Step #, Opened ✓, Replied ✓, Last Activity
   - Per-prospect actions: Pause, Skip, Remove
   - Campaign actions: Pause/Resume, Edit Steps (BulkEditStepsModal)
4. **Campaign Builder (4-step wizard):**
   - **Step 1 — Name & Target:**
     - Campaign name input
     - Target audience textarea (describe ideal prospects)
     - Segment selector (pre-built audience segments)
   - **Step 2 — Sequence:**
     - Add/remove steps
     - Per step: type toggle (Email/LinkedIn), delay input, subject line, body textarea
     - Reorder via drag
   - **Step 3 — Timing:**
     - Send window (start/end time pickers)
     - Timezone selector
     - Daily send limit (default 30, Matt's Gmail cap)
   - **Step 4 — Review:**
     - Campaign summary card
     - Step-by-step preview
     - "Launch Campaign" button
   - Progress bar across top (4 segments)
   - Back/Continue navigation

**Data sources:**
- `kiko_sequences` for campaign definitions
- `kiko_sequence_enrollments` for prospect status
- `kiko_outreach_queue` for send queue
- `kiko_scheduled_emails` for timing

**Data cleanup required:**
- Label Alpine campaign as test artefact
- Exclude test campaign metrics from strategy views

**Kiko Float:** Visible

---

### 3.6 PARTNERSHIP MATRIX (`/partnership-matrix`)

**Purpose:** Strategic F1 sponsorship landscape. THE ground truth for category availability.

**Layout:** Full-width grid (teams × categories)

**Components:**
1. **PageHead:** Eyebrow "STRATEGY", title "Partnership Matrix"
   - Stats: total partnerships, teams covered
   - Toolbar: Refresh button + freshness timestamp ("Last updated: 2 hours ago")
2. **Grid:**
   - Rows: F1 teams (11 teams)
   - Columns: Sponsor categories (Title, Principal, Technical, Official, etc.)
   - Cells: Sponsor name + logo (if available) or "OPEN" indicator
   - Colour coding: filled (occupied) vs open (opportunity)
   - Click cell → detail showing deal value range, contract duration, activation rights
3. **Filters:** Filter by team, by category, by status (open only)
4. **Conflict check integration:** This data feeds into:
   - Pipeline deal cards (conflict badge)
   - Contact Detail headers
   - Organisation Detail headers
   - Campaign targeting (warn before enrolling conflicted companies)

**Data sources:**
- `f1_partnerships` table (400+ active partnerships, 11 teams)
- `pipeline_analytics.partnership_matrix`
- `ask_category_agent` for conflict/check

**CRITICAL PRINCIPLE (from Kiko):**
"This shouldn't be a page you visit — it should be a law that runs everywhere."
The matrix page is the viewing surface, but conflict-check logic MUST fire automatically on:
- Every organisation detail page load
- Every deal card render in pipeline
- Every campaign prospect enrollment

**Kiko Float:** Visible

---

## 4. PERSISTENT ELEMENTS

### 4.1 Kiko Float (all pages except Today)
- **Position:** Fixed, bottom-right, 48×48px circle
- **Icon:** Chat bubble SVG
- **Background:** #0A0A0A
- **Shadow:** Float shadow token
- **Click → expands to:** Chat panel (380×500px)
- **Chat panel features:**
  - "Kiko" header in Source Serif 4 weight 400
  - Message thread (kiko messages left-aligned, user right-aligned)
  - Input with send button
  - Concurrent background streaming (existing chatSessionsRef pattern)
  - Reasoning collapse with step count
  - Code block syntax highlighting + copy
  - Message actions (copy/retry/edit/thumbs up/down)
  - EmailDraft component rendering (approve/edit/reject)
  - KikoInsights badge

### 4.2 Chat Sidebar (all pages)
- **Toggle:** Left-edge chevron (half-height pill, right-facing arrow)
- **Width:** 250-260px
- **Content:**
  - Collapse chevron (left arrow)
  - Search input + New chat button
  - Time-grouped chat history (Today, Yesterday, Previous 7 Days, Older)
  - Per-chat: title, rename/delete on hover
  - Footer: keyboard shortcuts (⌘K toggle, ⌘N new)
- **Keyboard shortcuts:** ⌘K toggle sidebar, ⌘N new chat

### 4.3 Settings (avatar dropdown)
- **Trigger:** Click avatar in top-right
- **Panel:** Slide-over from right, 380px wide
- **Sections:**
  - Profile: name, email, role, timezone
  - Integrations: Google Workspace, LinkedIn, Supabase, Gmail cap
  - Communication: style, signature, currency, max email length
  - Team: members + roles
  - Page permissions: super_admin vs standard (Matt)

---

## 5. DATA CLEANUP — PRE-BUILD TASKS

These must be completed BEFORE the UI migration to avoid building beautiful surfaces on dirty data.

| Task | Owner | Table | Action |
|---|---|---|---|
| Archive dead Pipedrive deals | Kiko | `deals` | Move 38 Closed Lost (Pipedrive import) to archive flag |
| Label test campaigns | Kiko | `kiko_sequences` | Flag Alpine as test, exclude from metric aggregation |
| Quarantine empty contacts | Kiko | `contacts` | Flag 455 contacts with no email AND no LinkedIn |
| Batch-enrich company LinkedIn | Kiko | `companies` | Add LinkedIn URLs to 2,249 companies (currently 0) |
| Auto-expire stale drafts | Kiko | `kiko_draft_actions` | Expire pending drafts >7 days old |
| Dismiss stale alerts | Kiko | `kiko_alerts` | Dismiss alerts >14 days, keep only provenance-verified |

---

## 6. BUILD ORDER

| Phase | Page | Status | Commits |
|---|---|---|---|
| 0 | Nav shell + Records merge | ✅ COMPLETE | 5a154b6, dcb907d |
| 1 | Today/Home dashboard | ✅ COMPLETE | 0f2d918, bae4b42, 3d455d7 |
| 2 | Pipeline conflict badges | ✅ COMPLETE | cc6571d |
| 3 | Records conflict badges | ✅ COMPLETE | 1a727ad |
| 4 | Partnership Matrix freshness | ✅ COMPLETE | b894f81 |
| 5 | Nav active state fixes | ✅ COMPLETE | a98b857 |
| 6 | Priority dedup | ✅ COMPLETE | 39acb4a |
| — | Campaigns | Existing component, no changes needed | — |
| — | Messenger | Existing component, no changes needed | — |
| — | Data cleanup (Pipedrive archive, Alpine test label) | PENDING — Kiko task | — |
| — | Messenger provenance badges | PENDING — future session | — |
| — | LinkedIn health indicator | PENDING — future session | — |

---

## 7. KIKO'S ARCHITECTURAL NOTES

### Data Model
- All CRM entity data uses **JSONB `data` field**, not flat columns
- Contacts, companies, deals, tasks all follow this pattern
- Everything is `org_id`-scoped with RLS (row-level security)
- Org ID: `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`

### Key Table → Tool Mappings
| Table | Tool | Notes |
|---|---|---|
| `contacts` | `crm_search` (entity_detail) | 4,193 records, JSONB `data` |
| `companies` | `crm_search` (company_intel) | 2,249 records, JSONB `data` |
| `deals` | `crm_search` (search_deals) | ~50 records, JSONB `data` |
| `f1_partnerships` | `pipeline_analytics` (partnership_matrix) | 400+ partnerships |
| `kiko_sequences` | `campaign_engine` | Sequence definitions |
| `kiko_sequence_enrollments` | `campaign_engine` | Per-prospect status |
| `kiko_alerts` | direct query | Provenance field critical |
| `kiko_draft_actions` | direct query | payload JSONB has draft content |
| `kiko_relationships` | `query_relationships` | 79 contacts with warmth scores |
| `tasks` | direct query | JSONB `data`, filtered by due date |

### Field Name Traps (from Kiko)
- Hot replies variable is `hotReplies`, not `alerts`
- Scheduled emails field is `scheduled_for`, not `scheduled_at`
- Campaign steps 2/4/6/8/9/10/11 are empty (never built)
- `kiko_draft_actions` content is in `payload->>draft`, entity in `payload->>entity`

### API Endpoints
- Kiko API: `https://api.vanhawke.agency/api/kiko`
- Team messages: `https://api.vanhawke.agency/api/team-messages`
- Contact dedup: `https://api.vanhawke.agency/api/contact-dedup`
- Calendar: via Google Calendar API through `read_calendar` tool

---

## 8. UX PRINCIPLES FOR THE REBUILD

1. **Honest data over abundant data.** Archive corpses. Label tests. Quarantine empties. Every number on screen must be trustworthy.

2. **Partnership matrix is a law, not a page.** Conflict checks fire automatically on org, deal, and campaign surfaces. The tab is for strategic scanning; the logic is everywhere.

3. **Progressive disclosure.** Show 3-5 priority items on Home, not 47 alerts. Full depth available on click or through Kiko chat.

4. **Kiko-first for retrieval, tabs for decision.** If the answer is a lookup ("when's the Canadian GP?"), Kiko handles it. If the answer requires visual scanning and comparison (pipeline, matrix, campaigns), it gets a tab.

5. **Content centred, not cramped.** Today page content vertically centred on load. All pages use 44px side padding. Max-width containers for readability.

6. **Auto-clearing over manual dismissal.** Priority actions clear when actioned. Drafts expire after 7 days. Alerts dismiss when stale. The UI self-maintains.

7. **Provenance verification.** Every "signal" must pass Rule 8 — did we contact them first? Newsletters and cold inbound are not hot replies.

---

## 9. OPEN ITEMS

| Item | Status | Decision Needed From |
|---|---|---|
| Document Library as reference upload vs generated output | Leaning: kill, Kiko retrieves | Sunny to confirm |
| Email integration in Messenger vs separate Gmail | Currently Teams-only, email through Kiko | Architecture decision |
| Matt's access to Partnership Matrix | Currently super_admin only for CC | Permissions review |
| Voice model fallback (Deepgram+Claude+Cartesia) | Backup for gpt-realtime-2 | Technical decision |

---

## 10. FILE REFERENCES

| What | Path |
|---|---|
| This spec | `/Users/sunny/Desktop/vela-platform/REDESIGN_BUILD_SPEC.md` |
| Theme tokens | `/Users/sunny/Desktop/vela-platform/src/lib/theme.js` |
| Current nav | `/Users/sunny/Desktop/vela-platform/src/components/layout/LegoraTopNav.jsx` |
| Current layout | `/Users/sunny/Desktop/vela-platform/src/components/layout/Layout.jsx` |
| Page header | `/Users/sunny/Desktop/vela-platform/src/components/layout/PageHeader.jsx` |
| Pipeline | `/Users/sunny/Desktop/vela-platform/src/pages/Pipeline.jsx` |
| Contacts | `/Users/sunny/Desktop/vela-platform/src/pages/Contacts.jsx` |
| Messages | `/Users/sunny/Desktop/vela-platform/src/pages/Messages.jsx` |
| Campaigns | `/Users/sunny/Desktop/vela-platform/src/pages/Campaigns.jsx` |
| Command Centre | `/Users/sunny/Desktop/vela-platform/src/pages/OutreachIntelligence.jsx` |
| KikoChat | `/Users/sunny/Desktop/vela-platform/src/components/kiko/KikoChat.jsx` |
| KikoFloat | `/Users/sunny/Desktop/vela-platform/src/components/kiko/KikoFloat.jsx` |
| EmailDraft | `/Users/sunny/Desktop/vela-platform/src/components/kiko/EmailDraft.jsx` |
| KikoInsights | `/Users/sunny/Desktop/vela-platform/src/components/kiko/KikoInsights.jsx` |
| HomeDashboard | `/Users/sunny/Desktop/vela-platform/src/components/kiko/HomeDashboard.jsx` |
| ChatHistory | `/Users/sunny/Desktop/vela-platform/src/components/kiko/ChatHistory.jsx` |
| Kiko brain | `/home/kiko/kiko-worker/api/kiko.js` (on Hetzner) |
| Supabase project | `dwiywqeleyckzcxbwrlb` |
| Hetzner server | `178.104.73.22` |
| Frontend deploy | `scp -r dist/* root@178.104.73.22:/var/www/kiko/` |
| API deploy | `scp + pm2 restart kiko-worker` |

---

*Spec authored by Claude (Session 70) in collaboration with Kiko and Sunny. June 7, 2026.*
*This document supersedes KIKO_PLATFORM_UI_REDESIGN_BRIEF.md (Session 69).*
