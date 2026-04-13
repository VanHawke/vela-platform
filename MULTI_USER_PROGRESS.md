# Multi-User Feature Progress
## Started: 2026-04-12
## Current sub-phase: B — COMPLETE
## Current step: B.12 — commit
## LOCKED MODEL: shared CRM (pipeline/contacts/orgs/campaigns/sequences/partnership/race) | private (chat/memory/bg tasks/voice/L3) | three-layer Bible (core/org/personal) | roles (super_admin/admin/user) | export gated | campaign send-as
## Sunny's user_id: 9f486437-4bf5-4111-abfe-fe19bfa76063
## Van Hawke org_id (new): 2c6b30da-2d1a-45e5-bbeb-dee1671deba3
## Van Hawke org_id (legacy): 35975d96-c2c9-4b6c-b4d4-bb947ae817d5
## Supabase project_id: dwiywqeleyckzcxbwrlb
## kiko-health baseline: PASS, 1017ms, "I am Kiko, the AI executive operating partner for Van Hawke Group."
## Don't-touch list: theme.js, BackgroundTasksPanel, ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, MemoryTab, KIKO_BIBLE.md (after archive), all crons except cron-sequence-sender (Sub-Phase F only)
## Sub-phases:
- [x] A — Audit + rollback + health probe spec
- [x] B — Health probe + org schema migration
- [ ] C — Three-layer Bible split
- [ ] D — Settings tabs + roles backend
- [ ] E — Export role gating
- [ ] F — Campaign send-as + onboarding
## Last completed step: B.11 — Live regression (Kiko responds normally with real data)
## Next step: C.1 — Run kiko-health before Bible split
## Files created: MULTI_USER_AUDIT.md, MULTI_USER_PROGRESS.md, SUB_PHASE_B_ROLLBACK.sql, api/kiko-health.js
## Files modified: package.json (0.0.49 → 0.0.50), KIKO_MASTER_LOG.md
## Versions deployed: B=0.0.50
## Bundle hashes: B=deployed (kiko-health live)
## CRITICAL FINDING: Existing org_id on 36 shared tables uses legacy org_id 35975d96. New organizations table links via legacy_org_id column. No new columns needed on shared tables.
## CRITICAL FIX: Dropped 4 org_id policies on conversations table — was permissive OR leak allowing org members to see each other's chats. Now user_id-only.
## Notes: Sub-Phase C is the most delicate change (Bible split modifies api/kiko.js SYSTEM_PROMPT). Recommend fresh session with full context for C. kiko-health probe is the canary — run before+after every change from now on.
