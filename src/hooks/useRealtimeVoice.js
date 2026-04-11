// src/hooks/useRealtimeVoice.js — Headless GPT-4o Realtime WebRTC voice
// No UI — just manages PeerConnection, mic, audio playback, and tool execution
// Used by KikoFloat for inline voice (stays on page) and KikoVoice for fullscreen
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

async function executeTool(name, args) {
  console.log('[RealtimeVoice] Tool call:', name, args)
  try {
    if (name === 'close_voice') {
      setTimeout(() => window.__kikoVoiceClose?.(), 2000)
      return JSON.stringify({ closing: true })
    }
    if (name === 'navigate_page') {
      const page = args.page || 'home'
      // Use custom event so React Router handles navigation properly (preserves Layout/nav)
      window.dispatchEvent(new CustomEvent('kiko_navigate', { detail: { page } }))
      return JSON.stringify({ navigated: true, page })
    }
    if (name === 'ask_kiko') {
      // FULL KIKO BRAIN: hits /api/kiko (Sonnet + KIKO_BIBLE.md + memory + 39 tools).
      // The lite Haiku /api/kiko-voice was a mistake — left voice Kiko hallucinating.
      const userEmail = (await supabase.auth.getSession()).data?.session?.user?.email || ''
      const r = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: args.query,
          userEmail,
          currentPage: window.location.pathname.replace('/', '') || 'home',
          conversationHistory: [],
          voiceMode: true,
        })
      })
      if (!r.ok || !r.body) return `Error: ${r.status}`
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (typeof payload.delta === 'string') accumulated += payload.delta
          } catch {}
        }
      }
      let cleaned = accumulated.trim()
      cleaned = cleaned.replace(/^(I'll|Let me|I need to|I'm going to|I will|Now I'll|First,?)[^.]*?\.\s*/i, '')
      cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '')
      return cleaned || 'I could not find that information.'
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch (err) { console.error('[RealtimeVoice] Tool error:', err); return JSON.stringify({ error: err.message }) }
}

const SESSION_INSTRUCTIONS = `You are Kiko, the voice interface for Sunny Sidhu (CEO Van Hawke Group, F1 sponsorship advisory + luxury eyewear, based Weybridge UK).

═══ ABSOLUTE RULE — READ THIS TWICE ═══
You DO NOT have any business knowledge of your own. You DO NOT know Sunny's deals, contacts, partnerships, calendar, emails, tasks, news, memory, or any data. You are a voice interface, not a knowledge base.

For EVERY user message that is not pure conversational pleasantry, you MUST call the ask_kiko function before responding. NO EXCEPTIONS. The ask_kiko function returns the actual answer from Kiko's brain. You then speak that answer aloud.

═══ THE ONLY EXCEPTIONS ═══
You may respond directly without calling ask_kiko ONLY for:
1. Pure greetings: "hi", "hello", "hey Kiko" — REPLY WITH ONLY: "Hi Sunny, how can I help?" or similar 5-8 word greeting. DO NOT volunteer briefs, updates, summaries, or proactive suggestions. WAIT for the user's actual question.
2. Pure acknowledgments: "thanks", "thank you", "ok", "got it" — brief acknowledgment only
3. Goodbye phrases (handled by the system, just say a brief farewell)

NEVER auto-brief on a greeting. NEVER say "here's what's happening today" unless explicitly asked. NEVER list things proactively. The user opened voice mode to ASK something — wait for the question.

EVERYTHING ELSE — including questions you think you know the answer to, including the weather, including general knowledge, including "what time is it", including "how are you" — call ask_kiko.

If you answer a real question without calling ask_kiko, you are hallucinating. You will be wrong. Sunny will lose trust in this product.

═══ HOW TO USE ask_kiko ═══
1. User speaks
2. Say a brief filler ("One moment", "Checking now", "Let me look")
3. Call ask_kiko with the user's exact question as the query parameter
4. When the result returns, speak it aloud naturally — paraphrase into spoken English, keep to 1-3 sentences
5. Never invent details not in the ask_kiko response

═══ GOODBYE — EXACT 3 PHRASES ═══
The system closes the session ONLY when the user says exactly:
- "Goodbye"
- "Goodbye Kiko"
- "Bye Kiko"
When you hear one, say a brief warm farewell ("Speak soon, Sunny") and the system closes automatically.

═══ NAVIGATION ═══
ONLY use navigate_page when user says "go to", "take me to", "open", or "show me". Data questions = ask_kiko, NOT navigate.

═══ STYLE ═══
Warm, direct, intelligent female voice. 1-3 sentences per turn. Say "intelligent age" not "AI generation". USD for finances. Never discuss your own architecture. Never respond to background noise or your own audio.

═══ ANTI-PATTERNS ═══
Never invent deal names, dollar values, dates, or specific data. Never say "I don't have access to" — call ask_kiko instead.`

const TOOLS = [
  { type: 'function', name: 'ask_kiko', description: 'MANDATORY for every user query that is not pure greeting/thanks/goodbye. The ONLY way to access Kiko intelligence: pipeline, deals, contacts, partnerships, calendar, email, tasks, memory, news, web search, briefings, strategy.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The full question or request, exactly as the user said it' } }, required: ['query'] } },
  { type: 'function', name: 'navigate_page', description: 'Navigate platform UI. ONLY when user explicitly says go to / take me to / open / show me [page].', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home','pipeline','contacts','companies','organisations','campaigns','sequences','command-centre','calendar','tasks','partnership-matrix','news','documents','intelligence','outreach','admin'] } }, required: ['page'] } },
]

export function useRealtimeVoice({ active, onClose, onMessage }) {
  const [status, setStatus] = useState('idle') // idle|connecting|listening|speaking|thinking|error
  const [speaking, setSpeaking] = useState(false)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const streamRef = useRef(null)
  const deadRef = useRef(false)
  const connectingRef = useRef(false) // Guard against double-mount in React strict mode
  const idleTimerRef = useRef(null)   // 2-minute inactivity timer
  const IDLE_TIMEOUT_MS = 2 * 60 * 1000

  function resetIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      console.log('[RealtimeVoice] 2-min idle — auto-closing session')
      onCloseRef.current?.()
    }, IDLE_TIMEOUT_MS)
  }

  // Expose close handler for close_voice tool
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  useEffect(() => {
    window.__kikoVoiceClose = () => onCloseRef.current?.()
    return () => { window.__kikoVoiceClose = null }
  }, [])

  const handleDCMessage = useCallback(async (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'response.function_call_arguments.done') {
        const { name, arguments: argsStr, call_id } = msg
        setStatus('thinking')
        const args = JSON.parse(argsStr || '{}')
        const result = await executeTool(name, args)
        dcRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id, output: result || '{}' }
        }))
        dcRef.current?.send(JSON.stringify({ type: 'response.create' }))
        setStatus('speaking')
      }
      // Speaking detection — handle BOTH old and new gpt-realtime schemas
      if (msg.type === 'output_audio_buffer.started' || msg.type === 'response.output_audio.delta') {
        setSpeaking(true); resetIdleTimer()
      }
      if (msg.type === 'output_audio_buffer.stopped' || msg.type === 'output_audio_buffer.cleared' ||
          msg.type === 'response.output_audio.done' || msg.type === 'response.done') {
        setSpeaking(false)
      }
      if (msg.type === 'input_audio_buffer.speech_started') { setStatus('listening'); resetIdleTimer() }
      if (msg.type === 'response.done') setStatus('listening')
      // Status transitions to 'listening' (green) ONLY after the session is fully created.
      // Without this gate, dc.onopen flips to listening immediately even if session.update
      // hasn't been acknowledged or the underlying PC isn't actually connected.
      if (msg.type === 'session.created' || msg.type === 'session.updated') {
        console.log('[RealtimeVoice] Session ready — flipping to listening')
        setStatus('listening')
      }

      // ── Transcript capture for chat-history save ──
      // User speech (Whisper transcription on input audio)
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const userText = (msg.transcript || '').trim()
        if (userText && onMessageRef.current) {
          onMessageRef.current({ role: 'user', content: userText, at: Date.now() })
        }
        // Goodbye safety net — fire close fallback within 3s if GPT-4o doesn't call close_voice
        const lower = userText.toLowerCase()
        const isGoodbye = (
          /\b(bye|goodbye|good\s*bye)\b/.test(lower) ||
          /\b(see\s+you|talk\s+(to\s+you\s+)?(later|soon)|catch\s+you\s+later|speak\s+(to\s+you\s+)?(later|soon))\b/.test(lower) ||
          /\b(close\s+voice|stop\s+listening|stop\s+voice|end\s+(voice|call)|exit\s+voice|hang\s+up)\b/.test(lower) ||
          /\b(i'?m\s+done|that'?s\s+all|that\s+is\s+all|we'?re\s+done|all\s+done)\b/.test(lower)
        )
        if (isGoodbye) {
          console.log('[RealtimeVoice] Goodbye detected — closing IMMEDIATELY:', userText)
          // Cancel any in-flight GPT-4o response so it doesn't keep talking
          try { dcRef.current?.send(JSON.stringify({ type: 'response.cancel' })) } catch {}
          if (window.__kikoVoiceClose) window.__kikoVoiceClose()
        }
      }
      // Kiko speech (GPT-4o assistant response)
      // New gpt-realtime schema: `response.output_audio_transcript.done`
      // Old schema: `response.audio_transcript.done`. Handle both.
      if (msg.type === 'response.output_audio_transcript.done' || msg.type === 'response.audio_transcript.done') {
        const kikoText = (msg.transcript || '').trim()
        if (kikoText && onMessageRef.current) {
          onMessageRef.current({ role: 'kiko', content: kikoText, at: Date.now() })
        }
      }

      if (msg.type === 'error') { console.error('[RealtimeVoice] Error:', msg.error); setStatus('error') }
    } catch (e) { console.error('[RealtimeVoice] DC error:', e) }
  }, [])

  const connect = useCallback(async () => {
    if (connectingRef.current || pcRef.current) return // Prevent double-connect
    connectingRef.current = true
    try {
      deadRef.current = false
      setStatus('connecting')
      const voice = localStorage.getItem('kiko_voice') || 'coral'
      const tokenRes = await fetch('/api/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice }),
      })
      if (!tokenRes.ok) throw new Error('Token failed')
      const { value: key } = await tokenRes.json()
      if (!key || deadRef.current) return

      const pc = new RTCPeerConnection()
      pcRef.current = pc
      // Monitor underlying PC state — flip to error if it disconnects mid-session
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState
        console.log('[RealtimeVoice] PC connection state:', s)
        if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          if (!deadRef.current) {
            console.warn('[RealtimeVoice] PC dropped — auto-closing session')
            setStatus('error')
            setTimeout(() => onCloseRef.current?.(), 500)
          }
        }
      }
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.style.display = 'none'
      document.body.appendChild(audioEl)
      audioRef.current = audioEl
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
        // Create analyser for frequency data (drives KikoWaveform)
        try {
          const actx = new AudioContext()
          const src = actx.createMediaStreamSource(e.streams[0])
          const an = actx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.75
          src.connect(an)
          const fd = new Uint8Array(an.frequencyBinCount)
          const pump = () => {
            if (deadRef.current) return
            an.getByteFrequencyData(fd)
            window.__kikoFreqData = fd
            let s = 0; for (let i = 0; i < fd.length; i++) s += fd[i] * fd[i]
            window.__kikoAudioEnergy = Math.min(0.55, Math.sqrt(s / fd.length) / 255 * 2.5)
            requestAnimationFrame(pump)
          }
          requestAnimationFrame(pump)
        } catch {}
      }

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (deadRef.current) { ms.getTracks().forEach(t => t.stop()); return }
      streamRef.current = ms
      pc.addTrack(ms.getTracks()[0])

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = handleDCMessage
      dc.onopen = () => {
        // STAY in 'connecting' (amber) until session.created event arrives
        // Do NOT flip to 'listening' here — that's the false-green bug.
        console.log('[RealtimeVoice] Data channel open — sending session config')
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            audio: {
              input: {
                turn_detection: { type: 'server_vad', threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 500 },
                // Whisper transcription MUST be inside audio.input — at session root
                // it is silently ignored. Without this, conversation.item.input_audio_transcription.completed
                // never fires, breaking goodbye safety net AND voice→chat-history saves.
                transcription: { model: 'whisper-1' },
              }
            },
            instructions: SESSION_INSTRUCTIONS,
            tools: TOOLS,
            tool_choice: 'auto',
          }
        }))
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', body: offer.sdp,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/sdp' },
      })
      if (!sdpRes.ok) throw new Error('SDP failed: ' + sdpRes.status)
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })
      console.log('[RealtimeVoice] Connected')
      connectingRef.current = false
    } catch (err) { console.error('[RealtimeVoice] Connect failed:', err); setStatus('error'); connectingRef.current = false }
  }, [handleDCMessage])

  const disconnect = useCallback(() => {
    deadRef.current = true
    connectingRef.current = false
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null }
    if (dcRef.current) try { dcRef.current.close() } catch {}
    if (pcRef.current) try { pcRef.current.close() } catch {}
    pcRef.current = null
    dcRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current.remove(); audioRef.current = null }
    setSpeaking(false)
    setStatus('idle')
    window.__kikoAudioEnergy = 0
  }, [])

  // Connect/disconnect based on active prop
  useEffect(() => {
    if (active) { connect() }
    return () => { disconnect() }
  }, [active, connect, disconnect])

  return { status, speaking, disconnect }
}
