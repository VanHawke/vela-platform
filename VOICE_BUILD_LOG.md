# KIKO VOICE — BUILD LOG
# Track every attempt, what worked, what failed, what to never repeat
# Created: 1 April 2026

---

## ATTEMPT 1: LiveKit Agents (Python) — ABANDONED
- **Date:** Late March 2026
- **Architecture:** Python server orchestrating voice
- **Outcome:** Wrong language (platform is JS/Node). Unnecessary complexity.
- **Lesson:** Don't introduce new languages/runtimes. Stay in the stack.

## ATTEMPT 2: GPT-4o Realtime relay — FAILED
- **Architecture:** GPT-4o as brain, relay pattern
- **Outcome:** GPT-4o fabricated data — no access to Claude's 39 tools. Refusal interceptor bugs cascaded.
- **Lesson:** GPT-4o cannot be the brain. It hallucinates business data.

## ATTEMPT 3: GPT-4o Realtime WebRTC (original KikoVoice.jsx) — PARTIALLY WORKING
- **Architecture:** GPT-4o speech-to-speech via WebRTC, 8 browser-side tools
- **Outcome:** WebRTC connected. Audio played. Speech-to-speech worked. BUT: 8 hand-rolled tools were fragile, GPT-4o still hallucinated when tools failed, browser caching made deploys unreliable.
- **What worked:** WebRTC connection ✅, speech-to-speech audio ✅, interruption ✅, waveform energy from remote audio ✅
- **What failed:** Data accuracy (GPT-4o guessing instead of using tools), tool coverage (8 vs 39)
- **Lesson:** The voice TRANSPORT was correct. The tool routing was wrong.

## ATTEMPT 4: Deepgram STT → /api/kiko → Deepgram TTS — FAILED (6 sub-attempts)
- **Date:** 1 April 2026
- **Architecture:** Browser Deepgram STT WebSocket → Claude via /api/kiko → Deepgram TTS → Web Audio playback
- **Sub-attempts:**
  - 4a: Server-side TTS proxy (api/voice-tts.js) — audio never played
  - 4b: Browser-direct TTS WebSocket, StreamingAudioPlayer with enqueue — choppy/garbled
  - 4c: Accumulate per Flush, gapless scheduling — still no audio
  - 4d: Simplified player, own AudioContext — audio played but crackling
  - 4e: Sentence-by-sentence REST TTS — clean audio but 10s latency
  - 4f: Full response then ONE TTS call — clean audio, 10s latency, no interruption

- **Root cause of ALL Deepgram failures:**
  1. Web Audio API playback of small PCM chunks is fundamentally broken — 40ms chunks create gaps
  2. STT→text→LLM→text→TTS pipeline has inherent 5-10s latency that no code can fix
  3. Six rewrites of audio playback code, none worked reliably
- **Lesson:** STT→LLM→TTS is the WRONG architecture for conversational voice. Speech-to-speech (GPT-4o Realtime) is the only way to get sub-second response.

## ATTEMPT 5: GPT-4o Realtime WebRTC + ask_kiko (current) — DEPLOYED, ISSUES
- **Date:** 1 April 2026
- **Architecture:** Restored original GPT-4o WebRTC. Replaced 8 browser tools with 2: ask_kiko (routes to /api/kiko Claude brain) + navigate_page
- **What works:** WebRTC connects ✅, ephemeral token ✅, session.created + session.updated ✅, speech-to-speech audio ✅
- **Known issues to fix:**
  1. Equalizer not moving when Kiko speaks — startAudioAnalyser needs remote audio stream
  2. Need to verify ask_kiko tool actually fires and returns data
  3. GPT-4o instructions need filler phrases ("one moment", "let me check")
  4. kiko.js voiceMode changes from Attempt 4 may conflict — need to verify/revert

## WHAT MUST NEVER BE REPEATED
- Do NOT try Deepgram/Cartesia/ElevenLabs STT→TTS pipeline for conversational voice
- Do NOT rewrite audio playback code — Web Audio API PCM chunk playback is unreliable
- Do NOT use Haiku for voice responses — produces garbage meta-talk
- Do NOT skip voiceMode personal context loading — Kiko needs memory access
- Do NOT change kiko.js model routing without clear reason and testing

## REQUIREMENTS (non-negotiable)
1. Realtime conversation — sub-second for casual chat
2. Full tool access — 39 tools via /api/kiko (Claude brain)
3. Full memory access — preferences, personal context, learning log
4. Email/calendar access via tools
5. Interruption — instant stop when user speaks
6. No hallucination — real data only, GPT-4o must ALWAYS call ask_kiko for data
7. Filler phrases — "one moment", "let me check that" while fetching
8. Equalizer reacts to Kiko's voice only (not user's mic)
9. Natural conversation — warm, direct, like talking to a trusted advisor

## CURRENT STATE (as of latest deploy)
- GPT-4o Realtime WebRTC with ask_kiko + navigate_page tools
- api/realtime-token.js restored and working (returns ek_ ephemeral key)
- KikoVoice.jsx: original WebRTC code with modified tools + instructions
- kiko.js: has voiceMode changes from Attempt 4 — NEEDS AUDIT


## FIX: Equalizer not moving (1 Apr 2026)
- **Root cause:** `<KikoWaveform volume={0} />` — hardcoded to zero in original code
- **Fix:** Added `volume` state variable, fed by `startAudioAnalyser` pump (same RMS that drives `window.__kikoAudioEnergy`), passed as `volume={volume}` prop
- **Files changed:** KikoVoice.jsx only (3 lines)

## CURRENT kiko.js VOICEMODE STATE (verified clean)
- Personal context loads via light queries ✅
- Voice rules: natural speech, no meta-talk, no markdown ✅
- Greetings: Haiku, 300 tokens, no tools (fast) ✅
- Data queries: Sonnet, 3 rounds, 20s, full 4096 tokens ✅
- Entity auto-recall: skipped in voice mode (speed) ✅


## FIX: Stale service worker (1 Apr 2026)
- **Root cause:** Service worker `kiko-v1` was caching old Deepgram bundle (`index-6WnodsBj.js`). TWO bundles running simultaneously — old Deepgram build kept trying to call deleted `voice-token` endpoint while new GPT-4o build was running.
- **Fix:** Unregistered service worker, cleared `kiko-v1` cache via browser console. Hard refresh.
- **Lesson:** Always clear service workers when changing voice architecture. Add this to deploy checklist.

## STATUS AFTER ALL FIXES (1 Apr 2026)
### GPT-4o Realtime WebRTC — CONFIRMED WORKING
1. `api/realtime-token` → ephemeral key `ek_...` ✅
2. WebRTC PeerConnection → connected ✅
3. Remote audio track → received ✅
4. Data channel → open ✅
5. `session.created` → received ✅
6. `session.updated` (2 tools: ask_kiko + navigate) → accepted ✅
7. Equalizer: volume prop fed from audio analyser ✅
8. Service worker stale cache → cleared ✅

### AWAITING USER VOICE TEST
- Say "Hey Kiko" → GPT-4o should respond instantly with speech
- Say "How's the pipeline?" → GPT-4o says "let me check" → calls ask_kiko → speaks real data
- Interrupt mid-sentence → should stop immediately
- Equalizer should animate when she speaks


## FIX: Memory not accessible (1 Apr 2026)
- **Root cause:** GPT-4o instructions said "casual conversation, opinions, general advice — respond directly without tools." Memory/recall questions ("do you remember", "what do you know about me") were classified as casual → GPT-4o answered from its own empty knowledge.
- **Fix:** Rewrote instructions with explicit WHEN TO USE / WHEN NOT TO USE lists. ask_kiko is now mandatory for: memory, past conversations, personal context, ANY data question, ANY uncertainty. ONLY literal greetings ("hi", "hello", "how are you") skip the tool.
- **Also:** Updated ask_kiko tool description to explicitly mention "memory recall, past conversations, personal context"
- **Files changed:** KikoVoice.jsx only


## FIX: Voice tone + Settings page gating (1 Apr 2026)
- **Voice:** Changed from "shimmer" to "coral" (Friendly, natural female) in realtime-token.js. User wanted softer, more natural, more feminine.
- **Settings Kiko tab:** Added SUPER_ADMIN_TABS array. Kiko and Team tabs now filtered out for non-super_admin users. Regular users see: Profile, Skills, Navigation, Appearance, Accounts only.
- **Settings functionality:** The Voice/Speed/Model/Memory/Personality controls in the Kiko tab are display-only — they don't save to any backend config. Noted for future: wire these to kiko_user_config table if we want per-user voice/personality selection.
- **Files changed:** api/realtime-token.js (voice), src/components/settings/Settings.jsx (tab gating)
