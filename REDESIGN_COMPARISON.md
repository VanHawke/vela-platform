# REDESIGN COMPARISON — Sandbox Render vs Live Platform
## Every difference must be fixed. No exceptions.

### METHODOLOGY
1. Read sandbox render code for each page
2. Screenshot the live page
3. List every difference
4. Fix each one
5. Screenshot again to verify
6. Move to next page

---

## HOME PAGE — Sandbox vs Live

### Sandbox render (HomePage function):
- Greeting: `fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 36` — "Good {greeting}, Sunny."
- Date: `color: T.textSec, fontSize: 13, fontWeight: 450` — "{dayName}, {dateStr}"
- Prompt bar: pill-shaped, `borderRadius: T.rPill`, placeholder "Ask Kiko anything — deals, contacts, drafts, strategy…"
  - Has BLACK CIRCLE SEND BUTTON inside (right: 6, 36x36px, T.accent background, arrow SVG)
  - `padding: "14px 52px 14px 20px"` — room for the button
- Suggestion chips: `["Brief me", "Helsing status", "Draft follow-up for Ball Corp", "Pipeline value", "Partnership conflicts"]`
  - Style: `padding: "5px 14px", borderRadius: T.rPill, border: 1px solid T.border, background: "#fff", fontSize: 12, color: T.textSec, fontWeight: 450`
  - Centered, wrapped, `marginBottom: 40`
- Priority Actions: SectionHead "Priority Actions" (Source Serif 4, 18px, weight 300)
  - Cards with priority dot + title + detail + time
- Race banner: Card with flag SVG + race name + date + circuit + days countdown

### Live differences to fix:
- [ ] Greeting font size is 48px on live, should be 36px per sandbox
- [ ] Subtitle "What would you like to work on?" exists on live but NOT in sandbox — REMOVE IT
- [ ] Prompt bar doesn't have the black circle send button visible (it has mic/voice/sparkle icons instead)
- [ ] Suggestion chips are cutting off at bottom, not wrapping properly
- [ ] Suggestion chips text doesn't match sandbox exactly
- [ ] marginBottom: 40 between chips and priority actions may not be correct
- [ ] Bento stats (Pipeline $3.3m, Replies 10, Tasks 47) exist on live but NOT in sandbox render — these should stay (they're a useful addition) but positioned correctly

---

## PIPELINE — Sandbox vs Live

### Sandbox render (PipelinePage function):
- PageHead: eyebrow "REVENUE", title "Pipeline"
  - Stats: Total (fmtCurrency), Weighted (fmtCurrency), Deals (count) — all Source Serif 4, 22px, weight 300
  - Toolbar: "+ New deal" button (T.accent bg, white text, borderRadius 4)
- Kanban: `padding: "0 44px 24px", display: "flex", gap: 10`
  - Each stage: minWidth 190, flex 1
  - Stage header: `fontSize: 11, fontWeight: 500, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.06em"` + count on right
  - Deal cards: Card component (14px padding, 14px radius, hover lift)
    - Company name: `fontSize: 13, fontWeight: 500`
    - Value: `fontSize: 12, fontWeight: 500, fontFamily: T.fontDisplay` (Source Serif 4!)
    - Contact: `fontSize: 12, color: T.textSec, fontWeight: 400`
    - Sector + probability: `fontSize: 11, color: T.textTer, marginTop: 3` — "Sector · probability%"
  - Empty stage: dashed border, "—" text

### Live differences to fix:
- [ ] Stage headers should be clean uppercase text labels (not inside bordered column containers)
- [ ] The live pipeline wraps stages in bordered column containers (.pl-col) — sandbox has NO column containers, just flex children
- [ ] Deal cards in sandbox show company name + value on same row, contact below, sector·probability below
- [ ] Live pipeline has initials circle + company name row, then contact, then sector tag + value
- [ ] The LAYOUT is fundamentally different — sandbox is flat flex, live is bordered columns

---

## RECORDS — Sandbox vs Live

### Sandbox render (RecordsPage function):
- PageHead: eyebrow "CRM", title "Contacts" or "Organisations"
  - Subtitle with count
  - Toolbar: People/Companies segmented control (pill toggle) + "+ Add" button
- Search input: `maxWidth: 320, borderRadius: T.r (8px)`
- Table in Card container (border, 14px radius)
  - Header row: uppercase labels
  - People rows: Avatar (hue-rotated) + Name, Company, Title, Status badge, Last Contacted
  - Companies rows: Company, Industry, Size, Location, Deals, Contacts

### Live status:
- [x] Records.jsx exists with People/Companies toggle — DONE
- [ ] The PageHead eyebrow says "DATABASE / PROSPECT UNIVERSE" — should say "CRM"
- [ ] Need to verify table styling matches sandbox exactly

---

## MESSENGER — Sandbox vs Live

### Sandbox render (MessengerPage function):
- Layout: `display: "flex", height: "100%"` — sidebar + chat area
- Sidebar: `width: 280, background: T.surface (#F5F4F1)`
  - Search input in white card with border
  - Chats/Calls tabs with underline active state
  - Direct Messages section: avatar + name + presence dot + last msg + time + unread badge
  - Channels section: # prefix + name + last msg + time
  - Footer: online status indicator
- Chat header: avatar + name + status OR # + name + member count
  - Action buttons: Call, Search, Files (IconBtn components)
- Messages: FLAT ROWS (NOT BUBBLES!)
  - Each message: `display: "flex", gap: 10, padding: "6px 4px"`
  - Avatar (32px circle) on left
  - Name (13px, fontWeight 600) + time (11px, T.textTer) on baseline
  - Content below: `fontSize: 13, lineHeight: 1.6, fontWeight: 400`
  - Hover: background rgba(0,0,0,0.015), reaction toolbar appears
- Compose: bordered card with input + action buttons (attach, emoji, @mention) + send button

### Live differences to fix:
- [ ] Verify flat message rows are actually rendering (Sunny says they're not)
- [ ] Sidebar should use T.surface (#F5F4F1) background
- [ ] Chat header needs Call/Search/Files icon buttons (not Audio/Video colored buttons)
- [ ] Compose area should match: bordered card, input, +/emoji/@/send
- [ ] No "Drag files to upload" hint text in sandbox

---

## CAMPAIGNS — Sandbox vs Live

### Sandbox render (CampaignsPage function):
- PageHead: eyebrow "OUTREACH", title "Campaigns"
  - Stats: sequence count, total enrolled — Source Serif 4, 22px
  - Toolbar: "+ New Campaign" button
- Card list: each campaign is a Card with:
  - Name (14px, fontWeight 500) + status badge
  - Metrics row: Enrolled, Sent, Open %, Reply %, Bounced — Source Serif 4, 18px, weight 300
  - Click → drills into campaign detail

### Campaign DETAIL (DrillView, type "campaign"):
- Header with back arrow, campaign name, "status · enrolled enrolled"
- Metric tiles: Enrolled, Sent, Opened, Replied, Bounced — each in bordered card, Source Serif 4, 22px
- SectionHead "Prospects"
- Prospects table in Card container with:
  - Name, Company, Status badge, Step #, Opened ✓/—, Replied ✓/—, Last Activity

### Campaign BUILDER (CampaignBuilder function):
- PageHead: title "New Campaign"
- 4-step progress bar: Name & Target → Sequence → Timing → Review
- Step 1: Campaign Name input, Target Audience textarea, Segment selector pills
- Step 2: Sequence builder — numbered steps with type toggle, delay, subject, body
- Step 3: Timing — send window, timezone, daily limit
- Step 4: Review — summary card with step list
- Back/Continue navigation buttons

### Live differences to fix:
- [x] Overview card list — DONE (added)
- [ ] Campaign DETAIL view needs metric tiles (bordered cards, Source Serif 4, 22px)
- [ ] Campaign BUILDER wizard (4-step) needs to be built
- [ ] Internal pages completely missing

---

## KIKO FLOAT — Sandbox vs Live

### Sandbox render (KikoPanel function):
- Position: fixed, bottom: 20, right: 20
- Panel: 380x500px, 14px radius, float shadow
- Header: "Kiko" in Source Serif 4, 16px, weight 400
- Messages: kiko left-aligned, user right-aligned
  - Kiko: borderRadius "12px 12px 12px 4px", background rgba(0,0,0,0.03)
  - User: borderRadius "12px 12px 4px 12px", background T.accent (#0A0A0A)
- Input: pill-shaped with send button

### Live status:
- [x] Kiko float exists and works — DONE

---

## SETTINGS PANEL — Sandbox vs Live

### Sandbox render (SettingsPanel function):
- Slide-over from right, 380px wide
- Header: "Settings" in Source Serif 4, 18px, weight 300
- Sections: Profile, Integrations, Team — each with items in bordered card

### Live status:
- [ ] Settings accessible via gear icon + avatar dropdown
- [ ] Settings panel styling needs to match

---

## CHAT SIDEBAR — Sandbox vs Live

### Sandbox render:
- Left-edge chevron toggle (18x44px)
- Width 250px, white background
- Search + New chat button
- Time-grouped history: Today, Yesterday, Previous 7 Days, Older
- Footer: keyboard shortcuts

### Live status:
- [x] Chat sidebar exists and works — DONE
