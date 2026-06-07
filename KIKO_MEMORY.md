
## Session Update — Sunday 7 June 2026 (Evening)

### PLATFORM REDESIGN (redesign-v2 branch — LIVE)

Major UI redesign deployed and live at kiko.vanhawke.agency. Feature-flagged via USE_REDESIGN_NAV and USE_REDESIGN_DASHBOARD in src/lib/featureFlags.js.

**Homepage changes (all verified via browser screenshots):**
- Greeting ABOVE date: "Good evening, Sunny" / "Sunday, 7 June 2026" (Source Serif 4, 36px, weight 300)
- Prompt bar: full pill capsule shape (borderRadius 9999), with +attach, mic, voice EQ, and send button
- Submit button: solid BLACK (#0A0A0A) default → ORANGE (#E8700A) when user types (like Claude chat)
- Bento stats (Pipeline $3.3m / Replies / Tasks) REMOVED from homepage
- Voice avatar/dots REMOVED from homepage (old iteration)
- Kiko float HIDDEN on homepage (Layout.jsx: !isMobile && !isHome)
- 5 suggestion chips: "Brief me", "Helsing status", "Draft follow-up for Ball Corp", "Pipeline value", "Partnership conflicts"
- Suggestion chips wired to handleSubmit — clicking triggers Kiko chat with that text
- Priority Actions: dynamic from Supabase (stale deals, draft pending, overdue tasks, hot replies)
- Priority Actions WIRED: clicking any card fires kiko_prefill custom event → auto-submits to Kiko with contextual prompt
- F1 2026 race calendar: CORRECT dates from official F1 sources (24 races). Dynamic — always shows next upcoming race. As of June 7: Monaco GP is today (race day), Spanish GP (June 12-14) shows next
- KikoFloat panel: 380px wide, borderRadius 14, "Kiko" header in Source Serif 4

**Conversation mode prompt bar:**
- Same pill shape as homepage (borderRadius 9999)
- Same padding structure (14px 14px 14px 20px)
- Same width as message content (maxWidth 680)

**Other page changes:**
- Campaigns: card-list overview with real enrollment data (114 enrolled, 2 bounced for Alpine)
- Messenger: flat Slack-style message rows (not iMessage bubbles), Call/Search/Files icon buttons
- Nav: 6 tabs (Today, Pipeline, Records, Messenger, Campaigns, Partnership Matrix) + gear icon for More

**Known issues to fix:**
- Text rendering in chat: paragraph breaks sometimes lost during streaming (e.g. "research.Memory" runs together). Investigate delta concatenation in streaming handler.
- Pipeline page: needs flat flex layout (remove bordered column containers)
- Records page: eyebrow should say "CRM" not "DATABASE / PROSPECT UNIVERSE"
- Campaign Builder: 4-step wizard not yet built

### INTELLIGENCE DOCTRINE (deployed to kiko-self-knowledge.js)

Core operating principle codified and deployed. Kiko now has explicit instructions for:

1. **Data Access by Role**: Super admin (Sunny) sees ALL data from ALL users across ALL channels. Regular users (Matt) see only their own emails/LinkedIn + shared CRM.
2. **7-Step Prospect Briefing**: Every prospect query must search CRM + Gmail (all inboxes for super_admin) + LinkedIn + memory files + draft actions + outreach queues, then synthesise.
3. **Lead Record Management**: Proactively track, store, update lead records from all touchpoints. Flag data gaps (e.g. "Mike Kelley has no CRM record despite 3 years of correspondence").
4. **Psychological Reasoning**: Communication pattern analysis, decision-making signals, relationship temperature, predictive behaviour, objection mapping.
5. **Market Intelligence**: Monitor company announcements, fundraising, sponsorships, partnerships, products — surface proactively when relevant to conversion.

### BUILD SPEC LOCATION
The definitive sandbox render code is in REDESIGN_BUILD_SPEC.md at /Users/sunny/Desktop/vela-platform/REDESIGN_BUILD_SPEC.md. Cross-reference against this for every UI change.

### GIT COMMITS (redesign-v2 branch)
2f1607f fix: Conversation prompt bar — pill shape, padding, width aligned
8614d09 feat: Intelligence Doctrine codified in kiko-self-knowledge.js
591b5ea fix: prompt bar borderRadius 9999 (full pill capsule)
e1d9863 fix: remove handleSubmit from kiko_prefill useEffect dependency — crash fix
e1a8bb1 feat: prompt bar borderRadius 28, greeting/date spacing, priority actions wired via kiko_prefill
4fa618d fix: submit button BLACK default/ORANGE on input, greeting ABOVE date, correct 2026 F1 calendar
8f8accb feat: remove bento stats, dynamic F1 race calendar, hide Kiko float on homepage, restore icons, orange send
