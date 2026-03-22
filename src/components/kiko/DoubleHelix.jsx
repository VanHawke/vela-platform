import { useEffect, useRef, memo } from 'react'

// Double Helix — Kiko's signature avatar animation
// Twin purple/teal waveforms with white centre thread
// Reacts to energy (0-1) and pitch (0-1) for real-time voice response
function DoubleHelix({ width = 400, height = 60, speaking = false, energy = 0, pitch = 0, mini = false, onClick }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const tRef = useRef(0)
  const eRef = useRef(0) // smoothed energy
  const pRef = useRef(0) // smoothed pitch

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const draw = () => {
      tRef.current += 0.016
      const t = tRef.current
      // Smooth interpolation — read real-time audio from window globals when speaking
      const realEnergy = sp ? (window.__kikoAudioEnergy || 0) : 0
      const realPitch = sp ? (window.__kikoAudioPitch || 0) : 0
      eRef.current += ((realEnergy || energy) - eRef.current) * 0.12
      pRef.current += ((realPitch || pitch) - pRef.current) * 0.08
      const e = eRef.current, p = pRef.current
      const sp = speaking
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2, cy = height / 2

      const layers = sp ? Math.round(3 + e * 3) : (mini ? 2 : 3)
      const speed = sp ? 2 + p * 1.5 : 1.0
      const ampBase = sp ? 0.4 + e * 0.5 : (mini ? 0.18 : 0.22)
      const freqMod = sp ? 1 + p * 0.8 : 1

      for (let l = 0; l < layers; l++) {
        const ph = l * 0.45 + t * speed
        const am = ampBase + (sp ? Math.sin(t * 2.8 + l * 0.5) * (0.1 + e * 0.2) : Math.sin(t * 0.4 + l) * 0.06)

        // Top wave — purple
        ctx.beginPath()
        for (let i = 0; i < width; i++) {
          const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
          const y = cy - 5 - l * 2
            + Math.sin(i * (14 * freqMod / width) + ph) * env * (height * 0.3) * am
            + Math.sin(i * (5.5 * freqMod / width) + ph * 0.7) * env * (height * 0.17) * am
            + (sp ? Math.sin(i * (25 * freqMod / width) + t * 5 + l) * env * (height * 0.04 + e * height * 0.06) * am : 0)
          i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
        }
        const la = sp ? 0.04 + l * 0.025 + e * 0.03 : (mini ? 0.012 + l * 0.008 : 0.018 + l * 0.012)
        ctx.strokeStyle = `rgba(139,108,246,${la})`
        ctx.lineWidth = sp ? (8 + e * 6 - l * 1.2) : (mini ? 3 - l * 0.6 : 5 - l * 1)
        ctx.lineCap = 'round'
        ctx.stroke()

        // Bottom wave — teal
        ctx.beginPath()
        for (let i = 0; i < width; i++) {
          const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
          const y = cy + 5 + l * 2
            - Math.sin(i * (14 * freqMod / width) + ph + 0.35) * env * (height * 0.3) * am
            - Math.sin(i * (5.5 * freqMod / width) + ph * 0.7 + 0.5) * env * (height * 0.17) * am
            - (sp ? Math.sin(i * (25 * freqMod / width) + t * 5 + l + 1) * env * (height * 0.04 + e * height * 0.06) * am : 0)
          i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
        }
        const la2 = sp ? 0.035 + l * 0.02 + e * 0.025 : (mini ? 0.01 + l * 0.006 : 0.014 + l * 0.009)
        ctx.strokeStyle = `rgba(6,214,160,${la2})`
        ctx.lineWidth = sp ? (8 + e * 6 - l * 1.2) : (mini ? 3 - l * 0.6 : 5 - l * 1)
        ctx.stroke()

        // Pink shimmer on high energy
        if (sp && e > 0.5 && l >= 2) {
          ctx.beginPath()
          for (let i = 0; i < width; i++) {
            const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
            const y = cy + Math.sin(i * (18 * freqMod / width) + ph + l * 0.4) * env * (height * 0.22) * am * (0.3 + e * 0.4)
            i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
          }
          ctx.strokeStyle = `rgba(236,72,153,${0.01 + (e - 0.5) * 0.06})`
          ctx.lineWidth = 6 + e * 4 - l
          ctx.stroke()
        }
      }

      // White centre thread
      ctx.beginPath()
      const wg = ctx.createLinearGradient(0, 0, width, 0)
      const wa = sp ? 0.15 + e * 0.55 : (mini ? 0.1 : 0.15)
      wg.addColorStop(0, 'transparent')
      wg.addColorStop(0.08, `rgba(255,255,255,${wa * 0.5})`)
      wg.addColorStop(0.3, `rgba(255,255,255,${0.3 + e * 0.5})`)
      wg.addColorStop(0.5, `rgba(255,255,255,${sp ? 0.4 + e * 0.5 : (mini ? 0.2 : 0.3)})`)
      wg.addColorStop(0.7, `rgba(255,255,255,${(0.25 + e * 0.4) * 0.85})`)
      wg.addColorStop(0.92, `rgba(255,255,255,${wa * 0.4})`)
      wg.addColorStop(1, 'transparent')
      const wAm = sp ? 0.4 + e * 0.45 + Math.sin(t * 2.8) * (0.05 + e * 0.15) : (mini ? 0.18 : 0.22)
      const wF = sp ? 1 + p * 0.8 : 1
      for (let i = 0; i < width; i++) {
        const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
        const y = cy
          + Math.sin(i * (14 * wF / width) + t * (sp ? 2 + p * 1.5 : 1)) * env * (height * 0.3) * wAm
          + Math.sin(i * (5.5 * wF / width) + t * (sp ? 2 + p * 1.5 : 1) * 0.7) * env * (height * 0.17) * wAm
          + (sp ? Math.sin(i * (25 * wF / width) + t * 5) * env * (height * 0.03 + e * height * 0.05) * wAm : 0)
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
      }
      ctx.strokeStyle = wg
      ctx.lineWidth = sp ? 0.8 + e * 0.8 : (mini ? 0.5 : 0.7)
      ctx.stroke()

      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [width, height, speaking, energy, pitch, mini])

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{ display: 'block', cursor: onClick ? 'pointer' : 'default' }}
    />
  )
}

export default memo(DoubleHelix)
