// src/components/kiko/KikoVoiceLiveKit.jsx — Phase 13: LiveKit Voice with Beautiful UI
// Same ribbon/glassmorphism/dark void as original KikoVoice — powered by LiveKit
import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
} from '@livekit/components-react'
import { X } from 'lucide-react'
import DoubleHelix from './DoubleHelix'

// Inner component — must be inside LiveKitRoom
function VoiceUI({ onClose, onVoiceState }) {
  const { state, audioTrack, agentTranscriptions, userTranscriptions } = useVoiceAssistant()
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')

  // Map LiveKit states to Kiko UI states
  const speaking = state === 'speaking'
  const thinking = state === 'thinking'

  // Track transcriptions
  useEffect(() => {
    if (userTranscriptions?.length) {
      const last = userTranscriptions[userTranscriptions.length - 1]
      if (last?.text) setTranscript(last.text)
    }
  }, [userTranscriptions])

  useEffect(() => {
    if (agentTranscriptions?.length) {
      const last = agentTranscriptions[agentTranscriptions.length - 1]
      if (last?.text) setKikoText(last.text)
    }
  }, [agentTranscriptions])

  // Report state to parent
  useEffect(() => {
    if (onVoiceState) onVoiceState({
      status: state, speaking, thinking, transcript, kikoText,
      energy: 0, pitch: 0,
    })
  }, [state, speaking, thinking, transcript, kikoText])

  const showRings = speaking || thinking
  const avBg = speaking
    ? 'radial-gradient(circle at 40% 35%, rgba(10,28,24,0.95), rgba(8,8,12,1))'
    : thinking
    ? 'radial-gradient(circle at 40% 35%, rgba(22,18,36,0.95), rgba(10,10,14,1))'
    : 'radial-gradient(circle at 40% 35%, rgba(18,18,26,0.95), rgba(10,10,14,1))'

  const modeLabel = state === 'speaking' ? 'Kiko Speaking'
    : state === 'thinking' ? 'Thinking...'
    : state === 'listening' ? 'Listening'
    : state === 'connecting' ? 'Connecting...'
    : 'Connected'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      {/* Frosted glass background */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,20,0.85)', backdropFilter: 'blur(48px) saturate(1.8)', WebkitBackdropFilter: 'blur(48px) saturate(1.8)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.01) 50%)', pointerEvents: 'none' }} />

      {/* Stage */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px 32px', zIndex: 1 }}>

        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
          <X size={14} />
        </button>

        {/* Mode pill */}
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 50, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {modeLabel}
        </div>

        {/* Avatar with rings */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {showRings && <>
            <div style={{ position: 'absolute', inset: -13, borderRadius: 50, border: '1.5px solid rgba(255,255,255,0.06)', animation: 'pulse 2.2s ease-in-out infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: -26, borderRadius: 62, border: '1.5px solid rgba(255,255,255,0.07)', animation: 'pulse 2.2s ease-in-out infinite 0.5s', pointerEvents: 'none' }} />
          </>}
          <div style={{ width: 156, height: 156, borderRadius: 38, background: avBg, border: '1.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', transition: 'background 0.5s' }}>
            <DoubleHelix width={140} height={80} speaking={speaking} energy={0} pitch={0} />
          </div>
        </div>

        {/* Live transcript */}
        <div style={{ textAlign: 'center', maxWidth: 360, minHeight: 60, marginBottom: 24 }}>
          {transcript && <p style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.8)', margin: '0 0 7px', lineHeight: 1.35 }}>{transcript}</p>}
          {kikoText && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.55 }}>{kikoText}</p>}
        </div>

        {/* Goodbye button */}
        <button onClick={onClose} style={{
          padding: '10px 28px', borderRadius: 50,
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.35)', fontSize: 13,
          fontWeight: 400, cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          Goodbye Kiko
        </button>
      </div>

      <RoomAudioRenderer />

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

// Main component — auto-connects, renders via portal
export default function KikoVoiceLiveKit({
  onClose, user, mini, onVoiceState, onShowPrompt,
  headless, micStream, onVoiceMessage
}) {
  if (headless) return null

  const [token, setToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [error, setError] = useState(null)

  // Auto-connect on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/livekit-token', { method: 'POST' })
        if (!res.ok) throw new Error('Token failed')
        const data = await res.json()
        setToken(data.token)
        setWsUrl(data.url)
      } catch (err) {
        setError(err.message)
      }
    })()
  }, [])

  const handleClose = useCallback(() => {
    setToken(null)
    setWsUrl(null)
    if (onClose) onClose()
  }, [onClose])

  if (!token || !wsUrl) {
    // Loading state — same beautiful UI, connecting message
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,20,0.85)', backdropFilter: 'blur(48px) saturate(1.8)', WebkitBackdropFilter: 'blur(48px) saturate(1.8)' }} />
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <button onClick={handleClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
            <X size={14} />
          </button>
          <div style={{ width: 156, height: 156, borderRadius: 38, background: 'radial-gradient(circle at 40% 35%, rgba(18,18,26,0.95), rgba(10,10,14,1))', border: '1.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', marginBottom: 28 }}>
            <DoubleHelix width={140} height={80} speaking={false} energy={0} pitch={0} />
          </div>
          <p style={{ fontSize: 14, color: error ? '#C62828' : 'rgba(255,255,255,0.35)', margin: 0 }}>
            {error || 'Connecting to Kiko...'}
          </p>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <LiveKitRoom
      serverUrl={wsUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
    >
      <VoiceUI onClose={handleClose} onVoiceState={onVoiceState} />
    </LiveKitRoom>,
    document.body
  )
}
