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

// Mode 3 — Full voice overlay
export default function KikoVoice({ open, onClose, onTranscript }) {
  const [state, setState] = useState(STATES.IDLE)
  const [userTranscript, setUserTranscript] = useState('')
  const [kikoTranscript, setKikoTranscript] = useState('')
  const [error, setError] = useState('')
  const wsRef = useRef(null)
  const audioCtxRef = useRef(null)

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
      // Get ephemeral token
      const tokenRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'realtime-token' }),
      })
      const { session } = await tokenRes.json()
      if (!session?.client_secret?.value) throw new Error('No session token')

      const token = session.client_secret.value
      const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`, [
        'realtime', `openai-insecure-api-key.${token}`,
      ])

      ws.onopen = () => {
        setState(STATES.LISTENING)
        startMicCapture(ws)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'response.audio_transcript.delta') {
            setKikoTranscript(prev => prev + (data.delta || ''))
            setState(STATES.SPEAKING)
          }
          if (data.type === 'input_audio_buffer.speech_started') {
            setState(STATES.LISTENING)
          }
          if (data.type === 'conversation.item.input_audio_transcription.completed') {
            setUserTranscript(prev => prev + (data.transcript || '') + ' ')
          }
          if (data.type === 'response.done') {
            setState(STATES.LISTENING)
            if (onTranscript && kikoTranscript) {
              onTranscript({ user: userTranscript, kiko: kikoTranscript })
            }
          }
          if (data.type === 'error') {
            console.error('[Voice WS] Error:', data.error)
            setError(data.error?.message || 'WebSocket error')
            setState(STATES.ERROR)
          }
        } catch {}
      }

      ws.onerror = () => {
        setError('WebSocket connection failed')
        setState(STATES.ERROR)
      }

      ws.onclose = () => {
        if (state !== STATES.ERROR) setState(STATES.IDLE)
      }

      wsRef.current = ws
    } catch (err) {
      setError(err.message)
      setState(STATES.ERROR)
    }
  }

  const startMicCapture = async (ws) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 24000, channelCount: 1 } })
      const audioCtx = new AudioContext({ sampleRate: 24000 })
      audioCtxRef.current = audioCtx

      await audioCtx.audioWorklet.addModule('/audio-processor.js')
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = new AudioWorkletNode(audioCtx, 'audio-processor')

      processor.port.onmessage = (e) => {
        if (e.data.type === 'audio' && ws.readyState === WebSocket.OPEN) {
          const base64 = btoa(String.fromCharCode(...new Uint8Array(e.data.audio)))
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }))
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
    } catch (err) {
      console.error('[Voice] Mic capture error:', err)
      setError('Microphone access denied')
      setState(STATES.ERROR)
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
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
          <p className="text-sm text-red-400 bg-red-400/10 px-4 py-2 rounded-lg">{error}</p>
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
