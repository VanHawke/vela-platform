// OutreachIntelligence.jsx — replaces Email page
// Scorecard + Pattern Cards + Timing + Company Timeline
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, Clock, Users, Building2, Send, Zap, RefreshCw, Loader2, BarChart3, Target, Mail } from 'lucide-react'

const T = {
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', font: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
}

const APPROACH_COLORS = {
  'authority-led': '#007AFF', 'data-led': '#5856D6', 'scarcity-led': '#FF9500',
  'relationship-led': '#34C759', 'intelligence-led': '#AF52DE', 'competitive-led': '#FF2D55',
  'value-led': '#00C7BE', 'unknown': '#ABABAB',
}

const CTA_COLORS = {
  'meeting-ask': '#007AFF', 'reply-ask': '#34C759', 'info-share': '#FF9500',
  'soft-close': '#AF52DE', 'no-cta': '#ABABAB', 'unknown': '#ABABAB',
}

export default function OutreachIntelligence({ user }) {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [pipelineFilter, setPipelineFilter] = useState('all')
  const [pipelines, setPipelines] = useState([])

  useEffect(() => { if (user?.id) loadScores() }, [user?.id])

  const loadScores = async () => {
    setLoading(true)
    const { data } = await supabase.from('outreach_scores').select('*').order('sent_at', { ascending: false }).limit(500)
    setScores(data || [])
    const pipes = [...new Set((data || []).map(s => s.pipeline).filter(Boolean))]
    setPipelines(pipes)
    setLoading(false)
  }

  const runScoring = async () => {
    setScoring(true)
    try {
      await fetch('/api/cron-outreach-score', { method: 'POST' })
      await loadScores()
    } catch {}
    setScoring(false)
  }

  const filtered = pipelineFilter === 'all' ? scores : scores.filter(s => s.pipeline === pipelineFilter)
  const total = filtered.length
  const replied = filtered.filter(s => s.outcome === 'replied')
  const silence = filtered.filter(s => s.outcome === 'silence')
  const pending = filtered.filter(s => s.outcome === 'pending')
  const replyRate = total > 0 ? Math.round(replied.length / total * 100) : 0
  const avgReplyTime = replied.filter(s => s.time_to_reply_hours).length > 0
    ? Math.round(replied.filter(s => s.time_to_reply_hours).reduce((a, s) => a + s.time_to_reply_hours, 0) / replied.filter(s => s.time_to_reply_hours).length)
    : 0
  const avgEffectiveness = filtered.filter(s => s.effectiveness_score).length > 0
    ? Math.round(filtered.filter(s => s.effectiveness_score).reduce((a, s) => a + s.effectiveness_score, 0) / filtered.filter(s => s.effectiveness_score).length)
    : 0

  // Compute patterns
  const byApproach = {}
  filtered.forEach(s => {
    const a = s.messaging_approach || 'unknown'
    if (!byApproach[a]) byApproach[a] = { total: 0, replied: 0 }
    byApproach[a].total++
    if (s.outcome === 'replied') byApproach[a].replied++
  })

  const byCta = {}
  filtered.forEach(s => {
    const c = s.cta_type || 'unknown'
    if (!byCta[c]) byCta[c] = { total: 0, replied: 0 }
    byCta[c].total++
    if (s.outcome === 'replied') byCta[c].replied++
  })

  const byDay = {}
  filtered.forEach(s => {
    const d = s.sent_day_of_week || 'Unknown'
    if (!byDay[d]) byDay[d] = { total: 0, replied: 0 }
    byDay[d].total++
    if (s.outcome === 'replied') byDay[d].replied++
  })

  const byCompany = {}
  filtered.forEach(s => {
    const c = s.company || 'Unknown'
    if (!byCompany[c]) byCompany[c] = { total: 0, replied: 0, lastSent: s.sent_at, outcomes: [] }
    byCompany[c].total++
    if (s.outcome === 'replied') byCompany[c].replied++
    byCompany[c].outcomes.push(s.outcome)
    if (s.sent_at > byCompany[c].lastSent) byCompany[c].lastSent = s.sent_at
  })

  const card = { background: '#FFFFFF', borderRadius: 16, padding: '20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.textTertiary, margin: '0 0 14px', fontFamily: T.font }
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: T.textTertiary }} /></div>

  // Empty state
  if (total === 0) return (
    <div style={{ padding: '32px 28px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ ...card, padding: 40 }}>
        <BarChart3 style={{ width: 40, height: 40, color: T.textTertiary, margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text, margin: '0 0 8px', fontFamily: T.font }}>Outreach Intelligence</h2>
        <p style={{ fontSize: 13, color: T.textSecondary, margin: '0 0 20px', fontFamily: T.font, lineHeight: 1.5 }}>Score your outbound emails to discover which messaging approaches, send times, and CTAs generate the most replies.</p>
        <button onClick={runScoring} disabled={scoring} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: T.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>
          {scoring ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Zap style={{ width: 14, height: 14 }} />}
          {scoring ? 'Scoring…' : 'Score my outreach now'}
        </button>
        <p style={{ fontSize: 11, color: T.textTertiary, margin: '12px 0 0', fontFamily: T.font }}>Analyses your last 7 days of sent emails</p>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.font }}>Outreach Intelligence</h1>
          <p style={{ fontSize: 12, color: T.textTertiary, margin: '4px 0 0', fontFamily: T.font }}>{total} emails scored · Updated {scores[0]?.scored_at ? new Date(scores[0].scored_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'never'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', fontFamily: T.font, color: T.text }}>
            <option value="all">All pipelines</option>
            {pipelines.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={runScoring} disabled={scoring} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, color: T.text }}>
            {scoring ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 12, height: 12 }} />}
            {scoring ? 'Scoring…' : 'Score now'}
          </button>
        </div>
      </div>

      {/* Scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Reply Rate', value: `${replyRate}%`, icon: TrendingUp, color: replyRate > 15 ? '#34C759' : replyRate > 8 ? '#FF9500' : '#FF3B30' },
          { label: 'Replies', value: replied.length, icon: Mail, color: '#007AFF' },
          { label: 'Silent', value: silence.length, icon: Clock, color: '#FF9500' },
          { label: 'Avg Reply Time', value: avgReplyTime > 0 ? `${avgReplyTime}h` : '—', icon: Clock, color: '#5856D6' },
          { label: 'Effectiveness', value: avgEffectiveness > 0 ? `${avgEffectiveness}/100` : '—', icon: Target, color: '#007AFF' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <s.icon style={{ width: 13, height: 13, color: s.color }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.textTertiary, fontFamily: T.font }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: T.font }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Pattern Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Messaging Approach */}
        <div style={card}>
          <p style={sectionTitle}><Zap style={{ width: 12, height: 12, display: 'inline', verticalAlign: -2, marginRight: 6 }} />Messaging Approach</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(byApproach).sort((a, b) => b[1].total - a[1].total).map(([approach, data]) => {
              const rate = data.total > 0 ? Math.round(data.replied / data.total * 100) : 0
              return (
                <div key={approach} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.text, fontFamily: T.font, width: 120, flexShrink: 0 }}>{approach}</span>
                  <div style={{ flex: 1, height: 20, background: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${Math.min(rate * 2, 100)}%`, background: APPROACH_COLORS[approach] || '#ABABAB', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: rate > 15 ? '#34C759' : T.textSecondary, fontFamily: T.font, width: 50, textAlign: 'right' }}>{rate}%</span>
                  <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font, width: 30, textAlign: 'right' }}>({data.total})</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA Type */}
        <div style={card}>
          <p style={sectionTitle}><Target style={{ width: 12, height: 12, display: 'inline', verticalAlign: -2, marginRight: 6 }} />CTA Type</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(byCta).sort((a, b) => b[1].total - a[1].total).map(([cta, data]) => {
              const rate = data.total > 0 ? Math.round(data.replied / data.total * 100) : 0
              return (
                <div key={cta} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.text, fontFamily: T.font, width: 100, flexShrink: 0 }}>{cta}</span>
                  <div style={{ flex: 1, height: 20, background: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(rate * 2, 100)}%`, background: CTA_COLORS[cta] || '#ABABAB', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: rate > 15 ? '#34C759' : T.textSecondary, fontFamily: T.font, width: 50, textAlign: 'right' }}>{rate}%</span>
                  <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font, width: 30, textAlign: 'right' }}>({data.total})</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Send Timing */}
      <div style={{ ...card, marginBottom: 20 }}>
        <p style={sectionTitle}><Clock style={{ width: 12, height: 12, display: 'inline', verticalAlign: -2, marginRight: 6 }} />Send Timing — Day of Week</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 8px' }}>
          {dayOrder.map(day => {
            const data = byDay[day] || { total: 0, replied: 0 }
            const rate = data.total > 0 ? Math.round(data.replied / data.total * 100) : 0
            const maxTotal = Math.max(...Object.values(byDay).map(d => d.total), 1)
            const barH = data.total > 0 ? Math.max((data.total / maxTotal) * 90, 8) : 4
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: rate > 15 ? '#34C759' : T.textTertiary, fontFamily: T.font }}>{rate > 0 ? `${rate}%` : ''}</span>
                <div style={{ width: '100%', maxWidth: 48, height: barH, borderRadius: 4, background: data.total > 0 ? (rate > 15 ? '#34C759' : rate > 8 ? '#FF9500' : 'rgba(0,0,0,0.12)') : 'rgba(0,0,0,0.04)', transition: 'height 0.4s ease' }} />
                <span style={{ fontSize: 9, fontWeight: 500, color: T.textTertiary, fontFamily: T.font }}>{day.slice(0, 3)}</span>
                <span style={{ fontSize: 8, color: T.textTertiary, fontFamily: T.font }}>{data.total}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Company Outreach Timeline */}
      <div style={card}>
        <p style={sectionTitle}><Building2 style={{ width: 12, height: 12, display: 'inline', verticalAlign: -2, marginRight: 6 }} />Company Outreach Timeline</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(byCompany).sort((a, b) => b[1].total - a[1].total).slice(0, 25).map(([company, data]) => {
            const rate = data.total > 0 ? Math.round(data.replied / data.total * 100) : 0
            const daysSince = Math.round((Date.now() - new Date(data.lastSent).getTime()) / 86400000)
            return (
              <div key={company} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: rate > 0 ? 'rgba(52,199,89,0.04)' : daysSince > 14 ? 'rgba(255,59,48,0.04)' : 'transparent' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text, fontFamily: T.font, width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company}</span>
                <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                  {data.outcomes.slice(0, 10).map((o, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: o === 'replied' ? '#34C759' : o === 'silence' ? '#FF3B30' : o === 'pending' ? '#FF9500' : '#ABABAB' }} title={o} />
                  ))}
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, color: rate > 0 ? '#34C759' : T.textTertiary, fontFamily: T.font, width: 40, textAlign: 'right' }}>{rate}%</span>
                <span style={{ fontSize: 10, color: daysSince > 14 ? '#FF3B30' : T.textTertiary, fontFamily: T.font, width: 50, textAlign: 'right' }}>{daysSince}d ago</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
