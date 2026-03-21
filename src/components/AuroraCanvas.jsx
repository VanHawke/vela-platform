import { useEffect, useRef, memo } from 'react'

// Animated gradient orbs rendered on canvas — 60fps
// Orbs bleed through frosted glass panels for living refraction
const ORBS = [
  { x: 0.15, y: 0.15, r: 350, color: [139, 108, 246], speed: 0.0003, phase: 0 },       // Purple — top-left
  { x: 0.85, y: 0.85, r: 320, color: [6, 214, 160], speed: 0.00025, phase: 1.5 },       // Teal — bottom-right
  { x: 0.7, y: 0.2, r: 250, color: [236, 72, 153], speed: 0.00035, phase: 3.0 },        // Pink — scattered
  { x: 0.3, y: 0.7, r: 280, color: [59, 130, 246], speed: 0.0002, phase: 4.5 },         // Blue — scattered
]

// Optional amber orb for pipeline page
const AMBER_ORB = { x: 0.5, y: 0.4, r: 300, color: [245, 158, 11], speed: 0.0003, phase: 2.0 }

function AuroraCanvas({ extraOrb = null, opacity = 0.35 }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const orbsRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    // Build orbs list
    const activeOrbs = [...ORBS]
    if (extraOrb === 'amber') activeOrbs.push(AMBER_ORB)
    orbsRef.current = activeOrbs.map(o => ({
      ...o,
      cx: o.x * window.innerWidth,
      cy: o.y * window.innerHeight,
    }))

    const draw = (t) => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      for (const orb of orbsRef.current) {
        const dx = Math.sin(t * orb.speed + orb.phase) * 40
        const dy = Math.cos(t * orb.speed * 0.7 + orb.phase) * 30
        const px = orb.cx + dx
        const py = orb.cy + dy

        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r)
        const [r, g, b] = orb.color
        grad.addColorStop(0, `rgba(${r},${g},${b},0.3)`)
        grad.addColorStop(0.4, `rgba(${r},${g},${b},0.1)`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(px - orb.r, py - orb.r, orb.r * 2, orb.r * 2)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [extraOrb])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 0,
        pointerEvents: 'none', opacity,
      }}
    />
  )
}

export default memo(AuroraCanvas)
