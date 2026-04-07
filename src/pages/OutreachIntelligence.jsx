// OutreachIntelligence.jsx — Predictive Command Centre
// Surfaces: Today's priority actions, pipeline health, timing intelligence, activity stream
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import { Target, TrendingUp, Clock, Building2, Send, RefreshCw, Loader2, AlertTriangle, Calendar, ChevronRight, CheckSquare, Square } from 'lucide-react'
import T from '@/lib/theme'
import DOMPurify from 'dompurify'
import KikoWaveform from '@/components/kiko/KikoWaveform'
import CompanyLogo from '@/components/CompanyLogo'

function md(text) {
  if (!text) return ''
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(238,232,220,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

export default function OutreachIntelligence({ user }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])
  const [nextRace, setNextRace] = useState(null)
  const [raceSeries, setRaceSeries] = useState('F1')
  const [allNextRaces, setAllNextRaces] = useState({})
  const [tasks, setTasks] = useState([])
  const [prospectReplies, setProspectReplies] = useState([])
  const [signals, setSignals] = useState([])
  const [selectedAction, setSelectedAction] = useState(null)
  const [kikoLoading, setKikoLoading] = useState(false)
  const [kikoRec, setKikoRec] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [dealsRes, actRes, raceRes, tasksRes, repliesRes, signalsRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")').order('updated_at', { ascending: false }),
        supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('race_calendar').select('name, date, circuit, series').gt('date', new Date().toISOString().split('T')[0]).order('date').limit(10),
        supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
        supabase.from('kiko_alerts').select('id, title, detail, entity_name, entity_id, metadata, created_at').eq('type', 'reply_from_prospect').gte('created_at', yesterdayISO).order('created_at', { ascending: false }).limit(10),
        supabase.from('kiko_alerts').select('id, type, severity, title, detail, entity_name, created_at').in('type', ['partnership', 'promotion', 'funding', 'competitor_sponsorship']).order('created_at', { ascending: false }).limit(6),
      ])
      setDeals(dealsRes.data || [])
      setActivities(actRes.data || [])
      setProspectReplies(repliesRes.data || [])
      setSignals(signalsRes.data || [])
      // Group next races by series
      const races = raceRes.data || []
      const bySeriesMap = {}
      for (const r of races) {
        const s = r.series || 'F1'
        if (!bySeriesMap[s]) bySeriesMap[s] = r
      }
      setAllNextRaces(bySeriesMap)
      setNextRace(bySeriesMap['F1'] || races[0] || null)
      setTasks((tasksRes.data || []).filter(t => !t.data?.completed))

      // Build priority actions from deals
      const now = new Date()
      const actions = (dealsRes.data || []).map(deal => {
        const d = deal.data || {}
        const daysSinceUpdate = Math.floor((now - new Date(deal.updated_at)) / 86400000)
        const stage = d.stage || 'Unknown'
        const stageProb = { 'To revisit': 10, 'Contact made': 20, 'Qualified': 35, 'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55, 'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92 }
        const prob = stageProb[stage] || 10
        const value = parseFloat(d.value) || 0
        const weightedValue = value * (prob / 100)
        // Urgency: stale deals get higher urgency
        const urgency = daysSinceUpdate > 30 ? 3 : daysSinceUpdate > 14 ? 2 : daysSinceUpdate > 7 ? 1 : 0
        const isStale = daysSinceUpdate > 30
        const actionType = stage === 'To revisit' ? 'Re-engage' :
          stage === 'Contact made' ? 'Follow-up' :
          stage === 'Qualified' ? 'Schedule meeting' :
          stage === 'In Dialogue' ? 'Advance conversation' :
          stage === 'Meeting arranged (brand x RH)' ? 'Prepare meeting' :
          stage === 'Proposal Sent' ? 'Chase proposal' :
          stage === 'Negotiation' ? 'Close negotiation' :
          stage === 'Verbal Agreement' ? 'Finalise contract' :
          stage === 'Contract Review' ? 'Chase signature' : 'Review'
        // Priority score: weighted value × urgency multiplier
        const priorityScore = weightedValue * (1 + urgency * 0.5) + (isStale ? 50 : 0)
        return { ...deal, daysSinceUpdate, stage, prob, value, weightedValue, urgency, isStale, actionType, priorityScore }
      }).sort((a, b) => b.priorityScore - a.priorityScore)

      const topActions = actions.slice(0, 10).map(a => `${a.data?.company || '?'} (${a.stage}, ${a.daysSinceUpdate}d)`).join(', ')
      const overdueTasksCount = (tasksRes.data || []).filter(t => !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < new Date()).length
      const ctxSummary = `Command Centre — ${actions.length} active deals, ${actions.filter(a => a.isStale).length} stale (>30d), ${overdueTasksCount} overdue tasks, ${(repliesRes.data || []).length} prospect replies awaiting response in last 24h, ${(signalsRes.data || []).length} active signals`
      setPageContext({
        page: 'command-centre',
        summary: ctxSummary,
        visibleItems: topActions,
        data: {
          deals: actions.length,
          staleDeals: actions.filter(a => a.isStale).length,
          overdueTasks: overdueTasksCount,
          prospectReplies: (repliesRes.data || []).length,
          signals: (signalsRes.data || []).length,
          topPriorityCompanies: actions.slice(0, 5).map(a => a.data?.company).filter(Boolean),
        },
      })
    } catch (e) { console.error('[CommandCentre]', e) }
    finally { setLoading(false) }
  }

  const toggleTask = async (task) => {
    const updated = { ...task.data, completed: true, completedAt: new Date().toISOString() }
    await supabase.from('tasks').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  // Kiko recommendation for selected action
  const getKikoRec = useCallback(async (deal) => {
    setSelectedAction(deal)
    setKikoLoading(true)
    setKikoRec(null)
    try {
      const d = deal.data || {}
      const isTask = deal.isTask
      const td = deal.taskData || {}
      const prompt = isTask
        ? `TASK: "${td.type || 'Task'}" for ${td.company || 'unknown company'}${td.contact ? ` (contact: ${td.contact})` : ''}. Notes: "${td.notes || 'none'}". Due: ${td.dueDate || 'no date set'}.

Provide:
1. ANALYSIS — Current state, company intel, timing signals.
2. RECOMMENDED ACTION — Specific next move.
3. SUGGESTED DRAFT — If email/LinkedIn task, write a draft (100 words max, authority tone, no pricing).
4. TIMING — When to execute and why.

Be specific. Use web search for company intelligence if needed.`
        : `PRIORITY ACTION for: ${d.company || 'Unknown'} (${d.contact || 'no contact'})
Stage: ${deal.stage} | Value: $${(deal.value || 0).toLocaleString()} | Days since activity: ${deal.daysSinceUpdate}
Pipeline: ${d.pipeline || 'Unknown'} | ${deal.isStale ? 'STALE — needs immediate attention' : ''}

Provide a concise recommendation:
1. DIAGNOSIS — What's the situation? Why has this stalled or what's the next logical step?
2. RECOMMENDED ACTION — Specific next move (email, call, LinkedIn, meeting).
3. SUGGESTED DRAFT — If email/LinkedIn, write a 100-word max message. Authority tone, no pricing, no pleasantries.
4. TIMING — When to execute and why (reference calendar, budget cycles, or patterns).

Be direct. Use web search for current company intelligence if needed.`

      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, currentPage: 'outreach-intelligence', userEmail: user?.email || '', conversationHistory: [] })
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6); if (raw === '[DONE]') continue
          try { const j = JSON.parse(raw); if (j.delta) { full += j.delta; setKikoRec(full) } } catch {}
        }
      }
      if (full) setKikoRec(full)
    } catch (e) { setKikoRec('Error: ' + e.message) }
    finally { setKikoLoading(false) }
  }, [user])

  // Computed metrics
  const now = new Date()
  const stageProb = { 'To revisit': 10, 'Contact made': 20, 'Qualified': 35, 'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55, 'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92 }
  const priorityActions = deals.map(deal => {
    const d = deal.data || {}
    const daysSinceUpdate = Math.floor((now - new Date(deal.updated_at)) / 86400000)
    const stage = d.stage || 'Unknown'
    const prob = stageProb[stage] || 10
    const value = parseFloat(d.value) || 0
    const weightedValue = value * (prob / 100)
    const isStale = daysSinceUpdate > 30
    const urgency = daysSinceUpdate > 30 ? 3 : daysSinceUpdate > 14 ? 2 : daysSinceUpdate > 7 ? 1 : 0
    const actionType = stage === 'To revisit' ? 'Re-engage' : stage === 'Contact made' ? 'Follow-up' : stage === 'Qualified' ? 'Schedule meeting' : stage === 'In Dialogue' ? 'Advance' : stage === 'Meeting arranged (brand x RH)' ? 'Prepare meeting' : stage === 'Proposal Sent' ? 'Chase proposal' : stage === 'Negotiation' ? 'Close' : stage === 'Verbal Agreement' ? 'Finalise contract' : 'Review'
    const priorityScore = weightedValue * (1 + urgency * 0.5) + (isStale ? 50 : 0)
    return { ...deal, daysSinceUpdate, stage, prob, value, weightedValue, isStale, urgency, actionType, priorityScore }
  }).sort((a, b) => b.priorityScore - a.priorityScore)

  const totalPipeline = deals.reduce((s, d) => s + (parseFloat(d.data?.value) || 0), 0)
  const weightedPipeline = priorityActions.reduce((s, a) => s + a.weightedValue, 0)
  const staleCount = priorityActions.filter(a => a.isStale).length
  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - now) / 86400000) : null

  const urgencyColor = (u) => u >= 3 ? 'rgba(255,59,48,0.6)' : u >= 2 ? 'rgba(245,158,11,0.5)' : u >= 1 ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.10)'
  const card = { background: 'rgba(25,25,25,0.50)', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 14, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(167,139,250,0.50) inset' }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: T.textTertiary }} /></div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: T.font }}>
      {/* LEFT — Priority Actions */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 400, color: T.text, margin: 0 }}>Command Centre</h1>
              <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>Priority actions ranked by deal value × urgency</p>
            </div>
            <button onClick={loadData} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', color: T.textTertiary, fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Refresh</button>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div onClick={() => navigate('/pipeline')} style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
              <Target size={14} style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 300, color: 'rgba(167,139,250,0.7)' }}>{deals.length}</div>
                <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300 }}>Active deals</div>
              </div>
            </div>
            <div onClick={() => navigate('/pipeline')} style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,212,170,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
              <TrendingUp size={14} style={{ color: 'rgba(0,212,170,0.5)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 300, color: 'rgba(0,212,170,0.6)' }}>${(weightedPipeline / 1000000).toFixed(1)}M</div>
                <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300 }}>Weighted pipeline</div>
              </div>
            </div>
            <div onClick={() => navigate('/pipeline')} style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = staleCount > 0 ? 'rgba(255,59,48,0.2)' : 'rgba(6,214,160,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
              <AlertTriangle size={14} style={{ color: staleCount > 0 ? 'rgba(255,59,48,0.5)' : 'rgba(6,214,160,0.4)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 300, color: staleCount > 0 ? 'rgba(255,59,48,0.6)' : 'rgba(6,214,160,0.5)' }}>{staleCount}</div>
                <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300 }}>Stale (30d+)</div>
              </div>
            </div>
            {nextRace && (
              <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => navigate('/calendar')}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,212,170,0.2)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                  {['F1', 'Formula E', 'MotoGP', 'WEC'].map(s => (
                    <button key={s} onClick={e => { e.stopPropagation(); setRaceSeries(s); setNextRace(allNextRaces[s] || null) }}
                      style={{ padding: '2px 8px', borderRadius: 50, border: raceSeries === s ? '1px solid rgba(0,212,170,0.3)' : '1px solid rgba(167,139,250,0.06)', background: raceSeries === s ? 'rgba(0,212,170,0.08)' : 'transparent', color: raceSeries === s ? 'rgba(0,212,170,0.7)' : 'rgba(167,139,250,0.30)', fontSize: 9, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, transition: 'all 0.15s' }}>{s}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Calendar size={14} style={{ color: daysToRace <= 14 ? 'rgba(0,212,170,0.5)' : 'rgba(167,139,250,0.25)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 300, color: daysToRace <= 14 ? 'rgba(0,212,170,0.6)' : 'rgba(167,139,250,0.45)' }}>{daysToRace}d</div>
                    <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{nextRace.name}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Priority action list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

          {/* Prospect Replies section (Morning Brief surface) */}
          {prospectReplies.length > 0 && (<>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={12} style={{ color: 'rgba(248,113,113,0.6)' }} />
              Prospect Replies ({prospectReplies.length}) — need your response
            </div>
            {prospectReplies.map(reply => {
              const company = reply.metadata?.company || ''
              const fromEmail = reply.metadata?.from || ''
              const subject = reply.metadata?.subject || ''
              return (
                <div key={reply.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, marginBottom: 4, background: 'rgba(248,113,113,0.03)', border: '0.5px solid rgba(248,113,113,0.25)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.03)' }}
                  onClick={() => {
                    const taskShim = { id: reply.id, data: { company, contact: reply.entity_name || fromEmail }, isTask: true, taskData: { type: 'Prospect Reply', company, contact: reply.entity_name || fromEmail, notes: `Subject: ${subject}\n\n${reply.detail || ''}`, dueDate: null } }
                    setSelectedAction(taskShim)
                    getKikoRec(taskShim)
                  }}>
                  <Send size={14} style={{ color: 'rgba(248,113,113,0.6)', flexShrink: 0, marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(248,113,113,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Reply</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', color: 'rgba(248,113,113,0.6)', fontWeight: 500 }}>NEEDS ACTION</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {reply.entity_name || fromEmail}{company ? ` — ${company}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {subject || (reply.detail || '').slice(0, 80)}
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'rgba(248,113,113,0.4)', flexShrink: 0, marginTop: 8 }} />
                </div>
              )
            })}
            <div style={{ height: 16 }} />
          </>)}

          {/* Tasks Due section */}
          {tasks.length > 0 && (<>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckSquare size={12} style={{ color: 'rgba(6,214,160,0.5)' }} />
              Tasks Due ({tasks.length})
            </div>
            {tasks.slice(0, 8).map(task => {
              const d = task.data || {}
              const isOverdue = d.dueDate && new Date(d.dueDate) < new Date()
              return (
                <div key={task.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, marginBottom: 4, background: 'rgba(167,139,250,0.03)', border: '0.5px solid rgba(167,139,250,0.50)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(25,25,25,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.015)' }}
                  onClick={() => {
                    setSelectedAction({ id: task.id, data: { company: d.company || '', contact: d.contact || '' }, isTask: true, taskData: d })
                    getKikoRec({ id: task.id, data: { company: d.company || '', contact: d.contact || '' }, isTask: true, taskData: d })
                  }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleTask(task) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, color: 'rgba(167,139,250,0.25)' }}>
                    <Square size={14} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(6,214,160,0.6)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d.type || 'Task'}</span>
                      {isOverdue && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,59,48,0.08)', color: 'rgba(255,59,48,0.6)', fontWeight: 500 }}>OVERDUE</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.company || d.notes || 'Untitled task'}{d.contact ? ` — ${d.contact}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 3 }}>
                      {d.dueDate && <span style={{ fontSize: 11, color: isOverdue ? 'rgba(255,59,48,0.5)' : T.textTertiary }}><Clock size={10} style={{ marginRight: 3 }} />{d.dueDate}</span>}
                      {d.notes && d.company && <span style={{ fontSize: 11, color: T.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes.slice(0, 50)}</span>}
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'rgba(167,139,250,0.08)', flexShrink: 0, marginTop: 8 }} />
                </div>
              )
            })}
            <div style={{ height: 16 }} />
          </>)}

          <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Priority Actions</div>

          {priorityActions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontWeight: 300, fontSize: 14 }}>No active deals in pipeline.</div>
          )}

          {priorityActions.slice(0, 30).map((action, i) => {
            const d = action.data || {}
            const isSelected = selectedAction?.id === action.id
            return (
              <div key={action.id} onClick={() => getKikoRec(action)} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s',
                background: isSelected ? 'rgba(167,139,250,0.03)' : 'rgba(238,238,238,0.015)',
                border: `1px solid ${isSelected ? 'rgba(167,139,250,0.2)' : 'rgba(25,25,25,0.35)'}`,
              }}
                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(25,25,25,0.35)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}}
                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(238,238,238,0.015)'; e.currentTarget.style.borderColor = 'rgba(25,25,25,0.35)' }}}
              >
                {/* Rank */}
                <span style={{ fontSize: 11, color: i < 3 ? 'rgba(167,139,250,0.6)' : T.textTertiary, fontWeight: 500, width: 16, textAlign: 'center', flexShrink: 0, marginTop: 3 }}>{i + 1}</span>
                {/* Company logo */}
                <CompanyLogo name={d.company} size={28} />
                {/* Urgency bar */}
                <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0, marginTop: 2, background: urgencyColor(action.urgency) }} />
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{action.actionType}</span>
                    {action.isStale && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,59,48,0.08)', color: 'rgba(255,59,48,0.6)', fontWeight: 500 }}>STALE</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.75)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.company || 'Unknown'}{d.contact ? ` — ${d.contact}` : ''}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300 }}>{action.stage}</span>
                    {action.value > 0 && <span style={{ fontSize: 11, color: 'rgba(0,212,170,0.4)', fontWeight: 300 }}>${(action.value / 1000000).toFixed(1)}M</span>}
                    <span style={{ fontSize: 11, color: action.daysSinceUpdate > 30 ? 'rgba(255,59,48,0.5)' : T.textTertiary, fontWeight: 300 }}>{action.daysSinceUpdate}d ago</span>
                    <span style={{ fontSize: 11, color: 'rgba(167,139,250,0.3)', fontWeight: 300 }}>{action.prob}%</span>
                  </div>
                </div>
                <ChevronRight size={12} style={{ color: 'rgba(167,139,250,0.08)', flexShrink: 0, marginTop: 8 }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT — Kiko Intelligence Panel */}
      <div style={{ flex: 1, borderLeft: '1px solid rgba(25,25,25,0.40)', display: 'flex', flexDirection: 'column', background: 'rgba(238,238,238,0.01)', flexShrink: 0, minWidth: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(25,25,25,0.40)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 40, height: 12, overflow: 'hidden' }}><KikoWaveform width={40} height={12} mini /></div>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(167,139,250,0.6)', letterSpacing: '0.04em' }}>Kiko Intelligence</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!selectedAction && !kikoLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Target size={20} style={{ color: 'rgba(167,139,250,0.08)', margin: '0 auto 10px', display: 'block' }} />
              <p style={{ fontSize: 13, color: T.textTertiary, fontWeight: 300, lineHeight: 1.5 }}>Select a deal to get Kiko's recommendation — analysis, timing, and draft message.</p>
            </div>
          )}

          {kikoLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
              <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><KikoWaveform width={48} height={48} mini /></div>
              <span style={{ fontSize: 13, color: 'rgba(167,139,250,0.6)', fontWeight: 400 }}>Analysing deal...</span>
            </div>
          )}

          {kikoRec && selectedAction && (
            <div>
              {/* Context header */}
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(25,25,25,0.30)', border: '1px solid rgba(25,25,25,0.40)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                  {selectedAction.isTask ? (selectedAction.taskData?.type || 'Task') : selectedAction.actionType}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(238,232,220,0.70)', fontWeight: 400 }}>
                  {selectedAction.data?.company || selectedAction.taskData?.company}{selectedAction.data?.contact ? ` · ${selectedAction.data.contact}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {selectedAction.isTask ? (
                    <>
                      {selectedAction.taskData?.dueDate && <span style={{ fontSize: 11, color: new Date(selectedAction.taskData.dueDate) < new Date() ? 'rgba(255,59,48,0.5)' : T.textTertiary }}>Due: {selectedAction.taskData.dueDate}</span>}
                      {selectedAction.taskData?.notes && <span style={{ fontSize: 11, color: T.textTertiary }}>{selectedAction.taskData.notes.slice(0, 40)}</span>}
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: T.textTertiary }}>{selectedAction.stage}</span>
                      {selectedAction.value > 0 && <span style={{ fontSize: 11, color: 'rgba(0,212,170,0.4)' }}>${(selectedAction.value / 1000000).toFixed(1)}M</span>}
                      <span style={{ fontSize: 11, color: selectedAction.isStale ? 'rgba(255,59,48,0.5)' : T.textTertiary }}>{selectedAction.daysSinceUpdate}d since activity</span>
                    </>
                  )}
                </div>
              </div>
              {/* Kiko's analysis */}
              <div style={{ fontSize: 14, color: 'rgba(238,238,238,0.72)', fontWeight: 300, lineHeight: 1.65 }}>
                <span dangerouslySetInnerHTML={{ __html: md(kikoRec) }} />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {selectedAction && kikoRec && !kikoLoading && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(25,25,25,0.40)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => getKikoRec(selectedAction)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '1px solid rgba(167,139,250,0.15)', background: 'rgba(167,139,250,0.04)', color: 'rgba(167,139,250,0.7)', cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Regenerate</button>
            <button onClick={() => navigator.clipboard.writeText(kikoRec)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '0.5px solid rgba(167,139,250,0.50)', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontFamily: T.font }}>Copy</button>
          </div>
        )}
      </div>
    </div>
  )
}
