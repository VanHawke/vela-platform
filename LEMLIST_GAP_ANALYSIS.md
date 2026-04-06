# LEMLIST → KIKO CAMPAIGNS: COMPLETE GAP ANALYSIS
# Compiled 6 April 2026 from Lemlist Help Center, FAQ, UI review, and public documentation

---

## EXECUTIVE SUMMARY

Lemlist is a multichannel outreach platform with 5 core systems:
1. **Sequence Engine** — email, LinkedIn, phone, WhatsApp steps with conditional branching
2. **Lead Management** — import, enrichment, status tracking, deduplication
3. **Deliverability** — lemwarm email warm-up, inbox rotation, provider matching
4. **Analytics** — per-campaign stats (sent/opened/clicked/replied/bounced), per-lead activity timeline
5. **Chrome Extension** — import leads from LinkedIn/Gmail/HubSpot/Salesforce directly into campaigns

Kiko currently replicates ~40% of this. Below is the complete feature-by-feature breakdown.

---

## 1. CONDITIONAL TRIGGERS & BRANCHING (CRITICAL GAP)

### What Lemlist Does
Lemlist's sequence builder supports YES/NO conditional branching based on lead actions:

**Action-based conditions:**
- "Accepted LinkedIn invite within X days" → Yes: send LinkedIn message / No: send email
- "Opened email" → Yes: follow up with deeper content / No: try LinkedIn
- "Clicked link in email" → Yes: trigger LinkedIn profile visit / No: continue email sequence
- "Replied" → auto-stop sequence for that lead
- "Has email address with status Deliverable" → Yes: email path / No: LinkedIn path

**Timing options:**
- "Within X days" — checks condition within a timeframe, then moves to Yes or No branch
- "Wait Until" — pauses sequence until condition is met (could wait forever)

**Cross-campaign triggers:**
- "Send to another campaign" — when a condition is met, lead is auto-pushed to a different campaign
- Example: link click → push to "High Intent" campaign with different sequence

### What Kiko Has
❌ No conditional branching at all
❌ No action-based triggers
❌ No "if/then" logic in sequences
❌ Linear sequence only (step 1 → step 2 → step 3...)

### What Kiko Needs
This is the single biggest feature gap. Building it requires:
1. **Condition step type** in the sequence builder (in addition to email/LinkedIn)
2. **Branching UI** — visual Yes/No paths in the step flow (like Lemlist's tree view)
3. **Event tracking** — detect opens, clicks, LinkedIn accepts, replies
4. **Cron modification** — sequence-enqueue cron must evaluate conditions before queuing next step
5. **Database changes** — add `condition_type`, `condition_value`, `yes_step`, `no_step` fields to steps

**Estimated build: 2-3 dedicated sessions**


---

## 2. LINKEDIN AUTOMATION (SIGNIFICANT GAP)

### What Lemlist Does
Lemlist automates LinkedIn actions via a browser extension/connection:

**Step types:**
- **Profile Visit** — auto-visits prospect's LinkedIn profile (warming, creates "who viewed" notification)
- **Invitation** — sends connection request with personalised note (200 char limit, recommend 150)
- **Message** — sends DM to 1st-degree connections only
- **Voice Message** — records/uploads audio message (up to 1 min)
- **AI Voice Message** — generates voice note using ElevenLabs with cloned voice

**Pacing rules:**
- Space LinkedIn actions 2-3 days apart
- Profile visits increase acceptance rates by 15-20%
- Max 20-30 connection requests/day to avoid throttling

### What Kiko Has
⚠️ Partial — kiko_linkedin_queue table exists but no execution mechanism
⚠️ LinkedIn steps can be added to sequences but they're queued, not executed
❌ No LinkedIn browser automation (requires Chrome extension or LinkedIn API)
❌ No profile visit automation
❌ No voice messages

### What Kiko Needs
LinkedIn automation requires one of:
a) **Chrome extension** that reads the queue and executes actions (safest)
b) **LinkedIn unofficial API** (risky, can get account banned)
c) **Manual task system** — Kiko flags "Visit John's LinkedIn profile" as a task for you to do manually

**Recommended approach: Option (c) first, then (a)**
- Phase 1: LinkedIn steps become manual tasks shown in Command Centre
- Phase 2: Chrome extension automates profile visits and connection requests

---

## 3. LEAD MANAGEMENT (MODERATE GAP)

### What Lemlist Does

**Import sources:**
- CSV upload
- LinkedIn Chrome extension (bulk select from search results → push to campaign)
- CRM sync (HubSpot, Salesforce, Pipedrive)
- People database (450M+ leads)
- From another campaign (auto-transfer based on triggers)
- Manual entry (one by one)
- Zapier/API

**Lead enrichment:**
- Email Finder & Verifier (waterfall: checks 5+ data providers)
- LinkedIn Enrichment (pulls profile data)
- Phone Number Finder
- Email Verification (deliverability check)
- 1,000-1,500 free enrichment credits/month per user
- Can re-enrich existing records

**Lead statuses:**
- Enriching → To Launch → Sent → Opened → Clicked → Replied → Bounced → Failed → Completed
- Real-time dashboard showing status distribution
- "Clicked" = strong intent signal (clicked link OR accepted LinkedIn invite)

**Deduplication:**
- Automatic duplicate detection on import
- Configurable: skip duplicates, update existing, or add anyway
- Cross-campaign deduplication

### What Kiko Has
✅ CRM search (5,006 contacts with firstName, lastName, company, email, title, linkedin)
✅ "Kiko, find leads" auto-suggest based on campaign category
✅ "Add from CRM" modal with search
⚠️ Basic enrollment status (active, paused, cancelled, completed, replied, bounced)
❌ No CSV import
❌ No enrichment (no email finder, no phone finder, no LinkedIn enrichment)
❌ No People database
❌ No deduplication logic
❌ No manual entry form (name, email, company, title)

### What Kiko Needs (priority order)
1. **Manual lead add form** — simple modal: name, email, company, title, LinkedIn URL
2. **CSV import** — upload CSV, map columns to fields, bulk enroll
3. **Deduplication** — check if email already enrolled in any campaign before adding
4. **Lead status enrichment** — track sent/opened/clicked/replied/bounced per lead
5. **Email verification** — integrate with ZeroBounce or similar ($0.008/email) before sending
6. **Chrome extension** — import from LinkedIn (separate project)


---

## 4. DELIVERABILITY SYSTEM (LOW PRIORITY GAP)

### What Lemlist Does
- **lemwarm** — email warm-up tool (sends/receives emails to build sender reputation)
- **Inbox rotation** — rotates between multiple sending addresses
- **Email provider matchmaker** — matches sender provider to recipient provider
- **SPF/DKIM/DMARC setup guides** — authentication configuration
- **Deliverability score dashboard** — Red/Orange/Green health indicator
- **Custom tracking domain** — branded link tracking

### What Kiko Has
❌ No email warm-up system
❌ No inbox rotation (single sender: sunny@vanhawke.agency)
❌ No deliverability scoring
✅ Gmail API integration (good deliverability by default since sending through real Gmail)

### What Kiko Needs
LOW PRIORITY — Gmail API sends through your actual Gmail account, which has inherently good deliverability. The 30/day send cap also prevents reputation damage. Warm-up tools are mainly needed for dedicated cold email domains, not personal Gmail.

---

## 5. ANALYTICS & REPORTING (MODERATE GAP)

### What Lemlist Does
**Campaign-level stats:**
- Total leads, sent, opened, clicked, replied, bounced (with percentages)
- Per-step performance breakdown
- Conversion funnel visualisation

**Per-lead activity timeline:**
- Chronological feed: sent → opened (timestamp) → clicked (timestamp) → replied
- Click tracking on links
- Open tracking via pixel

**Campaign comparison:**
- Compare performance across campaigns
- A/B testing of subject lines and content

### What Kiko Has
✅ Performance tab exists with basic stats (enrolled, active, replied, reply rate, bounced)
✅ Per-step breakdown (sends per step)
❌ No open tracking (Gmail API doesn't support tracking pixels natively)
❌ No click tracking
❌ No per-lead activity timeline
❌ No A/B testing
❌ No campaign comparison

### What Kiko Needs
1. **Reply detection** — already built (cron-sequence-reply-detect.js)
2. **Bounce detection** — already built (same cron)
3. **Per-lead activity log table** — store events (sent, replied, bounced) with timestamps
4. **Activity timeline UI** — click a lead → see all their events
5. Open/click tracking is technically possible but adds complexity and privacy concerns

---

## 6. CAMPAIGNS PAGE — TOP-LEVEL DASHBOARD (CRITICAL GAP)

### What Lemlist Does (Campaigns list page)
- Campaign cards showing: name, status (Running/Paused/Draft), leads count, completion ratio
- Status toggle (running ↔ paused) directly from the list
- Quick stats per campaign: sent / opened / replied / bounced
- Tabs at top: Overview | Sequence | Lead list | Launch | All set
- Search + filter campaigns by status, sender, tag, creator
- Favourites system (star campaigns)
- Bulk actions (pause all, archive)

### What Kiko Has
✅ Campaign list with cards (name, step count, status badge)
✅ "Generate Campaign" button
❌ No campaign-level stats on the list page (sent/opened/replied)
❌ No status toggle (can't pause/resume from list)
❌ No search or filter
❌ No Overview tab (Lemlist's analytics dashboard per campaign)

### What Kiko Needs
The Campaigns page (/sequences) should be rebuilt to match Lemlist's dashboard:
1. Each campaign card shows: name, leads enrolled, sent count, reply rate, status
2. Status toggle button on each card (running ↔ paused)
3. Search bar to filter campaigns
4. When you click a campaign → Overview tab (stats) then Sequence | Leads | Performance


---

## 7. CHROME EXTENSION (FUTURE PROJECT)

### What Lemlist Does
The Lemlist Chrome extension works across 4 platforms:

**LinkedIn:**
- Appears on LinkedIn profiles and search results
- "Push profile(s) to lemlist" button
- Bulk select from LinkedIn People search → push all to campaign
- Auto-captures: name, title, company, LinkedIn URL
- Optional enrichment (find email, phone) during push
- Duplicate detection before adding

**Gmail:**
- Tracks emails sent outside Lemlist campaigns
- Shows templates from Lemlist for quick insertion
- Activity tracking on manual emails

**HubSpot / Salesforce:**
- Sidebar panel on CRM contact records
- "Add to campaign" directly from CRM
- Activity sync back to CRM
- Dialer integration (click-to-call)

### What Kiko Needs (Phase 1 — LinkedIn only)
1. Chrome extension (Manifest V3)
2. Content script activates on linkedin.com
3. Reads: name, title, company, LinkedIn URL from profile page DOM
4. Popup: "Add to Kiko campaign" → dropdown of active campaigns
5. POST to /api/sequences endpoint → creates enrollment
6. Duplicate check against existing enrollments
7. Optional: email lookup via Hunter.io or similar

**Estimated build: 2 dedicated sessions**

---

## 8. CAMPAIGN SETTINGS & LAUNCH (MINOR GAP)

### What Lemlist Does
Before launching a campaign, Lemlist has a "Launch" settings page:

**Stop conditions:**
- Reply by email → stop for that lead ✅ (Kiko has this)
- Reply by LinkedIn → stop
- Book a meeting → stop
- Click a link → stop (configurable)
- Pause same-company colleagues when one person replies

**Tracking toggles:**
- Reply tracking (on/off)
- Open tracking (on/off)
- Link click tracking (on/off)

**Sending schedule:**
- Which days to send (Mon-Fri default)
- Time window (e.g. 8am-6pm)
- Timezone (recipient's local time)

**Auto-tasks on events:**
- When someone replies → create "Call" task
- When someone clicks → create "Follow up" task

**AI reply scoring:**
- AI evaluates replies and marks leads as "Interested" or "Not Interested"

### What Kiko Has
✅ Reply detection → auto-stop sequence
✅ Bounce detection → auto-stop sequence
✅ Sending schedule (Mon-Fri 8am-6pm via cron)
✅ 30/day send cap
⚠️ Unsubscribe detection (basic keyword matching)
❌ No same-company pause
❌ No open/click tracking toggles
❌ No auto-task creation on events
❌ No AI reply scoring (but Kiko COULD do this — Claude analyses reply intent)

---

## COMPLETE FEATURE COMPARISON

| Feature | Lemlist | Kiko Campaigns | Gap |
|---------|---------|---------------|-----|
| Email sequences | ✅ | ✅ | — |
| LinkedIn profile visits | ✅ Auto | ❌ | Critical |
| LinkedIn invitations | ✅ Auto | ⚠️ Queued only | Significant |
| LinkedIn messages | ✅ Auto | ⚠️ Queued only | Significant |
| Voice messages | ✅ | ❌ | Low priority |
| Conditional branching (Yes/No) | ✅ | ❌ | Critical |
| Action triggers (open/click/accept) | ✅ | ❌ | Critical |
| Cross-campaign transfers | ✅ | ❌ | Medium |
| Email warm-up (lemwarm) | ✅ | ❌ | Low (Gmail handles this) |
| Inbox rotation | ✅ | ❌ | Low (single sender) |
| Lead enrichment (email finder) | ✅ | ❌ | Medium |
| Lead enrichment (phone finder) | ✅ | ❌ | Low |
| Lead enrichment (LinkedIn) | ✅ | ❌ | Medium |
| 450M+ People database | ✅ | ❌ | Low (we have CRM) |
| Chrome extension (LinkedIn) | ✅ | ❌ | Medium-High |
| Chrome extension (Gmail) | ✅ | ❌ | Low |
| CSV import | ✅ | ❌ | Medium |
| Manual lead entry | ✅ | ❌ | High (easy build) |
| CRM integration (native) | ✅ | ✅ (Pipedrive data) | — |
| Deduplication | ✅ | ❌ | Medium |
| Open tracking | ✅ | ❌ | Low |
| Click tracking | ✅ | ❌ | Low |
| Reply tracking | ✅ | ✅ | — |
| Bounce handling | ✅ | ✅ | — |
| Per-lead activity timeline | ✅ | ❌ | High |
| Campaign stats dashboard | ✅ | ⚠️ Basic | High |
| A/B testing | ✅ | ❌ | Low |
| AI campaign generation | ❌ | ✅ | Kiko advantage |
| Style learning from real emails | ❌ | ✅ | Kiko advantage |
| Category intelligence | ❌ | ✅ | Kiko advantage |
| Race calendar integration | ❌ | ✅ | Kiko advantage |
| Partnership matrix cross-ref | ❌ | ✅ | Kiko advantage |
| Deal attribution | ❌ | ✅ | Kiko advantage |
| Test email send to drafts | ❌ | ✅ | Kiko advantage |


---

## BUILD PRIORITY ORDER

### Phase 1: Get Campaigns Operational (Next 1-2 Sessions)
1. ✅ Fix Campaigns page as top-level dashboard (campaign cards with stats)
2. Manual lead entry form (name, email, company, title, LinkedIn)
3. CSV import for bulk lead loading
4. Deduplication check (don't enroll same email twice)
5. Per-lead activity log (sent/replied/bounced events with timestamps)
6. Activity timeline UI in Leads tab (click lead → see events)
7. Campaign status toggle (running/paused from list page)

### Phase 2: Intelligence Advantage (Sessions 3-4)
8. AI reply scoring (Claude analyses reply text → marks Interested/Not Interested)
9. Same-company pause (when one person at Company X replies, pause other Company X leads)
10. Auto-suggest leads with company_intelligence cross-reference
11. LinkedIn steps as manual tasks (shown in Command Centre as "Visit John's profile")
12. Test send → actual send (not just draft)

### Phase 3: Conditional Branching (Sessions 5-6)
13. Condition step type in sequence builder
14. Visual Yes/No branching UI in step flow
15. Action detection (reply, bounce → already built; open, click → new)
16. Condition evaluation in enqueue cron
17. Cross-campaign lead transfers

### Phase 4: LinkedIn Automation (Sessions 7-8)
18. Chrome extension MVP (import leads from LinkedIn profile/search)
19. Profile visit automation via extension
20. Connection request automation
21. Message sending to 1st-degree connections

### Phase 5: Advanced (Future)
22. Email warm-up system
23. Inbox rotation (multiple sending addresses)
24. A/B testing framework
25. People database integration (Apollo.io or similar)
26. WhatsApp integration

---

## KIKO'S COMPETITIVE ADVANTAGES OVER LEMLIST

Kiko already does things Lemlist cannot:

1. **AI campaign generation** — enter a category, Kiko generates a full 7-touch sequence in Van Hawke's exact voice using 16 real email examples as training data
2. **Style learning** — 16 real sent emails across 8 categories stored as style references
3. **Category intelligence** — partnership matrix cross-reference identifies open categories
4. **Race calendar awareness** — sequences reference upcoming races for urgency
5. **Deal attribution** — tracks which Kiko actions influenced deal progression
6. **CRM integration** — 5,006 contacts + 308 deals + 2,243 companies already in the system
7. **Company enrichment** — company_intelligence table with industry, sub-sector, fit scores
8. **Cost** — $35-40/month vs Lemlist Multichannel Expert at $99/month/user

---

## ANSWER TO YOUR SPECIFIC QUESTIONS

### "Can we trigger LinkedIn profile visits when someone clicks a link?"
Not yet. This requires:
1. Click tracking (embed trackable links in emails)
2. Conditional branching (if clicked → trigger LinkedIn step)
3. LinkedIn automation (Chrome extension or manual task)
All three are in the build plan (Phase 2-4).

### "Can we send first LinkedIn message after they accept an invite?"
Not yet. This requires:
1. LinkedIn invite acceptance detection (check connection status)
2. Conditional branching (if accepted within X days → send message, else → email)
3. LinkedIn message execution
This is Phase 3-4 functionality.

### "Should the Campaigns page replicate the Lemlist page?"
Yes. The Campaigns page should become the single outreach hub that replaces both the current Sequences page AND the Lemlist page. It needs:
- Campaign dashboard with real stats
- Per-campaign drill-down (Overview → Sequence → Leads → Performance)
- Lead management (add, search, enrich, status tracking)
- Activity timelines per lead

---

END OF ANALYSIS
