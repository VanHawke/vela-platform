# KIKO CAMPAIGNS — COMPLETE SESSION CONTINUATION PROMPT
# Paste this ENTIRE document at the start of the next conversation
# Last updated: 6 April 2026 | Last commit: 21b3725

---

## MANDATORY: READ THESE FILES BEFORE ANY CODE
1. Read /Users/sunny/Desktop/vela-platform/KIKO_SESSION_BRIEF.md
2. Read /Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md
3. Read /Users/sunny/Desktop/vela-platform/LEMLIST_GAP_ANALYSIS.md (433 lines — full feature comparison)

## PLATFORM
- Live: https://vela-platform-one.vercel.app
- Codebase: /Users/sunny/Desktop/vela-platform/
- GitHub: https://github.com/VanHawke/vela-platform
- Supabase project: dwiywqeleyckzcxbwrlb
- User: sunny@vanhawke.com | user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063 | role: super_admin
- Deploy: npm run build → git commit → git push → npx vercel --prod --yes
- NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1 or --force (caused $830 overage)
- Functions: 49/50 in vercel.json (1 slot remaining)
- Env: ANTHROPIC_KEY (not ANTHROPIC_API_KEY), VITE_SUPABASE_URL (not SUPABASE_URL)
- Build locally first, batch changes, deploy ONCE (save costs)

## WHAT EXISTS AND WORKS (do NOT rebuild)

### Backend (all working — DO NOT TOUCH)
- kiko_sequences table (campaigns)
- kiko_sequence_enrollments table (leads per campaign)
- kiko_outreach_queue table (email send queue)
- kiko_linkedin_queue table (LinkedIn action queue)
- kiko_email_style_reference table (16 real emails across 8 categories)
- kiko_deal_attribution table (deal progression tracking)
- cron-sequence-enqueue.js (6am daily — personalises and queues emails)
- cron-sequence-sender.js (every 30min 8am-6pm Mon-Fri — sends via Gmail API, 30/day cap)
- cron-sequence-reply-detect.js (every 2hrs Mon-Fri — stops sequence on reply/bounce)
- generate-sequence.js (AI campaign generation using 16 real email style references)
- data.js operations (start_sequence, sequence_status, pause/cancel, linkedin_queue)

### Frontend (all working)
- /sequences → Campaigns page (top nav) — campaign list with generate wizard
- /sequences/:id → Sequence builder with 3 tabs (Sequence | Leads | Performance)
- Sequence tab: visual step flow + step editor with approach/psychology dropdowns
- Auto "Dear {firstName}," greeting and "Kind regards, {signature}" sign-off on new email steps
- Dropdown change → amber "Regenerate content?" prompt bar
- "Ask Kiko to write this step" → generates in Van Hawke voice
- "Send test" button → creates Gmail draft with variables replaced
- Leads tab: "Kiko, find leads" auto-suggest + "Add from CRM" search
- Performance tab: enrolled/active/replied/bounced stats

### Nav structure
Top bar: Home | Command Centre | Pipeline | Partnership Matrix | Campaigns
More dropdown: Calendar, Contacts, Organisations, Lemlist, etc.

### CRM contacts (5,006 records) — field names are camelCase:
data->>'firstName', data->>'lastName', data->>'company', data->>'email', data->>'title', data->>'linkedin'


## WHAT TO BUILD THIS SESSION (priority order)

### 1. Rebuild Campaigns page as proper Lemlist-style dashboard
The /sequences page needs to look like Lemlist's campaign list:
- Each campaign card shows: name, leads enrolled, sent count, reply rate %, status badge
- Status toggle button on each card (running ↔ paused) 
- Campaign-level analytics (sent/opened/replied/bounced with percentages)
- Currently it's too basic — just name + step icons

### 2. Manual lead add
Simple modal with form fields: first name, last name, email, company, title, LinkedIn URL
Creates enrollment directly. Currently only CRM search exists, no manual entry.

### 3. Per-lead activity log and timeline
- New table: kiko_lead_activity (enrollment_id, event_type, timestamp, details)
- Events: sent, replied, bounced (opened/clicked are future)
- Click a lead in the Leads tab → see their activity timeline
- This is what Lemlist shows when you click a lead name

### 4. Merge useful Lemlist page features into Campaigns
The Lemlist page (src/pages/Lemlist.jsx, 415 lines) pulls live data from /api/lemlist-data.
Useful features to replicate:
- Campaign stats bar (sent/opened/replied/bounced %)
- Per-lead activity feed
- Lead detail view (click lead → see all events)
- Status toggle (running/paused from list)
Don't delete Lemlist page — keep under More during transition.

### 5. Conditional branching (Phase 3 — significant build)
Lemlist's killer feature. When someone clicks a link → trigger LinkedIn profile visit.
When someone accepts LinkedIn invite → send first message. Yes/No branching paths.
Read LEMLIST_GAP_ANALYSIS.md Section 1 for full architecture requirements.
This needs: condition step type, branching UI, event tracking, cron modification.
Estimated: 2-3 dedicated sessions.


## VAN HAWKE EMAIL STYLE (non-negotiable rules)

1. Every email starts with "Dear {firstName},"
2. Every email ends with "Kind regards,\n\n{signature}"
3. Subject format: "Haas F1 Team × {category}" (uses × not —)
4. No "I hope this finds you well" or any generic filler
5. No "I think", "maybe", "hopefully" — declarative authority only
6. Category-specific: explain WHY this category matters OPERATIONALLY for F1
7. Language: "principal level", "category-exclusive", "governance, access, institutional credibility"
8. 50-125 words per email
9. Soft CTA: "The relevant question is simply whether this is strategic from your perspective"
10. 16 real email examples stored in kiko_email_style_reference table (Cybersecurity, CRM, Cloud, Tequila, Robotics, Logistics, Data, Whiskey)

## OPEN CATEGORIES (no campaigns yet — generate these)
- Banking / Financial Services (HIGH)
- FinTech / Payments (HIGH)
- Telecoms / Connectivity (HIGH)
- Energy / Petrochemical (Medium)
- Gaming / Entertainment (Medium)

## ACTIVE LEMLIST CAMPAIGNS (already running in Lemlist — replicate in Kiko)
- Haas F1 - Cloud Computing (108 leads)
- Haas F1 - Semiconductor (118 leads)
- Haas F1 - Data (112 leads)
- Haas F1 - Cybersecurity
- Haas F1 - CRM (40 leads)
- Haas F1 - Tequila (33 leads)
- Haas F1 - Whiskey (39 leads)
- Haas F1 - Logistics & Fulfilment (63 leads)
- Haas F1 - Robotics (62 leads)
- Formula E - Cryptocurrency (102 leads)
- Aston Martin - Legal AI (23 leads)

## KEY FILES IN REPO
- KIKO_SESSION_BRIEF.md — mandatory read before any code
- KIKO_EVOLUTION_PLAN.md — 710-line 19-phase engineering spec
- LEMLIST_GAP_ANALYSIS.md — 433-line complete feature comparison with 25-step build plan
- KIKO_DESIGN_BRIEF.md — 291-line UI design brief
- SEQUENCE_BUILDER_SPEC.md — 408-line campaigns UI spec
- KIKO_OUTREACH_ENGINE_SPEC.md — outreach engine technical spec
- src/pages/Sequences.jsx — campaigns list page
- src/pages/SequenceDetail.jsx — sequence builder (3 tabs)
- src/pages/Lemlist.jsx — existing Lemlist page (415 lines, features to replicate)
- api/generate-sequence.js — AI campaign generation
- api/cron-sequence-enqueue.js — email personalisation + queueing
- api/cron-sequence-sender.js — Gmail send (30/day cap)
- api/cron-sequence-reply-detect.js — reply/bounce detection

## DEPLOY RULES
- Build locally: npx vite build (verify no errors)
- Batch multiple changes into ONE deploy
- Deploy: npx vercel --prod --yes
- NEVER use --force or VERCEL_FORCE_NO_BUILD_CACHE=1
- 49/50 functions in vercel.json — only 1 slot remaining

---
END OF PROMPT — Start by reading the 3 mandatory files listed at the top, then begin building.

## VAN HAWKE EMAIL STYLE (non-negotiable)
1. Every email: "Dear {firstName}," → content → "Kind regards,\n\n{signature}"
2. Subject: "Haas F1 Team × {category}" (× not —)
3. No filler. No "I think/maybe/hopefully". Declarative authority.
4. Category-specific operational relevance for F1
5. 50-125 words. Soft CTA: "whether this is strategic from your perspective"
6. 16 real examples in kiko_email_style_reference table

## OPEN CATEGORIES (generate campaigns for these)
Banking/Financial Services (HIGH), FinTech/Payments (HIGH), Telecoms/Connectivity (HIGH)

## KEY FILES
- LEMLIST_GAP_ANALYSIS.md — 433-line feature comparison + 25-step build plan
- src/pages/Sequences.jsx — campaigns list
- src/pages/SequenceDetail.jsx — sequence builder
- src/pages/Lemlist.jsx — features to replicate (415 lines)
- api/generate-sequence.js — AI generation with style refs

## DEPLOY RULES
- Build locally first: npx vite build
- Batch changes, deploy ONCE: npx vercel --prod --yes
- NEVER --force or VERCEL_FORCE_NO_BUILD_CACHE=1
- 49/50 functions — 1 slot remaining

---
END — Read the 3 mandatory files at the top, then build.
