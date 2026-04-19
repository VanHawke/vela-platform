// KikoAvatar — 5-node processing pipeline identity
// States: idle, thinking, responding, complete
// Colour: #0A0A0A (Legora near-black) — locked
import { useRef, useEffect, memo } from 'react'

const COUNT = 5
const COL = '#0A0A0A'
const COL_LIGHT = '#FEFEFC'

function KikoAvatar({ size = 32, state = 'idle', onClick, light = false, className = '' }) {
  const containerRef = useRef(null)
  const rafRef = useRef(null)
  const startRef = useRef(null)

  const dotSize = Math.max(2, Math.round(size * 0.18))
  const gap = Math.max(2, Math.round(size * 0.14))
  const totalW = COUNT * dotSize + (COUNT - 1) * gap
  const color = light ? COL_LIGHT : COL

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    startRef.current = performance.now()

    const dots = el.querySelectorAll('.ka-dot')
    if (dots.length !== COUNT) return

    const animate = (now) => {
      const t = now - startRef.current

      for (let i = 0; i < COUNT; i++) {
        let sc = 1, op = 0.5, lift = 0

        if (state === 'idle') {
          sc = 1 + Math.sin(t / 1000 * 1.5 + i * 0.8) * 0.06
          op = 0.5
        } else if (state === 'thinking') {
          let p = ((t - i * 180) % 1400)
          if (p < 0) p += 1400
          const w = Math.sin(p / 1400 * Math.PI * 2)
          sc = 1 + Math.max(0, w) * 0.35
          op = 0.6 + Math.max(0, w) * 0.4
          lift = Math.max(0, w) * 2
        } else if (state === 'responding') {
          let p = ((t - i * 120) % 1000)
          if (p < 0) p += 1000
          const w = Math.sin(p / 1000 * Math.PI * 2)
          const peak = Math.max(0, w) ** 2
          sc = 1 + peak * 0.4
          op = 0.55 + peak * 0.45
          lift = peak * 2.5
        } else if (state === 'complete') {
          const cycle = t % 3000
          if (cycle < 800) {
            const prog = cycle / 800
            sc = 1 + (1 - prog) * 0.1
            op = 0.7 + prog * 0.3
          } else if (cycle < 1500) {
            sc = 1
            op = 1
          } else {
            sc = 1 + Math.sin((cycle - 1500) / 1500 * Math.PI * 2 * 1.5 + i * 0.8) * 0.06
            op = 0.5
          }
        }

        dots[i].style.transform = `scale(${sc.toFixed(3)}) translateY(${(-lift).toFixed(1)}px)`
        dots[i].style.opacity = op.toFixed(2)
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [state, size])

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: gap,
        width: totalW,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {Array.from({ length: COUNT }).map((_, i) => (
        <div
          key={i}
          className="ka-dot"
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: color,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  )
}

export default memo(KikoAvatar)
