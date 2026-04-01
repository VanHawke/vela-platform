// Vela — Dark Glassmorphism Theme (v5 Physical Glass)
// Physical glass slabs — top-edge highlight, bottom-edge shadow, luminous aura
// Pill shapes, richer aurora backdrop, elements pop off the page

export const T = {
  bg: '#000000',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHover: 'rgba(255,255,255,0.07)',
  surfaceAlt: 'rgba(255,255,255,0.03)',

  // Glass v4 — elevated physical depth system
  glass: 'rgba(255,255,255,0.035)',
  glassHover: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glassBorderTop: 'rgba(255,255,255,0.15)',
  glassBorderHover: 'rgba(255,255,255,0.2)',
  glassBlur: 'blur(40px) saturate(1.4)',
  glassSaturate: 'blur(40px) saturate(1.4)',
  glassBlurLight: 'blur(24px) saturate(1.2)',
  glassBlurHeavy: 'blur(40px) saturate(1.5)',
  // Elevated glass shadow — deep lift off page
  glassShadow: '0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.05) inset',
  glassShadowHover: '0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.07) inset',
  glassShadowDeep: '0 12px 40px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.02) inset',
  glassShadowFloat: '0 16px 48px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset',
  glassInner: '0 4px 16px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04) inset',
  glassBorderWidth: '0.5px',

  // Borders
  border: 'rgba(255,255,255,0.1)',
  borderHover: 'rgba(255,255,255,0.2)',
  borderStrong: 'rgba(255,255,255,0.25)',

  // Text
  text: 'rgba(255,255,255,0.95)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.32)',
  textMuted: 'rgba(255,255,255,0.18)',

  // Accents
  purple: '#8B6CF6', teal: '#06D6A0', pink: '#EC4899', blue: '#3B82F6', amber: '#F59E0B',
  accent: '#8B6CF6',
  accentTeal: '#06D6A0',
  accentGradient: 'linear-gradient(135deg, #8B6CF6, #06D6A0)',
  accentSoft: 'rgba(139,108,246,0.06)',
  accentBorder: 'rgba(139,108,246,0.16)',

  // Accent glass variants
  accentGlass: 'rgba(139,108,246,0.06)',
  accentGlassBorder: 'rgba(139,108,246,0.16)',
  accentGlassHover: 'rgba(139,108,246,0.12)',
  accentGlassBorderHover: 'rgba(139,108,246,0.28)',
  tealGlass: 'rgba(6,214,160,0.05)',
  tealGlassBorder: 'rgba(6,214,160,0.14)',
  tealGlassHover: 'rgba(6,214,160,0.1)',
  tealGlassBorderHover: 'rgba(6,214,160,0.25)',
  amberGlass: 'rgba(245,158,11,0.04)',
  amberGlassBorder: 'rgba(245,158,11,0.14)',

  // Status
  success: 'rgba(6,214,160,0.7)',
  warning: 'rgba(245,158,11,0.7)',
  danger: 'rgba(255,80,80,0.7)',

  // Typography
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'DM Sans', 'Segoe UI', sans-serif",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  // Radius — PILL shapes
  radius: 20, radiusSm: 14, radiusXl: 24, radiusPill: 50,

  // User messages
  userMsg: 'rgba(139,108,246,0.08)',
  userMsgBorder: 'rgba(139,108,246,0.16)',

  // Gradient edges
  edgePurple: 'linear-gradient(180deg, rgba(139,108,246,0.6) 0%, rgba(139,108,246,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(6,214,160,0.6) 0%, rgba(6,214,160,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(245,158,11,0.6) 0%, rgba(245,158,11,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.6) 0%, rgba(236,72,153,0) 100%)',

  // Aurora orb config — balanced (less purple dominance)
  auroraOrbs: [
    { x: 0.08, y: 0.04, r: 600, c: [139, 108, 246], s: 0.25, p: 0 },    // purple
    { x: 0.85, y: 0.65, r: 580, c: [6, 214, 160], s: 0.2, p: 2 },       // teal (dominant)
    { x: 0.65, y: 0.08, r: 400, c: [236, 72, 153], s: 0.3, p: 4 },      // pink
    { x: 0.18, y: 0.75, r: 500, c: [59, 130, 246], s: 0.18, p: 1 },     // blue
    { x: 0.5, y: 0.4, r: 350, c: [245, 158, 11], s: 0.15, p: 3 },      // amber centre
    { x: 0.35, y: 0.2, r: 280, c: [6, 214, 160], s: 0.22, p: 5 },      // second teal (balances purple)
  ],
  auroraAlpha: 0.3, // base alpha — richer than v4's 0.22
}

// Glass helper — elevated frosted slab
export const glass = {
  background: T.glass,
  backdropFilter: T.glassBlur,
  WebkitBackdropFilter: T.glassBlur,
  border: `0.5px solid ${T.glassBorder}`,
  borderTop: `0.5px solid ${T.glassBorderTop}`,
  borderRadius: T.radius,
  boxShadow: T.glassShadow,
  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
}

// Glass hover helper
export const glassHover = {
  background: T.glassHover,
  borderColor: T.glassBorderHover,
  boxShadow: T.glassShadowHover,
}

export default T
