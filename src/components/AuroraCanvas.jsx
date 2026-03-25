import { useEffect, useRef, memo } from 'react'

// Aurora orbs — balanced colour palette (less purple dominance, more teal/amber warmth)
const ORBS = [
  { x: 0.08, y: 0.04, r: 600, color: [139, 108, 246], speed: 0.00025, phase: 0 },
  { x: 0.85, y: 0.65, r: 580, color: [6, 214, 160], speed: 0.0002, phase: 2 },
  { x: 0.65, y: 0.08, r: 400, color: [236, 72, 153], speed: 0.0003, phase: 4 },
  { x: 0.18, y: 0.75, r: 500, color: [59, 130, 246], speed: 0.00018, phase: 1 },
  { x: 0.5, y: 0.4, r: 350, color: [245, 158, 11], speed: 0.00015, phase: 3 },
  { x: 0.35, y: 0.2, r: 280, color: [6, 214, 160], speed: 0.00022, phase: 5 },
]
const AMBER_ORB = { x: 0.5, y: 0.35, r: 400, color: [245, 158, 11], speed: 0.0003, phase: 2.0 }

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
        const pulse = 0.18 + Math.sin(t * 0.0004 + orb.phase) * 0.04
        const [r, g, b] = orb.color
        const grad = ctx.createRadialGradient(px, py, 0, px, py, orb.r)
        grad.addColorStop(0, `rgba(${r},${g},${b},${pulse})`)
        grad.addColorStop(0.3, `rgba(${r},${g},${b},${pulse * 0.5})`)
        grad.addColorStop(0.6, `rgba(${r},${g},${b},${pulse * 0.2})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      }
      // Dark blue gradient from bottom — Render B treatment
      const blueGrad = ctx.createLinearGradient(0, h * 0.35, 0, h)
      blueGrad.addColorStop(0, 'rgba(10,25,60,0)')
      blueGrad.addColorStop(0.4, 'rgba(10,25,60,0.15)')
      blueGrad.addColorStop(0.7, 'rgba(15,35,80,0.22)')
      blueGrad.addColorStop(1, 'rgba(20,45,100,0.18)')
      ctx.fillStyle = blueGrad
      ctx.fillRect(0, 0, w, h)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [extraOrb])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
}

export default memo(AuroraCanvas)
