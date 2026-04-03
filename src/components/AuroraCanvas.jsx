import { useEffect, useRef, memo } from 'react'

// Aurora orbs — very subtle warm ambient glow (barely perceptible)
const ORBS = [
  { x: 0.08, y: 0.04, r: 500, color: [180, 160, 140], speed: 0.00025, phase: 0 },     // warm grey (was peach — too gold)
  { x: 0.85, y: 0.65, r: 480, color: [57, 48, 40], speed: 0.0002, phase: 2 },          // coffee brown
  { x: 0.65, y: 0.08, r: 350, color: [120, 100, 140], speed: 0.0003, phase: 4 },       // muted purple
  { x: 0.18, y: 0.75, r: 400, color: [45, 120, 110], speed: 0.00018, phase: 1 },       // muted teal
  { x: 0.5, y: 0.4, r: 300, color: [140, 120, 80], speed: 0.00015, phase: 3 },         // warm amber (muted)
  { x: 0.35, y: 0.2, r: 250, color: [140, 120, 100], speed: 0.00022, phase: 5 },       // warm grey
]
const AMBER_ORB = { x: 0.5, y: 0.35, r: 350, color: [140, 120, 80], speed: 0.0003, phase: 2.0 }

function AuroraCanvas({ extraOrb = null }) {
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
        const dx = Math.sin(t * orb.speed + orb.phase) * 80
        const dy = Math.cos(t * orb.speed * 0.7 + orb.phase) * 60
        const px = orb.cx + dx, py = orb.cy + dy
        // Much lower alpha — barely visible ambient glow
        const pulse = 0.03 + Math.sin(t * 0.0004 + orb.phase) * 0.01
        const [r, g, b] = orb.color
        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r)
        grad.addColorStop(0, `rgba(${r},${g},${b},${pulse})`)
        grad.addColorStop(0.3, `rgba(${r},${g},${b},${pulse * 0.4})`)
        grad.addColorStop(0.6, `rgba(${r},${g},${b},${pulse * 0.15})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      }
      // Subtle warm vignette from bottom
      const warmGrad = ctx.createLinearGradient(0, h * 0.4, 0, h)
      warmGrad.addColorStop(0, 'rgba(17,17,17,0)')
      warmGrad.addColorStop(0.5, 'rgba(20,18,15,0.08)')
      warmGrad.addColorStop(1, 'rgba(25,22,18,0.12)')
      ctx.fillStyle = warmGrad
      ctx.fillRect(0, 0, w, h)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [extraOrb])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
}

export default memo(AuroraCanvas)
