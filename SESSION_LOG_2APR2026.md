# KIKO BUILD SESSION — 2 April 2026
# Commits: dd0e8da → 3a79145 (14 commits)
# Duration: ~6 hours

## CHANGES DELIVERED

### EMAIL DRAFT SYSTEM (complete)
- EmailDraft.jsx: Interactive frame with Subject, To, body, tone CTAs, Send to Gmail
- isEmailDraft() detection: 3-layer — server format rule + thinking strip + broad patterns
- extractEmailSection(): handles ### SUGGESTED DRAFT, "Here's the email:", Subject: direct
- parseEmail(): inserts \n before Subject/To/Dear in concatenated text, strips sign-off/name
- Thinking collapse rewritten: splits at response boundary markers (not line-based)
- User message editing: click ✏ → textarea populates → submit truncates at edit point

### GMAIL INTEGRATION
- /api/gmail-draft.js: Silent draft creation via stored OAuth, no popup
- From: sunny@vanhawke.agency (auto-replaces .com), Helvetica 12pt HTML
- Subject: all em-dash variants + mojibake cleaned to plain hyphens
- Body: sign-off/name/company stripped before MIME construction
- Draft tracking: writes to kiko_draft_tracking for edit-delta learning

### TONE REWRITE
- /api/rewrite-email.js: Lightweight Haiku endpoint (claude-haiku-4-5-20251001, ANTHROPIC_KEY)
- "More Direct" / "Warmer Tone" / "Shorter" update body in-place
- "↩ Revert" button restores original body via originalBodyRef

### EMAIL QUALITY FEEDBACK LOOP
- kiko.js: Fetches style_lessons from kiko_draft_tracking when intent=outreach
- Injects [EMAIL WRITING FEEDBACK] section into system prompt
- cron-edit-delta.js: Saves major/moderate lessons to kiko_learning_log
- gmail-draft.js: Tracks all "Send to Gmail" button drafts
- Tested: seeded style lesson → Kiko applied specific time ask pattern

### CALENDAR EXPANSION
- MotoGP: 19 races inserted into race_calendar (Mar 1 - Nov 29)
- WEC: 8 races inserted (Apr 19 - Nov 7, Qatar postponed to Oct)
- Command Centre: F1 | Formula E | MotoGP | WEC selector tabs with countdown
- CommercialCalendar.jsx: Full 4-series support — toggles, cell coloring, detail pane, legend
- Color tokens: MotoGP #BE1621, WEC #00875A

### RACE-AWARE INTELLIGENCE
- cron-proactive.js: Pulls race_calendar as 6th data stream alongside news, replies, stages, tasks, stale deals
- Urgency tinting: CRITICAL ≤14d, HIGH ≤30d, NORMAL
- Haiku system prompt updated to recognise RACE WINDOW URGENCY
- getOutreachIntelligence: race_windows focus mode — next 6 races + stale deals needing contact

### CODE-SPLIT
- App.jsx: 11 pages wrapped in React.lazy() + Suspense boundary
- Bundle: 902KB → 670KB (26% reduction)
- Lazy chunks: Pipeline 30KB, Organisations 46KB, KikoCode 58KB, Calendar 22KB

### OUTREACH.JS FIXES
- From: auto-replaces vanhawke.com → vanhawke.agency
- Font: Helvetica,Arial,sans-serif; font-size:12pt (was system-ui 14px)
- Body cleanup: strips sign-off, Sunny Sidhu, Van Hawke before MIME
- Subject cleanup: all em-dash variants + mojibake → plain hyphen
- Clean body used in both plain text and HTML MIME parts

### KIKO.JS SYSTEM PROMPT ADDITIONS
- EMAIL FORMAT RULE: Forces ### SUGGESTED DRAFT header for outreach intent
- EMAIL WRITING FEEDBACK: Injects accumulated style lessons from kiko_draft_tracking

## BUGS FOUND AND FIXED
1. gmail-draft.js used SUPABASE_URL → fixed to VITE_SUPABASE_URL
2. rewrite-email.js used claude-3-5-haiku-20241022 → fixed to claude-haiku-4-5-20251001
3. rewrite-email.js used ANTHROPIC_API_KEY → fixed to ANTHROPIC_KEY
4. Thinking collapse split on <br/> → rewrote to split at response boundary markers
5. EmailDraft detection ran on raw text with thinking → now strips thinking first
6. extractEmailSection didn't match ### 3. SUGGESTED DRAFT → updated regex
7. Old DraftPreview component still imported → completely removed
8. outreach.js used userEmail directly → now auto-replaces to vanhawke.agency
9. outreach.js used system-ui 14px → now Helvetica 12pt
10. outreach.js didn't clean body/subject before MIME → now strips sign-off/name/dashes
