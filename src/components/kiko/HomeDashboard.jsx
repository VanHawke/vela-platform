// HomeDashboard.jsx — Bento snapshot below the chat bar on the homepage.
// Pulls real data from Supabase: pipeline value, active deals, hot replies, next race, open tasks.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { TrendingUp, AlertTriangle, Mail, Calendar, CheckSquare, ChevronRight } from 'lucide-react'

const STAGE_PROB = {
  'To revisit': 10, 'Contact made': 20, 'Qualified': 35,
  'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55,
  'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92,
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}

export default function HomeDashboard({ user, onPromptClick }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [nextRace, setNextRace] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      try {
        const [dealsRes, tasksRes, repliesRes, raceRes] = await Promise.all([
          supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")').order('updated_at', { ascending: false }),
          supabase.from('tasks').select('id, data, updated_at').order('updated_at', { ascending: false }).limit(50),
          supabase.from('kiko_alerts').select('id, title, entity_name, created_at').eq('type', 'reply_from_prospect').gte('created_at', yesterdayISO).limit(5),
          supabase.from('race_calendar').select('name, date, series').eq('series', 'F1').gte('date', new Date().toISOString().split('T')[0]).order('date').limit(1).maybeSingle(),
        ])
        if (cancelled) return
        setDeals(dealsRes.data || [])
        setTasks((tasksRes.data || []).filter(t => !t.data?.completed))
        setHotReplies(repliesRes.data || [])
        setNextRace(raceRes.data || null)
      } catch (err) { console.error('[HomeDashboard]', err) }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])


  const weighted = useMemo(
    () => deals.reduce((s, d) => {
      const stage = d.data?.stage
      const prob = (STAGE_PROB[stage] || 10) / 100
      return s + ((parseFloat(d.data?.value) || 0) * prob)
    }, 0),
    [deals]
  )
  const staleCount = useMemo(() => {
    const now = Date.now()
    return deals.filter(d => {
      const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : new Date(d.updated_at)
      return Math.floor((now - last) / 86400000) > 30
    }).length
  }, [deals])
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date()).length,
    [tasks]
  )
  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - Date.now()) / 86400000) : null
  const inPeak = daysToRace !== null && daysToRace >= 14 && daysToRace <= 21

  const topDeal = useMemo(() => {
    let best = null; let bestScore = 0
    deals.forEach(d => {
      const v = parseFloat(d.data?.value) || 0
      const stage = d.data?.stage
      const prob = (STAGE_PROB[stage] || 10) / 100
      const score = v * prob
      if (score > bestScore) { bestScore = score; best = d }
    })
    return best
  }, [deals])

  const card = (className, onClick, children) => (
    <button
      className={`hd-card ${className}`}
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 12,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 110,
      }}
      onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.05)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {children}
    </button>
  )


  const labelStyle = { fontSize: 10.5, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }
  const valueStyle = { fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 300, fontSize: 32, letterSpacing: '-0.022em', lineHeight: 1.0, color: '#0A0A0A', marginBottom: 6 }
  const subStyle = { fontSize: 11.5, color: '#6B6B6B' }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
      maxWidth: 720, width: '100%', margin: '24px auto 0',
    }}>
      {card('', () => nav('/pipeline'), (
        <>
          <div style={labelStyle}><TrendingUp size={11} /> Pipeline · weighted</div>
          <div>
            <div style={valueStyle}>{loading ? '—' : fmtCurrency(weighted)}</div>
            <div style={subStyle}>{deals.length} active deals</div>
          </div>
        </>
      ))}

      {card('', () => nav('/pipeline'), (
        <>
          <div style={{...labelStyle, color: staleCount > 0 ? '#b8643e' : '#A0A0A0'}}>
            <AlertTriangle size={11} /> Stale (&gt;30d)
          </div>
          <div>
            <div style={{...valueStyle, color: staleCount > 0 ? '#b8643e' : '#0A0A0A'}}>{loading ? '—' : staleCount}</div>
            <div style={subStyle}>{overdueTasks} overdue tasks</div>
          </div>
        </>
      ))}

      {card('', () => nav('/command-centre'), (
        <>
          <div style={labelStyle}><Mail size={11} /> Hot replies · 24h</div>
          <div>
            <div style={valueStyle}>{loading ? '—' : hotReplies.length}</div>
            <div style={subStyle}>{hotReplies[0]?.entity_name ? `Latest: ${hotReplies[0].entity_name}` : 'No replies yet'}</div>
          </div>
        </>
      ))}

      {card('', () => nav('/calendar'), (
        <>
          <div style={{...labelStyle, color: inPeak ? '#7d8a64' : '#A0A0A0'}}>
            <Calendar size={11} /> Next F1
          </div>
          <div>
            <div style={{...valueStyle, color: inPeak ? '#7d8a64' : '#0A0A0A'}}>
              {daysToRace !== null ? `${daysToRace}d` : '—'}
            </div>
            <div style={subStyle}>
              {nextRace ? nextRace.name : 'no upcoming race'}
              {inPeak && <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 9, background: '#7d8a64', color: 'white', padding: '1px 6px', borderRadius: 24, letterSpacing: '0.06em', fontWeight: 600 }}>PEAK</span>}
            </div>
          </div>
        </>
      ))}
    </div>
  )
}
