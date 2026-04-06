# KIKO — NEXT SESSION MASTER BRIEF
# Complete continuation guide for Campaigns/Outreach system
# Created: 6 April 2026 | Last commit: bbf04c8

---

## START HERE — READ THESE FILES FIRST
1. /Users/sunny/Desktop/vela-platform/KIKO_SESSION_BRIEF.md
2. /Users/sunny/Desktop/vela-platform/KIKO_EVOLUTION_PLAN.md
3. This file (NEXT_SESSION_PROMPT.md)

## PLATFORM
- Live: https://vela-platform-one.vercel.app
- Codebase: /Users/sunny/Desktop/vela-platform/
- GitHub: https://github.com/VanHawke/vela-platform
- Supabase: dwiywqeleyckzcxbwrlb
- Deploy: npx vercel --prod --yes (NEVER --force or VERCEL_FORCE_NO_BUILD_CACHE=1)
- Functions: 49/50 in vercel.json (1 slot remaining)

---

## PRIORITY 1: LEADS MANAGEMENT (most critical)

### Auto-populate leads
When a campaign is created (e.g. "Haas F1 - Cybersecurity"), Kiko should:
1. Search contacts table (5,006 records) by company industry matching the category
2. Cross-reference with company_intelligence table for enriched companies
3. Present suggested leads in the Leads tab automatically
4. User ticks the ones they want → bulk enroll

The "Kiko, find leads" button exists but needs refinement. It searches by category keyword in company name — should also search by industry/sub_sector in company_intelligence.

### CRM contact data structure (IMPORTANT — fields use camelCase):
- data->>'firstName' (NOT first_name)
- data->>'lastName' (NOT last_name)
- data->>'company'
- data->>'email'
- data->>'title' (job title)
- data->>'linkedin' (profile URL)
- data->>'phone'
- data->>'companyLinkedin'

### Manual lead add
Build a simple modal: name, email, company, title, LinkedIn URL → creates enrollment directly. Already partially built in the "Add from CRM" modal but needs a "Manual" tab.

### Lemlist-style lead table
The Leads tab should show columns like Lemlist: Full name | Company | Email | Status | Step | Next send | Actions
Currently shows a simpler version. Match Lemlist's layout.

---

## PRIORITY 2: MERGE LEMLIST PAGE INTO CAMPAIGNS

### Current state
- /lemlist page exists, pulls live Lemlist API data
- /sequences (renamed to "Campaigns") is the new native system
- Both exist in nav (Campaigns in top bar, Lemlist under More)

### What to do
1. Look at /lemlist page (src/pages/Lemlist.jsx) for useful features
2. Replicate any analytics, lead counts, campaign stats into the Campaigns page
3. Keep Lemlist page accessible under More during transition
4. Eventually remove once native system is fully operational

---

## PRIORITY 3: TEST EMAIL SEND

### What's needed
A "Send test email" button in the sequence builder that:
1. Takes the current step's email content
2. Sends it to sunny@vanhawke.agency as a test
3. Uses the current step's subject + body with {firstName} replaced by "Sunny"
4. Sends via the existing Gmail API integration
5. Shows confirmation "Test email sent to your inbox"

### Implementation
Add a button next to "Ask Kiko to write this step" in the step editor:
[✨ Ask Kiko to write this step] [📧 Send test]

The send test function calls /api/gmail-draft or sends directly via Gmail API.

---

## PRIORITY 4: CHROME EXTENSION FOR LINKEDIN CAPTURE (future)

### What Lemlist does
Chrome extension that reads LinkedIn profile data (name, title, company, LinkedIn URL) and pushes to their API. When on a LinkedIn profile page, click the extension → "Add to campaign" → selects campaign → lead added.

### What Kiko would need
1. Chrome extension (manifest v3) that activates on linkedin.com
2. Reads: name, title, company, LinkedIn URL from the profile page DOM
3. Popup shows available campaigns from Kiko's database
4. Click "Add" → POST to /api/sequences endpoint → creates enrollment
5. Optional: email enrichment via Hunter.io API ($49/month for 1,000 lookups)

This is a separate 2-session project. Document but don't build yet.

---

## WRITING STYLE SYSTEM

### kiko_email_style_reference table (10 entries)
Stores real emails extracted from Gmail (sent via Lemlist). Used as few-shot examples in the generate-sequence API.

| Category | Step 1 | Step 2 |
|---|---|---|
| Cybersecurity | ✅ | ✅ |
| CRM | ✅ | ✅ |
| Cloud Computing | ✅ | ✅ |
| Premium Spirits / Tequila | ✅ | ✅ |
| Industrial Automation & Robotics | ✅ | ✅ (short) |

### Still need to extract (from Gmail):
- Semiconductor emails
- Data/Analytics emails  
- Logistics/Fulfilment emails
- Whiskey emails

Use: Gmail:gmail_search_messages with "from:sunny@vanhawke.agency subject:'Haas F1' in:sent"
Then: Gmail:gmail_read_message to get full body
Then: INSERT INTO kiko_email_style_reference

---

## OPEN CATEGORIES FOR NEW CAMPAIGNS

Cross-referenced from sponsor_categories table:

| Category | Priority | Has Lemlist campaign? |
|---|---|---|
| Banking / Financial Services | High | No |
| FinTech / Payments | High | No |
| Telecoms / Connectivity | High | No |
| Energy / Petrochemical | Medium | No |
| Gaming / Entertainment | Medium | No |
| Health / Wellness | Medium | No |
| Hospitality / Travel | Medium | No |

---

## BACKEND STATUS (all working — do NOT modify)

| Component | Status |
|-----------|--------|
| kiko_sequences table | ✅ (1 campaign: Haas F1 - Cybersecurity) |
| kiko_sequence_enrollments table | ✅ |
| kiko_outreach_queue table | ✅ |
| kiko_linkedin_queue table | ✅ |
| kiko_email_style_reference table | ✅ (10 real emails) |
| cron-sequence-enqueue.js (6am daily) | ✅ |
| cron-sequence-sender.js (30min 8am-6pm) | ✅ |
| cron-sequence-reply-detect.js (2hr) | ✅ |
| generate-sequence.js (AI generation) | ✅ (uses style references) |
| data.js operations | ✅ (start/status/pause/cancel/linkedin_queue) |
| kiko.js routing | ✅ |
| kiko-tools.js enum | ✅ |

## FRONTEND STATUS

| Page | File | Status |
|------|------|--------|
| Campaigns list | src/pages/Sequences.jsx | ✅ Clean card list + generate wizard |
| Sequence builder | src/pages/SequenceDetail.jsx | ✅ 3 tabs (Sequence/Leads/Performance) |
| Lemlist | src/pages/Lemlist.jsx | ✅ Kept under More, to be merged |

## NAV STRUCTURE
Top bar: Home | Command Centre | Pipeline | Partnership Matrix | Campaigns
More dropdown: Calendar, Contacts, Organisations, Lemlist, KikoCode, Settings

---

## DEPLOY RULES
- npx vercel --prod --yes ONLY
- NEVER VERCEL_FORCE_NO_BUILD_CACHE=1 or --force
- 49/50 functions in vercel.json
- ANTHROPIC_KEY not ANTHROPIC_API_KEY
- VITE_SUPABASE_URL not SUPABASE_URL
- Contacts use camelCase: firstName, lastName, company, email, title, linkedin

---

## SESSION COMMITS (6 April 2026)

| Commit | Description |
|--------|-------------|
| 090706d | Closed-loop deal attribution engine |
| 6f96631 | Master prompt with attribution |
| 91179ed | Kiko design brief for Cowork (291 lines) |
| 185d1f4 | Claude Code implementation brief (452 lines) |
| 7ff59a3 | Outreach sequence engine (3 crons, 4 tables) |
| 935ee08 | Fix vercel.json 50-function limit |
| f830c23 | Sequences page with stats |
| cf88a6f | Sequence builder UI spec |
| 2f29a2e | Lemlist-style sequence builder |
| 61fcf8e | AI campaign generation wizard |
| ba8e54f | Fix generate-sequence sbFetch bug |
| 768df6a | Definitive sequence builder spec (408 lines) |
| 9c8f387 | Complete rebuild — 3-tab builder + CRM lead search |
| 2b7db57 | Auto greeting/sign-off + dropdown regen + writing style |
| 5ea7cd3 | Architecture decisions documented |
| 6eb2919 | Rewrite generation prompt with real Van Hawke style |
| 8223200 | 10 real email style references from Gmail |
| cf9b759 | Campaigns promoted to top nav, renamed from Sequences |
| bbf04c8 | Fix CRM search fields, auto-suggest leads, fix build error |

---

## KEY FILES

| File | Lines | Purpose |
|------|-------|---------|
| NEXT_SESSION_PROMPT.md | This file | Paste into next session |
| KIKO_SESSION_BRIEF.md | ~200 | Mandatory read before code |
| KIKO_EVOLUTION_PLAN.md | 710 | 19-phase engineering spec |
| KIKO_DESIGN_BRIEF.md | 291 | Cowork UI design brief |
| SEQUENCE_BUILDER_SPEC.md | 408 | Definitive campaigns UI spec |
| KIKO_OUTREACH_ENGINE_SPEC.md | ~300 | Outreach engine technical spec |
| CLAUDE_CODE_SETUP.md | 452 | Local dev workflow |

---

END OF BRIEF
