# Background Tasks Phase 3 + Phase 4 Progress
## Started: 2026-04-12
## Current phase: 4
## Current step: P4.1 — kiko-health baseline
## LOCKED: Phase 3 already shipped v0.0.48 (Section A0n). Phase 4 adds streaming alongside existing non-streaming path. Existing status/result/cleanup endpoints locked.
## Don't-touch list: api/kiko.js, api/kiko-health.js, api/kiko-task-status.js, api/kiko-task-result.js, api/cron-background-task-cleanup.js, theme.js, KikoChat.jsx (Phase 3 already in), ThreadIndicator, NotificationToast, KikoWaveform, KikoVoice, Settings.jsx, MemoryTab, Layout.jsx, all campaigns, Onboarding, PermissionGate, KIKO_BIBLE.md.archive
## Kiko-health baseline: 1885ms, layers=[core,org,personal]
## Phase 3 checklist: ALL DONE (shipped v0.0.48, Section A0n — button, event listener, badge all live)
## Phase 4 checklist:
- [x] P4.1 kiko-health baseline: PASS, 1885ms
- [ ] P4.3 streaming_progress + streaming_mode columns added
- [ ] P4.4 callKikoStreaming added to kiko-async.js
- [ ] P4.5 kiko-task-create.js supports streaming:true
- [ ] P4.6 kiko-task-stream.js created (SSE endpoint)
- [ ] P4.7 BackgroundTasksPanel.jsx EventSource subscription added
- [ ] P4.8 Phase 4 deployed (record version + bundle hash)
- [ ] P4.9 Tests passed
- [ ] P4.11 KIKO_MASTER_LOG Phase 4 section written
## Files modified so far: none
## Files created so far: BACKGROUND_P3_P4_PROGRESS.md
## Notes: Phase 3 already shipped. api/kiko.js uses anthropic.messages.stream() — same pattern for callKikoStreaming. @vercel/functions in package.json for waitUntil.
