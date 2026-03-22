import { useEffect, useRef, memo } from 'react'

// Smoke-trail wave — Kiko's signature animation
// Multiple translucent gradient layers + bright white edge thread
function SmokeTrailWave({ width = 400, height = 60, scale = 1, mini = false, thinking = false }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = width * scale
    const h = height * scale
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const speed = thinking ? 4 : 1.8
    const layers = mini ? 2 : 4

    const draw = () => {
      tRef.current += 0.016
      const t = tRef.current
      ctx.clearRect(0, 0, w, h)
      const cy = h / 2

      // Thick soft gradient layers (aurora bands)
      for (let layer = layers - 1; layer >= 0; layer--) {
        ctx.beginPath()
        const lw = mini ? (8 - layer * 2) : (16 - layer * 3.5)
        const la = 0.035 + layer * 0.025

        for (let i = 0; i < w; i++) {
          const y = cy + Math.sin(i * 0.012 + t * speed + layer * 0.3) * (h * 0.25)
                      + Math.sin(i * 0.005 + t * (speed + 0.7) + layer * 0.5) * (h * 0.15)
                      + (thinking ? Math.random() * 1 : 0)
          i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
        }

        const g = ctx.createLinearGradient(0, 0, w, 0)
        g.addColorStop(0, `rgba(139,108,246,${la})`)
        g.addColorStop(0.4, `rgba(6,214,160,${la * 0.8})`)
        g.addColorStop(0.7, `rgba(236,72,153,${la * 0.6})`)
        g.addColorStop(1, `rgba(139,108,246,${la * 0.5})`)
        ctx.strokeStyle = g
        ctx.lineWidth = lw
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // Bright white edge thread
      ctx.beginPath()
      const cg = ctx.createLinearGradient(0, 0, w, 0)
      cg.addColorStop(0, 'rgba(255,255,255,0.55)')
      cg.addColorStop(0.3, 'rgba(255,255,255,0.7)')
      cg.addColorStop(0.6, 'rgba(255,255,255,0.5)')
      cg.addColorStop(1, 'rgba(255,255,255,0.4)')
      ctx.strokeStyle = cg
      ctx.lineWidth = mini ? 0.5 : 1

      for (let i = 0; i < w; i++) {
        const y = cy + Math.sin(i * 0.012 + t * speed) * (h * 0.25)
                    + Math.sin(i * 0.005 + t * (speed + 0.7)) * (h * 0.15)
                    + (thinking ? Math.random() * 1 : 0)
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
      }
      ctx.stroke()

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [width, height, scale, mini, thinking])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}

export default memo(SmokeTrailWave)
