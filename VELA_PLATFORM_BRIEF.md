# Vela Platform — Development Brief
## Prepared: 19 March 2026 | For: Continued AI-assisted development

---

## 1. Platform Overview

**Vela** is an AI-native SaaS operating platform built for Van Hawke Group — an F1/Formula E sponsorship advisory firm led by Sunny Sidhu (CEO), based in Weybridge, UK. The platform functions as a single command centre for commercial intelligence, CRM, outreach, and pipeline management, with Kiko (Claude-powered AI) as the primary operating interface.

**Live URL:** https://vela-platform-one.vercel.app  
**Repository:** github.com/VanHawke/vela-platform  
**Local codebase:** `/Users/sunny/Desktop/vela-platform/` (authoritative)  
**Stack:** React/Vite (frontend) · Vercel serverless (API) · Supabase/Postgres (database) · Claude Sonnet/Haiku (AI) · OpenAI Realtime (voice)  
**Supabase project:** `dwiywqeleyckzcxbwrlb` · org_id `35975d96-c2c9-4b6c-b4d4-bb947ae817d5`  
**User:** sunny@vanhawke.com · user_id `9f486437-4bf5-4111-abfe-fe19bfa76063` · role: super_admin  
**Deploy command:** `cd /Users/sunny/Desktop/vela-platform && npx vercel --prod --yes`

---

## 2. Architecture

```
Frontend (React/Vite)
├── src/pages/         — All page components
├── src/components/    — Shared components incl. Kiko chat + voice
└── public/            — Static assets (logos etc)

Backend (Vercel Serverless — /api/)
├── kiko.js            — PRIMARY: Kiko AI handler (Claude Sonnet → Opus, SSE streaming)
├── kiko-tools.js      — Tool registry: 20+ tools (CRM, email, calendar, news, etc)
├── kiko-followup.js   — Follow-up email generation
├── kiko-calendar.js   — Google Calendar integration
├── news-agent.js      — RSS feed aggregator + Haiku classifier
├── email.js           — Gmail sync + operations
├── email-intelligence.js — Email relationship scoring
├── cron-outreach-score.js — Weekly outreach pattern analysis
├── cron-partnership-scan.js — Weekly F1 partnership intelligence
└── voice.js           — OpenAI Realtime API (WebRTC voice mode)

Database (Supabase)
├── contacts, companies, deals — CRM (Pipedrive-imported)
├── emails, email_scores, outreach_scores — Email intelligence
├── news_articles — RSS feed cache (2,014 articles)
├── f1_partnerships, f1_teams, sponsor_categories — Partnership matrix
├── kiko_alerts, kiko_memories, conversations — Kiko state
├── pipelines, followup_queue — Pipeline management
└── documents, document_chunks — Knowledge library
```

---

## 3. Key Features Built

### 3.1 Kiko AI (Core)
- **Text mode:** Claude Opus (upgraded from Sonnet today) with SSE streaming, tool-use loop (max 8 rounds), Mem0 cross-session memory, page-aware context injection
- **Voice mode:** OpenAI GPT-4o Realtime via WebRTC, keyword wake detection ("Hey Kiko"), passive/active/off modes, transcript pane
- **Tools (20+):** search_contacts, search_companies, search_deals, get_entity_detail, search_emails, get_email_thread, draft_email, get_email_analytics, get_outreach_intelligence, get_calendar, create_calendar_event, get_stale_contacts, generate_followup, get_recipient_style, get_news, get_partnership_matrix, get_pipeline_notifications, navigate_page, search_documents, web_search, memory

### 3.2 CRM
- 5,006 contacts, 2,243 companies, 308 deals (imported from Pipedrive)
- Lemlist webhook integration for campaign activity sync
- Contact enrichment: job titles, company industries, funding intelligence
- Pipeline kanban board with drag-to-stage, Supabase-backed pipelines table
- Dynamic pipeline manager: add/delete/reorder/hide pipelines via dropdown

### 3.3 Email Intelligence
- Gmail sync via Google OAuth (email.js → Supabase cache)
- Outreach scoring: `cron-outreach-score.js` runs Monday 9am, scores sent emails against replies, classifies messaging approach/CTA type/persona via Claude Sonnet, writes to `outreach_scores` table
- Outreach Intelligence page (`/email`): reply rates, best messaging approach, best send day, company timeline — currently 12 emails scored
- Relationship scoring: `email_scores` table (134 rows) — staleness, momentum, health scores per contact
- Follow-up generation: `generate_followup()` in `kiko-followup.js` — pulls thread bodies from Gmail, analyses recipient writing style, uses outreach pattern data to calibrate draft

### 3.4 News & Market Intelligence
- 24 RSS feeds + Google News per-team queries
- `team-news-scraper` Supabase Edge Function: scrapes 8 F1 team websites
- Haiku classification: category, relevance score, deal signal detection, partnership auto-detection
- News page: card grid, featured deal signals row, time window filter
- **Cron schedule (post-cost-optimisation):** Mon–Fri only — team scraper 7am, news-agent 8am

### 3.5 Commercial Calendar
- C1 layout: 55/45 split, compact grid + detail pane
- F1 2026 (22 rounds, verified) + Formula E S12 (17 rounds, verified)
- Cell colouring: F1 weekends red, Formula E blue, outreach windows amber
- Detail pane: event card, outreach nudge (14–21 days before F1 race), this-month checklist, next-up countdown
- Official F1 and Formula E logos (from public assets)

### 3.6 F1 Partnership Matrix
- All 11 F1 teams × sponsor categories
- Auto-updated when news agent detects partnership announcements
- Gap analysis: identifies empty sponsorship slots per team per category
- Kiko-queryable: "which teams have no cybersecurity partner?"

### 3.7 Knowledge Library
- Document upload (PDF, DOCX, PPTX)
- OpenAI text-embedding-3-small vectorisation → pgvector semantic search
- Kiko uses `search_documents` before drafting any outreach

---

## 4. Cost Optimisation (Done)

Original bill trajectory: ~$200/month. Root cause: duplicate Supabase pg_cron hitting `/api/news-agent` 12×/day.

**Changes made:**
- Deleted duplicate `news-agent-sync` Supabase cron (was running every 2h)
- All news/enrichment crons restricted to Mon–Fri or Monday-only
- `cron-enrich`, `cron-outreach-score` → Monday only
- `cron-partnership-scan` → Monday only
- Team scraper → Mon–Fri 7am only
- Removed 5 dead one-time functions from vercel.json config
- Reduced maxDuration on non-AI functions (email 60→30s, calendar 60→20s, etc)

**Projected bill:** ~$35–50/month

---

## 5. The Current Problem: Kiko Email Access

### 5.1 What Should Work
When a user asks Kiko "tell me about the emails from BigBear.ai", Kiko should:
1. Search Gmail via the `search_emails` tool
2. Return the actual thread subjects, dates, people, and content
3. Offer to pull the full thread or draft a reply

This is confirmed to work at the **API level** — direct test calls to `/api/kiko` return correct Gmail data:
```
Thread 1 — BigBear.ai x Formula One — Jan–Feb 2026
Grace, Ryan, Alex — 4 emails (22 Jan → 5 Feb → 28 Jan → 16 Feb)
Thread 2 — BigBear.ai & Alpine F1 — Oct 2025
Matt Smith, Grace, Tori, Ryan — 3 emails
```

### 5.2 What Actually Happens
Kiko responds with something like:
> "I'm sorry, I don't have direct access to your personal emails or private communications. I can help if you tell me about the content..."

Or:
> "I can't actually see your emails or any private content..."

### 5.3 Root Cause
**Claude's base safety training overrides the system prompt on email access claims.**

This is not a bug in the code — the Gmail integration works perfectly. The problem is that Claude Sonnet (now Opus) has deeply embedded safety training that treats "access emails" as a privacy-sensitive action requiring refusal, regardless of:
- System prompt instructions
- Forbidden phrase lists
- Tool definitions
- Priming injections
- Injected tool_use/tool_result exchanges in message history

Every approach tried that involves Claude *deciding* to call the email tool has failed.

### 5.4 Approaches Tried (All Failed)
1. **System prompt with forbidden phrases** — overridden by safety training
2. **Priming injection** (fake tool_use/tool_result in messages[]) — Anthropic validates tool IDs, caused broken state
3. **Poison filter** (stripping prior refusals from history) — correct but insufficient alone
4. **Pre-fetched data in system prompt** — Claude ignores it and still refuses
5. **Pre-fetched data as completed tool exchanges in messages[]** — Claude still refuses when formulating response

### 5.5 Current Approach (Partially Working)
**Email shortcut path** in `kiko.js`: Detects email triggers server-side, calls `search_emails` directly via `executeTool()`, passes raw data to a clean Haiku call with no system prompt — just `"Here is Gmail data, answer this question"`. Haiku has no email safety context.

**Status:** The Haiku email shortcut is deployed but has not been confirmed working in the live UI yet. The model has been switched to Claude Opus 4.6 today.

### 5.6 What Needs Testing
With Opus + the email shortcut:
1. Open a **fresh Kiko conversation** (critical — poisoned history in old conversations)
2. Ask: "Tell me about the emails from BigBear.ai"
3. Expected: Should see "Searching emails..." then actual Gmail results via Haiku formatting

### 5.7 If Still Failing — Next Steps
If Opus also refuses, the email shortcut Haiku path should have caught it before Opus sees it. If that's also failing, check:
- Whether `isEmailQuery` trigger detection is matching the phrase
- Whether `executeTool('search_emails', ...)` is returning valid data (test separately)
- Whether the Haiku formatting call is completing before the `return`

The nuclear option if all else fails: **build a separate `/api/kiko-email` endpoint** that only handles email queries, with no AI identity whatsoever — pure data retrieval + formatting — and route email queries from the frontend to that endpoint instead of `/api/kiko`.

---

## 6. Pending Work

### High Priority
- [ ] Confirm email shortcut works with Opus in fresh conversation
- [ ] Auth fix: `AuthCallback.jsx` PKCE race condition (login flow unreliable)
- [ ] Pipeline manager dropdown: verify formatting consistent across browsers

### Medium Priority  
- [ ] Outreach Intelligence: surface relationship health scores on contact profiles
- [ ] Cancel Pipedrive subscription (CRM confirmed working in Vela)
- [ ] Set Vercel $50/month spend cap (protect against cost spikes)

### Low Priority
- [ ] Remove dead email client backend (email.js, cron-email-sync.js, email-intelligence.js are unused since inbox was replaced by Outreach Intelligence page)
- [ ] git config user.name/email for cleaner commit history

---

## 7. Environment Variables (Vercel)

```
VITE_SUPABASE_URL=https://dwiywqeleyckzcxbwrlb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ANTHROPIC_KEY=sk-ant-...
OPENAI_KEY=sk-...
MEM0_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## 8. Key Files Reference

| File | Purpose |
|------|---------|
| `api/kiko.js` | Core Kiko handler — model, system prompt, tool loop, email shortcut |
| `api/kiko-tools.js` | All tool definitions + executors (664 lines) |
| `api/kiko-followup.js` | Follow-up email generation with recipient style analysis |
| `src/components/kiko/KikoVoice.jsx` | OpenAI Realtime voice mode |
| `src/pages/CommercialCalendar.jsx` | C1 calendar with F1/FE data |
| `src/pages/Pipeline.jsx` | Kanban + PipelineManager dropdown |
| `src/pages/OutreachIntelligence.jsx` | Email outreach analytics page |
| `vercel.json` | Cron schedules + function duration limits |

---

## 9. Standing Instructions for AI Assistants

- **Deliverables first**, commentary only if asked
- **Before touching any file:** confirm it's the right file, read the section to be changed
- **Build test before deploy:** `npm run build` must pass with zero errors
- **Only changed files in git:** verify with `git diff --name-only` before committing
- **Deploy:** `cd /Users/sunny/Desktop/vela-platform && npx vercel --prod --yes`
- **Never touch:** Kiko voice, sidebar/layout, auth, unless explicitly asked
- **All financials in USD**
- **Font:** DM Sans via `var(--font)` — never hardcode font strings
- **Colours:** platform tokens from `index.css` — `var(--text)`, `var(--border)`, `var(--surface)`, etc
