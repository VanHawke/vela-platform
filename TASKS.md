# Vela Platform v2.0 — Task Tracker
_Owned by Claude Code. Updated every session._

---

## Phase 4 — Google OAuth + Token Infrastructure
- [x] Create api/google-auth.js (consent redirect + callback token exchange)
- [x] Create api/google-token.js (shared token helper with auto-refresh)
- [x] Vercel rewrite for /api/google-auth/callback
- [ ] Sunny: Create user_tokens table in Supabase (SQL provided in brief)
- [ ] Sunny: Configure Google Cloud Console (OAuth credentials, redirect URI)
- [ ] Sunny: Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to Vercel env vars
- [ ] Test: OAuth flow end-to-end (consent → callback → tokens in DB)

## Phase 5 — Email Client
- [x] Create api/email.js (list, get, sync, send, reply, star, read, trash, search, labels)
- [x] Create src/pages/Email.jsx (three-pane: folders, email list, viewer/compose)
- [x] Gmail message parsing (headers, base64url body decode, attachments)
- [x] MIME message builder for send/reply
- [x] DOMPurify sanitized iframe for HTML email rendering
- [x] Kiko email analysis card (category, summary, suggested action)
- [x] Route /email added to App.jsx
- [ ] Sunny: Create emails + email_sync_state tables in Supabase (SQL in brief)
- [ ] Supabase Edge Function for background email sync (every 5 min)
- [ ] Kiko email context injection in system prompt
- [ ] Test: Sync from Gmail, read, compose, send, reply

## Phase 6 — Calendar Client
- [x] Create api/calendar.js (list, create, update, delete, sync)
- [x] Create src/pages/Calendar.jsx (FullCalendar — month/week/day/list views)
- [x] Google Calendar API integration (create with Meet links, attendees)
- [x] Event detail panel + create modal
- [x] Dark theme FullCalendar CSS
- [x] Route /calendar added to App.jsx
- [ ] Sunny: Create calendar_events table in Supabase (SQL in brief)
- [ ] Supabase Edge Function for background calendar sync (every 15 min)
- [ ] Kiko calendar context injection in system prompt
- [ ] Test: Sync from Google Calendar, create event with Meet link

## Phase 7A — Settings Persistence
- [x] Create api/settings.js (GET/PATCH user settings)
- [x] Update Settings.jsx — 6 tabs: Profile, Kiko, Appearance, Images, Accounts, About
- [x] Connected Accounts tab: Google status, connect/disconnect
- [x] Voice selection (shimmer, alloy, echo, fable, onyx, nova)
- [x] Timezone selector
- [x] Settings persistence via user_email (not user_id)
- [ ] Sunny: Create user_settings table with user_email PK in Supabase (SQL in brief)
- [ ] Test: Settings save and persist across sessions

## Phase 7B — Documents Fix
- [ ] Diagnose 400 error on document upload (check Vercel logs)
- [ ] Fix user_email field not being sent
- [ ] Verify pdf-parse import path
- [ ] Verify match_document_chunks RPC exists
- [ ] Document intelligence: AI summary, classification, key entities
- [ ] Documents UI: AI analysis card after upload

## Phase 7C — Vela Code
- [x] Create api/vela-code.js (file tree, file content, AI chat, save to GitHub)
- [x] Create src/pages/VelaCode.jsx (file tree + Monaco editor + Kiko code chat)
- [x] Route /velacode added to App.jsx
- [x] Streaming AI code responses via Anthropic SDK
- [x] Save & Deploy: GitHub update + Vercel deploy hook
- [ ] Sunny: Add VERCEL_DEPLOY_HOOK to Vercel env vars
- [ ] Test: Browse repo, edit file, AI suggestion, deploy

## Kiko Tool Upgrades
- [x] Implement send_email tool (calls /api/email)
- [x] Implement get_calendar tool (calls /api/calendar)
- [x] Implement create_calendar_event tool (calls /api/calendar)
- [x] Add read_emails tool (list inbox with Kiko analysis)
- [x] Add search_emails tool (Gmail full-text search)
- [x] Update tool definitions: cc on send_email, attendees + meet_link on calendar
- [ ] Add email + calendar context injection to system prompt

## Sidebar Updates
- [x] Enable Phase 2 nav items (Dashboard, Pipeline, Deals, Contacts, Companies, Tasks)
- [x] Enable Documents + Vela Code nav items
- [ ] Remaining Phase 3 items still greyed (Knowledge, Sectors, Sponsorship, Outreach, Analytics)

## Supabase Tables Needed (Sunny to run SQL)
- [ ] user_tokens
- [ ] emails
- [ ] email_sync_state
- [ ] calendar_events
- [ ] user_settings (with user_email PK)
- [ ] code_sessions

---

## Completed (Previous Phases)
- Phase 0 — Project Setup: COMPLETE
- Phase 1 — Foundation: COMPLETE (Kiko, Auth, Layout, Voice, Settings)
- Phase 2 — CRM Pages: COMPLETE (Dashboard, Pipeline, Contacts, Companies, Deals, Tasks)
- Phase 3 — Documents + Search: PARTIALLY COMPLETE (upload has 400 error)
- KikoThinking toolStatus fix: COMPLETE
