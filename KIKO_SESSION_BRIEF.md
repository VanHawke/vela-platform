# KIKO SESSION BRIEF — Session 70 (2026-06-10)
# Read this FIRST before any code changes. Regenerated from LIVE state June 10.

## PLATFORM ARCHITECTURE
- **Frontend**: kiko.vanhawke.agency → nginx → /var/www/kiko (Vite+React SPA)
- **API**: api.vanhawke.agency → nginx → Express (pm2 kiko-worker, port 3000)
- **Server**: Hetzner 178.104.73.22, user: kiko
- **Database**: Supabase (project dwiywqeleyckzcxbwrlb) — all 131 tables RLS-enabled
- **AI**: Opus 4.8 BRAIN / Sonnet 4.6 COGNITIVE / Haiku 4.5 UTILITY — centralised in api/lib/models.js
- **Voice**: gpt-realtime-2 WebRTC (UNTESTED since session 67; fallback plan: Deepgram+Claude+Cartesia)

## DEPLOY PROCESS (MANDATORY)
1. `npm run build` locally — verify no errors
2. `git add -A && git commit --no-verify -m "message"`
3. Frontend: `scp -r dist/* root@178.104.73.22:/var/www/kiko/`
4. API: `scp <files> root@178.104.73.22:/home/kiko/kiko-worker/api/`
5. `ssh root@178.104.73.22 "chown -R kiko:kiko /home/kiko/kiko-worker/ && su - kiko -c 'pm2 restart kiko-worker'"`
6. NEVER run `npx vercel`. Verify live + browser screenshot before claiming done.
7. Server-side edits: write python to /tmp locally, scp, run as kiko. Node scripts need .cjs (pkg is ESM). Modules only resolve inside /home/kiko/kiko-worker.

## CURRENT STATE (verified live June 10)

### Key Files
- `api/kiko.js` — Brain (535 lines, rebuilt Jun 6, slimmed Jun 10). No intent gates, no tool filtering.
- `api/kiko-tools.js` — ~55 tool definitions + executeTool dispatch
- `api/kiko-self-knowledge-lean.js` — Identity + rules, loaded by BRAIN (108 lines)
- `api/kiko-self-knowledge.js` — 87KB DETAIL file. NOT read by brain — only team-messages.js + health.js. Do NOT put session state here.
- `api/data/KIKO_MEMORY.md` — Session state the brain reads EVERY message (~8K chars). Update THIS after builds.
- `api/lib/models.js` — Centralised model config (self-upgradeable)
- `src/cron-scheduler.js` + `monitors/scheduler.js` — TWO schedulers exist
- `api/enrich-on-demand.js` — POST endpoint: DNS → Hunter → Apollo → Sonnet cascade

### Context Architecture (Session 70 — ACTUAL)
- System prompt ~19.4K chars (~4.9K tokens): lean identity + KIKO_MEMORY + personal files + patterns + entity context + learned rules + prefs + goals + intents + draft actions + voice profile
- Bible is JIT via read_bible tool (eager injection REMOVED Jun 10). read_bible capped at 20K chars out.
- TTL caches: rules/prefs/patterns 5min, personal files/voice profile 10min (in-process, reset on pm2 restart)
- DB roundtrips per message: ~10 cold, ~5 warm

### Crons (post cost-cut June 10)
- DISABLED (archived _archive/): cron-crm-enrich, cron-morning-synthesis, proactive-intel monitor
- ACTIVE: daily-intelligence (1 Opus, 6am), heartbeat (Sonnet 2hrly 8-20, signal-gated), conversation-learning (Opus, Sun 3am), competitive-discovery (Sonnet, Sun 5am)
- API cost ~$2-3/day (was $15-25)

### CRM (deep audit complete June 10)
- 4,233 contacts | T1: 840 | T2: 1,868 | T3: 1,064 | T4: 461
- T1 fully ready (email+LinkedIn): 769 (91.5%) | email-only: 70 | no email: 1 (Kypros Zoumidou)
- LinkedIn lives in TWO fields: linkedinUrl AND linkedin — query both
- Hunter.io key in .env; June: 34/50 searches, 69/100 verifications used
- LinkedIn cookies VALID (Playwright+Decodo daily refresh). Server raw-fetch to LinkedIn always fails (IP-blocked) — that is NOT cookie expiry.

### CRITICAL: Three Nav Lists Must Stay In Sync
1. `LegoraTopNav.jsx` → ALL_PAGES  2. `Layout.jsx` → ALL_NAV  3. `Settings.jsx` → ALL_TOP_NAV
Plus Supabase kiko_user_config.nav_settings

## KNOWN ISSUES / NEXT
- API CREDITS LOW (June 10): daily-intelligence + heartbeat hit 400 insufficient-credit. Top up console.anthropic.com.
- kiko_core_bible row content stale (§1 claims wrong brain model) — needs SQL content refresh
- Agentic turn limit kills long self-audits silently — needs graceful exit (kiko.js tool loop)
- Campaigns page rebuild (CAMPAIGNS_BUILD_BRIEF.md), steps 2/4/6/8/9/10/11 empty
- Command Centre tabs empty — field mappings in COMMAND_CENTRE_BUILD_BRIEF.md
- Voice untested; Messenger rename incomplete; LinkedIn ~20% fail rate
- 70 T1 contacts need LinkedIn URLs (enrol-time via enrich-on-demand)
- UI work: read REDESIGN_BUILD_SPEC.md first, build on redesign-v2 only
