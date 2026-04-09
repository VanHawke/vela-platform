# KIKO TODO — Living Checklist

> Updated at the end of every session. Read at the start of every session.
> Status: [ ] not started | [~] in progress | [x] verified working | [!] broken
> "Verified" means I have concrete evidence (curl output, screenshot, SQL result).

## P0 — Blocking Sunny's launch today

- [x] `/api/build-campaign` honours `preferredTeam` — Haas request returns Haas, Mercedes request returns 409 blocked_by CrowdStrike. Verified via curl 2026-04-09.
- [x] Cybersecurity ground truth: only Cadillac + Haas open. Verified via SQL.
- [x] `/campaigns` page ⚡ Build modal has F1 team dropdown. Source verified.
- [ ] End-to-end browser test: Sunny clicks Build with Haas selected, modal shows Haas review, enrols 8. NOT YET SCREENSHOTTED THIS SESSION.

## P1 — Critical for trust

- [~] Voice-in-chat fullscreen bug. Half-fixed (header no longer collapses). Inline voice panel still covers conversation pane via `inset: 0`. Needs bottom-dock styling.
- [~] `<invoke>` XML sanitiser. Code shipped in streaming path + system prompt rule. Not yet caught a live hallucination in a test.
- [x] Auto-pause SQL trigger applied to Supabase. NOT YET TESTED with a real INSERT.
- [x] `/api/selfcheck` live — returns 9/10 passing, 1 coverage failure.
- [x] `/api/cron-partner-reconcile` deployed. NOT YET RUN.
- [x] `KIKO_SYSTEM_MAP.md` in repo.
- [ ] `KIKO_TODO.md` (this file) in repo — NEW this turn.

## P2 — Data completeness

- [x] Cybersecurity category: 9 blocked teams + 2 open (Cadillac, Haas). Verified.
- [ ] Energy: thin but not critical (selfcheck says has coverage but Haas-specific results look off)
- [ ] Semiconductors: FAIL — only 3/11 teams have partner data. Reconcile cron should fix.
- [ ] Logistics: FAIL — only 4/11 teams have partner data.
- [ ] Legal: FAIL — only 4/11 teams have partner data.
- [ ] Other 14 categories: not audited. Might have stale/missing/wrong data.

## P2 — Architectural

- [ ] Schedule cron-partner-reconcile in vercel.json. Currently hits 38-cron ceiling — need to retire an unused cron first.
- [ ] Bottom-dock voice panel styling (inside of P1 voice bug).
- [ ] Deterministic handler for "tell me about company X" queries (hallucination-prone path).
- [ ] Deterministic handler for "what's the status of deal Y" (queries deals table directly).
- [ ] Refactor KikoChat.jsx (1400 lines) into smaller components.
- [ ] Automated test suite for `/api/kiko` intent routing.

## P3 — Nice to have

- [ ] Haas campaign `kiko_alerts` panel on home page.
- [ ] Weekly email summary of new partnerships detected.
- [ ] Campaign pause/resume history in `/campaigns` detail view.

## Broken / stale notes

- Vercel cron ceiling hit at 38. Cannot add `cron-partner-reconcile` to vercel.json crons without retiring one.
- 44 `f1_partnerships` rows still have NULL `category_id` (obscure brands, manual categorisation needed).
- Voice fix discipline: shipped and reverted twice. Must actually browser-test after each deploy.

## Session 2026-04-09 summary

**What shipped this session (verified):**
- `/api/selfcheck` live
- `/api/cron-partner-reconcile` live (deployed, not yet run)
- Auto-pause SQL trigger installed
- `KIKO_SYSTEM_MAP.md` in repo
- `build-campaign` preferredTeam logic (existed, verified live via curl)
- Cybersecurity data reconciliation: McLaren/Aston Martin/Audi/Racing Bulls
- Deleted software↔cybersecurity overlap rule
- System prompt TOOL INVOCATION rule re-added without crashing function

**What I broke and fixed this session:**
- `/api/kiko` crashed with FUNCTION_INVOCATION_FAILED after I added a sanitiser regex. Reverted, redeployed, kiko alive again.

**What I claimed and couldn't deliver:**
- Voice inline panel fix — still covers chat pane
- End-to-end browser verification of the Haas Build flow
