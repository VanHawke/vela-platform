# KIKO MEMORY — Last updated: 2026-05-22T19:00:00Z

## CURRENT STATE
- Alpine F1 Legal AI campaign: 110 enrolled, 0 real replies. Test campaign — learning from failure. CTA is the blocker.
- Haas F1 partnership: In advanced discussion (2026-2028). Needs proactive check-in.
- Canadian GP: Race weekend May 25. Montreal round next.
- Van Hawke Maison: Archive 01 eyewear in development with Giacomo and Temi.

## SESSION 68 CHANGES (2026-05-22)
### Context Architecture (BIGGEST IMPACT)
- Bible moved from system prompt to JIT read_bible tool. Saves 26KB per query (87% token reduction)
- Casual query optimization: weather, recommendations skip CRM/entity context entirely
- Old 77KB self-knowledge fallback REMOVED. Lean-only now.

### New Pages & Features
- Google Calendar page: /calendar with FullCalendar (month/week/day/list), event creation form (title, date, time, location, attendees, description)
- Sporting Events page: /sporting-events — F1/FE/MotoGP/WEC race calendar with peak outreach windows
- Document Library "Analyse with Kiko" button: click doc → KikoFloat opens with analysis prompt
- Google Meet transcript integration: POST /api/meeting-transcripts fetches completed meetings, pulls transcripts, Haiku extracts summary/decisions/action items, stores in kiko_knowledge, auto-creates tasks. Cron runs 7pm weekdays.

### Navigation Fixes
- LegoraTopNav.jsx ALL_PAGES synced with Layout.jsx ALL_NAV (was out of sync — root cause of missing nav items)
- Nav now includes: sporting-events, knowledge, documents (previously missing)
- Supabase nav_settings updated for super_admin user

### Style Fixes
- PartnershipMatrix: h1 → Source Serif 4, 28px/300
- MemoryConsole: h1 → Source Serif 4, 36px/300 with SYSTEM/Memory eyebrow

### Voice Fixes
- Added language: 'en' to Whisper transcription config (fixes Korean hallucinations)
- Updated voice TOOLS navigate_page enum with all current pages

### Google Auth
- OAuth prompt changed from 'select_account' to 'consent' (forces full consent screen for new scopes)
- meetings.space.readonly scope added for Google Meet API access
- STILL NEEDS: User must disconnect + reconnect Google to get new Meet scope

### PWA Foundation
- manifest.json created (app name, icons, theme)
- Service worker (sw.js) created for push notifications
- SW registration replaces old SW-killer in index.html
- web-push npm package installed in kiko-worker
- STILL NEEDS: VAPID key generation, push subscribe/send endpoints, frontend notification UI

## KEY PROSPECTS
- Helsing/Joe Paulo: 31 clicks, OOO ended May 11. Follow-up overdue.
- Icertis: 3 contacts clicking — buying committee signal.
- Litera: Jeff Macomber + Tyler Rhodes clicking — internal discussion.

## LEARNED PATTERNS
- Volume alone doesn't drive results — 207 emails, 0 replies
- 56% open rate confirms sender reputation is strong
- 29% click rate with 0 replies = CTA kills conversion
- Context engineering is #1 discipline of 2026 — 65% of AI failures = context drift

## OPERATIONAL HEALTH
- Active crons: 27 (added meeting-transcripts at 7pm weekdays)
