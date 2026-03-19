// KikoVoice.jsx — ElevenLabs Conversational AI + Claude (kiko.js) as LLM
// Replaces OpenAI Realtime API — eliminates email refusal problem entirely
// Voice: Serafina (4tRn1lSkEn13EVTuqb0g)
// Agent: agent_8301km40xd2hfftsz35vjhrp35qc

import { useState, useEffect, useRef, useCallback } from 'react'
import { Conversation } from '@11labs/client'
import { MicOff, X, MessageSquare } from 'lucide-react'

// Kiko symbol component (reused from original)
const KikoSymbol = ({ size = 48, color = '#fff', animate = 'idle' }) => {
  const r = size * 0.32, cx = size / 2, cy = size / 2
  const offsets = [
    [-r, -r * 0.3], [r * 0.3, -r], [r, r * 0.3], [-r * 0.3, r],
  ]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {offsets.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx} cy={cy + dy} r={size * 0.09} fill={color} opacity={0.85}>
          {animate === 'streaming' && (
            <animate attributeName="opacity" values="0.4;1;0.4" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />
          )}
          {animate === 'thinking' && (
            <animate attributeName="r" values={`${size * 0.09};${size * 0.13};${size * 0.09}`} dur="1.5s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
          )}
        </circle>
      ))}
    </svg>
  )
}

const AGENT_ID = 'agent_8301km40xd2hfftsz35vjhrp35qc'

export default function KikoVoice({ onClose, onShowPrompt, addMessage }) {
  const [status, setStatus]       = useState('connecting')  // connecting | live | disconnected
  const [speaking, setSpeaking]   = useState(false)        // agent is speaking
  const [listening, setListening] = useState(false)        // agent is listening (user's turn)
  const [transcript, setTranscript] = useState('')         // user's speech
  const [kikoText, setKikoText]   = useState('')           // kiko's response
  const [error, setError]         = useState('')

  const conversationRef = useRef(null)
  const kikoTextAccum   = useRef('')
  const mountedRef      = useRef(false)

  // Start ElevenLabs conversation session
  const startSession = useCallback(async () => {
    try {
      setStatus('connecting')
      setError('')

      // Request mic permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const conversation = await Conversation.startSession({
        agentId: AGENT_ID,
        onConnect: () => {
          console.log('[Kiko EL] Connected')
          setStatus('live')
          setListening(true)
        },
        onDisconnect: () => {
          console.log('[Kiko EL] Disconnected')
          setStatus('disconnected')
          setSpeaking(false)
          setListening(false)
        },
        onError: (err) => {
          console.error('[Kiko EL] Error:', err)
          setError(err?.message || 'Connection error')
          setStatus('disconnected')
        },
        onModeChange: ({ mode }) => {
          console.log('[Kiko EL] Mode:', mode)
          setSpeaking(mode === 'speaking')
          setListening(mode === 'listening')
          if (mode === 'listening') {
            // Agent finished speaking — add full response to history
            if (kikoTextAccum.current && addMessage) {
              addMessage('kiko', kikoTextAccum.current)
            }
            setTranscript('')  // clear user transcript for next turn
          }
        },
        onMessage: (msg) => {
          // msg.source: 'user' or 'ai'
          // msg.message: the text content
          console.log('[Kiko EL] Message:', msg.source, (msg.message || '').slice(0, 60))
          if (msg.source === 'user') {
            setTranscript(msg.message || '')
            setKikoText('')  // clear previous response
            kikoTextAccum.current = ''
            if (msg.message && addMessage) addMessage('user', msg.message)
          } else if (msg.source === 'ai') {
            kikoTextAccum.current += (msg.message || '')
            setKikoText(kikoTextAccum.current)
          }
        },
      })

      conversationRef.current = conversation
      console.log('[Kiko EL] Session started, ID:', conversation.getId())

    } catch (err) {
      console.error('[Kiko EL] Start failed:', err)
      setError(err?.message || 'Failed to start voice session')
      setStatus('disconnected')
    }
  }, [addMessage])

  // Disconnect handler
  const disconnect = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession()
      conversationRef.current = null
    }
    setStatus('disconnected')
    setSpeaking(false)
    setListening(false)
  }, [])

  // Auto-start on mount, cleanup on unmount (StrictMode safe)
  useEffect(() => {
    if (mountedRef.current) return  // prevent double-mount in React StrictMode
    mountedRef.current = true
    startSession()
    return () => {
      mountedRef.current = false
      if (conversationRef.current) {
        conversationRef.current.endSession().catch(() => {})
        conversationRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close handler — disconnect then call parent
  const handleClose = useCallback(async () => {
    await disconnect()
    if (onClose) onClose()
  }, [disconnect, onClose])

  // UI state
  const avatarAnimate = speaking ? 'none' : status === 'live' && listening ? 'streaming' : status === 'connecting' ? 'thinking' : 'idle'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font, system-ui)', color: '#1a1a1a',
    }}>
      {/* Close button */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 16, right: 16,
        background: 'none', border: 'none', cursor: 'pointer', padding: 8,
      }}>
        <X size={20} color="#666" />
      </button>

      {/* Status label */}
      <div style={{
        position: 'absolute', top: 24,
        fontSize: 13, color: '#999', letterSpacing: '0.02em',
      }}>
        {status === 'connecting' ? 'Connecting...'
          : status === 'live' && speaking ? 'Kiko is speaking'
          : status === 'live' && listening ? 'Speak freely'
          : status === 'disconnected' && error ? error
          : status === 'disconnected' ? 'Disconnected'
          : 'Starting...'}
      </div>

      {/* Avatar */}
      <div style={{
        width: 160, height: 160, borderRadius: 40,
        background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: speaking
          ? '0 0 0 6px rgba(0,0,0,0.08), 0 0 40px rgba(0,0,0,0.15)'
          : '0 0 0 4px rgba(0,0,0,0.05), 0 0 20px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.3s',
      }}>
        <KikoSymbol size={68} color="rgba(255,255,255,0.92)" animate={avatarAnimate} />
      </div>

      {/* User transcript */}
      {transcript && (
        <div style={{
          marginTop: 24, padding: '8px 16px', maxWidth: '80%',
          fontSize: 14, color: '#666', textAlign: 'center',
          background: 'rgba(0,0,0,0.04)', borderRadius: 12,
        }}>
          {transcript}
        </div>
      )}

      {/* Kiko response text */}
      {kikoText && (
        <div style={{
          marginTop: 12, padding: '12px 20px', maxWidth: '80%', maxHeight: 200,
          overflowY: 'auto', fontSize: 14, color: '#333', textAlign: 'center',
          background: 'rgba(255,255,255,0.8)', borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {kikoText}
        </div>
      )}

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', bottom: 32,
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        {/* Text input for typing */}
        {onShowPrompt && (
          <button onClick={onShowPrompt} style={{
            width: 44, height: 44, borderRadius: 12,
            border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageSquare size={18} color="#666" />
          </button>
        )}

        {/* Reconnect button if disconnected */}
        {status === 'disconnected' && (
          <button onClick={() => { setError(''); startSession() }} style={{
            padding: '10px 20px', borderRadius: 12,
            border: 'none', cursor: 'pointer',
            background: '#1A1A1A', color: '#fff',
            fontSize: 13, fontWeight: 500,
          }}>
            Reconnect
          </button>
        )}
      </div>
    </div>
  )
}
