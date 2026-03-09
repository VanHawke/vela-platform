import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Mic, MicOff, Volume2, Loader2, AlertCircle } from 'lucide-react'

const STATES = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
}

const STATE_LABELS = {
  IDLE: 'Ready',
  CONNECTING: 'Connecting...',
  LISTENING: 'Listening...',
  PROCESSING: 'Processing...',
  SPEAKING: 'Kiko is speaking...',
  ERROR: 'Error occurred',
}

const STATE_ICONS = {
  IDLE: Mic,
  CONNECTING: Loader2,
  LISTENING: Mic,
  PROCESSING: Loader2,
  SPEAKING: Volume2,
  ERROR: AlertCircle,
}

// Mode 2 — Mic button (STT only, returns text)
export function useMicInput() {
  const [recording, setRecording] = useState(false)
  const mediaRecorder = useRef(null)
  const chunks = useRef([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunks.current = []
      recorder.ondataavailable = (e) => chunks.current.push(e.data)
      recorder.start()
      mediaRecorder.current = recorder
      setRecording(true)
    } catch (err) {
      console.error('[Mic] Failed to start recording:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorder.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }

      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        const arrayBuffer = await blob.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

        try {
          const res = await fetch('/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'transcribe', audio: base64 }),
          })
          const data = await res.json()
          resolve(data.text || '')
        } catch {
          resolve(null)
        }

        recorder.stream.getTracks().forEach(t => t.stop())
        setRecording(false)
      }
      recorder.stop()
    })
  }, [])

  return { recording, startRecording, stopRecording }
}

// Mode 3 — Full voice overlay (WebRTC, GA Realtime API)
// onExchange fires after EACH complete turn (user spoke → Kiko responded)
// with { user: string, kiko: string } for that single exchange.
export default function KikoVoice({ open, onClose, onExchange }) {
  const [state, setState] = useState(STATES.IDLE)
  const [error, setError] = useState('')
  // All exchanges for overlay display
  const [exchanges, setExchanges] = useState([])
  // Current turn accumulators (reset after each response.done)
  const currentUserText = useRef('')
  const currentKikoText = useRef('')
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const localStreamRef = useRef(null)
  // Ref to onExchange so the DC message handler always has the latest
  const onExchangeRef = useRef(onExchange)
  useEffect(() => { onExchangeRef.current = onExchange }, [onExchange])

  useEffect(() => {
    if (open) {
      connect()
    }
    return () => disconnect()
  }, [open])

  // ESC to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const connect = async () => {
    setState(STATES.CONNECTING)
    setError('')
    setExchanges([])
    currentUserText.current = ''
    currentKikoText.current = ''

    try {
      // Step 1: Get ephemeral token from server
      const tokenRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'realtime-token' }),
      })

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}))
        throw new Error(errData.error || `Token request failed: ${tokenRes.status}`)
      }

      const tokenData = await tokenRes.json()
      const ephemeralKey = tokenData.value
      if (!ephemeralKey) {
        throw new Error(`No token value in response. Keys: ${Object.keys(tokenData).join(', ')}`)
      }

      // Step 2: Create RTCPeerConnection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Set up remote audio playback
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioRef.current = audioEl
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0] }

      // Add local mic track
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = micStream
      pc.addTrack(micStream.getTracks()[0])

      // Set up data channel for events
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.addEventListener('open', () => {
        setState(STATES.LISTENING)
      })

      dc.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data)

          // User finished speaking — capture their transcript for this turn
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            currentUserText.current += (event.transcript || '')
          }

          // Kiko streaming audio transcript delta
          if (event.type === 'response.audio_transcript.delta') {
            currentKikoText.current += (event.delta || '')
            setState(STATES.SPEAKING)
          }

          // User started speaking — switch to listening state
          if (event.type === 'input_audio_buffer.speech_started') {
            setState(STATES.LISTENING)
          }

          // Complete exchange — Kiko finished responding
          if (event.type === 'response.done') {
            const userText = currentUserText.current.trim()
            const kikoText = currentKikoText.current.trim()

            if (userText || kikoText) {
              // Add to overlay display
              setExchanges(prev => [...prev, { user: userText, kiko: kikoText }])
              // Fire callback to parent — adds to chat + saves to Supabase
              if (onExchangeRef.current) {
                onExchangeRef.current({ user: userText, kiko: kikoText })
              }
            }

            // Reset for next turn
            currentUserText.current = ''
            currentKikoText.current = ''
            setState(STATES.LISTENING)
          }

          if (event.type === 'error') {
            console.error('[Voice DC] Error:', event.error)
            setError(event.error?.message || 'Realtime error')
            setState(STATES.ERROR)
          }
        } catch {}
      })

      // Step 3: SDP exchange via server proxy
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'realtime-sdp',
          sdp: offer.sdp,
          token: ephemeralKey,
        }),
      })

      if (!sdpRes.ok) {
        const errData = await sdpRes.json().catch(() => ({}))
        throw new Error(errData.error || `SDP exchange failed: ${sdpRes.status}`)
      }

      const { sdp: answerSdp } = await sdpRes.json()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err) {
      console.error('[Voice] Connection error:', err)
      setError(err.message)
      setState(STATES.ERROR)
    }
  }

  const disconnect = () => {
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(sender => {
        if (sender.track) sender.track.stop()
      })
      pcRef.current.close()
      pcRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }
    setState(STATES.IDLE)
  }

  const handleClose = () => {
    disconnect()
    onClose()
  }

  if (!open) return null

  const StateIcon = STATE_ICONS[state]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.95)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="flex flex-col items-center gap-8 max-w-lg px-6">
        {/* State indicator */}
        <div className={`h-24 w-24 rounded-full flex items-center justify-center ${
          state === STATES.LISTENING ? 'bg-white/10 animate-pulse' :
          state === STATES.SPEAKING ? 'bg-white/15' :
          state === STATES.ERROR ? 'bg-red-500/20' :
          'bg-white/5'
        }`}>
          <StateIcon className={`h-10 w-10 text-white/60 ${
            state === STATES.CONNECTING || state === STATES.PROCESSING ? 'animate-spin' : ''
          }`} />
        </div>

        <p className="text-lg text-white/60 font-light">{STATE_LABELS[state]}</p>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 px-4 py-2 rounded-lg max-w-sm text-center">{error}</p>
        )}

        {/* Transcript history — all exchanges */}
        <div className="w-full space-y-4 max-h-[40vh] overflow-y-auto">
          {exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              {ex.user && (
                <div className="text-right">
                  <span className="text-[10px] text-white/20 block mb-1">You</span>
                  <p className="text-sm text-white/70 bg-white/5 rounded-xl px-4 py-2 inline-block">{ex.user}</p>
                </div>
              )}
              {ex.kiko && (
                <div className="text-left">
                  <span className="text-[10px] text-white/20 block mb-1">Kiko</span>
                  <p className="text-sm text-white/70 bg-white/5 rounded-xl px-4 py-2 inline-block">{ex.kiko}</p>
                </div>
              )}
            </div>
          ))}
          {/* Show in-progress Kiko response */}
          {currentKikoText.current && state === STATES.SPEAKING && (
            <div className="text-left">
              <span className="text-[10px] text-white/20 block mb-1">Kiko</span>
              <p className="text-sm text-white/70 bg-white/5 rounded-xl px-4 py-2 inline-block">{currentKikoText.current}▍</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
