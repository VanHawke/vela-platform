// src/components/kiko/KikoVoice.jsx — Voice mode UI (Phase 13)
// Uses useKikoVoice hook for streaming STT → Brain → TTS pipeline
// Visual design preserved from original: AuroraCanvas, waveform, status bar
import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import KikoWaveform from './KikoWaveform'
import AuroraCanvas from '../AuroraCanvas'
import T from '@/lib/theme'
import { useKikoVoice } from '@/hooks/useKikoVoice'

const BAR_COLORS = {
  connecting: '#F59E0B', listening: '#06D6A0', thinking: '#7C9CF6',
  speaking: '#06D6A0', error: '#FF5050', idle: 'rgba(255,255,255,0.18)',
}

const STATUS_LABELS = {
  connecting: 'Connecting...', listening: 'Listening', thinking: 'Thinking...',
  speaking: 'Speaking', error: 'Connection error', idle: '',
}

export default function KikoVoice({ onClose, user, onVoiceState }) {
  const {
    status, transcript, interimText, response,
    speakEnergy, stop,
  } = useKikoVoice({ user, onClose })

  const color = BAR_COLORS[status] || BAR_COLORS.idle
  const isSpeaking = status === 'speaking'

  // Feed state back to parent (drives parent's kiko_voice_state event dispatch)
  useEffect(() => {
    if (onVoiceState) onVoiceState({
      status,
      speaking: isSpeaking,
      thinking: status === 'thinking',
      energy: isSpeaking ? speakEnergy : 0,
    })
  }, [status, isSpeaking, speakEnergy, onVoiceState])

  const handleClose = useCallback(() => { stop(); onClose?.(); }, [stop, onClose])

  // Show transcript while listening, response while speaking/thinking
  let displayText = ''
  if (status === 'listening') displayText = interimText || transcript || ''
  else if (status === 'thinking') displayText = transcript || ''
  else if (status === 'speaking') displayText = response || ''

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>

      {/* Close button */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2, width: 32, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
      ><X size={14} /></button>

      {/* KikoWaveform — driven by real mic/speaker energy */}
      <div style={{
        position: 'relative', zIndex: 1, width: '95%', maxWidth: 1100, marginBottom: 12,
        overflow: 'visible', padding: '48px 0',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}>
        <KikoWaveform
          width={1100} height={140}
          volume={isSpeaking ? speakEnergy : 0}
          speaking={isSpeaking}
        />
      </div>

      {/* Live text display */}
      <div style={{
        position: 'relative', zIndex: 1, minHeight: 48, maxWidth: 700,
        padding: '0 24px', textAlign: 'center', marginBottom: 16,
      }}>
        <p style={{
          color: status === 'listening' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)',
          fontSize: 14, fontWeight: 300, fontFamily: T.font,
          lineHeight: 1.6, letterSpacing: '-0.02em',
          transition: 'color 0.3s',
        }}>
          {displayText || STATUS_LABELS[status] || ''}
        </p>
      </div>

      {/* Status bar */}
      <div style={{ position: 'relative', zIndex: 1, width: 220, height: 2.5, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 50,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}50`,
          animation: 'kikoBarPulse 2.5s ease-in-out infinite',
          transition: 'background 0.5s, box-shadow 0.5s',
        }} />
      </div>

      {/* Goodbye button */}
      <button onClick={handleClose} style={{
        position: 'relative', zIndex: 1, padding: '10px 28px', borderRadius: 50,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.25)', fontSize: 13, fontWeight: 300,
        cursor: 'pointer', fontFamily: T.font, transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      >Goodbye Kiko</button>

      <style>{`@keyframes kikoBarPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>,
    document.body
  )
}
