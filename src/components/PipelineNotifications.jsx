import { useState, useEffect, useCallback } from 'react'
import { Bell, BellRing, X, Mail, MessageSquare, Zap, UserCheck, ChevronRight, Check, Trophy } from 'lucide-react'

const T = {
  bg: 'transparent', surface: 'rgba(255,255,255,0.65)',
  border: 'rgba(255,255,255,0.5)', borderHover: 'rgba(255,255,255,0.7)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', yellow: '#FF9500', green: '#34C759',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const TYPE_CONFIG = {
  reply: { icon: MessageSquare, color: T.red, bg: 'rgba(255,59,48,0.08)', label: 'Reply' },
  interested: { icon: UserCheck, color: T.green, bg: 'rgba(52,199,89,0.08)', label: 'Interested' },
  new_lead: { icon: Zap, color: T.blue, bg: 'rgba(0,122,255,0.08)', label: 'New Lead' },
  new_partnership: { icon: Trophy, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: 'F1 Partnership' },
  engagement: { icon: Mail, color: T.yellow, bg: 'rgba(255,149,0,0.08)', label: 'Engaged' },
  stage_change: { icon: ChevronRight, color: T.blue, bg: 'rgba(0,122,255,0.08)', label: 'Stage Change' },
  deal_won: { icon: Check, color: T.green, bg: 'rgba(52,199,89,0.08)', label: 'Won' },
  deal_lost: { icon: X, color: T.red, bg: 'rgba(255,59,48,0.08)', label: 'Lost' },
}

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function PipelineNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline-notifications?action=list&limit=15')
      const d = await res.json()
      setNotifications(d.notifications || [])
      setUnread(d.unread || 0)
    } catch (e) { console.error('[Notifs]', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const markRead = async (id) => {
    await fetch('/api/pipeline-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    })
    fetchNotifications()
  }

  const dismiss = async (id) => {
    await fetch('/api/pipeline-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', id }),
    })
    fetchNotifications()
  }

  if (loading) return null
  if (notifications.length === 0) return (
    <div style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, padding: 20, fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bell size={16} style={{ color: T.textTertiary }} />
        <span style={{ fontSize: 13, color: T.textTertiary }}>No activity yet. Notifications appear here when prospects interact with campaigns or new F1 partnerships are announced.</span>
      </div>
    </div>
  )

  return (
    <div style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, overflow: 'hidden', fontFamily: T.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unread > 0 ? <BellRing size={15} style={{ color: T.red }} /> : <Bell size={15} style={{ color: T.textTertiary }} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Pipeline Activity</span>
          {unread > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: T.red, borderRadius: 8, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{unread}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unread > 0 && (
            <button onClick={(e) => { e.stopPropagation(); markRead('all') }}
              style={{ fontSize: 10, color: T.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font }}>
              Mark all read
            </button>
          )}
          <span style={{ fontSize: 10, color: T.textTertiary, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {/* Notification list */}
      {expanded && (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {notifications.map(n => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.new_lead
            const Icon = config.icon
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
                borderBottom: `1px solid ${T.border}`,
                background: n.is_read ? 'transparent' : 'rgba(0,122,255,0.02)',
                transition: 'background 0.15s',
              }} onMouseOver={e => e.currentTarget.style.background = T.accentSoft}
                 onMouseOut={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(0,122,255,0.02)'}>
                {/* Icon */}
                <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: config.bg, flexShrink: 0, marginTop: 2 }}>
                  <Icon size={13} style={{ color: config.color }} />
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: n.is_read ? 400 : 600, color: T.text }}>{n.title}</span>
                    {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: 3, background: T.blue, flexShrink: 0 }} />}
                  </div>
                  <p style={{ fontSize: 11, color: T.textSecondary, margin: '2px 0 0', lineHeight: 1.4 }}>{n.body}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 9, color: config.color, background: config.bg, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{config.label}</span>
                    {n.pipeline && <span style={{ fontSize: 9, color: T.textTertiary, background: T.accentSoft, padding: '1px 5px', borderRadius: 3 }}>{n.pipeline}</span>}
                    {n.stage && <span style={{ fontSize: 9, color: T.textTertiary }}>{n.stage}</span>}
                    <span style={{ fontSize: 9, color: T.textTertiary, marginLeft: 'auto' }}>{timeAgo(n.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  {!n.is_read && (
                    <button onClick={() => markRead(n.id)} title="Mark read"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}>
                      <Check size={12} color={T.textSecondary} />
                    </button>
                  )}
                  <button onClick={() => dismiss(n.id)} title="Dismiss"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.3 }}>
                    <X size={12} color={T.textSecondary} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
