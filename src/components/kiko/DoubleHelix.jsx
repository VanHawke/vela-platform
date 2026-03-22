import { useEffect, useRef, memo } from 'react'

function DoubleHelix({ width = 400, height = 60, speaking = false, energy = 0, pitch = 0, mini = false, onClick }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const tRef = useRef(0)
  const eRef = useRef(0)
  const pRef = useRef(0)
  const propsRef = useRef({ speaking, energy, pitch, mini })

  // Always keep props ref up to date
  propsRef.current = { speaking, energy, pitch, mini }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    let running = true

    function draw() {
      if (!running) return
      tRef.current += 0.016
      const t = tRef.current
      const { speaking: sp, energy: propE, pitch: propP, mini: m } = propsRef.current

      // Read real-time audio from window globals when Kiko is speaking
      const realE = sp ? (window.__kikoAudioEnergy || propE || 0) : 0
      const realP = sp ? (window.__kikoAudioPitch || propP || 0) : 0
      eRef.current += (realE - eRef.current) * 0.12
      pRef.current += (realP - pRef.current) * 0.08
      const e = eRef.current, p = pRef.current

      ctx.clearRect(0, 0, width, height)
      const cx = width / 2, cy = height / 2
      const layers = sp ? Math.round(4 + e * 4) : (m ? 2 : 3)
      const speed = sp ? 2.5 + p * 2 : 1.0
      const ampBase = sp ? 0.5 + e * 0.6 : (m ? 0.2 : 0.3)
      const freqMod = sp ? 1 + p * 1.0 : 1

      for (let l = 0; l < layers; l++) {
        const ph = l * 0.45 + t * speed
        const am = ampBase + (sp ? Math.sin(t * 2.8 + l * 0.5) * (0.1 + e * 0.2) : Math.sin(t * 0.4 + l) * 0.06)

        // Top wave — purple
        ctx.beginPath()
        for (let i = 0; i < width; i += 2) {
          const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
          const y = cy - 5 - l * 2
            + Math.sin(i * (14 * freqMod / width) + ph) * env * height * 0.3 * am
            + Math.sin(i * (5.5 * freqMod / width) + ph * 0.7) * env * height * 0.17 * am
            + (sp ? Math.sin(i * (25 * freqMod / width) + t * 5 + l) * env * (height * 0.04 + e * height * 0.06) * am : 0)
          i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
        }
        ctx.strokeStyle = `rgba(139,108,246,${sp ? 0.06 + l * 0.03 + e * 0.05 : (m ? 0.03 + l * 0.02 : 0.06 + l * 0.04)})`
        ctx.lineWidth = sp ? 10 + e * 8 - l * 1.2 : (m ? 3 - l * 0.6 : 8 - l * 1.5)
        ctx.lineCap = 'round'; ctx.stroke()

        // Bottom wave — teal
        ctx.beginPath()
        for (let i = 0; i < width; i += 2) {
          const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
          const y = cy + 5 + l * 2
            - Math.sin(i * (14 * freqMod / width) + ph + 0.35) * env * height * 0.3 * am
            - Math.sin(i * (5.5 * freqMod / width) + ph * 0.7 + 0.5) * env * height * 0.17 * am
            - (sp ? Math.sin(i * (25 * freqMod / width) + t * 5 + l + 1) * env * (height * 0.04 + e * height * 0.06) * am : 0)
          i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
        }
        ctx.strokeStyle = `rgba(6,214,160,${sp ? 0.05 + l * 0.025 + e * 0.04 : (m ? 0.025 + l * 0.015 : 0.05 + l * 0.035)})`
        ctx.lineWidth = sp ? 10 + e * 8 - l * 1.2 : (m ? 3 - l * 0.6 : 8 - l * 1.5)
        ctx.stroke()

        // Pink shimmer on high energy
        if (sp && e > 0.3 && l >= 2) {
          ctx.beginPath()
          for (let i = 0; i < width; i += 2) {
            const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
            const y = cy + Math.sin(i * (18 * freqMod / width) + ph + l * 0.4) * env * height * 0.22 * am * (0.3 + e * 0.4)
            i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
          }
          ctx.strokeStyle = `rgba(236,72,153,${0.02 + e * 0.08})`
          ctx.lineWidth = 8 + e * 6 - l; ctx.stroke()
        }
      }

      // White centre thread
      ctx.beginPath()
      const wg = ctx.createLinearGradient(0, 0, width, 0)
      const wa = sp ? 0.15 + e * 0.55 : (m ? 0.2 : 0.35)
      wg.addColorStop(0, 'transparent')
      wg.addColorStop(0.08, `rgba(255,255,255,${wa * 0.6})`)
      wg.addColorStop(0.3, `rgba(255,255,255,${sp ? 0.3 + e * 0.5 : (m ? 0.35 : 0.55)})`)
      wg.addColorStop(0.5, `rgba(255,255,255,${sp ? 0.4 + e * 0.5 : (m ? 0.4 : 0.65)})`)
      wg.addColorStop(0.7, `rgba(255,255,255,${sp ? (0.25 + e * 0.4) * 0.85 : (m ? 0.3 : 0.5)})`)
      wg.addColorStop(0.92, `rgba(255,255,255,${wa * 0.5})`)
      wg.addColorStop(1, 'transparent')
      const wAm = sp ? 0.4 + e * 0.45 + Math.sin(t * 2.8) * (0.05 + e * 0.15) : (m ? 0.2 : 0.3)
      const wF = sp ? 1 + p * 0.8 : 1
      for (let i = 0; i < width; i += 2) {
        const d = (i - cx) / cx, env = Math.max(0, 1 - d * d * 1.3)
        const y = cy
          + Math.sin(i * (14 * wF / width) + t * speed) * env * height * 0.3 * wAm
          + Math.sin(i * (5.5 * wF / width) + t * speed * 0.7) * env * height * 0.17 * wAm
          + (sp ? Math.sin(i * (25 * wF / width) + t * 5) * env * (height * 0.03 + e * height * 0.05) * wAm : 0)
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
      }
      ctx.strokeStyle = wg
      ctx.lineWidth = sp ? 0.8 + e * 0.8 : (m ? 0.6 : 1.2)
      ctx.stroke()

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => { running = false; cancelAnimationFrame(animRef.current) }
  }, [width, height])

  return <canvas ref={canvasRef} onClick={onClick} style={{ display: 'block', cursor: onClick ? 'pointer' : 'default' }} />
}

export default memo(DoubleHelix)
