# KIKO SESSION BRIEF — Complete Architecture & State

## Last updated: 2026-04-24 (end of marathon April 23-24 session)

## Previous transcripts: /mnt/transcripts/2026-04-24-13-51-37-kiko-platform-full-session-apr23-24.txt

---

## ENVIRONMENT

### Repo & Deploy

- **Repo:** `/Users/sunny/Desktop/vela-platform/` → `https://kiko.vanhawke.agency` (frontend/Vercel)
- **API:** `https://api.vanhawke.agency` (Hetzner — ALL API calls route here)
- **Supabase:** project_id `dwiywqeleyckzcxbwrlb`
- **Deploy frontend:** `npm run build` → `git add -A` → `git commit --no-verify -m "msg"` → `git push origin main` (auto-deploys to Vercel)
- **Deploy Hetzner:** `scp file root@178.104.73.22:/home/kiko/kiko-worker/path/` → `chown kiko:kiko` → `pm2 restart kiko-worker`
- **NEVER** use `--force`, `VERCEL_FORCE_NO_BUILD_CACHE=1`, or `npx vercel --prod` (caused $830 overage)

### Hetzner Server (178.104.73.22)

- **kiko-worker:** PM2 under `kiko` user, Express port 3000, MUST run from `/home/kiko/kiko-worker` for `.env` to load
- **kiko-crons:** PM2 under root, 22 scheduled jobs
- **Nginx:** SSL via Let's Encrypt, reverse proxy to port 3000, SSE streaming with `proxy_buffering off`
- **Nginx timeouts:** `/api/kiko` = 300s, `/api/generate-document` = 300s, `/api/*` = 120s
- **Static docs:** `/docs/` served from `/home/kiko/kiko-worker/public/docs/` (auth whitelisted)
- **LinkedIn:** Playwright + Decodo proxy (`isp.decodo.com:10001`)
- **Worker secret:** `kiko-hetzner-2026-vanhawke`

### Users

- **Sunny:** super_admin, user_id `9f486437`, [sunny@vanhawke.com](mailto:sunny@vanhawke.com), Weybridge UK (Europe/London)
- **Matt:** user, user_id `f1cb67ee`, [matt.smith@vanhawke.com](mailto:matt.smith@vanhawke.com), Newark DE (America/New_York)

---

## RING-FENCE RULES (NEVER BREAK)

- NEVER modify `api/kiko.js`, `api/kiko-tools.js`, `api/kiko-self-knowledge.js` without explicit permission
- Always `node --check` syntax verify before deploying
- Always `Array.isArray()` on Supabase query results
- Always `npm run build` before `git push`
- PM2 must run from `/home/kiko/kiko-worker` directory (not `/home/kiko`)
- After PM2 restart: `pm2 save` to persist across reboots

---

## KEY FILES (with current line counts)

FileLinesRole`api/kiko.js`\~2091Main API — system prompt, reasoning engine, streaming, tool routing`api/kiko-tools.js`\~176042+ tools — agents, Gmail drafts, follow-ups, scheduled emails, documents, relationships, thought journal, conversation insights`api/kiko-self-knowledge.js`\~530Full capability map, memory architecture docs, proactive intel docs, cross-referencing rules`api/reasoning-engine.js`\~163Pre-processing layer — entity extraction (Haiku), CRM lookup, knowledge search. Runs BEFORE Claude.`api/create-gmail-draft.js`\~138Gmail draft creation with display names, auto follow-up tracking`api/schedule-email.js`33Schedule email API endpoint`api/generate-document.js`\~312Document generation pipeline (research → structure → branded PDF/PPTX)`api/gmail-webhook.js`\~110Pub/Sub webhook (built but inactive — Workspace policy blocks it)`api/cron-learning-director.js`\~604Nightly research — 8 VH competitive domains + academic curriculum`api/cron-sequence-sender.js`\~336Campaign sequence email sender with display names`monitors/proactive-intel.js`\~175Proactive strategic intelligence — runs 8am + 2pm, scans F1/fashion/business news`monitors/follow-up-monitor.js`\~101Checks for overdue follow-ups, scans Gmail for replies`monitors/scheduled-sender.js`\~111Sends scheduled emails at their time via Gmail API`monitors/email-monitor.js`—Scans both inboxes every 2min for replies`monitors/pipeline-monitor.js`—Pipeline health every 30min`monitors/scheduler.js`\~55Registers all monitors with node-cron`monitors/realtime-listener.js`—Supabase Realtime — 3 channels (deals, contacts, campaign_targets)`src/components/kiko/KikoChat.jsx`\~1958Main chat UI — greeting, prompt bar, message rendering, EmailDraft, ChatHistory`src/components/kiko/EmailDraft.jsx`\~458Email preview — send to drafts, schedule send, tone rewrite, display names`src/components/kiko/ChatHistory.jsx`—Chat sidebar — rename event listener, conversation loading`src/components/layout/LegoraTopNav.jsx`\~339Top nav — CSS grid layout, activity pulse icon for background tasks`src/styles/kiko-polish.css`\~535Nav styling — grid centering, link positioning`KIKO_BIBLE.md`81Operational knowledge base — updated April 24

---

## MONITORS & CRONS (all on Hetzner)

MonitorScheduleWhat it doesPipelineEvery 30min (Mon-Fri)Scans 308 deals for health alertsEmail repliesEvery 2min (Mon-Fri, 7am-9pm)Checks both Gmail inboxes for replies from CRM contactsFollow-upsEvery 2hrs (Mon-Fri, 8am-8pm)Checks 7+ tracked follow-ups for overdue/replied statusScheduled senderEvery 5min (Mon-Fri, 7am-9pm)Sends emails at their scheduled time via Gmail APIProactive intel8am + 2pm (Mon-Fri)Scans F1/fashion/business news, creates strategic alertsLearning director3am dailyResearches 1 competitive topic (8 VH domains prioritized 2/3 of nights)RealtimeAlways3 Supabase channels SUBSCRIBED (deals, contacts, campaign_targets)

---

## WHAT WAS BUILT THIS SESSION (April 23-24, 2026)

### Reasoning Engine ✅

- Pre-processing layer in `api/reasoning-engine.js`
- Runs BEFORE Claude: extracts entities (Haiku \~1s), CRM lookup (\~1s), knowledge search (\~0.5s)
- 8-second hard timeout — skips if slow
- Injects `PRE-VERIFIED INTELLIGENCE` block into user message
- Tells Claude "data already loaded, do NOT re-fetch"
- Web verification REMOVED from pre-processing (delegated to Claude's own tools)

### Follow-up Tracking ✅

- `kiko_follow_ups` table with auto-calculated due dates (trigger function)
- 7 prospects seeded: Proofpoint, Nscale, SEALSQ, Illumio, PostHog, Stord, StarTree
- Auto-tracking hook in `create-gmail-draft.js` — every sent email auto-inserts
- Follow-up monitor cron checks Gmail for replies, creates HIGH alerts when overdue
- `check_follow_ups` tool — Kiko can query and report follow-up status

### Scheduled Email Sending ✅

- `kiko_scheduled_emails` table
- `schedule-email.js` API endpoint
- `scheduled-sender.js` cron — every 5min, sends via Gmail API with correct sender + signature
- Auto-tracks sent emails in `kiko_follow_ups`
- UI: Clock button in EmailDraft with 3 sections:
  - Quick options: In 1hr, Tomorrow 9am/2pm, Monday 9am
  - Recipient timezone optimum: US East/West, UK, CET, Middle East, Asia Pacific
  - Custom date/time picker with native datetime-local input

### Email Fixes ✅

- **Body blank:** `renderBody()` regex `.replace(/---.*​/s, '')` stripped everything — fixed with safe `indexOf`
- **Subject/To undefined:** Made stateful with `useEffect` sync during streaming
- **Memory tools hanging:** `update_kiko_preference`, `learning_save`, `master_brief_digest` changed to fire-and-forget
- **Team-members called 9x:** Cached check prevents re-fetch
- **Draft speed:** Simple drafts (re-engagement, follow-up) use Haiku (\~12s vs 22-37s Sonnet)
- **Display names:** "Matt Smith [matt.smith@vanhawke.agency](mailto:matt.smith@vanhawke.agency)" in recipient inbox (all paths: drafts, scheduled, campaigns)
- **Send-to-drafts 400:** Subject/To now stateful with useEffect sync

### Chat Sidebar ✅

- **Rename:** Dispatches `kiko-chat-updated` event, ChatHistory listens and reloads
- **Click-into-other-chats:** `loadConversation` now queries `conversations.messages` JSONB (was querying non-existent `messages` table)

### Proactive Intelligence Engine ✅

- `monitors/proactive-intel.js` — runs 2x daily (8am + 2pm)
- Scans: F1 deals, sponsor exits, new GPs, funding rounds, CMO hires, competitor agencies, eyewear launches, viral campaigns, business building
- Self-discovery: finds NEW competitors not on the list
- Multi-lens analysis: CFO/CCO/psychologist/strategist/legal
- Cross-references with CRM pipeline
- Creates `proactive_intel` alerts on Command Centre
- First scan found: Cadillac F1 $55-70M open seat, Omni AI $120M Series C, Kering/Google smart glasses, D&G x Ray-Ban

### Competitive Research Domains ✅ (8 Van Hawke domains in learning director)

1. `vh_agency_competitive` — CAA, WME, Octagon, CSM, Wasserman, Excel Sports + self-discovery
2. `vh_f1_deal_intel` — F1 grid deals, sponsor entries/exits, valuations
3. `vh_prospect_intel` — Funding signals, CMO hires, budget indicators
4. `vh_agency_positioning` — Messaging, differentiation, zero-budget growth
5. `vh_business_building` — Zero to global agency, CEO biographies, bootstrap strategies
6. `vh_marketing_playbook` — Viral campaigns, LinkedIn, social, content, PR
7. `vh_maison_competitive` — JMM, Gentle Monster, Mykita, EssilorLuxottica + self-discovery
8. `vh_maison_marketing` — Fashion campaigns, celebrity seeding, DTC, zero-budget launch

### Kiko Awareness ✅

- Full memory architecture documented (62 tables, 4,500+ entries)
- 7 mandatory cross-referencing rules
- Autonomous expertise switching (CFO/CCO/GC/CTO/psychologist)
- Proactive advisory rules (push recommendations, challenge assumptions)
- Deep query tools: `query_relationships`, `query_thought_journal`, `query_conversation_insights`
- `check_follow_ups`, `check_scheduled_emails`, `generate_document` tools

### Document Generation Pipeline ✅ (partially working)

- `api/generate-document.js` — research (Haiku) → structure (Sonnet 8000 tokens) → branded HTML/PPTX
- Van Hawke brand system: purple `#7C5CFC`, dark `#0A0A0C`, teal `#00D4AA`, Inter font
- First document generated successfully (24KB branded HTML)
- PPTX via pptxgenjs (installed on Hetzner)
- **ISSUE:** JSON truncation on long structure responses — robust repair added but needs testing
- **ISSUE:** Total generation time \~150s (research 53s + structure 97s) — needs optimization

### UI Fixes ✅

- **Wrong day greeting:** `getGreeting()` uses fresh `new Date()` for both day and hash
- **Background tasks icon:** Changed to activity pulse zigzag (was rectangle-with-lines)
- **Nav centering:** CSS grid with `auto 1fr auto` columns, links `justify-self: center`
- **Content alignment:** `marginLeft: -14px` when sidebar collapsed to center on viewport
- **Dynamic timezone:** Browser Intl API sends timezone + locale with every request
- **Email reply detection:** Reduced from 15min to 2min polling

### Infrastructure ✅

- ALL 62 frontend fetch() calls migrated to `https://api.vanhawke.agency/api/`
- Wildcard Express route handler with nested path support
- Webhook route BEFORE wildcard handler
- `kiko_memories` URL encoding for Cloudflare WAF
- Model migration: `claude-sonnet-4-6` across all files

---

## DATABASE — KEY TABLES

### Core CRM
| Table | Entries | Purpose |
|-------|---------|---------|
| deals | 308 | Pipeline deals |
| contacts | 4,991+ | Contact records with job titles |
| companies | 2,232+ | Company records with industries |
| conversations | — | Chat history (messages in JSONB column) |

### Kiko Memory (62 kiko_* tables, key ones)
| Table | Entries | Loaded into prompt? | Has tool? |
|-------|---------|-------------------|-----------|
| kiko_personal_context | 486 | ✅ | — |
| kiko_conversation_insights | 1,591 | ✅ (last 5) | ✅ query_conversation_insights |
| kiko_memories | 1,431 | ✅ | ✅ manage_knowledge |
| kiko_learning_log | 433 | — | ✅ learning_save |
| kiko_thought_journal | 196 | ✅ | ✅ query_thought_journal |
| kiko_relationships | 94 | ✅ (outreach) | ✅ query_relationships |
| kiko_knowledge | 31+ | ✅ (top 10) | ✅ manage_knowledge |
| kiko_learned_rules | 43 active | ✅ | ✅ update via tools |
| kiko_preferences | 8 | ✅ | ✅ update_kiko_preference |
| kiko_follow_ups | 7+ | — | ✅ check_follow_ups |
| kiko_scheduled_emails | 4+ | — | ✅ check_scheduled_emails |
| kiko_alerts | many | ✅ (morning brief) | ✅ via proactive intel |
| kiko_core_bible | 1 | ✅ | — |
| kiko_user_profiles | 1 | ✅ | — |
| kiko_email_style_reference | 16 | — (outreach agent) | — |
| kiko_skills | 35 | — | — |
| ai_memory | 153 | — | — |
| kiko_meta_learning | 2 | — | — |

### Email Infrastructure
| Table | Purpose |
|-------|---------|
| user_tokens | Google OAuth refresh tokens per user |
| kiko_follow_ups | Auto-tracks sent emails, 5-day reply window, status tracking |
| kiko_scheduled_emails | Queued emails with scheduled_for timestamp |

---

## WHAT'S PENDING (prioritized)

### Priority 1 — Fix
1. **Homepage alignment** — Nav grid centering deployed but user says nothing changed. May need hard refresh or further CSS investigation. Nav uses CSS grid `auto 1fr auto`, content has `marginLeft: -14` offset when sidebar collapsed.
2. **Document generation speed** — Total ~150s (research 53s + structure 97s). Needs optimization. JSON truncation repair added but not fully tested with PPTX.
3. **Email draft still ~22s for complex drafts** — Simple drafts use Haiku (~12s). Complex drafts (Sonnet) still ~22s. Fundamental Claude thinking time.

### Priority 2 — Build
4. **Brand asset library** — No logos, fonts, or brand guidelines uploaded. Document generation uses hardcoded colors but no actual Van Hawke logo files. Need: logo PNG/SVG, colour palette confirmation, font files.
5. **ChatGPT conversation re-import** — User has been talking more with ChatGPT. Import pipeline exists in Knowledge Library. Needs export + upload.
6. **Van Hawke Maison competitive domains** — Added to curriculum but not yet researched (will populate over next 3-4 nights via learning director cron).

### Priority 3 — Future
7. **Google Cloud Pub/Sub** — Webhook endpoint built (`api/gmail-webhook.js`) but blocked by Workspace domain-restricted sharing policy. 2-minute polling as workaround.
8. **Meeting transcription** — Parked. BlackHole + Whisper approach designed but not built.
9. **Full Vercel elimination** — Serve frontend from Hetzner.
10. **SponsorSignal LinkedIn posting system**

---

## OPERATING RULES (from user preferences)

### Email/Messaging
- NEVER include sponsorship pricing in early-stage outreach
- NEVER use generic openings ("I hope this note finds you well")
- All messaging must be direct, corporate, specific
- Always use "intelligent age" NOT "AI generation"
- Always use "Cultural Performance Eyewear" for Van Hawke Maison
- Never reference "secured funding" with prospects
- Always use USD, never GBP
- Emails under 150 words, no attachments until reply

### Output Style
- Deliverables first, commentary second
- Jump straight to output without meta-commentary
- If asked to "tighten," cut 25-40%

### Strategic Advisor Mode
- Brutally honest, direct, high-IQ reasoning
- Start with the hard truth, follow with specific actionable steps
- End with a direct challenge or assignment

### Brand Language
- Display names: "Sunny Sidhu" / "Matt Smith" (not email usernames)
- Email domain: @vanhawke.agency (not @vanhawke.com)
- DISPLAY_NAMES mapping in: EmailDraft.jsx, create-gmail-draft.js, scheduled-sender.js, cron-sequence-sender.js

---

## VERIFIED WORKING (as of end of session)

| System | Status | Last verified |
|--------|--------|--------------|
| Kiko Chat API | ✅ 200 | April 24 |
| Reasoning engine | ✅ 1.7s | April 24 |
| Team members | ✅ 200 | April 24 |
| Webhook status | ✅ 200 | April 24 |
| Selfcheck | ✅ 200 | April 24 |
| Pipeline notifications | ✅ 200 | April 24 |
| Partnership matrix | ✅ 200 | April 24 |
| Sequence sender | ✅ 200 | April 24 |
| Reply detection | ✅ 200 | April 24 |
| Follow-up monitor | ✅ 7 checked | April 24 |
| Scheduled sender | ✅ Email sent | April 24 |
| Proactive intel | ✅ 5 alerts | April 24 |
| Email draft (simple) | ✅ ~12s Haiku | April 24 |
| Document generation | ⚠️ Works but slow (150s) | April 24 |
| Error log | ✅ EMPTY | April 24 |
