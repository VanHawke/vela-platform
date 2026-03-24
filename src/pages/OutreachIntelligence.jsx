// OutreachIntelligence.jsx — Predictive Command Centre
// Surfaces: Today's priority actions, pipeline health, timing intelligence, activity stream
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import { Target, TrendingUp, Clock, Building2, Send, RefreshCw, Loader2, AlertTriangle, Calendar, ChevronRight } from 'lucide-react'
import T from '@/lib/theme'
import DOMPurify from 'dompurify'
import DoubleHelix from '@/components/kiko/DoubleHelix'

function md(text) {
  if (!text) return ''
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(255,255,255,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

export default function OutreachIntelligence({ user }) {
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])
  const [nextRace, setNextRace] = useState(null)
  const [selectedAction, setSelectedAction] = useState(null)
  const [kikoLoading, setKikoLoading] = useState(false)
  const [kikoRec, setKikoRec] = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dealsRes, actRes, raceRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")').order('updated_at', { ascending: false }),
        supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('race_calendar').select('name, date, circuit').gt('date', new Date().toISOString().split('T')[0]).order('date').limit(1),
      ])
      setDeals(dealsRes.data || [])
      setActivities(actRes.data || [])
      setNextRace(raceRes.data?.[0] || null)

      // Build priority actions from deals
      const now = new Date()
      const actions = (dealsRes.data || []).map(deal => {
        const d = deal.data || {}
        const daysSinceUpdate = Math.floor((now - new Date(deal.updated_at)) / 86400000)
        const stage = d.stage || 'Unknown'
        const stageProb = { 'Initial identification': 5, 'Contact Made': 15, 'First Meeting': 25, 'Proposal Sent': 40, 'Negotiation': 60, 'Verbal Agreement': 80, 'Contract Review': 90 }
        const prob = stageProb[stage] || 10
        const value = parseFloat(d.value) || 0
        const weightedValue = value * (prob / 100)
        // Urgency: stale deals get higher urgency
        const urgency = daysSinceUpdate > 30 ? 3 : daysSinceUpdate > 14 ? 2 : daysSinceUpdate > 7 ? 1 : 0
        const isStale = daysSinceUpdate > 30
        const actionType = stage === 'Initial identification' ? 'First outreach' :
          stage === 'Contact Made' ? 'Follow-up email' :
          stage === 'First Meeting' ? 'Send proposal' :
          stage === 'Proposal Sent' ? 'Follow up on proposal' :
          stage === 'Negotiation' ? 'Close negotiation' :
          stage === 'Verbal Agreement' ? 'Finalise contract' :
          stage === 'Contract Review' ? 'Chase signature' : 'Review'
        // Priority score: weighted value × urgency multiplier
        const priorityScore = weightedValue * (1 + urgency * 0.5) + (isStale ? 50 : 0)
        return { ...deal, daysSinceUpdate, stage, prob, value, weightedValue, urgency, isStale, actionType, priorityScore }
      }).sort((a, b) => b.priorityScore - a.priorityScore)

      setPageContext({ page: 'outreach-intelligence', summary: `Command Centre: ${actions.length} active deals, ${actions.filter(a => a.isStale).length} stale` })
    } catch (e) { console.error('[CommandCentre]', e) }
    finally { setLoading(false) }
  }

  // Kiko recommendation for selected action
  const getKikoRec = useCallback(async (deal) => {
    setSelectedAction(deal)
    setKikoLoading(true)
    setKikoRec(null)
    try {
      const d = deal.data || {}
      const prompt = `PRIORITY ACTION for: ${d.company || 'Unknown'} (${d.contact || 'no contact'})
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
        body: JSON.stringify({ message: prompt, currentPage: 'outreach-intelligence', userEmail: user?.email || 'sunny@vanhawke.com', conversationHistory: [] })
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
  const stageProb = { 'Initial identification': 5, 'Contact Made': 15, 'First Meeting': 25, 'Proposal Sent': 40, 'Negotiation': 60, 'Verbal Agreement': 80, 'Contract Review': 90 }
  const priorityActions = deals.map(deal => {
    const d = deal.data || {}
    const daysSinceUpdate = Math.floor((now - new Date(deal.updated_at)) / 86400000)
    const stage = d.stage || 'Unknown'
    const prob = stageProb[stage] || 10
    const value = parseFloat(d.value) || 0
    const weightedValue = value * (prob / 100)
    const isStale = daysSinceUpdate > 30
    const urgency = daysSinceUpdate > 30 ? 3 : daysSinceUpdate > 14 ? 2 : daysSinceUpdate > 7 ? 1 : 0
    const actionType = stage === 'Initial identification' ? 'First outreach' : stage === 'Contact Made' ? 'Follow-up' : stage === 'First Meeting' ? 'Send proposal' : stage === 'Proposal Sent' ? 'Chase proposal' : stage === 'Negotiation' ? 'Close' : stage === 'Verbal Agreement' ? 'Finalise contract' : 'Review'
    const priorityScore = weightedValue * (1 + urgency * 0.5) + (isStale ? 50 : 0)
    return { ...deal, daysSinceUpdate, stage, prob, value, weightedValue, isStale, urgency, actionType, priorityScore }
  }).sort((a, b) => b.priorityScore - a.priorityScore)

  const totalPipeline = deals.reduce((s, d) => s + (parseFloat(d.data?.value) || 0), 0)
  const weightedPipeline = priorityActions.reduce((s, a) => s + a.weightedValue, 0)
  const staleCount = priorityActions.filter(a => a.isStale).length
  const daysToRace = nextRace ? Math.ceil((new Date(nextRace.date) - now) / 86400000) : null

  const urgencyColor = (u) => u >= 3 ? 'rgba(255,59,48,0.6)' : u >= 2 ? 'rgba(245,158,11,0.5)' : u >= 1 ? 'rgba(139,108,246,0.4)' : 'rgba(255,255,255,0.1)'
  const card = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 16 }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: T.textTertiary }} /></div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: T.font }}>
      {/* LEFT — Priority Actions */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 400, color: T.text, margin: 0 }}>Command Centre</h1>
              <p style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>Priority actions ranked by deal value × urgency</p>
            </div>
            <button onClick={loadData} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Refresh</button>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <Target size={14} style={{ color: 'rgba(139,108,246,0.5)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 300, color: 'rgba(139,108,246,0.7)' }}>{deals.length}</div>
                <div style={{ fontSize: 9, color: T.textTertiary, fontWeight: 300 }}>Active deals</div>
              </div>
            </div>
            <div style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <TrendingUp size={14} style={{ color: 'rgba(0,212,170,0.5)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 300, color: 'rgba(0,212,170,0.6)' }}>${(weightedPipeline / 1000000).toFixed(1)}M</div>
                <div style={{ fontSize: 9, color: T.textTertiary, fontWeight: 300 }}>Weighted pipeline</div>
              </div>
            </div>
            <div style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <AlertTriangle size={14} style={{ color: staleCount > 0 ? 'rgba(255,59,48,0.5)' : 'rgba(6,214,160,0.4)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 300, color: staleCount > 0 ? 'rgba(255,59,48,0.6)' : 'rgba(6,214,160,0.5)' }}>{staleCount}</div>
                <div style={{ fontSize: 9, color: T.textTertiary, fontWeight: 300 }}>Stale (30d+)</div>
              </div>
            </div>
            {nextRace && (
              <div style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                <Calendar size={14} style={{ color: daysToRace <= 14 ? 'rgba(0,212,170,0.5)' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 300, color: daysToRace <= 14 ? 'rgba(0,212,170,0.6)' : 'rgba(255,255,255,0.4)' }}>{daysToRace}d</div>
                  <div style={{ fontSize: 9, color: T.textTertiary, fontWeight: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{nextRace.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Priority action list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Priority Actions</div>

          {priorityActions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontWeight: 300, fontSize: 13 }}>No active deals in pipeline.</div>
          )}

          {priorityActions.slice(0, 30).map((action, i) => {
            const d = action.data || {}
            const isSelected = selectedAction?.id === action.id
            return (
              <div key={action.id} onClick={() => getKikoRec(action)} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s',
                background: isSelected ? 'rgba(139,108,246,0.03)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isSelected ? 'rgba(139,108,246,0.2)' : 'rgba(255,255,255,0.03)'}`,
              }}
                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}}
                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)' }}}
              >
                {/* Rank */}
                <span style={{ fontSize: 10, color: i < 3 ? 'rgba(139,108,246,0.6)' : T.textTertiary, fontWeight: 500, width: 16, textAlign: 'center', flexShrink: 0, marginTop: 3 }}>{i + 1}</span>
                {/* Urgency bar */}
                <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0, marginTop: 2, background: urgencyColor(action.urgency) }} />
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{action.actionType}</span>
                    {action.isStale && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,59,48,0.08)', color: 'rgba(255,59,48,0.6)', fontWeight: 500 }}>STALE</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.75)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.company || 'Unknown'}{d.contact ? ` — ${d.contact}` : ''}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300 }}>{action.stage}</span>
                    {action.value > 0 && <span style={{ fontSize: 10, color: 'rgba(0,212,170,0.4)', fontWeight: 300 }}>${(action.value / 1000000).toFixed(1)}M</span>}
                    <span style={{ fontSize: 10, color: action.daysSinceUpdate > 30 ? 'rgba(255,59,48,0.5)' : T.textTertiary, fontWeight: 300 }}>{action.daysSinceUpdate}d ago</span>
                    <span style={{ fontSize: 10, color: 'rgba(139,108,246,0.3)', fontWeight: 300 }}>{action.prob}%</span>
                  </div>
                </div>
                <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.08)', flexShrink: 0, marginTop: 8 }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT — Kiko Intelligence Panel */}
      <div style={{ width: 370, borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.01)', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 40, height: 12, overflow: 'hidden' }}><DoubleHelix width={40} height={12} mini /></div>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(139,108,246,0.6)', letterSpacing: '0.04em' }}>Kiko Intelligence</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!selectedAction && !kikoLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Target size={20} style={{ color: 'rgba(255,255,255,0.08)', margin: '0 auto 10px', display: 'block' }} />
              <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, lineHeight: 1.5 }}>Select a deal to get Kiko's recommendation — analysis, timing, and draft message.</p>
            </div>
          )}

          {kikoLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,108,246,0.45) 0%, rgba(0,212,170,0.25) 60%, transparent 100%)', boxShadow: '0 0 18px rgba(139,108,246,0.35)', animation: 'kikoThink 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, color: 'rgba(139,108,246,0.6)', fontWeight: 400 }}>Analysing deal...</span>
            </div>
          )}

          {kikoRec && selectedAction && (
            <div>
              {/* Context header */}
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{selectedAction.actionType}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>{selectedAction.data?.company}{selectedAction.data?.contact ? ` · ${selectedAction.data.contact}` : ''}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: T.textTertiary }}>{selectedAction.stage}</span>
                  {selectedAction.value > 0 && <span style={{ fontSize: 10, color: 'rgba(0,212,170,0.4)' }}>${(selectedAction.value / 1000000).toFixed(1)}M</span>}
                  <span style={{ fontSize: 10, color: selectedAction.isStale ? 'rgba(255,59,48,0.5)' : T.textTertiary }}>{selectedAction.daysSinceUpdate}d since activity</span>
                </div>
              </div>
              {/* Kiko's analysis */}
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: 300, lineHeight: 1.65 }}>
                <span dangerouslySetInnerHTML={{ __html: md(kikoRec) }} />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {selectedAction && kikoRec && !kikoLoading && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => getKikoRec(selectedAction)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 400, border: '1px solid rgba(139,108,246,0.15)', background: 'rgba(139,108,246,0.04)', color: 'rgba(139,108,246,0.7)', cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Regenerate</button>
            <button onClick={() => navigator.clipboard.writeText(kikoRec)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 400, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontFamily: T.font }}>Copy</button>
          </div>
        )}
      </div>
    </div>
  )
}
