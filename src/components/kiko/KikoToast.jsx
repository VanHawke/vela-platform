import { useState, useEffect } from 'react'
import T from '@/lib/theme'

export default function KikoToast() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (e) => {
      const { taskId, query, conversationId } = e.detail
      const toast = { id: taskId, query: query?.slice(0, 60), conversationId, timestamp: Date.now() }
      setToasts(prev => [...prev, toast])
      // Auto-dismiss after 8 seconds
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== taskId)), 8000)
    }
    window.addEventListener('kiko_task_complete', handler)
    return () => window.removeEventListener('kiko_task_complete', handler)
  }, [])

  if (!toasts.length) return null

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))
  const goToChat = (toast) => {
    dismiss(toast.id)
    // Navigate to home to open chat
    window.location.href = '/'
  }

  return (
    <div style={{ position: 'fixed', bottom: 80, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          background: 'rgba(10,10,14,0.95)', backdropFilter: 'blur(40px)',
          border: '1px solid rgba(6,214,160,0.15)', borderRadius: 14,
          padding: '12px 16px', minWidth: 280, maxWidth: 360,
          boxShadow: '0 8px 32px var(--border), 0 0 20px rgba(6,214,160,0.05)',
          animation: 'kikoFadeUp 0.3s ease-out',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(6,214,160,0.7)', flexShrink: 0, boxShadow: '0 0 8px rgba(6,214,160,0.4)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--foreground)', fontFamily: T.font }}>Kiko completed a task</div>
            <div style={{ fontSize: 11, color: 'var(--border)', fontFamily: T.font, fontWeight: 300, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.query}</div>
          </div>
          <button onClick={() => goToChat(toast)} style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(6,214,160,0.12)',
            background: 'rgba(6,214,160,0.06)', color: 'rgba(6,214,160,0.6)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, fontWeight: 300, flexShrink: 0,
          }}>View</button>
          <button onClick={() => dismiss(toast.id)} style={{
            background: 'none', border: 'none', color: 'var(--border)',
            cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      ))}
    </div>
  )
}
