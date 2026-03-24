# KIKO AGENT ARCHITECTURE — DEFINITIVE SPECIFICATION
# Last updated: 2026-03-24
# Status: APPROVED — Build from this document

## OVERVIEW

Kiko is not a chatbot. Kiko is an AI operating system for Van Hawke Group.
She manages deals, runs operations, protects capital, generates content, and advises on strategy.

Architecture: 1 Execution Controller + 1 Memory Engine + 21 Specialist Agents across 6 layers.

Everything routes through Kiko Prime. No agent talks to the user directly.
All 35 skills stay. All 47 tools stay. All memory stays. This is a restructuring, not a rebuild.

---

## LAYER 1 — ORCHESTRATION

### 1. KIKO PRIME (Execution Controller)
**File:** `api/kiko.js` (rewrite)
**Model:** claude-opus-4-6
**Purpose:** Receives every message. Routes to agents. Stitches responses. Manages identity.

Capabilities:
- Task routing across agents (single or multi-agent calls)
- Dependency management (what must happen before what)
- Priority control (revenue > admin > cosmetic)
- State tracking (in progress, blocked, complete)
- Escalation logic (when to surface to Sunny vs handle autonomously)
- Personality, voice, greeting logic
- Conversation flow and context threading

Does NOT: Execute tools directly. Generate content. Search data. Make decisions.

### 2. MEMORY & CONTEXT ENGINE
**File:** `api/agents/memory-engine.js`
**Model:** claude-haiku-4-5-20251001 (fast, cheap, always-on)
**Purpose:** Persistent intelligence layer. Links everything to everything.

Stores and retrieves:
- Deal memory (every interaction, objection, timing signal, decision dynamic)
- Contact memory (preferences, communication style, response patterns, relationship history)
- Negotiation memory (concessions made, anchors set, pressure points identified)
- Writing style memory (Sunny's voice patterns, phrase preferences, formatting habits)
- Objection library (what was said, what worked, what didn't)
- Timing intelligence (when contacts respond, budget cycles, decision windows)

Cross-links:
- Emails ↔ CRM records ↔ Documents ↔ Tasks ↔ Calendar events
- Contact ↔ Company ↔ Deal ↔ Outreach history

**This is the moat.** Every interaction compounds. No competitor can replicate 12 months of accumulated deal intelligence.

---

## LAYER 2 — REVENUE ENGINE

### 3. DEAL AGENT
**File:** `api/agents/deal-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Every write operation to the CRM.

Owns:
- Create/update/close deals
- Move deal stages (valid stages: To revisit, Contact made, Qualified, In Dialogue, Meeting arranged, Proposal Sent, Negotiation, Verbal Agreement, Contract Review)
- Create/complete/delete tasks
- Update contacts (title, email, phone, company, notes)
- Add companies to CRM
- Log activities
- Pipeline mutations

Tools: create_deal, update_deal_stage, create_task, update_contact, search_deals, search_contacts, search_companies, log_activity

Zero hallucination tolerance. Strict confirmation patterns. Always confirms before destructive actions.


### 4. OUTREACH AGENT
**File:** `api/agents/outreach-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Everything that generates outbound messaging.

Owns:
- Email drafts (Gmail via MCP)
- LinkedIn messages
- 5-touch authority sequences (no repetition across touches)
- Persona adaptation (CEO/CFO/CMO/CRO/CTO tone shifts)
- Objection anticipation in messaging
- Lemlist campaign management (add leads, list campaigns)
- Re-engagement sequences for stale deals

Skills loaded: outbound_engine, persona_adaptation, email_writing_mastery, persuasion_psychology, behavioural_psychology, objection_handling
Tools: draft_email, send_email, lemlist_add_lead, lemlist_list_campaigns, lemlist_get_activities

Commercial doctrine enforced: No pricing in first touch. No pleasantries. Authority tone. Scarcity framing. Board-level language.


### 5. NEGOTIATION AGENT
**File:** `api/agents/negotiation-agent.js`
**Model:** claude-opus-4-6 (needs highest reasoning)
**Purpose:** Protects margin and deal value during active negotiations.

Owns:
- Concession control (what to give, what to hold, what to trade)
- Anchoring strategy (set the frame before the number)
- Counter-positioning (respond to lowball offers, reframe value)
- Silence strategy (when NOT to respond)
- Deal pressure timing (create urgency without desperation)
- Walk-away analysis (when the deal isn't worth closing)
- Multi-party negotiation mapping (who influences whom)

Skills loaded: negotiation_psychology, deal_structuring_engine, behavioural_psychology, persuasion_psychology
Memory dependency: Must access negotiation history from Memory Engine (past concessions, anchors, objections).

This agent is called during live deal discussions. Not for prospecting — for closing.


### 6. CATEGORY CONTROL AGENT
**File:** `api/agents/category-control-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Pricing power through enforced scarcity.

Owns:
- Track available sponsorship categories per team (F1 + FE)
- Enforce "one partner per category" — no exceptions
- Detect exclusivity conflicts before they happen
- Prevent unbundling (assets sold as closed system only)
- Align categories to high-value sectors
- Maintain sponsor landscape database (current F1/FE sponsors by team)
- Category pricing intelligence (benchmarks by tier)

Skills loaded: category_inventory_control, brand_doctrine
Tools: web_search (for current sponsor landscape verification)

Called before any proposal or pricing discussion. "Is this category open? What's it worth? Who else is looking?"

---

## LAYER 3 — INTELLIGENCE

### 7. DATA AGENT
**File:** `api/agents/data-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Reads and analyses CRM data without changing it.

Owns:
- Pipeline analytics (weighted value, velocity, stage distribution)
- Contact/company search and enrichment
- Deal forecasting (probability × value × time)
- Conversion rate tracking (stage-to-stage)
- Stale deal detection and alerting
- Activity history analysis
- Lead scoring and ranking
- Concentration risk flagging (>40% pipeline in one deal)

Skills loaded: crm_intelligence_engine, pipeline_forecasting, data_layer_strategy, financial_analysis
Tools: search_deals, search_contacts, search_companies, get_pipeline_stats, get_outreach_scores


### 8. RESEARCH AGENT (exists — api/kiko-research.js)
**File:** `api/kiko-research.js` (already built)
**Model:** 3× claude-sonnet-4-20250514 parallel + 1× synthesis
**Purpose:** Deep multi-source intelligence gathering.

Owns:
- Company intelligence (revenue, funding, hiring, expansion signals)
- Competitor sponsorship tracking
- Market mapping (by sector, revenue band, geography)
- Sponsor fit scoring (6-dimension, 0-100)
- White space analysis (open categories per team)
- News signal analysis

Skills loaded: target_intelligence_engine, sponsor_fit_scoring, competitive_intelligence, category_inventory_control, predictive_outreach
Tools: web_search (native), search_deals, search_contacts, search_companies


### 9. SIGNAL DETECTION AGENT
**File:** `api/agents/signal-agent.js`
**Model:** claude-haiku-4-5-20251001 (runs on cron, needs speed)
**Purpose:** Continuous feed into Deal Origination. Detects actionable triggers.

Detects:
- Funding events (Series A-D, IPO prep, mega-rounds)
- Hiring spikes (>20% headcount growth, CMO/CRO appointments)
- Expansion signals (new markets, new offices, new products)
- Leadership changes (new CEO, new board members)
- Competitor sponsorship changes (entries, exits, renewals)
- Budget cycle timing (fiscal year-end, Q4 planning windows)
- Partnership announcements (adjacent deals that signal intent)

Feeds: Deal Agent (new opportunities), Outreach Agent (re-engagement triggers), Data Agent (enrichment updates)
Schedule: Daily 7am UK via Supabase Edge Function (extends existing news-agent pattern)


### 10. STRATEGY AGENT (Decision Engine)
**File:** `api/agents/strategy-agent.js`
**Model:** claude-opus-4-6 (highest reasoning required)
**Purpose:** Replaces fragmented thinking with decisive calls.

Owns:
- "Should we pursue this company?" → PURSUE / MONITOR / KILL
- "Where is leverage?" → Calendar, competitive, scarcity, authority, timing
- "Kill or continue?" → Objective criteria, not hope
- "Time vs value trade-off" → Expected value ÷ time investment
- Capital allocation logic (which entity gets resource priority)
- Portfolio-level thinking (Van Hawke Agency vs Maison vs Group Inc.)
- Board-level framing (CFO/CEO/CMO lens per decision)

Skills loaded: executive_decision_support, stakeholder_mapping, deal_qualification, deal_structuring_engine, category_framing_engine, investor_relations, financial_strategy

NOT a summariser. Delivers verdicts. "Here is what I would do and why."

---

## LAYER 4 — GOVERNANCE

### 11. LEGAL AGENT
**File:** `api/agents/legal-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** First-pass risk filter. NOT legal advice — risk flagging.

Owns:
- Contract review (flags problematic clauses, does not advise)
- Clause comparison (termination, exclusivity, liability, IP, non-compete)
- Risk summaries (high/medium/low per contract section)
- Jurisdiction awareness (UK, US, Qatar, Saudi, UAE differences)
- Obligation tracking (deadlines, deliverables, renewal dates)
- Exposure monitoring (what are we committed to, what could go wrong)

Skills loaded: legal_commercial, legal_finance_property

Always includes: "This is not legal advice. Consult a solicitor for binding decisions."


### 12. DISPUTE AGENT
**File:** `api/agents/dispute-agent.js`
**Model:** claude-opus-4-6
**Purpose:** Protects position in active disputes. Currently: tenancy, CDDA.

Owns:
- Procedural response building (correct format, correct timing)
- Tone discipline (professional, measured, no admissions)
- Leverage tracking (what we hold, what they hold)
- Admission avoidance (flags language that could be used against us)
- Escalation timing (when to respond, when to wait, when to escalate)
- Evidence organisation (what supports our position, gaps to fill)
- Counter-argument preparation

Skills loaded: legal_commercial, legal_finance_property, negotiation_psychology
Memory dependency: Must track full dispute timeline from Memory Engine.


### 13. FINANCE AGENT
**File:** `api/agents/finance-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Keeps the business solvent and controlled.

Owns:
- Cash flow tracking (actual vs projected)
- Revenue forecasting (pipeline → revenue conversion rates)
- Cost tracking (marketing, travel, ops, API costs, SaaS)
- Runway awareness ("at current burn, we have X months")
- Invoice tracking and payment status
- Entity-level P&L (Agency vs Maison vs Group Inc.)
- Monthly financial summary generation

Skills loaded: financial_strategy, financial_analysis
All figures in USD.


### 14. INVESTMENT / CAPITAL STRATEGY AGENT
**File:** `api/agents/investment-agent.js`
**Model:** claude-opus-4-6
**Purpose:** Supports Van Hawke Maison raises + future capital events.

Owns:
- Valuation logic (comparable analysis, DCF, revenue multiples)
- Investor narrative construction
- Raise strategy (timing, amount, instrument, terms)
- Dilution modelling (pre/post money, option pool, follow-on rounds)
- Return scenarios (bull/base/bear)
- Pitch deck narrative alignment
- Due diligence preparation

Skills loaded: investor_relations, financial_strategy, van_hawke_maison
Currently active for: Van Hawke Maison pre-seed ($500K, Archive 01 + Haas collaboration)


### 15. PRICING & ROI AGENT
**File:** `api/agents/pricing-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Defends pricing in negotiations. Builds ROI cases.

Owns:
- Sponsorship pricing benchmarks (Title $25-60M, Primary $8-20M, Supplier $1-5M)
- ROI modelling per prospect:
  - Pipeline value (enterprise access × deal size × win rate)
  - Enterprise access value (hospitality events × avg relationship value)
  - Brand equity value (media equivalent, reach, audience demographics)
- Scenario modelling (conservative / base / optimistic)
- Value-in-kind vs cash structuring
- Competitive pricing intelligence (what other teams charge)

Skills loaded: deal_structuring_engine, financial_analysis, category_inventory_control

---

## LAYER 5 — EXECUTION

### 16. NAVIGATOR AGENT
**File:** `api/agents/navigator-agent.js`
**Model:** claude-haiku-4-5-20251001 (fast, deterministic)
**Purpose:** The only agent that understands the Vela platform UI.

Owns:
- Page navigation (22 pages: home, pipeline, contacts, organisations, email, calendar, documents, tasks, settings, news, partnership-matrix, lemlist, kikocode, admin, memory, dashboard, deals, companies)
- Screen description ("what's on screen" → reads pageContext → describes visible data)
- Opening specific records by name ("show me Decagon" → navigates to org page + filters)
- Platform explanation ("what does this page do")
- Page-to-page routing ("take me to pipeline then show me stale deals")

Has: Complete hardcoded map of every page — layout, data fields, available actions.
Tools: navigate_page (returns navigation instruction to frontend)

Why separate: Needs dense platform map that changes with every UI update. Isolating = one file to update when pages change.


### 17. EXECUTIVE ASSISTANT AGENT
**File:** `api/agents/ea-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Removes cognitive load. Runs Sunny's day.

Owns:
- Calendar control (via MCP Google Calendar — schedule, reschedule, conflict detection)
- Prioritisation (revenue-impact ranking of all outstanding items)
- Smart reminders (tied to deal value, not arbitrary)
- Email triage (flag urgent, categorise, draft responses in Sunny's voice)
- Task consolidation (merge duplicate tasks, surface forgotten follow-ups)
- Morning brief generation (top 3 priorities across pipeline, email, calendar)
- End-of-day summary (what happened, what didn't, what's tomorrow)

Tools: MCP Gmail, MCP Google Calendar, create_task, search_deals, get_alerts
Skills loaded: email_writing_mastery, platform_knowledge

This agent should feel like a Chief of Staff who knows the business.


### 18. TRAVEL & LOGISTICS AGENT
**File:** `api/agents/travel-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Reduces friction for F1/FE calendar + business travel.

Owns:
- Travel planning (flights, hotels, ground transport)
- Cost optimisation (compare options, flag expensive outliers)
- Visa and documentation tracking (UK passport, Qatar, Saudi, UAE, Japan)
- Event alignment (race calendar sync — pre-race arrival, post-race departure)
- Hospitality logistics (paddock access, team hospitality coordination)
- F1/FE calendar integration (2026 race schedule, Formula E Season 12)

Tools: web_search, MCP Google Calendar
Data: race_calendar table (Supabase), F1 2026 + FE Season 12 schedules


### 19. DOCUMENT AGENT
**File:** `api/agents/document-agent.js` (wraps existing `api/generate-doc.js`)
**Model:** claude-sonnet-4-20250514
**Purpose:** Creates structured files from data. Deterministic formatting.

Owns:
- Docx generation (proposals, one-pagers, reports, memos)
- Xlsx generation (pipeline exports, financial models, contact lists)
- Pptx generation (pitch decks, presentation slides)
- CSV generation (data exports, Lemlist imports)
- DALL-E image generation (brand assets, concept art)
- QR code generation
- URL content reading and summarisation
- Pipeline and contacts export to file

Tools: generate_docx, generate_xlsx, generate_pptx, generate_csv, generate_image, generate_qr, read_url, export_pipeline, export_contacts
Dependencies: docx, exceljs, qrcode, openai (DALL-E)

Different execution model from conversational agents — takes structured input, produces a file, returns download URL.

---

## LAYER 6 — BRAND & PRODUCT

### 20. CONTENT AGENT
**File:** `api/agents/content-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Generates authority content + manages distribution.

Owns:
- LinkedIn thought leadership (personal + Van Hawke company page)
- SponsorSignal posts (structured format: headline, signals, move of week, viewpoint, CTA)
- Newsletter content
- Content calendar (aligned to F1/FE race events)
- Case study creation (real and synthetic scenarios)
- Brand narrative consistency enforcement
- Industry insight pieces

Skills loaded: content_authority, marketing_strategy, brand_doctrine, van_hawke_agency, van_hawke_maison

Van Hawke Viewpoint section included by default. Board-level language. No hashtag spam.


### 21. WEBSITE & PRODUCT AGENT
**File:** `api/agents/website-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Manages Van Hawke digital presence + conversion.

Owns:
- Site structure and content management
- Landing page copy and optimisation
- Conversion flow design (visitor → contact → qualified lead)
- Case study integration (deal narratives → web content)
- SEO fundamentals (meta, structure, internal linking)
- Credibility assets (testimonials, logos, press mentions)

Future: Integrates with Vela platform for real-time content updates.


### 22. PRODUCT DEVELOPMENT AGENT (Van Hawke Maison)
**File:** `api/agents/product-dev-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Manages eyewear product lifecycle.

Owns:
- Drop schedule management (Archive 01 → future archives)
- Timeline tracking (design → prototyping → production → launch)
- Supplier coordination (materials, manufacturing partners)
- Margin tracking (COGS vs retail price vs wholesale)
- Production cycle management
- Formula E collaboration drops (Mexico, Jeddah, Berlin, Monaco, Tokyo)
- Frame types: Hero, Access, Gen4 Hero

Skills loaded: van_hawke_maison
Key team: Giacomo (Lead Product Designer), Temi (Visual Director)


### 23. IP & LICENSING AGENT
**File:** `api/agents/ip-agent.js`
**Model:** claude-sonnet-4-20250514
**Purpose:** Manages IP portfolio + licensing opportunities.

Owns:
- Licensing opportunity identification
- IP acquisition evaluation
- Licensing deal structuring (royalty rates, territories, exclusivity)
- IP portfolio tracking (trademarks, designs, copyrights)
- Dormant IP identification (brands to acquire, license, revive)

Aligns with: Micro-ABG Model under Van Hawke Group Inc.

---

## ROUTING MATRIX

| User says | Prime routes to | Agent(s) respond |
|---|---|---|
| "What am I looking at?" | Navigator | Describes page + visible data |
| "Take me to pipeline" | Navigator | Navigates, confirms |
| "Move Decagon to Qualified" | Deal | Updates stage, logs, confirms |
| "Add task: call Ryan in 2 days" | Deal | Creates task with due date |
| "Draft email to CFO at Torq" | Outreach + Data | Data finds contact, Outreach drafts in CFO tone |
| "Score Nordic as a target" | Research | 6-dimension scoring with web search |
| "What's our weighted pipeline?" | Data | Calculates and reports |
| "Should we pursue Cloudflare?" | Strategy + Research | Research scores, Strategy delivers verdict |
| "Write LinkedIn post about F1 cyber" | Content | SponsorSignal format |
| "Create a one-pager for COMSOL" | Document | Generates docx, returns download |
| "Review this contract" | Legal | Flags clauses, risk summary |
| "What's our runway?" | Finance | Cash flow + burn analysis |
| "How should we price this deal?" | Pricing + Category Control | Benchmarks + scarcity analysis |
| "Help me respond to the landlord" | Dispute | Procedural response, tone discipline |
| "Brief me" | EA + Data + Navigator | Morning brief across all systems |
| "Book flights for Melbourne GP" | Travel | Options, costs, calendar alignment |
| "What changed in F1 sponsor landscape?" | Signal + Research | Recent movements + implications |
| "Prepare for the investor call" | Investment + Data | Narrative + metrics + objection prep |
| "They came back at 40% below ask" | Negotiation | Counter-position + concession strategy |
| "What categories are open on Haas?" | Category Control | Current landscape + pricing |
| "When is Archive 01 launching?" | Product Dev | Timeline + dependencies |


---

## BUILD ORDER (phased)

### PHASE 1 — Foundation (Sessions 1-3)
**Goal:** Fix what's broken today. Kiko understands the platform, navigates, manages deals.

| Build | Agent | Priority |
|---|---|---|
| 1a | Kiko Prime rewrite (execution controller) | Everything depends on routing |
| 1b | Navigator Agent | Screen awareness + navigation |
| 1c | Deal Agent | Stage moves + task creation + contact updates |

### PHASE 2 — Revenue Engine (Sessions 4-6)
**Goal:** Commercial machine works end-to-end.

| Build | Agent | Priority |
|---|---|---|
| 2a | Outreach Agent | Extract from monolithic prompt |
| 2b | Memory Engine | Persistent cross-session intelligence |
| 2c | Negotiation Agent | Margin protection in active deals |
| 2d | Category Control Agent | Scarcity enforcement |

### PHASE 3 — Intelligence (Sessions 7-8)
**Goal:** Data-driven decisions.

| Build | Agent | Priority |
|---|---|---|
| 3a | Data Agent | Analytics + forecasting |
| 3b | Strategy Agent (Decision Engine) | Verdicts, not summaries |
| 3c | Signal Detection Agent | Continuous trigger detection |
| 3d | Research Agent | Wire existing kiko-research.js into coordinator |

### PHASE 4 — Governance (Sessions 9-10)
**Goal:** Risk management + financial control.

| Build | Agent | Priority |
|---|---|---|
| 4a | Finance Agent | Cash flow + runway + forecasting |
| 4b | Legal Agent | Contract risk flagging |
| 4c | Pricing & ROI Agent | Defend deal value |
| 4d | Dispute Agent | Active dispute management |
| 4e | Investment Agent | Maison raise support |

### PHASE 5 — Execution (Sessions 11-12)
**Goal:** Operational support.

| Build | Agent | Priority |
|---|---|---|
| 5a | Executive Assistant Agent | Calendar + email triage + prioritisation |
| 5b | Travel Agent | F1/FE logistics |
| 5c | Document Agent | Wire existing generate-doc.js into coordinator |

### PHASE 6 — Brand & Product (Sessions 13-14)
**Goal:** Content machine + product lifecycle.

| Build | Agent | Priority |
|---|---|---|
| 6a | Content Agent | LinkedIn + SponsorSignal + case studies |
| 6b | Website Agent | Digital presence |
| 6c | Product Dev Agent | Maison product lifecycle |
| 6d | IP Agent | Licensing + portfolio |

---

## MODEL ALLOCATION & COST

| Model | Agents | Why |
|---|---|---|
| claude-opus-4-6 | Kiko Prime, Strategy, Negotiation, Dispute | Highest reasoning for routing, decisions, adversarial thinking |
| claude-sonnet-4-20250514 | Deal, Outreach, Data, Finance, Legal, Pricing, Investment, EA, Travel, Content, Website, Product Dev, IP, Category Control, Document, Research (3×) | Best balance of quality + speed + cost |
| claude-haiku-4-5-20251001 | Memory Engine, Navigator, Signal Detection | Speed-critical, high-frequency, deterministic |

Estimated marginal cost per agent: $0.50-3/day depending on call volume.
Total system at full deployment: ~$150-300/month API costs (same range as current).

---

## WHAT DOESN'T CHANGE

- All 35 skills in kiko_skills table (agents load skills they need)
- All 47 tools in kiko-tools.js (agents call tools they own)
- Mem0 memory (shared across agents via Memory Engine)
- MCP connections (Gmail + Google Calendar)
- Voice mode (ElevenLabs Conversational AI, Serafina voice)
- All 22 pages in Vela platform
- All Supabase tables and data
- All cron jobs (news-agent, enrichment, outreach scoring)
- Frontend (KikoChat, KikoFloat, all pages) — agents are backend-only
- Deployment process (Vercel + Supabase)

---

## TECHNICAL IMPLEMENTATION

Each agent is a single API endpoint file in `/api/agents/`.
Each has its own system prompt, tool subset, and skill subset.

Kiko Prime calls agents via internal fetch:
```javascript
const result = await fetch('/api/agents/navigator-agent', {
  method: 'POST',
  body: JSON.stringify({ instruction: 'Navigate to pipeline', pageContext, userEmail })
})
```

Agents return structured JSON (not streamed):
```javascript
{ success: true, result: 'Navigated to pipeline', actions: [{ type: 'navigate', page: 'pipeline' }] }
```

Kiko Prime is the only endpoint that streams to the frontend.
All inter-agent communication is synchronous JSON.
Multi-agent calls can run in parallel where dependencies allow.

---

## DOCUMENT STATUS

This is the source of truth for Kiko's architecture.
All build sessions reference this document.
Update this document when agents are completed.
Do not build agents not listed here without updating this document first.
