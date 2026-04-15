// Pipeline.jsx — Legora-style Kanban
// Mockup-faithful port of kiko-pipeline.html
// Preserves existing Supabase data layer (deals table, stages from Pipeline.OLD.jsx)

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import './Pipeline.css'

// Real stage IDs from existing schema — display labels updated to match mockup
const STAGES = [
  { id: 'To revisit',                       label: 'Prospected',  dotClass: 'prospected' },
  { id: 'Contact made',                     label: 'Engaged',     dotClass: 'engaged' },
  { id: 'In Dialogue',                      label: 'Replied',     dotClass: 'replied' },
  { id: 'Qualified',                        label: 'Meeting',     dotClass: 'meeting' },
  { id: 'Meeting arranged (brand x RH)',    label: 'Negotiating', dotClass: 'negotiating' },
]

// Sector → tag class mapping
const SECTOR_CLASS = {
  'Banking': 'banking',
  'FinTech': 'fintech',
  'Fintech': 'fintech',
  'Gaming': 'gaming',
  'Telecoms': 'telecoms',
  'Telecom': 'telecoms',
  'F1': 'f1',
  'WEC': 'f1',
  'MotoGP': 'f1',
  'Luxury': 'luxury',
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return ''
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Pipeline({ user }) {
  const nav = useNavigate()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('updated_at', { ascending: false })
      if (cancelled) return
      if (error) {
        console.error('[Pipeline] fetch error', error)
        setDeals([])
      } else {
        setDeals(data || [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const map = {}
    STAGES.forEach(s => { map[s.id] = [] })
    deals.forEach(d => {
      const stage = d.stage || d.data?.stage
      if (stage && map[stage]) map[stage].push(d)
    })
    return map
  }, [deals])

  const totalValue = useMemo(() => {
    return deals.reduce((sum, d) => {
      const stage = d.stage || d.data?.stage
      if (stage === 'Closed Won' || stage === 'Closed Lost') return sum
      return sum + parseFloat(d.value || d.data?.value || 0)
    }, 0)
  }, [deals])

  const activeDealCount = useMemo(() => {
    return deals.filter(d => {
      const stage = d.stage || d.data?.stage
      return stage && stage !== 'Closed Won' && stage !== 'Closed Lost'
    }).length
  }, [deals])


  // Drag-drop state + handlers
  const [dragDeal, setDragDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  const onDragStart = (deal) => setDragDeal(deal)
  const onDragOver = (e, stageId) => { e.preventDefault(); setDragOverStage(stageId) }
  const onDragLeave = () => setDragOverStage(null)
  const onDrop = async (e, newStage) => {
    e.preventDefault()
    if (!dragDeal || dragDeal.stage === newStage) {
      setDragDeal(null); setDragOverStage(null); return
    }
    const fromStage = dragDeal.stage
    const id = dragDeal._id || dragDeal.id
    setDeals(prev => prev.map(d => (d._id || d.id) === id ? { ...d, stage: newStage } : d))
    setDragDeal(null); setDragOverStage(null)
    await supabase.from('deals').update({ stage: newStage }).eq('id', id)
    await supabase.from('deal_stage_history').insert({
      deal_id: id, from_stage: fromStage, to_stage: newStage,
      changed_by: 'user', changed_at: new Date().toISOString()
    })
  }

  return (
    <div className="pl">
      <PageHeader
        eyebrowCategory="REVENUE"
        eyebrowSuffix="Pipeline"
        title="Pipeline"
        stats={[
          { value: activeDealCount, label: 'Active deals' },
          { value: fmtCurrency(totalValue), label: 'Weighted' },
        ]}
        toolbar={
          <button className="pl-pri-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New deal
          </button>
        }
      />

      <div className="pl-board">
        {STAGES.map(stage => (
          <div
            key={stage.id}
            className={`pl-col ${dragOverStage === stage.id ? 'drag-over' : ''}`}
            onDragOver={(e) => onDragOver(e, stage.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, stage.id)}
          >
            <div className="pl-col-h">
              <span className={`pl-stage-dot ${stage.dotClass}`}></span>
              <span className="pl-stage-name">{stage.label}</span>
              <span className="pl-stage-count">{dealsByStage[stage.id].length}</span>
            </div>
            <div className="pl-col-body">
              {dealsByStage[stage.id].map(d => {
                const data = d.data || {}
                const company = data.company || d.company || data.brand || 'Untitled'
                const contact = data.contact || data.contact_name || d.contact_name || ''
                const sector = data.sector || data.industry || ''
                const value = d.value || data.value || 0
                const sectorClass = SECTOR_CLASS[sector] || ''
                return (
                  <div
                    key={d._id || d.id}
                    className="pl-deal"
                    draggable
                    onDragStart={() => onDragStart(d)}
                    onClick={() => nav(`/contacts/${data.contact_id || ''}`)}
                  >
                    <div className="pl-deal-row1">
                      <div className="pl-deal-mark">{initials(company)}</div>
                      <div className="pl-deal-name">{company}</div>
                    </div>
                    {contact && <div className="pl-deal-contact">{contact}</div>}
                    <div className="pl-deal-row3">
                      {sector && <span className={`pl-deal-tag ${sectorClass}`}>{sector}</span>}
                      {value > 0 && <span className="pl-deal-value">{fmtCurrency(value)}</span>}
                    </div>
                  </div>
                )
              })}
              {dealsByStage[stage.id].length === 0 && !loading && (
                <div className="pl-col-empty">No deals</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
