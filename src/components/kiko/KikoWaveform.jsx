// src/components/kiko/KikoWaveform.jsx — Kiko Filament Waveform avatar (Caffeine)
// 11-bar Filament waveform · peach gradient · glow tips on speech peaks
// Sharper bell-curve with whisper-tail outer bars
// Integrates with window.__kikoFreqData for real audio in voice mode
import { useState, useRef, useEffect, memo } from 'react'
import T from '@/lib/theme'

// ── Audio Hooks — simulate speech cadence ──
function useBarLevels(count, active) {
  const [levels, setLevels] = useState(() => new Array(count).fill(0))
  const rafRef = useRef(null)
  const tRef = useRef(0)

  useEffect(() => {
    if (!active) { setLevels(new Array(count).fill(0)); return }
    let running = true
    const tick = () => {
      if (!running) return
      tRef.current += 0.04
      const t = tRef.current
      const next = []
      for (let i = 0; i < count; i++) {
        const ph = i * 1.1
        const raw = Math.sin(t * 5.5 + ph) * 0.3 + Math.sin(t * 8.8 + ph * 0.7) * 0.25 +
          Math.sin(t * 13.2 + ph * 1.3) * 0.15 + Math.sin(t * 2.3 + ph * 0.4) * 0.2 + Math.random() * 0.1
        const pause = Math.sin(t * 0.8) > 0.55 ? 0.35 : 1
        next.push(Math.max(0.05, Math.min(1, raw * pause)))
      }
      setLevels(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [active, count])
  return levels
}

function useAudioLevel(active) {
  const [level, setLevel] = useState(0)
  const rafRef = useRef(null)
  const tRef = useRef(0)

  useEffect(() => {
    if (!active) { setLevel(0); return }
    let running = true
    const tick = () => {
      if (!running) return
      tRef.current += 0.035
      const t = tRef.current
      const raw = Math.sin(t * 4.2) * 0.3 + Math.sin(t * 7.1) * 0.2 +
        Math.sin(t * 11.3) * 0.15 + Math.sin(t * 2.1) * 0.2 + Math.random() * 0.15
      const pause = Math.sin(t * 0.7) > 0.6 ? 0.3 : 1
      setLevel(Math.max(0, Math.min(1, raw * pause)))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [active])
  return level
}

// ── Real audio integration — reads from window.__kikoFreqData ──
function useRealAudioLevels(count, active) {
  const [levels, setLevels] = useState(() => new Array(count).fill(0))
  const rafRef = useRef(null)

  useEffect(() => {
    if (!active) { setLevels(new Array(count).fill(0)); return }
    let running = true
    const tick = () => {
      if (!running) return
      const freq = window.__kikoFreqData
      if (freq && freq.length > 0) {
        const next = []
        for (let i = 0; i < count; i++) {
          const fi = Math.floor((i / count) * freq.length)
          const fv = (freq[fi] || 0) / 255
          next.push(Math.max(0.05, fv))
        }
        setLevels(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [active, count])
  return levels
}

// ── Filament envelope — 11 bars, sharper bell with whisper tails ──
const BAR_ENVELOPE = [0.12, 0.25, 0.45, 0.68, 0.88, 1, 0.88, 0.68, 0.45, 0.25, 0.12]
const BAR_COUNT = BAR_ENVELOPE.length

/**
 * KikoWaveform — Filament 11-bar waveform
 * 
 * Props (backwards-compatible with old canvas API):
 *   width, height — dimensions
 *   volume / energy — 0–1 audio level (for voice mode legacy compat)
 *   speaking — boolean (legacy compat, maps to state="speaking")
 *   mini — if true, renders smaller with glass shell
 *   onClick — click handler
 *   state — "idle" | "listening" | "speaking" (new API)
 */
function KikoWaveform({ width = 200, height = 60, volume = 0, speaking = false, energy = 0, mini = false, onClick, state: stateProp, lightBars = false }) {
  // Backwards compat: derive state from legacy props if stateProp not given
  const state = stateProp || (speaking ? 'speaking' : (volume > 0.02 || energy > 0.02) ? 'listening' : 'idle')
  
  // Use real audio data from voice mode if available, otherwise simulated
  const hasRealAudio = typeof window !== 'undefined' && window.__kikoFreqData && window.__kikoFreqData.length > 0 && (volume > 0.02 || energy > 0.02)
  const realLevels = useRealAudioLevels(BAR_COUNT, hasRealAudio && state === 'speaking')
  const simLevels = useBarLevels(BAR_COUNT, !hasRealAudio && state === 'speaking')
  const barLevels = hasRealAudio ? realLevels : simLevels
  // Avatar should ONLY animate when Kiko is speaking. When idle/listening, bars are still.
  // Sunny spec 2026-04-12: "kiko avatar should only be moving/animating when she is speaking"
  const listenLevel = 0

  // Filament proportions — thinner bars, tighter gap
  const scale = height / 0.46 / 72
  const bw = Math.max(1, 72 * 0.015 * scale)
  const gap = 72 * 0.038 * scale
  const maxH = height * 0.46

  if (mini) {
    // Mini variant: glass circle shell with waveform inside
    const size = Math.min(width, height)
    const shellBw = Math.max(1, size * 0.015)
    const shellGap = size * 0.038
    const shellMaxH = size * 0.46
    // Avatar should ONLY animate when Kiko is actually speaking.
    // Sunny spec 2026-04-12: still bars during idle/listening.
    const level = useAudioLevel(state === 'speaking')
    const active = state === 'speaking'  // was: speaking || listening — now ONLY speaking
    const glowI = state === 'speaking' ? 0.08 + level * 0.18 : state === 'listening' ? 0.06 : 0

    return (
      <div onClick={onClick} style={{
        position: 'relative', width: size, height: size,
        borderRadius: 9999,
        background: T.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${active ? `rgba(0,0,0,${0.12 + (state === 'speaking' ? level * 0.15 : 0.06)})` : T.glassBorder}`,
        boxShadow: active
          ? `0 0 16px rgba(0,0,0,0.08), 0 2px 10px rgba(0,0,0,0.15), inset 3px 3px 0.5px -3.5px rgba(0,0,0,0.10), inset -3px -3px 0.5px -3.5px rgba(0,0,0,0.10), inset 1px 1px 1px -0.5px rgba(0,0,0,0.08), inset -1px -1px 1px -0.5px rgba(0,0,0,0.08)`
          : T.glassShadow,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 200ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Top highlight */}
        <div style={{
          position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
          background: `linear-gradient(90deg, transparent, rgba(0,0,0,${active ? 0.10 : 0.04}), transparent)`,
          pointerEvents: 'none', zIndex: 3,
        }} />
        {/* Reactive glow ring */}
        {active && <div style={{
          position: 'absolute', inset: -2, borderRadius: 9999,
          boxShadow: `0 0 ${12 + level * 20}px rgba(0,0,0,${glowI * 0.5})`,
          pointerEvents: 'none',
        }} />}
        {/* Filament Waveform bars */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: shellGap, height: shellMaxH,
        }}>
          {BAR_ENVELOPE.map((env, i) => {
            let h
            if (state === 'speaking') h = 0.06 + barLevels[i] * 0.94
            else h = 0.06  // FLAT when not speaking — just the minimum stub
            const tipGlow = state === 'speaking' && barLevels[i] > 0.4
            return (
              <div key={i} style={{ position: 'relative', height: `${h * 100}%`, minHeight: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Glow tip — Filament signature: blooms on speech peaks */}
                {tipGlow && (
                  <div style={{
                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                    width: shellBw * 4, height: shellBw * 4,
                    borderRadius: 9999,
                    background: lightBars ? 'rgba(6,214,160,0.9)' : T.accent,
                    filter: 'blur(2.5px)',
                    opacity: (barLevels[i] - 0.4) * 0.5,
                  }} />
                )}
                <div style={{
                  width: shellBw, height: '100%', borderRadius: shellBw,
                  background: lightBars
                    ? `linear-gradient(180deg, rgba(6,214,160,0.9) 0%, rgba(255,255,255,0.3) 100%)`
                    : `linear-gradient(180deg, ${T.accent} 0%, rgba(0,0,0,0.06) 100%)`,
                  opacity: state === 'speaking' ? 0.45 + barLevels[i] * 0.55 : 0.3 + env * 0.55,
                  transition: state === 'speaking' ? 'height 50ms linear, opacity 50ms linear' : 'all 500ms cubic-bezier(0.22,1,0.36,1)',
                }} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Full-size bare waveform (homepage hero, voice page)
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap, height, width,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {BAR_ENVELOPE.map((env, i) => {
        let h
        if (state === 'speaking') h = 0.06 + barLevels[i] * 0.94
        else h = 0.06  // FLAT when not speaking — Sunny spec 2026-04-12
        const tipGlow = state === 'speaking' && barLevels[i] > 0.4
        return (
          <div key={i} style={{ position: 'relative', height: `${h * 100}%`, minHeight: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Glow tip — Filament signature */}
            {tipGlow && (
              <div style={{
                position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                width: bw * 4, height: bw * 4,
                borderRadius: 9999,
                background: T.accent,
                filter: 'blur(2.5px)',
                opacity: (barLevels[i] - 0.4) * 0.5,
              }} />
            )}
            <div style={{
              width: bw, height: '100%', borderRadius: bw,
              background: `linear-gradient(180deg, ${T.accent} 0%, rgba(0,0,0,0.06) 100%)`,
              opacity: state === 'speaking' ? 0.45 + barLevels[i] * 0.55 : 0.3 + env * 0.55,
              transition: state === 'speaking' ? 'height 50ms linear, opacity 50ms linear' : 'all 500ms cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>
        )
      })}
    </div>
  )
}

// Named exports for direct use
export { useBarLevels, useAudioLevel, BAR_ENVELOPE }
export default memo(KikoWaveform)
