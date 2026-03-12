// KikoSymbol — Bold, distinctive AI mark
// Design: Aperture vortex — four bold curved blades spiral from a solid core
// No background shape — the mark stands alone
// Thick strokes, tight geometry, instantly recognisable at 14px–140px

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
      {/* Solid core */}
      <circle cx="12" cy="12" r="3" fill={color} />
      {/* Four vortex blades — thick, curved, asymmetric */}
      <path d="M12 2C12 2 17 5.5 17 8.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 12C22 12 18.5 17 15.5 17" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 22C12 22 7 18.5 7 15.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M2 12C2 12 5.5 7 8.5 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
