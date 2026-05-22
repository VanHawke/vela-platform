# KIKO SESSION 68 BRIEF
# Created: 2026-05-22 | Previous: Session 67 (massive intelligence + audit + features session)
# READ THIS ENTIRE FILE BEFORE WRITING ANY CODE

## ENVIRONMENT
- Repo: `/Users/sunny/Desktop/vela-platform/`
- Frontend: `https://kiko.vanhawke.agency` (Hetzner nginx at /var/www/kiko/)
- API: `https://api.vanhawke.agency` (Hetzner 178.104.73.22, PM2 process: kiko-worker)
- Worker: `/home/kiko/kiko-worker/` on Hetzner
- Supabase: project `dwiywqeleyckzcxbwrlb`
- Latest commit: `462d97b` on main
- Deploy: `npm run build && scp -r dist/* root@178.104.73.22:/var/www/kiko/` for frontend
- Deploy API: `scp api/FILE.js root@178.104.73.22:/home/kiko/kiko-worker/api/ && ssh root@178.104.73.22 "su - kiko -c 'pm2 restart kiko-worker'"`
- NEVER run `npx vercel` — Vercel is permanently cancelled

## CRITICAL EMAIL MAPPING
- Auth email: `sunny@vanhawke.com` | Config email: `sunny@vanhawke.agency`
- getUserConfig has domain fallback: .com ↔ .agency (fixed in Session 67)
- Always test with `sunny@vanhawke.agency` for config lookups
- Matt's auth: `matt.smith@vanhawke.com` | Config: `matt.smith@vanhawke.agency`
- Matt's auth ID: `f1cb67ee-2917-44a3-affe-e8779ede3851`
- Sunny's auth ID: `9f486437-4bf5-4111-abfe-fe19bfa76063`

## WHAT CHANGED IN SESSION 67 (MASSIVE SESSION)

### INTELLIGENCE LAYER (Phase 3-5)
- **Lean system prompt**: 47KB → 3KB (15x reduction). Old 407-line SYSTEM_PROMPT replaced with 46-line slim version
- **KIKO_MEMORY.md**: Persistent memory file updated after every conversation (compaction) and weekly (Dreaming)
- **kiko-self-knowledge-lean.js**: Loads identity + goals + intents + patterns + personal memory (~3K tokens)
- **Multi-pass morning synthesis**: Planner → Generator → Evaluator (Anthropic's evaluator-optimizer pattern)
- **Weekly outcome learning**: Extracts patterns from campaign data, stores in kiko_learning_log
- **Real-time correction detection**: "No, that's wrong" / "Actually..." detected and saved as preferences
- **Auto-task creation**: Post-conversation hook creates tasks from open_threads
- **Decision framework**: Every response must connect to goal → assess → recommend → justify → offer to act
- **Banned narration phrases**: "Good —", "Context loaded", "Memory loaded", "Let me check" etc.

### CODE CLEANUP
- 176 → 155 API files (21 archived to _archived/)
- 27,079 → ~20,000 lines
- kiko.js: 2,287 → 1,967 lines
- kiko-tools.js: 1,936 → 1,811 lines
- ask_lemlist_live tool REMOVED (Lemlist cancelled)
- Old 77KB self-knowledge archived to _archived/replaced/
- learning-director cron DISABLED (no output since April 25)
- 17 disabled cron files archived

### CRON CONSOLIDATION
- Dual cron systems discovered: cron-scheduler.js (27 active) + monitors/scheduler.js (5 active + 1 disabled)
- proactive-intel in monitors DISABLED (overlaps with heartbeat + morning-synthesis)
- All server-only files synced to git (routes/kiko-chat.js, monitors/, etc.)
- Active crons: 26 (from 43)
- Weekly cost: ~$15-30 (from $100+)

### MESSENGER (renamed from Messages)
- File sharing: drag & drop → Supabase Storage (vela-assets bucket)
- Voice calls: WebRTC via Supabase Realtime signaling
- Video calls: WebRTC with PiP local video, toggle camera
- Screen sharing: getDisplayMedia, auto-revert to camera
- Message forwarding: forward arrow icon, picks target channel
- Meeting scheduling: "📅 Meet" button → creates Google Calendar event → posts in channel
- Channel creation: "+" button in sidebar
- Reactions, threading, edit, delete, pin, @kiko AI mentions
- Realtime delivery, typing indicators, presence, browser notifications
- Matt's channel member ID fixed (was wrong UUID)

### VOICE (gpt-realtime-2)
- Upgraded to gpt-realtime-2 (GPT-5-class reasoning)
- Session config: semantic_vad, gpt-realtime-whisper transcription
- Audio checks ("can you hear me") now answer instantly without ask_kiko
- 10 varied holding phrases instead of just "Let me check"
- Email mapping fix: voice now loads personal memory correctly

### SELFCHECK
- 22/25 passing (was 17/25)
- Fixed: LinkedIn column (user_email not user_id), Gmail cron name, category count
- All 7 operational checks pass: Claude API, Gmail sync, LinkedIn cookies, campaign, briefing, enrollments, reply detection

### DATA FIXES
- D.Energy: null category → Energy/Petrochemical
- Cybersecurity open teams: updated to include Mercedes
- LinkedIn: 20 failed entries reset for retry
- Morning briefing: restricted to super_admin only (user_id set)

---

## OUTSTANDING ITEMS FOR THIS SESSION

### P0 — MUST DO FIRST:
1. **"Messages" → "Messenger" everywhere**: Settings page, Kiko tool definitions, navigate_page enum, any remaining references. Also update KIKO_MEMORY.md and lean prompt so Kiko knows it's "Messenger" not "Messages"
2. **Make Kiko aware of ALL new capabilities**: Update lean prompt with Messenger features (forwarding, meeting scheduling, screen sharing, video calls), voice improvements, self-diagnosis, calendar integration
3. **Voice still broken**: In Session 67, voice dropped connections and gave Korean hallucinations. The session config was updated to gpt-realtime-2 format + email mapping fixed. NEEDS TESTING. If still broken, check:
   - Browser console for WebRTC errors
   - Whether session.update is being received (format might still be wrong)
   - Whether ask_kiko timeout is causing connection drops
   - The useRealtimeVoice.js hook also needs the same session config update as KikoVoice.jsx

### P1 — CALENDAR INTEGRATION (Sunny's vision):
Sunny proposed: "Copy all of Google Calendar's functionality but bring it into Kiko, synced perfectly with Google Calendar and Gmail. Launch Google Meet from within the platform. Add a transcription tool for meetings that gives Kiko better understanding."

This is a major feature build. The architecture:
- **Bidirectional Google Calendar sync**: Read events (already done in morning synthesis), write events (already done in schedule-meeting), but also need: real-time webhook for calendar changes, accept/decline from within Kiko, recurring events, event editing
- **Gmail calendar invites**: Auto-detect .ics attachments and calendar invites in emails, show accept/decline in Command Centre
- **Google Meet integration**: When scheduling a meeting, auto-add Google Meet link. Launch Meet from within Kiko
- **Meeting transcription**: Use gpt-realtime-whisper or Deepgram to transcribe meetings. Store transcripts in kiko_knowledge. Give Kiko access to meeting context
- **Calendar page**: Already exists at /calendar (race calendar). Needs dual view: F1 race calendar + Google Calendar events

### P2 — REMAINING FIXES:
4. **Old 77KB self-knowledge fallback**: Still loaded if lean fails. Should be removed once lean proven stable
5. **Bible still loaded every conversation (~26KB)**: Should be moved to just-in-time via tools
6. **Campaign steps 2, 4, 6, 8, 9, 10, 11**: Still need template text (LinkedIn steps + breakup email)
7. **LinkedIn 20% failure rate**: 20 entries reset for retry — monitor results
8. **End call not stopping ringing**: tones.stop() fix deployed but needs testing
9. **useRealtimeVoice.js**: Mobile voice page needs same session config update as KikoVoice.jsx

---

## ARCHITECTURE REFERENCE

### System Prompt Flow:
1. SLIM_SYSTEM_PROMPT (46 lines, ~3KB) — identity + psychology + doctrine
2. {DYNAMIC_SELF_KNOWLEDGE} → kiko-self-knowledge-lean.js (~3K tokens)
   - Loads: KIKO_MEMORY.md, personal facts, goals, intents, patterns
3. Bible block (~26KB) — STILL loaded, should move to JIT
4. Knowledge base (scored by relevance to current query)
5. Learned rules + preferences
6. Entity context (page-specific)
7. Routing hints (per intent)

### Tool Execution:
- 47 tools registered in kiko-tools.js
- executeTool() dispatches by name
- Timeouts: 35s default, 60s for complex (data_agent, build_campaign, generate_document)
- Tool results fed back to Claude for next round (max 5-10 rounds)

### Cron Systems:
- System A: kiko-worker/src/cron-scheduler.js — 26 active HTTP-based crons
- System B: kiko-worker/monitors/scheduler.js — 5 active node-cron monitors
- Cron heartbeats stored in kiko_cron_heartbeats table

### Database:
- Supabase project: dwiywqeleyckzcxbwrlb
- 146 RLS policies
- 2 users: sunny@vanhawke.agency (super_admin), matt.smith@vanhawke.agency (user)
- Key tables: kiko_user_config, kiko_alerts, kiko_goals, kiko_intents, kiko_learning_log, kiko_memories, kiko_knowledge, kiko_team_messages, kiko_team_channels, kiko_outreach_queue, kiko_sequence_enrollments, contacts, deals, tasks

### Voice Architecture:
- Token: api/realtime-token.js → gpt-realtime-2 session
- Transport: WebRTC direct to OpenAI
- Intelligence: Voice model calls ask_kiko() → /api/kiko (same brain as text)
- Instructions: src/lib/buildVoiceInstructions.js
- Components: KikoVoice.jsx (desktop), MobileVoicePage.jsx (mobile), useRealtimeVoice.js (hook)

### Messenger Architecture:
- Frontend: src/pages/Messages.jsx (795 lines)
- API: api/team-messages.js (364 lines)
- Voice/Video: src/hooks/useVoiceCall.js (409 lines)
- Storage: Supabase Storage bucket 'vela-assets'
- Realtime: Supabase postgres_changes on kiko_team_messages
- Channels: General, Alpine Campaign, DM-sunny-matt (+ create from UI)

---

## PROCESS RULES (PERMANENT)
- Read KIKO_SESSION_BRIEF.md FIRST before any code
- Build locally with `npm run build`, verify no errors
- Deploy frontend: `scp -r dist/* root@178.104.73.22:/var/www/kiko/`
- Deploy API: `scp api/FILE.js root@178.104.73.22:/home/kiko/kiko-worker/api/`
- Restart: `ssh root@178.104.73.22 "su - kiko -c 'pm2 restart kiko-worker'"`
- NEVER run `npx vercel`
- Test EVERY change before claiming it works
- Update KIKO_MEMORY.md after significant changes
- Surgical edits only — no destructive rewrites
