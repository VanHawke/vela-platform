# Multitasking Phase 3 Progress
## Started: 2026-04-12
## Current step: Change A — adding "Run in background" button
## Don't-touch list: api/kiko.js, api/kiko-task-*.js, api/kiko-async.js, api/cron-*.js, theme.js, supabase.js, BackgroundTasksPanel.jsx, KikoVoice.jsx, ThreadIndicator.jsx, NotificationToast.jsx, KikoWaveform.jsx, Layout.jsx, KIKO_BIBLE.md (append-only), vercel.json, all settings/campaign/memory/contacts/pipeline files
## Checklist:
- [x] Pre-flight 7/8 (no Chrome MCP in CLI)
- [x] KikoChat.jsx fully read
- [x] BackgroundTasksPanel.jsx read for event dispatch shape
- [x] kiko-task-create.js read for body shape
- [ ] Change A: "Run in background" button added
- [ ] Change A: button onClick handler wired
- [ ] Change B: useEffect event listener added
- [ ] Change B: same-conversation insertion logic
- [ ] Change B: cleanup on unmount
- [ ] node --check passes
- [ ] npm run build passes
- [ ] Version bumped
- [ ] Committed and deployed
- [ ] Bundle hash changed
- [ ] Selfcheck PASS
- [ ] KIKO_MASTER_LOG.md Section A0n written
## Files modified: KikoChat.jsx (pending), package.json (pending)
## Bundle hash: pending
## Notes: KikoChat has TWO input bar variants (homepage + conversation). Both need the button. Event shape: {task_id, conversation_id, result_text}. API body: {conversation_id, query, user_id}. hasContent = input.trim() || pendingAttachment.
