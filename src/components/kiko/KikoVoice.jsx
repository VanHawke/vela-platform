import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

// Kiko symbol — large centred circle
function KikoSymbol({ size = 120, active = false, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%',
      background: active ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all 0.4s ease', border: 'none',
      boxShadow: active ? '0 0 80px rgba(0,0,0,0.12)' : 'none',
    }}>
      <span style={{
        fontSize: size * 0.38, fontWeight: 700, fontFamily: 'var(--font)',
        color: active ? '#fff' : 'var(--text-tertiary)',
        letterSpacing: '-0.02em', transition: 'color 0.3s'
      }}>K</span>
    </button>
  )
}

// Equalizer bars
function Equalizer() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 48 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: 'var(--accent)',
          animation: `equalizerBar 0.8s ease-in-out ${i * 0.12}s infinite`,
          height: 16, minHeight: 8,
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [kikoSpeaking, setKikoSpeaking] = useState(false)
  const [kikoText, setKikoText] = useState('')
  const mediaRef = useRef(null)
  const wsRef = useRef(null)

  const toggleListening = useCallback(() => {
    if (listening) {
      // Stop
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      if (mediaRef.current) { mediaRef.current.getTracks().forEach(t => t.stop()); mediaRef.current = null }
      setListening(false)
    } else {
      // Start — connect to OpenAI Realtime
      setListening(true)
      setTranscript('')
      setKikoText('')
      startVoiceSession()
    }
  }, [listening])

  const startVoiceSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream

      // Use Whisper STT for now — send chunks to /api/voice
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, 'voice.webm')
        try {
          const res = await fetch('/api/voice', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            setTranscript(data.text)
            // Send to Kiko
            const kikoRes = await fetch('/api/kiko', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: data.text, currentPage: 'voice' })
            })
            const reader = kikoRes.body.getReader()
            const dec = new TextDecoder()
            let full = '', buf = ''
            setKikoSpeaking(true)
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
            setKikoSpeaking(false)
          }
        } catch (err) { console.error('[Voice] STT error:', err) }
      }
      // Record for 10s max, or until user stops
      recorder.start()
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 10000)
    } catch (err) {
      console.error('[Voice] Mic error:', err)
      setListening(false)
    }
  }

  // Close handler
  const handleClose = () => {
    if (wsRef.current) wsRef.current.close()
    if (mediaRef.current) mediaRef.current.getTracks().forEach(t => t.stop())
    setListening(false)
    onClose()
  }

  return (
    <div className="voice-overlay animate-fade-in">
      {/* Close button */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
      }}><X size={20} /></button>

      {/* Centre: Kiko symbol or equalizer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        {listening && kikoSpeaking ? (
          <Equalizer />
        ) : (
          <KikoSymbol size={140} active={listening} onClick={toggleListening} />
        )}

        <p style={{
          fontSize: 14, color: listening ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          fontFamily: 'var(--font)', textAlign: 'center', maxWidth: 400, lineHeight: 1.5
        }}>
          {listening ? (kikoSpeaking ? '' : 'Listening...') : 'Tap to start speaking'}
        </p>
      </div>

      {/* Spoken text — only current utterance */}
      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 500, textAlign: 'center', padding: '0 24px'
        }}>
          {transcript && !kikoText && (
            <p style={{ fontSize: 16, color: 'var(--text)', fontFamily: 'var(--font)', fontWeight: 500 }}>{transcript}</p>
          )}
          {kikoText && (
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.6 }}>{kikoText}</p>
          )}
        </div>
      )}
    </div>
  )
}
