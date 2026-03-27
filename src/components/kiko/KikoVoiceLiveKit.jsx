// src/components/kiko/KikoVoiceLiveKit.jsx — Phase 13: LiveKit Voice Agent
// Replaces GPT-4o Realtime with LiveKit + Deepgram + Claude + Helena
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  useRoomContext,
  DisconnectButton,
} from '@livekit/components-react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'

const glass = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1.5px solid rgba(255,255,255,0.1)',
  boxShadow: '0 8px 32px rgba(255,255,255,0.04)',
}

// Inner component — must be inside LiveKitRoom
function VoiceAgent({ onDisconnect }) {
  const { state, audioTrack } = useVoiceAssistant()
  // state: 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking'

  const stateLabel = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    listening: 'Listening',
    thinking: 'Thinking...',
    speaking: 'Speaking',
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
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, padding: 32, minHeight: 280,
    }}>
      {/* Voice visualizer */}
      <div style={{ height: 80, width: '100%', display: 'flex', justifyContent: 'center' }}>
        {audioTrack ? (
          <BarVisualizer
            state={state}
            barCount={7}
            trackRef={audioTrack}
            style={{ width: 200, height: 80 }}
            options={{ minHeight: 4 }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 80,
          }}>
            {[0, 0.1, 0.05, 0.15, 0.08].map((d, i) => (
              <div key={i} style={{
                width: 5, borderRadius: 3, background: stateColor[state] || '#00D4AA',
                height: state === 'speaking' || state === 'listening' ? 30 : 6,
                minHeight: 6, transition: 'height 0.3s ease',
                animation: state === 'speaking' ? `kikoEq 0.7s ease-in-out ${d}s infinite alternate` : 'none',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* State label */}
      <div style={{
        fontSize: 14, fontWeight: 300, color: stateColor[state] || '#999',
        letterSpacing: '0.5px', textTransform: 'uppercase',
      }}>
        {stateLabel[state] || state}
      </div>

      {/* Disconnect button */}
      <button
        onClick={onDisconnect}
        style={{
          ...glass, borderRadius: 50, padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', color: '#ff6b6b', fontSize: 14, fontWeight: 400,
        }}
      >
        <PhoneOff size={16} /> End Session
      </button>

      <RoomAudioRenderer />
    </div>
  )
}

// Main exported component
export default function KikoVoiceLiveKit({ onClose }) {
  const [connectionState, setConnectionState] = useState('idle') // idle | connecting | connected
  const [token, setToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [error, setError] = useState(null)

  const connect = useCallback(async () => {
    setConnectionState('connecting')
    setError(null)
    try {
      const res = await fetch('/api/livekit-token', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to get voice token')
      const data = await res.json()
      setToken(data.token)
      setWsUrl(data.url)
      setConnectionState('connected')
    } catch (err) {
      setError(err.message)
      setConnectionState('idle')
    }
  }, [])

  const disconnect = useCallback(() => {
    setToken(null)
    setWsUrl(null)
    setConnectionState('idle')
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at 50% 30%, rgba(124,92,252,0.12) 0%, rgba(10,10,12,0.97) 60%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Close button */}
      <button
        onClick={onClose || disconnect}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
          padding: '8px 16px', color: '#999', cursor: 'pointer', fontSize: 13,
        }}
      >
        ✕ Close
      </button>

      {/* Title */}
      <div style={{ fontSize: 28, fontWeight: 300, color: '#fff', marginBottom: 8, letterSpacing: '-0.5px' }}>
        Kiko Voice
      </div>
      <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.4)', marginBottom: 32 }}>
        {connectionState === 'connected' ? 'Connected — speak naturally' : 'Tap to start voice session'}
      </div>

      {/* Main panel */}
      <div style={{ ...glass, borderRadius: 24, width: 360, minHeight: 320, overflow: 'hidden' }}>
        {connectionState === 'connected' && token && wsUrl ? (
          <LiveKitRoom
            serverUrl={wsUrl}
            token={token}
            connect={true}
            audio={true}
            video={false}
            onDisconnected={disconnect}
            style={{ height: '100%' }}
          >
            <VoiceAgent onDisconnect={disconnect} />
          </LiveKitRoom>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 24, padding: 48, minHeight: 280,
          }}>
            {/* Connect button */}
            <button
              onClick={connect}
              disabled={connectionState === 'connecting'}
              style={{
                width: 100, height: 100, borderRadius: '50%',
                background: connectionState === 'connecting'
                  ? 'rgba(124,92,252,0.3)'
                  : 'linear-gradient(135deg, #7C5CFC, #00D4AA)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 24px rgba(124,92,252,0.3)',
                transition: 'all 0.3s ease',
              }}
            >
              {connectionState === 'connecting' ? (
                <div style={{ color: '#fff', fontSize: 13 }}>Connecting...</div>
              ) : (
                <Mic size={36} color="#fff" />
              )}
            </button>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 300 }}>
              {error ? <span style={{ color: '#ff6b6b' }}>{error}</span> : 'Tap to connect'}
            </div>
          </div>
        )}
      </div>

      {/* Equalizer animation keyframes */}
      <style>{`
        @keyframes kikoEq {
          0% { height: 6px; }
          100% { height: 36px; }
        }
      `}</style>
    </div>
  )
}
