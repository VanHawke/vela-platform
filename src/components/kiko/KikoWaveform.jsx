// src/components/kiko/KikoWaveform.jsx — Kiko Sleek Waveform avatar (Caffeine)
// 9-bar bell-curve waveform · peach gradient · voice-reactive
// Replaces canvas-based purple/teal waveform with exact Round 2 Sleek design
// Integrates with window.__kikoFreqData for real audio in voice mode
import { useState, useRef, useEffect, memo } from 'react'
import T from '@/lib/theme'

// ── Audio Hooks — simulate speech cadence ──
// In voice mode, real audio data from window.__kikoFreqData overrides these
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

// ── Bell-curve envelope — exact Round 2 values ──
const BAR_ENVELOPE = [0.3, 0.5, 0.7, 0.85, 1, 0.85, 0.7, 0.5, 0.3]
const BAR_COUNT = BAR_ENVELOPE.length

/**
 * KikoWaveform — Sleek 9-bar waveform
 * 
 * Props (backwards-compatible with old canvas API):
 *   width, height — dimensions
 *   volume / energy — 0–1 audio level (for voice mode legacy compat)
 *   speaking — boolean (legacy compat, maps to state="speaking")
 *   mini — if true, renders smaller with glass shell
 *   onClick — click handler
 *   state — "idle" | "listening" | "speaking" (new API)
 */
function KikoWaveform({ width = 200, height = 60, volume = 0, speaking = false, energy = 0, mini = false, onClick, state: stateProp }) {
  // Backwards compat: derive state from legacy props if stateProp not given
  const state = stateProp || (speaking ? 'speaking' : (volume > 0.02 || energy > 0.02) ? 'listening' : 'idle')
  
  // Use real audio data from voice mode if available, otherwise simulated
  const hasRealAudio = typeof window !== 'undefined' && window.__kikoFreqData && window.__kikoFreqData.length > 0 && (volume > 0.02 || energy > 0.02)
  const realLevels = useRealAudioLevels(BAR_COUNT, hasRealAudio && state === 'speaking')
  const simLevels = useBarLevels(BAR_COUNT, !hasRealAudio && state === 'speaking')
  const barLevels = hasRealAudio ? realLevels : simLevels
  // Always run breathing animation — active in all states except speaking
  const listenLevel = useAudioLevel(state !== 'speaking')

  // Scale proportions from the Round 2 design (base size=72)
  // Scale from the Round 2 prototype: height / 0.45 / 72 (inverse of maxH ratio)
  const scale = height / 0.45 / 72
  const bw = Math.max(1.5, 72 * 0.04 * scale)
  const gap = 72 * 0.055 * scale
  const maxH = height * 0.85

  if (mini) {
    // Mini variant: glass circle shell with waveform inside
    const size = Math.min(width, height)
    const shellBw = Math.max(1.5, size * 0.04)
    const shellGap = size * 0.055
    const shellMaxH = size * 0.45
    const level = useAudioLevel(state === 'speaking')
    const active = state === 'speaking' || state === 'listening'
    const glowI = state === 'speaking' ? 0.08 + level * 0.18 : state === 'listening' ? 0.06 : 0

    return (
      <div onClick={onClick} style={{
        position: 'relative', width: size, height: size,
        borderRadius: 9999,
        background: T.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${active ? `rgba(255,224,194,${0.18 + (state === 'speaking' ? level * 0.25 : 0.1)})` : T.glassBorder}`,
        boxShadow: active
          ? `0 0 16px rgba(255,224,194,0.12), 0 2px 10px rgba(0,0,0,0.15), inset 3px 3px 0.5px -3.5px rgba(255,224,194,0.30), inset -3px -3px 0.5px -3.5px rgba(255,224,194,0.22), inset 1px 1px 1px -0.5px rgba(255,224,194,0.18), inset -1px -1px 1px -0.5px rgba(255,224,194,0.18)`
          : T.glassShadow,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 200ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Top highlight */}
        <div style={{
          position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
          background: `linear-gradient(90deg, transparent, rgba(255,224,194,${active ? 0.22 : 0.08}), transparent)`,
          pointerEvents: 'none', zIndex: 3,
        }} />
        {/* Reactive glow ring */}
        {active && <div style={{
          position: 'absolute', inset: -2, borderRadius: 9999,
          boxShadow: `0 0 ${8 + level * 14}px rgba(255,224,194,${glowI})`,
          pointerEvents: 'none',
        }} />}
        {/* Sleek Waveform bars */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: shellGap, height: shellMaxH,
        }}>
          {BAR_ENVELOPE.map((env, i) => {
            let h
            if (state === 'speaking') h = 0.08 + barLevels[i] * 0.92
            else h = env * (0.55 + listenLevel * 0.45)
            return (
              <div key={i} style={{
                width: shellBw, height: `${h * 100}%`, minHeight: 2, borderRadius: shellBw,
                background: `linear-gradient(180deg, ${T.accent} 0%, rgba(255,224,194,0.2) 100%)`,
                opacity: state === 'speaking' ? 0.5 + barLevels[i] * 0.5 : 0.4 + env * 0.4 + listenLevel * 0.2,
                transition: state === 'speaking' ? 'height 50ms linear, opacity 50ms linear' : 'all 120ms cubic-bezier(0.22,1,0.36,1)',
              }} />
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
        if (state === 'speaking') h = 0.08 + barLevels[i] * 0.92
        else h = env * (0.55 + listenLevel * 0.45)
        return (
          <div key={i} style={{
            width: bw, height: `${h * 100}%`, minHeight: 2, borderRadius: bw,
            background: `linear-gradient(180deg, ${T.accent} 0%, rgba(255,224,194,0.2) 100%)`,
            opacity: state === 'speaking' ? 0.5 + barLevels[i] * 0.5 : 0.4 + env * 0.4 + listenLevel * 0.2,
            transition: state === 'speaking' ? 'height 50ms linear, opacity 50ms linear' : 'all 120ms cubic-bezier(0.22,1,0.36,1)',
          }} />
        )
      })}
    </div>
  )
}

// Named exports for direct use
export { useBarLevels, useAudioLevel, BAR_ENVELOPE }
export default memo(KikoWaveform)
