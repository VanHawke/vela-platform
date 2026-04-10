// Vela — Clean Dark Theme (matching mockup renders)
// Flat surfaces · Subtle borders · Clean typography · Minimal glass
// Updated 2026-04-10 to use Claude.ai warm-dark palette per Sunny's request.
// Previous: cool grey #262624 (too dark, hard to read).
// New: warm near-black #262624 — same family as Claude.ai canvas, slight beige tint.

export const T = {
  bg: '#262624',
  card: '#1F1F1D',
  surface: '#2C2C2A',
  surfaceHover: '#33332F',
  surfaceAlt: '#2A2A28',

  // Glass — barely-there frosted effect, NOT heavy
  glass: 'rgba(20,20,24,0.65)',
  glassHover: 'rgba(26,26,30,0.80)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassBorderTop: 'rgba(255,255,255,0.08)',
  glassBorderHover: 'rgba(255,255,255,0.12)',
  glassBlur: 'blur(20px) saturate(1.2)',
  glassSaturate: 'blur(20px) saturate(1.2)',
  glassBlurLight: 'blur(12px) saturate(1.1)',
  glassBlurHeavy: 'blur(28px) saturate(1.3)',

  // Shadows — clean and minimal, no heavy inset glow
  glassShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.04)',
  glassShadowHover: '0 2px 8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.06)',
  glassShadowDeep: '0 8px 24px rgba(0,0,0,0.4)',
  glassShadowFloat: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.06)',
  glassInner: '0 1px 3px rgba(0,0,0,0.25)',
  glassGlow: '0 0 20px rgba(124,92,252,0.04)',
  glassBorderWidth: '0.5px',

  // Button shadows — subtle, clean
  liquidShadow: '0 1px 2px rgba(0,0,0,0.2)',
  liquidHoverShadow: '0 2px 6px rgba(0,0,0,0.25)',
  liquidActiveShadow: '0 1px 2px rgba(0,0,0,0.15)',
  liquidBtnShadow: '0 1px 2px rgba(0,0,0,0.15)',
  liquidBtnHover: '0 2px 4px rgba(0,0,0,0.2)',

  // Borders — clean white at low opacity
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.18)',

  // Text — crisp with good hierarchy
  text: 'rgba(245,245,248,0.92)',
  textSecondary: 'rgba(245,245,248,0.55)',
  textTertiary: 'rgba(245,245,248,0.32)',
  textMuted: 'rgba(245,245,248,0.16)',

  // Accents — purple/blue primary, teal secondary (from mockups)
  purple: '#A78BFA', teal: '#2DD4BF', pink: '#EC4899', blue: '#818CF8', amber: '#FBBF24',
  accent: '#A78BFA',
  accentTeal: '#2DD4BF',
  accentGradient: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)',
  accentSoft: 'rgba(167,139,250,0.06)',
  accentBorder: 'rgba(167,139,250,0.12)',

  // Accent glass — very subtle
  accentGlass: 'rgba(167,139,250,0.04)',
  accentGlassBorder: 'rgba(167,139,250,0.10)',
  accentGlassHover: 'rgba(167,139,250,0.08)',
  accentGlassBorderHover: 'rgba(167,139,250,0.16)',
  tealGlass: 'rgba(45,212,191,0.04)',
  tealGlassBorder: 'rgba(45,212,191,0.08)',
  tealGlassHover: 'rgba(45,212,191,0.08)',
  tealGlassBorderHover: 'rgba(45,212,191,0.14)',
  amberGlass: 'rgba(251,191,36,0.03)',
  amberGlassBorder: 'rgba(251,191,36,0.08)',

  // Derived
  primarySoft: 'rgba(167,139,250,0.06)',
  primaryMid: 'rgba(167,139,250,0.10)',
  primaryGlow: 'rgba(167,139,250,0.16)',
  dimText: '#555558',
  ghostText: '#3A3A3E',
  input: '#2A2A30',

  // Status — solid readable colors
  success: '#2DD4BF',
  warning: '#FBBF24',
  danger: '#F87171',

  // Typography
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Fira Code', monospace",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  // Radius — matching mockups (8px base)
  radius: 8, radiusSm: 6, radiusLg: 12, radiusXl: 16, radius2Xl: 20, radiusPill: 50, radiusFull: 9999,

  // Shadows
  shadow1: '0 1px 2px rgba(0,0,0,0.3)',
  shadow2: '0 2px 6px rgba(0,0,0,0.35)',
  shadow3: '0 6px 20px rgba(0,0,0,0.4)',

  // Easing — natural spring for animations
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',

  // User messages
  userMsg: 'rgba(167,139,250,0.05)',
  userMsgBorder: 'rgba(167,139,250,0.08)',

  // Gradient edges
  edgePurple: 'linear-gradient(180deg, rgba(167,139,250,0.5) 0%, rgba(167,139,250,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(45,212,191,0.5) 0%, rgba(45,212,191,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(251,191,36,0.5) 0%, rgba(251,191,36,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.5) 0%, rgba(236,72,153,0) 100%)',

  // Aurora orbs — subtle purple/teal ambient glow
  auroraOrbs: [
    { x: 0.10, y: 0.05, r: 500, c: [124, 92, 252], s: 0.15, p: 0 },
    { x: 0.82, y: 0.55, r: 450, c: [45, 212, 191], s: 0.12, p: 2 },
    { x: 0.55, y: 0.08, r: 350, c: [129, 140, 248], s: 0.18, p: 4 },
    { x: 0.18, y: 0.68, r: 400, c: [167, 139, 250], s: 0.10, p: 1 },
    { x: 0.42, y: 0.32, r: 280, c: [0, 212, 170], s: 0.08, p: 3 },
  ],
  auroraAlpha: 0.18,
}

// Glass helper — clean flat panel (matching mockup renders)
export const glass = {
  background: '#1F1F1D',
  border: `0.5px solid rgba(255,255,255,0.06)`,
  borderTop: `0.5px solid rgba(255,255,255,0.08)`,
  borderRadius: T.radius,
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
}

// Glass hover helper
export const glassHover = {
  background: '#2C2C2A',
  borderColor: 'rgba(255,255,255,0.10)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
}

export default T
