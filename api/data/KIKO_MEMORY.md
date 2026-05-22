# KIKO MEMORY — Last updated: 2026-05-22T20:00:00Z (Session 68 — full audit)

## PLATFORM STATE
- 49 tools, 35 routes, 46 crons, 125 API files, 11 nav items
- Architecture: Hetzner (178.104.73.22) → Express API + frontend, Supabase DB, Claude Sonnet backbone
- Frontend: kiko.vanhawke.agency | API: api.vanhawke.agency
- Users: sunny@vanhawke.agency (super_admin), matt.smith@vanhawke.agency (user)

## SESSION 68 CHANGES (2026-05-22) — 28 commits

### Context Architecture (BIGGEST IMPACT)
- Bible moved from system prompt to JIT read_bible tool — 87% token reduction (30K→3,912 on outreach)
- Casual query optimization: weather, recommendations skip CRM/entity context
- Old 77KB self-knowledge fallback REMOVED

### Self-Modification (NEW CAPABILITY)
- kiko_self_modify tool: read_file, edit_file, list_files, run_command, deploy
- All edits logged to KIKO_SELF_EDIT_LOG.md
- JS files auto syntax-checked after edit, rolled back on error
- Deploy: git commit → pm2 restart → health check
- Kiko now proactively runs selfcheck on greeting and reports failures FIRST

### Google Integration (FULLY FIXED)
- Google OAuth: 3 bugs fixed (wrong prompt, route unmounted in Express, nginx not proxying callback)
- Nginx proxy added for /api/google-auth on kiko.vanhawke.agency
- google-auth route explicitly mounted in Express server.js
- OAuth prompt changed to 'consent' (forces full scope grant)
- Refresh token + Meet scope now working
- Scopes: Gmail (full), Calendar, meetings.space.readonly, OpenID, Profile

### Google Calendar
- Page at /calendar with FullCalendar (month/week/day/list views)
- Event creation form: title, date, time, location, attendees, description
- Google Meet auto-add: checkbox in create form, auto-generates meet.google.com links
- Event editing: PATCH /api/calendar-events
- Event deletion: DELETE /api/calendar-events with confirmation
- Stats: today count, week count, Meet count

### Google Meet Transcripts
- POST /api/meeting-transcripts fetches completed meetings from Meet REST API
- Pulls transcript entries (speaker, text, timestamps)
- Haiku extracts: summary, decisions, action items, open questions
- Stores in kiko_knowledge (domain: meeting-transcripts)
- Auto-creates tasks from action items (3-day due date)
- Cron: 7pm weekdays

### Navigation
- 3 separate nav lists synced: LegoraTopNav.jsx, Layout.jsx, Settings.jsx
- Knowledge Base removed from nav (internal tool, not user-facing)
- Sporting Events added to all 3 nav lists + Settings toggle
- Nav auto-discovery: new items auto-append for existing users
- 11 nav items: Today, Command Centre, Pipeline, Campaigns, Messenger, Calendar, Sporting Events, Contacts, Organisations, Partnership Matrix, Document Library

### Other Fixes
- PartnershipMatrix header: Source Serif 4, 28px/300
- MemoryConsole header: Source Serif 4, 36px/300 with SYSTEM/Memory eyebrow
- Document Library "Analyse with Kiko" button → opens KikoFloat with analysis prompt
- Voice: language='en' in Whisper transcription (fixes Korean hallucinations)
- Voice: navigate_page enum updated with all current pages
- PWA: manifest.json + service worker + registration (push notifications need VAPID keys)

## ACTIVE CAMPAIGNS
- Alpine F1 Legal AI: 110 enrolled, 56% open, 29% click, 0 real replies. Test campaign — CTA is the blocker.

## KEY PROSPECTS
- Helsing/Joe Paulo: 31 clicks, follow-up overdue
- Icertis: 3 contacts clicking — buying committee signal
- Litera: Jeff Macomber + Tyler Rhodes clicking

## OPERATIONAL HEALTH
- Active crons: 46 (including meeting-transcripts at 7pm weekdays)
- Self-modification capability: ACTIVE
- Proactive health monitoring: ACTIVE (runs on every greeting)
- Google OAuth: WORKING with refresh token + Meet scope
- LinkedIn cookies: ALIVE (selfcheck passing)

## REMAINING TO BUILD
- PWA push notifications (VAPID keys + endpoints)
- Sporting Events page redesign

## COMPLETED THIS SESSION (not remaining)
- Gmail .ics detection: handled by calendar webhook — Google auto-creates calendar events from .ics invites, webhook detects needsAction status, creates alerts
- Calendar webhooks: LIVE — Google pushes notifications on any calendar change, auto-renews weekly
- Calendar invite accept/decline: POST /api/calendar-events with {eventId, response: 'accepted'|'declined'|'tentative'}
- Calendar CRUD: Create (with Meet auto-add), Read, Update (PATCH), Delete — all working
