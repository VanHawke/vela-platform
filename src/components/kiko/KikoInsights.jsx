import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { X, Check, Trash2, Bell, ChevronRight } from 'lucide-react'

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
  const [alertCount, setAlertCount] = useState(0)
  const [partnershipAlerts, setPartnershipAlerts] = useState([])
  const [draftActions, setDraftActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null) // track which alert is expanded
  const nav = useNavigate()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [alertRes, partnerRes, signalRes, draftRes] = await Promise.all([
        supabase.from('kiko_alerts').select('id', { count: 'exact', head: true }).eq('dismissed', false),
        supabase.from('kiko_alerts').select('id,title,detail,entity_name,type,metadata,created_at')
          .in('type', ['new_partnership', 'partnership_detected', 'convergence', 'competitive_change', 'funding', 'category_recommendation', 'promotion'])
          .eq('dismissed', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('kiko_alerts').select('id,title,detail,entity_name,type,severity,metadata,created_at')
          .in('type', ['company_signal', 'prediction', 'self_discovery', 'proactive_intel'])
          .eq('dismissed', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('kiko_draft_actions').select('id,action_type,payload,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      ])
      setAlertCount(alertRes.count || 0)
      setPartnershipAlerts([...(partnerRes.data || []), ...(signalRes.data || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)))
      setDraftActions(draftRes.data || [])
    } catch (e) { console.error('[KikoInsights]', e) }
    finally { setLoading(false) }
  }

  // Expose count for the badge
  useEffect(() => {
    if (window) window.__kikoAlertCount = alertCount + draftActions.length
  }, [alertCount, draftActions])

  const approveDraft = async (draft) => {
    await supabase.from('kiko_draft_actions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    setDraftActions(prev => prev.filter(d => d.id !== draft.id))
    onAction?.(`Execute the approved action: ${draft.payload?.suggested_action || 'follow up'} for ${draft.payload?.entity || 'the contact'}`)
  }

  const dismissDraft = async (draft) => {
    await supabase.from('kiko_draft_actions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    setDraftActions(prev => prev.filter(d => d.id !== draft.id))
  }

  const dismissPartnership = async (alert) => {
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', alert.id)
    setPartnershipAlerts(prev => prev.filter(a => a.id !== alert.id))
    setAlertCount(prev => Math.max(0, prev - 1))
  }

  const dismissAll = async () => {
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('dismissed', false)
    setAlertCount(0)
    setPartnershipAlerts([])
  }

  const totalCount = alertCount + draftActions.length
  const pillStyle = { borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }
  const btnBase = { width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }

  return (
    <>
      {/* Overlay backdrop */}
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 299 }} />}

      {/* Right slide panel */}
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
            {alertCount > 0 && <button onClick={dismissAll} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.03)', color: '#A0A0A0', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#6B6B6B' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#A0A0A0' }}>Clear all</button>}
            <button onClick={onClose} style={{ ...btnBase, background: 'rgba(0,0,0,0.03)', color: '#A0A0A0' }}><X size={14} /></button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {loading && <p style={{ textAlign: 'center', padding: 20, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>Loading...</p>}

          {!loading && totalCount === 0 && <p style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>No notifications</p>}

          {/* Section: Partnership signals */}
          {partnershipAlerts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#A0A0A0', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>INTELLIGENCE SIGNALS</div>
              {partnershipAlerts.map(alert => (
                <div key={alert.id} style={{ marginBottom: 4 }}>
                  <div style={{ ...pillStyle, background: expanded === alert.id ? 'rgba(6,214,160,0.06)' : 'rgba(6,214,160,0.03)', border: '1px solid rgba(6,214,160,0.08)', cursor: 'pointer', borderRadius: expanded === alert.id ? '12px 12px 0 0' : 12 }}
                    onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: alert.type === 'prediction' ? 'rgba(124,92,252,0.6)' : alert.type === 'self_discovery' ? 'rgba(245,158,11,0.6)' : 'rgba(6,214,160,0.6)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#6B6B6B', fontWeight: 400, fontFamily: T.font, display: 'block', lineHeight: 1.4 }}>{alert.title}</span>
                      <span style={{ fontSize: 11, color: '#A0A0A0', fontFamily: T.font }}>{alert.entity_name ? alert.entity_name + ' · ' : ''}{alert.created_at ? new Date(alert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                    </div>
                    <ChevronRight size={12} style={{ color: '#A0A0A0', transform: expanded === alert.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                    <button onClick={(e) => { e.stopPropagation(); dismissPartnership(alert) }} style={{ ...btnBase, background: 'transparent', color: '#A0A0A0' }}><X size={10} /></button>
                  </div>
                  {/* Expanded detail + action buttons */}
                  {expanded === alert.id && (
                    <div style={{ padding: '10px 14px', background: 'rgba(6,214,160,0.03)', borderLeft: '1px solid rgba(6,214,160,0.08)', borderRight: '1px solid rgba(6,214,160,0.08)', borderBottom: '1px solid rgba(6,214,160,0.08)', borderRadius: '0 0 12px 12px', marginTop: -1 }}>
                      {alert.detail && <p style={{ fontSize: 12.5, color: '#5A6470', fontFamily: T.font, lineHeight: 1.6, margin: '0 0 10px', whiteSpace: 'pre-line' }}>{alert.detail}</p>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => { onAction?.(`Brief me on "${alert.title}" for ${alert.entity_name || 'this entity'}. The alert says: "${alert.detail || ''}". Search the web for latest details, then give me your strategic assessment and recommended next steps.`); onClose?.() }}
                          style={{ padding: '5px 12px', borderRadius: 6, background: '#0A0A0A', color: '#fff', border: 'none', fontSize: 11, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Brief me</button>
                        {alert.detail?.includes('→') && (
                          <button onClick={() => {
                            const action = alert.detail.split('→').pop().trim()
                            onAction?.(`Execute this recommended action for ${alert.entity_name || 'the entity'}: ${action}. Context: ${alert.title}. ${alert.detail || ''}`)
                            onClose?.()
                          }}
                            style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(0,212,170,0.1)', color: '#06a87d', border: '1px solid rgba(0,212,170,0.2)', fontSize: 11, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Take action</button>
                        )}
                        {alert.entity_name && (
                          <button onClick={() => { onAction?.(`Search the web for the latest news about ${alert.entity_name}. What are they doing right now? Any sponsorship activity, partnerships, leadership changes, or funding?`); onClose?.() }}
                            style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.04)', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.08)', fontSize: 11, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Research</button>
                        )}
                        {(alert.type === 'new_partnership' || alert.type === 'partnership_detected') && (
                          <button onClick={() => { onAction?.(`Add this to the partnership matrix: "${alert.title}". Search the web for details — identify the team, the sponsor, the category, and update the matrix.`); onClose?.() }}
                            style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(124,92,252,0.06)', color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.15)', fontSize: 11, fontFamily: T.font, fontWeight: 500, cursor: 'pointer' }}>Add to matrix</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Section: Draft actions */}
          {draftActions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#A0A0A0', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>SUGGESTED ACTIONS</div>
              {draftActions.map(draft => (
                <div key={draft.id} style={{ ...pillStyle, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'rgba(0,0,0,0.35)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: '#6B6B6B', fontWeight: 500, fontFamily: T.font }}>{draft.payload?.entity || 'Action'}: </span>
                    <span style={{ fontSize: 13, color: '#A0A0A0', fontWeight: 400, fontFamily: T.font }}>{(draft.payload?.suggested_action || 'Follow up').slice(0, 80)}</span>
                  </div>
                  <button onClick={() => approveDraft(draft)} style={{ ...btnBase, background: 'rgba(0,212,170,0.06)', color: 'rgba(0,212,170,0.6)' }}><Check size={12} /></button>
                  <button onClick={() => dismissDraft(draft)} style={{ ...btnBase, background: 'transparent', color: '#A0A0A0' }}><Trash2 size={10} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Summary pill if there are more alerts beyond partnerships */}
          {alertCount > partnershipAlerts.length && (
            <div style={{ ...pillStyle, background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.06)', cursor: 'pointer' }}
              onClick={() => { onAction?.('Brief me on all outstanding alerts'); onClose?.() }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'rgba(245,158,11,0.5)' }} />
              <span style={{ fontSize: 13, color: '#6B6B6B', fontFamily: T.font }}>{alertCount - partnershipAlerts.length} more alert{alertCount - partnershipAlerts.length !== 1 ? 's' : ''} — tap to brief</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
