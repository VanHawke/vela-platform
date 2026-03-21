// Vela — Dark Glassmorphism Theme (Aurora)
// Single source of truth for all component theming

export const T = {
  // Backgrounds
  bg: '#07070B',
  surface: 'rgba(255,255,255,0.035)',
  surfaceHover: 'rgba(255,255,255,0.055)',
  surfaceAlt: 'rgba(255,255,255,0.02)',

  // Glass
  glass: 'rgba(255,255,255,0.035)',
  glassHover: 'rgba(255,255,255,0.055)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassBorderHover: 'rgba(255,255,255,0.12)',
  glassBlur: 'blur(24px)',
  glassShadow: '0 8px 36px rgba(0,0,0,0.3)',

  // Borders
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.15)',

  // Text — ultra-thin
  text: 'rgba(255,255,255,0.9)',
  textSecondary: 'rgba(255,255,255,0.5)',
  textTertiary: 'rgba(255,255,255,0.2)',
  textMuted: 'rgba(255,255,255,0.15)',

  // Accent palette — glassmorphism colour language
  purple: '#8B6CF6',
  teal: '#06D6A0',
  pink: '#EC4899',
  blue: '#3B82F6',
  amber: '#F59E0B',

  // Functional accents
  accent: '#8B6CF6',
  accentTeal: '#06D6A0',
  accentGradient: 'linear-gradient(135deg, #8B6CF6, #06D6A0)',
  accentSoft: 'rgba(139,108,246,0.06)',
  accentBorder: 'rgba(139,108,246,0.15)',

  // Status
  success: 'rgba(6,214,160,0.7)',
  warning: 'rgba(245,158,11,0.7)',
  danger: 'rgba(255,80,80,0.7)',

  // Typography
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'DM Sans', 'Segoe UI', sans-serif",
  weightThin: 200,
  weightLight: 300,
  weightNormal: 400,
  weightMedium: 500,

  // Radius
  radius: 18, radiusSm: 12, radiusXl: 24, radiusPill: 28,

  // User message glass
  userMsg: 'rgba(139,108,246,0.1)',
  userMsgBorder: 'rgba(139,108,246,0.15)',

  // Gradient edge indicator colours (for cards)
  edgePurple: 'linear-gradient(180deg, rgba(139,108,246,0.6) 0%, rgba(139,108,246,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(6,214,160,0.6) 0%, rgba(6,214,160,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(245,158,11,0.6) 0%, rgba(245,158,11,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.6) 0%, rgba(236,72,153,0) 100%)',
}

// Glass panel helper
export const glass = {
  background: T.glass,
  backdropFilter: T.glassBlur,
  WebkitBackdropFilter: T.glassBlur,
  border: `0.5px solid ${T.glassBorder}`,
  borderRadius: T.radius,
}

// Glass card hover helper
export const glassCard = {
  ...glass,
  transition: 'all 0.2s ease',
  cursor: 'pointer',
}

export default T
