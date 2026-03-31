import { useState, useEffect, useCallback } from 'react'
import { Zap, Check, X, ArrowRight, Mail, ListTodo, ChevronRight } from 'lucide-react'

const T = {
  bg: '#000000', surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)', borderHover: 'rgba(255,255,255,0.1)',
  text: 'rgba(255,255,255,0.95)', textSecondary: 'rgba(255,255,255,0.55)', textTertiary: 'rgba(255,255,255,0.32)',
  accent: 'rgba(255,255,255,0.12)', accentSoft: 'rgba(255,255,255,0.04)',
  purple: '#8B6CF6', teal: '#06D6A0', red: '#FF3B30', blue: '#007AFF',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const ACTION_CONFIG = {
  follow_up: { icon: Mail, color: T.blue, bg: 'rgba(0,122,255,0.08)', label: 'Follow Up' },
  email: { icon: Mail, color: T.blue, bg: 'rgba(0,122,255,0.08)', label: 'Email' },
  deal_move: { icon: ArrowRight, color: T.purple, bg: 'rgba(139,92,246,0.08)', label: 'Move Deal' },
  task_create: { icon: ListTodo, color: T.teal, bg: 'rgba(6,214,160,0.08)', label: 'Create Task' },
  task: { icon: ListTodo, color: T.teal, bg: 'rgba(6,214,160,0.08)', label: 'Task' },
}

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function DraftActions() {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [processing, setProcessing] = useState({})

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/kiko-draft-actions?action=list&limit=10')
      const d = await res.json()
      setDrafts(d.drafts || [])
    } catch (e) { console.error('[DraftActions]', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchDrafts()
    const interval = setInterval(fetchDrafts, 60000)
    return () => clearInterval(interval)
  }, [fetchDrafts])

  const handleAction = async (id, action) => {
    setProcessing(p => ({ ...p, [id]: action }))
    try {
      const res = await fetch('/api/kiko-draft-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      })
      const data = await res.json()
      if (data.success) {
        // Brief flash before removing
        setTimeout(() => fetchDrafts(), 600)
      }
    } catch (e) { console.error('[DraftActions]', e) }
    finally { setTimeout(() => setProcessing(p => { const n = { ...p }; delete n[id]; return n }), 800) }
  }

  if (loading) return null
  if (drafts.length === 0) return null // Don't show widget if no pending actions

  return (
    <div style={{ background: T.surface, borderRadius: 18, border: `1px solid ${T.border}`, overflow: 'hidden', fontFamily: T.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={15} style={{ color: T.purple }} />
          <span style={{ fontSize: 14, fontWeight: 400, color: T.text }}>Kiko Draft Actions</span>
          <span style={{
            fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.9)',
            background: T.purple, borderRadius: 50, padding: '1px 6px', minWidth: 18, textAlign: 'center',
          }}>{drafts.length}</span>
        </div>
        <span style={{ fontSize: 11, color: T.textTertiary, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {/* Draft action list */}
      {expanded && (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {drafts.map(d => {
            const config = ACTION_CONFIG[d.action_type] || ACTION_CONFIG.task
            const Icon = config.icon
            const entity = d.payload?.entity || d.payload?.company || d.payload?.contact || ''
            const suggestion = d.payload?.suggested_action || d.payload?.action || d.payload?.description || ''
            const isProcessing = processing[d.id]
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
                borderBottom: `1px solid ${T.border}`,
                background: isProcessing === 'approve' ? 'rgba(52,199,89,0.04)' : isProcessing === 'dismiss' ? 'rgba(255,59,48,0.04)' : 'transparent',
                transition: 'background 0.3s, opacity 0.3s',
                opacity: isProcessing ? 0.5 : 1,
              }}>
                {/* Icon */}
                <div style={{ width: 28, height: 28, borderRadius: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: config.bg, flexShrink: 0, marginTop: 2 }}>
                  <Icon size={13} style={{ color: config.color }} />
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{entity}</span>
                  </div>
                  <p style={{ fontSize: 12, color: T.textSecondary, margin: '2px 0 0', lineHeight: 1.4 }}>{suggestion}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: config.color, background: config.bg, padding: '1px 5px', borderRadius: 3, fontWeight: 400 }}>{config.label}</span>
                    {d.source && <span style={{ fontSize: 10, color: T.textTertiary, background: T.accentSoft, padding: '1px 5px', borderRadius: 3 }}>{d.source}</span>}
                    <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 'auto' }}>{timeAgo(d.created_at)}</span>
                  </div>
                </div>
                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, marginTop: 2 }}>
                  <button
                    onClick={() => handleAction(d.id, 'approve')}
                    disabled={!!isProcessing}
                    title="Approve"
                    style={{
                      background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.2)',
                      borderRadius: 6, cursor: isProcessing ? 'default' : 'pointer', padding: '4px 8px',
                      display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { if (!isProcessing) { e.currentTarget.style.background = 'rgba(52,199,89,0.2)'; e.currentTarget.style.borderColor = 'rgba(52,199,89,0.4)' } }}
                    onMouseOut={e => { e.currentTarget.style.background = 'rgba(52,199,89,0.1)'; e.currentTarget.style.borderColor = 'rgba(52,199,89,0.2)' }}
                  >
                    <Check size={11} color="#34C759" />
                    <span style={{ fontSize: 10, color: '#34C759', fontWeight: 500, fontFamily: T.font }}>Approve</span>
                  </button>
                  <button
                    onClick={() => handleAction(d.id, 'dismiss')}
                    disabled={!!isProcessing}
                    title="Dismiss"
                    style={{
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, cursor: isProcessing ? 'default' : 'pointer', padding: '4px 8px',
                      display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { if (!isProcessing) { e.currentTarget.style.background = 'rgba(255,59,48,0.08)' } }}
                    onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    <X size={11} color={T.textTertiary} />
                    <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font }}>Dismiss</span>
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
