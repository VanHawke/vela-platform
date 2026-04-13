# Multi-User Feature Progress
## Started: 2026-04-12
## Current sub-phase: C — COMPLETE (stopping at C/D boundary per Sunny's instruction)
## Current step: C.10 — committed
## LOCKED MODEL: shared CRM | private chat/memory/bg tasks/voice/L3 | three-layer Bible | roles | export gated | campaign send-as
## Sunny's user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063
## Van Hawke org_id (new): 2c6b30da-2d1a-45e5-bbeb-dee1671deba3
## Van Hawke org_id (legacy): 35975d96-c2c9-4b6c-b4d4-bb947ae817d5
## Supabase project_id: dwiywqeleyckzcxbwrlb
## kiko-health baseline: PASS, 1733ms, bible_layers_loaded=['core','org','personal']
## Don't-touch list: theme.js, BackgroundTasksPanel, ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, MemoryTab, KIKO_BIBLE.md.archive, all crons except cron-sequence-sender (Sub-Phase F only)
## Sub-phases:
- [x] A — Audit + rollback + health probe spec
- [x] B — Health probe + org schema migration
- [x] C — Three-layer Bible split
- [ ] D — Settings tabs + roles backend
- [ ] E — Export role gating
- [ ] F — Campaign send-as + onboarding
## Last completed step: C.9 — Layer 2 + Layer 3 regression tests passed
## RESUME HERE: Sub-Phase D step D.1 — Add Settings tabs (Team, Organisation, Kiko)
## Files created: MULTI_USER_AUDIT.md, MULTI_USER_PROGRESS.md, SUB_PHASE_B_ROLLBACK.sql, api/kiko-health.js
## Files modified: api/kiko.js (Bible loading), api/kiko-health.js (3-layer check), package.json (→0.0.51), KIKO_MASTER_LOG.md
## Files archived: KIKO_BIBLE.md → KIKO_BIBLE.md.archive
## Versions deployed: B=0.0.50, C=0.0.51
## Bible layer verification:
  - Core: 4914 chars in kiko_core_bible (§1-9, §11-13, §16-18)
  - Org: 2168 chars in org_bibles for Van Hawke (§10, §14, §20-21)
  - Personal: 673 chars in user_bibles for Sunny (§15 + daughters + Weybridge)
  - kiko-health confirms all 3 layers loaded
  - Layer 3 test: Kiko knows Nyla and Maya ✓
  - Layer 2 test: Kiko describes Van Hawke Group/Agency/Maison ✓
## Critical architecture notes for Sub-Phase D:
  - api/kiko.js loads Bible via: organization_members → org_id → org_bibles + user_bibles
  - Existing SYSTEM_PROMPT stays hardcoded (operational: routing/tools/style)
  - Bible content appended as bibleBlock after SYSTEM_PROMPT replacements
  - New users without a user_bibles row get no personal Bible (graceful fallback)
  - super_admin role check for org Bible editing: use organization_members.role
