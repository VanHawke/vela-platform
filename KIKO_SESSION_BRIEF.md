# KIKO SESSION BRIEF — Read this before writing any code
## Last updated: 2026-04-23

### REPO & DEPLOY
- Repo: `/Users/sunny/Desktop/vela-platform/` → `https://kiko.vanhawke.agency`
- Deploy: `git push` auto-deploys to Vercel. NEVER use `--force` or `VERCEL_FORCE_NO_BUILD_CACHE=1`
- Build: `npm run build` → verify → commit → push → verify new hash → test
- Supabase: project_id `dwiywqeleyckzcxbwrlb`

### HETZNER (178.104.73.22)
- PM2 (root): `kiko-crons` (22 scheduled jobs)
- PM2 (kiko user): `kiko-worker` (Express port 3000) — managed by systemd `pm2-kiko.service`
- LinkedIn worker: Playwright + Decodo proxy (`isp.decodo.com:10001`)
- Email Intel Engine: `/home/kiko/kiko-worker/lib/emailIntel.js`
- Worker secret: `kiko-hetzner-2026-vanhawke` (Authorization: Bearer header)

### RING-FENCE RULES
- NEVER modify `api/kiko.js`, `api/kiko-tools.js`, `api/kiko-self-knowledge.js` without explicit permission
- Always `node --check` syntax verify before pushing server files
- Always `Array.isArray()` on Supabase query results
- LinkedIn worker reads from `kiko_linkedin_queue` (NOT `kiko_outreach_queue`)
- Background jobs table: `kiko_background_jobs` (NOT `kiko_jobs`)

### KEY FILES
| File | Lines | Role |
|------|-------|------|
| api/kiko.js | 1963 | Main Kiko API — system prompt, tool routing, streaming |
| api/kiko-tools.js | 1455 | 39 tools — agents, actions, Gmail drafts |
| api/kiko-self-knowledge.js | 356 | Capability map, self-knowledge |
| api/cron-sequence-sender.js | 336 | Sequence email sender with condition evaluation |
| api/cron-job-processor.js | 100 | Background job processor (reads kiko_background_jobs) |
| api/create-gmail-draft.js | 55 | Gmail draft creation with RFC 2047 UTF-8 encoding |
| api/team-members.js | 15 | Returns all org members (bypasses RLS) |
| src/pages/SequenceDetail.jsx | 1445 | Campaign editor: flow builder + prospects |
| src/pages/Campaigns.jsx | 1535 | Campaign list + prospect table + detail panel |
| src/components/kiko/KikoChat.jsx | 1905 | Kiko chat: multi-file upload, streaming, inactivity timeout |
| src/components/kiko/EmailDraft.jsx | 260 | Email draft preview: copy, edit, team Gmail dropdown |
| src/components/kiko/KikoVoice.jsx | 527 | Voice: GPT-4o Realtime via WebRTC |
| src/components/layout/LegoraTopNav.jsx | 315 | Top nav: bg tasks cog, bell, avatar |
| src/components/layout/Layout.jsx | 600+ | Layout: notifications with dismiss + clear all |

### PERFORMANCE ARCHITECTURE
- Email intent: fast-match regex, 7 light tools (not 39), 2 tool rounds max, 30s time limit
- Other intents: full 39 tools, 5 tool rounds max, 65s time limit
- Per-tool timeout: 25s via Promise.race
- Heartbeat: 8s interval during tool execution
- Client inactivity timeout: 30s (no data = abort)
- Server watchdog: 90s
- Client hard timeout: 90s
- Conversation history: strips binary data, 2000 char cap per message

### WHAT'S WORKING (April 23, 2026)
- Kiko chat (streaming, 39 tools, email fast path, inactivity timeout)
- Email drafting (copy, edit inline, team Gmail dropdown with Matt)
- CRM (contacts, companies, deals, pipeline)
- Campaign builder (Lemlist-style flow + editor, conditions, branching)
- Campaign delete (CASCADE on all FK constraints)
- Sequence sender (cron, timezone-aware, condition evaluation)
- Email sending via Gmail API + LinkedIn via Playwright
- Email Intelligence Engine (6 APIs + SMTP)
- Gmail draft creation (RFC 2047 UTF-8 encoding, any team member)
- Reply detection (email + LinkedIn)
- Background tasks (nav cog icon, progress bars, cancel, clear finished)
- Prospect sourcing (Find leads + Deep source + Source in background)
- Knowledge base (26 nightly research domains)
- Multi-file upload (stack files, drag & drop)
- Voice (GPT-4o Realtime via WebRTC) — needs testing
- Notifications (dismiss individual, clear all, click to open in Kiko)
- Alert pill (pulsating orange when alerts > 0)
- Export restriction (super_admin only)
- Multi-user auth (zero data leakage)

### OUTSTANDING ITEMS
1. Kiko still occasionally hangs on complex multi-tool queries (not email)
2. Voice needs full testing — was reverted but not verified
3. Nav settings may still not persist on some refreshes
4. Campaign editor width may still jump on resize
5. PDF reading improved but needs more testing
6. SponsorSignal LinkedIn posting not connected

### REMAINING TASKS (for next session)

**Priority 1 — Build:**
1. Batch email drafting — new `batch_draft` tool in kiko-tools.js. Queue processor for N drafts with progress streaming. Uses existing create-gmail-draft endpoint.
2. Google Cloud Pub/Sub — set up topic + push subscription for instant Gmail webhooks (currently using 15-min polling). Requires Google Cloud Console access.
3. Supabase Realtime listener — persistent WebSocket on Hetzner for instant CRM change detection (deal stage moves, new contacts). Needs reconnection logic.
4. Document generation — multi-step research → synthesis → formatted output pipeline for pitch decks, reports, proposals.

**Priority 2 — Verify/Fix:**
5. Kiko's plan expand/collapse — user reported still not working properly. Switched from maxHeight to display:block/none but needs testing.
6. Auto-scroll during streaming — deployed but not confirmed by user.
7. Voice mode — GPT-4o Realtime was reverted, needs end-to-end verification.
8. SponsorSignal — LinkedIn posting system not connected.

**Priority 3 — Optimise:**
9. Conversation summary — currently static bullet points. Should use Haiku for AI-powered summarisation of older messages.
10. Full Vercel elimination — serve frontend from Hetzner, auto-deploy via git hook.
11. Mobile touch target verification — buttons increased but needs real device testing.

### HETZNER MIGRATION STATUS
- Kiko Chat API: ✅ Running on api.vanhawke.agency (no timeout limits)
- Gmail Draft Creation: ✅ On Hetzner
- Team Members API: ✅ On Hetzner
- Pipeline Monitor: ✅ Every 30min, 308 deals scanned
- Email Monitor: ✅ Every 15min, both inboxes
- Gmail Webhook: ✅ Endpoint ready, awaiting Google Pub/Sub setup
- SSL: ✅ Let's Encrypt, expires 2026-07-22
- Vercel: Frontend only (free tier)
