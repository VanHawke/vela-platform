// OutreachIntelligence.jsx — Command Centre
// Master-detail: LEFT = grouped priority list. RIGHT = Kiko brief pane on select.
// Hot Replies band stays on top. Real data from deals / tasks / kiko_alerts.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import {
  Mail, Linkedin, MessageSquare, CheckSquare, Square, AlertTriangle,
  Zap, TrendingUp, Clock, RefreshCw, Inbox, Send, ExternalLink, Calendar
} from 'lucide-react'
import './OutreachIntelligence.css'

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
function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// Task rows have no 'title' field — reconstruct a useful label from type/contact/company.
function taskLabel(task) {
  const d = task.data || {}
  if (d.title) return d.title
  if (d.name) return d.name
  const who = d.contact || d.company
  if (d.type && who) return `${d.type} — ${who}`
  if (d.type) return d.type
  if (d.notes) return d.notes.slice(0, 80)
  return 'Task'
}
function taskSub(task) {
  const d = task.data || {}
  const parts = []
  if (d.company && d.contact) parts.push(`${d.contact} · ${d.company}`)
  else if (d.company) parts.push(d.company)
  else if (d.contact) parts.push(d.contact)
  return parts.join(' · ')
}

function dueLabel(iso) {
  if (!iso) return ''
  const due = new Date(iso)
  const now = new Date()
  const diffDays = Math.ceil((due - now) / 86400000)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 7) return `Due in ${diffDays}d`
  return `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

// ─── Build the /api/kiko prompt from a selected item ───
// Kiko's command-centre page-role prompt handles the rest — this just wraps
// the selected entity so she knows what to brief on.
function buildBriefPrompt(sel) {
  if (!sel) return 'Brief me.'
  const p = sel.payload || {}
  if (sel.kind === 'reply') {
    return `Brief me on this reply from ${p.entity_name || 'prospect'}. Subject/title: "${sel.title}". Detail: "${p.detail || ''}". Arrived ${relativeTime(p.created_at)}. Give me: (1) where we stand with this account, (2) what needs to happen next, (3) a drafted reply ready to send. Keep it tight — senior sales leader voice.`
  }
  if (sel.kind === 'task') {
    const d = p.data || {}
    const bits = []
    if (d.type) bits.push(`Type: ${d.type}`)
    if (d.company) bits.push(`Company: ${d.company}`)
    if (d.contact) bits.push(`Contact: ${d.contact}`)
    if (d.dueDate) bits.push(`Due: ${d.dueDate}`)
    if (d.notes) bits.push(`Notes: ${d.notes}`)
    return `Brief me on this task.\n${bits.join('\n')}\n\nGive me: (1) full context on this account/contact — who they are, where we stand in the pipeline, our history with them. (2) What specifically needs to happen on this task. (3) A drafted email or LinkedIn message ready to send if outreach is the right move. Keep it tight — senior sales voice, no fluff.`
  }
  if (sel.kind === 'deal') {
    return `Brief me on this deal — ${p.company || p.title}. Stage: ${p.stage}. Value: ${p.value ? '$' + p.value : 'n/a'}. ${p.daysSince}d since last activity. Give me: (1) where we are, (2) the best next move, (3) any recent market signals on this company, (4) draft outreach to reanimate if they're stale.`
  }
  if (sel.kind === 'signal') {
    return `Brief me on this market signal: "${sel.title}". Entity: ${p.entity_name || 'unknown'}. Detail: "${p.detail || ''}". Give me: (1) what this actually means commercially, (2) whether we should act on it and how, (3) a draft outreach if there's an opening.`
  }
  return `Brief me on: ${sel.title}.`
}

export default function OutreachIntelligence({ user }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [tasks, setTasks] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [signals, setSignals] = useState([])

  // Selected item state — drives right pane
  const [selected, setSelected] = useState(null) // { kind, id, title, meta, payload }
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const briefAbortRef = useRef(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [dealsRes, tasksRes, hotRes, signalRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at')
          .not('data->>status', 'in', '("won","lost")')
          .order('updated_at', { ascending: false }),
        supabase.from('tasks').select('*').order('updated_at', { ascending: false }).limit(80),
        supabase.from('kiko_alerts')
          .select('id, type, title, detail, entity_name, entity_id, metadata, created_at')
          .or('type.like.reply_from%,type.eq.linkedin_reply,type.eq.email_reply')
          .gte('created_at', dayAgo)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('kiko_alerts')
          .select('id, type, severity, title, detail, entity_name, created_at')
          .in('type', ['partnership_detected', 'new_partnership', 'convergence', 'category_recommendation', 'competitive_change', 'funding', 'promotion'])
          .in('severity', ['high', 'critical', 'medium'])
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(15),
      ])
      setDeals(dealsRes.data || [])
      setTasks((tasksRes.data || []).filter(t => !t.data?.completed))
      setHotReplies(hotRes.data || [])
      setSignals(signalRes.data || [])
    } catch (err) {
      console.error('[CommandCentre] load', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const completeTask = async (task, e) => {
    e?.stopPropagation()
    const updated = { ...task.data, completed: true, completedAt: new Date().toISOString() }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    if (selected?.kind === 'task' && selected.id === task.id) setSelected(null)
    await supabase.from('tasks').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', task.id)
  }

  // ── Derived groupings ──
  const weightedPipeline = useMemo(
    () => deals.reduce((s, d) => s + ((parseFloat(d.data?.value) || 0) * ((STAGE_PROB[d.data?.stage] || 10) / 100)), 0),
    [deals]
  )
  const now = Date.now()
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date()),
    [tasks]
  )
  const thisWeekTasks = useMemo(
    () => tasks.filter(t => {
      if (!t.data?.dueDate) return false
      const due = new Date(t.data.dueDate)
      if (due < new Date()) return false
      return (due - now) / 86400000 <= 7
    }).sort((a, b) => new Date(a.data.dueDate) - new Date(b.data.dueDate)),
    [tasks, now]
  )
  const staleDeals = useMemo(() => {
    return deals
      .map(d => {
        const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : new Date(d.updated_at)
        const days = Math.floor((now - last) / 86400000)
        const stage = d.data?.stage
        const prob = (STAGE_PROB[stage] || 10) / 100
        return { ...d.data, _id: d.id, daysSince: days, stage, weighted: (parseFloat(d.data?.value) || 0) * prob }
      })
      .filter(x => x.daysSince > 30)
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 10)
  }, [deals, now])

  // ── Kiko brief loader (SSE streaming from /api/kiko) ──
  useEffect(() => {
    if (!selected) { setBrief(''); return }
    if (briefAbortRef.current) briefAbortRef.current.abort()
    const controller = new AbortController()
    briefAbortRef.current = controller
    setBrief('')
    setBriefLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/kiko', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: buildBriefPrompt(selected),
            userEmail: user?.email || 'sunny@vanhawke.com',
            currentPage: 'command-centre',
            pageContext: { selectedItem: selected },
          }),
          signal: controller.signal,
        })
        if (!res.body) { setBriefLoading(false); return }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
            chunk.split('\n').forEach(line => {
              if (!line.startsWith('data:')) return
              const raw = line.slice(5).trim()
              if (!raw || raw === '[DONE]') return
              try {
                const evt = JSON.parse(raw)
                // Kiko SSE stream uses `delta` for text chunks; also support `text` as fallback
                const chunk = evt.delta || evt.text
                if (chunk) setBrief(prev => prev + chunk)
              } catch {}
            })
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[CommandCentre] brief', err)
      }
      setBriefLoading(false)
    })()
    return () => controller.abort()
  }, [selected, user?.email])

  // Channel helpers for Hot Reply cards
  const channelOf = (r) => r.type?.includes('linkedin') ? 'linkedin' : r.type?.includes('email') ? 'email' : 'reply'
  const channelIcon = (ch) => ch === 'linkedin' ? <Linkedin size={11} /> : ch === 'email' ? <Mail size={11} /> : <MessageSquare size={11} />

  // Select helpers — translate each row into a common 'selected' shape
  const selectReply = (r) => setSelected({
    kind: 'reply', id: r.id,
    title: r.title || '(reply)',
    meta: `${r.entity_name || 'Unknown'} · ${relativeTime(r.created_at)}`,
    payload: r,
  })
  const selectTask = (t) => setSelected({
    kind: 'task', id: t.id,
    title: taskLabel(t),
    meta: [taskSub(t), t.data?.dueDate ? dueLabel(t.data.dueDate) : 'no due date'].filter(Boolean).join(' · '),
    payload: t,
  })
  const selectDeal = (d) => setSelected({
    kind: 'deal', id: d._id,
    title: d.company || d.title || 'Untitled',
    meta: `${d.stage || 'Unknown'} · ${fmtCurrency(parseFloat(d.value) || 0)} · ${d.daysSince}d since activity`,
    payload: d,
  })
  const selectSignal = (s) => setSelected({
    kind: 'signal', id: s.id,
    title: s.title,
    meta: `${s.entity_name || ''} · ${relativeTime(s.created_at)}`.trim().replace(/^· /, ''),
    payload: s,
  })

  const isSelected = (kind, id) => selected?.kind === kind && selected?.id === id

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
        {/* HOT REPLIES BAND */}
        <div className="cc-hot-band">
          <div className="cc-hot-h">
            <h3><MessageSquare size={13} /> Hot replies</h3>
            {hotReplies.length > 0 && <span className="cc-hot-h-count">{hotReplies.length} new</span>}
            <span className="cc-hot-h-meta">last 24h</span>
          </div>
          {loading ? (
            <div className="cc-empty-row">Loading…</div>
          ) : hotReplies.length === 0 ? (
            <div className="cc-empty-row">No replies in last 24h · email & LinkedIn responses land here when they arrive</div>
          ) : (
            <div className="cc-hot-scroll">
              {hotReplies.map(r => {
                const ch = channelOf(r)
                return (
                  <div
                    key={r.id}
                    className={`cc-hot-card ${isSelected('reply', r.id) ? 'selected' : ''}`}
                    onClick={() => selectReply(r)}
                  >
                    <div className="cc-hot-card-row1">
                      <div className={`cc-hot-card-channel ${ch}`}>{channelIcon(ch)}</div>
                      <div className="cc-hot-card-from">{r.entity_name || 'Unknown'}</div>
                      <div className="cc-hot-card-when">{relativeTime(r.created_at)}</div>
                    </div>
                    <div className="cc-hot-card-title">{r.title || '(no subject)'}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* MASTER-DETAIL GRID */}
        <div className="cc-grid">
          {/* LEFT: Grouped priority list */}
          <div className="cc-list">
            {/* OVERDUE TASKS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><AlertTriangle size={10} />Overdue</h3>
                <span className="cc-group-count">{overdueTasks.length}</span>
              </div>
              {overdueTasks.length === 0 ? (
                <div className="cc-empty-row">Nothing overdue</div>
              ) : overdueTasks.slice(0, 8).map(t => (
                <div
                  key={t.id}
                  className={`cc-row ${isSelected('task', t.id) ? 'selected' : ''}`}
                  onClick={() => selectTask(t)}
                >
                  <button className="cc-row-icon terra" onClick={e => completeTask(t, e)} title="Mark done">
                    <Square size={10} />
                  </button>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{taskLabel(t)}</div>
                    <div className="cc-row-meta">
                      {taskSub(t) && <>{taskSub(t)} · </>}
                      {dueLabel(t.data?.dueDate)}
                      <span className="cc-row-tag overdue">OVERDUE</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* STALE DEALS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Clock size={10} />Stale deals</h3>
                <span className="cc-group-count">{staleDeals.length}</span>
              </div>
              {staleDeals.length === 0 ? (
                <div className="cc-empty-row">All deals active</div>
              ) : staleDeals.slice(0, 6).map(d => (
                <div
                  key={d._id}
                  className={`cc-row ${isSelected('deal', d._id) ? 'selected' : ''}`}
                  onClick={() => selectDeal(d)}
                >
                  <div className="cc-row-icon amber"><TrendingUp size={10} /></div>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{d.company || d.title || 'Untitled'}</div>
                    <div className="cc-row-meta">
                      {d.stage} · {fmtCurrency(parseFloat(d.value) || 0)} · {d.daysSince}d idle
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* THIS WEEK TASKS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Calendar size={10} />Due this week</h3>
                <span className="cc-group-count">{thisWeekTasks.length}</span>
              </div>
              {thisWeekTasks.length === 0 ? (
                <div className="cc-empty-row">Nothing due this week</div>
              ) : thisWeekTasks.slice(0, 8).map(t => (
                <div
                  key={t.id}
                  className={`cc-row ${isSelected('task', t.id) ? 'selected' : ''}`}
                  onClick={() => selectTask(t)}
                >
                  <button className="cc-row-icon sage" onClick={e => completeTask(t, e)} title="Mark done">
                    <Square size={10} />
                  </button>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{taskLabel(t)}</div>
                    <div className="cc-row-meta">
                      {taskSub(t) && <>{taskSub(t)} · </>}
                      {dueLabel(t.data?.dueDate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* SIGNALS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Zap size={10} />Market signals</h3>
                <span className="cc-group-count">{signals.length}</span>
              </div>
              {signals.length === 0 ? (
                <div className="cc-empty-row">No active signals</div>
              ) : signals.slice(0, 8).map(s => (
                <div
                  key={s.id}
                  className={`cc-row ${isSelected('signal', s.id) ? 'selected' : ''}`}
                  onClick={() => selectSignal(s)}
                >
                  <div className="cc-row-icon purple"><Zap size={10} /></div>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{s.title}</div>
                    <div className="cc-row-meta">
                      {s.entity_name && <>{s.entity_name} · </>}
                      {relativeTime(s.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Detail pane with Kiko brief */}
          <aside className="cc-detail">
            {!selected ? (
              <div className="cc-detail-empty">
                <div className="cc-detail-empty-icon"><Inbox size={22} /></div>
                <h3>Select an item</h3>
                <p>Click any priority item on the left and Kiko will brief you — where we are, what happens next, market context, and a draft if needed.</p>
              </div>
            ) : (
              <>
                <div className="cc-detail-h">
                  <div className="cc-detail-eyebrow">
                    {selected.kind === 'reply' && <><MessageSquare size={10} /> REPLY</>}
                    {selected.kind === 'task' && <><CheckSquare size={10} /> TASK</>}
                    {selected.kind === 'deal' && <><TrendingUp size={10} /> DEAL</>}
                    {selected.kind === 'signal' && <><Zap size={10} /> SIGNAL</>}
                  </div>
                  <h2 className="cc-detail-title">{selected.title}</h2>
                  <div className="cc-detail-sub">{selected.meta}</div>
                </div>
                <div className="cc-detail-body">
                  {brief ? (
                    <div className="cc-detail-section-body" style={{ whiteSpace: 'pre-wrap' }}>{brief}</div>
                  ) : briefLoading ? (
                    <div className="cc-detail-loading">
                      <span className="dot" /><span className="dot" /><span className="dot" />
                      Kiko is briefing you…
                    </div>
                  ) : null}

                  {!briefLoading && brief && (
                    <div className="cc-detail-actions">
                      {selected.kind === 'deal' && (
                        <button className="cc-detail-btn primary" onClick={() => nav('/pipeline')}>
                          Open in Pipeline <ExternalLink size={11} />
                        </button>
                      )}
                      {selected.kind === 'reply' && selected.payload?.entity_id && (
                        <button className="cc-detail-btn primary" onClick={() => nav(`/contacts/${selected.payload.entity_id}`)}>
                          Open contact <ExternalLink size={11} />
                        </button>
                      )}
                      {selected.kind === 'task' && (
                        <button className="cc-detail-btn primary" onClick={e => completeTask(selected.payload, e)}>
                          Mark complete <CheckSquare size={11} />
                        </button>
                      )}
                      <button className="cc-detail-btn secondary" onClick={() => setSelected(null)}>Close</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
