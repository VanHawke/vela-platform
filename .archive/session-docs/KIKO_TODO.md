# KIKO TODO — Living Checklist

> Updated at the end of every session. Read at the start of every session.
> Status: [ ] not started | [~] in progress | [x] verified working | [!] broken
> "Verified" means I have concrete evidence (curl output, screenshot, SQL result).

## P0 — Blocking launch today

- [x] `/api/build-campaign` honours `preferredTeam` (verified curl: Haas→success, Mercedes→409)
- [x] Cybersecurity ground truth: Cadillac + Haas only open (verified SQL)
- [x] `/campaigns` modal has F1 Team dropdown (verified source line 556)
- [ ] Sunny browser-tests Haas cybersecurity build end-to-end (NOT tested this session — session expired)

## P1 — Critical for trust

- [x] Auto-pause SQL trigger — VERIFIED working live: inserted fake `TEST_TRIGGER_SENTINEL_CORP`, alert fired with correct title + detail + metadata, cleaned up
- [x] `/api/selfcheck` — VERIFIED 9/10 passing, coverage FAIL flagged 3 thin categories
- [x] `/api/cron-partner-reconcile` — VERIFIED ran successfully, 8 new partnerships inserted (Mercedes +2, Cadillac +5, Racing Bulls +1)
- [x] `KIKO_SYSTEM_MAP.md` in repo
- [x] `KIKO_TODO.md` in repo (this file)
- [~] Voice bottom-dock panel — deployed in bundle `CKuGi_pE`, NOT yet visually verified in browser
- [~] `<invoke>` XML sanitiser — system prompt rule live, regex sanitiser NOT re-added (caused crash last time, need safer approach)

## P1 — Critical bugs discovered this session

- [!] 4 team partner pages return 404/wrong URL: Alpine, Williams, Haas, Audi. Cron-partner-reconcile can't fetch them.
- [!] 3 team partner pages are JS-rendered SPAs with empty static HTML: Red Bull, Ferrari, McLaren. Need headless browser or direct RSS feed to scrape them.
- [!] Thin categories unchanged by reconcile: semiconductors (3/11), logistics (4/11), legal (4/11). These need targeted manual research or different data source.

## P2 — Data completeness

- [x] Cybersecurity: 9 blocked teams + Cadillac/Haas open. Verified.
- [x] Partnerships total: 385 active (up from 377)
- [ ] Semiconductors: 3/11 teams only — 8 missing
- [ ] Logistics: 4/11 — 7 missing
- [ ] Legal: 4/11 — 7 missing
- [ ] 44 rows still have NULL category_id (obscure brands)
- [ ] 17 other categories: not audited for accuracy, only for coverage count

## P2 — Architectural

- [ ] Fix 4 broken team partner page URLs (Alpine/Williams/Haas/Audi)
- [ ] Headless browser approach for Red Bull/Ferrari/McLaren JS-rendered pages (or find alternative data source like press release RSS)
- [ ] Schedule `cron-partner-reconcile` in vercel.json (hits 38-cron ceiling — retire unused cron first)
- [ ] Re-add safer `<invoke>` sanitiser with null guards and local unit test
- [ ] Deterministic handler for "tell me about company X" queries
- [ ] Refactor KikoChat.jsx (1400 lines)

## P3 — Nice to have

- [ ] Haas campaign `kiko_alerts` panel on home page
- [ ] Weekly email summary of new partnerships detected
- [ ] Campaign pause/resume history in `/campaigns` detail

## Session 2026-04-09 evidence log

**Verified with concrete evidence this session:**

| Claim | Evidence |
|---|---|
| Cybersecurity matrix correct | SQL: only Cadillac + Haas open, 9 others blocked with real partner names |
| `/api/build-campaign` respects preferredTeam | Curl: Haas→200, Mercedes→409 blocked_by CrowdStrike |
| `/api/selfcheck` returns 9/10 pass | Curl: JSON response 2350ms, lists each check |
| Auto-pause trigger fires | SQL: INSERT → kiko_alerts row with `paused_campaigns: 0`, correct title/detail |
| cron-partner-reconcile actually scrapes | Curl: 33s duration, 11 teams processed, 8 new partnerships, per-team stats |
| partnerships count 377→385 | SQL: before/after counts |
| Deleted software↔cybersecurity overlap | SQL: `no_software_cybersecurity_overlap` check passes |
| Bundle deployed | 3 bundle hash changes verified via curl HTML grep |

**NOT verified this session (honest gaps):**
- Voice bottom-dock panel visual rendering (deployed but not screenshotted — session expired)
- End-to-end browser flow for Haas Build
- `<invoke>` sanitiser catching a real hallucination (only prompt rule live)
- Fetch failures on 4 teams (URL 404s)
- JS-rendered scraping for 3 teams (empty text extraction)

**What I broke and fixed this session:**
- First auto-pause trigger referenced non-existent columns `kiko_sequences.team/category`. Fixed by joining through `campaign_targets`. Verified working.
