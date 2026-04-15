// Kiko — Legora-style light palette (v0.0.44)
// Tokens extracted directly from legora.com via JS inspection.
// Single accent: pure black #0A0A0A. Background: warm-tinted white #FEFEFC.
// Same shape as previous T object — all components continue to work without changes.

export const T = {
  // Surfaces
  bg: '#FEFEFC',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceHover: '#F5F4F1',
  surfaceAlt: '#F5F4F1',

  // "Glass" — repurposed as clean white cards with hairline borders
  glass: '#FFFFFF',
  glassHover: '#FFFFFF',
  glassBorder: 'rgba(0,0,0,0.08)',
  glassBorderTop: 'rgba(0,0,0,0.05)',
  glassBorderHover: 'rgba(0,0,0,0.14)',
  glassBlur: 'none',
  glassSaturate: 'none',
  glassBlurLight: 'none',
  glassBlurHeavy: 'blur(8px) saturate(1.1)',

  glassShadow: '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
  glassShadowHover: '0 4px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)',
  glassShadowDeep: '0 8px 30px rgba(0,0,0,0.06)',
  glassShadowFloat: '0 20px 60px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)',
  glassInner: 'inset 0 1px 0 rgba(255,255,255,0.5)',
  glassGlow: '0 0 30px rgba(10,10,10,0.04)',
  glassBorderWidth: '1px',

  liquidShadow: '0 1px 2px rgba(0,0,0,0.04)',
  liquidHoverShadow: '0 2px 6px rgba(0,0,0,0.06)',
  liquidActiveShadow: '0 1px 2px rgba(0,0,0,0.04)',
  liquidBtnShadow: '0 1px 2px rgba(0,0,0,0.04)',
  liquidBtnHover: '0 2px 4px rgba(0,0,0,0.06)',

  // Borders
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.14)',
  borderStrong: 'rgba(0,0,0,0.18)',

  // Text
  text: '#0A0A0A',
  textSecondary: '#6B6B6B',
  textTertiary: '#A0A0A0',
  textMuted: '#C0C0C0',

  // Accents — Kiko's accent is now PURE BLACK like Legora
  // Legacy purple/teal/pink/blue all remap to black for safe drop-in
  purple: '#0A0A0A',
  teal: '#0A0A0A',
  pink: '#B8643E',
  blue: '#5A6470',
  amber: '#B89C5C',
  accent: '#0A0A0A',
  accentTeal: '#0A0A0A',
  accentGradient: 'linear-gradient(135deg, #0A0A0A, #2a2620)',
  accentSoft: 'rgba(10,10,10,0.04)',
  accentBorder: 'rgba(10,10,10,0.14)',

  // "Glass" accent variants — used for highlight states
  accentGlass: 'rgba(10,10,10,0.04)',
  accentGlassBorder: 'rgba(10,10,10,0.14)',
  accentGlassHover: 'rgba(10,10,10,0.08)',
  accentGlassBorderHover: 'rgba(10,10,10,0.18)',
  tealGlass: 'rgba(10,10,10,0.04)',
  tealGlassBorder: 'rgba(10,10,10,0.14)',
  tealGlassHover: 'rgba(10,10,10,0.08)',
  tealGlassBorderHover: 'rgba(10,10,10,0.18)',
  amberGlass: 'rgba(184,156,92,0.10)',
  amberGlassBorder: 'rgba(184,156,92,0.22)',

  primarySoft: 'rgba(10,10,10,0.04)',
  primaryMid: 'rgba(10,10,10,0.10)',
  primaryGlow: 'rgba(10,10,10,0.18)',
  dimText: '#A0A0A0',
  ghostText: '#C0C0C0',
  input: '#FFFFFF',

  // Editorial accent dots used in lists / status indicators
  dotSage: '#7d8a64',
  dotTerra: '#b8643e',
  dotSlate: '#5a6470',

  // Legora feature block colors
  blockGrey: '#D6D6D3',
  blockCream: '#E8DCC4',
  blockSage: '#B5BFA0',
  blockTerra: '#D89472',
  blockSlate: '#9BA1AB',

  success: '#7d8a64',
  warning: '#B89C5C',
  danger: '#B8643E',

  font: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  fontDisplay: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'Fira Code', monospace",
  weightThin: 300,
  weightLight: 400,
  weightNormal: 450,
  weightMedium: 500,

  radius: 8,
  radiusSm: 6,
  radiusCta: 4,
  radiusInput: 16,
  radiusCard: 14,
  radiusLg: 12,
  radiusXl: 16,
  radius2Xl: 20,
  radiusPill: 24,
  radiusFull: 9999,

  shadow1: '0 1px 2px rgba(0,0,0,0.04)',
  shadow2: '0 4px 16px rgba(0,0,0,0.05)',
  shadow3: '0 8px 30px rgba(0,0,0,0.06)',

  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',

  userMsg: '#0A0A0A',
  userMsgBorder: 'rgba(10,10,10,0.18)',

  edgePurple: 'linear-gradient(180deg, rgba(10,10,10,0.20) 0%, rgba(10,10,10,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(10,10,10,0.20) 0%, rgba(10,10,10,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(184,156,92,0.30) 0%, rgba(184,156,92,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(184,100,62,0.25) 0%, rgba(184,100,62,0) 100%)',

  auroraOrbs: [
    { x: 0.10, y: 0.05, r: 500, c: [232, 220, 196], s: 0.18, p: 0 },
    { x: 0.82, y: 0.55, r: 450, c: [216, 148, 114], s: 0.10, p: 2 },
    { x: 0.55, y: 0.08, r: 350, c: [181, 191, 160], s: 0.14, p: 4 },
    { x: 0.18, y: 0.68, r: 400, c: [214, 214, 211], s: 0.12, p: 1 },
    { x: 0.42, y: 0.32, r: 280, c: [232, 220, 196], s: 0.08, p: 3 },
  ],
  auroraAlpha: 0.22,
}

export const glass = {
  background: '#FFFFFF',
  border: `1px solid rgba(0,0,0,0.08)`,
  borderTop: `1px solid rgba(0,0,0,0.05)`,
  borderRadius: T.radiusCard,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  transition: 'border-color 0.15s ease, box-shadow 0.2s ease',
}

export const glassHover = {
  background: '#FFFFFF',
  borderColor: 'rgba(0,0,0,0.14)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
}

export default T
