// KikoSymbol — unique, identifiable, modern SVG icon
// Inspired by: neural pulse + voice wave + awareness
// Works at 16px to 140px. Used everywhere Kiko appears.

export default function KikoSymbol({ size = 24, color = 'currentColor', className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer ring — awareness/presence */}
      <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="1.5" opacity="0.3" />
      {/* Inner iris — intelligence core */}
      <circle cx="16" cy="16" r="6" fill={color} opacity="0.15" />
      <circle cx="16" cy="16" r="3" fill={color} />
      {/* Voice/pulse waves — radiating from center */}
      <path d="M8 16c0-4.4 3.6-8 8-8" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M24 16c0 4.4-3.6 8-8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Neural connectors — top-right and bottom-left accents */}
      <path d="M22 10l2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M10 22l-2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}
