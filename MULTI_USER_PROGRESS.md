# Multi-User Feature Progress
## Started: 2026-04-12
## Current sub-phase: D — COMPLETE (stopping at D/E boundary per Sunny's instruction)
## Current step: D.7 — committed and deployed
## LOCKED MODEL: shared CRM | private chat/memory/bg tasks/voice/L3 | three-layer Bible | roles | export gated | campaign send-as
## Sunny's user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063
## Van Hawke org_id (new): 2c6b30da-2d1a-45e5-bbeb-dee1671deba3
## Van Hawke org_id (legacy): 35975d96-c2c9-4b6c-b4d4-bb947ae817d5
## Supabase project_id: dwiywqeleyckzcxbwrlb
## kiko-health baseline: PASS, 1207ms, bible_layers_loaded=['core','org','personal']
## Don't-touch list: theme.js, BackgroundTasksPanel, ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, MemoryTab, KIKO_BIBLE.md.archive, all crons except cron-sequence-sender (Sub-Phase F only)
## Sub-phases:
- [x] A — Audit + rollback + health probe spec
- [x] B — Health probe + org schema migration
- [x] C — Three-layer Bible split
- [x] D — Settings tabs + roles backend
- [ ] E — Export role gating
- [ ] F — Campaign send-as + onboarding
## Last completed step: D.7 — All 3 endpoints verified, kiko-health PASS
## RESUME HERE: Sub-Phase E step E.1 — Add role check to export endpoints
## Files created: MULTI_USER_AUDIT.md, MULTI_USER_PROGRESS.md, SUB_PHASE_B_ROLLBACK.sql, api/kiko-health.js, api/org-bible.js, api/user-bible.js, api/team-list.js
## Files modified: api/kiko.js (Bible loading), api/kiko-health.js (3-layer check), src/components/settings/Settings.jsx (Organisation tab + Personal Bible), package.json (→0.0.52), KIKO_MASTER_LOG.md
## Files archived: KIKO_BIBLE.md → KIKO_BIBLE.md.archive
## Versions deployed: B=0.0.50, C=0.0.51, D=0.0.52
## Endpoint verification:
  - org-bible GET: 2168 chars ✓
  - user-bible GET: 673 chars ✓
  - team-list GET: 1 member, super_admin, Van Hawke Group ✓
  - kiko-health: PASS ✓
## Notes for Sub-Phase E:
  - Export endpoints from audit A.6: MemoryTab.jsx onExportCSV, document.js export_pipeline, document.js export_contacts
  - Need getUserRole helper that queries organization_members
  - Frontend: useUserRole hook or inline check against currentUserRole (already in Settings.jsx state)
  - Test by temporarily downgrading Sunny to user role, verify 403 + hidden buttons
