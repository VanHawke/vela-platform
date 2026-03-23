import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { X } from 'lucide-react'

export default function KikoInsights({ onAction }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAlerts() }, [])

  const loadAlerts = async () => {
    try {
      const { data } = await supabase
        .from('kiko_alerts')
        .select('id, title, severity, type, detail, created_at')
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(5)
      setAlerts(data || [])
    } catch (e) { console.error('[KikoInsights]', e) }
    finally { setLoading(false) }
  }

  const dismiss = async (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', id)
  }

  if (loading || !alerts.length) return null

  const severityColor = {
    high: 'rgba(255,59,48,0.6)',
    medium: 'rgba(245,158,11,0.6)',
    low: 'rgba(139,108,246,0.4)',
  }

  return (
    <div style={{ width: '100%', maxWidth: 540, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{
          borderRadius: 14, padding: '10px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${severityColor[alert.severity] || 'rgba(255,255,255,0.06)'}20`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: severityColor[alert.severity] || 'rgba(139,108,246,0.4)',
            boxShadow: `0 0 8px ${severityColor[alert.severity] || 'rgba(139,108,246,0.3)'}`,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 400, fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.title}
            </div>
          </div>
          <button onClick={() => dismiss(alert.id)} style={{
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
      ))}
    </div>
  )
}
