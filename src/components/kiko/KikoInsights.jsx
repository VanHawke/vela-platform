import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKikoLive } from '@/contexts/KikoLiveContext'
import T from '@/lib/theme'
import { X, Bell, ChevronRight } from 'lucide-react'

// Badge component — sits near the prompt bar
export function InsightsBadge({ count, onClick }) {
  if (!count || count === 0) return null
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
      borderRadius: 50, background: 'rgba(245,158,11,0.04)',
      border: '1px solid rgba(245,158,11,0.1)', cursor: 'pointer',
      transition: 'all 0.15s', fontFamily: T.font,
    }}
      onMouseOver={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.2)' }}
      onMouseOut={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.04)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.1)' }}
    >
      <Bell size={12} style={{ color: 'rgba(245,158,11,0.6)' }} />
      <span style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400 }}>
        {count} alert{count !== 1 ? 's' : ''}
      </span>
      <ChevronRight size={10} style={{ color: '#A0A0A0' }} />
    </button>
  )
}

// Panel component — slides in from the right
export default function KikoInsights({ onAction, open, onClose }) {
  const { alerts, alertCount, draftActions, loading, dismissAlert, dismissAllAlerts, approveDraft, dismissDraft } = useKikoLive()
  const [expanded, setExpanded] = useState(null)
  const nav = useNavigate()

  const totalCount = alertCount + draftActions.length
  const pillStyle = { borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 299 }} />}

      <div style={{
        position: 'fixed', top: 48, right: 0, width: 380, height: 'calc(100% - 48px)',
        background: '#FFFFFF', borderLeft: `1px solid ${T.border}`,
        zIndex: 300, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.4)' : 'none',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={14} style={{ color: 'rgba(245,158,11,0.6)' }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font }}>Notifications</span>
            {totalCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 50, background: 'rgba(245,158,11,0.1)', color: 'rgba(245,158,11,0.7)', fontFamily: T.font }}>{totalCount}</span>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {alertCount > 0 && <button onClick={dismissAllAlerts} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.03)', color: '#A0A0A0', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}>Clear all</button>}
            <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.03)', color: '#A0A0A0' }}><X size={14} /></button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {loading && <p style={{ textAlign: 'center', padding: 20, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>Loading...</p>}
          {!loading && totalCount === 0 && <p style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>No notifications</p>}

          {/* Intelligence signals */}
          {alerts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#A0A0A0', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>INTELLIGENCE SIGNALS</div>
              {alerts.map(alert => (
                <div key={alert.id} style={{ marginBottom: 6, borderRadius: 12, background: 'rgba(6,214,160,0.03)', border: '1px solid rgba(6,214,160,0.08)', overflow: 'hidden' }}>
                  <div style={{ ...pillStyle, border: 'none', marginBottom: 0, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: alert.type === 'prediction' ? 'rgba(124,92,252,0.6)' : alert.type === 'self_discovery' ? 'rgba(245,158,11,0.6)' : alert.type === 'stale_deal' ? 'rgba(220,38,38,0.5)' : 'rgba(6,214,160,0.6)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#4A4A4A', fontWeight: 400, fontFamily: T.font, display: 'block', lineHeight: 1.4 }}>{alert.title}</span>
                      <span style={{ fontSize: 11, color: '#A0A0A0', fontFamily: T.font }}>{alert.type?.replace(/_/g, ' ')} · {alert.entity_name || ''} · {alert.created_at ? new Date(alert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                    </div>
                    <ChevronRight size={12} style={{ color: '#A0A0A0', transform: expanded === alert.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                  </div>
                  {/* Inline CTAs */}
                  <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
                    <button onClick={() => onAction?.(`Brief me on "${alert.title}" for ${alert.entity_name || 'this entity'}. The alert says: "${alert.detail || ''}". Search the web for latest details, then give me your strategic assessment and recommended next steps.`)}
                      style={{ padding: '4px 10px', borderRadius: 6, background: '#0A0A0A', color: '#fff', border: 'none', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Brief me</button>
                    <button onClick={() => {
                      const action = alert.detail?.includes('→') ? alert.detail.split('→').pop().trim() : alert.detail?.slice(0, 200) || alert.title
                      onAction?.(`Take action on this alert for ${alert.entity_name || 'the entity'}: ${action}. Full context: ${alert.title}. Do what needs to be done — draft an email, update the pipeline, research the company, or whatever the right next step is.`)
                    }}
                      style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(0,212,170,0.1)', color: '#06a87d', border: '1px solid rgba(0,212,170,0.2)', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Act on this</button>
                    <button onClick={(e) => { e.stopPropagation(); dismissAlert(alert) }}
                      style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: '#A0A0A0', border: '1px solid rgba(0,0,0,0.06)', fontSize: 10, fontFamily: T.font, cursor: 'pointer' }}>×</button>
                  </div>
                  {/* Expanded detail */}
                  {expanded === alert.id && alert.detail && (
                    <div style={{ padding: '0 14px 10px', borderTop: '1px solid rgba(6,214,160,0.08)' }}>
                      <p style={{ fontSize: 12, color: '#5A6470', fontFamily: T.font, lineHeight: 1.6, margin: '8px 0', whiteSpace: 'pre-line' }}>{alert.detail}</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {alert.entity_name && (
                          <button onClick={() => onAction?.(`Search the web for the latest news about ${alert.entity_name}. What are they doing right now?`)}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.04)', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.08)', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Research {alert.entity_name}</button>
                        )}
                        {(alert.type === 'new_partnership' || alert.type === 'partnership_detected') && (
                          <button onClick={() => onAction?.(`Add this to the partnership matrix: "${alert.title}". Search the web for details.`)}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(124,92,252,0.06)', color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.15)', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Add to matrix</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Suggested actions — with clear CTAs */}
          {draftActions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#A0A0A0', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>SUGGESTED ACTIONS</div>
              {draftActions.map(draft => (
                <div key={draft.id} style={{ marginBottom: 6, borderRadius: 12, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, color: '#4A4A4A', fontWeight: 500, fontFamily: T.font, marginBottom: 2 }}>{draft.payload?.entity || 'Action'}</div>
                    <div style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400, fontFamily: T.font, lineHeight: 1.5 }}>{draft.payload?.suggested_action || 'Follow up'}</div>
                  </div>
                  <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
                    <button onClick={async () => { const prompt = await approveDraft(draft); onAction?.(prompt) }}
                      style={{ padding: '4px 10px', borderRadius: 6, background: '#0A0A0A', color: '#fff', border: 'none', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Do this</button>
                    <button onClick={() => onAction?.(`Brief me on ${draft.payload?.entity || 'this entity'}. Context: ${draft.payload?.context || draft.payload?.suggested_action || ''}. What's our current status and what should I do?`)}
                      style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(0,212,170,0.1)', color: '#06a87d', border: '1px solid rgba(0,212,170,0.2)', fontSize: 10, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Brief me first</button>
                    <button onClick={() => dismissDraft(draft)}
                      style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: '#A0A0A0', border: '1px solid rgba(0,0,0,0.06)', fontSize: 10, fontFamily: T.font, cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
