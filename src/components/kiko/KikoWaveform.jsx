// src/components/kiko/KikoWaveform.jsx — Kiko soundwave avatar (v4)
// Purple-biased double-sided waveform with independent up/down bars, edge fade
import { useRef, useEffect, memo } from 'react'

function KikoWaveform({ width = 200, height = 60, volume = 0, speaking = false, energy = 0, mini = false, onClick }) {
  const canvasRef = useRef(null)
  const barsRef = useRef(null)
  const tRef = useRef(0)
  const volRef = useRef(0)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cx = cv.getContext('2d')
    const W = cv.width, H = cv.height, CY = H / 2
    const N = mini ? 40 : 120

    if (!barsRef.current || barsRef.current.length !== N) {
      barsRef.current = Array.from({ length: N }, (_, i) => {
        const nx = (i - N / 2) / (N / 2)
        const env = Math.pow(Math.exp(-nx * nx * 3.8), 1.5)
        return { env, f1: 0.8 + Math.random() * 3, f2: 1.5 + Math.random() * 2.5, ph: Math.random() * Math.PI * 2, curU: 0, curD: 0 }
      })
    }
    const bars = barsRef.current
    function lp(a, b, t) { return a + (b - a) * t }
    let raf
    function draw() {
      tRef.current += 0.016
      const t = tRef.current
      // Use external volume or simulate idle breathing
      let vol = volRef.current
      if (!speaking && vol < 0.02) {
        vol = 0.18 + 0.06 * Math.sin(t * 1.2) // strong idle breathing — bars always visible
      }
      cx.clearRect(0, 0, W, H)
      const bW = W / N, bw = Math.max(1, bW * 0.55)
      const maxH = CY * 0.85
      for (let i = 0; i < N; i++) {
        const b = bars[i]
        // Use real frequency data if available (from audio analyser)
        const freq = window.__kikoFreqData
        let eqU, eqD
        if (freq && freq.length > 0 && vol > 0.02) {
          const fi = Math.floor((i / N) * freq.length)
          const fv = (freq[fi] || 0) / 255
          eqU = fv * 0.8 + Math.abs(Math.sin(t * b.f1 + b.ph)) * 0.2
          eqD = fv * 0.7 + Math.abs(Math.sin(t * b.f2 + b.ph + 1.8)) * 0.3
        } else if (vol < 0.25) {
          // Idle/low volume — uniform breathing bars (no diagonal in mini mode)
          const breathe = 0.45 + 0.2 * Math.sin(t * 1.5)
          eqU = breathe
          eqD = breathe * 0.85
        } else {
          eqU = Math.abs(Math.sin(t * b.f1 + b.ph))
          eqD = Math.abs(Math.sin(t * b.f2 + b.ph + 1.8))
        }
        const tU = 1.5 + b.env * vol * maxH * eqU
        const tD = 1.5 + b.env * vol * maxH * eqD
        b.curU = lp(b.curU, tU, 0.14)
        b.curD = lp(b.curD, tD, 0.14)
        const hU = b.curU, hD = b.curD
        const x = i * bW + (bW - bw) / 2
        const fade = b.env
        const p = i / N
        const r = Math.round(lp(160, 100, p))
        const g = Math.round(lp(100, 180, p))
        const bl = Math.round(lp(255, 220, p))
        const rB = Math.min(255, r + 60), gB = Math.min(255, g + 40), blB = Math.min(255, bl + 20)
        const aBase = fade * (0.6 + vol * 0.35)
        // Up bar
        const gU = cx.createLinearGradient(x, CY - hU, x, CY)
        gU.addColorStop(0, `rgba(${rB},${gB},${blB},${aBase * 0.95})`)
        gU.addColorStop(0.6, `rgba(${r},${g},${bl},${aBase * 0.7})`)
        gU.addColorStop(1, `rgba(${r},${g},${bl},${aBase * 0.3})`)
        cx.fillStyle = gU
        cx.fillRect(x, CY - hU, bw, hU)
        // Down bar
        const gD = cx.createLinearGradient(x, CY, x, CY + hD)
        gD.addColorStop(0, `rgba(${r},${g},${bl},${aBase * 0.3})`)
        gD.addColorStop(0.4, `rgba(${r},${g},${bl},${aBase * 0.7})`)
        gD.addColorStop(1, `rgba(${rB},${gB},${blB},${aBase * 0.95})`)
        cx.fillStyle = gD
        cx.fillRect(x, CY, bw, hD)
        // Tips glow
        if (hU > maxH * 0.3 && vol > 0.25 && fade > 0.3) {
          cx.fillStyle = `rgba(255,255,255,${Math.min(0.35, hU / maxH * 0.3) * fade})`
          cx.fillRect(x, CY - hU, bw, 1.2)
        }
        if (hD > maxH * 0.3 && vol > 0.25 && fade > 0.3) {
          cx.fillStyle = `rgba(255,255,255,${Math.min(0.35, hD / maxH * 0.3) * fade})`
          cx.fillRect(x, CY + hD - 1.2, bw, 1.2)
        }
      }
      // Edge fades removed — gaussian envelope handles natural taper
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [width, height, mini, speaking])

  // Sync external volume/energy prop into ref (non-rerendering)
  useEffect(() => {
    volRef.current = volume || energy || 0
  }, [volume, energy])

  const scale = mini ? 2 : 1
  const cW = Math.round(width * scale)
  const cH = Math.round(height * scale)

  return (
    <canvas
      ref={canvasRef}
      width={cW}
      height={cH}
      onClick={onClick}
      style={{
        width, height,
        display: 'block',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: mini ? 4 : 0,
      }}
    />
  )
}

export default memo(KikoWaveform)
