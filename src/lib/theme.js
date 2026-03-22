// Vela — Dark Glassmorphism Theme (v4 Dribbble-grade)
// Pill shapes, milky frosted glass, luminous borders

export const T = {
  bg: '#07070B',
  surface: 'rgba(255,255,255,0.07)',
  surfaceHover: 'rgba(255,255,255,0.12)',
  surfaceAlt: 'rgba(255,255,255,0.04)',

  // Glass — Dribbble hotel booking grade
  glass: 'rgba(255,255,255,0.07)',
  glassHover: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassBorderHover: 'rgba(255,255,255,0.2)',
  glassBlur: 'blur(40px)',
  glassSaturate: 'blur(40px) saturate(1.3)',
  glassShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
  glassInner: 'inset 0 1px 0 rgba(255,255,255,0.08)',

  // Borders
  border: 'rgba(255,255,255,0.1)',
  borderHover: 'rgba(255,255,255,0.18)',
  borderStrong: 'rgba(255,255,255,0.22)',

  // Text
  text: 'rgba(255,255,255,0.9)',
  textSecondary: 'rgba(255,255,255,0.5)',
  textTertiary: 'rgba(255,255,255,0.22)',
  textMuted: 'rgba(255,255,255,0.12)',

  // Accents
  purple: '#8B6CF6', teal: '#06D6A0', pink: '#EC4899', blue: '#3B82F6', amber: '#F59E0B',
  accent: '#8B6CF6',
  accentTeal: '#06D6A0',
  accentGradient: 'linear-gradient(135deg, #8B6CF6, #06D6A0)',
  accentSoft: 'rgba(139,108,246,0.1)',
  accentBorder: 'rgba(139,108,246,0.2)',

  // Status
  success: 'rgba(6,214,160,0.7)',
  warning: 'rgba(245,158,11,0.7)',
  danger: 'rgba(255,80,80,0.7)',

  // Typography
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'DM Sans', 'Segoe UI', sans-serif",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  // Radius — PILL shapes (v4)
  radius: 20, radiusSm: 14, radiusXl: 24, radiusPill: 50,

  // User messages
  userMsg: 'rgba(139,108,246,0.12)',
  userMsgBorder: 'rgba(139,108,246,0.2)',

  // Gradient edges
  edgePurple: 'linear-gradient(180deg, rgba(139,108,246,0.6) 0%, rgba(139,108,246,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(6,214,160,0.6) 0%, rgba(6,214,160,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(245,158,11,0.6) 0%, rgba(245,158,11,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.6) 0%, rgba(236,72,153,0) 100%)',
}

export const glass = {
  background: T.glass,
  backdropFilter: T.glassSaturate,
  WebkitBackdropFilter: T.glassSaturate,
  border: `0.5px solid ${T.glassBorder}`,
  borderRadius: T.radiusPill,
  boxShadow: T.glassShadow,
}

export default T
