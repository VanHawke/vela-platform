// src/components/kiko/KikoVoice.jsx — GPT-4o Realtime via WebRTC
// Speech-to-speech. Function calling for real data. No pipeline.
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, MessageSquare } from 'lucide-react'
import KikoAvatar from './KikoAvatar'
import AuroraCanvas from '../AuroraCanvas'
import useMobile from '@/hooks/useMobile'
import T from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { buildVoiceInstructions, fetchVoiceProfile } from '@/lib/buildVoiceInstructions'

const BAR_COLORS = {
  connecting: '#f59e0b', reconnecting: '#f59e0b', listening: '#22c55e', thinking: '#8b5cf6',
  speaking: '#22c55e', error: '#f87171', idle: 'rgba(0,0,0,0.08)',
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
      const r = await fetch('https://api.vanhawke.agency/api/kiko', {
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

export default function KikoVoice({ onClose, user, onVoiceState, onMessage, micStream: externalMicStream }) {
  const isMobile = useMobile()
  const [status, setStatus] = useState('connecting')
  const [errorMsg, setErrorMsg] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [volume, setVolume] = useState(0)
  const [voiceEnergy, setVoiceEnergy] = useState(0)
  const [reconnectCount, setReconnectCount] = useState(0)
  const MAX_RECONNECTS = 3
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const energyRAF = useRef(null)
  const analyserRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const healthTimerRef = useRef(null)

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
        setVoiceEnergy(rms > 0.02 ? Math.min(1, rms * 3.5) : 0)
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
      // Kiko speech transcript (GPT-4o assistant response).
      // The new gpt-realtime schema fires `response.output_audio_transcript.done`.
      // Older schema fired `response.audio_transcript.done`. Handle both.
      if (msg.type === 'response.output_audio_transcript.done' || msg.type === 'response.audio_transcript.done') {
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
        // Fetch the current user's profile so voice greeting + system prompt use their real name/role
        // (falls back gracefully to generic prompt if anything's missing)
        const voiceProfile = await fetchVoiceProfile(supabase)
        let sessionInstructions = buildVoiceInstructions(voiceProfile)

        // Append voice style instructions if set
        const voiceStyleId = localStorage.getItem('kiko_voice_style') || 'natural'
        const VOICE_STYLE_INSTRUCTIONS = {
          natural: 'Speak in a natural, relaxed, conversational tone. Be warm and genuine, as if talking to a trusted colleague.',
          professional: 'Speak clearly and professionally with confident pacing. Articulate precisely, like a senior executive.',
          warm: 'Speak with warmth, softness, and genuine friendliness. Let your voice feel inviting and approachable, with gentle feminine energy. Smile through your words.',
          energetic: 'Speak with energy and enthusiasm. Be dynamic and engaging, varying pace and emphasis to keep the listener motivated.',
          calm: 'Speak slowly and gently with a soothing, measured pace. Be reassuring and calming, like guiding someone through a complex decision.',
        }
        if (VOICE_STYLE_INSTRUCTIONS[voiceStyleId]) {
          sessionInstructions += `\n\n═══ VOICE DELIVERY ═══\n${VOICE_STYLE_INSTRUCTIONS[voiceStyleId]}`
        }
        // 1. Get ephemeral token
        console.log('[KikoVoice] Getting ephemeral token...')
        const voice = localStorage.getItem('kiko_voice') || 'coral'
        const tokenRes = await fetch('https://api.vanhawke.agency/api/realtime-token', {
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
        const ms = externalMicStream || await navigator.mediaDevices.getUserMedia({ audio: true })
        if (dead) { if (!externalMicStream) ms.getTracks().forEach(t => t.stop()); return }
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
              instructions: sessionInstructions,
              tools: [
                { type: 'function', name: 'ask_kiko', description: 'MANDATORY for every user query that is not a pure greeting/thanks/goodbye. This is the ONLY way to access Kiko intelligence: pipeline, deals, contacts, partnerships, calendar, email, tasks, memory, news, web search, briefings, strategy. The user expects you to use this on every real question.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The full question or request, exactly as the user said it' } }, required: ['query'] } },
                { type: 'function', name: 'navigate_page', description: 'Navigate the platform UI. ONLY when the user explicitly says go to / take me to / open / show me [page name]. Page list: home (chat), pipeline (deals), contacts (CRM), organisations (companies), command-centre (tasks/email/inbox hub), partnership-matrix (F1 sponsorship landscape), calendar (race calendar), campaigns (outreach campaigns), kikocode (code workspace), settings, memory (admin), admin, admin/system. Use exact slug.', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home','pipeline','contacts','organisations','command-centre','partnership-matrix','calendar','campaigns','kikocode','settings','memory','admin','admin/system'] } }, required: ['page'] } },
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

        // Monitor connection state + auto-reconnect
        pc.onconnectionstatechange = () => {
          console.log('[KikoVoice] Connection state:', pc.connectionState)
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setReconnectCount(prev => {
              if (prev < MAX_RECONNECTS) {
                const delay = Math.min(2000 * Math.pow(2, prev), 8000)
                console.log(`[KikoVoice] Reconnecting in ${delay}ms (attempt ${prev + 1}/${MAX_RECONNECTS})`)
                setStatus('reconnecting')
                // Cleanup current connection
                try { dc.close() } catch {}
                try { pc.close() } catch {}
                if (audioRef.current) { audioRef.current.srcObject = null }
                // Schedule reconnect
                reconnectTimerRef.current = setTimeout(() => {
                  dead = false
                  connect()
                }, delay)
                return prev + 1
              } else {
                console.error('[KikoVoice] Max reconnection attempts reached')
                setStatus('error')
                return prev
              }
            })
          }
          if (pc.connectionState === 'connected') {
            setReconnectCount(0)
          }
        }

        // Health heartbeat — detect silently dead connections every 10s
        healthTimerRef.current = setInterval(() => {
          if (!pcRef.current) return
          const state = pcRef.current.connectionState
          const iceState = pcRef.current.iceConnectionState
          if (state === 'failed' || state === 'closed' || iceState === 'failed') {
            console.warn('[KikoVoice] Health check: bad state', state, iceState)
            if (pcRef.current.onconnectionstatechange) pcRef.current.onconnectionstatechange()
          }
        }, 10000)

      } catch (err) {
        console.error('[KikoVoice] Connection error:', err)
        setStatus('error')
        setErrorMsg(err.message || 'Connection failed')
      }
    }
    connect()

    // Cleanup
    return () => {
      dead = true
      clearTimeout(reconnectTimerRef.current)
      clearInterval(healthTimerRef.current)
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

  // 60-second idle timeout — auto-close if no speech activity
  useEffect(() => {
    let idleTimer = setTimeout(() => { if (window.__kikoVoiceClose) window.__kikoVoiceClose() }, 60000)
    const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (window.__kikoVoiceClose) window.__kikoVoiceClose() }, 60000) }
    // Reset on any status change (speaking/listening/thinking = activity)
    resetIdle()
    return () => clearTimeout(idleTimer)
  }, [status])

  const handleClose = useCallback(() => {
    clearTimeout(reconnectTimerRef.current)
    clearInterval(healthTimerRef.current)
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

  // ── Mobile portal: create dedicated root on document.body ──
  const [portalEl, setPortalEl] = useState(null)
  useEffect(() => {
    if (!isMobile) return
    const el = document.createElement('div')
    el.id = 'kiko-voice-root'
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:auto;'
    document.body.appendChild(el)
    setPortalEl(el)
    return () => { try { document.body.removeChild(el) } catch(e) {} }
  }, [isMobile])

  // ── Render — always fullscreen now ──
  // Mobile: render directly into a portal container appended to body
  // Desktop: createPortal as before  
  const mobileVoiceContent = (
    <div id="kiko-voice-mobile" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#E8E6E1' }}>
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 400, color: '#0A0A0A' }}>Kiko</div>
        <button onClick={handleClose} style={{ width: 44, height: 44, borderRadius: 22, background: '#E8E6E1', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {[0,1,2,3,4].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: '#0A0A0A', opacity: 0.5 }} />)}
        </div>
        <div style={{ fontSize: 18, color: '#0A0A0A', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 8 }}>
          {status === 'error' ? 'Connection failed' : status === 'listening' ? 'Listening' : 'Connecting...'}
        </div>
        {errorMsg && <div style={{ fontSize: 14, color: '#A32D2D', padding: '0 24px', textAlign: 'center' }}>{errorMsg}</div>}
        <div style={{ fontSize: 13, color: '#A0A0A0', marginTop: 4 }}>Status: {status}</div>
      </div>
      <div style={{ padding: 20, paddingBottom: 40, display: 'flex', justifyContent: 'center' }}>
        <button onClick={handleClose} style={{ padding: '16px 44px', borderRadius: 50, background: '#E8E6E1', border: 'none', fontSize: 17, color: '#0A0A0A', fontFamily: 'inherit' }}>Goodbye Kiko</button>
      </div>
    </div>
  )

  const voiceUI = isMobile ? mobileVoiceContent : (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
      {!isMobile && <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>}

      {/* X close */}
      {/* Continue in chat — voice → text handoff (Sunny spec 2026-04-12) */}
      <button onClick={() => {
        try {
          window.dispatchEvent(new CustomEvent('kiko_voice_handoff', { detail: { source: 'voice' } }))
        } catch {}
        handleClose()
      }} style={{
        position: 'absolute', top: 20, right: 60, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 32, borderRadius: 10,
        background: 'rgba(0,0,0,0.04)', border: '1.5px solid rgba(0,0,0,0.10)',
        cursor: 'pointer', color: 'rgba(0,0,0,0.65)',
        fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
        transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)' }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)' }}
        title="Close voice and continue in text chat with full transcript"
      ><MessageSquare size={12} />Continue in chat</button>

      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2, width: 32, height: 32, borderRadius: 10,
        background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.14)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#A0A0A0', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'; e.currentTarget.style.color = '#6B6B6B' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'; e.currentTarget.style.color = '#A0A0A0' }}
      ><X size={14} /></button>

      {/* KikoAvatar — centred, voice-reactive */}
      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, padding: '48px 0',
      }}>
        <KikoAvatar size={110} state={speaking ? 'responding' : 'thinking'} energy={voiceEnergy} />
      </div>

      {/* Status bar — color-coded: amber=connecting, green=active, purple=thinking */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* Connection status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 400, color: 'rgba(0,0,0,0.4)', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}60`, transition: 'background 0.3s' }} />
          {status === 'connecting' && 'Connecting...'}
          {status === 'reconnecting' && `Reconnecting (${reconnectCount}/${MAX_RECONNECTS})...`}
          {status === 'listening' && 'Listening'}
          {status === 'speaking' && 'Kiko is speaking'}
          {status === 'thinking' && 'Thinking...'}
          {status === 'error' && 'Connection lost'}
        </div>
        <div style={{ width: 280, height: 3, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 50,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}50`,
          animation: 'kikoBarPulse 2.5s ease-in-out infinite',
          transition: 'background 0.5s, box-shadow 0.5s',
        }} />
      </div>
      </div>

      {/* Goodbye Kiko */}
      <button onClick={handleClose} style={{
        position: 'relative', zIndex: 1, padding: '10px 28px', borderRadius: 50,
        background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.14)',
        color: '#A0A0A0', fontSize: 13, fontWeight: 300,
        cursor: 'pointer', fontFamily: T.font, transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'; e.currentTarget.style.color = '#A0A0A0'; e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
      >Goodbye Kiko</button>

      <style>{`@keyframes kikoBarPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
  // ALWAYS use portal to escape parent overflow:hidden clipping
  if (isMobile) {
    if (!portalEl) return null // Wait for portal element to be created
    return createPortal(mobileVoiceContent, portalEl)
  }
  return createPortal(voiceUI, document.body)
}
