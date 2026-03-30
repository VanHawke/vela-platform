// src/components/kiko/KikoVoice.jsx — Clean voice: Deepgram STT + /api/kiko + Browser TTS
// Zero infrastructure. Full agent access. Interruption support.
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DoubleHelix from './DoubleHelix'
import AuroraCanvas from '../AuroraCanvas'
import T from '@/lib/theme'

const BAR_COLORS = {
  connecting: '#F59E0B',
  listening:  '#06D6A0',
  thinking:   '#7C9CF6',
  speaking:   '#06D6A0',
  error:      '#FF5050',
  idle:       'rgba(255,255,255,0.18)',
}

export default function KikoVoice({ onClose, user, onVoiceState }) {
  const [status, setStatus] = useState('connecting')
  const [speaking, setSpeaking] = useState(false)
  const dgRef = useRef(null)        // Deepgram WebSocket
  const micRef = useRef(null)       // MediaStream
  const ctxRef = useRef(null)       // AudioContext for energy
  const analyserRef = useRef(null)  // AnalyserNode
  const rafRef = useRef(null)       // requestAnimationFrame
  const abortRef = useRef(null)     // AbortController for /api/kiko
  const utterRef = useRef([])       // queued SpeechSynthesisUtterances
  const isSpeakingRef = useRef(false)
  const transcriptRef = useRef('')
  const color = BAR_COLORS[status] || BAR_COLORS.idle

  // Report state upward
  useEffect(() => {
    if (onVoiceState) onVoiceState({ status, speaking })
  }, [status, speaking])

  // ── Mic energy → DoubleHelix ──
  const startMicEnergy = (stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    ctxRef.current = ctx
    analyserRef.current = analyser
    const data = new Uint8Array(analyser.frequencyBinCount)
    const pump = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length) / 255
      if (!isSpeakingRef.current) {
        window.__kikoAudioEnergy = Math.min(1, rms * 3.5)
        let wS = 0, tS = 0
        for (let i = 0; i < data.length; i++) { wS += data[i] * i; tS += data[i] }
        window.__kikoAudioPitch = tS > 0 ? Math.min(1, (wS / tS / data.length) * 2.5) : 0
      }
      rafRef.current = requestAnimationFrame(pump)
    }
    rafRef.current = requestAnimationFrame(pump)
  }

  // ── Speak via browser TTS with interruption ──
  const speak = (text) => {
    if (!text?.trim()) return
    const u = new SpeechSynthesisUtterance(text)
    // Try to find a good voice
    const voices = speechSynthesis.getVoices()
    const preferred = voices.find(v => v.name.includes('Cordelia')) 
      || voices.find(v => v.name.includes('Samantha'))
      || voices.find(v => v.lang.startsWith('en') && v.localService)
    if (preferred) u.voice = preferred
    u.rate = 1.05
    u.pitch = 1.0
    u.onstart = () => { isSpeakingRef.current = true; setSpeaking(true); setStatus('speaking')
      window.__kikoAudioEnergy = 0.4
    }
    u.onend = () => {
      isSpeakingRef.current = false; setSpeaking(false); setStatus('listening')
      window.__kikoAudioEnergy = 0
    }
    u.onerror = u.onend
    speechSynthesis.speak(u)
  }

  // ── Interrupt: stop TTS immediately ──
  const interrupt = () => {
    speechSynthesis.cancel()
    isSpeakingRef.current = false
    setSpeaking(false)
    window.__kikoAudioEnergy = 0
    if (abortRef.current) abortRef.current.abort()
  }

  // ── Send transcript to /api/kiko, stream response, speak sentences ──
  const sendToKiko = async (text) => {
    if (!text?.trim()) return
    interrupt()
    setStatus('thinking')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          userEmail: user?.email || 'sunny@vanhawke.com',
          currentPage: window.location.pathname.replace('/', '') || 'home',
          conversationHistory: [],
          voiceMode: true,
        }),
      })
      let buf = ''
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') break
          try {
            const j = JSON.parse(d)
            if (j.delta) {
              buf += j.delta
              // Sentence buffer — speak complete sentences immediately
              const sentenceEnd = buf.match(/[.!?]\s/g)
              if (sentenceEnd) {
                const lastEnd = buf.lastIndexOf(sentenceEnd[sentenceEnd.length - 1])
                const sentence = buf.slice(0, lastEnd + 2).trim()
                buf = buf.slice(lastEnd + 2)
                if (sentence) speak(sentence)
              }
            }
            // Handle navigation
            if (j.navigate) {
              const path = j.navigate === 'home' ? '/' : `/${j.navigate}`
              window.history.pushState({}, '', path)
              window.dispatchEvent(new PopStateEvent('popstate'))
            }
          } catch {}
        }
      }
      // Speak any remaining buffer
      if (buf.trim()) speak(buf.trim())
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[KikoVoice] Error:', err)
        setStatus('error')
      }
    }
  }

  // ── Connect Deepgram + Mic on mount ──
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        // 1. Get mic
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        micRef.current = stream
        startMicEnergy(stream)

        // 2. Get Deepgram key
        const tokenRes = await fetch('/api/deepgram-token', { method: 'POST' })
        const { key } = await tokenRes.json()
        if (cancelled) return

        // 3. Open Deepgram WebSocket
        const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&endpointing=300&utterance_end_ms=1200&interim_results=true`
        const ws = new WebSocket(dgUrl, ['token', key])
        dgRef.current = ws

        ws.onopen = () => {
          if (cancelled) return
          setStatus('listening')
          // Stream mic audio to Deepgram
          const mediaRec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
          mediaRec.ondataavailable = (e) => {
            if (ws.readyState === WebSocket.OPEN && e.data.size > 0) ws.send(e.data)
          }
          mediaRec.start(100) // 100ms chunks
          micRef.current._recorder = mediaRec
        }

        ws.onmessage = (evt) => {
          const msg = JSON.parse(evt.data)
          if (!msg.channel?.alternatives?.[0]) return
          const transcript = msg.channel.alternatives[0].transcript
          if (!transcript) return
          if (msg.is_final) {
            transcriptRef.current += ' ' + transcript
          }
          // On utterance end — user finished speaking, send to Kiko
          if (msg.speech_final || msg.type === 'UtteranceEnd') {
            const full = transcriptRef.current.trim()
            transcriptRef.current = ''
            if (full) {
              interrupt() // stop Kiko if she's talking
              sendToKiko(full)
            }
          }
        }

        ws.onerror = () => setStatus('error')
        ws.onclose = () => { if (!cancelled) setStatus('idle') }

      } catch (err) {
        console.error('[KikoVoice] Init error:', err)
        setStatus('error')
      }
    }

    // Load voices early (browser caches them)
    speechSynthesis.getVoices()
    init()

    // Cleanup
    return () => {
      cancelled = true
      speechSynthesis.cancel()
      if (abortRef.current) abortRef.current.abort()
      if (dgRef.current) dgRef.current.close()
      if (micRef.current) {
        if (micRef.current._recorder) micRef.current._recorder.stop()
        micRef.current.getTracks().forEach(t => t.stop())
      }
      if (ctxRef.current) ctxRef.current.close().catch(() => {})
      cancelAnimationFrame(rafRef.current)
      window.__kikoAudioEnergy = 0
      window.__kikoAudioPitch = 0
    }
  }, [])

  const handleClose = useCallback(() => {
    speechSynthesis.cancel()
    if (abortRef.current) abortRef.current.abort()
    if (dgRef.current) dgRef.current.close()
    if (micRef.current) {
      if (micRef.current._recorder) micRef.current._recorder.stop()
      micRef.current.getTracks().forEach(t => t.stop())
    }
    if (ctxRef.current) ctxRef.current.close().catch(() => {})
    cancelAnimationFrame(rafRef.current)
    window.__kikoAudioEnergy = 0
    window.__kikoAudioPitch = 0
    if (onClose) onClose()
  }, [onClose])

  // ── Render ──
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      {/* Aurora background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>

      {/* X close */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2,
        width: 32, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
      ><X size={14} /></button>

      {/* DoubleHelix ribbon */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '95%', maxWidth: 1100, marginBottom: 24,
        overflow: 'visible', padding: '32px 0',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}>
        <DoubleHelix width={1100} height={140} speaking={speaking} energy={0} pitch={0} />
      </div>

      {/* Status bar */}
      <div style={{ position: 'relative', zIndex: 1, width: 220, height: 2.5, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
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
        position: 'relative', zIndex: 1,
        padding: '10px 28px', borderRadius: 50,
        background: 'rgba(255,255,255,0.04)',
        border: '1.5px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.25)', fontSize: 13,
        fontWeight: 300, cursor: 'pointer', fontFamily: T.font,
        transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      >Goodbye Kiko</button>

      <style>{`
        @keyframes kikoBarPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>,
    document.body
  )
}
