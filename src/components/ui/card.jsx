// src/components/ui/Card.jsx — base card primitive
import { t } from '@/lib/tokens'

export function Card({ children, style = {}, padding = 20, hover = false, onClick, ...rest }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: t.card,
        color: t.cardFg,
        border: `1px solid ${t.border}`,
        borderRadius: t.radiusLg,
        padding,
        boxShadow: t.shadowSm,
        transition: hover ? 'all 0.15s' : 'none',
        cursor: onClick || hover ? 'pointer' : 'default',
        fontFamily: t.fontSans,
        ...style,
      }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.boxShadow = t.shadowMd; e.currentTarget.style.borderColor = t.ring } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.boxShadow = t.shadowSm; e.currentTarget.style.borderColor = t.border } : undefined}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, style = {} }) {
  return <div style={{ marginBottom: 12, ...style }}>{children}</div>
}

export function CardTitle({ children, style = {} }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, color: t.cardFg, margin: 0, fontFamily: t.fontSans, ...style }}>{children}</h3>
}

export function CardDescription({ children, style = {} }) {
  return <p style={{ fontSize: 13, color: t.mutedFg, margin: '4px 0 0', fontFamily: t.fontSans, ...style }}>{children}</p>
}
