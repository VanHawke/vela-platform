# KIKO SEQUENCE BUILDER — DEFINITIVE BUILD SPEC
# Next session: rebuild sequences UI from scratch with proper UX
# Based on: Lemlist live review, 2026 outreach research, user feedback
# Zero additional costs. Uses existing backend (tables, crons, APIs all working).

---

## CORE PRINCIPLE

Every screen must answer one question clearly. No dead space.
No data that doesn't help the user make a decision or take an action.
User-friendly means: I look at it and know exactly what to do next.

---

## RESEARCH-BACKED OPTIMAL SEQUENCE: 7 touches / 14 days

Source: 16.5M emails + 20M LinkedIn touches + 2026 benchmarks

| Day | Channel | Purpose | Psychology |
|-----|---------|---------|-----------|
| 0 | Email | Authority hook — share intel | Reciprocity |
| 2 | LinkedIn | Profile visit + connect with note | Liking |
| 3 | Email | Social proof follow-up (Re: thread) | Social proof |
| 7 | Email | Scarcity + race calendar urgency | Scarcity |
| 10 | LinkedIn | Direct message — different angle | Commitment |
| 12 | LinkedIn | Engage their content (comment) | Liking |
| 14 | Email | Strategic withdrawal — final note | Authority |

Key stats:
- Omnichannel (email + LinkedIn) = 287% more replies than email alone
- 50-125 word emails = 50% higher reply rate than longer
- Personalised LinkedIn connect note = 58% higher acceptance (9.36% vs 5.44%)
- Profile visit + message = 11.87% reply rate
- Monday launch, Wednesday follow-up = peak engagement
- 9:30-11:30am recipient local time = optimal send window
- 93% of replies captured by day 10
- After day 17, additional follow-ups produce negative returns

---

## PAGE 1: CAMPAIGNS LIST (/sequences)

**Purpose:** Show me all my campaigns, their performance, and let me create new ones.

### Layout
```
┌────────────────────────────────────────────────────────────┐
│ Campaigns                           [✨ Generate Campaign] │
│ 3 active · 0 leads enrolled · 0 emails sent               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🟢  Haas F1 - Cybersecurity C-Suite                   │ │
│ │ 4 emails + 3 LinkedIn · 14 days · Authority-led       │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ │
│ │ 0 enrolled  0 sent  0 replied  0% reply rate   [Edit] │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🟢  Haas F1 - Cloud Computing                        │ │
│ │ 4 emails + 3 LinkedIn · 14 days · Authority-led       │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ │
│ │ 0 enrolled  0 sent  0 replied  0% reply rate   [Edit] │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Each campaign card shows:**
- Name + active status
- Sequence summary (X emails + Y LinkedIn · Z days · approach)
- Progress bar (enrolled → sent → replied)
- Key metrics inline: enrolled, sent, replied, reply rate
- [Edit] button → opens sequence detail

**No left/right split.** No tabs. Just a clean list of campaigns. Simple.

**"✨ Generate Campaign" button** opens wizard modal:
- Category input (Cybersecurity, Cloud, CRM, etc.)
- F1 Team selector
- Kiko generates the 7-touch sequence automatically
- Opens sequence builder with everything pre-filled

---

## PAGE 2: SEQUENCE BUILDER (/sequences/:id)

**Purpose:** Build, edit, and manage a single campaign.

### Top Header
```
← Back    Haas F1 - Cybersecurity C-Suite    [Unsaved]  [Save]
Target: CISO/CTO at $500M-$5B cybersecurity companies
```

### 3 Tabs (not 4 — keep it simple)
```
[ Sequence ]  [ Leads ]  [ Performance ]
```

---

### Tab 1: SEQUENCE (the builder)

**Split layout: 35% flow | 65% editor**

LEFT — Visual step flow (like Lemlist):
```
┌─────────────────────┐
│   Sequence start    │
└─────────┬───────────┘
          │
    ⏱ Immediately ▾
┌─────────┴───────────┐
│ ✉ Email 1           │  ← selected (highlighted)
│ "Authority hook"     │
└─────────┬───────────┘
          │
    ⏱ 2 days ▾
┌─────────┴───────────┐
│ 🔗 LinkedIn 1       │
│ "Connect + note"     │
└─────────┬───────────┘
          │
    ⏱ 1 day ▾
┌─────────┴───────────┐
│ ✉ Email 2           │
│ "Social proof"       │
└─────────┬───────────┘
          │
    ⏱ 4 days ▾
┌─────────┴───────────┐
│ ✉ Email 3           │
│ "Scarcity"           │
└─────────┬───────────┘
          │
    ⏱ 3 days ▾
┌─────────┴───────────┐
│ 🔗 LinkedIn 2       │
│ "Direct message"     │
└─────────┬───────────┘
          │
    ⏱ 2 days ▾
┌─────────┴───────────┐
│ 🔗 LinkedIn 3       │
│ "Engage content"     │
└─────────┬───────────┘
          │
    ⏱ 2 days ▾
┌─────────┴───────────┐
│ ✉ Email 4           │
│ "Strategic withdrawal"│
└─────────┬───────────┘

  [+ Email]  [+ LinkedIn]
```

- Click any step card → loads in right panel
- Delay dropdowns between each step (0-14 days)
- Delete button per step (trash icon, top-right of card)
- + Add buttons at bottom

RIGHT — Step editor (when a step is clicked):
```
┌─────────────────────────────────────────────┐
│ Step 1 · Email · Authority hook             │
│                                             │
│ Channel:  [✉ Email]  [🔗 LinkedIn]          │
│                                             │
│ Approach: [authority-led        ▾]          │
│ Psychology: [reciprocity        ▾]          │
│                                             │
│ Subject:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ Haas F1 Team — {category} Partnership  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Body:                                   127 │
│ ┌─────────────────────────────────────────┐ │
│ │ Dear {firstName},                      │ │
│ │                                        │ │
│ │ At this level of commercial...         │ │
│ │                                        │ │
│ │                              (12 lines)│ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Variables:                                  │
│ [{firstName}] [{companyName}] [{category}]  │
│ [{revenue}] [{ceo}] [{raceWindow}]          │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  ✨ Ask Kiko to write this step         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

For LinkedIn steps:
- No subject line (removed)
- Body max 300 chars with counter
- Message type selector: Connection request / Direct message / Comment

---

### Tab 2: LEADS (add and manage contacts)

**This is the critical missing piece. The user needs to add people to campaigns.**

Layout:
```
┌────────────────────────────────────────────────────────────┐
│ Leads                        [+ Add from CRM] [+ Manual]  │
│ 0 enrolled · 0 active · 0 replied                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ (empty state)                                              │
│ Add leads to start this campaign.                          │
│ Search your 5,006 CRM contacts or add manually.            │
│                                                            │
│ When populated:                                            │
│ Name          │ Company       │ Step │ Status │ Next Send  │
│ Nikesh Arora  │ Palo Alto     │ 2/7  │ 🟢     │ 8 Apr      │
│ Matthew Prince│ Cloudflare    │ 1/7  │ 🟢     │ 9 Apr      │
│ Jay Chaudhry  │ Zscaler       │ 4/7  │ ✅     │ —          │
│                                                            │
│ Actions per row: [Pause] [Cancel] [View emails sent]       │
└────────────────────────────────────────────────────────────┘
```

**"+ Add from CRM" modal:**
```
┌──────────────────────────────────────────┐
│ Add leads from CRM                 [×]   │
│                                          │
│ Search: [cybersecurity____________]      │
│                                          │
│ ☐ Nikesh Arora · Palo Alto Networks     │
│   CISO · nikesh@paloaltonetworks.com     │
│                                          │
│ ☐ Jay Chaudhry · Zscaler                │
│   CEO · jay@zscaler.com                  │
│                                          │
│ ☐ Kevin Mandia · Mandiant               │
│   CEO · kevin@mandiant.com               │
│                                          │
│ Selected: 3 contacts                     │
│                                          │
│ [Enroll 3 contacts]                      │
└──────────────────────────────────────────┘
```

Searches kiko's contacts table (5,006 records) by company, name, job title.
Shows contact name, company, title, email.
Tick to select. Bulk enroll.

**"+ Manual" modal:**
```
┌──────────────────────────────────────────┐
│ Add lead manually                  [×]   │
│                                          │
│ Name:    [________________________]      │
│ Email:   [________________________]      │
│ Company: [________________________]      │
│ Title:   [________________________]      │
│                                          │
│ [Add to campaign]                        │
└──────────────────────────────────────────┘
```

---

### Tab 3: PERFORMANCE (analytics)

**Purpose:** How is this campaign performing? What's working?

Layout:
```
┌────────────────────────────────────────────────────────────┐
│ Performance                                                │
│                                                            │
│ ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│ │  12  │  │   8  │  │   3  │  │  25% │  │   1  │        │
│ │Enroll│  │ Sent │  │Reply │  │ Rate │  │Bounce│        │
│ └──────┘  └──────┘  └──────┘  └──────┘  └──────┘        │
│                                                            │
│ Step-by-step breakdown:                                    │
│                                                            │
│ Step 1: Email (Authority)    12 sent  2 replied  16.7%    │
│ Step 2: LinkedIn (Connect)   10 sent  1 accepted 10.0%    │
│ Step 3: Email (Social proof)  8 sent  1 replied  12.5%    │
│ Step 4: Email (Scarcity)      5 sent  0 replied   0.0%    │
│ Step 5: LinkedIn (DM)         3 sent  0 replied   0.0%    │
│ Step 6: LinkedIn (Engage)     2 done  —          —        │
│ Step 7: Email (Withdrawal)    1 sent  0 replied   0.0%    │
│                                                            │
│ Recent activity:                                           │
│ • 2 Apr — Nikesh Arora replied to Email 1 ✅              │
│ • 1 Apr — Email 2 sent to Matthew Prince                   │
│ • 31 Mar — Jay Chaudhry bounced ❌                        │
└────────────────────────────────────────────────────────────┘
```

Stats only show when there's data. Empty state shows:
"No activity yet. Add leads and launch the campaign."

---

## WHAT THIS REPLACES FROM LEMLIST

| Lemlist feature | Kiko equivalent | Cost |
|----------------|-----------------|------|
| Campaign list | /sequences page | $0 |
| Sequence builder | /sequences/:id Sequence tab | $0 |
| Lead import | /sequences/:id Leads tab (CRM search) | $0 |
| Analytics | /sequences/:id Performance tab | $0 |
| Email sending | cron-sequence-sender.js (Gmail API) | $0 |
| Reply detection | cron-sequence-reply-detect.js | $0 |
| LinkedIn automation | LinkedIn queue (manual send, copy-paste) | $0 |
| AI content generation | "Ask Kiko to write this step" | $0 |
| Template variables | {firstName} etc from company_intelligence | $0 |
| Personalisation | AI-powered per-contact (not just merge tags) | $0 |
| Psychology calibration | Cialdini per step (Lemlist doesn't have this) | $0 |
| Race calendar timing | Pre-race urgency (Lemlist doesn't have this) | $0 |

**Total Lemlist cost eliminated: $1,800-2,400/year**

---

## BUILD ORDER (next session)

### Phase 1: Replace Sequences.jsx (45 min)
- Clean campaign list with cards (not table)
- Each card: name, sequence summary, inline metrics, edit button
- "Generate Campaign" wizard (already built, fix the bug)
- No tabs, no split layout — just a list

### Phase 2: Rebuild SequenceDetail.jsx (2 hours)
- Header with back button, editable name, save button
- 3 tabs: Sequence | Leads | Performance
- Sequence tab: left flow panel + right editor (already partially built)
- Fix: use 7-touch template as default instead of 5-touch

### Phase 3: Build Leads tab (1.5 hours)
- Contact table with status, step progress, next send date
- "+ Add from CRM" modal — search contacts by company/name/title
- "+ Manual" modal — name, email, company, title
- Bulk enroll functionality (creates kiko_sequence_enrollments)
- Pause/Cancel per contact

### Phase 4: Build Performance tab (30 min)
- Stats cards (enrolled, sent, replied, rate, bounced)
- Per-step breakdown table
- Recent activity feed (from outreach_queue + enrollments)

### Phase 5: Fix Generate Campaign API (15 min)
- Already deployed fix for sbFetch bug
- Update default template from 5-touch to 7-touch
- Ensure Kiko uses 50-125 word emails per research

### Phase 6: Test end-to-end (30 min)
- Generate a cybersecurity campaign
- Add 3 contacts from CRM
- Verify emails queue correctly
- Verify LinkedIn messages appear in queue
- Check performance tab shows correct data

Total: ~5-6 hours

---

## DESIGN RULES FOR THIS BUILD

1. Dark glassmorphism throughout (match existing Kiko aesthetic)
2. No unnecessary chrome — every pixel earns its place
3. Empty states tell the user what to do next
4. Numbers only show when there's real data (no "0 0 0 0%" on launch)
5. One action per screen — what's the ONE thing the user does here?
6. Mobile responsive (sequence builder collapses to stacked on mobile)
7. All interactions give immediate feedback (save → "Saved ✓", enroll → count updates)
8. No extra API costs — uses existing Supabase queries, existing Claude models

---

## FILES TO CREATE/MODIFY

### New:
- src/components/sequences/AddLeadModal.jsx — CRM search + manual add
- api/sequences.js — CRUD endpoint (create, update, delete sequences)

### Replace completely:
- src/pages/Sequences.jsx — clean campaign list
- src/pages/SequenceDetail.jsx — 3-tab builder with leads + performance

### Modify:
- api/generate-sequence.js — use 7-touch template, 50-125 word emails
- kiko_sequences table — update 3 seeded sequences to 7-touch

### No changes to:
- api/cron-sequence-enqueue.js (works)
- api/cron-sequence-sender.js (works)
- api/cron-sequence-reply-detect.js (works)
- api/agents/data.js (works)
- api/kiko-tools.js (works)
- api/kiko.js (works)

---

END OF SPEC
