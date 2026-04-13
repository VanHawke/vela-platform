# Multi-User Feature Progress
## Started: 2026-04-12
## Current sub-phase: A — COMPLETE
## Current step: A.STOP — showing executive summary to Sunny
## LOCKED MODEL: shared CRM (pipeline/contacts/orgs/campaigns/sequences/partnership/race) | private (chat/memory/bg tasks/voice/L3) | three-layer Bible (core/org/personal) | roles (super_admin/admin/user) | export gated | campaign send-as
## Sunny's user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063
## Van Hawke org_id: TBD (Sub-Phase B)
## Supabase project_id: dwiywqeleyckzcxbwrlb
## kiko-health baseline: TBD (Sub-Phase B)
## Don't-touch list: theme.js, BackgroundTasksPanel, ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, MemoryTab, KIKO_BIBLE.md (after archive), all crons except cron-sequence-sender (Sub-Phase F only)
## Sub-phases:
- [x] A — Audit + rollback + health probe spec
- [ ] B — Health probe + org schema migration
- [ ] C — Three-layer Bible split
- [ ] D — Settings tabs + roles backend
- [ ] E — Export role gating
- [ ] F — Campaign send-as + onboarding
## Last completed step: A.12 — Executive summary
## Next step: Show Sunny executive summary, then Sub-Phase B
## Files created so far: MULTI_USER_AUDIT.md, MULTI_USER_PROGRESS.md, SUB_PHASE_B_ROLLBACK.sql
## Files modified so far: none (audit-only)
## Notes: KIKO_BIBLE is NOT file-read — it's the hardcoded SYSTEM_PROMPT constant at api/kiko.js:249. Existing org_id column on 36 tables uses auth.jwt()->app_metadata->org_id pattern. conversations table has BOTH user_id AND org_id policies (leak risk — org members can see each other's chats). 7 files have hardcoded Sunny UUID. Selfcheck FAIL on partner_reconcile (pre-existing).
