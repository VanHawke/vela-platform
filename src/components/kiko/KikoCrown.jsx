import { useEffect, useRef, memo } from 'react'

// KikoCrown — 7-element breathing crown avatar
// Replaces DoubleHelix as Kiko's visual identity everywhere
// Props: width, height, speaking, energy, pitch, mini, speed (override)
function KikoCrown({ width = 60, height = 30, speaking = false, energy = 0, pitch = 0, mini = false, speed: speedOverride, onClick }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const tRef = useRef(0)
  const eRef = useRef(0)
  const pRef = useRef(0)
  const propsRef = useRef({ speaking, energy, pitch, mini, speedOverride })
  propsRef.current = { speaking, energy, pitch, mini, speedOverride }

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

    // 7 bars: envelope shape [dot, short, med, tall, med, short, dot]
    const N = 7
    const envShape = [0.15, 0.4, 0.72, 1.0, 0.72, 0.4, 0.15]
    const isDot = [true, false, false, false, false, false, true]

    function draw() {
      if (!running) return
      tRef.current += 0.016
      const t = tRef.current
      const { speaking: sp, energy: propE, pitch: propP, mini: m, speedOverride: spdOvr } = propsRef.current

      // Smooth audio energy
      const rawE = window.__kikoAudioEnergy || 0
      const rawP = window.__kikoAudioPitch || 0
      const isSp = sp || rawE > 0.05
      const eTarget = isSp ? (rawE || propE || 0) : 0
      const pTarget = isSp ? (rawP || propP || 0) : 0
      eRef.current += (eTarget - eRef.current) * (eTarget > eRef.current ? 0.15 : 0.06)
      pRef.current += (pTarget - pRef.current) * (pTarget > pRef.current ? 0.12 : 0.04)
      const e = eRef.current, p = pRef.current

      ctx.clearRect(0, 0, width, height)
      const cx = width / 2, cy = height / 2

      // Speed: idle=1, thinking can override, speaking=fast
      const speed = spdOvr || (isSp ? 2.5 + p * 1.5 : 1.0)
      const breathCycle = isSp ? 0.8 + e * 0.4 : 0.3 + Math.sin(t * 0.4) * 0.06

      // Bar dimensions
      const bw = Math.max(2, width * 0.06)
      const gap = Math.max(1.5, width * 0.03)
      const totalW = N * bw + (N - 1) * gap
      const startX = cx - totalW / 2

      for (let i = 0; i < N; i++) {
        const x = startX + i * (bw + gap)
        const norm = i / (N - 1) // 0..1
        const env = envShape[i]

        // Ribbon's dual-harmonic wave math applied per bar
        const waveA = Math.sin(norm * 3.5 + t * speed) * 0.5 + 0.5
        const waveB = Math.sin(norm * 1.4 + t * speed * 0.7) * 0.5 + 0.5
        const wave = waveA * 0.65 + waveB * 0.35

        // Height driven by envelope × wave × breath
        const barAm = breathCycle * wave
        const maxBarH = height * 0.85

        if (isDot[i]) {
          // Edge dots — small circles that pulse
          const dotR = Math.max(1, bw * 0.5) * (0.6 + wave * 0.4)
          const dotOp = 0.25 + wave * 0.35
          const col = i === 0 ? '139,108,246' : '6,214,160'
          ctx.beginPath()
          ctx.arc(x + bw / 2, cy, dotR, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${col},${dotOp})`
          ctx.fill()
        } else {
          // Inner bars — rounded rects with gradient
          const bh = maxBarH * env * barAm
          if (bh < 1) { continue }

          // Purple-to-teal: left bars purple, centre gradient, right bars teal
          let fillStyle
          if (norm < 0.35) {
            const op = 0.2 + barAm * env * 0.6
            fillStyle = `rgba(139,108,246,${op})`
          } else if (norm > 0.65) {
            const op = 0.15 + barAm * env * 0.5
            fillStyle = `rgba(6,214,160,${op})`
          } else {
            // Centre bars get gradient
            const op = 0.25 + barAm * env * 0.65
            const gr = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2)
            gr.addColorStop(0, `rgba(139,108,246,${op})`)
            gr.addColorStop(1, `rgba(6,214,160,${op * 0.8})`)
            fillStyle = gr
          }

          ctx.fillStyle = fillStyle
          ctx.beginPath()
          ctx.roundRect(x, cy - bh / 2, bw, bh, bw / 2)
          ctx.fill()
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => { running = false; if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [width, height])

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{ width, height, cursor: onClick ? 'pointer' : 'default', display: 'block' }}
    />
  )
}

export default memo(KikoCrown)
