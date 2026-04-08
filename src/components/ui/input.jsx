// src/components/ui/Input.jsx — input + textarea primitives
import { t } from '@/lib/tokens'

const baseStyle = {
  background: t.bg,
  color: t.fg,
  border: `1px solid ${t.input}`,
  borderRadius: t.radius,
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: t.fontSans,
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.15s',
}

export function Input({ style = {}, ...rest }) {
  return (
    <input
      style={{ ...baseStyle, height: 36, ...style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = t.ring }}
      onBlur={(e) => { e.currentTarget.style.borderColor = t.input }}
      {...rest}
    />
  )
}

export function Textarea({ style = {}, rows = 4, ...rest }) {
  return (
    <textarea
      rows={rows}
      style={{ ...baseStyle, resize: 'vertical', minHeight: 80, ...style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = t.ring }}
      onBlur={(e) => { e.currentTarget.style.borderColor = t.input }}
      {...rest}
    />
  )
}

export function Label({ children, style = {}, ...rest }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 500, color: t.fg, fontFamily: t.fontSans, display: 'block', marginBottom: 6, ...style }} {...rest}>
      {children}
    </label>
  )
}
