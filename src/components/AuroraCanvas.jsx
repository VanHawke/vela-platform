import { useEffect, useRef, memo } from 'react'

// Animated gradient orbs — BRIGHT enough to refract through frosted glass
const ORBS = [
  { x: 0.12, y: 0.1, r: 400, color: [139, 108, 246], speed: 0.0003, phase: 0 },
  { x: 0.88, y: 0.75, r: 350, color: [6, 214, 160], speed: 0.00025, phase: 2 },
  { x: 0.7, y: 0.15, r: 280, color: [236, 72, 153], speed: 0.00035, phase: 4 },
  { x: 0.25, y: 0.8, r: 300, color: [59, 130, 246], speed: 0.0002, phase: 1 },
  { x: 0.5, y: 0.45, r: 320, color: [139, 108, 246], speed: 0.00015, phase: 3 },
]
const AMBER_ORB = { x: 0.5, y: 0.4, r: 340, color: [245, 158, 11], speed: 0.0003, phase: 2.0 }

function AuroraCanvas({ extraOrb = null, opacity = 0.55 }) {
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

    const activeOrbs = [...ORBS]
    if (extraOrb === 'amber') activeOrbs.push(AMBER_ORB)
    orbsRef.current = activeOrbs.map(o => ({
      ...o, cx: o.x * window.innerWidth, cy: o.y * window.innerHeight,
    }))

    const draw = (t) => {
      const w = window.innerWidth, h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      for (const orb of orbsRef.current) {
        const dx = Math.sin(t * orb.speed + orb.phase) * 50
        const dy = Math.cos(t * orb.speed * 0.7 + orb.phase) * 40
        const px = orb.cx + dx, py = orb.cy + dy
        const pulse = 0.08 + Math.sin(t * 0.0005 + orb.phase) * 0.03
        const [r, g, b] = orb.color
        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r)
        grad.addColorStop(0, `rgba(${r},${g},${b},${pulse})`)
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${pulse * 0.4})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      }
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [extraOrb])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity }} />
}

export default memo(AuroraCanvas)
