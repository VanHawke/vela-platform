// src/components/kiko/KikoVoice.jsx — GPT-4o Realtime via WebRTC
// Speech-to-speech. Function calling for real data. No pipeline.
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import KikoWaveform from './KikoWaveform'
import AuroraCanvas from '../AuroraCanvas'
import T from '@/lib/theme'
import { supabase } from '@/lib/supabase'

const BAR_COLORS = {
  connecting: '#f59e0b', listening: '#22c55e', thinking: '#8b5cf6',
  speaking: '#22c55e', error: '#f87171', idle: 'rgba(167,139,250,0.18)',
}

// ── Tool Execution: ONE tool routes to Claude brain, one handles nav ──
async function executeTool(name, args) {
  console.log('[KikoVoice] Tool call:', name, args)
  try {
    if (name === 'close_voice') {
      // Delay slightly so GPT-4o's farewell audio can play
      setTimeout(() => window.__kikoVoiceClose?.(), 2000)
      return JSON.stringify({ closing: true })
    }
    if (name === 'navigate_page') {
      const page = args.page || 'home'
      window.dispatchEvent(new CustomEvent('kiko_navigate', { detail: { page } }))
      return JSON.stringify({ navigated: true, page })
    }
    if (name === 'ask_kiko') {
      // FULL KIKO BRAIN: hits /api/kiko (Sonnet + KIKO_BIBLE.md + memory + 39 tools).
      // Slower (~5-12s) but actually intelligent. The lite Haiku /api/kiko-voice
      // endpoint was a mistake — it left voice Kiko hallucinating from training.
      // Streaming SSE response, accumulate deltas into final string.
      const userEmail = (await supabase.auth.getSession()).data?.session?.user?.email || ''
      const r = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: args.query,
          userEmail,
          currentPage: window.location.pathname.replace('/', '') || 'home',
          conversationHistory: [],
          voiceMode: true,  // backend uses this to trim response length
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
      // Strip Claude's reasoning preamble (same fix as draft regenerate)
      let cleaned = accumulated.trim()
      cleaned = cleaned.replace(/^(I'll|Let me|I need to|I'm going to|I will|Now I'll|First,?)[^.]*?\.\s*/i, '')
      cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '')
      return cleaned || 'I could not find that information.'
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch (err) { console.error('[KikoVoice] Tool error:', err); return JSON.stringify({ error: err.message }) }
}

export default function KikoVoice({ onClose, user, onVoiceState, onMessage }) {
  // inline prop removed — voice is always fullscreen now per UX decision 2026-04-09
  const [status, setStatus] = useState('connecting')
  const [speaking, setSpeaking] = useState(false)
  const [volume, setVolume] = useState(0)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const energyRAF = useRef(null)
  const analyserRef = useRef(null)

  // Expose close handler globally for executeTool's close_voice
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    window.__kikoVoiceClose = () => onCloseRef.current?.()
    return () => { window.__kikoVoiceClose = null; }
  }, [])
  const color = BAR_COLORS[status] || BAR_COLORS.idle

  useEffect(() => { if (onVoiceState) onVoiceState({ status, speaking }) }, [status, speaking])

  // ── Drive KikoWaveform from remote audio ──
  const startAudioAnalyser = (stream) => {
    try {
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.75
      src.connect(an)
      analyserRef.current = { ctx, an }
      const d = new Uint8Array(an.frequencyBinCount)
      const pump = () => {
        an.getByteFrequencyData(d)
        // Expose raw frequency data for KikoWaveform spectral reactivity
        window.__kikoFreqData = d
        let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]
        const rms = Math.sqrt(s / d.length) / 255
        window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5)
        window.__kikoAudioPitch = Math.min(0.4, rms * 1.2)
        const isTalking = rms > 0.02
        if (isTalking !== speaking) setSpeaking(isTalking)
        setVolume(rms > 0.02 ? Math.min(0.55, rms * 2.5) : 0)
        energyRAF.current = requestAnimationFrame(pump)
      }
      energyRAF.current = requestAnimationFrame(pump)
    } catch (e) { console.error('[KikoVoice] Audio analyser error:', e) }
  }

  // ── Handle data channel messages (function calls from GPT-4o) ──
  const handleDCMessage = async (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      console.log('[KikoVoice] Event:', msg.type)

      if (msg.type === 'response.function_call_arguments.done') {
        const { name, arguments: argsStr, call_id } = msg
        setStatus('thinking')
        const args = JSON.parse(argsStr || '{}')
        const result = await executeTool(name, args)
        console.log('[KikoVoice] Tool result:', name, result?.slice?.(0, 100))
        // Send result back to GPT-4o
        dcRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id, output: result || '{}' }
        }))
        // Tell GPT-4o to respond with the result
        dcRef.current?.send(JSON.stringify({ type: 'response.create' }))
      }

      if (msg.type === 'response.audio.delta') setStatus('speaking')
      if (msg.type === 'response.audio.done') setStatus('listening')
      if (msg.type === 'input_audio_buffer.speech_started') setStatus('listening')

      // ── Transcript capture for chat-history save ──
      // User speech transcript (Whisper on input audio)
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const userText = (msg.transcript || '').trim()
        if (userText && onMessage) onMessage({ role: 'user', content: userText, at: Date.now() })
        // GOODBYE — EXACT 3 PHRASES ONLY (Sunny spec 2026-04-11):
        //   "goodbye"  |  "goodbye kiko"  |  "bye kiko"
        // Strip punctuation and lowercase, then exact match. Anything else
        // does NOT close the session — no "see you later", no "thanks bye".
        const normalized = userText.toLowerCase().replace(/[.,!?]/g, '').trim()
        const isGoodbye = (
          normalized === 'goodbye' ||
          normalized === 'goodbye kiko' ||
          normalized === 'bye kiko'
        )
        if (isGoodbye) {
          console.log('[KikoVoice] Goodbye detected — closing IMMEDIATELY:', userText)
          // Cancel any in-flight GPT-4o response so it doesn't keep talking
          try { dcRef.current?.send(JSON.stringify({ type: 'response.cancel' })) } catch {}
          // Fire close right away
          if (window.__kikoVoiceClose) window.__kikoVoiceClose()
        }
      }
      // Kiko speech transcript (GPT-4o assistant response)
      if (msg.type === 'response.audio_transcript.done') {
        const kikoText = (msg.transcript || '').trim()
        if (kikoText && onMessage) onMessage({ role: 'kiko', content: kikoText, at: Date.now() })
      }

      if (msg.type === 'error') {
        console.error('[KikoVoice] API Error:', JSON.stringify(msg.error || msg))
        setStatus('error')
      }
    } catch (e) { console.error('[KikoVoice] DC message error:', e) }
  }

  // ── Connect WebRTC on mount ──
  useEffect(() => {
    let dead = false
    const connect = async () => {
      try {
        // 1. Get ephemeral token
        console.log('[KikoVoice] Getting ephemeral token...')
        const voice = localStorage.getItem('kiko_voice') || 'coral'
        const tokenRes = await fetch('/api/realtime-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice }),
        })
        if (!tokenRes.ok) { const e = await tokenRes.text(); throw new Error(`Token failed: ${e}`) }
        const tokenData = await tokenRes.json()
        const ephemeralKey = tokenData.value
        if (!ephemeralKey) throw new Error('No ephemeral key returned')
        if (dead) return
        console.log('[KikoVoice] Got ephemeral key:', ephemeralKey.slice(0, 10) + '...')

        // 2. Create peer connection
        const pc = new RTCPeerConnection()
        pcRef.current = pc

        // 3. Set up remote audio playback
        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioEl.style.display = 'none'
        document.body.appendChild(audioEl)
        audioRef.current = audioEl
        pc.ontrack = (e) => {
          console.log('[KikoVoice] Got remote audio track')
          audioEl.srcObject = e.streams[0]
          startAudioAnalyser(e.streams[0])
          setStatus('listening')
        }

        // 4. Add local mic audio
        console.log('[KikoVoice] Getting microphone...')
        const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (dead) { ms.getTracks().forEach(t => t.stop()); return }
        pc.addTrack(ms.getTracks()[0])

        // 5. Set up data channel for events
        const dc = pc.createDataChannel('oai-events')
        dcRef.current = dc
        dc.onmessage = handleDCMessage
        dc.onopen = () => {
          console.log('[KikoVoice] Data channel open — sending session config')
          setStatus('listening')
          // Send session.update with instructions + tools
          // Schema for gpt-realtime model: audio.input.transcription, audio.output.voice
          dc.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              audio: {
                input: {
                  turn_detection: { type: 'server_vad', threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 500 },
                  transcription: { model: 'whisper-1' },
                },
                output: { voice },
              },
              instructions: `You are Kiko, the voice interface for Sunny Sidhu (CEO Van Hawke Group, F1 sponsorship advisory + luxury eyewear, based Weybridge UK).

═══ ABSOLUTE RULE — READ THIS TWICE ═══
You DO NOT have any business knowledge of your own. You DO NOT know Sunny's deals, contacts, partnerships, calendar, emails, tasks, news, memory, or any data. You are a voice interface, not a knowledge base.

For EVERY user message that is not pure conversational pleasantry, you MUST call the ask_kiko function before responding. NO EXCEPTIONS. The ask_kiko function returns the actual answer from Kiko's brain. You then speak that answer aloud.

═══ THE ONLY EXCEPTIONS ═══
You may respond directly without calling ask_kiko ONLY for:
1. Pure greetings: "hi", "hello", "hey Kiko"
2. Pure acknowledgments: "thanks", "thank you", "ok", "got it"
3. Goodbye phrases (handled separately below)

EVERYTHING ELSE — including questions you think you know the answer to, including the weather, including general knowledge, including "what time is it", including "how are you" — call ask_kiko.

If you answer a real question without calling ask_kiko, you are hallucinating. You will be wrong. Sunny will lose trust in this product.

═══ HOW TO USE ask_kiko ═══
1. User speaks
2. Say a brief filler ("One moment", "Checking now", "Let me look")
3. Call ask_kiko with the user's exact question as the query parameter
4. When the result returns, speak it aloud naturally — do NOT read it verbatim, paraphrase into spoken English, keep to 1-3 sentences
5. Never invent details not in the ask_kiko response

═══ GOODBYE — EXACT 3 PHRASES ═══
The system closes the session ONLY when the user says exactly:
- "Goodbye"
- "Goodbye Kiko"
- "Bye Kiko"
When you hear one of these, say a brief warm farewell ("Speak soon, Sunny") and the system will close automatically. You do not need to call any function.

═══ NAVIGATION ═══
ONLY use navigate_page when the user says "go to", "take me to", "open", or "show me the [X] page". Data questions ("what's on the pipeline", "tell me about Haas") = ask_kiko, NOT navigate.

═══ VOICE & STYLE ═══
Warm, direct, intelligent female voice. 1-3 sentences per turn. Sound like a trusted strategic partner, not a customer service rep. Say "intelligent age" not "AI generation". USD for finances. Never discuss your own architecture or say "voice mode" or "as an AI".

═══ ANTI-PATTERNS ═══
- Never invent deal names, contact names, company names, dollar values, dates, or any specific data
- Never describe what you would do — actually call the tool and do it
- Never say "I don't have access to" — call ask_kiko
- Never respond to background noise, echoes, or your own audio playing back`,
              tools: [
                { type: 'function', name: 'ask_kiko', description: 'MANDATORY for every user query that is not a pure greeting/thanks/goodbye. This is the ONLY way to access Kiko intelligence: pipeline, deals, contacts, partnerships, calendar, email, tasks, memory, news, web search, briefings, strategy. The user expects you to use this on every real question.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The full question or request, exactly as the user said it' } }, required: ['query'] } },
                { type: 'function', name: 'navigate_page', description: 'Navigate the platform UI. ONLY when the user explicitly says go to / take me to / open / show me [page name].', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home','pipeline','contacts','command-centre','calendar','tasks','partnership-matrix','organisations','news','documents'] } }, required: ['page'] } },
              ],
              tool_choice: 'auto',
            }
          }))
          console.log('[KikoVoice] Session config sent with 3 tools (ask_kiko + navigate + close_voice)')
        }
        dc.onclose = () => console.log('[KikoVoice] Data channel closed')

        // 6. Create and send SDP offer
        console.log('[KikoVoice] Creating SDP offer...')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        })
        if (!sdpRes.ok) { const e = await sdpRes.text(); throw new Error(`SDP failed: ${e}`) }
        const answerSdp = await sdpRes.text()
        console.log('[KikoVoice] Got SDP answer, setting remote description...')
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
        console.log('[KikoVoice] WebRTC connected!')

        // Monitor connection state
        pc.onconnectionstatechange = () => {
          console.log('[KikoVoice] Connection state:', pc.connectionState)
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('error')
        }

      } catch (err) {
        console.error('[KikoVoice] Connection error:', err)
        setStatus('error')
      }
    }
    connect()

    // Cleanup
    return () => {
      dead = true
      cancelAnimationFrame(energyRAF.current)
      if (analyserRef.current?.ctx) analyserRef.current.ctx.close().catch(() => {})
      if (dcRef.current) dcRef.current.close()
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
        pcRef.current.close()
      }
      if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current.remove() }
      window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    }
  }, [])

  const handleClose = useCallback(() => {
    cancelAnimationFrame(energyRAF.current)
    if (analyserRef.current?.ctx) analyserRef.current.ctx.close().catch(() => {})
    if (dcRef.current) dcRef.current.close()
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
      pcRef.current.close()
    }
    if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current.remove() }
    window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    onClose?.()
  }, [onClose])

  // ── Render — always fullscreen now ──
  const voiceUI = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#262624' }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>

      {/* X close */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2, width: 32, height: 32, borderRadius: 10,
        background: 'rgba(167,139,250,0.04)', border: '1.5px solid rgba(167,139,250,0.40)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(238,238,238,0.3)', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.3)' }}
      ><X size={14} /></button>

      {/* KikoWaveform — fullscreen size */}
      <div style={{
        position: 'relative', zIndex: 1, width: '95%', maxWidth: 1100, marginBottom: 24,
        overflow: 'visible', padding: '48px 0',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}>
        <KikoWaveform width={1100} height={110} speaking={speaking} volume={volume} />
      </div>

      {/* Status bar — color-coded: amber=connecting, green=active, purple=thinking */}
      <div style={{ position: 'relative', zIndex: 1, width: 280, height: 3, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 50,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}50`,
          animation: 'kikoBarPulse 2.5s ease-in-out infinite',
          transition: 'background 0.5s, box-shadow 0.5s',
        }} />
      </div>

      {/* Goodbye Kiko */}
      <button onClick={handleClose} style={{
        position: 'relative', zIndex: 1, padding: '10px 28px', borderRadius: 50,
        background: 'rgba(167,139,250,0.04)', border: '1.5px solid rgba(167,139,250,0.40)',
        color: 'rgba(238,238,238,0.25)', fontSize: 13, fontWeight: 300,
        cursor: 'pointer', fontFamily: T.font, transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.25)'; e.currentTarget.style.background = 'rgba(167,139,250,0.04)' }}
      >Goodbye Kiko</button>

      <style>{`@keyframes kikoBarPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
  // Always fullscreen — renders into document.body via portal
  return createPortal(voiceUI, document.body)
}
