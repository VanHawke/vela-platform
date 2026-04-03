// Vela — Caffeine Theme (dark warm peach)
// Inspired by 21st.dev Caffeine · #ffe0c2 peach primary · #393028 coffee brown
// 0.5rem (8px) radius · System font · Liquid glass depth

export const T = {
  bg: '#111111',
  surface: 'rgba(255,224,194,0.04)',
  surfaceHover: 'rgba(255,224,194,0.07)',
  surfaceAlt: 'rgba(255,224,194,0.03)',

  // Glass — warm peach-tinted liquid glass system
  glass: 'rgba(25,25,25,0.30)',
  glassHover: 'rgba(255,224,194,0.22)',
  glassBorder: 'rgba(32,30,24,0.50)',
  glassBorderTop: 'rgba(255,224,194,0.12)',
  glassBorderHover: 'rgba(255,224,194,0.25)',
  glassBlur: 'blur(40px) saturate(1.4)',
  glassSaturate: 'blur(40px) saturate(1.4)',
  glassBlurLight: 'blur(24px) saturate(1.2)',
  glassBlurHeavy: 'blur(40px) saturate(1.5)',
  // Liquid glass shadow — warm peach insets
  glassShadow: '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,224,194,0.06), inset 3px 3px 0.5px -3.5px rgba(255,224,194,0.12), inset -3px -3px 0.5px -3.5px rgba(255,224,194,0.10), inset 1px 1px 1px -0.5px rgba(255,224,194,0.08), inset -1px -1px 1px -0.5px rgba(255,224,194,0.08), inset 0 0 6px 6px rgba(255,224,194,0.04)',
  glassShadowHover: '0 0 10px rgba(255,224,194,0.06), 0 2px 8px rgba(0,0,0,0.12), inset 3px 3px 0.5px -3.5px rgba(255,224,194,0.22), inset -3px -3px 0.5px -3.5px rgba(255,224,194,0.16), inset 1px 1px 1px -0.5px rgba(255,224,194,0.14), inset -1px -1px 1px -0.5px rgba(255,224,194,0.14), inset 0 0 6px 6px rgba(255,224,194,0.07), 0 0 20px rgba(255,224,194,0.10)',
  glassShadowDeep: '0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,224,194,0.06)',
  glassShadowFloat: '0 16px 48px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,224,194,0.08)',
  glassInner: '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,224,194,0.06)',
  glassBorderWidth: '0.5px',

  // Borders
  border: 'rgba(32,30,24,0.50)',
  borderHover: 'rgba(255,224,194,0.20)',
  borderStrong: 'rgba(255,224,194,0.30)',

  // Text
  text: 'rgba(238,238,238,0.95)',
  textSecondary: 'rgba(238,238,238,0.55)',
  textTertiary: 'rgba(238,238,238,0.32)',
  textMuted: 'rgba(238,238,238,0.18)',

  // Accents — peach primary, coffee secondary
  purple: '#a78bfa', teal: '#2dd4bf', pink: '#EC4899', blue: '#60a5fa', amber: '#fbbf24',
  accent: '#ffe0c2',
  accentTeal: '#2dd4bf',
  accentGradient: 'linear-gradient(135deg, #ffe0c2, #393028)',
  accentSoft: 'rgba(255,224,194,0.08)',
  accentBorder: 'rgba(255,224,194,0.16)',

  // Accent glass variants — peach-based
  accentGlass: 'rgba(255,224,194,0.06)',
  accentGlassBorder: 'rgba(255,224,194,0.16)',
  accentGlassHover: 'rgba(255,224,194,0.12)',
  accentGlassBorderHover: 'rgba(255,224,194,0.28)',
  tealGlass: 'rgba(45,212,191,0.05)',
  tealGlassBorder: 'rgba(45,212,191,0.14)',
  tealGlassHover: 'rgba(45,212,191,0.1)',
  tealGlassBorderHover: 'rgba(45,212,191,0.25)',
  amberGlass: 'rgba(251,191,36,0.04)',
  amberGlassBorder: 'rgba(251,191,36,0.14)',

  // Status
  success: 'rgba(45,212,191,0.7)',
  warning: 'rgba(251,191,36,0.7)',
  danger: 'rgba(248,113,113,0.7)',

  // Typography — system font stack (no DM Sans)
  font: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  // Radius — 0.5rem (8px) base, not pills
  radius: 8, radiusSm: 6, radiusXl: 12, radiusPill: 50,

  // User messages — peach tinted
  userMsg: 'rgba(255,224,194,0.08)',
  userMsgBorder: 'rgba(255,224,194,0.16)',

  // Gradient edges — peach-based
  edgePurple: 'linear-gradient(180deg, rgba(167,139,250,0.6) 0%, rgba(167,139,250,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(45,212,191,0.6) 0%, rgba(45,212,191,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(251,191,36,0.6) 0%, rgba(251,191,36,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.6) 0%, rgba(236,72,153,0) 100%)',

  // Aurora orb config — warm Caffeine palette
  auroraOrbs: [
    { x: 0.08, y: 0.04, r: 600, c: [255, 224, 194], s: 0.25, p: 0 },    // peach
    { x: 0.85, y: 0.65, r: 580, c: [57, 48, 40], s: 0.2, p: 2 },        // coffee brown
    { x: 0.65, y: 0.08, r: 400, c: [167, 139, 250], s: 0.3, p: 4 },     // soft purple
    { x: 0.18, y: 0.75, r: 500, c: [45, 212, 191], s: 0.18, p: 1 },     // teal
    { x: 0.5, y: 0.4, r: 350, c: [251, 191, 36], s: 0.15, p: 3 },       // amber centre
    { x: 0.35, y: 0.2, r: 280, c: [255, 224, 194], s: 0.22, p: 5 },     // second peach (warm glow)
  ],
  auroraAlpha: 0.3,
}

// Glass helper — elevated frosted slab (peach-tinted)
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
