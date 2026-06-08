# CAMPAIGNS REDESIGN — BUILD BRIEF
## COMPLETED June 8, 2026.

### CURRENT STATE (verified June 8 2026)
- Campaigns.jsx is ~1814 lines at src/pages/Campaigns.jsx (redesign-v2 branch)
- Overview card-list mode DONE — matches sandbox
- Campaign drill-in DONE — full-page with back button header + metric tile cards
- Campaign Builder 4-Step Wizard DONE — writes to kiko_sequences
- PageHead "OUTREACH" eyebrow DONE
- All existing functionality preserved (bulk actions, prospect detail, pause/resume, archive, delete)
- Visually verified in production via Chrome screenshots

### WHAT WAS BUILT (June 8 2026)
1. **Campaign Drill-In → Full-Page Layout** (commit 7f03f33)
   - Removed left sidebar rail when campaign is selected
   - Added back-button header (Source Serif 4 22px, status badge, toolbar)
   - Replaced horizontal stats bar with individual metric tile cards
   - Filter bar padding aligned to 44px
   - All existing functionality preserved

2. **Campaign Builder 4-Step Wizard** (commit d955d6c)
   - Step 1: Name & Target (name input, audience textarea, segment pills)
   - Step 2: Sequence Builder (Email/LinkedIn steps with delay, subject, body)
   - Step 3: Timing (send window, timezone, daily send limit — Matt Smith's account)
   - Step 4: Review summary + Launch Campaign button
   - Writes to kiko_sequences (name, steps JSON, is_active, metadata)
   - Launch disabled when no name entered

3. **Kiko API Fix** (commit 7f03f33)
   - Fixed thinking parameter: type:'enabled' → type:'adaptive' for Opus 4.8
   - Deployed to Hetzner and verified working

### WHAT NEEDS BUILDING
1. **Campaign Builder 4-Step Wizard** (MISSING — sandbox lines CampaignBuilder component)
   - Step 1: Name & Target (name input, audience textarea, segment pills)
   - Step 2: Sequence Builder (add Email/LinkedIn steps with timing)
   - Step 3: Timing (send window, timezone, daily send limit)
   - Step 4: Review (summary card with all steps listed)
   - MUST write to: kiko_sequences table (name, steps JSON, is_active, category, team)
   - Progress bar: 4 segments, filled/empty

2. **Campaign Drill-In View** (NEEDS RESTRUCTURING)
   - Current: old sidebar + right panel layout
   - Target: full-page drill-in with back button header
   - Metric tiles: Enrolled, Sent, Opened, Replied, Bounced (individual cards, Source Serif 4)
   - Prospect table: Name, Company, Status, Step, Opened, Replied, Last Activity
   - Keep ALL existing functionality (pause/resume, bulk actions, add prospects)

### DATA MODEL (from source code)
- kiko_sequences: id, name, is_active, archived, steps (JSON), category, team, created_at
- kiko_sequence_enrollments: id, sequence_id, contact_name, contact_email, contact_title, company, status, current_step, reply_detected_at, bounce_detected_at
- kiko_outreach_queue: enrollment_id, step_number, channel, status, sent_at, opened_at, opens_count, clicked_at, clicks_count, reply_received_at, subject, scheduled_for

### WIRING RULES
- New campaign wizard writes to kiko_sequences with steps JSON
- "Launch Campaign" sets is_active: true
- Enrollment creates rows in kiko_sequence_enrollments
- cron-sequence-enqueue creates kiko_outreach_queue items
- cron-sequence-sender sends from queue
- Realtime subscriptions already exist for live updates

### SANDBOX REFERENCE
The CampaignsPage and CampaignBuilder components in the sandbox render code define the exact UI.

### AFTER CAMPAIGNS: Records → Pipeline → Messenger
