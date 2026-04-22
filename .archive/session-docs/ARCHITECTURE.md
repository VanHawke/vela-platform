# KIKO INTELLIGENCE OS — ARCHITECTURE

## Last updated: 2026-04-17

---

## STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, deployed on Vercel |
| Styling | Inline CSS + CSS files (Legora design system) |
| Backend API | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL) — project `dwiywqeleyckzcxbwrlb` |
| AI Engine | Anthropic Claude (Sonnet 4) via streaming SSE |
| Voice | OpenAI GPT-4o Realtime (WebRTC) + gpt-4o-mini-tts (previews) |
| Cron Worker | Hetzner CX23 VPS ($4.99/mo) — PM2 + node-cron |
| Auth | Supabase Auth (Google OAuth, implicit flow) |
| Email | Gmail API (OAuth tokens stored in `user_tokens`) |
| Calendar | Google Calendar API (read + write) |

---

## INFRASTRUCTURE

### Vercel (Frontend + API)
- **URL**: https://kiko.vanhawke.agency
- **Project ID**: `prj_FTFkM1ihtLecxn0Nt0dDcTRt0cMa`
- **Plan**: Pro ($20/mo base)
- **Deploy**: `git push origin main` auto-deploys
- **NEVER**: Use `--force` or `VERCEL_FORCE_NO_BUILD_CACHE=1`

### Hetzner (Cron Worker + LinkedIn)
- **Host**: kiko-server, 178.104.73.22
- **SSH**: `ssh root@178.104.73.22` (key auth via `~/.ssh/id_ed25519`)
- **Process**: PM2 → kiko-worker (48 cron schedules)
- **Worker path**: `/home/kiko/kiko-worker/`
- **Cost**: $4.99/mo flat (no per-execution cost)

### Supabase (Database)
- **Project**: `dwiywqeleyckzcxbwrlb`
- **Org ID**: `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`
- **RLS**: Enabled on all 12 critical tables
- **Tables**: deals, contacts, companies, tasks, activities, conversations, user_settings, kiko_alerts, kiko_sequences, kiko_sequence_enrollments, campaign_targets, contact_activities, kiko_knowledge

---

## KEY DIRECTORIES

```
/Users/sunny/Desktop/vela-platform/
├── api/                    # Vercel serverless functions
│   ├── kiko.js             # ⚠ RING-FENCED — Main AI engine
│   ├── kiko-tools.js       # ⚠ RING-FENCED — Tool definitions + execution
│   ├── kiko-self-knowledge.js  # Capability map + Bible loader
│   ├── kiko-health.js      # Health check endpoint
│   ├── calendar-events.js  # Google Calendar read + write
│   ├── google-token.js     # OAuth token management + auto-refresh
│   ├── voice-preview.js    # TTS preview for settings
│   ├── cron-knowledge-seed.js  # Autonomous research engine
│   └── cron-*.js           # 20+ cron endpoint files
├── src/
│   ├── components/
│   │   ├── kiko/
│   │   │   ├── KikoChat.jsx      # Main chat interface
│   │   │   ├── KikoFloat.jsx     # Floating panel + FAB
│   │   │   ├── KikoVoice.jsx     # GPT-4o Realtime WebRTC
│   │   │   ├── KikoWaveform.jsx  # Waveform visualization
│   │   │   ├── EmailDraft.jsx    # Email draft detection + rendering
│   │   │   ├── ChatHistory.jsx   # Conversation history sidebar
│   │   │   └── NotificationToast.jsx  # Realtime Supabase notifications
│   │   ├── layout/
│   │   │   ├── Layout.jsx        # Main layout wrapper
│   │   │   ├── LegoraTopNav.jsx  # Top navigation bar
│   │   │   └── PageHeader.jsx    # Reusable page header
│   │   ├── settings/
│   │   │   └── Settings.jsx      # All settings tabs
│   │   └── ui/
│   │       └── Toast.jsx         # App-wide toast notifications
│   ├── pages/
│   │   ├── Pipeline.jsx          # Deal management
│   │   ├── CommercialCalendar.jsx # Calendar + race schedule
│   │   ├── OutreachIntelligence.jsx  # Command Centre
│   │   ├── Contacts.jsx          # CRM contacts
│   │   └── Sequences.jsx         # Campaign sequences
│   ├── contexts/
│   │   └── OrgContext.jsx        # Organization context provider
│   └── lib/
│       ├── supabase.js           # Supabase client
│       ├── theme.js              # Legora design tokens
│       └── buildVoiceInstructions.js  # Voice session prompt builder
├── kiko-worker/
│   └── src/
│       └── cron-scheduler.js     # 48 cron schedules for Hetzner
├── tests/
│   ├── api-smoke.spec.js         # API endpoint tests
│   ├── rls-verification.spec.js  # RLS data isolation tests
│   └── build-smoke.spec.js       # Build verification tests
├── KIKO_BIBLE.md                 # Persistent knowledge document
├── ARCHITECTURE.md               # This file
└── vercel.json                   # Vercel config (0 crons)
```

---

## DATA ISOLATION (RLS)

| Table | Isolation Level | Policy |
|-------|----------------|--------|
| conversations | User-level | `auth.uid() = user_id` |
| user_settings | User-level | `auth.uid() = user_id` |
| kiko_alerts | User-level | `auth.uid() = user_id` |
| deals | Org-level | `org_id` match via `organization_members` |
| contacts | Org-level | Same |
| companies | Org-level | Same |
| tasks | Org-level | Same |
| activities | Org-level | Same |
| campaign_targets | Org-level | Same |
| contact_activities | Org-level | Same |
| kiko_sequences | Org-level | Same |
| kiko_sequence_enrollments | Org-level | Same |
| kiko_knowledge | System-level | No RLS (shared research) |

---

## AI ENGINE (api/kiko.js)

### System Prompt Architecture
```
Base Identity (You are Kiko...)
  + Expertise Domains (15 legal/finance/sports areas)
  + Platform Knowledge (all pages + functions)
  + Proactive Research Protocol
  + Routing Table (29 tools → 19 agents)
  + Style Rules
  + KIKO_BIBLE.md (persistent knowledge)
  + Research Knowledge Base (kiko_knowledge table)
  + Page Role (context-dependent behavior)
  + Entity Context (selected item data)
  + User Identity + Memory
```

### Tool Routing
| Tool | Purpose |
|------|---------|
| ask_deal_agent | CRM writes (move deal, create task) |
| ask_data_agent | CRM reads + campaign engine (37 operations) |
| ask_outreach_agent | Email drafting via Gmail |
| ask_legal_agent | Legal/contract analysis |
| ask_finance_agent | Financial modelling |
| ask_strategy_agent | Strategic advisory |
| ask_negotiation_agent | Negotiation tactics |
| web_search | Deep web research (5-8 searches) |
| read_calendar | Google Calendar read + create_event |
| read_email | Gmail inbox reading |
| manage_knowledge | Knowledge CRUD + agent creation |

### Knowledge Layers
1. **Training data** — Claude's base knowledge (law, finance, etc.)
2. **KIKO_BIBLE.md** — Loaded from disk every conversation
3. **kiko_knowledge table** — Auto-researched daily (15 domains)
4. **manage_knowledge saves** — User-triggered knowledge persistence
5. **Conversation memory** — kiko_memories table

---

## CRON SCHEDULE (Hetzner, 48 jobs)

### Daily Intelligence (2am-9am UK)
| Time | Job | Purpose |
|------|-----|---------|
| 2:00 | competitive-intel | Competitor scanning |
| 3:00 | learning-director | Synthesise yesterday's learnings |
| 3:30-3:50 | knowledge-seed ×5 | Research 15 domains (3 per batch) |
| 4:00 | profile-synthesis, job-cleanup | User profile + cleanup |
| 4:30 | company-enrich | Deep research on CRM companies |
| 5:00 | ingest-knowledge, score-companies, relationship-intel, partnership-verify | Bulk processing |
| 6:00 | enrich, document-scan, pref-synthesis | Contact enrichment |
| 7:00 | partnership-scan, proactive, meeting-prep | Weekday intelligence |
| 7:30-8:00 | morning-intel, news-agent, news-classify | Morning briefing |
| 8:30-9:00 | task-executor, outreach-score | Action execution |

### Continuous (business hours)
| Schedule | Job | Purpose |
|----------|-----|---------|
| Every hour 6-22 weekdays | seq-sender | Campaign email sending |
| Every 15 min 8-19 weekdays | jobs-worker | Background job processing |
| Every 4 hours weekdays | reply-detect | Email reply scanning |
| 3× daily weekdays | selfcheck | System health monitoring |

---

## DESIGN SYSTEM (LEGORA)

```css
--bg: #FEFEFC;          --bg-card: #FFFFFF;
--bg-tinted: #F5F4F1;   --bg-list: #FAFAF7;
--text: #0A0A0A;         --text-dim: #6B6B6B;
--text-faint: #A0A0A0;   --accent: #0A0A0A;
--border: rgba(0,0,0,0.08);
--r-cta: 4px;   --r-card: 10px;   --r-pill: 24px;
--f1: #b8643e;  --fe: #5a6644;
```
- **Display font**: Source Serif 4, weight 300
- **Body font**: Inter, weight 450
- **No purple**, no dark glass, no heavy shadows

---

## OPERATIONAL RULES

1. **Ring-fence**: NEVER modify `api/kiko.js`, `api/kiko-tools.js`, `src/contexts/` without explicit permission
2. **Deploy**: `git push` auto-deploys. NEVER `--force` or cache busting
3. **Batch pushes**: Minimize Vercel build minutes ($0.10/push)
4. **TDZ rule**: Before any `const X = ...` referencing `Y`, confirm Y declared EARLIER
5. **Pre-commit hook**: Active at `.git/hooks/pre-commit` (TDZ checker)
6. **Hetzner deploys**: `scp` file → `ssh` restart pm2

---

## USERS

| User | Email | Role | Sees |
|------|-------|------|------|
| Sunny Sidhu | sunny@vanhawke.com | super_admin | Everything |
| Matt | matt@... | user | Profile + Navigation settings, own calendar, shared CRM |

---

## COSTS (monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Pro | ~$20-30 | Base + build minutes (batch pushes) |
| Hetzner CX23 | $4.99 | 48 crons + LinkedIn worker |
| Supabase | Free tier | Under limits |
| Anthropic API | Usage-based | ~$20-50 depending on usage |
| OpenAI (voice) | Usage-based | TTS previews + Realtime |
| **Total** | **~$65-105/mo** | |
