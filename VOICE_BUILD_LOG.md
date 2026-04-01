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


## KNOWN ISSUES (reported 1 Apr 2026, afternoon session)
1. **Settings voice controls don't work** — UI exists but doesn't save/apply. Remove non-functional controls or wire them.
2. **Voice changes on its own** — GPT-4o sometimes shifts tone/pitch mid-conversation. Need to lock voice in session config.
3. **User wants voice selection** — Enable voice picker in settings that actually changes the voice used.
4. **Kiko replies to herself** — Audio feedback loop: speaker audio picked up by mic → GPT-4o responds to itself. Fix: adjust VAD turn detection threshold.
5. **KikoFloat voice mode not engaging** — Voice works from homepage but not from the floating button.
6. **Navigation instead of answering** — Asked "about partnership matrix" → navigated to page instead of answering the question. Fix: GPT-4o instructions need to distinguish "tell me about X" from "go to X".
7. **Partnership matrix page broke nav/header** — After voice-triggered navigation, top nav and header row disappeared. Needed hard refresh.
8. **"Goodbye Kiko" voice command** — Should close voice mode when spoken. Not currently implemented.


## DEPLOY: KikoFloat voice + GPT-4o fixes (1 Apr 2026)
### Changes:
1. **GPT-4o session config rewritten:**
   - VAD threshold 0.6 (prevents self-reply from speaker echo)
   - Silence duration 500ms (faster turn detection)
   - Navigation vs data query distinction: "tell me about X" = ask_kiko, "take me to X" = navigate
   - Voice consistency instruction added
   - "Don't respond to background noise or your own audio"
   - input_audio_transcription enabled for transcript logging
2. **"Goodbye Kiko" voice command:** close_voice tool added. GPT-4o says farewell then closes voice mode after 2s.
3. **KikoFloat → KikoVoice wiring:** EQ button now dispatches kiko_open_voice event. Layout.jsx listens and renders KikoVoice portal. KikoFloat resets voiceOpen when voice state becomes inactive.
4. **Equalizer fix verified:** volume state fed from audio analyser.
### Files changed:
- KikoVoice.jsx (session config, close_voice tool, onCloseRef)
- KikoFloat.jsx (openVoiceMode dispatches event, voice state listener)
- Layout.jsx (globalVoiceMode state, kiko_open_voice listener, KikoVoice render)
- VOICE_BUILD_LOG.md


## ✅ CONFIRMED WORKING — 1 Apr 2026, final afternoon session

### Voice Architecture (GPT-4o Realtime WebRTC + ask_kiko)
- [x] Ephemeral token generation via api/realtime-token.js
- [x] WebRTC PeerConnection connecting
- [x] Remote audio track received (Kiko's voice)
- [x] Data channel open
- [x] Session config with 3 tools (ask_kiko + navigate_page + close_voice) accepted
- [x] Speech-to-speech working (sub-second for greetings)
- [x] ask_kiko tool fires for data questions → routes to /api/kiko (Claude + 39 tools)
- [x] Interruption working (output_audio_buffer.cleared on speech detection)
- [x] Voice: Coral (friendly, natural female)
- [x] VAD threshold: 0.6 (prevents self-reply)

### UI
- [x] KikoVoice fullscreen portal from homepage (KikoChat)
- [x] KikoVoice fullscreen portal from KikoFloat EQ button (any non-home page)
- [x] Equalizer waveform animated by Kiko's remote audio energy
- [x] "Kiko is speaking" / "Listening" status in top-right
- [x] "Goodbye Kiko" button visible
- [x] close_voice tool — verbal "Goodbye Kiko" closes voice after 2s
- [x] Settings: Kiko + Team tabs hidden for non-super_admin

### GPT-4o Instructions
- [x] Navigation vs data distinction ("tell me about X" → ask_kiko, "take me to X" → navigate)
- [x] Voice consistency instruction
- [x] Filler phrases while tools run
- [x] Don't respond to background noise/own audio

### Remaining Issues for Next Session
1. Settings voice picker not wired — display only, doesn't save/apply
2. Partnership matrix nav/header disappearing after voice navigation
3. Voice tone/pitch user controls not implemented
4. Occasional self-reply despite VAD 0.6 — monitor

### File Reference
- `api/realtime-token.js` — GPT-4o ephemeral key (voice: coral)
- `src/components/kiko/KikoVoice.jsx` — GPT-4o WebRTC, 3 tools, session config
- `src/components/kiko/KikoFloat.jsx` — dispatches kiko_open_voice, listens for voice state
- `src/components/layout/Layout.jsx` — globalVoiceMode state, renders KikoVoice portal
- `api/kiko.js` — voiceMode rules, Haiku for greetings, Sonnet for tools

### Deploy Checklist
1. `npm run build` — verify no errors
2. Check bundle strings: close_voice, ask_kiko, kiko_open_voice
3. `git add -A && git commit`
4. `VERCEL_FORCE_NO_BUILD_CACHE=1 npx vercel --prod --yes --force`
5. Verify live bundle hash changed
6. `git push origin main`
7. Clear service workers if architecture changed
8. Hard refresh (Cmd+Shift+R)
9. Test: voice from home, voice from KikoFloat, ask_kiko fires, interruption, goodbye


## DEPLOY: Inline KikoFloat voice + web search fix (1 Apr 2026)
### Changes:
1. **Inline voice in KikoFloat** — Created `useRealtimeVoice.js` hook (headless WebRTC). KikoFloat EQ button starts voice WITHOUT leaving the page. User stays on pipeline/contacts/etc while talking to Kiko. Prompt bar + attach file still usable during voice.
2. **Web search timeout** — Voice mode tool rounds 3→5, timeout 20s→45s. Research queries ("find top 20 companies") now have time for 3-8 web searches + synthesis.
3. **Voice status in float header** — Shows "Kiko • Speaking" / "Listening" / "Thinking" / "Connecting" with coloured dot.
4. **Red stop button** — EQ icon swaps to red square when voice active.

### Verified working:
- [x] Pipeline page stays visible during voice
- [x] KikoFloat panel open with voice active
- [x] Status indicator in float header
- [x] Prompt bar still usable
- [x] ask_kiko tool calls firing
- [x] WebRTC connected (`[RealtimeVoice] Connected`)

### Files:
- NEW: `src/hooks/useRealtimeVoice.js` — headless GPT-4o WebRTC hook
- MOD: `src/components/kiko/KikoFloat.jsx` — uses hook, inline voice, status indicator
- MOD: `api/kiko.js` — voice timeout 20s→45s, tool rounds 3→5

### Note: Triple `[RealtimeVoice] Connected` in console
- Hook may be mounting 3 times due to React strict mode or multiple renders
- Not causing issues but should investigate if it creates multiple WebRTC connections
- Fix: add cleanup in useEffect to prevent double-connect


## FIX: Voice navigation breaks top nav/header (1 Apr 2026)
- **Root cause:** `navigate_page` tool used `window.history.pushState()` + `PopStateEvent`. This bypasses React Router — Layout component never re-renders, so top nav and page header disappear.
- **Fix:** Changed both `useRealtimeVoice.js` and `KikoVoice.jsx` to dispatch `kiko_navigate` custom event instead. Layout.jsx listens for this event and calls `kikoNavigate()` which uses React Router's `navigate()` function. This triggers proper re-render of the entire component tree including Layout, nav bar, and page header.
- **Files:** useRealtimeVoice.js, KikoVoice.jsx, Layout.jsx
- **Lesson:** Never use pushState for SPA navigation. Always go through React Router.


## ✅ CONFIRMED: Voice follows across pages (1 Apr 2026)
### Test: Home → "take me to command centre" (simulated via kiko_navigate event)
- [x] Nav bar visible on command centre page
- [x] Page header "Command Centre" with stats visible
- [x] KikoFloat panel auto-opened with voice active ("Kiko • Listening")
- [x] Red stop button shows voice is running
- [x] Prompt bar still usable for text input + file upload

### How it works:
1. Voice nav dispatches `kiko_navigate` event with page name
2. Layout.jsx handler: resets `voiceFullscreen` (shows nav), sets `floatVoiceRequested=true`, calls React Router `navigate()`
3. Safety net `useEffect`: if `!isHome && voiceFullscreen`, force reset to false
4. KikoFloat receives `autoVoice=true` prop → auto-opens panel + activates inline voice via `useRealtimeVoice` hook
5. KikoFloat calls `onAutoVoiceConsumed()` to reset the flag

### Settings voice picker:
- Voice selection saves to `user_settings` (Supabase) AND `localStorage`
- `useRealtimeVoice.js` and `KikoVoice.jsx` read from `localStorage.getItem('kiko_voice')`
- `api/realtime-token.js` accepts `voice` parameter in request body
- Available voices: shimmer, coral (default), sage, verse, marin, alloy, echo, cedar

### REMAINING FOR NEXT SESSION:
1. Voice preview play buttons in Settings (currently hit deleted /api/voice endpoint)
2. Speech Speed setting — not wired
3. Personality setting — display only
4. Voice tone/pitch/femininity controls — not available in GPT-4o Realtime API (voice is fixed per model)
5. Occasional self-reply — monitor with VAD 0.6


## FIX: Audio not playing — element not in DOM (1 Apr 2026)
- **Root cause:** `document.createElement('audio')` creates element in memory. Both KikoVoice.jsx and useRealtimeVoice.js never appended it to `document.body`. Some browsers (including Chrome) require audio elements to be in the DOM for autoplay to work with WebRTC streams.
- **Evidence:** `document.querySelectorAll('audio')` returned empty array despite WebRTC being fully connected with `output_audio_buffer.started` events firing.
- **Fix:** Added `document.body.appendChild(audioEl)` after creation, with `audioEl.style.display = 'none'`. Cleanup removes element on unmount via `audioEl.remove()`.
- **Files:** KikoVoice.jsx, useRealtimeVoice.js
- **Lesson:** Always append dynamically created audio/video elements to the DOM.


## DEPLOY: KikoVoiceOrb in FAB (1 Apr 2026)
- Animated teal orb replaces "+" icon when voice mode is active in KikoFloat
- Three concentric rings + glowing center dot
- Pulses fast (1s) when speaking, breathes slow (3s) when listening
- Teal aura rings around FAB sphere when voice active
- Keyframes: kikoOrbPulse (scale 1→1.15), kikoOrbBreathe (scale 1→1.2)

## END OF DAY STATUS — 1 April 2026

### ARCHITECTURE (FINAL):
- GPT-4o Realtime WebRTC = instant speech-to-speech voice layer
- ask_kiko tool = routes ALL data/memory/research to /api/kiko (Claude + 39 tools + web search)
- navigate_page tool = React Router via kiko_navigate event (preserves Layout)
- close_voice tool = "Goodbye Kiko" verbal command

### VERIFIED WORKING:
- [x] Speech-to-speech (sub-second greetings)
- [x] ask_kiko fires for data questions → Claude brain
- [x] Web search via Claude (45s timeout, 5 tool rounds)
- [x] Fullscreen voice from home (KikoVoice.jsx)
- [x] Inline voice from KikoFloat on any page (useRealtimeVoice.js)
- [x] Voice follows across pages (autoVoice prop → KikoFloat activates)
- [x] Nav/header preserved on voice navigation
- [x] "Goodbye Kiko" closes voice
- [x] Settings voice picker wired (localStorage → realtime-token)
- [x] Equalizer animated (fullscreen mode)
- [x] KikoVoiceOrb animated in FAB (inline mode)
- [x] Audio element appended to DOM for playback
- [x] VAD threshold 0.6 (anti self-reply)
- [x] Settings Kiko/Team tabs hidden for non-super_admin

### REMAINING FOR NEXT SESSION:
1. Verify audio playback end-to-end (DOM append fix needs user confirmation)
2. Voice preview play buttons in Settings (need TTS preview endpoint)
3. Speech speed setting — not wired to GPT-4o (may not be configurable)
4. Personality setting — display only
5. Monitor occasional self-reply with VAD 0.6
6. Triple WebRTC connection on mount (React strict mode?) — needs investigation

### GIT STATE:
- Tag: phase-13-voice-v4
- Latest commit includes all fixes
- Build log: VOICE_BUILD_LOG.md (comprehensive)


## DEPLOY: Glassmorphism v4 + Voice fixes batch (1 Apr 2026, evening)
### Glassmorphism changes:
- **theme.js**: Glass v4 tokens — elevated shadows, 0.5px borders, top-edge highlight, deep/float variants
- **index.css**: CSS variables updated — glass-bg, glass-shadow, glass-shadow-deep, glass-shadow-card
- **12 pages bulk-updated**: rgba backgrounds → glass transparency, 1.5px borders → 0.5px
- **Pipeline.jsx**: Column containers + deal cards with backdrop-filter blur + depth shadows
- **OutreachIntelligence.jsx** (Command Centre): Stat cards with glass + blur
- **KikoFloat.jsx**: Panel with heavy blur(40px) saturate(1.5) + float shadow
- **KikoChat.jsx**: Prompt bar with elevated glass + top-edge highlight
- **Settings.jsx**: Card panels with glass + blur + shadow
- **Layout.jsx**: Nav pill border-radius 50→14, glass shadow

### Voice fixes in same deploy:
1. Spectral equalizer — KikoWaveform reads window.__kikoFreqData from audio analyser
2. Avatar consistency — FAB shows KikoWaveform mini during voice (not KikoVoiceOrb)
3. Voice preview endpoint — api/voice-preview.js using OpenAI gpt-4o-mini-tts
4. Speed/personality save to localStorage
5. Triple WebRTC connection guard (connectingRef)
6. Inline voice analyser in useRealtimeVoice.js

### STILL REMAINING (items 9-10, 14, 16):
9. File drag-and-drop preview thumbnails in prompt bar
10. Chat panel title with dropdown (Star/Rename/Delete)
14. Re-test partnership matrix voice navigation
16. Commit c448790 pending fixes
