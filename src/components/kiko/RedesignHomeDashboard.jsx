// RedesignHomeDashboard.jsx — Redesigned bento dashboard for Today page
// Replaces HomeDashboard.jsx on the redesign branch
// Adds: priority actions (from Command Centre), calendar strip, preserves pipeline/race data
// Priority actions auto-clear when actioned (reactive to real data)

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { TrendingUp, AlertTriangle, Mail, Calendar, Flag, ChevronRight, Clock } from 'lucide-react'

const STAGE_PROB = {
  'To revisit': 10, 'Contact made': 20, 'Qualified': 35,
  'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55,
  'Proposal Sent': 60, 'Negotiation': 70,
  'Verbal Agreement': 85, 'Contract Review': 92,
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${n}`
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const PRIORITY_DOT = { high: '#b8643e', medium: '#B89C5C', low: '#5a6470' }

export default function RedesignHomeDashboard({ user, onPromptClick }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [nextRace, setNextRace] = useState(null)
  const [priorityItems, setPriorityItems] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      try {
        const [dealsRes, tasksRes, repliesRes, raceRes, draftsRes, followupsRes] = await Promise.all([
          supabase.from('deals').select('id, data, updated_at')
            .not('data->>status', 'in', '("won","lost","archived")')
            .or('data->>archived.is.null,data->>archived.neq.true')
            .order('updated_at', { ascending: false }),
          supabase.from('tasks').select('id, data, updated_at')
            .eq('user_id', user?.id)
            .order('updated_at', { ascending: false }).limit(50),
          supabase.from('kiko_alerts').select('id, type, title, detail, entity_name, created_at')
            .eq('dismissed', false)
            .gte('created_at', weekAgoISO)
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('race_calendar').select('name, date, series, circuit, location')
            .eq('series', 'F1')
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date').limit(1).maybeSingle(),
          supabase.from('kiko_draft_actions').select('id, action_type, payload, created_at')
            .eq('status', 'pending')
            .gte('created_at', weekAgoISO)
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('tasks').select('id, data, updated_at')
            .order('updated_at', { ascending: false }).limit(20),
        ])
        if (cancelled) return

        setDeals(dealsRes.data || [])
        const filteredTasks = (tasksRes.data || []).filter(t => !t.data?.completed)
        setTasks(filteredTasks)
        setHotReplies(repliesRes.data || [])
        setNextRace(raceRes.data || null)

        // Build priority actions from multiple sources
        const items = []

        // Hot replies — provenance-verified only (we contacted them first)
        const provenanceTypes = ['email_reply', 'email_reply_manual', 'linkedin_reply', 'reply_from_prospect']
        ;(repliesRes.data || [])
          .filter(a => provenanceTypes.includes(a.type))
          .slice(0, 3)
          .forEach(a => {
            items.push({
              id: `reply-${a.id}`, priority: 'high',
              title: `Reply — ${a.entity_name || 'Unknown'}`,
              detail: a.title || a.detail || '',
              time: timeAgo(a.created_at),
              onClick: () => { window.dispatchEvent(new CustomEvent('kiko_prefill', { detail: { text: `Brief me on the reply from ${a.entity_name || 'this prospect'} and suggest next steps` } })); nav('/') },
            })
          })

        // Overdue tasks
        const overdue = filteredTasks.filter(t => {
          const d = t.data?.dueDate || t.data?.due_date
          return d && new Date(d) < new Date()
        })
        overdue.slice(0, 2).forEach(t => {
          const label = (t.data?.notes || t.data?.title || 'Task').slice(0, 44)
          items.push({
            id: `task-${t.id}`, priority: 'high',
            title: `Overdue — ${label}`,
            detail: t.data?.company || '',
            time: timeAgo(t.data?.dueDate || t.data?.due_date),
            onClick: () => { window.dispatchEvent(new CustomEvent('kiko_prefill', { detail: { text: `What do I need to do about the overdue task: ${t.data?.notes || 'this task'}?` } })); nav('/') },
          })
        })

        // Stale deals (>14 days no activity)
        const now = Date.now()
        ;(dealsRes.data || []).filter(d => {
          const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : new Date(d.updated_at)
          return Math.floor((now - last) / 86400000) > 14
        }).slice(0, 2).forEach(d => {
          const days = Math.floor((now - new Date(d.data?.lastActivity || d.updated_at)) / 86400000)
          items.push({
            id: `stale-${d.id}`, priority: days > 30 ? 'high' : 'medium',
            title: `Stale — ${d.data?.company || 'Deal'}`,
            detail: `${days} days since last activity`,
            time: `${days}d`,
            onClick: () => { window.dispatchEvent(new CustomEvent('kiko_prefill', { detail: { text: `Brief me on ${d.data?.company || 'this deal'} — it has been stale for ${days} days. What should I do?` } })); nav('/') },
          })
        })

        // Pending draft actions (max 2)
        ;(draftsRes.data || []).slice(0, 2).forEach(d => {
          items.push({
            id: `draft-${d.id}`, priority: 'medium',
            title: `Draft pending — ${d.payload?.entity || d.action_type || 'Action'}`,
            detail: d.payload?.subject || 'Review and approve',
            time: timeAgo(d.created_at),
            onClick: () => { window.dispatchEvent(new CustomEvent('kiko_prefill', { detail: { text: `Show me the pending draft for ${d.payload?.entity || 'this prospect'} so I can review and approve it` } })); nav('/') },
          })
        })

        // Sort by priority (high first), dedup by entity name, limit to 5
        const order = { high: 0, medium: 1, low: 2 }
        items.sort((a, b) => (order[a.priority] || 2) - (order[b.priority] || 2))
        // Dedup — if a task and draft reference the same entity, keep the higher-priority one
        const seen = new Set()
        const deduped = items.filter(item => {
          const key = item.title.replace(/^(Reply|Overdue|Stale|Draft pending) — /, '').toLowerCase().trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setPriorityItems(deduped.slice(0, 5))

        // Fetch calendar events for today via dedicated API endpoint
        try {
          const today = new Date().toISOString().split('T')[0]
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
          const calRes = await fetch(`https://api.vanhawke.agency/api/calendar-events?email=${encodeURIComponent(user?.email || 'sunny@vanhawke.com')}&timeMin=${today}T00:00:00Z&timeMax=${tomorrow}T00:00:00Z`)
          if (calRes.ok) {
            const calData = await calRes.json()
            if (Array.isArray(calData)) {
              const events = calData.slice(0, 5).map(ev => ({
                time: ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ev.start?.date || '',
                title: ev.summary || 'Untitled',
                type: ev.organizer?.self ? 'meeting' : 'event',
              }))
              if (!cancelled) setCalendarEvents(events)
            }
          }
        } catch { /* Calendar fetch failed silently */ }

      } catch (err) { console.error('[RedesignHomeDashboard]', err) }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Computed values
  const weighted = useMemo(
    () => deals.reduce((s, d) => {
      const prob = (STAGE_PROB[d.data?.stage] || 10) / 100
      return s + ((parseFloat(d.data?.value) || 0) * prob)
    }, 0), [deals])

  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - Date.now()) / 86400000) : null

  // Styles
  const sectionTitle = {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontWeight: 300, fontSize: 18, letterSpacing: '-0.01em',
    color: '#0A0A0A', margin: '0 0 12px 0',
  }
  const cardStyle = {
    background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.2s, transform 0.15s',
    fontFamily: "'Inter', system-ui, sans-serif",
  }
  const hoverIn = (e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(-1px)' }
  const hoverOut = (e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }

  return (
    <div style={{ maxWidth: 720, width: '100%', margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Priority Actions */}
      {priorityItems.length > 0 && (
        <div>
          <h2 style={sectionTitle}>Priority Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {priorityItems.map(item => (
              <div key={item.id} onClick={item.onClick} style={cardStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="6" height="6" style={{ flexShrink: 0 }}><circle cx="3" cy="3" r="3" fill={PRIORITY_DOT[item.priority] || PRIORITY_DOT.low} /></svg>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400, marginTop: 1 }}>{item.detail}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#A0A0A0', flexShrink: 0 }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This week's tasks — scoped to the current user */}
      {tasks.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 12px 0' }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>This week's tasks <span style={{ color: '#A0A0A0', fontWeight: 300, fontSize: 15 }}>{tasks.length}</span></h2>
            <span
              onClick={() => onPromptClick && onPromptClick(`Walk me through my tasks one by one and help me action each. Start with the first and wait for me before moving to the next.\n\nMy open tasks:\n` + tasks.map((t, i) => `${i + 1}. ${t.data?.notes || 'Task'}${t.data?.company ? ` — ${t.data.company}` : ''}`).join('\n'))}
              style={{ fontSize: 12, fontWeight: 500, color: '#b8643e', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
            >
              Work through these <ChevronRight size={13} />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
            {tasks.map(t => {
              const due = t.data?.dueDate || t.data?.due_date
              const overdue = due && new Date(due) < new Date()
              return (
                <div key={t.id} onClick={() => onPromptClick && onPromptClick(`Help me with this task: ${t.data?.notes || ''}${t.data?.company ? ` (${t.data.company})` : ''}`)} style={cardStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <svg width="6" height="6" style={{ flexShrink: 0, marginTop: 6 }}><circle cx="3" cy="3" r="3" fill={overdue ? '#b8643e' : '#B89C5C'} /></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', lineHeight: 1.4 }}>{t.data?.notes || 'Task'}</div>
                      {(t.data?.company || t.data?.type) && (
                        <div style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400, marginTop: 2 }}>{[t.data?.company, t.data?.type].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                    {due && <span style={{ fontSize: 11, color: overdue ? '#b8643e' : '#A0A0A0', flexShrink: 0, fontWeight: 500, marginTop: 1 }}>{overdue ? 'overdue' : new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Next Race Card — dynamically shows the next upcoming F1 race */}
      {(() => {
        const F1_2026 = [
          { date: '2026-03-08', name: 'Australian Grand Prix', circuit: 'Albert Park, Melbourne' },
          { date: '2026-03-15', name: 'Chinese Grand Prix', circuit: 'Shanghai International Circuit' },
          { date: '2026-03-29', name: 'Japanese Grand Prix', circuit: 'Suzuka Circuit' },
          { date: '2026-04-12', name: 'Bahrain Grand Prix', circuit: 'Bahrain International Circuit, Sakhir' },
          { date: '2026-04-19', name: 'Saudi Arabian Grand Prix', circuit: 'Jeddah Corniche Circuit' },
          { date: '2026-05-03', name: 'Miami Grand Prix', circuit: 'Miami International Autodrome' },
          { date: '2026-05-24', name: 'Canadian Grand Prix', circuit: 'Circuit Gilles Villeneuve, Montreal' },
          { date: '2026-06-07', name: 'Monaco Grand Prix', circuit: 'Circuit de Monaco, Monte Carlo' },
          { date: '2026-06-14', name: 'Barcelona-Catalunya Grand Prix', circuit: 'Circuit de Barcelona-Catalunya' },
          { date: '2026-06-28', name: 'Austrian Grand Prix', circuit: 'Red Bull Ring, Spielberg' },
          { date: '2026-07-05', name: 'British Grand Prix', circuit: 'Silverstone Circuit' },
          { date: '2026-07-19', name: 'Belgian Grand Prix', circuit: 'Circuit de Spa-Francorchamps' },
          { date: '2026-07-26', name: 'Hungarian Grand Prix', circuit: 'Hungaroring, Budapest' },
          { date: '2026-08-23', name: 'Dutch Grand Prix', circuit: 'Circuit Zandvoort' },
          { date: '2026-09-06', name: 'Italian Grand Prix', circuit: 'Autodromo di Monza' },
          { date: '2026-09-13', name: 'Spanish Grand Prix', circuit: 'IFEMA Circuit, Madrid' },
          { date: '2026-09-27', name: 'Azerbaijan Grand Prix', circuit: 'Baku City Circuit' },
          { date: '2026-10-11', name: 'Singapore Grand Prix', circuit: 'Marina Bay Street Circuit' },
          { date: '2026-10-25', name: 'United States Grand Prix', circuit: 'Circuit of the Americas, Austin' },
          { date: '2026-11-01', name: 'Mexico City Grand Prix', circuit: 'Autódromo Hermanos Rodríguez' },
          { date: '2026-11-08', name: 'São Paulo Grand Prix', circuit: 'Interlagos, São Paulo' },
          { date: '2026-11-21', name: 'Las Vegas Grand Prix', circuit: 'Las Vegas Strip Circuit' },
          { date: '2026-11-29', name: 'Qatar Grand Prix', circuit: 'Lusail International Circuit, Doha' },
          { date: '2026-12-06', name: 'Abu Dhabi Grand Prix', circuit: 'Yas Marina Circuit' },
        ]
        const now = new Date()
        const todayStr = new Date().toISOString().split('T')[0]
        const next = F1_2026.find(r => r.date >= todayStr) || F1_2026[F1_2026.length - 1]
        const days = Math.max(0, Math.ceil((new Date(next.date) - now) / 86400000))
        const dateLabel = new Date(next.date).toLocaleDateString('en-GB', { month: 'long', day: 'numeric' })
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.5" style={{ flexShrink: 0 }}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            <span style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 500, flexShrink: 0 }}>{next.name}</span>
            <span style={{ fontSize: 12, color: '#A0A0A0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {dateLabel} · {next.circuit}</span>
            <span style={{ fontSize: 12, color: '#A0A0A0', fontWeight: 500, marginLeft: 'auto', flexShrink: 0 }}>{days === 0 ? 'Today' : `${days} days`}</span>
          </div>
        )
      })()}

      {/* Bento stats removed per Sunny's direction — not needed on homepage */}

      {/* Calendar strip */}
      {calendarEvents.length > 0 && (
        <div>
          <h2 style={sectionTitle}>Today's Schedule</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {calendarEvents.map((ev, i) => (
              <div key={i} style={{ ...cardStyle, minWidth: 170, flexShrink: 0, cursor: 'default' }}>
                <div style={{ fontSize: 11, color: '#A0A0A0', fontWeight: 500, marginBottom: 4 }}>
                  <Clock size={10} style={{ marginRight: 4 }} />{ev.time}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{ev.title}</div>
                {ev.type && <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2, textTransform: 'capitalize' }}>{ev.type}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DB next-race card removed — consolidated into the minimal text line above */}
    </div>
  )
}
