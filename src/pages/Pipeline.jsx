import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown, Clock, User, Building2, GripVertical } from 'lucide-react'

const PIPELINES = ['Haas F1', 'Alpine F1', 'Formula E', 'ONE Championship', 'Esports']

const STAGES = [
  { id: 'To revisit', label: 'To Revisit' },
  { id: 'Contact made', label: 'Contact Made' },
  { id: 'In Dialogue', label: 'In Dialogue' },
  { id: 'Qualified', label: 'Qualified' },
  { id: 'Meeting arranged (brand x RH)', label: 'Meeting Arranged' },
]

const CLOSED_STAGES = [
  { id: 'Closed Won', label: 'Won' },
  { id: 'Closed Lost', label: 'Lost' },
]

export default function Pipeline() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [pipelineFilter, setPipelineFilter] = useState('Haas F1')
  const [showClosed, setShowClosed] = useState(false)
  const [dragDeal, setDragDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false })
    setDeals((data || []).map(row => ({ _id: row.id, ...row.data, updated_at: row.updated_at })))
    setLoading(false)
  }

  const activeStages = useMemo(() => showClosed ? [...STAGES, ...CLOSED_STAGES] : STAGES, [showClosed])

  const filteredDeals = useMemo(() => {
    return deals.filter(d => d.pipeline === pipelineFilter)
  }, [deals, pipelineFilter])

  const dealsByStage = (stageId) => filteredDeals.filter(d => d.stage === stageId)

  const activeDealCount = useMemo(() => {
    return filteredDeals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost').length
  }, [filteredDeals])

  const moveStage = async (deal, newStage) => {
    const now = new Date().toISOString()
    const updated = { ...deal }
    delete updated._id
    delete updated.updated_at
    updated.stage = newStage
    if (newStage === 'Closed Won') { updated.status = 'won'; updated.wonDate = now.split('T')[0] }
    else if (newStage === 'Closed Lost') { updated.status = 'lost'; updated.lostDate = now.split('T')[0] }
    else updated.status = 'open'
    await supabase.from('deals').upsert({ id: deal._id, data: updated, updated_at: now }, { onConflict: 'id' })
    setDeals(prev => prev.map(d => d._id === deal._id ? { ...updated, _id: deal._id, updated_at: now } : d))
  }

  // Drag and drop
  const handleDragStart = (e, deal) => {
    setDragDeal(deal)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', deal._id)
    e.target.style.opacity = '0.4'
  }
  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDragDeal(null)
    setDragOverStage(null)
  }
  const handleDragOver = (e, stageId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageId)
  }
  const handleDragLeave = () => setDragOverStage(null)
  const handleDrop = (e, stageId) => {
    e.preventDefault()
    setDragOverStage(null)
    if (dragDeal && dragDeal.stage !== stageId) {
      moveStage(dragDeal, stageId)
    }
    setDragDeal(null)
  }

  const daysAgo = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - d) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return '1d ago'
    if (diff < 30) return `${diff}d ago`
    if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
    return `${Math.floor(diff / 365)}y ago`
  }

  const staleClass = (dateStr) => {
    if (!dateStr) return { color: 'var(--text-tertiary)' }
    const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000)
    if (diff > 60) return { color: '#ef4444' }
    if (diff > 30) return { color: '#f59e0b' }
    return { color: 'var(--text-tertiary)' }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 8 }}>
      {/* Glass toolbar */}
      <div style={{
        margin: '0 16px', padding: '12px 20px', borderRadius: 16,
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Deal Pipeline</h1>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>
            {activeDealCount} active deal{activeDealCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#1A1A1A' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>Show closed</span>
          </label>
          <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)} style={{
            background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)', outline: 'none', fontFamily: 'var(--font)',
          }}>
            {PIPELINES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Kanban columns */}
      <div style={{ flex: 1, overflowX: 'auto', padding: '16px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 12, height: '100%', minWidth: 'max-content' }}>
          {activeStages.map(stage => {
            const stageDeals = dealsByStage(stage.id)
            const isOver = dragOverStage === stage.id
            const isClosedStage = stage.id === 'Closed Won' || stage.id === 'Closed Lost'
            return (
              <div key={stage.id}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id)}
                style={{
                  width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  background: isOver ? 'rgba(26,26,26,0.04)' : 'rgba(0,0,0,0.015)',
                  borderRadius: 14, border: isOver ? '2px dashed rgba(26,26,26,0.2)' : '1px solid rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease',
                }}>
                {/* Column header */}
                <div style={{
                  padding: '12px 14px 10px', borderBottom: '1px solid rgba(0,0,0,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{stage.label}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', fontFamily: 'var(--font)',
                      background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: '1px 7px',
                    }}>{stageDeals.length}</span>
                  </div>
                </div>

                {/* Deal cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {loading ? (
                    [...Array(2)].map((_, i) => (
                      <div key={i} style={{ height: 80, background: 'rgba(0,0,0,0.03)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
                    ))
                  ) : stageDeals.length === 0 ? (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font)' }}>
                      No deals
                    </p>
                  ) : stageDeals.map(deal => (
                    <div key={deal._id}
                      draggable
                      onDragStart={e => handleDragStart(e, deal)}
                      onDragEnd={handleDragEnd}
                      style={{
                        background: '#FFFFFF', borderRadius: 10, padding: '12px 14px',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        cursor: 'grab', transition: 'box-shadow 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}
                    >
                      {/* Company name - headline */}
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.3 }}>
                        {deal.company || deal.title}
                      </p>
                      {/* Contact name */}
                      {deal.contactName && (
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User style={{ width: 10, height: 10, opacity: 0.4 }} />
                          {deal.contactName}
                        </p>
                      )}
                      {/* Bottom row: last activity + owner */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 3, ...staleClass(deal.lastActivity) }}>
                          <Clock style={{ width: 9, height: 9 }} />
                          {daysAgo(deal.lastActivity) || 'No activity'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>
                          {deal.owner ? deal.owner.split(' ')[0] : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
