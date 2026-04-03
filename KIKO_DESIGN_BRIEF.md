# KIKO INTELLIGENCE OS — COMPLETE DESIGN BRIEF
# For use in Cowork/Claude Code UI design sessions
# Last updated: 2 April 2026

---

## WHAT IS KIKO

Kiko is a commercial AI operating system built for Van Hawke Group — a London-based company operating across three entities: Van Hawke Agency (F1/Formula E sponsorship advisory), Van Hawke Maison (luxury eyewear), and Van Hawke Group (IP studio/holding company). Kiko serves as the company's executive operating partner — a single AI brain that handles commercial intelligence, outreach, pipeline management, email drafting, calendar awareness, and strategic recommendations.

Kiko is NOT a chatbot. She is NOT an assistant. She is an opinionated, self-improving operating system with a persistent personality, accumulated strategic positions, and closed-loop feedback mechanisms that make her better with every interaction. She has 24 identity entries that define her communication style, market opinions, and behavioral principles. She states positions with conviction and challenges the user when their approach contradicts her intelligence.

The platform is live at https://vela-platform-one.vercel.app ("Vela" is the internal codename — never user-facing. Kiko is the product name).

---

## WHO USES IT

Primary user: Sunny Sidhu, CEO of Van Hawke Group. Based in Weybridge, UK. Works at board level across sport, fashion, and technology. The platform is designed for a single power user (with multi-user architecture ready for team expansion).

---

## TECH STACK

- **Frontend:** React 18 + Vite, deployed on Vercel
- **Backend:** Vercel serverless functions (Node.js)
- **Database:** Supabase (PostgreSQL) with pgvector for semantic search
- **AI Models:** Claude Sonnet 4 (primary brain), Claude Haiku 4.5 (lightweight tasks like email rewrite, classification), Claude Opus (deep analysis with extended thinking)
- **Voice:** GPT-4o Realtime (voice mode — operational)
- **External APIs:** Gmail (OAuth, read/write/draft), Google Calendar, Lemlist (outreach campaigns)
- **Bundle:** 670KB main chunk + lazy-loaded page chunks (11 pages code-split via React.lazy)

---

## APPROVED DESIGN DIRECTION

### Core Aesthetic
- **Dark ambient void:** Background #0A0A0C (near-black)
- **Gradient orbs:** Purple #7C5CFC to teal #00D4AA, rendered as ambient aurora behind content
- **Glassmorphism:** Frosted glass panels with `backdrop-filter: blur()`, ultra-thin borders at 4-6% white opacity
- **Typography:** DM Sans, 300-weight (light), letterSpacing: -0.03em
- **No harsh edges:** Everything rounded, soft, atmospheric

### Color Tokens
- Background: #0A0A0C
- Surface: rgba(255,255,255,0.04)
- Surface hover: rgba(255,255,255,0.06)
- Border: rgba(255,255,255,0.08)
- Text primary: rgba(255,255,255,0.95)
- Text secondary: rgba(255,255,255,0.55)
- Text tertiary: rgba(255,255,255,0.32)
- Accent purple: #7C5CFC
- Accent teal: #00D4AA
- F1 red: #E10600
- Formula E blue: #0055CC
- MotoGP red: #BE1621
- WEC green: #00875A
- Amber (outreach windows): #F59E0B

---

## PAGES & NAVIGATION

### Top Navigation Bar
Centered nav with content area (not viewport-width). Items: Home | Command Centre | Pipeline | Partnership Matrix | More ▾ (dropdown: Calendar, Organisations, Contacts, Lemlist, KikoCode, Settings). Van Hawke logo top-left (white, acts as white-label slot). Search icon + user avatar top-right.

### Page-by-Page Breakdown

#### 1. HOME (/) — KikoChat
The primary interface. Full-screen chat with Kiko.
- **Greeting:** "Good morning, Sunny" (40px, time-aware) + "What would you like to work on?" (16px subtitle)
- **Kiko Waveform:** Purple double-sided soundwave avatar (canvas-rendered, gaussian envelope, independent up/down bars). Sits above the greeting. 900×100px in voice mode.
- **Prompt bar:** Full-width textarea (64px height on homepage, 44px in chat mode). Paperclip attachment button left, microphone + EQ voice toggle + send arrow right.
- **Action chips:** 3 context-aware single-line chips below prompt (e.g., "131 alerts ›", "9 overdue tasks", "2 stale deals", "Brief me")
- **Chat messages:** User messages right-aligned (dark surface), Kiko messages left-aligned with "Kiko" label in teal. Thinking collapsed as "Kiko's reasoning · N steps" (expandable).
- **EmailDraft frame:** When Kiko drafts an email, it renders in a glass-bordered frame with: Subject line (bold), To field, body paragraphs (1.7 line-height). Below the frame: tone CTAs ("More Direct" | "Warmer Tone" | "Shorter") on the left, "Send to Gmail" button on the right. After sending: button turns green "Draft saved". After rewrite: "↩ Revert" button appears.
- **KikoFloat:** Floating action button (bottom-right on all pages except Home). Circle with waveform inside. Green glow aura when voice active. Click opens chat panel overlay. Voice mode: EQ button toggles on/off (red stop square when active), prompt bar stays visible.

#### 2. COMMAND CENTRE (/command-centre) — OutreachIntelligence
The intelligence dashboard. Shows outreach readiness, race proximity, pipeline health.
- **Race card:** Series selector tabs (F1 | Formula E | MotoGP | WEC). Each shows next upcoming race with countdown (e.g., "17d — 6 Hours of Imola"). Color-coded per series.
- **Outreach intelligence panels:** Focus modes — patterns (reply rates by approach), timing (best send days/hours), race_windows (next 6 races + stale deals needing contact).
- **Alert feed:** Recent convergence alerts from the proactive cron.

#### 3. PIPELINE (/pipeline)
Kanban board showing deal flow.
- **Columns:** To Revisit (20) | Contact Made (11) | In Dialogue (3) | Qualified (4) | Meeting Arranged (0)
- **Deal cards:** Company name, contact name, industry tag (e.g., "Haas F1" or "Alpine F1"), last activity timestamp with staleness indicator (orange if >30d, red if >90d)
- **Drag and drop:** Cards move between columns, updates Supabase in real-time
- **Filters:** "Show closed" checkbox, pipeline selector dropdown ("All")
- **Header:** "Deal Pipeline" title + "38 active deals" subtitle

#### 4. PARTNERSHIP MATRIX (/partnership-matrix)
F1 team sponsor tracking grid.
- Shows which companies sponsor which F1 teams
- Auto-scanned daily from news + team websites
- 389 partnerships tracked
- Identifies gaps (unsponsored categories per team)

#### 5. COMMERCIAL CALENDAR (/calendar)
Full month-view calendar with 4 motorsport series.
- **Grid:** Monday-Sunday columns, 6 rows. Day cells show race pills (color-coded: F1 red, FE blue, MotoGP dark red, WEC green) and outreach window dots (amber).
- **Toggle buttons:** F1 19 | Formula E 11 | MotoGP 16 | WEC 8 (remaining race counts). Each toggleable on/off.
- **Detail pane (right 45%):** Selected date events, month events list, "Next Up" countdown section showing upcoming races across all series with days remaining.
- **Legend:** F1 weekend | Formula E | MotoGP | WEC | Outreach window
- **Navigation:** ‹ › month arrows, "Today" button, "17d next race" indicator

#### 6. ORGANISATIONS (/organisations)
Company directory with enriched intelligence.
- 2,243 companies
- Shows company cards with industry, contact count, deal status
- 17 companies have structured intelligence (funding, revenue, leadership, sponsorship fit score)

#### 7. CONTACTS (/contacts + /contacts/:id)
Contact directory and individual contact detail pages.
- 5,006 contacts with job titles, companies, email, engagement history
- Contact detail: full history, linked deals, communication timeline

#### 8. SETTINGS (/settings)
User preferences, integrations, team management.

#### 9. ADMIN (/admin) — Super admin only
System health, user management, cron status.

#### 10. MEMORY CONSOLE (/memory) — Admin only
View Kiko's learning log, preferences, identity entries, conversation insights.

#### 11. KIKOCODE (/kikocode)
Code review and technical workspace.

---

## KIKO'S INTELLIGENCE SYSTEMS

### 1. News Intelligence (75 RSS feeds, processes daily at 8am)
**Categories:** F1/motorsport (Formula1.com, Motorsport.com, RaceFans, Autosport), F1 sponsorship (per-team Google News queries for Haas/Alpine/Ferrari/McLaren/Mercedes/Red Bull), business publications (Forbes, TechCrunch, Reuters, CNBC, Wired, VentureBeat, MIT Tech Review), paywalled headline capture (Bloomberg, FT, WSJ, The Times via Google News), VC/PE/funding (Crunchbase, GlobeNewsWire, PRN), marketing/advertising (AdAge, The Drum, Campaign, Digiday, Marketing Week), psychology/behavioral (HBR, Psychology Today, BehavioralEconomics.com), design/creative (Creative Review, Dezeen, It's Nice That), sector intelligence (cybersecurity, cloud, AI, semiconductors), leadership moves (CMO/CTO/CEO appointments).

### 2. Company Enrichment (weekly + on-demand)
Sonnet + web_search enriches pipeline companies with 30 structured fields: funding (total/round/date/amount), revenue estimate, employee count/growth, leadership (CEO/CTO/CMO/CFO/VP Marketing/VP Engineering), industry/sub_sector/business_model, key products, competitors, recent acquisitions, existing sponsorships, marketing budget signal, brand awareness signal, sponsorship fit score (0-100). Currently 17 companies enriched. User can say "Kiko, enrich Datadog" for on-demand enrichment.

### 3. Proactive Alerts (daily at 7am)
Cross-references 6 data streams: news signals, outreach replies, deal stage changes, overdue tasks, stale deals, race calendar proximity. Haiku identifies convergence moments — where multiple signals point at the same company. Creates alerts with severity (high/medium/low) and specific recommended actions. Sends email notification for high-severity alerts.

### 4. Email Quality Feedback Loop
When Kiko drafts an email → user edits and sends from Gmail → edit-delta cron (10pm nightly) compares original vs sent → Haiku extracts style lessons → lessons saved to kiko_draft_tracking and kiko_learning_log → next email draft has lessons injected into system prompt → Kiko applies corrections. Compounding improvement.

### 5. Outreach Outcome Tracking
Outreach scoring cron (Monday 9am) classifies sent emails by messaging approach (authority-led, scarcity-led, data-led, etc.), CTA type, persona seniority, effectiveness score. Tracks replies vs silence. Reply rates by approach injected into email drafting prompt — Kiko favours what works.

### 6. Predictive Behavior Engine
Cialdini's 6 principles (reciprocity, scarcity, authority, social proof, commitment/consistency, liking) hardcoded into outreach system prompt, mapped to deal stages: Cold → Authority + Reciprocity. Follow-up → Social Proof + Scarcity. In Dialogue → Commitment + Liking. Qualified → Scarcity + Authority. Stale → Pattern interrupt. Timing psychology: Tue-Thu 8-10am, post-funding 48hr window, pre-race 14-21 days, 72hr follow-up spacing.

### 7. Deal Attribution (daily at 10:30pm)
Tracks deal stage changes, correlates with Kiko's actions (emails sent, alerts created, enrichment done). Builds attribution: "This deal moved because of THAT Kiko action." Impact data fed back into system prompt — Kiko knows what works.

### 8. People Verification (weekly)
Web-searches pipeline contacts for role changes, departures. Creates alerts: "DEPARTED: [Name] has LEFT [Company]. Now at [New Company]." Flags stale contacts for replacement.

### 9. Pipeline Hygiene (weekly)
Flags deals >90 days inactive as ARCHIVE CANDIDATES. Warns on 30-89 day stale deals with escalating severity. Recommends specific actions.

### 10. Race Calendar Intelligence
61 races across 4 series (F1: 22, Formula E: 12, MotoGP: 19, WEC: 8). Integrated into proactive alerts (urgency tinting), outreach timing (pre-race windows), and the Commercial Calendar page.

### 11. Kiko Identity (24 persistent entries)
Strategic positions: "Authority-led outreach outperforms data-led for C-suite", "Cybersecurity F1 category approaching saturation", "$500M-$5B revenue companies are the sweet spot". Communication style: "2 paragraphs max, specific time ask, no generic filler". Market opinions: "AI/cloud is highest-probability F1 category for 2026-2027". Self-awareness: "I am most valuable when I surface convergence — multi-signal intelligence, not single-signal noise."

---

## DATABASE TABLES (key ones)

| Table | Records | Purpose |
|-------|---------|---------|
| deals | 308 | Pipeline deals with stage, company, contact, status |
| contacts | 5,006 | People with job titles, emails, companies |
| companies | 2,243 | Company profiles |
| company_intelligence | 17 | Structured enrichment (funding, leadership, competitors) |
| race_calendar | 61 | F1/FE/MotoGP/WEC race dates |
| kiko_identity | 24 | Persistent personality entries |
| kiko_learning_log | 186 | Accumulated facts and decisions |
| kiko_alerts | 158 | Convergence alerts |
| kiko_draft_tracking | 2 | Email draft tracking for edit-delta learning |
| kiko_deal_attribution | NEW | Closed-loop deal progression tracking |
| outreach_scores | 27 | Email classification + outcome tracking |
| news_articles | 2,858+ | Ingested articles from 75 feeds |
| partnerships | 389 | F1 team sponsor relationships |
| conversations | 183 | Chat history with semantic embeddings |
| kiko_preferences | 10 | User behavior patterns |

---

## CRON SCHEDULE (30 automated jobs)

| Time | Job | What it does |
|------|-----|-------------|
| Every 30min | health-check | Platform health monitoring |
| Hourly | meeting-prep | Auto-generate meeting briefs |
| 3am daily | learning-director | Curriculum-based knowledge acquisition |
| 7am Mon-Fri | partnership-scan | Detect new F1 sponsor announcements |
| 7am Mon-Fri | proactive | 6-stream cross-reference → convergence alerts |
| 7:15am Mon-Fri | inbox-triage | Classify incoming emails |
| 7:30am Mon-Fri | morning-intelligence | Generate morning briefing |
| 8am Mon-Fri | news-agent | Fetch + classify 75 RSS feeds |
| 9am Monday | outreach-score | Classify sent emails, track replies |
| 10pm Mon-Fri | edit-delta | Compare email drafts vs sent versions |
| 10:30pm Mon-Fri | deal-attribution | Correlate deal progression with Kiko actions |
| Sun 4am | profile-synthesis | Synthesize user communication profile |
| Sun 4:30am | company-enrich | Enrich 4 pipeline companies |
| Sun 5am | partnership-verify, relationship-intel | Verify partnerships, score relationships |
| Sun 5:30am | people-verify | Detect contact role changes/departures |
| Sun 6am | preference-synthesis, document-scan | Synthesize preferences, scan documents |
| Sun 6:30am | pipeline-hygiene | Flag stale deals, suggest archival |
| Sun 7pm | weekly-report | Comprehensive weekly intelligence report |

---

## KEY COMPONENTS (React)

| Component | Location | Purpose |
|-----------|----------|---------|
| KikoChat | src/components/kiko/KikoChat.jsx | Main chat interface, thinking collapse, email detection |
| EmailDraft | src/components/kiko/EmailDraft.jsx | Email frame with tone CTAs + Gmail integration |
| KikoWaveform | src/components/kiko/KikoWaveform.jsx | Canvas-rendered purple soundwave avatar |
| KikoFloat | src/components/kiko/KikoFloat.jsx | Floating assistant button + chat panel |
| KikoVoice | src/components/kiko/KikoVoice.jsx | Voice mode interface |
| Layout | src/components/layout/Layout.jsx | Nav, header, green listening pill |
| LoginPage | src/components/auth/LoginPage.jsx | Frosted glass login |
| Pipeline | src/pages/Pipeline.jsx | Kanban deal board |
| CommercialCalendar | src/pages/CommercialCalendar.jsx | 4-series race calendar |
| OutreachIntelligence | src/pages/OutreachIntelligence.jsx | Command Centre dashboard |
| PartnershipMatrix | src/pages/PartnershipMatrix.jsx | F1 sponsor tracking grid |
| Organisations | src/pages/Organisations.jsx | Company directory |
| Contacts | src/pages/Contacts.jsx | Contact directory |

---

## KIKO'S PERSONALITY & VOICE

Kiko is an executive operating partner, not an assistant. She operates at CFO/CRO/COO/CMO/Chief of Staff level. She:
- States positions with conviction ("Authority-led messaging outperforms. Use it.")
- Challenges the user when approaches contradict her intelligence
- References her own impact ("My alert on Fortinet's funding led to the stage change last week")
- Uses Sunny's language patterns: "At this level", "In practice", "Where organisations engage"
- Never hedges with "I think" or "maybe"
- Keeps emails to 2 paragraphs, ends with specific time asks
- Never uses "I hope this finds you well", "circle back", or generic filler
- All financials in USD
- Signs emails as "Sunny Sidhu, CEO, Van Hawke Group" from sunny@vanhawke.agency

---

## BRAND GUIDELINES

- **Van Hawke** logo: Top-left of navigation. White text on dark background. Acts as white-label slot — any company deploying Kiko puts their own logo there.
- **"Kiko"** is the product, the platform, the AI, and the OS. One unified identity. Never separate "platform" from "assistant."
- **"Vela"** is internal codename only (repo name, Supabase project, Vercel project). Never user-facing.
- **"Kiko Intelligence OS"** is the full product name. "Kiko" for short.
- The platform uses "intelligent age" not "AI generation" in brand materials.
- Van Hawke Maison defines "Cultural Performance Eyewear" — never standalone "performance."

---

## DESIGN PRINCIPLES

1. **Dark-first:** The void (#0A0A0C) is the canvas. Content floats on it. No white backgrounds anywhere.
2. **Glass over gradients:** Panels are frosted glass with subtle blur. Background aurora gradients bleed through.
3. **Information density:** This is a power-user tool. Dense data is welcome. No excessive whitespace or card-based layouts that waste screen real estate.
4. **Minimal chrome:** Ultra-thin borders (1-1.5px at 8% opacity). No drop shadows. No bevels.
5. **Typography carries weight:** 300-weight DM Sans for body, 500-weight for emphasis. -0.03em letter spacing. Large greeting text (40px), small metadata (10-12px).
6. **Color means something:** Red = F1/urgency. Blue = Formula E. Green = WEC/success. Purple = Kiko/accent. Teal = secondary accent. Amber = outreach windows. Don't use color decoratively.
7. **Motion is subtle:** No bouncing, no slide-in animations. Fade transitions (150ms). Waveform is the only complex animation.
8. **Mobile-aware:** All pages must work on mobile. Chat interface is primary mobile use case.

---

## WHAT NEEDS DESIGN WORK

The current UI is functional but not fully polished to the approved glassmorphism aesthetic. Key areas:
1. **Homepage/Chat** — The aurora background and greeting are working. The chat messages, prompt bar, and action chips need full glass treatment.
2. **Pipeline Kanban** — Functional but visually basic. Needs glass cards, better staleness indicators, drag handles.
3. **Command Centre** — Race cards work but the overall layout needs the dashboard treatment — glass panels, data density, proper information hierarchy.
4. **Commercial Calendar** — Working with 4 series. Could benefit from richer cell design, smoother interactions.
5. **Navigation** — Current nav works but could be elevated with glass blur, better active states, mobile hamburger.
6. **EmailDraft frame** — Functional glass frame. Could be refined — typography, spacing, button styling.
7. **KikoFloat** — The FAB works. Panel design needs glass treatment.
8. **Login page** — Has frosted glass left panel + Kiko vortex right. Solid foundation.
9. **Settings/Admin** — Basic. Low priority for design.

---

END OF BRIEF
