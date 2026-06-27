// RedesignHomeDashboard.jsx — Redesigned bento dashboard for Today page
// Replaces HomeDashboard.jsx on the redesign branch
// Adds: priority actions (from Command Centre), calendar strip, preserves pipeline/race data
// Priority actions auto-clear when actioned (reactive to real data)

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
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

// Urgency classification for a task. Drives sort order and the on-card badge.
// rank 0 = overdue, 1 = due today, 2 = upcoming, 3 = no date. Priority = overdue or due today.
function taskUrgency(t) {
  const raw = t?.data?.dueDate || t?.data?.due_date
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  if (!raw) return { rank: 3, overdue: false, priority: false, label: null, sortKey: Infinity }
  const d = new Date(raw)
  if (isNaN(d)) return { rank: 3, overdue: false, priority: false, label: null, sortKey: Infinity }
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const diff = Math.round((dd - startOfToday) / 86400000)
  if (diff < 0) return { rank: 0, overdue: true, priority: true, label: diff === -1 ? 'Overdue 1 day' : `Overdue ${-diff} days`, sortKey: dd.getTime() }
  if (diff === 0) return { rank: 1, overdue: false, priority: true, label: 'Due today', sortKey: dd.getTime() }
  return { rank: 2, overdue: false, priority: false, label: diff === 1 ? 'Due tomorrow' : `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, sortKey: dd.getTime() }
}

// On-card badge. Priority tasks get a "Priority" pill plus the reason; others just show the date.
function renderDueBadge(u) {
  if (!u || !u.label) return null
  if (u.priority) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#b8643e', background: 'rgba(184,100,62,0.1)', border: '1px solid rgba(184,100,62,0.22)', borderRadius: 5, padding: '1px 5px', lineHeight: 1.5 }}>Priority</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#b8643e' }}>{u.label}</span>
      </span>
    )
  }
  return <span style={{ fontSize: 11, color: '#A0A0A0', fontWeight: 500 }}>{u.label}</span>
}

export default function RedesignHomeDashboard({ user, onPromptClick }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [nextRace, setNextRace] = useState(null)
  const [calendarEvents, setCalendarEvents] = useState([])
  const [drafts, setDrafts] = useState([])

  // Cap the visible task list to 2 cards (measured, so the natural card height is preserved); the rest scrolls.
  const taskScrollRef = useRef(null)
  const [taskMaxH, setTaskMaxH] = useState(null)
  useLayoutEffect(() => {
    const el = taskScrollRef.current
    if (!el) return
    const measure = () => {
      const cards = Array.from(el.children)
      if (cards.length <= 2) { setTaskMaxH(null); return }
      const gap = 6
      const h = cards[0].getBoundingClientRect().height + gap + cards[1].getBoundingClientRect().height
      setTaskMaxH(Math.ceil(h) + 4)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tasks])

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
            .or('data->>completed.is.null,data->>completed.eq.false')
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
        setDrafts(draftsRes.data || [])
        setNextRace(raceRes.data || null)


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
  // Sort tasks by urgency: overdue first, then due today, then upcoming by date, no-date last.
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    const ua = taskUrgency(a), ub = taskUrgency(b)
    return ua.rank !== ub.rank ? ua.rank - ub.rank : ua.sortKey - ub.sortKey
  }), [tasks])
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

  // Mark a task complete — optimistic removal; the DB trigger fans out to activity/company/follow-up
  const completeTask = async (task) => {
    setTasks(prev => prev.filter(x => x.id !== task.id))
    try {
      await supabase.from('tasks').update({ data: { ...task.data, completed: true, completedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', task.id)
    } catch (e) { console.error('[completeTask]', e) }
  }

  // Clear a follow-up card. The status drives the scan's idempotency so it will not re-card.
  const actionDraft = async (draft, status) => {
    setDrafts(prev => prev.filter(x => x.id !== draft.id))
    try {
      await supabase.from('kiko_draft_actions').update({ status, reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    } catch (e) { console.error('[actionDraft]', e) }
  }

  return (
    <div style={{ maxWidth: 720, width: '100%', margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Follow-ups — adaptive cadence cards (kiko_draft_actions), behind the approval gate. Tap routes the draft into chat to review and send. */}
      {drafts.length > 0 && (
        <div>
          <h2 style={{ ...sectionTitle, margin: '0 0 12px 0' }}>Follow-ups <span style={{ color: '#A0A0A0', fontWeight: 300, fontSize: 15 }}>{drafts.length}</span></h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drafts.map(d => {
              const p = d.payload || {}
              const isRespond = p.scenario === 'respond'
              const tagColor = isRespond ? '#b8643e' : '#B89C5C'
              const tagText = isRespond ? 'Respond' : 'Follow up'
              const draftText = p.draft || ''
              return (
                <div key={d.id} style={{ ...cardStyle, position: 'relative' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                  onClick={() => onPromptClick && onPromptClick(`Help me action this follow-up to ${p.entity || 'this contact'}. Here is the draft you prepared:\n\n${draftText}\n\nLet me review and send it.`)}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.entity || 'Contact'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: tagColor, background: `${tagColor}1a`, border: `1px solid ${tagColor}38`, borderRadius: 5, padding: '1px 5px', lineHeight: 1.5 }}>{tagText}</span>
                      <button onClick={(e) => { e.stopPropagation(); actionDraft(d, 'rejected') }} title="Dismiss" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.2)', background: 'transparent', cursor: 'pointer', padding: 0, color: '#A0A0A0', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e)=>{e.currentTarget.style.borderColor='#b8643e';e.currentTarget.style.color='#b8643e'}} onMouseLeave={(e)=>{e.currentTarget.style.borderColor='rgba(0,0,0,0.2)';e.currentTarget.style.color='#A0A0A0'}}>×</button>
                    </div>
                  </div>
                  {p.cost_line && <div style={{ fontSize: 12.5, fontWeight: 500, color: '#0A0A0A', marginBottom: 3 }}>{p.cost_line}</div>}
                  {p.relationship && <div style={{ fontSize: 11.5, color: '#6B6B6B', marginBottom: 8 }}>{p.relationship}</div>}
                  {draftText && (
                    <div style={{ fontSize: 12, color: '#6B6B6B', background: 'rgba(0,0,0,0.025)', borderRadius: 9, padding: '8px 10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{draftText}</div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 500, color: tagColor, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Review &amp; send <ChevronRight size={13} /></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tasks Due — scoped to the current user, sorted by urgency */}
      {tasks.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 12px 0' }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Tasks Due <span style={{ color: '#A0A0A0', fontWeight: 300, fontSize: 15 }}>{tasks.length}</span></h2>
            <span
              onClick={() => onPromptClick && onPromptClick(`Walk me through my tasks one by one and help me action each. Start with the first and wait for me before moving to the next.\n\nMy open tasks:\n` + sortedTasks.map((t, i) => `${i + 1}. ${t.data?.notes || 'Task'}${t.data?.company ? ` — ${t.data.company}` : ''}`).join('\n'))}
              style={{ fontSize: 12, fontWeight: 500, color: '#b8643e', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
            >
              Work through these <ChevronRight size={13} />
            </span>
          </div>
          <div ref={taskScrollRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: taskMaxH ? `${taskMaxH}px` : '52vh', overflowY: 'auto', paddingRight: 4 }}>
            {sortedTasks.map(t => {
              const u = taskUrgency(t)
              const overdue = u.overdue
              const groupContacts = Array.isArray(t.data?.contacts) ? t.data.contacts : []
              if (groupContacts.length > 1) {
                return (
                  <div key={t.id} style={{ ...cardStyle, position: 'relative', cursor: 'default' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', minWidth: 0 }}>{t.data?.company || 'Company'}<span style={{ color: '#A0A0A0', fontWeight: 400 }}> · {groupContacts.length} to reach</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {renderDueBadge(u)}
                        <button onClick={(e) => { e.stopPropagation(); completeTask(t) }} title="Mark all done" style={{ width: 13, height: 13, borderRadius: '50%', border: `1.5px solid ${overdue ? 'rgba(184,100,62,0.5)' : 'rgba(0,0,0,0.2)'}`, background: 'transparent', cursor: 'pointer', padding: 0, transition: 'background 120ms ease, border-color 120ms ease' }} onMouseEnter={(e)=>{e.currentTarget.style.background='#34D399';e.currentTarget.style.borderColor='#34D399'}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor=overdue?'rgba(184,100,62,0.5)':'rgba(0,0,0,0.2)'}} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {groupContacts.map((c, i) => (
                        <div key={i} onClick={() => onPromptClick && onPromptClick(`Help me reach out to ${c.name}${c.role ? ` (${c.role})` : ''} at ${t.data?.company || ''}.${c.notes ? ` ${c.notes}` : ''}`)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px', borderRadius: 9, background: 'rgba(0,0,0,0.025)', cursor: 'pointer', transition: 'background 120ms ease' }} onMouseEnter={(e)=>{e.currentTarget.style.background='rgba(0,0,0,0.05)'}} onMouseLeave={(e)=>{e.currentTarget.style.background='rgba(0,0,0,0.025)'}}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#0A0A0A' }}>{c.name}{c.role ? <span style={{ color: '#6B6B6B', fontWeight: 400 }}> · {c.role}</span> : null}</div>
                            {(c.notes || c.channel) && <div style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.channel || ''}{c.channel && c.notes ? ' — ' : ''}{c.notes || ''}</div>}
                          </div>
                          <ChevronRight size={13} style={{ color: '#C0C0C0', flexShrink: 0, marginTop: 2 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return (
                <div key={t.id} onClick={() => onPromptClick && onPromptClick(`Help me with this task: ${t.data?.notes || ''}${t.data?.company ? ` (${t.data.company})` : ''}`)} style={{ ...cardStyle, position: 'relative' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', lineHeight: 1.4 }}>{t.data?.notes || 'Task'}</div>
                      {(t.data?.company || t.data?.type) && (
                        <div style={{ fontSize: 12, color: '#6B6B6B', fontWeight: 400, marginTop: 2 }}>{[t.data?.company, t.data?.type].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                    {renderDueBadge(u)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); completeTask(t) }}
                    title="Mark complete"
                    style={{ position: 'absolute', right: 10, bottom: 8, width: 13, height: 13, borderRadius: '50%', border: `1.5px solid ${overdue ? 'rgba(184,100,62,0.5)' : 'rgba(0,0,0,0.2)'}`, background: 'transparent', cursor: 'pointer', padding: 0, transition: 'background 120ms ease, border-color 120ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#34D399'; e.currentTarget.style.borderColor = '#34D399' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = overdue ? 'rgba(184,100,62,0.5)' : 'rgba(0,0,0,0.2)' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Next Race Card — dynamically shows the next upcoming F1 race */}
      <div>
        <h2 style={sectionTitle}>Upcoming Race</h2>
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
            <img src="/f1-logo.png" alt="F1" style={{ height: 18, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 500, flexShrink: 0 }}>{next.name}</span>
            <span style={{ fontSize: 12, color: '#A0A0A0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {dateLabel} · {next.circuit}</span>
            <span style={{ fontSize: 12, color: '#A0A0A0', fontWeight: 500, marginLeft: 'auto', flexShrink: 0 }}>{days === 0 ? 'Today' : `${days} days`}</span>
          </div>
        )
      })()}
      </div>

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
