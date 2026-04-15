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
  const nav = useNavigate()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [alertRes, partnerRes, draftRes] = await Promise.all([
        supabase.from('kiko_alerts').select('id', { count: 'exact', head: true }).eq('dismissed', false),
        supabase.from('kiko_alerts').select('id,title,detail,entity_name,metadata').eq('type', 'new_partnership').eq('dismissed', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('kiko_draft_actions').select('id,action_type,payload,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      ])
      setAlertCount(alertRes.count || 0)
      setPartnershipAlerts(partnerRes.data || [])
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
              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#A0A0A0', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>PARTNERSHIP SIGNALS</div>
              {partnershipAlerts.map(alert => (
                <div key={alert.id} style={{ ...pillStyle, background: 'rgba(6,214,160,0.03)', border: '1px solid rgba(6,214,160,0.08)' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'rgba(6,214,160,0.6)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: '#6B6B6B', fontWeight: 400, fontFamily: T.font, display: 'block', lineHeight: 1.4 }}>{alert.title}</span>
                  </div>
                  <button onClick={() => { onAction?.(`Tell me about the ${alert.entity_name} partnership announcement`); onClose?.() }}
                    style={{ ...btnBase, background: 'rgba(0,0,0,0.04)', color: 'rgba(124,92,252,0.6)', fontSize: 10, width: 'auto', borderRadius: 6, padding: '0 8px', fontFamily: T.font }}>Discuss</button>
                  <button onClick={() => { nav('/partnership-matrix'); onClose?.() }}
                    style={{ ...btnBase, background: 'rgba(0,212,170,0.04)', color: 'rgba(0,212,170,0.5)', fontSize: 10, width: 'auto', borderRadius: 6, padding: '0 8px', fontFamily: T.font }}>Matrix</button>
                  <button onClick={() => dismissPartnership(alert)} style={{ ...btnBase, background: 'transparent', color: '#A0A0A0' }}><X size={10} /></button>
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
                  <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'rgba(124,92,252,0.5)' }} />
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
