// src/components/kiko/KikoVoice.jsx — Clean voice v2
// Fast path: /api/kiko-voice (Haiku, <1s) for conversation
// Slow path: /api/kiko (full agents) only when Kiko needs live data
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DoubleHelix from './DoubleHelix'
import AuroraCanvas from '../AuroraCanvas'
import T from '@/lib/theme'

const BAR_COLORS = {
  connecting: '#F59E0B', listening: '#06D6A0', thinking: '#7C9CF6',
  speaking: '#06D6A0', error: '#FF5050', idle: 'rgba(255,255,255,0.18)',
}
const TTS_MODEL = 'aura-2-thalia-en'
const TTS_RATE = 24000

export default function KikoVoice({ onClose, user, onVoiceState }) {
  const [status, setStatus] = useState('connecting')
  const [speaking, setSpeaking] = useState(false)
  const dgSTT = useRef(null)
  const dgTTS = useRef(null)
  const micRef = useRef(null)
  const audioCtx = useRef(null)
  const nextPlay = useRef(0)
  const abortRef = useRef(null)
  const isSpeaking = useRef(false)
  const transcript = useRef('')
  const dgKey = useRef(null)
  const energyRAF = useRef(null)
  const color = BAR_COLORS[status] || BAR_COLORS.idle

  useEffect(() => { if (onVoiceState) onVoiceState({ status, speaking }) }, [status, speaking])

  // ── Create AudioContext immediately (within user gesture) ──
  const ensureAudioCtx = () => {
    if (!audioCtx.current || audioCtx.current.state === 'closed') {
      audioCtx.current = new AudioContext({ sampleRate: TTS_RATE })
    }
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume()
    return audioCtx.current
  }

  // ── Play PCM from Deepgram TTS ──
  const playPCM = (data) => {
    const actx = ensureAudioCtx()
    const int16 = new Int16Array(data)
    const f32 = new Float32Array(int16.length)
    let e = 0
    for (let i = 0; i < int16.length; i++) { f32[i] = int16[i] / 32768; e += f32[i] * f32[i] }
    window.__kikoAudioEnergy = Math.min(0.6, Math.sqrt(e / f32.length) * 3)
    window.__kikoAudioPitch = 0.3
    const buf = actx.createBuffer(1, f32.length, TTS_RATE)
    buf.getChannelData(0).set(f32)
    const src = actx.createBufferSource()
    src.buffer = buf; src.connect(actx.destination)
    const t = Math.max(actx.currentTime, nextPlay.current)
    src.start(t); nextPlay.current = t + buf.duration
    src.onended = () => {
      if (nextPlay.current <= actx.currentTime + 0.05) {
        isSpeaking.current = false; setSpeaking(false); setStatus('listening')
        window.__kikoAudioEnergy = 0
      }
    }
  }

  // ── Interrupt: kill TTS + audio ──
  const interrupt = () => {
    if (abortRef.current) abortRef.current.abort()
    if (dgTTS.current?.readyState === WebSocket.OPEN) {
      try { dgTTS.current.send(JSON.stringify({ type: 'Clear' })) } catch {}
    }
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close().catch(() => {})
      audioCtx.current = null; nextPlay.current = 0
    }
    isSpeaking.current = false; setSpeaking(false)
    window.__kikoAudioEnergy = 0
  }

  // ── Open TTS WebSocket ──
  const openTTS = (key) => {
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/speak?model=${TTS_MODEL}&encoding=linear16&sample_rate=${TTS_RATE}`,
      ['token', key]
    )
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer && evt.data.byteLength > 44) {
        console.log('[KikoVoice] TTS audio chunk:', evt.data.byteLength, 'bytes')
        isSpeaking.current = true; setSpeaking(true); setStatus('speaking')
        playPCM(evt.data)
      }
    }
    ws.onopen = () => console.log('[KikoVoice] TTS WebSocket connected')
    ws.onerror = (e) => console.error('[KikoVoice] TTS error', e)
    ws.onclose = () => { console.log('[KikoVoice] TTS WebSocket closed'); dgTTS.current = null }
    dgTTS.current = ws
  }

  // ── Send text to TTS WebSocket ──
  const speakViaTTS = (text) => {
    if (!text?.trim()) return
    // Open TTS WebSocket just-in-time if not connected
    if (!dgTTS.current || dgTTS.current.readyState !== WebSocket.OPEN) {
      if (dgKey.current) {
        console.log('[KikoVoice] TTS reconnecting (was closed)')
        openTTS(dgKey.current)
        // Queue the text and retry after connection opens
        const waitAndSend = () => {
          if (dgTTS.current?.readyState === WebSocket.OPEN) {
            console.log('[KikoVoice] → TTS (after reconnect):', text.slice(0, 60))
            ensureAudioCtx()
            dgTTS.current.send(JSON.stringify({ type: 'Speak', text: text.trim() + ' ' }))
            dgTTS.current.send(JSON.stringify({ type: 'Flush' }))
          } else {
            setTimeout(waitAndSend, 50)
          }
        }
        setTimeout(waitAndSend, 100)
        return
      }
      console.log('[KikoVoice] TTS skip — no key available')
      return
    }
    console.log('[KikoVoice] → TTS:', text.slice(0, 60))
    ensureAudioCtx()
    dgTTS.current.send(JSON.stringify({ type: 'Speak', text: text.trim() + ' ' }))
    dgTTS.current.send(JSON.stringify({ type: 'Flush' }))
  }

  // ── Stream SSE response → pipe chunks to TTS ──
  const streamToTTS = async (url, body) => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let escalate = false, origMsg = ''
    try {
      const res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      console.log('[KikoVoice] API response started:', url)
      let buf = ''
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') break
          try {
            const j = JSON.parse(d)
            if (j.escalate) { escalate = true; origMsg = j.originalMessage || '' }
            if (j.delta) {
              buf += j.delta
              // Send at any natural break or ~40 chars
              const brk = buf.match(/[.!?,;:]\s/)
              if (brk || buf.length > 40) {
                let cut = brk ? buf.indexOf(brk[0]) + 1 : (buf.lastIndexOf(' ', 40) > 8 ? buf.lastIndexOf(' ', 40) : 40)
                const chunk = buf.slice(0, cut).trim().replace(/\[NEEDS_DATA\]/g, '')
                buf = buf.slice(cut)
                if (chunk) speakViaTTS(chunk)
              }
            }
            if (j.navigate) {
              window.history.pushState({}, '', j.navigate === 'home' ? '/' : `/${j.navigate}`)
              window.dispatchEvent(new PopStateEvent('popstate'))
            }
          } catch {}
        }
      }
      const remaining = buf.trim().replace(/\[NEEDS_DATA\]/g, '')
      if (remaining) speakViaTTS(remaining)
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[KikoVoice]', err)
    }
    return { escalate, origMsg }
  }

  // ── Main handler: fast path first, escalate if needed ──
  const sendToKiko = async (text) => {
    if (!text?.trim()) return
    console.log('[KikoVoice] USER SAID:', text)
    interrupt()
    ensureAudioCtx()
    setStatus('thinking')

    // Fast path: /api/kiko-voice (Haiku, <1s)
    const { escalate, origMsg } = await streamToTTS('/api/kiko-voice', {
      message: text, currentPage: window.location.pathname.replace('/', '') || 'home',
    })

    // If Kiko needs real data → speak transition → fire full API
    if (escalate) {
      speakViaTTS('Let me look into that for you.')
      setStatus('thinking')
      await streamToTTS('/api/kiko', {
        message: origMsg || text,
        userEmail: user?.email || 'sunny@vanhawke.com',
        currentPage: window.location.pathname.replace('/', '') || 'home',
        conversationHistory: [], voiceMode: true,
      })
    }
  }

  // ── Init: mic + STT + TTS ──
  useEffect(() => {
    let dead = false
    // Create AudioContext immediately (we're in a user gesture from clicking ribbon)
    ensureAudioCtx()

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (dead) { stream.getTracks().forEach(t => t.stop()); return }
        micRef.current = stream

        // Mic energy → DoubleHelix
        try {
          const mctx = new AudioContext()
          const src = mctx.createMediaStreamSource(stream)
          const an = mctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.7
          src.connect(an)
          const d = new Uint8Array(an.frequencyBinCount)
          const pump = () => {
            an.getByteFrequencyData(d)
            if (!isSpeaking.current) {
              let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]
              window.__kikoAudioEnergy = Math.min(0.5, Math.sqrt(s / d.length) / 255 * 2)
            }
            energyRAF.current = requestAnimationFrame(pump)
          }
          energyRAF.current = requestAnimationFrame(pump)
        } catch {}

        // Get Deepgram key
        const { key } = await (await fetch('/api/deepgram-token', { method: 'POST' })).json()
        if (dead) return
        dgKey.current = key
        // TTS WebSocket opens just-in-time when we have text to speak
        // (Deepgram closes idle connections after ~20s)

        // Open STT WebSocket
        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&endpointing=200&utterance_end_ms=600&interim_results=true`,
          ['token', key]
        )
        dgSTT.current = ws

        ws.onopen = () => {
          if (dead) return
          console.log('[KikoVoice] STT WebSocket connected — listening')
          setStatus('listening')
          const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
          rec.ondataavailable = (e) => {
            if (ws.readyState === WebSocket.OPEN && e.data.size > 0) ws.send(e.data)
          }
          rec.start(100)
          micRef.current._rec = rec
        }

        ws.onmessage = (evt) => {
          const msg = JSON.parse(evt.data)
          const t = msg.channel?.alternatives?.[0]?.transcript
          if (!t) return

          // INTERRUPT: any speech detected while Kiko is speaking → stop her immediately
          if (isSpeaking.current && t.length > 0) {
            console.log('[KikoVoice] INTERRUPT — user spoke during playback')
            interrupt()
          }

          if (msg.is_final) {
            console.log('[KikoVoice] STT final:', t)
            transcript.current += ' ' + t
          }
          if (msg.speech_final || msg.type === 'UtteranceEnd') {
            const full = transcript.current.trim()
            transcript.current = ''
            if (full) { interrupt(); sendToKiko(full) }
          }
        }
        ws.onerror = () => setStatus('error')
        ws.onclose = () => { if (!dead) setStatus('idle') }
      } catch (err) { console.error('[KikoVoice]', err); setStatus('error') }
    }
    init()

    return () => {
      dead = true
      if (abortRef.current) abortRef.current.abort()
      if (dgSTT.current) dgSTT.current.close()
      if (dgTTS.current) dgTTS.current.close()
      if (micRef.current) { micRef.current._rec?.stop(); micRef.current.getTracks().forEach(t => t.stop()) }
      if (audioCtx.current?.state !== 'closed') audioCtx.current?.close().catch(() => {})
      cancelAnimationFrame(energyRAF.current)
      window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    }
  }, [])

  const handleClose = useCallback(() => {
    interrupt()
    dgSTT.current?.close(); dgTTS.current?.close()
    if (micRef.current) { micRef.current._rec?.stop(); micRef.current.getTracks().forEach(t => t.stop()) }
    cancelAnimationFrame(energyRAF.current)
    window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    onClose?.()
  }, [onClose])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>
      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2, width: 32, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
      ><X size={14} /></button>

      <div style={{
        position: 'relative', zIndex: 1, width: '95%', maxWidth: 1100, marginBottom: 24,
        overflow: 'visible', padding: '48px 0',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}>
        <DoubleHelix width={1100} height={140} speaking={speaking} energy={0} pitch={0} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, width: 220, height: 2.5, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 50,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}50`,
          animation: 'kikoBarPulse 2.5s ease-in-out infinite',
          transition: 'background 0.5s, box-shadow 0.5s',
        }} />
      </div>
      <button onClick={handleClose} style={{
        position: 'relative', zIndex: 1, padding: '10px 28px', borderRadius: 50,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.25)', fontSize: 13, fontWeight: 300,
        cursor: 'pointer', fontFamily: T.font, transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      >Goodbye Kiko</button>
      <style>{`@keyframes kikoBarPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>,
    document.body
  )
}
