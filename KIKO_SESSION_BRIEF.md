# KIKO INTELLIGENCE OS — COMPLETE ARCHITECTURE & BUILD HISTORY

## For session handoff — read THIS before writing ANY code

## Last updated: 2026-04-24 23:00 UTC

## 59 build sessions spanning April 7-24, 2026

## Transcripts: /mnt/transcripts/ (read journal.txt for session index)

---

## IDENTITY

**Platform:** Kiko Intelligence OS — AI executive operating partner for Van Hawke Group **Owner:** Sunny Sidhu, CEO of Van Hawke Group (Weybridge, UK) **Entities:** Van Hawke Agency (F1/Formula E sponsorship advisory), Van Hawke Maison Inc. (luxury eyewear), Van Hawke Group Inc. (US holding/IP) **Primary client:** Haas F1 Team (TGR Haas) **Team:** Sunny (super_admin), Matt Smith (user, Head of Commercial Partnerships, Newark DE)

---

## ENVIRONMENT

ComponentLocationDetailsRepo`/Users/sunny/Desktop/vela-platform/`Git → auto-deploys to VercelFrontend`https://kiko.vanhawke.agency`Vercel (static only, free tier)API`https://api.vanhawke.agency`Hetzner 178.104.73.22, Express port 3000, nginx SSLSupabaseproject_id `dwiywqeleyckzcxbwrlb`62 kiko\_\* tables, 4,500+ entriesLinkedInHetznerPlaywright + Decodo proxy ([isp.decodo.com:10001](http://isp.decodo.com:10001))VoiceOpenAI GPT-4o Realtime APIWebRTC, api/realtime-token.js

### Deploy Rules (NEVER BREAK)

- `npm run build` → `git add -A` → `git commit --no-verify -m "msg"` → `git push origin main`
- Hetzner: `scp` → `chown kiko:kiko` → `su - kiko -c 'cd /home/kiko/kiko-worker && pm2 restart kiko-worker'`
- NEVER use `--force`, `VERCEL_FORCE_NO_BUILD_CACHE=1`, or `npx vercel --prod` (caused $830 overage)
- NEVER modify `api/kiko.js`, `api/kiko-tools.js`, `api/kiko-self-knowledge.js` without permission
- Always `node --check` before deploying server files
- After PM2 changes: `pm2 save`

---

## COMPLETE BUILD HISTORY (April 7-24, 2026)

### Week 1 (Apr 7-9): Foundation

- Kiko Master Plan v1.0 architecture designed and executed
- 5 of 16 sprints shipped (A1-A2, B1 partial)
- Lemlist removal + contacts cleanup (11,876→4,193)
- 72% cron cost reduction
- Command Centre built
- Campaign sequencer wired
- Kiko Bible + self-learning feedback loop + meta-learning + rule promotion
- Intent classifier built
- Voice-in-chat transcription wiring
- Parallel multi-task conversations (schema + UI)
- Deterministic campaign builder
- F1 partnership matrix data hygiene
- System-wide audit (27 agent files, 4,829 lines)
- Morning Brief system
- Self-test endpoint (18 checks)

### Week 2 (Apr 10-13): Multi-User & Polish

- v0.0.11 → v0.0.62 deployed (51 versions)
- Build campaign timeout fix
- Voice mode hardening (auto-reconnect, heartbeat, status indicator)
- Gmail signature fix (sendAs API alias matching)
- Multi-conversation foundation + ThreadIndicator UI
- Memory extraction quality (642 rows cleaned, 8-pass filter)
- Complete 7-sub-phase multi-user migration:
  - A: Audit → B: Org schema → C: Three-layer Bible split → D: Settings tabs
  - E: Export role gating → F: Campaign send-as + onboarding → G: Page permissions
- Matt Smith onboarding (Google OAuth fix, RLS provisioning, kiko_user_config)
- Background Tasks Phase 1-4 (fire-and-switch, SSE streaming)
- Domain migration: vela-platform-one.vercel.app → kiko.vanhawke.agency
- Vela→Kiko rename across all user-facing surfaces
- DB-backed branding refactor
- Embeddings backfill
- 8 unread warm replies recovered from Lemlist inbox

### Week 2b (Apr 14-15): LinkedIn & UI Redesign

- v0.0.63 → v0.0.70 (Lemlist webhook safety net, LinkedIn Layers 1+2)
- Complete native LinkedIn integration:
  - Layer 1: Tools (search, send invite, send message)
  - Layer 2: Sequence engine with safety (25/day→40, kill switch, audit log)
  - Voyager API blocked by Cloudflare → Playwright stealth engine on Hetzner
  - Chrome extension for cookie sync
  - Decodo residential proxy integration (dedicated Germany IPs)
- Hetzner VPS provisioned (CX21 Falkenstein)
- [Legora.com](http://Legora.com) UI redesign:
  - Complete design system extraction (free fonts, exact colour tokens)
  - 8 HTML mockup pages built and approved
  - Phase 1 token swap across entire platform
  - kiko-polish.css/js with 21st.dev-inspired patterns
  - 3 navigation option mockups (Option A locked)
  - Calendar Option C with outreach intelligence

### Week 2c (Apr 15-17): React Port & Platform Buildout

- Full Legora React port committed (all 8 pages)
- Supabase outreach intelligence tables + RLS
- Settings overhaul (11 tabs)
- Pipeline deal panel consistency
- Hetzner cron migration (48→49 crons from Vercel)
- Voice settings (5 tone presets)
- Google Calendar integration (read + write)
- Knowledge seeder expanded (15→26 domains)
- Pipeline analytics + activity history + inline editing
- Contacts enrichment badges
- LinkedIn connect UI in Settings
- Notification bell with real data
- F1 2026 calendar (22 races) + MotoGP + WEC + Formula E calendars
- Knowledge versioning
- Sequence visual builder with drag-to-reorder
- Contact dedup
- Campaign section Legora theme overhaul
- Prospect detail panel + campaign stats bar
- Google Maps directions tool
- Supabase backup setup

### Week 3 (Apr 19-22): Mobile + Campaign Engine

- Mobile PWA buildout (page-by-page approval, bottom nav, service worker)
- KikoAvatar 5-dot identity system
- Voice mode mobile fixes
- Command Centre mobile panel
- Campaign engine completion (multi-user email + LinkedIn sending + reply detection)
- Knowledge domain expansion to 28 domains
- Formula E calendar fix (17 races)
- SequenceDetail Legora theme alignment (81 fixes)
- Lemlist-style campaign builder rebuild (flow view + conditions + multichannel)
- Prospect management (bulk select/sort/duplicate/delete)
- Add Prospects deep research pipeline
- Email intelligence engine (6 APIs)
- Gmail draft creation for team members with signatures
- Multi-file upload system
- Condition evaluation engine
- Platform audit with dead code cleanup
- Self-improvement engine (learned rules, preferences, user awareness)
- Document library page
- Push notifications infrastructure

### Week 3b (Apr 22-24): Hetzner Migration + Intelligence Engine

- ALL API calls migrated to Hetzner (62 frontend fetch() calls updated)
- Wildcard Express route handler + nested path support
- SSL (Let's Encrypt) + DNS (api.vanhawke.agency)
- nginx SSE streaming config
- Missing directories synced (api/lib/, api/\_lib/, api/admin/)
- Reasoning engine built and deployed:
  - Pre-processing: entity extraction (Haiku), CRM lookup, knowledge search
  - 8-second hard timeout, skips lightweight intents
  - Web verification removed (delegated to Claude's tools)
  - Results injected as PRE-VERIFIED INTELLIGENCE
- Email draft fixes: body blank (renderBody regex), subject/to stateful, memory fire-and-forget
- Real-time monitors: pipeline (30min), email (2min), follow-ups (2hrs), scheduled sender (5min)
- Supabase Realtime listener (3 channels)
- All 16 crons migrated from Vercel to Hetzner
- Full platform audit (22 tools tested, 25 agents verified)
- Model migration to claude-sonnet-4-6
- Follow-up tracking system (kiko_follow_ups table, 7 prospects seeded)
- Scheduled email sending (table, cron, UI with timezone picker)
- Auto-tracking hook (every sent email auto-logged)
- Chat sidebar fixes (rename event + correct JSONB query)
- Dynamic timezone detection (browser Intl API)
- Display names ("Matt Smith [matt.smith@vanhawke.agency](mailto:matt.smith@vanhawke.agency)") across all email paths
- Campaign sender display name fix (was hardcoded "Sunny Sidhu")
- Simple drafts use Haiku (\~12s vs 22-37s Sonnet)
- Proactive Intelligence Engine (2x daily — scans F1/fashion/business, creates strategic alerts)
- 8 competitive research domains in learning director
- Complete memory architecture awareness (62 tables, 4,500+ entries documented)
- 3 deep query tools (relationships, thought journal, conversation insights)
- Document generation pipeline (research → structure → branded HTML/PPTX)
- Homepage fixes (greeting, background tasks icon, nav CSS grid centering)

### Session 59 (Apr 24-25): Proactive Intelligence v2 + Hetzner Consolidation + KikoLiveContext

**Intelligence Infrastructure:**
- Self-Discovery Engine (monitors/competitive-discovery.js) — 5 domains rotating weekly
- Predictive Synthesis added to proactive-intel monitor — 5 prediction types, 2x daily
- Agency Org Intel domain (12 topics) in learning director. Total: 29 research domains
- Knowledge Visibility Fix — domain-aware loading (latest per domain, up to 28)
- search_knowledge now searches kiko_knowledge table
- 16 dormant crons activated (cron-scheduler.js wired into server.js, 21 local jobs)
- 26 dead cron entries removed, pg_cron audit confirmed zero jobs
- Full API sync: 120 files to Hetzner. cron-job-processor URL: Vercel → Hetzner
- Vercel stripped to 1 function (google-auth only) — free tier ready

**KikoLiveContext (src/contexts/KikoLiveContext.jsx):**
- Single source of truth for all intelligence surfaces
- Supabase Realtime subscriptions on 5 tables (alerts, tasks, follow-ups, draft_actions, activities)
- All actions logged to activities table — Kiko reads these in her system prompt
- Homepage pills, alert panel, Command Centre all share live state
- Dismiss alert → all surfaces update. Complete task → pills rebuild. Instant.

**Command Centre:**
- Follow-up tracker + mark-as-done, campaign activity section
- Expanded signals (predictions, discoveries, proactive intel)
- Role-based filtering (Matt = sponsorship only, Sunny = all)
- Auto-reconciliation checks 3 sources (activities, outreach queue, follow-ups)
- Stale deals 30-365d only (excludes never-touched). Clear all overdue button
- Tasks/followUps/actions from KikoLiveContext — no duplicate queries

**Alert Panel (KikoInsights):**
- Fully rewritten to use KikoLiveContext
- Inline CTAs on every alert: Brief me, Act on this, × (no expand needed)
- Suggested actions: Do this, Brief me first, × (was icon-only, now text CTAs)
- Shows ALL undismissed alerts (count matches pill)

**Homepage:**
- CSS alignment fixed (removed marginLeft: -14 offset when sidebar collapsed)
- Alert pill hidden when count=0, pills never exceed prompt bar width (660px, nowrap)
- Dynamic pills from context: follow-ups, replies, stale deals, predictions
- Labels truncated at 28 chars, 3 chips when alert visible, 4 when hidden

**Data Fixes:**
- 125 null user_id alerts → assigned to Sunny. All monitors now write user_id
- RLS policies added for kiko_follow_ups + kiko_draft_actions (were invisible to frontend)
- 37 overdue tasks bulk-cleared. Illumio follow-up closed (Closed Lost deal)
- Nscale + Stord deal lastActivity updated from follow-up sent dates
- Old noise alerts dismissed. Draft actions cleared. Clean slate.

---

## CURRENT ARCHITECTURE (April 24, 2026)

### Monitors (all on Hetzner, weekdays only)

MonitorSchedulePurposePipeline30min308 deals health scanEmail replies2min (7am-9pm)Gmail inbox scan for repliesFollow-ups2hrs (8am-8pm)Overdue follow-up alertsScheduled sender5min (7am-9pm)Send emails at scheduled timeProactive intel + predictions8am + 2pmF1/fashion/business strategic alerts + predictive synthesisCompetitive discoverySunday 5amSelf-discovers new competitors, prospects, disruptorsLearning director3am1 competitive research topic per night (29 domains)RealtimeAlways3 Supabase channelsCron scheduler21 jobsAPI crons calling localhost (previously dormant, activated Session 59)

### Tools (42+ in kiko-tools.js)

Agents: navigator, deal, data, outreach, document, memory, strategy, negotiation, category, finance, ea, legal, dispute, content, investment, pricing, signal, travel, specialist, code_review Actions: navigate_page, log_activity, google_maps_link, create_email_draft, batch_draft_emails, read_email, read_calendar, manage_knowledge, linkedin_search/invite/message, get_platform_users, update_kiko_preference, search_conversations, trigger_triage New: check_follow_ups, check_scheduled_emails, generate_document, query_relationships, query_thought_journal, query_conversation_insights

### Memory Systems (62 tables, 4,500+ entries)

Loaded every conversation: Core Bible, Org Bible, User Bible, Knowledge Base (28+ domains), Learned Rules (43), Preferences (8), Personal Context (486), Conversation Insights (last 5 of 1,591), User Profiles (1) Queryable via tools: Thought Journal (196), Relationships (94), Email Style (16), AI Memory (153), Learning Log (433), Memories (1,431), Skills (35)

### Research Domains (9 Van Hawke competitive + academic curriculum)

VH Agency: competitive landscape, F1 deal intel, prospect signals, positioning, agency org structures VH Business: zero-to-global building, marketing/social playbook VH Maison: eyewear competitive, fashion marketing Academic: 15+ pillars (sales, negotiation, psychology, legal, etc.) Self-Discovery: agency competitors, prospect signals, eyewear disruptors, agency structures, F1 commercial shifts

---

## WHAT'S PENDING (prioritized)

### Must Fix

1. **Homepage alignment** — CSS grid deployed but user says nothing changed. Needs verification + possible cache issue
2. **Document generation speed** — 150s total (53s research + 97s structure). JSON repair added. Needs PPTX test + move to background job
3. **Email drafts still \~22s** for complex (Sonnet). Simple use Haiku (\~12s)

### Should Build
4. **ChatGPT re-import** — User has extensive ChatGPT conversations to import
5. **Supabase pg_cron audit** — 11 crons run via pg_cron, some may overlap with the newly activated cron-scheduler. Verify no double execution
6. **Proactive synthesis feedback** — Predictions should feed into morning brief and greeting. Verify alert → brief pipeline works
7. **Vercel cleanup** — Remove api/ serverless function config from vercel.json since all API runs on Hetzner now

### Future

 8. **Google Pub/Sub** — Webhook built but blocked by Workspace policy. 2min polling as workaround
 9. **Meeting transcription** — BlackHole + Whisper approach designed, parked
10. **Full Vercel elimination** — Serve frontend from Hetzner
11. **SponsorSignal LinkedIn posting system**

---

## OPERATING RULES

### Email

- NEVER include pricing in early-stage outreach
- NEVER use generic openings ("I hope this finds you well")
- Always "intelligent age" not "AI generation"
- Always "Cultural Performance Eyewear" for Van Hawke Maison
- Never reference "secured funding" with prospects
- Always USD, never GBP
- Emails under 150 words
- Display: "Matt Smith [matt.smith@vanhawke.agency](mailto:matt.smith@vanhawke.agency)" (all paths)

### Code

- Deliverables first, commentary second
- If asked to "tighten," cut 25-40%
- Strategic advisor: brutally honest, start with hard truth
- Before API work: search current official docs first
- Every Kiko session: read KIKO_SESSION_BRIEF.md + KIKO_EVOLUTION_PLAN.md
- Update KIKO_BIBLE.md after every ship
