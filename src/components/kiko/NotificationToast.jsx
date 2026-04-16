// src/components/kiko/NotificationToast.jsx
// Shows realtime toast notifications when kiko_notifications rows are inserted.
// Sunny spec 2026-04-12 v0.0.39: powers sequence-send toasts (and any future
// notification type — meeting reminders, deal updates, etc.).
//
// Behaviour:
// - Subscribes to INSERT events on kiko_notifications filtered by user_id
// - Pops a toast in the bottom-right corner
// - Auto-dismisses after 8 seconds
// - Click toast to navigate to notification.link
// - Stacks up to 4 toasts at once

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUserSettings } from '@/lib/useUserSettings'
import { Bell, X, Check, Mail, AlertCircle } from 'lucide-react'

const ICONS = {
  sequence_send: Mail,
  default: Bell,
  alert: AlertCircle,
  success: Check,
}

const COLORS = {
  sequence_send: { bg: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.10)', icon: '#0A0A0A' },
  alert: { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)', icon: '#F87171' },
  success: { bg: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.10)', icon: '#0A0A0A' },
  default: { bg: 'rgba(0,0,0,0.06)', border: 'rgba(0,0,0,0.10)', icon: '#0A0A0A' },
}

export default function NotificationToast({ user }) {
  const [toasts, setToasts] = useState([])
  const [prefs, setPrefs] = useState({ sequence_send: true, alert: true, default: true })
  const navigate = useNavigate()
  const { row: userSettings } = useUserSettings(user)

  // Read notification preferences from the shared user_settings row
  useEffect(() => {
    if (userSettings?.notification_prefs && typeof userSettings.notification_prefs === 'object') {
      setPrefs({ sequence_send: true, alert: true, default: true, ...userSettings.notification_prefs })
    }
  }, [userSettings?.notification_prefs])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kiko_notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new
          if (!n) return
          // Check mute preference for this notification type
          const typeKey = n.type in prefs ? n.type : 'default'
          if (prefs[typeKey] === false) return  // muted, skip toast
          setToasts(prev => {
            const next = [...prev, n].slice(-4)
            return next
          })
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== n.id))
          }, 8000)
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [user?.id, prefs])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const onClick = (toast) => {
    if (toast.link) navigate(toast.link)
    dismiss(toast.id)
    // Mark as read
    supabase.from('kiko_notifications').update({ read: true }).eq('id', toast.id).then(() => {})
  }

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
      display: 'flex', flexDirection: 'column', gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || ICONS.default
        const c = COLORS[toast.type] || COLORS.default
        return (
          <div key={toast.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            width: 320, padding: 14,
            background: '#FFFFFF',
            borderRadius: 12,
            border: `1px solid ${c.border}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 12px 28px rgba(0,0,0,0.12)',
            pointerEvents: 'auto',
            cursor: toast.link ? 'pointer' : 'default',
            animation: 'slideInRight 0.3s ease-out',
          }}
            onClick={() => onClick(toast)}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: c.bg, border: `1px solid ${c.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={14} color={c.icon} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                {toast.title}
              </div>
              {toast.body && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
                  {toast.body}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); dismiss(toast.id) }} style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={11} />
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
