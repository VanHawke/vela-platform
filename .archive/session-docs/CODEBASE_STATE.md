# Vela Platform v2.0 — Codebase State

**Version:** 2.1.0
**Build Date:** 2026-03-10
**Repo:** github.com/VanHawke/vela-platform
**Deployed At:** https://vela-platform-one.vercel.app
**Platform:** Vite + React 19 + Tailwind v4 + shadcn/ui
**Database:** Supabase (project: dwiywqeleyckzcxbwrlb)
**AI Backend:** Anthropic Claude (tiered: Haiku/Sonnet) + OpenAI (voice/search) + Mem0
**Voice:** OpenAI Realtime API (Shimmer voice, WebRTC GA)
**Deployment:** Vercel (11/12 serverless functions used)

---

## Current Status

### Phase 0 — Project Setup: COMPLETE
### Phase 1 — Foundation: COMPLETE
### Phase 2 — CRM Pages: COMPLETE
### Phase 3 — Documents: PARTIAL (upload 400 error needs fix)

### Phase 4 — Google OAuth: CODE COMPLETE
- [x] api/google-auth.js — consent flow + callback token exchange
- [x] api/google-token.js — shared helper with auto-refresh
- [ ] Awaiting: Supabase user_tokens table, Google Cloud Console config

### Phase 5 — Email Client: CODE COMPLETE
- [x] api/email.js — full CRUD via Gmail API + Supabase cache
- [x] src/pages/Email.jsx — three-pane layout (folders, list, viewer/compose)
- [ ] Awaiting: Supabase emails + email_sync_state tables, OAuth tokens

### Phase 6 — Calendar: CODE COMPLETE
- [x] api/calendar.js — CRUD via Google Calendar API + Supabase cache
- [x] src/pages/Calendar.jsx — FullCalendar with week/month/day/list views
- [ ] Awaiting: Supabase calendar_events table, OAuth tokens

### Phase 7A — Settings: CODE COMPLETE
- [x] api/settings.js — GET/PATCH settings
- [x] Settings.jsx — 6 tabs (Profile, Kiko, Appearance, Images, Accounts, About)
- [ ] Awaiting: Supabase user_settings table with user_email PK

### Phase 7C — Vela Code: CODE COMPLETE
- [x] api/vela-code.js — file tree, file content, AI streaming, save + deploy
- [x] src/pages/VelaCode.jsx — Monaco editor + Kiko code chat

---

## Serverless Functions (11/12 used)

| # | File | Purpose |
|---|------|---------|
| 1 | api/kiko.js | Main AI chat (Claude tiered, tools, streaming) |
| 2 | api/voice.js | Whisper STT + Realtime tokens + Mem0 |
| 3 | api/health.js | Health check |
| 4 | api/documents.js | Document upload, chunk, embed, search |
| 5 | api/tool.js | Voice Realtime tool executor |
| 6 | api/google-auth.js | OAuth consent + callback |
| 7 | api/google-token.js | Token refresh helper + status check |
| 8 | api/email.js | Gmail operations |
| 9 | api/calendar.js | Google Calendar operations |
| 10 | api/settings.js | User settings CRUD |
| 11 | api/vela-code.js | Code editor backend |

**1 slot remaining** — reserve for future use.

---

## Kiko Tools (12 total)

| Tool | Status |
|------|--------|
| get_crm_data | Working |
| save_memory | Working |
| search_web | Working (gpt-4o-mini + 12s timeout) |
| get_realtime_data | Working (weather + time) |
| send_email | Implemented (needs OAuth) |
| read_emails | Implemented (needs OAuth) |
| search_emails | Implemented (needs OAuth) |
| get_calendar | Implemented (needs OAuth) |
| create_calendar_event | Implemented (needs OAuth) |
| search_documents | Working |
| read_codebase | Working (GitHub API) |
| push_to_github | Working (approval gate) |

---

## Routes

| Path | Component | Status |
|------|-----------|--------|
| / | KikoChat | Active |
| /home | KikoChat | Active |
| /email | Email | Active (needs OAuth) |
| /calendar | Calendar | Active (needs OAuth) |
| /settings | Settings | Active |
| /dashboard | Dashboard | Active |
| /pipeline | Pipeline | Active |
| /contacts | Contacts | Active |
| /companies | Companies | Active |
| /deals | Deals | Active |
| /tasks | Tasks | Active |
| /documents | Documents | Active (upload error) |
| /velacode | VelaCode | Active |

---

## Dependencies Added This Session

- @tiptap/react, @tiptap/starter-kit, @tiptap/extension-underline, @tiptap/extension-link, @tiptap/pm
- dompurify
- @fullcalendar/react, @fullcalendar/core, @fullcalendar/daygrid, @fullcalendar/timegrid, @fullcalendar/list, @fullcalendar/interaction
- @monaco-editor/react

---

## Blocking Items (Sunny Action Required)

1. **Supabase Tables** — Run the SQL from the brief to create: user_tokens, emails, email_sync_state, calendar_events, user_settings, code_sessions
2. **Google Cloud Console** — Enable Gmail + Calendar APIs, create OAuth credentials, set redirect URI
3. **Vercel Env Vars** — Verify GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET are set
4. **VERCEL_DEPLOY_HOOK** — Create deploy hook in Vercel dashboard, add to env vars
5. **SUPABASE_SERVICE_ROLE_KEY** — Add to Vercel env vars (needed for server-side DB calls)

---

## Decisions Log

1. **Settings use user_email not user_id** — all new tables use TEXT user_email column per brief
2. **DOMPurify for email HTML** — sanitized iframe rendering, no dangerouslySetInnerHTML
3. **FullCalendar for calendar** — standard library, dark theme via CSS vars
4. **Monaco for code editor** — vs-dark theme, syntax highlighting
5. **11/12 functions used** — 1 slot reserved for future
6. **Email sync initial: 200 messages** — batched in 50s to stay within 60s timeout
7. **Token auto-refresh** — 5-minute buffer before expiry
