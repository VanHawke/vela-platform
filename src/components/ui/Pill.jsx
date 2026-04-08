// src/components/ui/Pill.jsx — Badge / pill / tag primitive
import { t } from '@/lib/tokens'

const tones = {
  default: { bg: t.secondary, color: t.secondaryFg, border: t.border },
  primary: { bg: t.accent, color: t.accentFg, border: t.primary },
  success: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  warning: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  danger: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  muted: { bg: t.muted, color: t.mutedFg, border: t.border },
}

export function Pill({ children, tone = 'default', size = 'sm', style = {}, onClick, ...rest }) {
  const tn = tones[tone] || tones.default
  const padding = size === 'xs' ? '2px 6px' : size === 'md' ? '4px 10px' : '3px 8px'
  const fontSize = size === 'xs' ? 10 : size === 'md' ? 12 : 11
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: tn.bg,
        color: tn.color,
        border: `1px solid ${tn.border}`,
        borderRadius: 999,
        padding,
        fontSize,
        fontWeight: 500,
        fontFamily: t.fontSans,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
