// OutreachIntelligence.jsx — Command Centre
// Legora aesthetic + full OLD plumbing (deals/activities/race/tasks/replies/signals)
// Queries lifted directly from OutreachIntelligence.LOGIC_REF.jsx

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import { Calendar, AlertTriangle, TrendingUp, CheckSquare, Square, Mail, Zap, Building2, Clock, ChevronRight, RefreshCw, Send } from 'lucide-react'
import './OutreachIntelligence.css'

const STAGE_PROB = {
  'To revisit': 10, 'Contact made': 20, 'Qualified': 35,
  'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55,
  'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92,
}
const RACE_SERIES_OPTIONS = ['F1', 'FE', 'MotoGP', 'WEC']
const SIGNAL_TYPE_LABEL = {
  partnership: 'Partnership',
  promotion: 'Promotion',
  funding: 'Funding',
  competitor_sponsorship: 'Competitor',
}
const SIGNAL_TYPE_CLASS = {
  partnership: 'sage',
  promotion: 'amber',
  funding: 'slate',
  competitor_sponsorship: 'terra',
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}
function relativeTime(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}


export default function OutreachIntelligence({ user }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [signals, setSignals] = useState([])
  const [allNextRaces, setAllNextRaces] = useState({})
  const [raceSeries, setRaceSeries] = useState('F1')

  const loadData = async () => {
    setLoading(true)
    try {
      const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [dealsRes, actRes, raceRes, tasksRes, repliesRes, signalsRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")').order('updated_at', { ascending: false }),
        supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('race_calendar').select('name, date, circuit, series').gt('date', new Date().toISOString().split('T')[0]).order('date').limit(20),
        supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
        supabase.from('kiko_alerts').select('id, title, detail, entity_name, entity_id, metadata, created_at').eq('type', 'reply_from_prospect').gte('created_at', yesterdayISO).order('created_at', { ascending: false }).limit(10),
        supabase.from('kiko_alerts').select('id, type, severity, title, detail, entity_name, created_at').in('type', ['partnership', 'promotion', 'funding', 'competitor_sponsorship']).order('created_at', { ascending: false }).limit(8),
      ])
      setDeals(dealsRes.data || [])
      setActivities(actRes.data || [])
      setHotReplies(repliesRes.data || [])
      setSignals(signalsRes.data || [])
      // Group next races by series
      const races = raceRes.data || []
      const bySeriesMap = {}
      for (const r of races) {
        const s = r.series || 'F1'
        if (!bySeriesMap[s]) bySeriesMap[s] = r
      }
      setAllNextRaces(bySeriesMap)
      setTasks((tasksRes.data || []).filter(t => !t.data?.completed))
    } catch (err) { console.error('[CommandCentre] load error', err) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const completeTask = async (task) => {
    const updated = { ...task.data, completed: true, completedAt: new Date().toISOString() }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    await supabase.from('tasks').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', task.id)
  }

  // Computed metrics
  const totalPipeline = useMemo(
    () => deals.reduce((s, d) => s + (parseFloat(d.data?.value) || 0), 0),
    [deals]
  )
  const weightedPipeline = useMemo(
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
  const nextRace = allNextRaces[raceSeries] || null
  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - Date.now()) / 86400000) : null
  const inPeakWindow = daysToRace !== null && daysToRace >= 14 && daysToRace <= 21

  // Priority deals: stale or close-to-close
  const priorityDeals = useMemo(() => {
    const now = Date.now()
    return deals
      .map(deal => {
        const d = deal.data || {}
        const last = d.lastActivity ? new Date(d.lastActivity) : new Date(deal.updated_at)
        const daysSince = Math.floor((now - last) / 86400000)
        const stage = d.stage || 'Unknown'
        const prob = (STAGE_PROB[stage] || 10) / 100
        return { ...d, _id: deal.id, daysSince, stage, prob, weighted: (parseFloat(d.value) || 0) * prob, isStale: daysSince > 30 }
      })
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 8)
  }, [deals])


  return (
    <div className="cc">
      <PageHeader
        eyebrowCategory="TODAY"
        eyebrowSuffix="Command Centre"
        title="Command Centre"
        stats={[
          { value: deals.length, label: 'Active deals' },
          { value: fmtCurrency(weightedPipeline), label: 'Weighted' },
          { value: hotReplies.length, label: 'Hot replies' },
          { value: tasks.length, label: 'Open tasks' },
        ]}
        toolbar={
          <button onClick={loadData} className="cc-refresh-btn" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
        }
      />

      <div className="cc-body">
        {/* TOP STATS ROW */}
        <div className="cc-stats-row">
          <div className="cc-stat-card">
            <div className="cc-stat-h">Pipeline · weighted</div>
            <div className="cc-stat-v">{fmtCurrency(weightedPipeline)}</div>
            <div className="cc-stat-sub">of {fmtCurrency(totalPipeline)} total</div>
          </div>
          <div className={`cc-stat-card ${staleCount > 0 ? 'warn' : ''}`}>
            <div className="cc-stat-h"><AlertTriangle size={11} /> Stale deals (&gt;30d)</div>
            <div className="cc-stat-v">{staleCount}</div>
            <div className="cc-stat-sub">need re-engagement</div>
          </div>
          <div className={`cc-stat-card ${overdueTasks > 0 ? 'warn' : ''}`}>
            <div className="cc-stat-h">Overdue tasks</div>
            <div className="cc-stat-v">{overdueTasks}</div>
            <div className="cc-stat-sub">past their due date</div>
          </div>
          <div className={`cc-stat-card ${inPeakWindow ? 'sage' : ''}`}>
            <div className="cc-stat-h">
              <Calendar size={11} />
              Next {raceSeries}
              <div className="cc-stat-series">
                {RACE_SERIES_OPTIONS.map(s => (
                  <button
                    key={s}
                    className={s === raceSeries ? 'active' : ''}
                    onClick={() => setRaceSeries(s)}
                  >{s}</button>
                ))}
              </div>
            </div>
            <div className="cc-stat-v">{daysToRace !== null ? `${daysToRace}d` : '—'}</div>
            <div className="cc-stat-sub">
              {nextRace ? `${nextRace.name} · ${new Date(nextRace.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'no upcoming race'}
              {inPeakWindow && <span className="cc-peak-tag">PEAK WINDOW</span>}
            </div>
          </div>
        </div>

        {/* TWO COLUMN LAYOUT */}
        <div className="cc-grid">
          {/* LEFT: Priority deals */}
          <div className="cc-col-main">
            <div className="cc-section">
              <div className="cc-section-h">
                <h3>Priority deals</h3>
                <span className="cc-section-meta">Top {priorityDeals.length} by weighted value</span>
              </div>
              <div className="cc-deals-list">
                {loading ? (
                  <div className="cc-empty">Loading…</div>
                ) : priorityDeals.length === 0 ? (
                  <div className="cc-empty">No active deals</div>
                ) : priorityDeals.map(d => (
                  <div key={d._id} className={`cc-deal ${d.isStale ? 'stale' : ''}`} onClick={() => nav('/pipeline')}>
                    <div className="cc-deal-mark">{(d.company || '?')[0].toUpperCase()}</div>
                    <div className="cc-deal-body">
                      <div className="cc-deal-row1">
                        <span className="cc-deal-name">{d.company || d.title || 'Untitled'}</span>
                        <span className="cc-deal-value">{fmtCurrency(parseFloat(d.value) || 0)}</span>
                      </div>
                      <div className="cc-deal-row2">
                        <span className="cc-deal-stage">{d.stage}</span>
                        <span className="cc-deal-meta">·</span>
                        <span className="cc-deal-meta">{Math.round(d.prob * 100)}% prob</span>
                        <span className="cc-deal-meta">·</span>
                        <span className={`cc-deal-meta ${d.isStale ? 'stale-text' : ''}`}>
                          {d.daysSince}d since activity
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="cc-deal-chev" />
                  </div>
                ))}
              </div>
            </div>
          </div>


          {/* RIGHT: Sidebar — hot replies, signals, tasks */}
          <aside className="cc-col-side">
            <div className="cc-section">
              <div className="cc-section-h">
                <h3><Mail size={12} style={{ marginRight: 5 }} />Hot replies · 24h</h3>
                <span className="cc-section-meta">{hotReplies.length}</span>
              </div>
              {loading ? (
                <div className="cc-empty">Loading…</div>
              ) : hotReplies.length === 0 ? (
                <div className="cc-empty">No replies in last 24h</div>
              ) : hotReplies.slice(0, 5).map(r => (
                <div key={r.id} className="cc-reply">
                  <div className="cc-reply-from">{r.entity_name || 'Unknown'}</div>
                  <div className="cc-reply-detail">{r.detail || r.title}</div>
                  <div className="cc-reply-when">{relativeTime(r.created_at)}</div>
                </div>
              ))}
            </div>

            <div className="cc-section">
              <div className="cc-section-h">
                <h3><Zap size={12} style={{ marginRight: 5 }} />Signals</h3>
                <span className="cc-section-meta">{signals.length}</span>
              </div>
              {loading ? (
                <div className="cc-empty">Loading…</div>
              ) : signals.length === 0 ? (
                <div className="cc-empty">No active signals</div>
              ) : signals.slice(0, 6).map(s => (
                <div key={s.id} className="cc-signal">
                  <span className={`cc-signal-tag ${SIGNAL_TYPE_CLASS[s.type] || 'slate'}`}>
                    {SIGNAL_TYPE_LABEL[s.type] || s.type}
                  </span>
                  <div className="cc-signal-body">
                    <div className="cc-signal-title">{s.title}</div>
                    <div className="cc-signal-meta">
                      {s.entity_name && <span>{s.entity_name} · </span>}
                      {relativeTime(s.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="cc-section">
              <div className="cc-section-h">
                <h3><CheckSquare size={12} style={{ marginRight: 5 }} />Open tasks</h3>
                <span className="cc-section-meta">{tasks.length}</span>
              </div>
              {loading ? (
                <div className="cc-empty">Loading…</div>
              ) : tasks.length === 0 ? (
                <div className="cc-empty">All clear</div>
              ) : tasks.slice(0, 8).map(t => {
                const overdue = t.data?.dueDate && new Date(t.data.dueDate) < new Date()
                return (
                  <div key={t.id} className={`cc-task ${overdue ? 'overdue' : ''}`}>
                    <button className="cc-task-check" onClick={() => completeTask(t)}>
                      <Square size={12} />
                    </button>
                    <div className="cc-task-body">
                      <div className="cc-task-title">{t.data?.title || t.data?.name || 'Task'}</div>
                      {t.data?.dueDate && (
                        <div className="cc-task-due">
                          Due {new Date(t.data.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {overdue && <span className="cc-overdue-tag">OVERDUE</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
