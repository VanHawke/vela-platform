import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

// Equalizer bars — only animate when active
function Equalizer({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: 'var(--accent)',
          animation: active ? `equalizerBar 0.8s ease-in-out ${i * 0.12}s infinite` : 'none',
          height: active ? 16 : 6, minHeight: 6, transition: 'height 0.3s',
          opacity: active ? 1 : 0.3,
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user }) {
  const [phase, setPhase] = useState('idle')
  // idle → listening → processing → speaking → idle
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [error, setError] = useState('')
  const [soundLevel, setSoundLevel] = useState(0)
  const mediaRef = useRef(null)
  const recorderRef = useRef(null)
  const audioRef = useRef(null)
  const chunksRef = useRef([])
  const analyserRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const hadSpeechRef = useRef(false)
  const animFrameRef = useRef(null)

  // Cleanup
  useEffect(() => {
    return () => {
      stopEverything()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [])

  // Auto-start listening when overlay opens
  useEffect(() => { startListening() }, [])

  function stopEverything() {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.stop() } catch {}
    }
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach(t => t.stop())
      mediaRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
  }

  // Monitor audio levels for silence detection
  function monitorAudio(stream) {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)
    analyserRef.current = analyser

    const data = new Uint8Array(analyser.fftSize)
    const SPEECH_THRESHOLD = 25
    const SILENCE_MS = 2000

    function checkLevel() {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length) * 200
      setSoundLevel(rms)

      if (rms > SPEECH_THRESHOLD) {
        hadSpeechRef.current = true
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      } else if (hadSpeechRef.current && !silenceTimerRef.current) {
        // Speech detected earlier, now silence — start countdown
        silenceTimerRef.current = setTimeout(() => {
          finishRecording()
        }, SILENCE_MS)
      }
      animFrameRef.current = requestAnimationFrame(checkLevel)
    }
    checkLevel()
  }

  async function startListening() {
    setError('')
    setTranscript('')
    setKikoText('')
    hadSpeechRef.current = false
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => processAudio()
      recorder.start()
      monitorAudio(stream)
      setPhase('listening')
    } catch (err) {
      setError('Microphone access denied')
      setPhase('idle')
    }
  }

  function finishRecording() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach(t => t.stop())
      mediaRef.current = null
    }
  }

  async function processAudio() {
    setPhase('processing')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

    if (blob.size < 1000) {
      setError('No speech detected — try again')
      setTimeout(() => startListening(), 1500)
      return
    }

    try {
      // Base64 encode
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result.split(',')[1])
        r.onerror = () => reject(new Error('Audio read failed'))
        r.readAsDataURL(blob)
      })

      // Step 1: Whisper transcription
      const sttRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transcribe', audio: base64 })
      })
      const sttData = await sttRes.json()
      if (!sttData.text || sttData.error) {
        setError(sttData.error || 'Could not understand — try again')
        setTimeout(() => startListening(), 1500)
        return
      }
      setTranscript(sttData.text)

      // Step 2: Send to Kiko
      const kikoRes = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: sttData.text,
          currentPage: 'voice'
        })
      })
      const reader = kikoRes.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; setKikoText(full) }
          } catch {}
        }
      }

      if (!full) {
        setError('No response — try again')
        setTimeout(() => startListening(), 1500)
        return
      }

      // Step 3: TTS — Kiko speaks
      setPhase('speaking')
      const ttsRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', text: full })
      })

      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          // Auto-restart listening for next turn
          setTranscript('')
          setKikoText('')
          startListening()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          startListening()
        }
        await audio.play()
      } else {
        // TTS failed — still restart listening
        setTimeout(() => startListening(), 1000)
      }

    } catch (err) {
      setError(err.message || 'Voice error — try again')
      setTimeout(() => startListening(), 2000)
    }
  }

  const handleClose = () => {
    stopEverything()
    onClose()
  }

  const statusText = {
    idle: 'Starting...',
    listening: 'Speak now',
    processing: 'Thinking...',
    speaking: ''
  }

  const isUserSpeaking = phase === 'listening' && soundLevel > 15
  const isKikoSpeaking = phase === 'speaking'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(250,250,250,0.88)',
      backdropFilter: 'blur(60px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(60px) saturate(1.8)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }} className="animate-fade-in">

      {/* Close */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}><X size={20} /></button>

      {/* Equalizer — animates when user or Kiko speaking */}
      <Equalizer active={isUserSpeaking || isKikoSpeaking} />

      {/* Status */}
      <p style={{
        fontSize: 14, marginTop: 16,
        color: error ? '#C62828' : 'var(--text-tertiary)',
        fontFamily: 'var(--font)', textAlign: 'center',
      }}>
        {error || statusText[phase]}
      </p>

      {/* Transcript */}
      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%',
          transform: 'translateX(-50%)', maxWidth: 560,
          width: '90%', textAlign: 'center', padding: '0 24px',
        }}>

          {transcript && (
            <p style={{
              fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font)',
              fontWeight: 500, marginBottom: kikoText ? 12 : 0,
            }}>{transcript}</p>
          )}
          {kikoText && (
            <p style={{
              fontSize: 14, color: 'var(--text-secondary)',
              fontFamily: 'var(--font)', lineHeight: 1.6,
            }}>{kikoText}</p>
          )}
        </div>
      )}
    </div>
  )
}
