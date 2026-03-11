import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

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
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [error, setError] = useState('')
  const mediaRef = useRef(null)
  const recorderRef = useRef(null)
  const audioRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    return () => {
      if (mediaRef.current) mediaRef.current.getTracks().forEach(t => t.stop())
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [])

  async function startRecording() {
    setError(''); setTranscript(''); setKikoText('')
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream
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

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    if (mediaRef.current) { mediaRef.current.getTracks().forEach(t => t.stop()); mediaRef.current = null }
  }

  async function processAudio() {
    setPhase('processing')
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size < 500) { setError('Too short — tap K and speak'); setPhase('idle'); return }

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = () => rej(new Error('Read failed'))
        r.readAsDataURL(blob)
      })

      // 1. Whisper STT
      setError('')
      const sttRes = await fetch('/api/voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transcribe', audio: base64 })
      })
      const stt = await sttRes.json()
      if (!stt.text || stt.error) {
        setError(stt.error || 'Could not hear you — tap K to try again')
        setPhase('idle'); return
      }
      setTranscript(stt.text)

      // 2. Kiko response
      const kikoRes = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: stt.text, currentPage: 'voice' })
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
          try { const j = JSON.parse(d); if (j.delta) { full += j.delta; setKikoText(full) } } catch {}
        }
      }
      if (!full) { setError('No response — tap K to try again'); setPhase('idle'); return }

      // 3. TTS — Kiko speaks
      setPhase('speaking')
      const ttsRes = await fetch('/api/voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', text: full })
      })
      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob()
        const url = URL.createObjectURL(audioBlob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { URL.revokeObjectURL(url); setPhase('idle') }
        audio.onerror = () => { URL.revokeObjectURL(url); setPhase('idle') }
        await audio.play()
      } else {
        setPhase('idle')
      }
    } catch (err) {
      setError(err.message || 'Error — tap K to retry')
      setPhase('idle')
    }
  }

  function handleK() {
    if (phase === 'idle') startRecording()
    else if (phase === 'listening') stopRecording()
    else if (phase === 'speaking') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setPhase('idle')
    }
  }

  const label = { idle: 'Tap to speak', listening: 'Tap to stop', processing: 'Thinking...', speaking: 'Kiko is speaking' }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(250,250,250,0.92)',
      backdropFilter: 'blur(60px) saturate(1.8)', WebkitBackdropFilter: 'blur(60px) saturate(1.8)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }} className="animate-fade-in">

      <button onClick={() => { stopRecording(); onClose() }} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}><X size={20} /></button>

      {/* K button — tap to start/stop */}
      <button onClick={handleK} style={{
        width: 140, height: 140, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: phase === 'listening' ? 'var(--accent)' : phase === 'speaking' ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.3s', boxShadow: phase !== 'idle' ? '0 0 60px rgba(0,0,0,0.1)' : 'none',
      }}>
        <span style={{
          fontSize: 52, fontWeight: 700, fontFamily: 'var(--font)',
          color: phase !== 'idle' && phase !== 'processing' ? '#fff' : 'var(--text-tertiary)',
          transition: 'color 0.3s', letterSpacing: '-0.02em',
        }}>K</span>
      </button>

      <div style={{ marginTop: 20 }}>
        <Equalizer active={phase === 'listening' || phase === 'speaking'} />
      </div>

      <p style={{
        fontSize: 14, marginTop: 12, fontFamily: 'var(--font)', textAlign: 'center',
        color: error ? '#C62828' : 'var(--text-tertiary)',
      }}>{error || label[phase]}</p>

      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 560, width: '90%', textAlign: 'center', padding: '0 24px',
        }}>
          {transcript && (
            <p style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font)', fontWeight: 500, marginBottom: kikoText ? 12 : 0 }}>{transcript}</p>
          )}
          {kikoText && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.6 }}>{kikoText}</p>
          )}
        </div>
      )}
    </div>
  )
}
