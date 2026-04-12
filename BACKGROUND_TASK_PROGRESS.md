# Background Task System — Phase 1+2 Progress
## Started: 2026-04-12 ~10:30 BST
## Current phase: 1 (verification in progress)
## Don't-touch list: api/kiko.js, theme.js, KikoChat.jsx, KikoVoice.jsx, all crons except new one, NotificationToast.jsx, ThreadIndicator.jsx, KikoWaveform.jsx, all settings/campaign/memory files
## Palette tokens (no hardcoded hex): T.bg, T.surface, T.surfaceHover, T.border, T.text, T.textSecondary, T.textTertiary, T.accent, T.success, T.danger
## Checklist:
- [x] Pre-flight env check (10 items)
- [x] Phase 1.1 — Migration applied (kiko_background_tasks table, RLS, realtime)
- [x] Phase 1.2 — kiko-task-create.js created (waitUntil + callKikoInProcess)
- [x] Phase 1.3 — kiko-task-status.js created
- [x] Phase 1.4 — kiko-task-result.js created
- [x] Phase 1.5 — cron-background-task-cleanup.js + vercel.json cron added
- [ ] Phase 1.6 — Phase 1 deployed, all 10 backend tests passed (record bundle hash + version)
- [ ] Self-audit loop run after Phase 1 — green
- [ ] Phase 2.1 — BackgroundTasksPanel.jsx created
- [ ] Phase 2.2 — Layout.jsx mount added (1 import + 1 component)
- [ ] Phase 2.3 — 3 seed rows inserted
- [ ] Phase 2.4 — Phase 2 deployed, authenticated screenshot saved (record path + bundle hash + version)
- [ ] Self-audit loop run after Phase 2 — green
- [ ] KIKO_MASTER_LOG.md Section A0l written
- [ ] BACKGROUND_TASK_PROGRESS.md final state matches all checklist items checked
## Last completed step: Phase 1.5
## Next step: Phase 1.6 — Backend verification (10 tests)
## Files created so far: BACKGROUND_TASK_PROGRESS.md, api/kiko-task-create.js, api/kiko-task-status.js, api/kiko-task-result.js, api/cron-background-task-cleanup.js
## Files modified so far: vercel.json (cron added), package.json (version + @vercel/functions dep)
## Bundle hashes: phase1=DMM1uHkO (frontend unchanged), phase2=pending
## Version: 0.0.45
## Notes: @vercel/functions installed. Reused callKikoInProcess from kiko-async.js pattern. Hit Vercel 50-function config limit — removed inline config entries, using export const config instead. Test task 78b3671b running, awaiting completion.
