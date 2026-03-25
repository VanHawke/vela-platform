import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { X, Check, Trash2, ExternalLink } from 'lucide-react'

export default function KikoInsights({ onAction }) {
  const [alertCount, setAlertCount] = useState(0)
  const [partnershipAlerts, setPartnershipAlerts] = useState([])
  const [draftActions, setDraftActions] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    const d = sessionStorage.getItem('kiko_alerts_dismissed')
    if (d === 'true') { setDismissed(true); setLoading(false); return }
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [alertRes, partnerRes, draftRes] = await Promise.all([
        supabase.from('kiko_alerts').select('id', { count: 'exact', head: true }).eq('dismissed', false),
        supabase.from('kiko_alerts').select('id,title,detail,entity_name,metadata').eq('type', 'new_partnership').eq('dismissed', false).order('created_at', { ascending: false }).limit(3),
        supabase.from('kiko_draft_actions').select('id,action_type,payload,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(3),
      ])
      setAlertCount(alertRes.count || 0)
      setPartnershipAlerts(partnerRes.data || [])
      setDraftActions(draftRes.data || [])
    } catch (e) { console.error('[KikoInsights]', e) }
    finally { setLoading(false) }
  }


  const dismiss = () => { setDismissed(true); sessionStorage.setItem('kiko_alerts_dismissed', 'true') }

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

  if (loading || dismissed || (alertCount === 0 && draftActions.length === 0 && partnershipAlerts.length === 0)) return null

  const pillStyle = { borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }
  const btnBase = { width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }

  return (
    <div style={{ width: '100%', maxWidth: 540, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>


      {/* Alerts pill */}
      {alertCount > 0 && (
        <div style={{ ...pillStyle, background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.1)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'rgba(245,158,11,0.6)', boxShadow: '0 0 8px rgba(245,158,11,0.3)' }} />
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onAction?.('Brief me on outstanding alerts and convergence signals')}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 400, fontFamily: T.font }}>
              {alertCount} new alert{alertCount !== 1 ? 's' : ''} — partnership signals &amp; updates
            </span>
          </div>
          <button onClick={dismiss} style={{ ...btnBase, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}>
            <X size={11} />
          </button>
        </div>
      )}

      {/* Partnership alerts — specific announcements with action buttons */}
      {partnershipAlerts.map(alert => (
        <div key={alert.id} style={{ ...pillStyle, background: 'rgba(6,214,160,0.03)', border: '1px solid rgba(6,214,160,0.12)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'rgba(6,214,160,0.7)', boxShadow: '0 0 8px rgba(6,214,160,0.3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontFamily: T.font }}>{alert.title}</span>
          </div>
          <button onClick={() => onAction?.(`Tell me about the ${alert.entity_name} partnership announcement. What does this mean for our pipeline?`)}
            title="Discuss with Kiko" style={{ ...btnBase, background: 'rgba(139,108,246,0.08)', color: 'rgba(139,108,246,0.7)', fontSize: 10, width: 'auto', borderRadius: 8, padding: '0 10px', fontFamily: T.font }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.15)'; e.currentTarget.style.color = 'rgba(139,108,246,0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.08)'; e.currentTarget.style.color = 'rgba(139,108,246,0.7)' }}>
            Discuss
          </button>
          <button onClick={() => nav('/partnership-matrix')}
            title="View in Partnership Matrix" style={{ ...btnBase, background: 'rgba(0,212,170,0.06)', color: 'rgba(0,212,170,0.6)', fontSize: 10, width: 'auto', borderRadius: 8, padding: '0 10px', fontFamily: T.font }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,170,0.12)'; e.currentTarget.style.color = 'rgba(0,212,170,0.8)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,170,0.06)'; e.currentTarget.style.color = 'rgba(0,212,170,0.6)' }}>
            Matrix
          </button>
          <button onClick={() => dismissPartnership(alert)} title="Dismiss" style={{ ...btnBase, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}>
            <X size={11} />
          </button>
        </div>
      ))}

      {/* Draft Actions */}
      {draftActions.map(draft => (
        <div key={draft.id} style={{ ...pillStyle, background: 'rgba(124,92,252,0.04)', border: '1px solid rgba(124,92,252,0.12)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'rgba(124,92,252,0.6)', boxShadow: '0 0 8px rgba(124,92,252,0.3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontFamily: T.font }}>
              {draft.payload?.entity || 'Action'}: </span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 400, fontFamily: T.font }}>
              {(draft.payload?.suggested_action || 'Follow up').slice(0, 60)}{(draft.payload?.suggested_action || '').length > 60 ? '…' : ''}
            </span>
          </div>
          <button onClick={() => approveDraft(draft)} title="Approve" style={{ ...btnBase, background: 'rgba(0,212,170,0.08)', color: 'rgba(0,212,170,0.7)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,170,0.15)'; e.currentTarget.style.color = '#00D4AA' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,170,0.08)'; e.currentTarget.style.color = 'rgba(0,212,170,0.7)' }}>
            <Check size={13} />
          </button>
          <button onClick={() => dismissDraft(draft)} title="Dismiss" style={{ ...btnBase, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,68,68,0.08)'; e.currentTarget.style.color = 'rgba(255,68,68,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}>
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
