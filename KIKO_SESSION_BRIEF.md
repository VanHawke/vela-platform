# KIKO SESSION BRIEF — Session 68 (2026-05-22)
# Read this FIRST before any code changes

## PLATFORM ARCHITECTURE
- **Frontend**: kiko.vanhawke.agency → nginx → /var/www/kiko (Vite+React SPA)
- **API**: api.vanhawke.agency → nginx → Express (pm2 kiko-worker, port 3000)
- **Server**: Hetzner 178.104.73.22, user: kiko
- **Database**: Supabase (project dwiywqeleyckzcxbwrlb)
- **AI**: Claude Sonnet 4.6 (backbone), Haiku (extraction/classification), GPT-4o Realtime (voice)

## DEPLOY PROCESS (MANDATORY)
1. `npm run build` locally — verify no errors
2. `git add -A && git commit --no-verify -m "message"`
3. Frontend: `scp -r dist/* root@178.104.73.22:/var/www/kiko/`
4. API: `scp <files> root@178.104.73.22:/home/kiko/kiko-worker/api/`
5. `ssh root@178.104.73.22 "chown -R kiko:kiko /home/kiko/kiko-worker/ && su - kiko -c 'pm2 restart kiko-worker'"`
6. NEVER run `npx vercel`

## CURRENT STATE (49 tools, 35 routes, 46 crons)

### Key Files
- `api/kiko.js` — Brain (1,967 lines). Intent routing, context loading, tool loop, streaming
- `api/kiko-tools.js` — 49 tool definitions + executeTool dispatch
- `api/kiko-self-knowledge-lean.js` — Lean prompt (identity, tools, decision framework)
- `api/data/KIKO_MEMORY.md` — Persistent cross-session state
- `KIKO_BIBLE.md` — Operational doctrine (loaded on-demand via read_bible tool)
- `api/agents/intent-classifier.js` — 30+ intents
- `kiko-worker/server.js` — Express routes
- `kiko-worker/src/cron-scheduler.js` — 46 crons
- `src/components/layout/LegoraTopNav.jsx` — Top nav bar (ALL_PAGES array)
- `src/components/layout/Layout.jsx` — Layout + sidebar nav (ALL_NAV array)
- `src/components/settings/Settings.jsx` — Settings page (ALL_TOP_NAV array)

### CRITICAL: Three Nav Lists Must Stay In Sync
1. `LegoraTopNav.jsx` → ALL_PAGES
2. `Layout.jsx` → ALL_NAV
3. `Settings.jsx` → ALL_TOP_NAV
Adding a nav item requires updating ALL THREE files + Supabase kiko_user_config.nav_settings

### Context Architecture (Session 68)
- Bible is NOT in the system prompt — loaded on-demand via `read_bible` tool
- Casual queries (weather, recommendations) skip CRM/entity context
- System prompt: ~4K tokens base (lean prompt + memory)
- Full outreach with all context: ~4K tokens (down from 30K)

### Self-Modification (Session 68 — NEW)
- `kiko_self_modify` tool: read_file, edit_file, list_files, run_command, deploy
- Audit log: KIKO_SELF_EDIT_LOG.md (every operation logged)
- Safety: backups before edit, syntax check for JS, rollback on error
- Deploy: git commit → pm2 restart → health check
- Proactive: greeting runs selfcheck, reports failures FIRST

### Google Integration
- OAuth: prompt='consent', route mounted in server.js, nginx proxy on kiko.vanhawke.agency
- Scopes: Gmail (full), Calendar, meetings.space.readonly, OpenID, Profile
- Calendar API: GET (list), POST (create with Meet auto-add), PATCH (edit), DELETE
- Meet Transcripts: POST /api/meeting-transcripts, cron at 7pm weekdays
- Token storage: Supabase user_tokens table (provider=google)

### Pages (11 nav items)
- Today (/), Command Centre, Pipeline, Campaigns, Messenger, Calendar, Sporting Events
- Contacts, Organisations, Partnership Matrix, Document Library
- Hidden: Knowledge (/knowledge — still accessible, not in nav), Settings, Health Center (admin)

### Voice
- GPT Realtime 2 via WebRTC direct to OpenAI
- Whisper transcription with language='en' (fixes Korean hallucinations)
- Components: KikoVoice.jsx, MobileVoicePage.jsx, useRealtimeVoice.js

### PWA (Foundation deployed)
- manifest.json in public/
- Service worker (sw.js) with push notification listener
- Registration in index.html
- STILL NEEDS: VAPID key generation, push subscribe/send endpoints, notification UI

## SESSION 68 COMMITS (28 total)
Key changes: Bible→JIT, self-modification, Google OAuth fix (3 bugs), Meet transcripts,
calendar create/edit/delete with Meet auto-add, nav sync (3 lists), Knowledge removed from nav,
proactive health monitoring, voice language fix, PWA foundation, Document Library analyse button

## REMAINING TO BUILD
1. PWA push notifications (VAPID keys + backend + frontend)
2. Gmail .ics invite detection (accept/decline from Kiko)
3. Calendar real-time webhooks (bidirectional Google Calendar sync)
4. Sporting Events page redesign (more useful content)
5. Campaign steps 2,4,6,8,9,10,11 (LinkedIn + breakup templates)

## HARD RULES
- NEVER run `npx vercel`
- NEVER claim something works without browser verification
- Always update KIKO_MEMORY.md and lean prompt after shipping changes
- Three nav lists must stay in sync
- Kiko's email for API calls: sunny@vanhawke.agency (NOT sunny@vanhawke.com)
- Campaign sender: Matt's account (never Sunny's)
- F1 sponsorship values: $3M-$40M (never $500K-$2M)
