// src/components/kiko/KikoVoiceLiveKit.jsx — Phase 13: LiveKit Voice Agent
// LiveKit + Deepgram STT + Claude Sonnet + Deepgram Aura-2 Helena
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
} from '@livekit/components-react'
import { Mic, PhoneOff, MessageSquare, X } from 'lucide-react'

const glass = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1.5px solid rgba(255,255,255,0.1)',
  boxShadow: '0 8px 32px rgba(255,255,255,0.04)',
}

// Inner component — reports voice state to parent
function VoiceAgent({ onDisconnect, onVoiceState }) {
  const { state, audioTrack } = useVoiceAssistant()

  useEffect(() => {
    if (onVoiceState) {
      onVoiceState({
        speaking: state === 'speaking',
        thinking: state === 'thinking',
        status: state,
      })
    }
  }, [state, onVoiceState])

  const stateLabel = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    listening: 'Listening',
    thinking: 'Thinking...',
    speaking: 'Kiko is speaking',
  }
  const stateColor = {
    disconnected: '#666',
    connecting: '#FFB347',
    listening: '#00D4AA',
    thinking: '#7C5CFC',
    speaking: '#00D4AA',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 32, minHeight: 260,
    }}>
      <div style={{
        height: 64, width: '100%',
        display: 'flex', justifyContent: 'center',
      }}>
        {audioTrack ? (
          <BarVisualizer
            state={state} barCount={7}
            trackRef={audioTrack}
            style={{ width: 180, height: 64 }}
            options={{ minHeight: 4 }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 6, height: 64,
          }}>
            {[0, 0.1, 0.05, 0.15, 0.08].map((d, i) => (
              <div key={i} style={{
                width: 5, borderRadius: 3,
                background: stateColor[state] || '#00D4AA',
                height: ['speaking','listening']
                  .includes(state) ? 28 : 6,
                minHeight: 6,
                transition: 'height 0.3s ease',
              }} />
            ))}
          </div>
        )}
      </div>

      <div style={{
        fontSize: 13, fontWeight: 300,
        color: stateColor[state] || '#999',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        {stateLabel[state] || state}
      </div>

      <button
        onClick={onDisconnect}
        style={{
          ...glass, borderRadius: 50,
          padding: '10px 20px',
          display: 'flex', alignItems: 'center',
          gap: 8, cursor: 'pointer',
          color: '#ff6b6b', fontSize: 13,
          fontWeight: 400, border: 'none',
        }}
      >
        <PhoneOff size={14} /> End
      </button>
      <RoomAudioRenderer />
    </div>
  )
}

// Main component — matches KikoFloat's expected interface
export default function KikoVoiceLiveKit({
  onClose, user, mini, onVoiceState, onShowPrompt
}) {
  const [phase, setPhase] = useState('idle')
  const [token, setToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [error, setError] = useState(null)

  // Auto-connect on mount
  useEffect(() => { connect() }, [])

  const connect = useCallback(async () => {
    setPhase('connecting')
    setError(null)
    try {
      const res = await fetch('/api/livekit-token', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Token error')
      const data = await res.json()
      setToken(data.token)
      setWsUrl(data.url)
      setPhase('connected')
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }, [])

  const disconnect = useCallback(() => {
    setToken(null)
    setWsUrl(null)
    setPhase('idle')
    if (onClose) onClose()
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at 50% 30%, '
        + 'rgba(124,92,252,0.12) 0%, '
        + 'rgba(10,10,12,0.97) 60%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 16,
        left: 16, right: 16,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        {onShowPrompt && (
          <button onClick={onShowPrompt} style={{
            ...glass, borderRadius: 8,
            padding: '8px 14px',
            display: 'flex', alignItems: 'center',
            gap: 6, cursor: 'pointer',
            color: '#999', fontSize: 12,
            border: 'none',
          }}>
            <MessageSquare size={14} /> Text
          </button>
        )}
        <button onClick={onClose} style={{
          ...glass, borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer', color: '#999',
          fontSize: 12, border: 'none',
        }}>
          <X size={14} />
        </button>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 26, fontWeight: 300,
        color: '#fff', marginBottom: 4,
        letterSpacing: '-0.5px',
      }}>
        Kiko Voice
      </div>
      <div style={{
        fontSize: 12, fontWeight: 300,
        color: 'rgba(255,255,255,0.35)',
        marginBottom: 28,
      }}>
        {phase === 'connected'
          ? 'Connected — speak naturally'
          : phase === 'connecting'
          ? 'Connecting to Helena...'
          : 'Tap to start'}
      </div>

      {/* Main panel */}
      <div style={{
        ...glass, borderRadius: 20,
        width: 340, minHeight: 300,
        overflow: 'hidden',
      }}>
        {phase === 'connected' && token && wsUrl ? (
          <LiveKitRoom
            serverUrl={wsUrl}
            token={token}
            connect={true}
            audio={true}
            video={false}
            onDisconnected={disconnect}
            style={{ height: '100%' }}
          >
            <VoiceAgent
              onDisconnect={disconnect}
              onVoiceState={onVoiceState}
            />
          </LiveKitRoom>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 20, padding: 48, minHeight: 260,
          }}>
            <button
              onClick={connect}
              disabled={phase === 'connecting'}
              style={{
                width: 90, height: 90,
                borderRadius: '50%',
                background: phase === 'connecting'
                  ? 'rgba(124,92,252,0.3)'
                  : 'linear-gradient(135deg, #7C5CFC, #00D4AA)',
                border: 'none', cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(124,92,252,0.3)',
                transition: 'all 0.3s ease',
              }}
            >
              {phase === 'connecting' ? (
                <div style={{
                  color: '#fff', fontSize: 11,
                }}>
                  Connecting...
                </div>
              ) : (
                <Mic size={32} color="#fff" />
              )}
            </button>
            {error && (
              <div style={{
                fontSize: 12,
                color: '#ff6b6b',
              }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
