// src/components/layout/RedesignToggle.jsx
// Floating toggle bottom-left. Single button. Click to flip between OLD and NEW chrome.
// Shown only in dev/preview, not in production by default — gated by hostname check.

import { isRedesignOn, setRedesignOn } from '@/lib/redesignFlag'

export default function RedesignToggle() {
  const on = isRedesignOn()
  const isPreview = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('redesign')
  )
  if (!isPreview) return null

  return (
    <button
      onClick={() => setRedesignOn(!on)}
      title={on ? 'Switch to OLD chrome' : 'Switch to NEW Legora chrome'}
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        height: 32,
        padding: '0 14px',
        background: on ? '#0A0A0A' : 'rgba(255,255,255,0.92)',
        color: on ? 'white' : '#0A0A0A',
        border: on ? 'none' : '1px solid rgba(0,0,0,0.10)',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '0.04em',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(8px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{
        display: 'inline-block',
        width: 6, height: 6, borderRadius: '50%',
        background: on ? '#7d8a64' : '#A0A0A0',
      }} />
      {on ? 'NEW chrome' : 'OLD chrome'}
    </button>
  )
}
