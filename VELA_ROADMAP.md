# VELA PLATFORM — COMPREHENSIVE ROADMAP & CHECKLIST
## Last Updated: 23 March 2026 | v9.7

---

## CURRENT STATE — WHAT'S LIVE

### Platform (v9.7 | glassmorphism-v9.7)
- **Frontend:** React/Vite, Vercel serverless, glassmorphism UI with aurora background
- **Backend:** Supabase (Postgres + Auth + Storage), Claude Sonnet 4 (default), Opus 4.6 (deep think)
- **Voice:** OpenAI GPT-4o Realtime GA API via WebRTC
- **Live URL:** https://vela-platform-one.vercel.app
- **Bundle:** index-BpdMDMj9.js (860KB JS + 89KB CSS)
- **Rollback:** git checkout backup-pre-v9-build

### Kiko — 31 Tools
| Category | Tools |
|---|---|
| CRM (5) | search_contacts, search_companies, search_deals, get_entity_detail, search_conversations |
| Gmail (5) | search_emails, get_email_thread, draft_email, get_email_analytics, get_recipient_style |
| Calendar (2) | get_calendar, create_calendar_event |
| Outreach (4) | get_outreach_intelligence, get_stale_contacts, generate_followup, get_followup_queue |
| Lemlist (3) | lemlist_list_campaigns, lemlist_add_lead, lemlist_get_activities |
| Memory (3) | search_past_conversations, get_recent_conversations, memory (native) |
| Content (4) | search_documents, get_news, get_partnership_matrix, get_pipeline_notifications |
| Platform (4) | navigate_page, get_alerts, get_deal_history, get_skills |
| Web (1) | web_search (native) |

### Kiko — 8 Domain Skills (auto-injected by keyword)
sponsorship_outreach, deal_qualification, legal_framework, brand_doctrine,
platform_knowledge, investor_relations, competitive_intelligence, financial_analysis

### Data
- 5,006 contacts | 2,243 companies | 308 deals | 2,069 news articles
- 389 partnerships / 67 gaps | 124 conversations / 448 messages
- 6 pipelines | 12 outreach scores | 2 documents | 8 skills

---

## MASTER CHECKLIST — ALL ITEMS

### ✅ COMPLETED (v8.0–v9.7)
- [x] Aurora toned down (0.30→0.18 base alpha)
- [x] Settings Navigation wired to Layout (dynamic TABS)
- [x] KikoFloat FAB redesigned — dark sphere + DoubleHelix
- [x] KikoVoice mini FAB — dark sphere + teal aura when speaking
- [x] Pipeline Clean Kanban — stage accent left-borders, coloured headers
- [x] Pipeline blank screen fix (sectionTitle/emptyText restored)
- [x] Pipeline card click → slide-out panel working
- [x] Pipeline drag-to-move → deal_stage_history audit trail
- [x] 565 legacy emails purged from Supabase
- [x] kiko_skills table + 8 domain skills seeded
- [x] Skills auto-injection into Kiko system prompt (keyword-matched)
- [x] Deep think → Claude Opus routing
- [x] get_deal_history + get_skills tools
- [x] maxDuration 60s for kiko.js
- [x] RLS on deal_stage_history + kiko_skills
- [x] Tool rounds 8→10 + safety net (forces text when limit hit)
- [x] Efficiency rules (3-4 tools for drafts, no memory read on startup)
- [x] 8192 tokens for drafting, draft triggers
- [x] Lemlist write-back (list campaigns, add lead, get activities)
- [x] Cross-session memory via conversation search (search_past_conversations)
- [x] get_recent_conversations tool
- [x] Documents page dark cards fix
- [x] Stale .bak file removed
- [x] Auto-conversation titling (Haiku)
- [x] Debug logging removed from KikoVoice
- [x] Breadcrumb removed from all pages
- [x] More dropdown dynamically shows non-tab pages
- [x] Text readability pass (minimum 0.25 opacity)
- [x] News Signals — Magazine Hero layout
- [x] Contacts — Clean List layout
- [x] Organisations — Compact Rows layout
- [x] Partnership Matrix — column headers + borderRadius fixed
- [x] Command Palette — text colors + borderRadius fixed
- [x] Avatar dropdown — dark glass styling
- [x] Background continuity (all pages transparent, aurora bleeds through)
- [x] Voice greeting ("Hi Sunny, how can I help you?")
- [x] Voice farewell ("Bye, Sunny!")
- [x] Bye-Kiko detection (24 phonetic variants)

### 🔲 PENDING — TIER 1 (Chat UX — Pure Frontend)
- [ ] Copy button on every Kiko message (hover action)
- [ ] Edit & Resend on user messages (hover action)
- [ ] Regenerate on Kiko messages (hover action)
- [ ] Draft Preview Panel — emails render in styled side panel (To/Subject/Body)
- [ ] Draft Preview Panel — texts/messages compact variant
- [ ] Tone adjustment shortcuts (More direct, Add urgency, Soften, Shorten 25%, Make formal, Add scarcity)
- [ ] Inline edit — highlight text in draft → instruction input → Kiko rewrites section
- [ ] Send to Gmail / Copy buttons on draft panel

### 🔲 PENDING — TIER 2 (Intelligence Layer)
- [ ] Deep Research mode — multi-search orchestration (5-10 web searches → synthesised brief)
- [ ] Proactive morning brief (kiko_alerts cron → surface on homepage widget)
- [ ] Kiko Insights home widget (pipeline health, stale deals, next race, recent activity)
- [ ] Kiko Learning Log — auto-extract key decisions from each conversation
- [ ] Conversation bookmarks (star key conversations for priority recall)
- [ ] Activity auto-logging (stage change, email, Lemlist event → activities table)

### 🔲 PENDING — TIER 3 (Personality + Growth)
- [ ] Skills management UI in Settings (create/edit skills, not just Supabase)
- [ ] Kiko personality tuning (concise/analytical/warm saved as preference)
- [ ] Document generation (one-pagers, briefs rendered in preview panel)
- [ ] Predictive outreach timing (analyse email patterns → optimal send time)
- [ ] Multi-agent research (parallel Claude instances)
- [ ] MCP standard migration (replace custom tool registry)

### 🔲 PENDING — PLATFORM / UI
- [ ] Mobile responsive bottom tab bar
- [ ] Login page redesign (futuristic minimal)
- [ ] KikoVoice teal aura verification during active voice mode
- [ ] Documents page further styling refinement
- [ ] Outreach Intelligence page redesign (match v9 glassmorphism)
- [ ] Email page / Outreach Intelligence page renders

### 🔲 PENDING — INFRASTRUCTURE
- [ ] Lemlist webhook full audit (verify all event types registered)
- [ ] Activity table population (calls, meetings, notes)
- [ ] Google token auto-refresh verification
- [ ] Pipedrive full decommission checklist
- [ ] Additional skills: negotiation_psychology, meeting_preparation

---

## VERSION HISTORY

| Version | Date | Key Changes |
|---|---|---|
| v8.0 | 22 Mar | Text readability pass, Partnership Matrix fix, background continuity |
| v8.1 | 22 Mar | Aurora toned down, Settings nav wired to Layout |
| v8.2 | 22 Mar | KikoFloat → glass sphere |
| v8.3 | 22 Mar | KikoFloat → dark sphere (60px, prominent CTA) |
| v8.4 | 22 Mar | Pipeline Clean Kanban redesign |
| v8.5 | 22 Mar | Pipeline blank screen fix, KikoVoice mini FAB fix |
| v9.0 | 22 Mar | Skills system, Opus routing, deal_stage_history, emails purged |
| v9.1 | 22 Mar | get_deal_history + get_skills tools |
| v9.2 | 22 Mar | maxDuration 60s, RLS on new tables |
| v9.3 | 22 Mar | 8192 tokens for drafts, no-narration, draft triggers |
| v9.4 | 22 Mar | Tool rounds 10, blank screen safety net |
| v9.5 | 22 Mar | Safety net forces text when tools exhausted, efficiency rules |
| v9.6 | 22 Mar | Lemlist write-back (3 tools), 3 new skills (8 total) |
| v9.7 | 22 Mar | Cross-session memory, Documents dark cards, .bak cleanup |

---

## TIER 1 BUILD SPEC — Chat UX

### 1A. Message Hover Actions
Every message in KikoChat gets hover action buttons:
- **User messages:** Copy | Edit & Resend (reopens input with message pre-filled)
- **Kiko messages:** Copy | Regenerate (resends last user message) | Show Draft (if draft exists)
- Implementation: Pure React, modify KikoChat.jsx message rendering
- Position: Bottom-right of each message, fade in on hover

### 1B. Draft Preview Panel
When Kiko drafts an email/text, render in a styled side panel:
- **Email:** To/Subject/From fields, formatted body, signature
- **Text:** To field, body only
- **Actions:** Copy | Edit | Send to Gmail (calls draft_email tool)
- **Tone shortcuts:** Row of chips below draft — "More direct", "Add urgency", "Soften", "Shorten 25%", "Make formal", "Add scarcity"
- Implementation: New DraftPreview.jsx component, rendered conditionally when Kiko uses draft_email tool
- Panel slides in from right, overlays chat partially (like Pipeline slide-out)

### 1C. Inline Edit on Drafts
- Select text in draft panel → instruction input appears
- Type modification → Kiko rewrites just that section
- Undo/Save buttons
- Implementation: contentEditable div with selection detection, sends partial rewrite request to /api/kiko

---

## TIER 2 BUILD SPEC — Intelligence Layer

### 2A. Deep Research Mode
- Trigger: "Research [company] as a prospect" or "Deep dive on [topic]"
- Kiko runs 5-10 web searches sequentially, synthesises into structured brief
- Output: Formatted research document in Draft Preview Panel
- Implementation: New system prompt section for research mode, multi-round web_search

### 2B. Proactive Morning Brief
- kiko_alerts table already exists with daily cron
- Surface alerts on homepage Kiko Insights widget
- Brief includes: stale deals, upcoming races, outreach windows, Lemlist activity
- Implementation: New KikoInsights.jsx widget on Homepage

### 2C. Activity Auto-Logging
- Every deal stage change → activities table (already done via deal_stage_history)
- Every Lemlist webhook event → activities table
- Every Gmail draft created → activities table
- Implementation: Add activity inserts to existing tool handlers

### 2D. Kiko Learning Log
- After each conversation save, auto-extract key facts via Haiku
- Store as searchable entries in kiko_learning_log table
- Categories: decision, preference, deadline, contact_note, deal_update
- Implementation: Post-conversation hook in KikoChat.jsx, Haiku extraction call

---

## TIER 3 BUILD SPEC — Personality + Growth

### 3A. Skills Management UI
- New Settings tab: "Skills"
- List all skills, toggle active/inactive
- Create new skill with name, keywords, content
- Edit existing skills inline
- Implementation: Settings.jsx new tab, CRUD against kiko_skills table

### 3B. Document Generation
- "Create a one-pager for Cloudflare" → Kiko generates HTML document
- Rendered in Draft Preview Panel
- Export as PDF/HTML
- Implementation: New generate_document tool, HTML template engine

### 3C. Predictive Outreach Timing
- Analyse email open/reply patterns from outreach_scores
- Recommend optimal send day/time per contact
- Implementation: New analyse_timing tool, pattern matching on historical data
