# KIKO — NEXT SESSION MASTER BRIEF
# Everything needed to continue the Sequences/Outreach build
# Created: 6 April 2026 after massive build session

---

## CRITICAL ARCHITECTURAL DECISIONS

### 1. Sequences REPLACES Lemlist
The /lemlist page currently pulls live data from Lemlist API. The /sequences page is the new native replacement. In the next session:
- Remove "Lemlist" from navigation
- Rename "Sequences" to "Outreach" or "Campaigns" in the nav
- Move any useful Lemlist page analytics into the Sequences page
- Lemlist subscription can be cancelled once Sequences is fully operational

### 2. Campaigns vs Templates
WRONG (current): 3 pre-built sequences called "Authority C-Suite 5-Touch", "Post-Funding Accelerator", "Re-Engagement"
RIGHT: These are TEMPLATES/APPROACHES, not campaigns. A campaign is:
- "Haas F1 - Cybersecurity" (category-specific, with leads enrolled)
- "Haas F1 - Cloud Computing"
- "Alpine F1 - Chemicals"

The template (authority-led, scarcity, post-funding) is a PROPERTY of the campaign that determines how the emails are written. The "Generate Campaign" wizard should ask: category + team + approach template.

### 3. Pre-built sequences need updating
Current 3 sequences use a 5-step structure. Research says 7 touches over 14 days (4 emails + 3 LinkedIn) with omnichannel is 287% more effective. Update all templates to 7-touch structure.

---

## WRITING STYLE (from Lemlist review)

### Actual Van Hawke email style (extracted from live Lemlist campaigns):

**Email 1 — Cloud Computing campaign:**
- Subject: "Haas F1 Team × Cloud Infrastructure" (uses × not —)
- Opens: "Dear {{firstName}},"
- Para 1: "We work at principal level on the structuring of Formula One partnerships for teams and rights-holders."
- Para 2: "Our role is not to place sponsorship assets, but to design closed, category-exclusive partnership systems tied to governance, access, and institutional credibility."
- Para 3: Category-specific intelligence — explains WHY cloud computing matters operationally for F1 (simulation, telemetry, data pipelines, factory-to-track workflows)
- Para 4: Reframe — "cloud capability is treated as an operating dependency, not a communications narrative"
- Soft CTA: "The relevant question at this stage is simply whether this is strategic from your perspective."
- Conditional next step: "If it is, we can outline how the cloud category is being approached within Haas' Formula One programme"
- Sign-off: "Kind regards," + {{signature}}

**Email 2 — Cloud Computing campaign:**
- Builds on team-specific context: "Haas operates with a lean and highly exposed technical model — privately owned, independent of OEM infrastructure"
- Deepens the operational argument: "Simulation, race strategy, performance development rely on continuous data movement between factory and track"
- Differentiates: "That profile creates a different context for cloud partners than at manufacturer teams with vertically integrated systems"
- Board-level framing: "cloud capability is evaluated as an operational foundation rather than an overlay"

### Style rules (NON-NEGOTIABLE):
1. Every email starts with "Dear {firstName},"
2. Every email ends with "Kind regards,\n\n{signature}"
3. Subject format: "Haas F1 Team × {category}" (uses ×)
4. No "I hope this finds you well" or any generic filler
5. No "I think" or "maybe" — declarative authority
6. Category-specific: explain WHY this category matters operationally for F1
7. Board-level language: "principal level", "closed, category-exclusive", "governance, access, and institutional credibility"
8. 50-125 words per email (research-backed optimal length)
9. Soft CTA — "The relevant question is simply whether this is strategic from your perspective"
10. Sender: Sunny Sidhu (sunny@vanhawke.agency)

---

## UI FIXES NEEDED

### 1. Dropdown regeneration (FIXED in 2b7db57)
When approach/psychology dropdown changes, amber bar appears: "Approach changed — regenerate content?" with [Regenerate] [Keep] buttons.

### 2. Auto greeting + sign-off (FIXED in 2b7db57)
New email steps pre-populate with "Dear {firstName}," and "Kind regards,\n\n{signature}"

### 3. Writing quality (PARTIALLY FIXED)
The askKiko prompt now references real Van Hawke style. But the generate-sequence API endpoint also needs updating to match.

### 4. Sequences dashboard needs purpose (NOT YET FIXED)
Current campaign list is basic. Should show:
- Campaign cards with real metrics (enrolled, sent, replied, rate)
- Active campaigns prominently displayed
- Empty campaigns marked as "needs leads"
- Quick action: "Add leads" directly from the card

### 5. Lead import is the critical missing UX (BUILT but needs testing)
The "Add from CRM" modal searches contacts by company name. Needs testing with real data.

---

## SEQUENCE FLOW (per Lemlist review)

Lemlist Cloud Computing campaign has this flow:
1. Send immediately → Email (authority hook)
2. Wait 3 days → Visit profile (LinkedIn)
3. Wait 2 days → Email (deeper context)
4. Wait 2 days → Invitation (LinkedIn connect)
5. Wait 4 days → Email (conditional on LinkedIn acceptance)
6. Wait 1 day → Chat message (LinkedIn DM)
7. Wait 1 day → Visit profile
8. Wait 6 days → Email
9. Wait 8 days → Email
10. Wait 1 day → Visit profile
11. Wait 1 day → Chat message (LinkedIn)
12. Wait 1 day → Visit profile
13. Wait 6 days → Chat message (LinkedIn)

This is 13 steps over ~35 days — more aggressive than the 7-touch/14-day research recommendation. The actual campaign uses conditional branching (different path if LinkedIn invite accepted vs not).

For Kiko's builder, start with the simpler 7-touch/14-day structure and add conditional branching later.

---

## RESEARCH DATA (for generate-sequence prompt)

Optimal outreach cadence (2025-2026 benchmarks):
- Omnichannel (email + LinkedIn) = 287% more replies than email alone
- 50-125 word emails = 50% higher reply rate
- Personalised LinkedIn connect note = 9.36% reply (vs 5.44% without)
- Profile visit + message = 11.87% reply rate
- Monday launch, Wednesday follow-up = peak engagement
- 9:30-11:30am recipient local time = optimal window
- 93% of replies captured by day 10
- 3-7-7 cadence (Day 0, Day 3, Day 10, Day 17) captures 93% of replies
- Decision-makers receive 15 cold emails/week
- 71% of ignored emails lack relevance
- Personalisation beyond first name = 340% higher reply rates
- LinkedIn max 20-30 connection requests/day to avoid throttling

---

## BACKEND STATUS (all working, do not touch)

| Component | Status | Notes |
|-----------|--------|-------|
| kiko_sequences table | ✅ | 3 seeded (need updating to 7-touch) |
| kiko_sequence_enrollments table | ✅ | Ready for leads |
| kiko_outreach_queue table | ✅ | Email send queue |
| kiko_linkedin_queue table | ✅ | LinkedIn message queue |
| cron-sequence-enqueue.js | ✅ | Daily 6am, personalises emails |
| cron-sequence-sender.js | ✅ | Every 30min 8am-6pm, sends via Gmail |
| cron-sequence-reply-detect.js | ✅ | Every 2hrs, stops on reply/bounce |
| generate-sequence.js | ✅ | AI campaign generation (bug fixed) |
| data.js operations | ✅ | start/status/pause/cancel/linkedin_queue |
| kiko.js routing | ✅ | Sequence intent routing |
| kiko-tools.js enum | ✅ | All operations listed |

---

## FRONTEND STATUS

| Page | Status | Issues |
|------|--------|--------|
| Sequences.jsx (campaign list) | ✅ Rebuilt | Pre-built templates show as campaigns (wrong) |
| SequenceDetail.jsx (builder) | ✅ Rebuilt | Greeting/sign-off fixed, regen prompt added |
| App.jsx routes | ✅ | /sequences and /sequences/:id |
| Layout.jsx nav | ✅ | Under More → Sequences |
| Lemlist.jsx | ❌ Should be removed | Replace with Sequences |

---

## WHAT TO BUILD NEXT SESSION

Priority order:
1. Delete the 3 template sequences, seed proper campaign templates instead
2. Update generate-sequence.js to use Van Hawke writing style + 7-touch structure
3. Merge Lemlist page analytics into Sequences page
4. Remove Lemlist from nav
5. Test end-to-end: generate "Haas F1 - Cybersecurity" → add CRM leads → verify queue
6. Verify crons fire correctly (check heartbeats next morning)

---

## DEPLOY RULES (NEVER BREAK THESE)
- Deploy: `npx vercel --prod --yes` ONLY
- NEVER use `VERCEL_FORCE_NO_BUILD_CACHE=1` or `--force`
- NEVER use more than 50 functions in vercel.json (currently 49)
- `ANTHROPIC_KEY` not ANTHROPIC_API_KEY
- `VITE_SUPABASE_URL` not SUPABASE_URL
- Gmail: sunny@vanhawke.agency, Helvetica 12pt

---

## KEY FILES

| File | Purpose |
|------|---------|
| NEXT_SESSION_PROMPT.md | This file — paste into next session |
| KIKO_SESSION_BRIEF.md | Mandatory read before any code changes |
| KIKO_EVOLUTION_PLAN.md | 710-line 19-phase engineering spec |
| KIKO_DESIGN_BRIEF.md | 291-line design brief for Cowork UI sessions |
| SEQUENCE_BUILDER_SPEC.md | 408-line definitive UI spec for sequences |
| KIKO_OUTREACH_ENGINE_SPEC.md | Full outreach engine technical spec |
| CLAUDE_CODE_SETUP.md | 452-line local dev workflow |

---

## SESSION COMMITS (6 April 2026)

| Commit | Description |
|--------|-------------|
| 090706d | Closed-loop deal attribution engine |
| 6f96631 | Updated master prompt with attribution |
| 91179ed | Kiko design brief for Cowork (291 lines) |
| 185d1f4 | Claude Code implementation brief (452 lines) |
| 7ff59a3 | Outreach sequence engine — 3 crons, 4 tables, operations |
| 935ee08 | Fix vercel.json 50-function limit |
| f830c23 | Sequences page — campaign list + stats |
| cf88a6f | Sequence builder UI spec (283 lines) |
| 2f29a2e | Sequence builder — Lemlist-style flow + step editor |
| 61fcf8e | AI campaign generation wizard |
| ba8e54f | Fix generate-sequence sbFetch bug |
| 768df6a | Definitive sequence builder spec (408 lines) |
| 9c8f387 | Complete rebuild — clean list + 3-tab builder + CRM lead search |
| 2b7db57 | Fix greeting/sign-off, dropdown regen, Van Hawke writing style |

---

END OF BRIEF
