import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { X } from 'lucide-react'

export default function KikoInsights({ onAction }) {
  const [alertCount, setAlertCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if already dismissed this session
    const d = sessionStorage.getItem('kiko_alerts_dismissed')
    if (d === 'true') { setDismissed(true); setLoading(false); return }
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    try {
      const { count } = await supabase
        .from('kiko_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('dismissed', false)
      setAlertCount(count || 0)
    } catch (e) { console.error('[KikoInsights]', e) }
    finally { setLoading(false) }
  }

  const dismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('kiko_alerts_dismissed', 'true')
  }

  if (loading || dismissed || alertCount === 0) return null

  return (
    <div style={{ width: '100%', maxWidth: 540, marginTop: 8 }}>
      <div style={{
        borderRadius: 14, padding: '10px 14px',
        background: 'rgba(245,158,11,0.03)',
        border: '1px solid rgba(245,158,11,0.1)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(245,158,11,0.6)',
          boxShadow: '0 0 8px rgba(245,158,11,0.3)',
        }} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onAction?.('Brief me on outstanding tasks')}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 400, fontFamily: T.font }}>
            {alertCount} new alert{alertCount !== 1 ? 's' : ''} — partnership signals &amp; updates
          </span>
        </div>
        <button onClick={dismiss} style={{
          width: 22, height: 22, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.2)', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
        >
          <X size={11} />
        </button>
      </div>
    </div>
  )
}
