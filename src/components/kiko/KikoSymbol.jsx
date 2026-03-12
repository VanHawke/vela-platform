// KikoSymbol — Unique AI identity mark
// Aperture bloom: bold spiralling blades from a strong centre
// No background ring — the shape itself is the mark
// Bolder strokes for prominence at all sizes

export default function KikoSymbol({ size = 24, color = 'currentColor', className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Core — solid intelligence centre */}
      <circle cx="12" cy="12" r="2.8" fill={color} />
      {/* Four aperture blades — bold, spiralling */}
      <path d="M12 2.5C12 2.5 16 5 16.5 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M21.5 12C21.5 12 19 16 16 16.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 21.5C12 21.5 8 19 7.5 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M2.5 12C2.5 12 5 8 8 7.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
