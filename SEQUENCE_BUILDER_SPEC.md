# KIKO SEQUENCE BUILDER — UI SPEC
# Based on Lemlist campaign UI (reviewed live 2 April 2026)
# For next session build using Cowork + VS Code local dev

---

## WHAT LEMLIST HAS (from live review)

### Campaign List Page
- Table: Status toggle | Campaign Name (with emoji icon) | Leads completed (e.g. 3/33) | Sender | Tag | Created at | Actions (star, chart, ...)
- Filters: Status, Sender, Tags, Creators, Favourites
- "+ Create campaign" button top-right
- Search bar

### Campaign Detail — 4 tabs across top:
1. **Overview** — Funnel (Contacted → Opened → Interaction → Answered → Interested → Interrupted) with bar charts + percentages. Campaign statistics: leads in campaign, leads launched, leads reached, messages sent, deliverability rate.
2. **Sequence** — Visual flow builder (LEFT PANEL: vertical step cards connected by lines. RIGHT PANEL: step editor with subject line, email body, sender, template variables)
3. **Lead list** — Table of enrolled contacts with status
4. **Launch** — Campaign activation controls

### Sequence Builder (the critical piece):
- LEFT: Vertical flow → "Sequence start" → step cards connected by vertical lines
- Each step card shows: timing label ("Send immediately" / "Wait for 3 days"), channel icon (email/LinkedIn), step name, preview text
- Delay between steps is editable (pen icon)
- Step types: Email, Visit profile, Invitation (LinkedIn), Manual task
- RIGHT: When a step is selected, shows full editor:
  - Step type label + "Send automatic email"
  - "Mark as manual" toggle
  - Sender selector (Sunny Sidhu sunny@vanhawke.agency)
  - Subject line input
  - Rich text email body editor
  - Template variables: {{firstName}}, {{companyName}}, etc.
  - "Deliverability boost" + "Templates" buttons

---

## WHAT KIKO'S SEQUENCE BUILDER NEEDS

### Page 1: Campaign List (/sequences)
**Replace current monitoring dashboard with a proper campaign manager.**

```
┌─────────────────────────────────────────────────────────┐
│ Outreach Sequences                    [+ New Sequence]  │
│ Automated multi-step outreach                           │
├─────────────────────────────────────────────────────────┤
│ Stats: Active 3 | Enrolled 0 | Replied 0 | Rate 0%     │
├─────────────────────────────────────────────────────────┤
│ ⚡ │ Authority-Led C-Suite     │ 0/0  │ Active │ 1d ago │
│ ⚡ │ Post-Funding Accelerator  │ 0/0  │ Active │ 1d ago │
│ ⚡ │ Re-Engagement Interrupt   │ 0/0  │ Active │ 1d ago │
└─────────────────────────────────────────────────────────┘
```

**Columns:** Status toggle | Name | Leads (completed/total) | Status badge | Created | Actions (edit, duplicate, delete)
**"+ New Sequence" button** opens the builder
**Click a row** opens the sequence detail (Page 2)

### Page 2: Sequence Detail (/sequences/:id)
**4 tabs across the top (matching Lemlist):**

#### Tab 1: Overview
- Funnel chart: Enrolled → Email 1 Sent → Opened → Replied → Meeting Booked
- Stats cards: Leads enrolled, Emails sent, Reply rate, Bounce rate
- Activity timeline: Recent events (sent, replied, bounced)

#### Tab 2: Sequence Builder (THE KEY UI)
Split layout: 40% left panel (flow), 60% right panel (step editor)

**LEFT PANEL — Visual Flow:**
```
┌──────────────────────┐
│   Sequence start     │
└──────────┬───────────┘
           │
┌──────────┴───────────┐
│ ⏱ Send immediately   │  ← editable delay
│ ┌──────────────────┐ │
│ │ ✉ Email          │ │  ← click to edit in right panel
│ │ "Haas F1 Team —  │ │
│ │  Exclusive..."   │ │
│ └──────────────────┘ │
└──────────┬───────────┘
           │
┌──────────┴───────────┐
│ ⏱ Wait for 3 days    │  ← click to change delay
│ ┌──────────────────┐ │
│ │ 🔗 LinkedIn      │ │
│ │ "Visit profile"  │ │
│ └──────────────────┘ │
└──────────┬───────────┘
           │
┌──────────┴───────────┐
│ ⏱ Wait for 2 days    │
│ ┌──────────────────┐ │
│ │ ✉ Email          │ │
│ │ "Following up..."│ │
│ └──────────────────┘ │
└──────────┬───────────┘
           │
    [+ Add step]  ← button to add new step
```

**RIGHT PANEL — Step Editor (appears when a step is clicked):**
```
┌─────────────────────────────────────────────────────┐
│ ✉ Email · Send automatic email                      │
│                                                     │
│ Channel: [Email ▾]  [LinkedIn ▾]                    │
│                                                     │
│ Sender: [Sunny Sidhu (sunny@vanhawke.agency) ▾]     │
│                                                     │
│ Subject:                                            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Haas F1 Team — Exclusive {category} Partnership │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Body:                                               │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Dear {firstName},                               │ │
│ │                                                 │ │
│ │ At this level of commercial engagement,         │ │
│ │ {category} partnerships have become essential   │ │
│ │ strategic assets in Formula 1...                │ │
│ │                                                 │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Variables: {firstName} {lastName} {companyName}      │
│ {category} {revenue} {ceo} {recentNews} {raceWindow}│
│                                                     │
│ Psychology: [Authority ▾]  Cialdini: [Reciprocity ▾]│
│                                                     │
│ [🤖 Ask Kiko to write this]  [Save step]            │
└─────────────────────────────────────────────────────┘
```

**Key features of the step editor:**
- Channel selector: Email or LinkedIn (dropdown)
- For Email: subject line + rich text body + template variables
- For LinkedIn: message text (300 char limit for connection requests)
- Template variables auto-complete from company_intelligence fields
- "Ask Kiko to write this" button → sends context to /api/kiko and auto-fills
- Psychology selector: maps to Cialdini principle for this step
- Delay editor: click the timing label between steps to change days
- "+ Add step" button at bottom of flow to append new steps
- Drag to reorder steps (stretch goal)

#### Tab 3: Lead List
Table of enrolled contacts for this sequence:
```
┌──────────────────────────────────────────────────────────┐
│ Name           │ Company      │ Step │ Status  │ Next    │
├──────────────────────────────────────────────────────────┤
│ Nikesh Arora   │ Palo Alto    │ 2/5  │ 🟢 Active│ 8 Apr  │
│ Matthew Prince │ Cloudflare   │ 1/5  │ 🟢 Active│ 9 Apr  │
│ Jay Chaudhry   │ Zscaler      │ 3/5  │ ✅ Replied│ —      │
│ Kevin Mandia   │ Mandiant     │ 2/5  │ ❌ Bounced│ —      │
└──────────────────────────────────────────────────────────┘
```
- Progress bar per contact (step X of Y)
- Status badges: Active (green), Replied (check), Bounced (red), Paused (amber), Completed (grey)
- Pause/Cancel buttons per row
- "+ Add leads" button → modal to search CRM contacts or enter email manually
- Bulk actions: Pause all, Resume all, Export

#### Tab 4: Launch
- Campaign status toggle (Active/Paused)
- Schedule settings: which days to send, time window
- Daily send limit display (30/day)
- "Launch sequence" / "Pause sequence" primary action button

---

## NEW SEQUENCE CREATION FLOW

### Step 1: Click "+ New Sequence"
Modal or new page with:
- Sequence name input (e.g., "Haas F1 - Cybersecurity C-Suite")
- Target persona description (e.g., "CISO/CTO at $500M-$5B tech")
- Template selector: Start from scratch | Authority 5-Touch | Post-Funding 3-Touch | Re-Engagement
- If template selected: pre-populates steps with default content

### Step 2: Build sequence (Tab 2 — Sequence Builder)
- Add steps using "+ Add step" button
- Choose channel per step (Email / LinkedIn)
- Set delay between steps
- Write or AI-generate content for each step
- Set psychology principle per step

### Step 3: Add leads (Tab 3 — Lead List)
- Search CRM contacts by company name
- Select contacts to enroll
- Or enter email manually
- Shows company intelligence preview when selecting

### Step 4: Launch (Tab 4)
- Review sequence summary
- Set schedule preferences
- Click "Launch"

---

## WHAT MAKES KIKO'S BUILDER SUPERIOR TO LEMLIST

| Feature | Lemlist | Kiko |
|---------|---------|------|
| Template variables | Basic: {{firstName}}, {{companyName}} | AI-enriched: {revenue}, {ceo}, {cmo}, {competitors}, {recentNews}, {raceWindow}, {fundingRound} — all from company_intelligence |
| Content generation | Manual write or basic AI | "Ask Kiko to write this" — Kiko drafts using company intelligence + psychology engine + style lessons |
| Psychology mapping | None | Each step tagged with Cialdini principle, mapped to deal stage |
| Timing intelligence | Fixed delays | Smart scheduling: Tue-Thu 8-10am, post-funding windows, pre-race urgency, 72hr spacing |
| Reply learning | Tracks opens/replies | Tracks + feeds reply rates by approach back into future drafts |
| Race calendar | None | Auto-adjusts urgency based on proximity to F1/FE/MotoGP/WEC races |
| Company intelligence | Basic enrichment | 30 structured fields auto-injected: funding, leadership, competitors, sponsorship fit score |

---

## TECHNICAL IMPLEMENTATION

### React Components to Build
```
src/pages/Sequences.jsx          — Campaign list (REPLACE current monitoring page)
src/pages/SequenceDetail.jsx     — 4-tab campaign detail (NEW)
src/components/sequences/
  SequenceFlow.jsx               — Visual step flow (left panel)
  StepEditor.jsx                 — Step content editor (right panel)
  StepCard.jsx                   — Individual step card in the flow
  DelayEditor.jsx                — Delay between steps (inline edit)
  LeadTable.jsx                  — Enrolled contacts table
  AddLeadModal.jsx               — Search CRM + enroll contacts
  NewSequenceModal.jsx           — Create new sequence wizard
  SequenceOverview.jsx           — Funnel + stats
  LaunchPanel.jsx                — Activate/pause controls
```

### Database (already built)
- kiko_sequences — sequence definitions with steps JSONB
- kiko_sequence_enrollments — enrolled contacts with step tracking
- kiko_outreach_queue — scheduled emails
- kiko_linkedin_queue — LinkedIn message drafts

### API (already built)
- cron-sequence-enqueue.js — daily email generation
- cron-sequence-sender.js — 30min send cycle
- cron-sequence-reply-detect.js — reply/bounce detection
- data.js operations: start_sequence, sequence_status, pause_sequence, cancel_sequence

### New API endpoint needed
```
api/sequences.js — CRUD for sequences (create, read, update steps, delete)
  POST /api/sequences — create new sequence
  GET /api/sequences — list all
  GET /api/sequences?id=X — get one with enrollments
  PATCH /api/sequences — update steps/name/status
  DELETE /api/sequences — soft delete
```

### Route additions
```jsx
// App.jsx
<Route path="sequences" element={<Sequences />} />
<Route path="sequences/:id" element={<SequenceDetail />} />
```

---

## BUILD ORDER (next session)

1. Replace Sequences.jsx with campaign list (1h)
2. Build SequenceDetail.jsx with 4 tabs (30min)
3. Build SequenceFlow.jsx — visual step flow (1.5h)
4. Build StepEditor.jsx — content editor with variables (1h)
5. Build LeadTable.jsx + AddLeadModal.jsx (45min)
6. Build NewSequenceModal.jsx (30min)
7. Build api/sequences.js CRUD endpoint (30min)
8. Wire "Ask Kiko to write this" button (15min)
9. Test end-to-end: create → edit steps → add leads → launch (30min)

Total: ~6-7 hours across 1-2 sessions

---

END OF SPEC
