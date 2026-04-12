// Vela — Warm Charcoal palette (v0.0.43, picked from PALETTES_HOME_CC.html Option 1)
// Single accent: purple #7c5cfc. Teal removed/remapped. WCAG AA passing throughout.

export const T = {
  bg: '#14141a',
  card: '#1c1c24',
  surface: '#1c1c24',
  surfaceHover: '#2a2a35',
  surfaceAlt: '#1c1c24',

  glass: 'rgba(28,28,36,0.85)',
  glassHover: 'rgba(42,42,53,0.90)',
  glassBorder: '#26262f',
  glassBorderTop: '#26262f',
  glassBorderHover: '#322a3d',
  glassBlur: 'blur(20px) saturate(1.2)',
  glassSaturate: 'blur(20px) saturate(1.2)',
  glassBlurLight: 'blur(12px) saturate(1.1)',
  glassBlurHeavy: 'blur(28px) saturate(1.3)',

  glassShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 0.5px #26262f',
  glassShadowHover: '0 2px 8px rgba(0,0,0,0.5), 0 0 0 0.5px #322a3d',
  glassShadowDeep: '0 8px 24px rgba(0,0,0,0.5)',
  glassShadowFloat: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 0.5px #322a3d',
  glassInner: '0 1px 3px rgba(0,0,0,0.3)',
  glassGlow: '0 0 20px rgba(124,92,252,0.10)',
  glassBorderWidth: '0.5px',

  liquidShadow: '0 1px 2px rgba(0,0,0,0.3)',
  liquidHoverShadow: '0 2px 6px rgba(0,0,0,0.35)',
  liquidActiveShadow: '0 1px 2px rgba(0,0,0,0.2)',
  liquidBtnShadow: '0 1px 2px rgba(0,0,0,0.2)',
  liquidBtnHover: '0 2px 4px rgba(0,0,0,0.25)',

  border: '#26262f',
  borderHover: '#322a3d',
  borderStrong: '#3a3a48',

  text: '#f4f4f6',
  textSecondary: '#9b9ba3',
  textTertiary: '#7e7e88',
  textMuted: '#56565e',

  // Single accent — purple. Teal remapped to purple for legacy callers.
  purple: '#7c5cfc', teal: '#7c5cfc', pink: '#7c5cfc', blue: '#c4b1ff', amber: '#fbbf24',
  accent: '#7c5cfc',
  accentTeal: '#7c5cfc',
  accentGradient: 'linear-gradient(135deg, #7c5cfc, #c4b1ff)',
  accentSoft: 'rgba(124,92,252,0.08)',
  accentBorder: 'rgba(124,92,252,0.20)',

  accentGlass: 'rgba(124,92,252,0.08)',
  accentGlassBorder: 'rgba(124,92,252,0.20)',
  accentGlassHover: 'rgba(124,92,252,0.18)',
  accentGlassBorderHover: 'rgba(124,92,252,0.40)',
  tealGlass: 'rgba(124,92,252,0.08)',
  tealGlassBorder: 'rgba(124,92,252,0.20)',
  tealGlassHover: 'rgba(124,92,252,0.18)',
  tealGlassBorderHover: 'rgba(124,92,252,0.40)',
  amberGlass: 'rgba(251,191,36,0.08)',
  amberGlassBorder: 'rgba(251,191,36,0.20)',

  primarySoft: 'rgba(124,92,252,0.08)',
  primaryMid: 'rgba(124,92,252,0.18)',
  primaryGlow: 'rgba(124,92,252,0.40)',
  dimText: '#56565e',
  ghostText: '#3a3a42',
  input: '#1c1c24',

  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',

  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Fira Code', monospace",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  radius: 8, radiusSm: 6, radiusLg: 12, radiusXl: 16, radius2Xl: 20, radiusPill: 50, radiusFull: 9999,

  shadow1: '0 1px 2px rgba(0,0,0,0.4)',
  shadow2: '0 2px 6px rgba(0,0,0,0.45)',
  shadow3: '0 6px 20px rgba(0,0,0,0.5)',

  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',

  userMsg: 'rgba(124,92,252,0.08)',
  userMsgBorder: 'rgba(124,92,252,0.20)',

  edgePurple: 'linear-gradient(180deg, rgba(124,92,252,0.5) 0%, rgba(124,92,252,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(124,92,252,0.5) 0%, rgba(124,92,252,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(251,191,36,0.5) 0%, rgba(251,191,36,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(124,92,252,0.5) 0%, rgba(124,92,252,0) 100%)',

  auroraOrbs: [
    { x: 0.10, y: 0.05, r: 500, c: [124, 92, 252], s: 0.10, p: 0 },
    { x: 0.82, y: 0.55, r: 450, c: [124, 92, 252], s: 0.08, p: 2 },
    { x: 0.55, y: 0.08, r: 350, c: [196, 177, 255], s: 0.10, p: 4 },
    { x: 0.18, y: 0.68, r: 400, c: [124, 92, 252], s: 0.06, p: 1 },
    { x: 0.42, y: 0.32, r: 280, c: [124, 92, 252], s: 0.05, p: 3 },
  ],
  auroraAlpha: 0.12,
}

export const glass = {
  background: '#1c1c24',
  border: `0.5px solid #26262f`,
  borderTop: `0.5px solid #26262f`,
  borderRadius: T.radius,
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
  transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
}

export const glassHover = {
  background: '#2a2a35',
  borderColor: '#322a3d',
  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
}

export default T
