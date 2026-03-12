// KikoSymbol — Unique AI identity mark
// Design: Aperture bloom with neural pulse — OpenAI's dynamism meets Perplexity's geometry
// Four curved blades spiral from centre, asymmetric for visual tension
// Reads as "intelligence radiating outward" at any size

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
      {/* Core — the mind */}
      <circle cx="12" cy="12" r="2" fill={color} />
      {/* Four aperture blades — spiral outward, each offset 90° */}
      <path d="M12 3.5C12 3.5 15.5 5.5 16 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20.5 12C20.5 12 18.5 15.5 16 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 20.5C12 20.5 8.5 18.5 8 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 12C3.5 12 5.5 8.5 8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Inner ring — orbit/awareness */}
      <circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth="0.8" opacity="0.25" />
    </svg>
  )
}
