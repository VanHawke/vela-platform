// src/components/ui/Toast.jsx — Lightweight app-wide toast notifications
// Usage: import { showToast } from '@/components/ui/Toast'
//        showToast('Email logged', 'success')
//        showToast('Google token expired — reconnect in Settings', 'error')
//        showToast('Saving...', 'loading')
import { useState, useEffect, useCallback } from 'react'

let toastListener = null

export function showToast(message, type = 'info', duration = 3500) {
  if (toastListener) toastListener({ message, type, duration, id: Date.now() })
}

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '⟳',
}

const COLORS = {
  success: { bg: 'rgba(6,214,160,0.12)', border: 'rgba(6,214,160,0.25)', text: '#06a87d' },
  error: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', text: '#dc2626' },
  warning: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#d97706' },
  info: { bg: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.10)', text: '#0A0A0A' },
  loading: { bg: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.10)', text: '#6B6B6B' },
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((toast) => {
    setToasts(prev => [...prev.slice(-4), toast]) // Max 5 visible
    if (toast.type !== 'loading') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.duration)
    }
  }, [])

  useEffect(() => {
    toastListener = addToast
    return () => { toastListener = null }
  }, [addToast])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map((t, i) => {
        const c = COLORS[t.type] || COLORS.info
        return (
          <div key={t.id} onClick={() => dismiss(t.id)} style={{
            padding: '10px 18px', borderRadius: 10, background: c.bg,
            border: `1px solid ${c.border}`, color: c.text,
            fontSize: 13, fontWeight: 450, fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            animation: 'toastIn 250ms cubic-bezier(0.34,1.56,0.64,1)',
            pointerEvents: 'auto', cursor: 'pointer',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            opacity: i === 0 ? 1 : 0.9,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, animation: t.type === 'loading' ? 'kikoVortexSpin 1s linear infinite' : 'none' }}>{ICONS[t.type]}</span>
            {t.message}
          </div>
        )
      })}
      <style>{`@keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
