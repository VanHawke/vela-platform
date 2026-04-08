// src/components/ui/Button.jsx — button primitive
import { t } from '@/lib/tokens'

const variants = {
  primary: { bg: t.primary, color: t.primaryFg, border: t.primary, hoverBg: '#d97706' },
  secondary: { bg: t.secondary, color: t.secondaryFg, border: t.border, hoverBg: t.muted },
  ghost: { bg: 'transparent', color: t.fg, border: 'transparent', hoverBg: t.muted },
  outline: { bg: 'transparent', color: t.fg, border: t.border, hoverBg: t.accent },
  destructive: { bg: t.destructive, color: t.destructiveFg, border: t.destructive, hoverBg: '#dc2626' },
}

const sizes = {
  sm: { padding: '6px 12px', fontSize: 12, height: 30 },
  md: { padding: '8px 16px', fontSize: 13, height: 36 },
  lg: { padding: '10px 20px', fontSize: 14, height: 42 },
}

export function Button({ children, variant = 'primary', size = 'md', onClick, disabled, style = {}, type = 'button', ...rest }) {
  const v = variants[variant] || variants.primary
  const s = sizes[size] || sizes.md
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        borderRadius: t.radius,
        padding: s.padding,
        fontSize: s.fontSize,
        height: s.height,
        fontWeight: 500,
        fontFamily: t.fontSans,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = v.hoverBg }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = v.bg }}
      {...rest}
    >
      {children}
    </button>
  )
}
