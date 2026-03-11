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

export default function KikoVoice({ onClose, user, micStream }) {
  const [status, setStatus] = useState('connecting') // connecting | live | error
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [speaking, setSpeaking] = useState(false) // is Kiko currently speaking
  const [error, setError] = useState('')
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const streamRef = useRef(null)
  const audioRef = useRef(null)

  // Connect on mount — auto-start voice session
  useEffect(() => {
    connectRealtime()
    return () => disconnect()
  }, [])

  async function connectRealtime() {
    try {
      setStatus('connecting')
      setError('')

      // 1. Get ephemeral token from our backend
      const tokenRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'realtime-token' })
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || (!tokenData.client_secret?.value && !tokenData.value)) {
        throw new Error(tokenData.error?.message || 'Failed to get voice token')
      }
      const ephemeralKey = tokenData.client_secret?.value || tokenData.value

      // 2. Use pre-acquired microphone stream (permission already granted by parent)
      const stream = micStream || await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 3. Create peer connection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // 4. Play remote audio (Kiko's voice)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioRef.current = audioEl
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0] }

      // 5. Add local audio track (user's mic)
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // 6. Data channel for Realtime API events
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setStatus('live')
        // Configure session via data channel
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `You are Kiko — the intelligence layer of the Vela platform, built for Van Hawke Group.
You are speaking with Sunny Sidhu, CEO of Van Hawke Group, based in Weybridge, UK.
You are direct, precise, commercially minded. A strategic partner, not a chatbot.
Never waste words. Lead with value. Keep responses concise — 2-3 sentences for simple queries.
Never refer to yourself as an AI assistant or ChatGPT. You are Kiko.
Van Hawke operates three verticals: Haas F1 sponsorship advisory, Van Hawke Maison eyewear, and ClinIQ Copilot.
All financials in USD. Use "intelligent age" not "AI generation".`,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
          }
        }))
      }
      dc.onclose = () => { setStatus('connecting') }

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          handleRealtimeEvent(event)
        } catch {}
      }

      // 7. Create and send SDP offer directly to OpenAI
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpRes.ok) {
        const errText = await sdpRes.text()
        throw new Error(`Realtime connection failed: ${sdpRes.status}`)
      }

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err) {
      console.error('[Voice] Connection error:', err)
      setError(err.message || 'Could not connect voice')
      setStatus('error')
    }
  }

  function handleRealtimeEvent(event) {
    const t = event.type
    // User's speech transcribed
    if (t === 'conversation.item.input_audio_transcription.completed') {
      setTranscript(event.transcript || '')
    }
    // Kiko's response text (delta)
    if (t === 'response.audio_transcript.delta') {
      setKikoText(prev => prev + (event.delta || ''))
    }
    // Kiko started a new response
    if (t === 'response.created') {
      setKikoText('')
      setSpeaking(true)
    }
    // Kiko finished speaking
    if (t === 'response.done') {
      setSpeaking(false)
    }
    // User started speaking (interruption)
    if (t === 'input_audio_buffer.speech_started') {
      setTranscript('')
      setKikoText('')
      setSpeaking(false)
    }
  }

  function disconnect() {
    if (dcRef.current) { try { dcRef.current.close() } catch {} }
    if (pcRef.current) { try { pcRef.current.close() } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()) }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null }
    pcRef.current = null
    dcRef.current = null
    streamRef.current = null
  }

  function handleClose() {
    disconnect()
    onClose()
  }

  const statusLabel = {
    connecting: 'Connecting...',
    live: speaking ? '' : 'Speak freely',
    error: error || 'Connection failed',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(250,250,250,0.92)',
      backdropFilter: 'blur(60px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(60px) saturate(1.8)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }} className="animate-fade-in">

      {/* Close / Stop */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}><X size={20} /></button>

      {/* K symbol */}
      <div style={{
        width: 140, height: 140, borderRadius: '50%',
        background: status === 'live' ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.4s',
        boxShadow: status === 'live' ? '0 0 60px rgba(0,0,0,0.1)' : 'none',
      }}>
        <span style={{
          fontSize: 52, fontWeight: 700, fontFamily: 'var(--font)',
          color: status === 'live' ? '#fff' : 'var(--text-tertiary)',
          letterSpacing: '-0.02em',
        }}>K</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <Equalizer active={status === 'live'} />
      </div>

      <p style={{
        fontSize: 14, marginTop: 12, fontFamily: 'var(--font)',
        textAlign: 'center',
        color: status === 'error' ? '#C62828' : 'var(--text-tertiary)',
      }}>{statusLabel[status]}</p>

      {/* Transcript */}
      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%',
          transform: 'translateX(-50%)', maxWidth: 560,
          width: '90%', textAlign: 'center', padding: '0 24px',
        }}>
          {transcript && (
            <p style={{
              fontSize: 15, color: 'var(--text)',
              fontFamily: 'var(--font)', fontWeight: 500,
              marginBottom: kikoText ? 12 : 0,
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

      {/* Retry on error */}
      {status === 'error' && (
        <button onClick={connectRealtime} style={{
          marginTop: 16, height: 36, padding: '0 20px',
          borderRadius: 10, background: 'var(--accent)',
          color: '#fff', border: 'none', fontSize: 13,
          fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
        }}>Retry</button>
      )}
    </div>
  )
}
