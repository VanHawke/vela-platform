// Kiko — Dark Warm Glassmorphism Theme
// Warm charcoal base, amber/gold accents, enhanced glass depth
// Inspired by premium dark UI references

export const T = {
  bg: '#1C1C1E',
  surface: 'rgba(255,255,255,0.05)',
  surfaceHover: 'rgba(255,255,255,0.08)',
  surfaceAlt: 'rgba(255,255,255,0.03)',

  // Glass — enhanced glassmorphism
  glass: 'rgba(255,255,255,0.05)',
  glassHover: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderHover: 'rgba(255,255,255,0.16)',
  glassBlur: 'blur(40px) saturate(1.6)',
  glassSaturate: 'blur(40px) saturate(1.6)',
  glassShadow: 'inset 0 2px 0 rgba(255,255,255,0.06), inset 0 1px 2px rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.15), 0 0 20px rgba(255,255,255,0.01), 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
  glassShadowHover: 'inset 0 2px 0 rgba(255,255,255,0.1), inset 0 1px 2px rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.18), 0 0 30px rgba(255,255,255,0.02), 0 0 1px rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25)',
  glassInner: 'inset 0 2px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.15)',
  glassBorderWidth: '1.5px',

  // Borders
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.16)',
  borderStrong: 'rgba(255,255,255,0.22)',

  // Text — slightly warm
  text: 'rgba(255,255,255,0.88)',
  textSecondary: 'rgba(255,255,255,0.50)',
  textTertiary: 'rgba(255,255,255,0.28)',
  textMuted: 'rgba(255,255,255,0.14)',

  // Accents — warm amber/gold primary
  purple: '#D4A76A', teal: '#06D6A0', pink: '#EC4899', blue: '#3B82F6', amber: '#D4A76A',
  accent: '#D4A76A',
  accentTeal: '#06D6A0',
  accentGradient: 'linear-gradient(135deg, #D4A76A, #C4956A)',
  accentSoft: 'rgba(212,167,106,0.08)',
  accentBorder: 'rgba(212,167,106,0.18)',

  // Accent glass variants — warm
  accentGlass: 'rgba(212,167,106,0.06)',
  accentGlassBorder: 'rgba(212,167,106,0.16)',
  accentGlassHover: 'rgba(212,167,106,0.12)',
  accentGlassBorderHover: 'rgba(212,167,106,0.28)',
  tealGlass: 'rgba(6,214,160,0.05)',
  tealGlassBorder: 'rgba(6,214,160,0.14)',
  tealGlassHover: 'rgba(6,214,160,0.1)',
  tealGlassBorderHover: 'rgba(6,214,160,0.25)',
  amberGlass: 'rgba(212,167,106,0.05)',
  amberGlassBorder: 'rgba(212,167,106,0.14)',

  // Status
  success: 'rgba(6,214,160,0.7)',
  warning: 'rgba(245,158,11,0.7)',
  danger: 'rgba(255,80,80,0.7)',

  // Typography — DM Sans primary
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
  weightThin: 200, weightLight: 300, weightNormal: 400, weightMedium: 500,

  // Radius — PILL shapes
  radius: 20, radiusSm: 14, radiusXl: 24, radiusPill: 50,

  // User messages
  userMsg: 'rgba(212,167,106,0.06)',
  userMsgBorder: 'rgba(212,167,106,0.14)',

  // Gradient edges
  edgePurple: 'linear-gradient(180deg, rgba(212,167,106,0.5) 0%, rgba(212,167,106,0) 100%)',
  edgeTeal: 'linear-gradient(180deg, rgba(6,214,160,0.5) 0%, rgba(6,214,160,0) 100%)',
  edgeAmber: 'linear-gradient(180deg, rgba(212,167,106,0.5) 0%, rgba(212,167,106,0) 100%)',
  edgePink: 'linear-gradient(180deg, rgba(236,72,153,0.5) 0%, rgba(236,72,153,0) 100%)',

  // Aurora orb config — warm amber dominant
  auroraOrbs: [
    { x: 0.08, y: 0.04, r: 600, c: [212, 167, 106], s: 0.2, p: 0 },     // amber
    { x: 0.85, y: 0.65, r: 580, c: [6, 214, 160], s: 0.15, p: 2 },      // teal
    { x: 0.65, y: 0.08, r: 400, c: [196, 149, 106], s: 0.18, p: 4 },    // warm brown
    { x: 0.18, y: 0.75, r: 500, c: [59, 130, 246], s: 0.12, p: 1 },     // blue (subtle)
    { x: 0.5, y: 0.4, r: 350, c: [212, 167, 106], s: 0.15, p: 3 },     // amber centre
    { x: 0.35, y: 0.2, r: 280, c: [6, 214, 160], s: 0.14, p: 5 },      // teal balance
  ],
  auroraAlpha: 0.25,
}

// Glass helper — physical slab style
export const glass = {
  background: T.glass,
  backdropFilter: T.glassBlur,
  WebkitBackdropFilter: T.glassBlur,
  border: `1.5px solid ${T.glassBorder}`,
  borderRadius: T.radiusPill,
  boxShadow: T.glassShadow,
  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
}

// Glass hover helper
export const glassHover = {
  background: T.glassHover,
  borderColor: T.glassBorderHover,
  boxShadow: T.glassShadowHover,
  transform: 'translateY(-2px)',
}

export default T
