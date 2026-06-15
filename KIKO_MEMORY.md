
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

## Session 73 (14 Jun 2026) — Today page clear + F1 calendar fix
- Today page CLEARED to fresh slate (reversible, ZERO deletes): kiko_alerts dismissed (83), kiko_draft_actions pending->dismissed (283), overdue tasks data.completed=true (69).
- F1 calendar was wrong in THREE places: (1) race_calendar DB names corrected — 14 Jun -> 'Barcelona-Catalunya Grand Prix', 13 Sep -> 'Spanish Grand Prix'. (2) next-race DB query gt('date') -> gte (excluded today's race on race day). (3) RedesignHomeDashboard hardcoded F1_2026 array ACTUALLY drove the visible card — fixed names + strict > -> r.date>=today + 'Today' label.
- Stale-deal nudges (Decagon/Thomson Reuters): dashboard excluded by data.archived flag but ref deals archived via status='archived' (field mismatch). Query now excludes status archived too — no data touched; 15 archived ref deals no longer surface.
- Commits 1365711 / 1269bcd / 28c19ab. Live bundle index-BY3wFa_7.js. Visually verified Today page: race correct, zero priority items.
- INFRA NOTE: desktop-commander edit_block/read_file API stalled (4-min timeouts) mid-session; start_process stayed alive — applied edits via node scripts. If recurs, restart Claude Desktop.

## Session 74 (14 Jun 2026) — Archive feature + archived-is-first-class
- ARCHIVE = tab inside Pipeline (Pipeline | Archive toggle). Lists deals data->>status='archived'; opening one = re-engagement dossier. Subtitle "Dormant relationships — full history and re-engagement intelligence, ready to reopen."
- RING-FENCE (core): all deals visible to everyone, but CORRESPONDENCE scoped to the verified viewer. super_admin (Sunny) sees ALL correspondence w/ a prospect; a 'user' (Matt) sees only what HE sent + replies. Server-side off verified identity (api/_auth.js stamps req.body.userEmail), never client. Engine api/lib/dossier.js; Gmail scoped by THREAD OWNERSHIP not mailbox; allowedEnrollmentsFor fails closed.
- v1 DOSSIER: POST /api/archive/dossier {dealId} -> ring-fenced correspondence timeline (emails + kiko_outreach_queue + kiko_linkedin_queue, deduped). api/archive-dossier.js + src/components/archive/ArchivePanel.jsx.
- v2 BRIEF: POST /api/archive/brief {dealId, generate?}. generate=true -> Opus 4.8 + web_search (~45s) fuses ring-fenced dossier + company_intelligence + live web -> {verdict warm_reopen|cool_hold|do_not_reopen, headline, counterpart_read, company_context, recommendation, suggested_angle, timing}. falsy -> cache read. Cached in kiko_archive_briefs keyed (deal_id,user_id) — per-viewer so ring-fence holds. Engine api/lib/archive-brief.js (buildBrief+readBrief); falls back to cached on failure. TR test: warm_reopen, found May-12-2026 Anthropic/CoCounsel MCP announcement + Q1 rev $2,087M +10% + Williams F1 history.
- CHAT TOOL: reengagement_brief in api/kiko-tools.js — resolves company name -> archived deal -> SAME engine, ring-fenced via asker's userEmail. "Should we reopen Thomson Reuters?" -> Kiko returned the warm_reopen read + cross-referenced the dead thomsonreuters.com bounce -> recommend LinkedIn. One engine, two surfaces.
- RE-ACTIVATE button (Archive dossier): status->active, drops archived_at/archive_reason (stage preserved), refreshes list. Inline two-step confirm — NOT window.confirm (native dialog froze the Chrome renderer + wedged both MCP servers).
- ARCHIVED IS FIRST-CLASS — fixes the "archived deals still showing as Today pills / counted active" disconnect, at 3 layers: (1) GENERATION — monitors/pipeline-monitor.js + api/cron-daily-intelligence.js skip status archived/won/lost (pipeline-monitor was checking STAGE not status = the bug flagging 15 archived ref deals as deal_stale). (2) SURFACING — Pipeline excludes status=archived from active board+stats (header was "15 ACTIVE DEALS" = the archived deals; now 0); Today already does (28c19ab). (3) TRANSITION — Postgres trigger trg_cascade_deal_archive: deal flips to status=archived -> auto-dismiss its kiko_alerts (entity_id + company) + complete its tasks, however archived. Verified in isolation.
- KIKO AUDIT (v2): ring-fence SOLID (cache keyed (deal_id,user_id), inherits dossier.js thread-ownership isolation, no cross-viewer leak). Verified 2 disk-invisible items: UNIQUE(deal_id,user_id) on kiko_archive_briefs EXISTS; company_intelligence.enriched_at EXISTS (timestamptz). Hardened Opus call -> fallback to cached.
- COMMITS (redesign-v2): fcae356 (v1) / 3350ca8 (v2 brief + scroll fix) / 32450a9 (monitor archived filter + monitors/ sync) / a1fe2dd (Pipeline active-deals stat) / cdb7e23 (brief hardening) / 88fcc8d (bible) / f43df0a (chat tool) / 9f2c78a (re-activate button). Migrations: kiko_archive_briefs, cascade_deal_archive_cleanup.
- NOTES: monitors/ (System B, 6 monitors via monitors/scheduler.js, in-process by server.js) had DRIFTED — edited on server w/o committing; re-synced + committed. Commit monitor changes going forward. INFRA: window.confirm + a wedged Chrome tab froze BOTH desktop-commander + Claude-in-Chrome (4-min hangs); restart Claude Desktop + close the frozen tab if it recurs.

## Session 75 (14 Jun 2026) — Draft engine (kill AI-slop) + content-aware float + chip/panel fixes
- CONTACT DRAFT ENGINE — POST /api/contact/draft (api/lib/contact-draft.js buildContactDraft; route api/contact-draft.js; registered server.js). Replaces ContactDetail handleDraftWithKiko's hardcoded "Draft a COLD OUTREACH email" prompt that ignored the relationship + fed a formulaic phrase list ("At this level"/"In practice") with NO correspondence/voice = AI slop. New engine gathers (1) REAL correspondence (emails from_address ilike + to_addresses contains + kiko_outreach_queue), (2) REAL voice (kiko_email_style_reference, 21 real sent emails, limit 3), (3) firmographics from BOTH company_intelligence (deep, 30 cos) AND companies table (data jsonb shell, 2,168 cos: totalFunding/revenueEst/valuation/competitors) merged. Opus writes in demonstrated voice, HONEST about stage (explicit "do NOT fabricate circling-back" when corr empty; no invented figures). Returns {subject, body, to, had_correspondence, correspondence_count, intel_found}. Frontend rewired to JSON fetch + setKikoDraft.
- KIKO VERIFICATION (this session, via /api/kiko) caught 2 real things: (a) the draft engine was only reading company_intelligence (1.4% populated) and MISSING the companies-table firmographics — Justworks shell has $505M/$100M ARR/$1.3B/HR Tech/competitors; fixed gatherIntel to read+merge both (commit cb3492e), re-tested Aanchal → intel_found now true. (b) lingering stale follow-ups — closed them (see below).
- FLOAT CHIPS now content-aware: useDynamicChips contextualChips(ctx) reads window.kikoPageContext + re-renders on 'kiko_page_context' event (contact_detail/company_detail/sequence_detail → entity-specific chips; else static PAGE_CHIPS). Was static per top-level page regardless of the entity viewed.
- HOME CHIPS: deal query excludes status=archived (NanoXplore no longer surfaces); chip click fires prompt in chat only (removed simultaneous navigate = the glitch to the now-empty pipeline). KikoChat line ~1839.
- FOLLOW-UP CLEANUP: the home-chip "cleo overdue" was the ONLY awaiting_reply row (PostHog x Haas F1; PostHog archived) — closed it. Kiko flagged 2 more PostHog/cleo rows (status followed_up) + 4 test rows (Test/Test Email/Test schedule) still open — all closed. kiko_follow_ups now 0 open. Archive cascade trg_cascade_deal_archive extended to close follow-ups status in (awaiting_reply, followed_up) for the archived company.
- PORTAL FIX: SequenceDetail prospect slide-over was position:fixed inset:0 but clipped by an ancestor containing block (name cut above title). Wrapped in createPortal(document.body).
- DATA AUDIT: 4,233 contacts — email 88% (3,727), LinkedIn 99.7%, email+LinkedIn 3,718 (Tier-1 837 — Kiko's "769" claim roughly right); companyId mapping 58% (2,476). Organisations: companies table 2,168, but company_intelligence enriched only 30 (1.4%), Tier-1 companies enriched 7/660. => outreach layer ready, deep-intel layer near-empty; the companies-table merge keeps drafts company-aware meanwhile. NEXT (Kiko's suggestion): on-demand enrichment pass for Tier-1 companies in live sequences.
- COMMITS (redesign-v2): 3dd16de (home chips) / 4999ac6 (draft engine) / 644dbfe (float content-aware) / 43c76cd (portal) / cb3492e (draft reads companies table). Migrations: cascade_deal_archive_followups, cascade_archive_close_followed_up_too. Frontend deployed (scp dist/* -> /var/www/kiko). Backend deployed + pm2 restart.
- INFRA: desktop-commander froze twice mid-deploy (4-min hangs on scp+commit chains); macOS has no `timeout` cmd. Split build/deploy/commit into separate small commands; restart Claude Desktop when it wedges.

## Session 76 (15 Jun 2026) — Tier-1 deep-research enrichment + enrich_company curated-first
- SCOPE: the 4 Tier-1 companies in live sequences (kiko_sequence_enrollments join contacts crm_tier='1'): Sierra, Norm Ai, Netradyne, Rocket Lawyer. CLAUDE did the deep research (Opus + web_search via _research.mjs on the Mac, NOT Kiko's paid enrich tools), reviewed every figure, dual-wrote each to companies.data AND company_intelligence (via _apply.mjs).
- CORRECTIONS (stale data was badly wrong): Sierra $80M -> $1.585B (Series E $950M May 2026, $15.8B val, $150M+ ARR, Bret Taylor CEO, Anna Rosenman Head of Marketing); Norm Ai $3M -> $140M+ (Blackstone $50M Nov 2025 / Form D ~$103.5M, Legal/RegTech, John Nay CEO, launched Norm Law AI-native firm); Netradyne $55M -> $308-317M ($1.34B val Series D Jan 2025, AI fleet safety, Avneesh Agrawal CEO / Adam Kahn CMO, May-2026 Moove Europe acquisition); Rocket Lawyer $750M (WRONG) -> $276-288M (legal tech, interim CEO Paul Hollerbach, founder Charley Moore retired Mar 2025). Each has 5-6 dated signals + competitors + confidence notes.
- enrich_company FIX (commit 732d210): it ran a live claude-sonnet-4-6 + web_search call EVERY invocation + upserted company_intelligence (costs money + returned conflicting numbers, e.g. Netradyne $362M vs my $308-317M). Now reads the companies record FIRST and returns it; only live-enriches if NO companies record exists. Deployed + pm2 restart. Resolves the data-source conflict + stops the spend.
- KIKO ASSIMILATION VERIFIED: she ran search_companies + enrich_company + company_intel on Netradyne — all 3 now return the identical $308-317M (the $362M conflict is gone). Reads refreshed records cleanly. Flagged the Sierra<->Decagon category conflict (Decagon in pipeline).
- DATA-SOURCE MAP (api/agents/data.js): search_companies + entity_detail read companies.data; company_intel reads company_intelligence; enrich_company now reads companies.data first (was live re-derive). _apply.mjs dual-writes both (snake_case map). company_intelligence has NO valuation column (valuation lives in companies.data only).
- PROVENANCE: use data_refreshed_by='claude_deep_research' + data_refreshed_at as the deep-research marker. market_data_status is OWNED by the LinkedIn keep-alive cron — re-stamps 'linkedin_live_jun2026' every few min on Tier-1-in-sequence companies (watched it revert Rocket Lawyer + Sierra between two queries). The cron touches ONLY market_data_status; funding/valuation/revenue/employees/signals/data_refreshed_by all persist. So market_data_status is NOT a reliable deep-research marker; data_refreshed_by is.
- TEMP SCRIPTS (Mac repo root): _research.mjs (Opus+web_search deep research, argv company+website), _apply.mjs (dual-write companies + company_intelligence, argv company + fields.json). Gitignored.
- INFRA: desktop-commander froze again (4-min hang) on a recursive grep over api/; recovered after Claude Desktop restart. Avoid heavy recursive greps; keep commands light.
