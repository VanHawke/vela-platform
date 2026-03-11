import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Mic, MicOff } from 'lucide-react'

// Kiko symbol — large centred circle
function KikoSymbol({ size = 140, active = false, speaking = false, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%',
      background: active ? 'var(--accent)' : speaking ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all 0.4s ease', border: 'none',
      boxShadow: active || speaking ? '0 0 80px rgba(0,0,0,0.12)' : 'none',
    }}>
      <span style={{
        fontSize: size * 0.38, fontWeight: 700, fontFamily: 'var(--font)',
        color: active || speaking ? '#fff' : 'var(--text-tertiary)',
        letterSpacing: '-0.02em', transition: 'color 0.3s'
      }}>K</span>
    </button>
  )
}

// Equalizer bars
function Equalizer({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 48, opacity: active ? 1 : 0.3 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: 'var(--accent)',
          animation: active ? `equalizerBar 0.8s ease-in-out ${i * 0.12}s infinite` : 'none',
          height: active ? 16 : 8, minHeight: 8, transition: 'height 0.3s'
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user }) {
  const [phase, setPhase] = useState('idle') // idle | listening | processing | speaking
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [error, setError] = useState('')
  const mediaRef = useRef(null)
  const recorderRef = useRef(null)
  const audioRef = useRef(null)
  const chunksRef = useRef([])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRef.current) mediaRef.current.getTracks().forEach(t => t.stop())
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [])

  // Start recording
  const startListening = async () => {
    setError('')
    setTranscript('')
    setKikoText('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => processAudio()
      recorder.start()
      setPhase('listening')
    } catch (err) {
      setError('Microphone access denied')
      setPhase('idle')
    }
  }

  // Stop recording — let recorder finish BEFORE killing stream
  const stopListening = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      // onstop handler calls processAudio, which will clean up media tracks after
      recorderRef.current.stop()
    } else {
      // Recorder not active — clean up directly
      if (mediaRef.current) {
        mediaRef.current.getTracks().forEach(t => t.stop())
        mediaRef.current = null
      }
      setPhase('idle')
    }
  }

  // Process audio: transcribe → Kiko → TTS
  const processAudio = async () => {
    setPhase('processing')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    
    // Now safe to release mic
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach(t => t.stop())
      mediaRef.current = null
    }

    if (blob.size < 1000) {
      setError('Recording too short — try speaking longer')
      setPhase('idle')
      return
    }

    // Convert to base64
    const toBase64 = (b) => new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result.split(',')[1])
      r.onerror = () => reject(new Error('Failed to read audio'))
      r.readAsDataURL(b)
    })

    try {
      const base64 = await toBase64(blob)
        // Step 1: Whisper transcription
        const sttRes = await fetch('/api/voice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transcribe', audio: base64 })
        })
        const sttData = await sttRes.json()
        if (!sttData.text) { setError('Could not transcribe audio'); setPhase('idle'); return }
        setTranscript(sttData.text)

        // Step 2: Send to Kiko
        const kikoRes = await fetch('/api/kiko', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: sttData.text, currentPage: 'voice' })
        })
        const kikoReader = kikoRes.body.getReader()
        const dec = new TextDecoder()
        let full = '', buf = ''
        while (true) {
          const { done, value } = await kikoReader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const d = line.slice(6)
            if (d === '[DONE]') continue
            try { const j = JSON.parse(d); if (j.delta) { full += j.delta; setKikoText(full) } } catch {}
          }
        }

        if (!full) { setPhase('idle'); return }

        // Step 3: TTS — Kiko speaks back
        setPhase('speaking')
        const ttsRes = await fetch('/api/voice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tts', text: full })
        })

        if (ttsRes.ok) {
          const audioBlob = await ttsRes.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          audioRef.current = audio
          audio.onended = () => { setPhase('idle'); URL.revokeObjectURL(audioUrl) }
          audio.onerror = () => { setPhase('idle'); URL.revokeObjectURL(audioUrl) }
          await audio.play()
        } else {
          setPhase('idle')
        }
    } catch (err) {
      setError(err.message || 'Voice error')
      setPhase('idle')
    }
  }

  // Toggle: tap K to start/stop
  const handleToggle = () => {
    if (phase === 'idle') startListening()
    else if (phase === 'listening') stopListening()
    else if (phase === 'speaking') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setPhase('idle')
    }
  }

  const statusText = {
    idle: 'Tap to speak',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: ''
  }

  return (
    <div className="voice-overlay animate-fade-in">
      {/* Close button */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', zIndex: 10
      }}><X size={20} /></button>

      {/* Centre: K symbol + equalizer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        {phase === 'speaking' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <KikoSymbol size={140} speaking onClick={handleToggle} />
            <Equalizer active />
          </div>
        ) : (
          <KikoSymbol size={140} active={phase === 'listening'} onClick={handleToggle} />
        )}

        {phase === 'listening' && <Equalizer active />}

        <p style={{
          fontSize: 14, color: phase === 'idle' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          fontFamily: 'var(--font)', textAlign: 'center', maxWidth: 400
        }}>
          {error || statusText[phase]}
        </p>
      </div>

      {/* Transcript display */}
      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 560, width: '90%', textAlign: 'center', padding: '0 24px'
        }}>
          {transcript && (
            <p style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font)', fontWeight: 500, marginBottom: kikoText ? 12 : 0 }}>
              {transcript}
            </p>
          )}
          {kikoText && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.6 }}>
              {kikoText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
