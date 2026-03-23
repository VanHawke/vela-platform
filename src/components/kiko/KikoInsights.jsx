import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'

export default function KikoInsights({ onAction }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInsights()
  }, [])

  const loadInsights = async () => {
    try {
      const now = new Date()
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Parallel queries
      const [dealsRes, staleRes, activitiesRes, convsRes] = await Promise.all([
        supabase.from('deals').select('id, data', { count: 'exact' }).not('data->>status', 'in', '("won","lost")'),
        supabase.from('deals').select('id, data').not('data->>status', 'in', '("won","lost")').lt('updated_at', thirtyDaysAgo),
        supabase.from('activities').select('id, type, entity_name, subject, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('conversations').select('id', { count: 'exact' }),
      ])

      const activeDeals = dealsRes.count || 0
      const staleDeals = staleRes.data?.length || 0
      const recentActivities = activitiesRes.data || []
      const totalConversations = convsRes.count || 0

      // Next F1 race from race calendar
      const { data: races } = await supabase.from('race_calendar').select('name, date, circuit').gt('date', now.toISOString().split('T')[0]).order('date').limit(1)
      const nextRace = races?.[0] || null

      // Recent alerts
      const { data: alerts } = await supabase.from('kiko_alerts').select('title, severity, type, created_at').eq('dismissed', false).order('created_at', { ascending: false }).limit(3)

      setData({ activeDeals, staleDeals, recentActivities, totalConversations, nextRace, alerts: alerts || [] })
    } catch (e) {
      console.error('[KikoInsights]', e)
    } finally { setLoading(false) }
  }

  if (loading || !data) return null

  const { activeDeals, staleDeals, recentActivities, nextRace, alerts } = data
  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - new Date()) / (1000 * 60 * 60 * 24)) : null

  const stat = (label, value, color = 'rgba(255,255,255,0.6)') => (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 200, color, fontFamily: T.font, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 300, fontFamily: T.font, marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{
      width: '100%', maxWidth: 540, borderRadius: 16,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
      overflow: 'hidden', marginTop: 8,
    }}>
      {/* Stats row */}
      <div style={{ display: 'flex', padding: '14px 16px 12px', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        {stat('Active deals', activeDeals, 'rgba(139,108,246,0.7)')}
        {stat('Stale (30d+)', staleDeals, staleDeals > 0 ? 'rgba(255,80,80,0.6)' : 'rgba(6,214,160,0.5)')}
        {nextRace && stat('Next race', `${daysToRace}d`, daysToRace <= 7 ? 'rgba(6,214,160,0.7)' : 'rgba(255,255,255,0.5)')}
      </div>

      {/* Next race + alerts + recent activity */}
      <div style={{ padding: '10px 16px' }}>
        {nextRace && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontFamily: T.font }}>🏎️</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 300, fontFamily: T.font }}>
              {nextRace.name} — {new Date(nextRace.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        )}
        {alerts?.length > 0 && alerts.slice(0, 2).map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ fontSize: 10, width: 14, textAlign: 'center' }}>🔔</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 300, fontFamily: T.font, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.title}
            </span>
          </div>
        ))}
        {recentActivities.length > 0 && recentActivities.slice(0, 3).map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ fontSize: 10, width: 14, textAlign: 'center' }}>
              {a.type === 'stage_change' ? '📊' : a.type?.includes('email') ? '✉️' : a.type?.includes('lemlist') ? '📣' : '📝'}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 300, fontFamily: T.font, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.entity_name || ''}{a.subject ? ` — ${a.subject}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Quick action */}
      <button onClick={() => onAction?.('Brief me')} style={{
        width: '100%', padding: '8px', borderTop: '1px solid rgba(255,255,255,0.03)',
        background: 'transparent', border: 'none', borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)',
        color: 'rgba(139,108,246,0.4)', fontSize: 10, cursor: 'pointer', fontFamily: T.font, fontWeight: 300,
        transition: 'color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(139,108,246,0.7)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(139,108,246,0.4)'}
      >Get full morning brief →</button>
    </div>
  )
}
