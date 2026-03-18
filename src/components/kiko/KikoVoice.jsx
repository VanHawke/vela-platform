import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Mic, MicOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import KikoSymbol from './KikoSymbol'

// ── Timing constants ──────────────────────────────────────
const PASSIVE_AFTER_MS  = 45_000   // 45s silence → passive
const OFF_AFTER_MS      = 120_000  // 2min silence → off
const KEYWORDS          = ['hey kiko', 'okay kiko', 'ok kiko', 'kiko']

// ── Equalizer bars ────────────────────────────────────────
function Equalizer({ active, color = '#fff' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 48 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 3.5, borderRadius: 2, background: color,
          animation: active ? `equalizerBar 0.8s ease-in-out ${i * 0.12}s infinite` : 'none',
          height: active ? [14,22,18,24,12][i] : 4, minHeight: 4,
          transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
          opacity: active ? 1 : 0.3,
        }} />
      ))}
    </div>
  )
}

// ── Passive ring: gentle pulse to show background listening ─
function PassiveRing() {
  return (
    <div style={{ position: 'absolute', inset: -8, borderRadius: '50%',
      border: '1.5px solid rgba(0,0,0,0.12)',
      animation: 'pulse 3s ease-in-out infinite', pointerEvents: 'none' }} />
  )
}

export default function KikoVoice({ onClose, user, micStream, mini = false, onShowPrompt }) {
  // ── Core state ────────────────────────────────────────
  const [status, setStatus]           = useState('connecting')
  const [listenMode, setListenMode]   = useState('active') // 'active' | 'passive' | 'off'
  const [transcript, setTranscript]   = useState('')
  const [kikoText, setKikoText]       = useState('')
  const [speaking, setSpeaking]       = useState(false)
  const [error, setError]             = useState('')

  // ── Refs ──────────────────────────────────────────────
  const pcRef           = useRef(null)
  const dcRef           = useRef(null)
  const streamRef       = useRef(null)
  const audioRef        = useRef(null)
  const conversationRef = useRef({ id: null, messages: [] })
  const listenModeRef   = useRef('active')   // mirror state for event handlers
  const passiveTimerRef = useRef(null)       // active → passive (45s)
  const offTimerRef     = useRef(null)       // passive → off (2min)
  const srRef           = useRef(null)       // SpeechRecognition instance (off-mode)
  const sessionBaseRef  = useRef(null)       // store session.update payload for reuse

  // Keep ref in sync
  useEffect(() => { listenModeRef.current = listenMode }, [listenMode])

  // ── Connect on mount ──────────────────────────────────
  useEffect(() => {
    connectRealtime()
    return () => { cleanup(); stopKeywordDetection() }
  }, [])

  // ─────────────────────────────────────────────────────
  // TIMER MANAGEMENT
  // ─────────────────────────────────────────────────────
  const clearSilenceTimers = useCallback(() => {
    if (passiveTimerRef.current) { clearTimeout(passiveTimerRef.current); passiveTimerRef.current = null }
    if (offTimerRef.current)     { clearTimeout(offTimerRef.current);     offTimerRef.current = null }
  }, [])

  const startSilenceTimers = useCallback(() => {
    clearSilenceTimers()
    passiveTimerRef.current = setTimeout(() => enterPassiveMode(), PASSIVE_AFTER_MS)
    offTimerRef.current     = setTimeout(() => enterOffMode(),    OFF_AFTER_MS)
  }, [clearSilenceTimers])

  const resetToActive = useCallback(() => {
    if (listenModeRef.current !== 'active') {
      setListenMode('active')
      listenModeRef.current = 'active'
      // Re-enable VAD in Realtime session
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'session.update',
          session: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 } }
        }))
      }
    }
    startSilenceTimers()
  }, [startSilenceTimers])

  // ─────────────────────────────────────────────────────
  // PASSIVE MODE — mic stays on, Kiko doesn't auto-respond
  // ─────────────────────────────────────────────────────
  const enterPassiveMode = useCallback(() => {
    if (listenModeRef.current === 'off') return
    setListenMode('passive')
    listenModeRef.current = 'passive'
    setTranscript('')
    setKikoText('')
    setSpeaking(false)
    // Disable server VAD so Kiko stops auto-triggering responses
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'session.update',
        session: { turn_detection: { type: 'none' } }
      }))
    }
  }, [])

  // ─────────────────────────────────────────────────────
  // OFF MODE — mic stops, keyword detection starts
  // ─────────────────────────────────────────────────────
  const enterOffMode = useCallback(() => {
    setListenMode('off')
    listenModeRef.current = 'off'
    setTranscript('')
    setKikoText('')
    setSpeaking(false)
    // Stop mic tracks (leaves WebRTC peer alive but silent)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.enabled = false)
    }
    startKeywordDetection()
  }, [])

  // ─────────────────────────────────────────────────────
  // KEYWORD DETECTION via Web Speech API
  // ─────────────────────────────────────────────────────
  const startKeywordDetection = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return   // not supported — user must click to reactivate
    stopKeywordDetection()

    const sr = new SR()
    sr.continuous      = true
    sr.interimResults  = false
    sr.lang            = 'en-US'
    srRef.current      = sr

    sr.onresult = (e) => {
      const heard = Array.from(e.results)
        .map(r => r[0].transcript.toLowerCase().trim())
        .join(' ')
      if (KEYWORDS.some(kw => heard.includes(kw))) {
        reactivateFromOff()
      }
    }
    sr.onend = () => {
      // Auto-restart while still in off mode
      if (listenModeRef.current === 'off' && srRef.current === sr) {
        try { sr.start() } catch {}
      }
    }
    try { sr.start() } catch {}
  }, [])

  const stopKeywordDetection = useCallback(() => {
    if (srRef.current) {
      try { srRef.current.abort() } catch {}
      srRef.current = null
    }
  }, [])

  // ─────────────────────────────────────────────────────
  // REACTIVATE from off mode
  // ─────────────────────────────────────────────────────
  const reactivateFromOff = useCallback(() => {
    stopKeywordDetection()
    // Re-enable mic tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.enabled = true)
    }
    setListenMode('active')
    listenModeRef.current = 'active'
    // Re-enable VAD
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'session.update',
        session: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 } }
      }))
    }
    startSilenceTimers()
  }, [startSilenceTimers, stopKeywordDetection])

  // ─────────────────────────────────────────────────────
  // CONNECT REALTIME
  // ─────────────────────────────────────────────────────
  async function connectRealtime() {
    try {
      setStatus('connecting')
      setListenMode('active')
      listenModeRef.current = 'active'
      setError('')

      let voiceId = 'shimmer', speed = 1.0, memoriesContext = '', platformContext = ''
      const orgId = user?.app_metadata?.org_id

      if (user?.id) {
        const { data: settingsData } = await supabase.from('user_settings').select('kiko_voice, kiko_speed').eq('user_id', user.id).single()
        if (settingsData) { voiceId = settingsData.kiko_voice || 'shimmer'; speed = parseFloat(settingsData.kiko_speed) || 1.0 }

        if (orgId) {
          const { data: memories } = await supabase.from('kiko_memories').select('path, content').eq('org_id', orgId).eq('is_directory', false).order('updated_at', { ascending: false }).limit(10)
          if (memories?.length) memoriesContext = '\n\nYOUR MEMORY:\n' + memories.map(m => m.content).join('\n---\n').slice(0, 3000)
          const { count: dealCount }    = await supabase.from('deals').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: contactCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: companyCount } = await supabase.from('companies').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          platformContext = `\n\nPLATFORM DATA ACCESS: ${dealCount||0} deals, ${contactCount||0} contacts, ${companyCount||0} companies.`
        }
      }

      const tokenRes = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'realtime-token', voice: voiceId }) })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || (!tokenData.client_secret?.value && !tokenData.value)) throw new Error(tokenData.error?.message || 'Failed to get voice token')
      const ephemeralKey = tokenData.client_secret?.value || tokenData.value

      const stream = micStream || await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioRef.current = audioEl
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0] }

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      const sessionPayload = {
        type: 'session.update',
        session: {
          instructions: `You are Kiko — the intelligence layer of Vela, built for Van Hawke Group.
Speaking with Sunny Sidhu, CEO, Weybridge UK. Sharp, warm, confident advisor. Speak naturally, expressively.
React emotionally — genuine interest, concern, excitement, humour where appropriate.
Keep responses concise — 2-3 sentences unless depth is warranted.
All financials in USD. Use "intelligent age" not "AI generation".
When you hear "Hey Kiko" while in passive/off mode, acknowledge warmly and resume active conversation.${memoriesContext}${platformContext}`,
          audio: {
            input: { transcription: { model: 'whisper-1' }, turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 } },
            output: { speed }
          },
          tools: [
            { type: 'function', name: 'search_web', description: 'Search the internet for current information.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
            { type: 'function', name: 'get_crm_data', description: 'Query the Vela CRM for deals, contacts, companies, or tasks.', parameters: { type: 'object', properties: { entity: { type: 'string', enum: ['deals','contacts','companies','tasks'] }, filter: { type: 'string' } }, required: ['entity'] } }
          ],
          tool_choice: 'auto'
        }
      }
      sessionBaseRef.current = sessionPayload

      dc.onopen = () => { setStatus('live'); dc.send(JSON.stringify(sessionPayload)); startSilenceTimers() }
      dc.onclose = () => setStatus('connecting')
      dc.onmessage = (e) => { try { handleRealtimeEvent(JSON.parse(e.data)) } catch {} }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!sdpRes.ok) throw new Error(`Realtime connection failed: ${sdpRes.status}`)
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })

    } catch (err) {
      console.error('[Voice] Connection error:', err)
      setError(err.message || 'Could not connect voice')
      setStatus('error')
    }
  }

  // ─────────────────────────────────────────────────────
  // REALTIME EVENT HANDLER
  // ─────────────────────────────────────────────────────
  function handleRealtimeEvent(event) {
    const t = event.type

    // User started speaking — reset to active + restart timers
    if (t === 'input_audio_buffer.speech_started') {
      setTranscript(''); setKikoText(''); setSpeaking(false)
      if (listenModeRef.current !== 'active') resetToActive()
      else startSilenceTimers()
    }

    // User finished speaking — start silence countdown
    if (t === 'input_audio_buffer.speech_stopped') {
      startSilenceTimers()
    }

    // User transcript complete
    if (t === 'conversation.item.input_audio_transcription.completed') {
      const text = event.transcript || ''
      setTranscript(text)
      if (text.trim()) {
        // If passive, check for keyword before responding
        if (listenModeRef.current === 'passive') {
          const lower = text.toLowerCase()
          if (KEYWORDS.some(kw => lower.includes(kw))) resetToActive()
          // else: ignore — Kiko doesn't respond in passive mode
        } else {
          conversationRef.current.messages.push({ role: 'user', content: text })
          saveVoiceConversation()
        }
      }
    }

    if (t === 'response.output_audio_transcript.delta') setKikoText(prev => prev + (event.delta || ''))
    if (t === 'response.output_audio_transcript.done') {
      const fullText = event.transcript || ''
      if (fullText.trim()) {
        conversationRef.current.messages.push({ role: 'assistant', content: fullText })
        saveVoiceConversation()
      }
    }
    if (t === 'response.created') { setKikoText(''); setSpeaking(true) }
    if (t === 'response.done')    { setSpeaking(false) }
    if (t === 'response.function_call_arguments.done') handleToolCall(event)
  }

  // ─────────────────────────────────────────────────────
  // SAVE CONVERSATION
  // ─────────────────────────────────────────────────────
  async function saveVoiceConversation() {
    if (!user?.id) return
    const orgId = user?.app_metadata?.org_id
    const msgs  = conversationRef.current.messages
    if (!msgs.length) return
    try {
      if (conversationRef.current.id) {
        await supabase.from('conversations').update({ messages: msgs, updated_at: new Date().toISOString() }).eq('id', conversationRef.current.id)
      } else {
        const title = (msgs[0]?.content || 'Voice conversation').slice(0, 60)
        const { data } = await supabase.from('conversations').insert({ user_id: user.id, org_id: orgId, title: '🎤 ' + title, messages: msgs }).select('id').single()
        if (data?.id) conversationRef.current.id = data.id
      }
    } catch (err) { console.error('[Voice] Save error:', err) }
  }

  // ─────────────────────────────────────────────────────
  // TOOL CALLS
  // ─────────────────────────────────────────────────────
  async function handleToolCall(event) {
    const { name, arguments: argsStr, call_id } = event
    try {
      const args = JSON.parse(argsStr)
      const message = name === 'search_web'
        ? `Search the web for: ${args.query}`
        : `Query CRM ${args.entity}${args.filter ? ` filtered by: ${args.filter}` : ''}`

      const res  = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, currentPage: 'voice' }) })
      const reader = res.body.getReader(); const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6); if (d === '[DONE]') continue
          try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
        }
      }
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output: (full || 'No results').slice(0, 4000) } }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    } catch (err) { console.error('[Voice] Tool error:', err) }
  }

  // ─────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────
  function cleanup() {
    clearSilenceTimers()
    if (dcRef.current)     { try { dcRef.current.close()  } catch {} }
    if (pcRef.current)     { try { pcRef.current.close()  } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()) }
    if (audioRef.current)  { audioRef.current.pause(); audioRef.current.srcObject = null }
    pcRef.current = null; dcRef.current = null; streamRef.current = null
  }

  function handleClose() { cleanup(); stopKeywordDetection(); onClose() }

  // ─────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────
  const isActive  = status === 'live'
  const isTalking = isActive && speaking

  const modeLabel = {
    active:  speaking ? '' : 'Speak freely',
    passive: 'Passive — say "Hey Kiko" to resume',
    off:     'Mic off — say "Hey Kiko" to restart',
  }[listenMode] || ''

  const statusLabel = status === 'connecting' ? 'Connecting…' : status === 'error' ? (error || 'Connection failed') : modeLabel

  // Accent colour per mode
  const modeAccent = listenMode === 'off' ? 'rgba(0,0,0,0.06)' : listenMode === 'passive' ? 'rgba(0,0,0,0.12)' : 'var(--accent)'
  const symbolColor = listenMode === 'active' && status === 'live' ? '#fff' : 'var(--text-tertiary)'

  // ── MINI MODE ──────────────────────────────────────
  if (mini) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={onShowPrompt} style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: modeAccent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive && listenMode === 'active' ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
          transition: 'all 0.4s', position: 'relative',
        }}>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: isTalking ? 0 : 1 }}>
            {listenMode === 'off' ? <MicOff size={20} color="var(--text-tertiary)" /> : <KikoSymbol size={26} color={symbolColor} />}
          </div>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: isTalking ? 1 : 0 }}>
            <Equalizer active={isTalking} />
          </div>
          {listenMode === 'passive' && <PassiveRing />}
          {isActive && listenMode === 'active' && !isTalking && (
            <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--accent)', opacity: 0.3, animation: 'pulse 2s infinite' }} />
          )}
        </button>
        {status === 'connecting' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>Connecting…</span>}
        {listenMode === 'passive' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', textAlign: 'center', maxWidth: 90 }}>Passive</span>}
        {listenMode === 'off'     && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>Mic off</span>}
        {status === 'error'       && <button onClick={connectRealtime} style={{ fontSize: 10, color: '#C62828', fontFamily: 'var(--font)', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>}
        <button onClick={handleClose} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>×</button>
      </div>
    )
  }

  // ── POPUP MODE ─────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="animate-fade-in" onClick={handleClose}>

      <div onClick={e => e.stopPropagation()} style={{
        width: 360, padding: '48px 40px 40px', borderRadius: 28,
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 24px 80px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, position: 'relative',
      }}>

        {/* Close */}
        <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} />
        </button>

        {/* Mode indicator strip */}
        {listenMode !== 'active' && status === 'live' && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '28px 28px 0 0',
            background: listenMode === 'off' ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.2)',
            transition: 'background 0.4s',
          }} />
        )}

        {/* Main avatar circle */}
        <div style={{ width: 100, height: 100, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', width: 100, height: 100, borderRadius: '50%',
            background: modeAccent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.4s, opacity 0.4s', opacity: speaking ? 0 : 1,
            boxShadow: listenMode === 'active' && status === 'live' ? '0 0 40px rgba(0,0,0,0.08)' : 'none',
          }}>
            {listenMode === 'off'
              ? <MicOff size={32} color="var(--text-tertiary)" />
              : <KikoSymbol size={40} color={symbolColor} />
            }
          </div>
          <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.4s', opacity: speaking ? 1 : 0 }}>
            <Equalizer active={speaking} color="#1A1A1A" />
          </div>
          {listenMode === 'passive' && (
            <div style={{ position: 'absolute', width: 116, height: 116, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.12)', animation: 'pulse 3s ease-in-out infinite' }} />
          )}
        </div>

        {/* Status label */}
        <p style={{ fontSize: 13, fontFamily: 'var(--font)', textAlign: 'center', color: status === 'error' ? '#C62828' : listenMode === 'off' ? 'var(--text-tertiary)' : 'var(--text-secondary)', maxWidth: 240, lineHeight: 1.4 }}>
          {statusLabel}
        </p>

        {/* Transcript + Kiko text */}
        {(transcript || kikoText) && listenMode === 'active' && (
          <div style={{ textAlign: 'center', maxWidth: 280 }}>
            {transcript && <p style={{ fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)', fontWeight: 500, margin: 0 }}>{transcript}</p>}
            {kikoText && <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.5, margin: '8px 0 0' }}>{kikoText}</p>}
          </div>
        )}

        {/* Mode action hint */}
        {listenMode !== 'active' && status === 'live' && (
          <button onClick={() => listenMode === 'off' ? reactivateFromOff() : resetToActive()} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, padding: '6px 16px',
            cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Mic size={12} /> Tap to resume
          </button>
        )}

        {status === 'error' && (
          <button onClick={connectRealtime} style={{ height: 32, padding: '0 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}>Retry</button>
        )}
      </div>
    </div>
  )
}
