# CAMPAIGNS REDESIGN — BUILD BRIEF
## Ready to execute next session. Priority 1.

### CURRENT STATE (verified)
- Campaigns.jsx is 1644 lines at src/pages/Campaigns.jsx
- Overview card-list mode ALREADY DONE (lines 533-590) — matches sandbox
- PageHead "OUTREACH" eyebrow ALREADY DONE
- Card metrics (Enrolled, Active, Replied, Reply%, Bounced) in Source Serif 4 ALREADY DONE
- Click card → sets selectedId → currently falls to OLD sidebar layout (needs replacing)
- AI auto-builder exists (different from sandbox 4-step wizard)

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
