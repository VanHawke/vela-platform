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
// Architecture matches OpenAI's official openai-realtime-console exactly:
// 1. Fetch ephemeral token from /api/voice (action: realtime-token)
// 2. Create RTCPeerConnection, add local mic track
// 3. Create SDP offer, exchange via /api/voice (action: realtime-sdp)
// 4. Events flow through RTCDataChannel, audio through WebRTC tracks
export default function KikoVoice({ open, onClose, onTranscript }) {
  const [state, setState] = useState(STATES.IDLE)
  const [userTranscript, setUserTranscript] = useState('')
  const [kikoTranscript, setKikoTranscript] = useState('')
  const [error, setError] = useState('')
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const localStreamRef = useRef(null)

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
    setUserTranscript('')
    setKikoTranscript('')

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

          if (event.type === 'response.audio_transcript.delta') {
            setKikoTranscript(prev => prev + (event.delta || ''))
            setState(STATES.SPEAKING)
          }
          if (event.type === 'input_audio_buffer.speech_started') {
            setState(STATES.LISTENING)
          }
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            setUserTranscript(prev => prev + (event.transcript || '') + ' ')
          }
          if (event.type === 'response.done') {
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
    // Close data channel
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    // Stop local mic tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    // Close peer connection
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(sender => {
        if (sender.track) sender.track.stop()
      })
      pcRef.current.close()
      pcRef.current = null
    }
    // Clean up audio element
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }
    setState(STATES.IDLE)
  }

  const handleClose = () => {
    // Capture transcripts before disconnect
    const ut = userTranscript
    const kt = kikoTranscript
    disconnect()
    if (onTranscript && (ut || kt)) {
      onTranscript({ user: ut, kiko: kt })
    }
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

        {/* Transcripts */}
        <div className="w-full space-y-4 max-h-[40vh] overflow-y-auto">
          {userTranscript && (
            <div className="text-right">
              <span className="text-[10px] text-white/20 block mb-1">You</span>
              <p className="text-sm text-white/70 bg-white/5 rounded-xl px-4 py-2 inline-block">{userTranscript}</p>
            </div>
          )}
          {kikoTranscript && (
            <div className="text-left">
              <span className="text-[10px] text-white/20 block mb-1">Kiko</span>
              <p className="text-sm text-white/70 bg-white/5 rounded-xl px-4 py-2 inline-block">{kikoTranscript}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
