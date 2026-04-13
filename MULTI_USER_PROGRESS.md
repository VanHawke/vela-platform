# Multi-User Feature Progress
## Started: 2026-04-12
## Current sub-phase: E — COMPLETE (stopping at E/F boundary)
## Current step: E.11 — committed and deployed
## LOCKED MODEL: shared CRM | private chat/memory/bg tasks/voice/L3 | three-layer Bible | roles | export gated | campaign send-as
## Sunny's user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063
## Van Hawke org_id (new): 2c6b30da-2d1a-45e5-bbeb-dee1671deba3
## Van Hawke org_id (legacy): 35975d96-c2c9-4b6c-b4d4-bb947ae817d5
## Supabase project_id: dwiywqeleyckzcxbwrlb
## kiko-health baseline: PASS, 1441ms, bible_layers_loaded=['core','org','personal']
## Don't-touch list: theme.js, BackgroundTasksPanel, ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, KIKO_BIBLE.md.archive, all crons except cron-sequence-sender (Sub-Phase F only)
## Sub-phases:
- [x] A — Audit + rollback + health probe spec
- [x] B — Health probe + org schema migration
- [x] C — Three-layer Bible split
- [x] D — Settings tabs + roles backend (+ D.1/D.2 fixes in v0.0.53)
- [x] E — Export role gating
- [ ] F — Campaign send-as + onboarding
## Last completed step: E.11 — deployed v0.0.54, kiko-health PASS
## RESUME HERE: Sub-Phase F step F.1 — Add send_from_user_id to campaigns + sequences
## Files created: MULTI_USER_AUDIT.md, MULTI_USER_PROGRESS.md, SUB_PHASE_B_ROLLBACK.sql, api/kiko-health.js, api/org-bible.js, api/user-bible.js, api/team-list.js, api/_lib/get-user-role.js, src/lib/useUserRole.js
## Files modified: api/kiko.js (Bible loading), api/kiko-health.js (3-layer check), api/agents/document.js (export role gate), api/kiko-tools.js (pass userId to document agent), src/components/settings/Settings.jsx (D fixes + Organisation tab + pass canExport), src/components/settings/MemoryTab.jsx (canExport prop), package.json (→0.0.54), KIKO_MASTER_LOG.md
## Files archived: KIKO_BIBLE.md → KIKO_BIBLE.md.archive
## Versions deployed: B=0.0.50, C=0.0.51, D=0.0.52, D-fixes=0.0.53, E=0.0.54
## Export gating summary:
  - Backend: api/agents/document.js gates EXPORT_OPS via getUserRole — returns friendly message for role='user'
  - Frontend: MemoryTab Export CSV hidden when canExport=false
  - Helper: api/_lib/get-user-role.js (getUserRole + canExport)
  - Hook: src/lib/useUserRole.js (for future UI components)
## D-fix summary:
  - D.1: Personal Context moved from Kiko tab to Profile tab
  - D.2: loadBibles uses /api/team-list (service_role) instead of anon Supabase client
## Notes for Sub-Phase F:
  - Add send_from_user_id to campaigns + sequences tables
  - Backfill existing rows with Sunny's user_id
  - Campaign builder UI: dropdown to pick sender from org members
  - cron-sequence-sender.js: look up send_from_user_id, use that user's Gmail OAuth tokens
  - Test send dropdown: just me / just sender / both / all org members
  - Onboarding flow for new users (detect first login)
  - Document invite flow for Matt (do NOT actually invite unless Sunny says so)
