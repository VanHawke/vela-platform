# VELA PLATFORM BRIEF — DEFINITIVE STATE
## Last updated: March 25, 2026

---

## SYSTEM OVERVIEW

Vela Platform is a Kiko-powered intelligence operating system for Van Hawke Group.
Kiko is not a chatbot — she is an AI Chief of Staff with 23 specialist agents,
12 automated cron jobs, 9 intelligence tables, and a learning loop that evolves
with every interaction.

**Stack**: Vercel (serverless) + Supabase (92 tables) + Claude API (Haiku/Sonnet/Opus)
**Frontend**: React + Vite, 16 pages, dark glassmorphism UI
**MCP Integrations**: Gmail, Google Calendar, Supabase
**Deploy**: `npx vercel --prod --yes --force` from `/Users/sunny/Desktop/vela-platform/`
**GitHub**: VanHawke/vela-platform
**Live URL**: https://vela-platform-one.vercel.app
**Supabase**: project dwiywqeleyckzcxbwrlb, org 35975d96-c2c9-4b6c-b4d4-bb947ae817d5

---

## KIKO INTELLIGENCE ARCHITECTURE (Phases 0-19)

### Foundation (Phases 0-5)
- Navigation: deterministic 0.2s, Kiko persists across page changes
- Intent classifier: Haiku-based, 21 categories, 12/12 correct
- 23 specialist agents, all data-backed with parallel Supabase queries
- Screen reader: live data per page, not stale cache

### Intelligence (Phases 6-7)
- General intelligence: Claude answers ANY question with full tool access
- CRM context injection: pipeline, tasks, activity, recent decisions
- Web search via MCP for current events and research

### Learning (Phases 8-9)
- Every strategy/deal/negotiation decision logged to kiko_learning_log
- Strategy + Negotiation agents reference past decisions before reasoning
- Pattern: "Similar to Cloudflare which you priced at $12M"

### Synthesised Brief (Phase 10)
- "Brief me" → Chief of Staff narrative, not data dump
- Identifies convergence moments across all data sources
- Includes calendar events, inbox triage, pending draft actions

### Proactive Intelligence (Phase 11)
- Daily 7am cron cross-references 5 data streams
- Writes convergence alerts to kiko_alerts
- Sends Gmail notification for high-severity alerts
- Creates draft actions alongside alerts

### Memory Synthesis (Phase 12)
- Weekly distillation of decision patterns from learning_log
- 6 active preferences: tech bias, category conflict avoidance, hierarchical prioritisation, $10-15M target tier, definitive language, overweight software in uncertainty
- Injected into ALL agent prompts

### Autonomous Drafts (Phase 14)
- Proactive engine prepares actions alongside alerts
- KikoInsights widget shows pending actions with approve/dismiss buttons
- Brief offers: "Say approve to execute"

### User Voice Profile (Phase 15)
- 49 sent emails analysed via Sonnet (6 dimensions)
- Profile: formal, direct, commanding authority
- Signature phrases + avoided phrases captured
- Draft instructions injected into all agents
- Weekly refresh, $0.05/run

### Edit Delta Learning (Phase 16)
- Tracks AI-drafted emails vs sent versions
- Haiku analyses style corrections
- Deltas feed back into profile synthesis
- Gets sharper with every email edit

### Relationship Intelligence (Phase 17)
- Gmail network scan: 79 contacts mapped
- Warmth scores (0-1), relationship types, email frequency
- Injected into outreach context before email drafts

### Output Tracking (Phase 18)
- Every agent output logged: agent, intent, message, preview
- Quality measurement over time
- Feeds into preference synthesis

### Thought Journal (Phase 19)
- Strategic insights persist across sessions
- Entities indexed for cross-reference
- Strategy Agent reads relevant past reasoning

### Quick Wins
- Calendar in morning brief: auto-fetches Google Calendar events
- Email notifications: Gmail alert for high-severity convergences
- Draft action approval widget: approve/dismiss on home page

### Features
- Meeting Prep: hourly cron, enriches attendees, generates Haiku prep
- Inbox Triage: 7:15am daily, classifies emails, surfaces ACTION_REQUIRED
- Conversation Memory: extracts key facts/decisions/open threads per conversation, injects into next session

### PENDING: Voice (Phase 13)
- GPT-4o voice mode broken — fabricates data
- Plan: Pipecat + Claude + Deepgram STT + Cartesia TTS
- Voice wraps same /api/kiko endpoint
- 3-4 hour dedicated session needed

---

## 23 SPECIALIST AGENTS

| Agent | File | Lines | What |
|---|---|---|---|
| intent-classifier | intent-classifier.js | 119 | Haiku classifier, 21 categories, deterministic nav |
| navigator | navigator.js | 156 | Page navigation with alias matching |
| ea | ea.js | 212 | 10-source morning brief + calendar + inbox triage |
| screen-reader | screen-reader.js | 142 | Live Supabase queries per page |
| strategy | strategy.js | 202 | 7 parallel sources + thought journal |
| deal | deal.js | 153 | Deal management with stage context |
| outreach | outreach.js | 143 | Email drafting + recipient style + draft tracking |
| content | content.js | 106 | LinkedIn/content with news + sponsors |
| negotiation | negotiation.js | 134 | Power mapping + outreach engagement |
| pricing | pricing.js | 76 | Company enrichment + partnership landscape |
| investment | investment.js | 76 | Pipeline data + activity context |
| category-control | category-control.js | 90 | F1 sponsorship category gaps |
| data | data.js | 396 | CRM search (contacts, companies, deals, tasks) |
| memory-engine | memory-engine.js | 176 | Mem0 cross-session memory |
| document | document.js | 103 | Knowledge library + vector search |
| finance | finance.js | 109 | Financial analysis |
| legal | legal.js | 57 | Legal review |
| dispute | dispute.js | 58 | Dispute resolution |
| signal | signal.js | 31 | Market signal detection |
| travel | travel.js | 41 | Travel planning |
| product-dev | product-dev.js | 34 | Product development |
| ip | ip.js | 31 | IP strategy |
| website | website.js | 26 | Website analysis |


---

## 12 AUTOMATED CRON JOBS

| Time | File | What |
|---|---|---|
| Every hour | cron-meeting-prep.js | Calendar scan → attendee enrichment → prep brief |
| 4am Sunday | cron-profile-synthesis.js | 50 sent emails → 6-dimension voice profile |
| 5am Sunday | cron-relationship-intel.js | Gmail network scan → 79 warmth scores |
| 6am Sunday | cron-preference-synthesis.js | Learning log → 6 decision preferences |
| 6am Sunday | cron-document-scan.js | Knowledge library scan |
| 6am Monday | cron-enrich.js | Contact/company enrichment |
| 7am Monday | cron-partnership-scan.js | F1 partnership matrix |
| 7am Mon-Fri | cron-proactive.js | 5-stream convergence + email alerts + drafts |
| 7:15am Mon-Fri | cron-inbox-triage.js | Unread email classification |
| 8am Mon-Fri | news-agent.js | News scraping |
| 9am Monday | cron-outreach-score.js | Outreach scoring |
| 10pm Mon-Fri | cron-edit-delta.js | Draft vs sent comparison |


---

## INTELLIGENCE TABLES

| Table | What |
|---|---|
| kiko_learning_log | Decision history (8 entries) |
| kiko_preferences | Distilled patterns (6 active) |
| kiko_user_profiles | Voice profile from 49 emails |
| kiko_relationships | 79 contacts, warmth scores |
| kiko_thought_journal | Strategic reasoning threads |
| kiko_output_tracking | Agent output quality measurement |
| kiko_draft_actions | Pending approval actions |
| kiko_draft_tracking | AI draft vs sent comparison |
| kiko_meeting_prep | Auto-generated meeting briefs |
| kiko_inbox_triage | Daily email classification |
| kiko_conversation_insights | Cross-session memory |
| kiko_alerts | Convergence alerts (84 active) |

---

## INFRASTRUCTURE

- **Supabase**: dwiywqeleyckzcxbwrlb (92 tables, RLS on all kiko_ tables)
- **Vercel**: vela-platform-one.vercel.app, Pro plan
- **GitHub**: VanHawke/vela-platform (main branch)
- **Local**: /Users/sunny/Desktop/vela-platform/
- **Deploy**: npx vercel --prod --yes --force
- **Auth**: Supabase implicit flow, user 9f486437-4bf5-4111-abfe-fe19bfa76063
- **Models**: Haiku (classifier, crons), Sonnet (agents), Opus (deep strategy)
- **MCP**: Gmail, Google Calendar, Supabase
- **Cost**: ~$35-50/month Vercel, ~$0.50/month intelligence crons

---

*File: VELA_PLATFORM_BRIEF.md | Last updated: March 25, 2026*
