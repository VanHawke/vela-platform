# KIKO_VOICE_PIPECAT_MIGRATION.md

**Author:** Kiko
**Date:** 2026-04-11
**Goal:** Replace OpenAI GPT-4o Realtime with Pipecat + Claude + Deepgram + Cartesia/ElevenLabs so voice Kiko IS Kiko (full memory, full tools, full system prompt) instead of GPT-4o pretending to be Kiko.

---

## Why we're doing this

Today's voice mode is structurally broken:
- The brain is GPT-4o Realtime, not Claude
- GPT-4o has no access to KIKO_BIBLE.md, kiko_learning_log, kiko_relationships, kiko_thought_journal, kiko_draft_tracking, or any of the 39 specialist tools
- The only bridge is a single `ask_kiko` tool that GPT-4o decides whether to call — and often doesn't, leading to hallucination
- "Goodbye Kiko" detection depends on Whisper transcription events that have been broken at the OpenAI session-config layer multiple times
- Voice conversations don't persist to chat history reliably
- Costs run on OpenAI Realtime per-minute pricing (~$0.06/minute input + $0.24/minute output) which adds up fast

The fix is the architecture you already had in your memories: **Pipecat + Claude + Deepgram STT + Cartesia or ElevenLabs TTS**. This makes Claude the voice brain, with full Kiko system prompt + tools + memory loaded per session.

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────────┐
│ Browser (React) │ ◄─wss─► │ Pipecat (Fly.io) │ ◄─api──►│ Anthropic Claude  │
│                 │         │  Python service  │         │ (Sonnet 4.6)      │
│ Mic stream out  │         │                  │         └───────────────────┘
│ Audio in        │         │  Deepgram STT    │         ┌───────────────────┐
│ Waveform UI     │         │  Claude LLM      │ ◄──────►│ Kiko backend      │
│ (existing)      │         │  Cartesia TTS    │         │ (Vercel /api/*)   │
└─────────────────┘         │  Pipecat orchest │         │ All tools, memory │
                            └──────────────────┘         └───────────────────┘
```

## Service breakdown

### 1. Deepgram Nova-3 (STT)
- Streaming WebSocket connection
- ~150ms to first transcript token
- Built-in voice activity detection
- Better English accuracy than Whisper
- Cost: ~$0.0043/min streaming, way cheaper than GPT-4o Realtime

### 2. Claude Sonnet 4.6 (Brain)
- Full KIKO_BIBLE.md as system prompt (already loaded by /api/kiko)
- Full tool list: ask_strategy_agent, ask_deal_agent, ask_data_agent, search_contacts, send_email, etc.
- Memory loaded: kiko_thought_journal, kiko_relationships, kiko_learning_log, kiko_user_profiles
- Conversation history per session (Pipecat handles this)
- Streaming responses so TTS can start speaking before Claude finishes thinking
- ~600ms first-token latency

### 3. Cartesia Sonic-2 OR ElevenLabs Serafina (TTS)
- Cartesia: faster (~150ms first-byte), cheaper, good voices
- ElevenLabs Serafina (`4tRn1lSkEn13EVTuqb0g`): the voice you already picked, slightly slower (~250ms first-byte), but the brand-aligned female voice
- Both are streaming, so TTS audio plays as Claude is still generating tokens
- **Recommendation:** start with Cartesia for cost+latency, swap to ElevenLabs Serafina if voice quality matters more than ms

### 4. Pipecat orchestrator (Python service on Fly.io)
- Handles the WebSocket from the browser
- Pipes audio: browser → Deepgram → Claude → TTS → browser
- Native barge-in: when user starts talking, cancels in-flight Claude response and starts listening (this is what "interrupted effectively" means)
- Per-session conversation context kept in memory
- Tool calling: when Claude wants to call a tool, Pipecat fires it via HTTP to /api/kiko-voice-tool/{tool_name} on Vercel and feeds the result back to Claude
- Total round-trip target: 800-1200ms (vs GPT-4o Realtime ~600ms — slightly slower but the trade-off is worth it because Kiko is actually Kiko)

## Latency budget

| Stage | Target | Max |
|---|---|---|
| User stops talking → Deepgram final transcript | 200ms | 400ms |
| Pipecat → Claude API request | 50ms | 100ms |
| Claude first token (no tool call) | 400ms | 800ms |
| Claude first token (with tool call to /api/kiko-voice-tool) | 800ms | 1500ms |
| Claude token → Cartesia TTS first audio chunk | 200ms | 400ms |
| Cartesia audio → browser playback start | 50ms | 150ms |
| **Total no-tool budget** | **900ms** | **1850ms** |
| **Total with-tool budget** | **1300ms** | **2550ms** |

This is a hair slower than GPT-4o Realtime (~600-800ms) but with dramatically better intelligence.

## Implementation phases

### Phase 1 — Pipecat service skeleton (0.5 day)
- New repo or subfolder: `vela-platform/pipecat-voice/`
- Files:
  - `bot.py` — Pipecat pipeline definition
  - `Dockerfile` — Python 3.11 + pipecat-ai + dependencies
  - `fly.toml` — Fly.io deployment config
  - `requirements.txt`
- Stub out the pipeline: input audio → Deepgram → Claude (with hardcoded system prompt) → Cartesia → output audio
- Deploy to Fly.io with `flyctl deploy`
- Verify connection from a test HTML page

### Phase 2 — Real Kiko brain (0.5 day)
- Replace hardcoded system prompt with full KIKO_BIBLE.md (fetch from Supabase or bundle it)
- Add tool calling to Claude with the same tool list as /api/kiko
- New endpoint on Vercel: `/api/kiko-voice-tool` that the Pipecat service hits to execute tools (search_contacts, get_deal_status, etc.)
- Memory loading: at session start, fetch user's recent kiko_thought_journal entries + kiko_user_profiles + kiko_relationships and inject as context

### Phase 3 — React frontend (0.5 day)
- New file: `src/hooks/usePipecatVoice.js` (replaces useRealtimeVoice.js)
- Connects to Pipecat WebSocket instead of OpenAI Realtime endpoint
- Streams mic audio via Web Audio API + AudioWorklet
- Plays incoming audio via Web Audio API
- Same waveform animation, same close button, same FAB integration
- Update KikoFloat.jsx and KikoVoice.jsx to use the new hook

### Phase 4 — Migration & cutover (0.5 day)
- Feature flag: `localStorage.kiko_voice_engine = 'pipecat'` to opt in
- Test side-by-side with old GPT-4o path
- Once verified working, flip the default
- Delete old code: useRealtimeVoice.js, KikoVoice.jsx OpenAI session config, /api/realtime-token, /api/kiko-voice (the lite Haiku endpoint)

### Phase 5 — Voice conversation persistence (0.25 day)
- Pipecat sends conversation transcript to /api/voice-conversation-save at end of session
- Saves to existing `conversations` table with `metadata.source = 'voice'`
- Voice conversations show up in chat history with 🎙 prefix (existing UI)
- Click to reopen → Continues in text mode with full prior context

### Phase 6 — Goodbye/close handling (0.25 day)
- Pipecat detects closing intents server-side via the Claude system prompt:
  > "When the user says goodbye, bye, see you later, talk later, or any farewell phrase, respond with a brief warm farewell ("Speak soon Sunny") and emit the special token <END_VOICE> as the final word of your response. The orchestrator will close the session immediately."
- Pipecat watches the Claude stream for `<END_VOICE>` and triggers session.close() on the WebSocket
- No more dependence on Whisper transcription events firing client-side

## Cost projection

### Per voice minute
| Service | Cost/min |
|---|---|
| Deepgram Nova-3 streaming | $0.0043 |
| Claude Sonnet 4.6 (avg ~500 input tokens + 300 output tokens per turn, ~3 turns/min) | $0.012 |
| Cartesia TTS (~150 chars/turn × 3 turns × $0.015/1000 chars) | $0.007 |
| **Total** | **~$0.024/min** |

vs GPT-4o Realtime: **~$0.30/min** (input + output combined)

**Saving: ~92% per voice minute.** Plus you get full Kiko intelligence instead of GPT-4o pretending.

### Fly.io infrastructure
- shared-cpu-1x@256MB always-on machine: ~$2/month
- Auto-scaled per concurrent voice session, up to 10 simultaneous: ~$10/month max
- Realistic: $5-10/month

### Total monthly voice cost (vs GPT-4o Realtime)
- Sunny voice usage estimate: ~30 minutes/day × 22 working days = 660 minutes/month
- Pipecat stack: 660 × $0.024 = $15.84 + $5 infra = **~$21/month**
- GPT-4o Realtime: 660 × $0.30 = **$198/month**
- **Saving: $177/month / $2,124/year**

## File-level changes

### NEW FILES
- `pipecat-voice/bot.py` (~200 lines)
- `pipecat-voice/Dockerfile` (~15 lines)
- `pipecat-voice/fly.toml` (~30 lines)
- `pipecat-voice/requirements.txt` (~10 lines)
- `api/kiko-voice-tool.js` (~150 lines, Vercel endpoint Pipecat hits for tool calls)
- `api/voice-conversation-save.js` (~50 lines)
- `src/hooks/usePipecatVoice.js` (~250 lines, replaces useRealtimeVoice.js)

### MODIFIED FILES
- `src/components/kiko/KikoFloat.jsx` — swap useRealtimeVoice → usePipecatVoice
- `src/components/kiko/KikoVoice.jsx` — swap WebRTC OpenAI session → Pipecat WebSocket
- `vercel.json` — env vars for PIPECAT_URL, DEEPGRAM_API_KEY (server-side only), CARTESIA_API_KEY

### DELETED FILES (after Phase 4 cutover)
- `src/hooks/useRealtimeVoice.js`
- `api/realtime-token.js`
- `api/kiko-voice.js` (the lite Haiku stopgap)

## Open decisions for Sunny

1. **Cartesia or ElevenLabs Serafina?** Cartesia is faster + cheaper. ElevenLabs Serafina is the brand voice you picked.
2. **Fly.io region?** London (lhr) for lowest latency to UK. Or pick whichever is closest to your typical location.
3. **When?** This is 2-3 days of focused work. Recommend doing it as a single push without other parallel changes so we don't break the existing voice mode mid-migration.
4. **Migration timing relative to other priorities?** I'd recommend AFTER we finish the immediate fixes (email signature, Kind regards, build progress, etc.) and BEFORE we touch anything else big.

## What stays the same

- The waveform UI in the FAB
- The voice mode green glow + listening pill
- KIKO_BIBLE.md system prompt
- The 39 backend tools
- Memory tables
- Chat history table
- All the sequence/campaign work

## What changes

- Voice mode brain: GPT-4o → Claude
- Voice mode STT: Whisper → Deepgram Nova-3
- Voice mode TTS: OpenAI voices → Cartesia or ElevenLabs Serafina
- Voice mode hosting: browser-only WebRTC → Pipecat on Fly.io
- Voice mode close detection: Whisper event regex → Claude inline `<END_VOICE>` token
- Voice mode chat history: client-side JS save → Pipecat server-side save

---

End of migration plan. Awaiting Sunny's go/no-go before Phase 1.
