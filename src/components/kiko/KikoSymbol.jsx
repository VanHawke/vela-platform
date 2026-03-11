// KikoSymbol — Clean, modern AI symbol
// Inspired by OpenAI's aperture, Perplexity's geometry, Claude's simplicity
// A stylised iris/lens: represents intelligence, awareness, voice
// Works from 14px to 140px

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
      {/* Core dot — the intelligence centre */}
      <circle cx="12" cy="12" r="2.5" fill={color} />
      {/* Three arcs — awareness, voice, cognition */}
      <path d="M12 4a8 8 0 0 1 6.93 4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 12a8 8 0 0 1-4 6.93" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 12a8 8 0 0 1 4-6.93" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
