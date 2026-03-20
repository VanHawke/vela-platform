// KikoVoice.jsx — Custom voice pipeline
// STT: Web Speech API (free, instant) → LLM: Claude via /api/kiko → TTS: ElevenLabs via /api/tts
// Full control. No third-party agent platforms. Interruption support.

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Mic, MicOff, Paperclip, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

// ── Kiko symbol ───────────────────────────────────────
const KikoSymbol = ({ size = 48, color = '#fff', animate = 'idle' }) => {
  const r = size * 0.32, cx = size / 2, cy = size / 2
  const offsets = [[-r, -r * 0.3], [r * 0.3, -r], [r, r * 0.3], [-r * 0.3, r]]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {offsets.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx} cy={cy + dy} r={size * 0.09} fill={color} opacity={0.85}>
          {animate === 'streaming' && <animate attributeName="opacity" values="0.4;1;0.4" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />}
          {animate === 'thinking' && <animate attributeName="r" values={`${size * 0.09};${size * 0.13};${size * 0.09}`} dur="1.5s" repeatCount="indefinite" begin={`${i * 0.2}s`} />}
        </circle>
      ))}
    </svg>
  )
}

// ── Equalizer bars ────────────────────────────────────
const Equalizer = ({ active }) => (
  <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 32 }}>
    {[0.6, 1, 0.8, 0.5, 0.9].map((h, i) => (
      <div key={i} style={{
        width: 4, borderRadius: 2, background: 'rgba(255,255,255,0.7)',
        height: active ? `${h * 32}px` : '4px',
        transition: 'height 0.15s', animation: active ? `eqBounce ${0.4 + i * 0.1}s ease-in-out infinite alternate` : 'none',
      }} />
    ))}
    <style>{`@keyframes eqBounce { from { height: 6px } to { height: 28px } }`}</style>
  </div>
)

const glass = { background: 'rgba(255,255,255,0.65)', border: '0.5px solid rgba(0,0,0,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }

// Sentence boundary regex — fires TTS when Claude produces a complete sentence
const SENTENCE_END = /[.!?]\s|[.!?]$/

export default function KikoVoice({ onClose, onShowPrompt, addMessage, mini }) {
  // ── State ────────────────────────────────────────────
  const [status, setStatus]         = useState('idle')
  const [speaking, setSpeaking]     = useState(false)
  const [thinking, setThinking]     = useState(false)
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText]     = useState('')
  const [messages, setMessages]     = useState([])
  const [showPane, setShowPane]     = useState(false)
  const [typeInput, setTypeInput]   = useState('')
  const [error, setError]           = useState('')

  // ── Refs ─────────────────────────────────────────────
  const recognitionRef    = useRef(null)   // Web Speech API instance
  const abortRef          = useRef(null)   // AbortController for canceling requests
  const audioQueueRef     = useRef([])     // queue of audio blob URLs
  const currentAudioRef   = useRef(null)   // currently playing Audio element
  const isPlayingRef      = useRef(false)
  const sentenceBufferRef = useRef('')     // accumulates Claude text for sentence splitting
  const scrollRef         = useRef(null)   // transcript pane auto-scroll
  const mountedRef        = useRef(false)

  // ── Helpers ────────────────────────────────────────────
  const addMsg = useCallback((role, text) => {
    setMessages(prev => [...prev, { role, text, ts: Date.now() }])
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }, [])

  // ── Interrupt: stop audio + cancel requests ──────────
  const interrupt = useCallback(() => {
    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.src = ''
      currentAudioRef.current = null
    }
    // Revoke all queued audio URLs
    audioQueueRef.current.forEach(url => URL.revokeObjectURL(url))
    audioQueueRef.current = []
    isPlayingRef.current = false
    setSpeaking(false)
    // Cancel in-flight requests
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = null
    sentenceBufferRef.current = ''
  }, [])

  // ── Audio playback queue ────────────────────────────
  const playNext = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      setSpeaking(false)
      return
    }
    isPlayingRef.current = true
    setSpeaking(true)
    const url = audioQueueRef.current.shift()
    const audio = new Audio(url)
    currentAudioRef.current = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      currentAudioRef.current = null
      playNext() // play next sentence
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      currentAudioRef.current = null
      playNext()
    }
    audio.play().catch(() => playNext())
  }, [])

  // ── TTS: send sentence to /api/tts, queue audio ──────
  const fireTTS = useCallback(async (sentence, signal) => {
    if (!sentence.trim() || signal?.aborted) return
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
        signal,
      })
      if (!res.ok || signal?.aborted) return
      const blob = await res.blob()
      if (signal?.aborted) return
      const url = URL.createObjectURL(blob)
      audioQueueRef.current.push(url)
      // Start playing if not already
      if (!isPlayingRef.current) playNext()
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Voice] TTS error:', err)
    }
  }, [playNext])

  // ── Send query to Claude, stream response, split into sentences → TTS ──
  const processQuery = useCallback(async (text) => {
    if (!text.trim()) return
    interrupt() // stop any current speech
    setTranscript(text)
    setKikoText('')
    setThinking(true)
    addMsg('user', text)

    const controller = new AbortController()
    abortRef.current = controller
    sentenceBufferRef.current = ''
    let fullResponse = ''

    try {
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentPage: 'voice',
          userEmail: 'sunny@vanhawke.com',
          conversationHistory: messages.slice(-6).map(m => ({ role: m.role === 'kiko' ? 'kiko' : 'user', text: m.text })),
        }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`kiko.js error: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') continue
          try {
            const parsed = JSON.parse(d)
            if (parsed.delta) {
              // Strip markdown for voice
              let clean = parsed.delta.replace(/\*\*/g, '').replace(/^#{1,3}\s+/gm, '').replace(/^[-•]\s+/gm, '').replace(/\n{2,}/g, '. ')
              fullResponse += clean
              setKikoText(fullResponse)
              setThinking(false)

              // Sentence splitting — fire TTS on complete sentences
              sentenceBufferRef.current += clean
              const match = sentenceBufferRef.current.match(SENTENCE_END)
              if (match) {
                const idx = match.index + match[0].trimEnd().length
                const sentence = sentenceBufferRef.current.slice(0, idx).trim()
                sentenceBufferRef.current = sentenceBufferRef.current.slice(idx).trim()
                if (sentence) fireTTS(sentence, controller.signal)
              }
            }
          } catch {}
        }
      }


      // Flush remaining sentence buffer
      if (sentenceBufferRef.current.trim()) {
        fireTTS(sentenceBufferRef.current.trim(), controller.signal)
        sentenceBufferRef.current = ''
      }

      // Add full response to message history
      if (fullResponse) addMsg('kiko', fullResponse)
      setThinking(false)

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Voice] Query error:', err)
        setError(err.message || 'Failed to process query')
        setThinking(false)
      }
    }
  }, [interrupt, addMsg, fireTTS, messages])

  // ── Web Speech API: start/stop recognition ──────────
  const startRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Speech recognition not supported in this browser'); return }

    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch {} }

    const sr = new SR()
    sr.continuous = true
    sr.interimResults = true
    sr.lang = 'en-US'
    recognitionRef.current = sr

    sr.onresult = (e) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      // Show interim transcript in real-time
      if (interim) setTranscript(interim)
      // When we get a final transcript, process it
      if (final.trim()) {
        setTranscript(final.trim())
        processQuery(final.trim())
      }
    }

    sr.onspeechstart = () => {
      // User started talking — interrupt Kiko if she's speaking
      if (isPlayingRef.current) {
        console.log('[Voice] User speaking — interrupting Kiko')
        interrupt()
      }
    }

    sr.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // normal
      console.error('[Voice] Speech recognition error:', e.error)
    }

    sr.onend = () => {
      // Auto-restart unless we're shutting down
      if (mountedRef.current && recognitionRef.current === sr) {
        try { sr.start() } catch {}
      }
    }

    try { sr.start(); setStatus('live'); setError('') }
    catch (err) { setError('Microphone access denied'); setStatus('error') }
  }, [interrupt, processQuery])

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
  }, [])

  // ── Text input handler ──────────────────────────────
  const sendTyped = useCallback(() => {
    const text = typeInput.trim()
    if (!text) return
    setTypeInput('')
    processQuery(text)
  }, [typeInput, processQuery])

  // ── Lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    startRecognition()
    return () => {
      mountedRef.current = false
      stopRecognition()
      interrupt()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    stopRecognition()
    interrupt()
    if (onClose) onClose()
  }, [stopRecognition, interrupt, onClose])

  // ── Derived state ────────────────────────────────────
  const avatarAnimate = speaking ? 'none' : thinking ? 'thinking' : status === 'live' ? 'streaming' : 'idle'
  const showRings = status === 'live' && !speaking && !thinking
  const modeLabel = speaking ? 'Kiko is speaking…' : thinking ? 'Thinking…'
    : status === 'live' ? 'Speak freely' : status === 'error' ? (error || 'Error') : 'Connecting…'

  // ── Mini mode ───────────────────────────────────────
  if (mini) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={onShowPrompt} style={{ width: 52, height: 52, borderRadius: 14, border: 'none', cursor: 'pointer', background: status === 'live' ? 'var(--accent, #1A1A1A)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'all 0.3s' }}>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 0 : 1 }}>
            <KikoSymbol size={26} color={status === 'live' ? '#fff' : 'var(--text-tertiary, #999)'} animate={avatarAnimate} />
          </div>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 1 : 0 }}><Equalizer active={speaking} /></div>
        </button>
        <button onClick={handleClose} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface, #fff)', border: '1px solid var(--border, #eee)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-tertiary, #999)' }}>×</button>
      </div>
    )
  }

  // ── Full-screen ───────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
      onClick={e => e.target === e.currentTarget && handleClose()}>

      {/* Frosted glass background */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(250,250,250,0.82)', backdropFilter: 'blur(48px) saturate(1.8)', WebkitBackdropFilter: 'blur(48px) saturate(1.8)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg,rgba(255,255,255,0.5) 0%,rgba(255,255,255,0.1) 50%)', pointerEvents: 'none' }} />

      {/* Stage */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px 32px', zIndex: 1 }}>

        {/* Close button */}
        <button onClick={handleClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>
          <X size={14} />
        </button>

        {/* Mode label */}
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 20, background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', fontSize: 10, fontWeight: 500, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontFamily: 'var(--font, system-ui)' }}>
          {modeLabel}
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {showRings && <>
            <div style={{ position: 'absolute', inset: -13, borderRadius: 50, border: '1.5px solid rgba(0,0,0,0.08)', animation: 'pulse 2.2s ease-in-out infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: -26, borderRadius: 62, border: '1px solid rgba(0,0,0,0.04)', animation: 'pulse 2.2s ease-in-out infinite 0.5s', pointerEvents: 'none' }} />
          </>}
          <div style={{ width: 156, height: 156, borderRadius: 38, background: '#1A1A1A', border: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', transition: 'background 0.5s' }}>
            <div style={{ position: 'absolute', opacity: speaking ? 0 : 1, transition: 'opacity 0.35s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KikoSymbol size={68} color="rgba(255,255,255,0.92)" animate={avatarAnimate} />
            </div>
            <div style={{ position: 'absolute', opacity: speaking ? 1 : 0, transition: 'opacity 0.35s ease' }}>
              <Equalizer active={speaking} />
            </div>
          </div>
        </div>

        {/* Live text */}
        <div style={{ textAlign: 'center', maxWidth: 360, minHeight: 60, marginBottom: 24 }}>
          {transcript && <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(0,0,0,0.8)', margin: '0 0 7px', fontFamily: 'var(--font, system-ui)', lineHeight: 1.35 }}>{transcript}</p>}
          {kikoText && <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', margin: 0, fontFamily: 'var(--font, system-ui)', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto' }}>{kikoText}</p>}
          {status === 'error' && !transcript && <p style={{ fontSize: 13, color: '#C62828', margin: 0, fontFamily: 'var(--font, system-ui)' }}>{error}</p>}
        </div>

        {/* Prompt bar */}
        <div style={{ ...glass, width: '100%', maxWidth: 520, borderRadius: 28, padding: '8px 8px 8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={typeInput} onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendTyped())}
            placeholder="Ask anything or drop a file…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#1A1A1A', fontFamily: 'var(--font, system-ui)', height: 40 }} />

          <button title="Dictate" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: status === 'live' ? 'rgba(0,200,0,0.1)' : 'transparent', color: status === 'live' ? '#0a0' : 'rgba(0,0,0,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mic size={18} />
          </button>

          <button onClick={sendTyped} disabled={!typeInput.trim()} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: typeInput.trim() ? '#1A1A1A' : 'rgba(0,0,0,0.06)', color: typeInput.trim() ? '#fff' : 'rgba(0,0,0,0.25)', cursor: typeInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>

        {status === 'error' && (
          <button onClick={startRecognition} style={{ marginTop: 14, padding: '7px 18px', borderRadius: 10, background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.6)', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font, system-ui)' }}>Retry</button>
        )}
      </div>

      {/* Transcript toggle */}
      <div onClick={() => setShowPane(p => !p)} style={{ position: 'absolute', top: '50%', right: showPane ? 272 : 0, transform: 'translateY(-50%)', zIndex: 2, width: 20, height: 52, borderRadius: '9px 0 0 9px', background: 'rgba(0,0,0,0.05)', border: '0.5px solid rgba(0,0,0,0.08)', borderRight: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.3)', transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.09)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}>
        {showPane ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </div>

      {/* Transcript pane */}
      <div style={{ position: 'relative', zIndex: 1, width: showPane ? 272 : 0, flexShrink: 0, overflow: 'hidden', borderLeft: showPane ? '0.5px solid rgba(0,0,0,0.08)' : 'none', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)', background: 'rgba(255,255,255,0.35)' }}>
        <div style={{ width: 272, height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font, system-ui)' }}>Transcript</span>
            <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.2)', fontFamily: 'var(--font, system-ui)' }}>{messages.length} messages</span>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {messages.length === 0
              ? <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', fontFamily: 'var(--font, system-ui)', textAlign: 'center', marginTop: 40, lineHeight: 1.5 }}>Conversation appears here as you speak</p>
              : messages.map((m, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: m.role === 'user' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.8)', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: m.role === 'user' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.5)', fontFamily: 'var(--font, system-ui)' }}>{m.role === 'user' ? 'You' : 'Kiko'}</span>
                  <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.65)', margin: '3px 0 0', lineHeight: 1.45, fontFamily: 'var(--font, system-ui)' }}>{m.text}</p>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.03); } }`}</style>
    </div>
  )
}
