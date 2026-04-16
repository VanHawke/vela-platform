// OutreachIntelligence.jsx — Command Centre
// Legora aesthetic. Replaces the experimental 2-pane inbox.
// Hot replies band on top (email/LinkedIn when webhooks fire), priority deals main, tasks + signals right.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import { Mail, Linkedin, CheckSquare, Square, Zap, AlertTriangle, ChevronRight, RefreshCw, MessageSquare } from 'lucide-react'
import './OutreachIntelligence.css'

const STAGE_PROB = {
  'To revisit': 10, 'Contact made': 20, 'Qualified': 35,
  'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55,
  'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92,
}

const SIGNAL_TYPE_LABEL = {
  partnership_detected: 'Partnership',
  new_partnership: 'Partnership',
  convergence: 'Convergence',
  category_recommendation: 'Category',
  competitive_change: 'Competitor',
  stale_deal: 'Stale',
  funding: 'Funding',
  promotion: 'Promotion',
}
const SIGNAL_TYPE_CLASS = {
  partnership_detected: 'sage', new_partnership: 'sage',
  convergence: 'purple', category_recommendation: 'amber',
  competitive_change: 'terra', stale_deal: 'terra',
  funding: 'slate', promotion: 'amber',
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
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [signals, setSignals] = useState([])

  const loadData = async () => {
    setLoading(true)
    try {
      const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [dealsRes, tasksRes, hotRes, signalRes] = await Promise.all([
        // Active deals
        supabase.from('deals')
          .select('id, data, updated_at')
          .not('data->>status', 'in', '("won","lost")')
          .order('updated_at', { ascending: false }),
        // Open tasks
        supabase.from('tasks')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(50),
        // Hot replies — any reply-type alerts in last 24h. When Gmail/LI webhooks fire these populate here.
        supabase.from('kiko_alerts')
          .select('id, type, title, detail, entity_name, entity_id, metadata, created_at')
          .or('type.like.reply_from%,type.eq.linkedin_reply,type.eq.email_reply')
          .gte('created_at', yesterdayISO)
          .order('created_at', { ascending: false })
          .limit(10),
        // Market signals (last 7d, medium+ severity, excluding reply types)
        supabase.from('kiko_alerts')
          .select('id, type, severity, title, detail, entity_name, created_at')
          .in('type', ['partnership_detected', 'new_partnership', 'convergence', 'category_recommendation', 'competitive_change', 'stale_deal', 'funding', 'promotion'])
          .in('severity', ['high', 'critical', 'medium'])
          .gte('created_at', weekAgoISO)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      setDeals(dealsRes.data || [])
      setTasks((tasksRes.data || []).filter(t => !t.data?.completed))
      setHotReplies(hotRes.data || [])
      setSignals(signalRes.data || [])
    } catch (err) {
      console.error('[CommandCentre] load error', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const completeTask = async (task) => {
    const updated = { ...task.data, completed: true, completedAt: new Date().toISOString() }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    await supabase.from('tasks')
      .update({ data: updated, updated_at: new Date().toISOString() })
      .eq('id', task.id)
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
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date()).length,
    [tasks]
  )

  // Priority deals: stale OR high-weighted, top 8
  const priorityDeals = useMemo(() => {
    const now = Date.now()
    return deals
      .map(deal => {
        const d = deal.data || {}
        const last = d.lastActivity ? new Date(d.lastActivity) : new Date(deal.updated_at)
        const daysSince = Math.floor((now - last) / 86400000)
        const stage = d.stage || 'Unknown'
        const prob = (STAGE_PROB[stage] || 10) / 100
        return {
          ...d,
          _id: deal.id,
          daysSince,
          stage,
          prob,
          weighted: (parseFloat(d.value) || 0) * prob,
          isStale: daysSince > 30,
        }
      })
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 8)
  }, [deals])

  // Channel detector for hot reply cards
  const channelOf = (r) => {
    if (r.type?.includes('linkedin')) return 'linkedin'
    if (r.type?.includes('email')) return 'email'
    return 'reply'
  }
  const channelIcon = (ch) => {
    if (ch === 'linkedin') return <Linkedin size={11} />
    if (ch === 'email') return <Mail size={11} />
    return <MessageSquare size={11} />
  }


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

        {/* HOT REPLIES BAND (top) */}
        <div className="cc-hot-band">
          <div className="cc-hot-h">
            <h3><MessageSquare size={13} /> Hot replies</h3>
            {hotReplies.length > 0 && <span className="cc-hot-h-count">{hotReplies.length} new</span>}
            <span className="cc-hot-h-meta">last 24h</span>
          </div>
          {loading ? (
            <div className="cc-empty">Loading…</div>
          ) : hotReplies.length === 0 ? (
            <div className="cc-empty">No replies in last 24h · email & LinkedIn responses land here when they arrive</div>
          ) : (
            <div className="cc-hot-scroll">
              {hotReplies.map(r => {
                const ch = channelOf(r)
                return (
                  <div key={r.id} className="cc-hot-card" onClick={() => r.entity_id && nav(`/contacts/${r.entity_id}`)}>
                    <div className="cc-hot-card-row1">
                      <div className={`cc-hot-card-channel ${ch}`}>{channelIcon(ch)}</div>
                      <div className="cc-hot-card-from">{r.entity_name || 'Unknown'}</div>
                      <div className="cc-hot-card-when">{relativeTime(r.created_at)}</div>
                    </div>
                    <div className="cc-hot-card-title">{r.title || '(no subject)'}</div>
                    {r.detail && <div className="cc-hot-card-detail">{r.detail}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>


        {/* TWO-COLUMN GRID */}
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

          {/* RIGHT: Tasks + Signals */}
          <aside className="cc-col-side">
            <div className="cc-section">
              <div className="cc-section-h">
                <h3><CheckSquare size={12} style={{ marginRight: 5 }} />Tasks due</h3>
                <span className="cc-section-meta">{tasks.length}{overdueTasks > 0 ? ` · ${overdueTasks} overdue` : ''}</span>
              </div>
              {loading ? (
                <div className="cc-empty">Loading…</div>
              ) : tasks.length === 0 ? (
                <div className="cc-empty">All clear</div>
              ) : tasks.slice(0, 10).map(t => {
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


            <div className="cc-section">
              <div className="cc-section-h">
                <h3><Zap size={12} style={{ marginRight: 5 }} />Signals</h3>
                <span className="cc-section-meta">{signals.length} · last 7d</span>
              </div>
              {loading ? (
                <div className="cc-empty">Loading…</div>
              ) : signals.length === 0 ? (
                <div className="cc-empty">No active signals</div>
              ) : signals.slice(0, 8).map(s => (
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
          </aside>
        </div>
      </div>
    </div>
  )
}
