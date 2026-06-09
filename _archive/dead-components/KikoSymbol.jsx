// KikoSymbol — 4-dot asymmetric symbol (the Kiko identity mark)
// Diamond-ish arrangement: two dots top (wide), two dots bottom (narrower, lower)

export default function KikoSymbol({ size = 24, color = 'currentColor', className = '', animate = 'idle', animated = false }) {
  const svgStyle = animate === 'thinking'
    ? { animation: 'kikoVortexSpin 2.5s linear infinite', transformOrigin: 'center' }
    : animate === 'streaming'
    ? { animation: 'kikoCorePulse 1.5s ease-in-out infinite', transformOrigin: 'center' }
    : {}

  const dots = [
    { cx: 15, cy: 17, delay: '0s' },
    { cx: 33, cy: 17, delay: '0.3s' },
    { cx: 20, cy: 31, delay: '0.6s' },
    { cx: 28, cy: 31, delay: '0.9s' },
  ]

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={svgStyle}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r="4.5" fill={color} opacity="0.85"
          style={animated ? { animation: `kikoDotPulse 2.5s ease-in-out ${d.delay} infinite` } : undefined} />
      ))}
    </svg>
  )
}
