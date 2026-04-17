// Pipeline.jsx — Legora design + full OLD plumbing
// New visual layer (Legora aesthetic) wired to real data, real drag-drop,
// pipeline manager dropdown, deal detail side panel, all 7 stages including closed.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import PageHeader from '@/components/layout/PageHeader'
import { ChevronDown, X, Check, Plus, GripVertical, Eye, EyeOff, Building2, Users, Mail, Calendar, Clock, ExternalLink, Activity } from 'lucide-react'
import './Pipeline.css'

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

// Real stage IDs from your existing schema
const STAGES = [
  { id: 'To revisit',                       label: 'To Revisit',     dotClass: 'prospected' },
  { id: 'Contact made',                     label: 'Contact Made',   dotClass: 'engaged' },
  { id: 'In Dialogue',                      label: 'In Dialogue',    dotClass: 'replied' },
  { id: 'Qualified',                        label: 'Qualified',      dotClass: 'meeting' },
  { id: 'Meeting arranged (brand x RH)',    label: 'Meeting Arranged', dotClass: 'negotiating' },
]
const CLOSED_STAGES = [
  { id: 'Closed Won',  label: 'Won',  dotClass: 'won' },
  { id: 'Closed Lost', label: 'Lost', dotClass: 'lost' },
]

const SECTOR_CLASS = {
  'Banking': 'banking', 'FinTech': 'fintech', 'Fintech': 'fintech',
  'Gaming': 'gaming', 'Telecoms': 'telecoms', 'Telecom': 'telecoms',
  'F1': 'f1', 'WEC': 'f1', 'MotoGP': 'f1', 'Luxury': 'luxury',
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


// Pipeline Manager dropdown — extracted from OLD Pipeline.LOGIC_REF.jsx
function PipelineManager({ pipelines, activePipeline, onSelect, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const updatePos = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: r.left })
    }
    updatePos()
    const onClick = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false); setShowManage(false); setAddingNew(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const visible = pipelines.filter(p => p.visible !== false)
  const activeName = activePipeline === 'All' ? 'All Pipelines' : activePipeline

  const togglePipelineVisibility = async (id) => {
    const updated = pipelines.map(p => p.id === id ? { ...p, visible: !p.visible } : p)
    onUpdate(updated)
    await supabase.from('pipelines').update({ visible: !pipelines.find(p => p.id === id).visible }).eq('id', id)
  }

  const addPipeline = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    const id = `pl_${Date.now()}`
    const newP = { id, name: newName.trim(), visible: true, org_id: ORG_ID }
    onUpdate([...pipelines, newP])
    await supabase.from('pipelines').insert(newP)
    setNewName(''); setAddingNew(false); setSaving(false)
  }


  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        className="pl-mgr-trigger"
      >
        <span>{activeName}</span>
        <ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="pl-mgr-menu" style={{ top: pos.top, left: pos.left }}>
          <button
            className={`pl-mgr-item ${activePipeline === 'All' ? 'active' : ''}`}
            onClick={() => { onSelect('All'); setOpen(false) }}
          >
            <span>All Pipelines</span>
            {activePipeline === 'All' && <Check size={12} />}
          </button>
          <div className="pl-mgr-divider" />
          {visible.map(pl => (
            <button
              key={pl.id}
              className={`pl-mgr-item ${pl.name === activePipeline ? 'active' : ''}`}
              onClick={() => { onSelect(pl.name); setOpen(false) }}
            >
              <span>{pl.name}</span>
              {pl.name === activePipeline && <Check size={12} />}
            </button>
          ))}
          <div className="pl-mgr-divider" />
          <button className="pl-mgr-item subtle" onClick={() => setShowManage(s => !s)}>
            <span>Manage pipelines</span>
            {showManage && <Check size={12} />}
          </button>
          {showManage && (
            <div className="pl-mgr-manage">
              <p className="pl-mgr-section">VISIBILITY & ORDER</p>
              {pipelines.map(pl => (
                <div key={pl.id} className="pl-mgr-manage-row">
                  <GripVertical size={12} className="pl-mgr-grip" />
                  <span className={pl.visible ? '' : 'dim'}>{pl.name}</span>
                  <button onClick={() => togglePipelineVisibility(pl.id)} className="pl-mgr-eye">
                    {pl.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="pl-mgr-item subtle" onClick={() => setAddingNew(a => !a)}>
            <Plus size={12} />
            <span>New pipeline</span>
          </button>
          {addingNew && (
            <div className="pl-mgr-add">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addPipeline() }}
                placeholder="Pipeline name"
                autoFocus
              />
              <button onClick={addPipeline} disabled={!newName.trim() || saving} className="pl-mgr-add-btn">
                {saving ? '...' : 'Create'}
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}


export default function Pipeline({ user }) {
  const nav = useNavigate()
  const [deals, setDeals] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [pipelineFilter, setPipelineFilter] = useState('All')
  const [showClosed, setShowClosed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [companyDomains, setCompanyDomains] = useState({})

  // Deal panel state
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [dealCompany, setDealCompany] = useState(null)
  const [dealContacts, setDealContacts] = useState([])
  const [dealCampaigns, setDealCampaigns] = useState([])
  const [dealTasks, setDealTasks] = useState([])
  const [dealActivities, setDealActivities] = useState([])
  const [activityNote, setActivityNote] = useState('')
  const [loadingPanel, setLoadingPanel] = useState(false)

  // New deal modal
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDeal, setNewDeal] = useState({ title: '', company: '', value: '', pipeline: '' })
  const [savingNewDeal, setSavingNewDeal] = useState(false)
  const createNewDeal = async () => {
    if (!newDeal.title.trim()) return
    setSavingNewDeal(true)
    const id = `d${Date.now()}`
    const now = new Date().toISOString()
    const data = {
      id,
      title: newDeal.title.trim(),
      company: newDeal.company.trim() || '',
      value: newDeal.value ? Number(String(newDeal.value).replace(/[^\d.]/g, '')) || 0 : 0,
      pipeline: newDeal.pipeline || (pipelines[0]?.name || ''),
      stage: STAGES[0].id,
      created_at: now,
    }
    await supabase.from('deals').insert({ id, org_id: ORG_ID, data, updated_at: now })
    setDeals(prev => [{ _id: id, ...data, updated_at: now }, ...prev])
    setShowNewDeal(false)
    setNewDeal({ title: '', company: '', value: '', pipeline: '' })
    setSavingNewDeal(false)
  }
  const [savingActivity, setSavingActivity] = useState(false)
  const [activityLogged, setActivityLogged] = useState(null)

  // Drag-drop state
  const [dragDeal, setDragDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  // Initial load — deals + pipelines + company domains
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [dealsRes, pipelinesRes, companiesRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at, org_id').order('updated_at', { ascending: false }),
        supabase.from('pipelines').select('*').eq('org_id', ORG_ID),
        supabase.from('companies').select('id, data').eq('org_id', ORG_ID).limit(500),
      ])
      if (cancelled) return

      // Normalize deals: spread data JSONB, generate _id
      const normalized = (dealsRes.data || []).map(d => ({
        _id: d.id,
        ...d.data,
        updated_at: d.updated_at,
      }))
      setDeals(normalized)

      // Pipelines list
      const pls = pipelinesRes.data || []
      setPipelines(pls.length > 0 ? pls : [
        { id: 'haas-f1',  name: 'Haas F1',     visible: true, org_id: ORG_ID },
        { id: 'cad-f1',   name: 'Cadillac F1', visible: true, org_id: ORG_ID },
      ])

      // Company domain map for logos
      const domMap = {}
      ;(companiesRes.data || []).forEach(c => {
        const name = c.data?.name
        const dom  = c.data?.domain || c.data?.website
        if (name && dom) domMap[name] = dom.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      })
      setCompanyDomains(domMap)

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])


  const activeStages = useMemo(
    () => showClosed ? [...STAGES, ...CLOSED_STAGES] : STAGES,
    [showClosed]
  )

  // Filter by pipeline + group by stage
  const filteredDeals = useMemo(() => {
    if (pipelineFilter === 'All') return deals
    return deals.filter(d => (d.pipeline || '') === pipelineFilter)
  }, [deals, pipelineFilter])

  const dealsByStage = useMemo(() => {
    const map = {}
    activeStages.forEach(s => { map[s.id] = [] })
    filteredDeals.forEach(d => {
      const stage = d.stage
      if (stage && map[stage]) map[stage].push(d)
    })
    return map
  }, [filteredDeals, activeStages])

  const totalValue = useMemo(() => {
    return filteredDeals.reduce((sum, d) => {
      if (d.stage === 'Closed Won' || d.stage === 'Closed Lost') return sum
      return sum + parseFloat(d.value || 0)
    }, 0)
  }, [filteredDeals])

  const activeDealCount = useMemo(
    () => filteredDeals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost').length,
    [filteredDeals]
  )

  // Pipeline analytics
  const pipelineAnalytics = useMemo(() => {
    const closedWon = deals.filter(d => d.stage === 'Closed Won')
    const closedLost = deals.filter(d => d.stage === 'Closed Lost')
    const totalClosed = closedWon.length + closedLost.length
    const winRate = totalClosed > 0 ? Math.round((closedWon.length / totalClosed) * 100) : 0
    const active = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
    const avgValue = active.length > 0 ? Math.round(active.reduce((s, d) => s + parseFloat(d.value || 0), 0) / active.length) : 0
    const wonValue = closedWon.reduce((s, d) => s + parseFloat(d.value || 0), 0)
    return { winRate, avgValue, wonValue, closedWon: closedWon.length, closedLost: closedLost.length, totalClosed, activeCount: active.length }
  }, [deals])

  // Drag-drop handlers
  const onDragStart = (deal) => setDragDeal(deal)
  const onDragOver = (e, stageId) => { e.preventDefault(); setDragOverStage(stageId) }
  const onDragLeave = () => setDragOverStage(null)
  const onDrop = async (e, newStage) => {
    e.preventDefault()
    if (!dragDeal || dragDeal.stage === newStage) {
      setDragDeal(null); setDragOverStage(null); return
    }
    const fromStage = dragDeal.stage
    const id = dragDeal._id
    setDeals(prev => prev.map(d => d._id === id ? { ...d, stage: newStage } : d))
    setDragDeal(null); setDragOverStage(null)
    // Update JSONB stage in deals.data
    const updatedData = { ...dragDeal, stage: newStage }
    delete updatedData._id
    delete updatedData.updated_at
    await supabase.from('deals').update({ data: updatedData, updated_at: new Date().toISOString() }).eq('id', id)
    await supabase.from('deal_stage_history').insert({
      deal_id: id, from_stage: fromStage, to_stage: newStage,
      changed_by: user.id, changed_at: new Date().toISOString()
    })
  }


  // Open deal panel + load related data (company, contacts, campaigns, tasks)
  const selectDeal = async (deal) => {
    setSelectedDeal(deal)
    setLoadingPanel(true)
    setDealCompany(null); setDealContacts([]); setDealCampaigns([]); setDealTasks([]); setDealActivities([])

    try {
      // Find company by name — fuzzy match (trim + lowercase + starts-with fallback)
      // Find company + contacts for this deal
      if (deal.company) {
        const needle = deal.company.toLowerCase().trim()

        // Company lookup (fuzzy match)
        const { data: companies } = await supabase
          .from('companies')
          .select('id, data, updated_at')
          .eq('org_id', ORG_ID)
        const match =
          (companies || []).find(c => (c.data?.name || '').toLowerCase().trim() === needle) ||
          (companies || []).find(c => { const n = (c.data?.name || '').toLowerCase().trim(); return n && (n.startsWith(needle) || needle.startsWith(n)) })
        if (match) {
          setDealCompany({ id: match.id, ...match.data })
        }

        // Contacts — server-side filter by company name, independent of org match
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, data')
          .filter('data->>company', 'ilike', `%${deal.company}%`)
          .limit(10)
        setDealContacts((contacts || []).map(c => ({ id: c.id, ...c.data })))
      }

      // Tasks linked to this deal
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20)
      const dealTasks = (tasks || [])
        .filter(t => t.data?.deal_id === deal._id || t.data?.deal === deal.company)
        .map(t => ({ id: t.id, ...t.data }))
      setDealTasks(dealTasks)

      // Campaigns this deal/contacts are enrolled in
      if (deal.company) {
        const { data: enrollments } = await supabase
          .from('kiko_sequence_enrollments')
          .select('id, sequence_id, contact_id, status, kiko_sequences(name)')
          .limit(20)
        setDealCampaigns(enrollments || [])
      }

      // Activity history for this deal
      const actQuery = supabase.from('activities').select('id, type, subject, entity_name, direction, created_at, metadata').order('created_at', { ascending: false }).limit(15)
      if (deal._id) actQuery.eq('deal_id', deal._id)
      else if (deal.company) actQuery.ilike('entity_name', `%${deal.company}%`)
      const { data: activities } = await actQuery
      setDealActivities(activities || [])
    } catch (err) {
      console.error('[Pipeline] panel load error', err)
    }
    setLoadingPanel(false)
  }

  const closePanel = () => {
    setSelectedDeal(null); setDealCompany(null); setDealContacts([])
    setDealCampaigns([]); setDealTasks([]); setDealActivities([]); setActivityNote('')
  }

  const logActivity = async (type) => {
    if (savingActivity || !selectedDeal) return
    setSavingActivity(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('activities').insert({
      org_id: ORG_ID,
      type, entity_name: selectedDeal.company || selectedDeal.title,
      deal_id: selectedDeal._id, subject: activityNote || `${type} logged`,
      direction: 'outbound', created_at: now,
      metadata: { contact: selectedDeal.contactName, pipeline: selectedDeal.pipeline, logged_by: 'user' }
    })
    if (error) {
      console.error('[logActivity] Failed:', error.message)
      setSavingActivity(false)
      return
    }
    // Update the deal's updated_at to refresh "days since activity"
    await supabase.from('deals').update({ updated_at: now }).eq('id', selectedDeal._id)
    setActivityNote('')
    setSavingActivity(false)
    // Brief visual confirmation
    setActivityLogged(type)
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`, 'success')
    setTimeout(() => setActivityLogged(null), 2000)
    // Refresh activity list
    const { data: refreshed } = await supabase.from('activities').select('id, data, created_at').or(`data->>deal_id.eq.${selectedDeal._id},data->>company.ilike.%${selectedDeal.company || ''}%`).order('created_at', { ascending: false }).limit(15)
    setDealActivities((refreshed || []).map(a => ({ id: a.id, ...a.data, created_at: a.created_at })))
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
          { value: `${pipelineAnalytics.winRate}%`, label: 'Win rate' },
          { value: fmtCurrency(pipelineAnalytics.avgValue), label: 'Avg deal' },
        ]}
        toolbar={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, color: '#6B6B6B' }}>
              <input
                type="checkbox"
                checked={showClosed}
                onChange={e => setShowClosed(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: '#0A0A0A' }}
              />
              Show closed
            </label>
            <PipelineManager
              pipelines={pipelines}
              activePipeline={pipelineFilter}
              onSelect={setPipelineFilter}
              onUpdate={setPipelines}
            />
            <button className="pl-pri-btn" onClick={() => setShowNewDeal(true)}>
              <Plus size={12} />
              New deal
            </button>
          </div>
        }
      />

      <div className={`pl-board ${selectedDeal ? 'with-panel' : ''}`}>
        <div className="pl-cols-wrap">
          {activeStages.map(stage => (
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
                <span className="pl-stage-count">{dealsByStage[stage.id]?.length || 0}</span>
              </div>
              <div className="pl-col-body">
                {(dealsByStage[stage.id] || []).map(d => {
                  const company = d.company || d.title || 'Untitled'
                  const sector = d.sector || d.industry || ''
                  const value = parseFloat(d.value || 0)
                  const sectorClass = SECTOR_CLASS[sector] || ''
                  const isSel = selectedDeal && selectedDeal._id === d._id
                  return (
                    <div
                      key={d._id}
                      className={`pl-deal ${isSel ? 'selected' : ''}`}
                      draggable
                      onDragStart={() => onDragStart(d)}
                      onClick={() => selectDeal(d)}
                    >
                      <div className="pl-deal-row1">
                        <div className="pl-deal-mark">{initials(company)}</div>
                        <div className="pl-deal-name">{company}</div>
                      </div>
                      {d.contactName && <div className="pl-deal-contact">{d.contactName}</div>}
                      <div className="pl-deal-row3">
                        {sector && <span className={`pl-deal-tag ${sectorClass}`}>{sector}</span>}
                        {value > 0 && <span className="pl-deal-value">{fmtCurrency(value)}</span>}
                      </div>
                      {pipelineFilter === 'All' && d.pipeline && (
                        <div className="pl-deal-pipeline">{d.pipeline}</div>
                      )}
                    </div>
                  )
                })}
                {(dealsByStage[stage.id] || []).length === 0 && !loading && (
                  <div className="pl-col-empty">No deals</div>
                )}
              </div>
            </div>
          ))}
        </div>


        {/* DEAL DETAIL SIDE PANEL — Legora style */}
        {selectedDeal && (
          <aside className="pl-panel">
            <div className="pl-panel-h">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <div
                  className="pl-panel-mark"
                  onClick={() => {
                    if (dealCompany) nav(`/organisations?org=${dealCompany.id}`)
                    else if (selectedDeal?.company) nav(`/organisations?q=${encodeURIComponent(selectedDeal.company)}`)
                  }}
                  style={{ cursor: (dealCompany || selectedDeal?.company) ? 'pointer' : 'default' }}
                  title={dealCompany ? 'Open organisation' : selectedDeal?.company ? 'Search organisations' : ''}
                >
                  {companyDomains[selectedDeal.company] ? (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${companyDomains[selectedDeal.company]}&sz=128`}
                      alt=""
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <span>{initials(selectedDeal.company)}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2
                    className="pl-panel-title"
                    onClick={() => {
                      if (dealCompany) nav(`/organisations?org=${dealCompany.id}`)
                      else if (selectedDeal?.company) nav(`/organisations?q=${encodeURIComponent(selectedDeal.company)}`)
                    }}
                    style={{ cursor: (dealCompany || selectedDeal?.company) ? 'pointer' : 'default' }}
                    title={dealCompany ? 'Open organisation' : selectedDeal?.company ? 'Search organisations' : ''}
                  >
                    {selectedDeal.company || selectedDeal.title}
                  </h2>
                  {dealCompany?.industry && (
                    <p className="pl-panel-sub">
                      {dealCompany.industry}{dealCompany.country ? ` · ${dealCompany.country}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={closePanel} className="pl-panel-close">
                <X size={14} />
              </button>
            </div>

            <div className="pl-panel-meta">
              <div className="pl-panel-meta-row">
                <Building2 size={12} /> Rights Holder: <strong>{selectedDeal.pipeline || '—'}</strong>
              </div>
              <div className="pl-panel-meta-row">
                <Clock size={12} /> Stage: <strong>{selectedDeal.stage || '—'}</strong>
              </div>
              {selectedDeal.value && (
                <div className="pl-panel-meta-row">
                  Value: <strong>{fmtCurrency(parseFloat(selectedDeal.value))}</strong>
                </div>
              )}
            </div>

            {(dealCompany || selectedDeal?.company) && (
              <button
                onClick={() => {
                  if (dealCompany) nav(`/organisations?org=${dealCompany.id}`)
                  else nav(`/organisations?q=${encodeURIComponent(selectedDeal.company)}`)
                }}
                className="pl-panel-link-btn"
              >
                {dealCompany ? 'Open organisation' : 'Search organisation'} <ExternalLink size={11} />
              </button>
            )}

            {/* CONTACTS */}
            <div className="pl-panel-section">
              <p className="pl-panel-section-title">
                <Users size={11} style={{ marginRight: 6 }} />
                Contacts ({dealContacts.length})
              </p>
              {loadingPanel ? (
                <p className="pl-panel-empty">Loading...</p>
              ) : dealContacts.length === 0 ? (
                <p className="pl-panel-empty">No contacts found</p>
              ) : dealContacts.map(c => (
                <div
                  key={c.id}
                  className="pl-panel-contact"
                  onClick={() => nav(`/contacts/${c.id}`)}
                >
                  <div className="pl-panel-contact-mark">{initials([c.firstName, c.lastName].filter(Boolean).join(' '))}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pl-panel-contact-name">{[c.firstName, c.lastName].filter(Boolean).join(' ')}</div>
                    {c.title && <div className="pl-panel-contact-title">{c.title}</div>}
                  </div>
                </div>
              ))}
            </div>


            {/* CAMPAIGNS */}
            <div className="pl-panel-section">
              <p className="pl-panel-section-title">
                <Mail size={11} style={{ marginRight: 6 }} />
                Campaigns ({dealCampaigns.length})
              </p>
              {loadingPanel ? (
                <p className="pl-panel-empty">Loading...</p>
              ) : dealCampaigns.length === 0 ? (
                <p className="pl-panel-empty">Not enrolled in any campaigns</p>
              ) : dealCampaigns.slice(0, 5).map(c => (
                <div key={c.id} className="pl-panel-campaign">
                  <span>{c.kiko_sequences?.name || 'Campaign'}</span>
                  <span className={`pl-panel-status ${c.status || ''}`}>{c.status}</span>
                </div>
              ))}
            </div>

            {/* TASKS */}
            <div className="pl-panel-section">
              <p className="pl-panel-section-title">
                <Calendar size={11} style={{ marginRight: 6 }} />
                Tasks ({dealTasks.length})
              </p>
              {loadingPanel ? (
                <p className="pl-panel-empty">Loading...</p>
              ) : dealTasks.length === 0 ? (
                <p className="pl-panel-empty">No tasks</p>
              ) : dealTasks.slice(0, 5).map(t => (
                <div key={t.id} className="pl-panel-task">
                  <input type="checkbox" defaultChecked={t.completed} />
                  <span>{t.title || t.name || 'Task'}</span>
                </div>
              ))}
            </div>

            {/* ACTIVITY HISTORY */}
            <div className="pl-panel-section">
              <p className="pl-panel-section-title">
                <Activity size={11} style={{ marginRight: 6 }} />
                Activity history ({dealActivities.length})
              </p>
              {dealActivities.length === 0 ? (
                <p className="pl-panel-empty">No activity logged yet</p>
              ) : dealActivities.slice(0, 8).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  <span style={{ minWidth: 60, color: '#6B6B6B', flexShrink: 0 }}>
                    {a.type === 'email' ? '📧' : a.type === 'call' ? '📞' : a.type === 'meeting' ? '📅' : '📝'}
                    {' '}{a.type || 'note'}
                  </span>
                  <span style={{ flex: 1, color: '#0A0A0A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.subject || '—'}
                  </span>
                  <span style={{ color: '#A0A0A0', flexShrink: 0, fontSize: 10 }}>
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* LOG ACTIVITY */}
            <div className="pl-panel-section">
              <p className="pl-panel-section-title">Log activity</p>
              <textarea
                value={activityNote}
                onChange={e => setActivityNote(e.target.value)}
                placeholder="Notes from this interaction..."
                className="pl-panel-textarea"
              />
              <div className="pl-panel-activity-row">
                {activityLogged ? (
                  <div style={{ padding: '8px 0', color: '#06D6A0', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {activityLogged === 'email' ? 'Email logged' : activityLogged === 'call' ? 'Call logged' : activityLogged === 'meeting' ? 'Meeting logged' : 'Note saved'}
                  </div>
                ) : (
                  <>
                    <button onClick={() => logActivity('email')} disabled={savingActivity}>Email sent</button>
                    <button onClick={() => logActivity('call')} disabled={savingActivity}>Call made</button>
                    <button onClick={() => logActivity('meeting')} disabled={savingActivity}>Meeting</button>
                    <button onClick={() => logActivity('note')} disabled={savingActivity}>Note</button>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* NEW DEAL MODAL */}
      {showNewDeal && (
        <div onClick={() => setShowNewDeal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, width: 420, maxWidth: '92vw', boxShadow: '0 16px 48px rgba(0,0,0,0.15)', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: 0, fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 400, fontSize: 18, color: '#0A0A0A' }}>New deal</h3>
              <button onClick={() => setShowNewDeal(false)} style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', color: '#A0A0A0', borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '16px 22px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input autoFocus placeholder="Deal title *" value={newDeal.title} onChange={e => setNewDeal(p => ({ ...p, title: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <input placeholder="Company" value={newDeal.company} onChange={e => setNewDeal(p => ({ ...p, company: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <input placeholder="Value (USD)" value={newDeal.value} onChange={e => setNewDeal(p => ({ ...p, value: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <select value={newDeal.pipeline} onChange={e => setNewDeal(p => ({ ...p, pipeline: e.target.value }))} style={{ padding: '9px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#FFFFFF' }}>
                <option value="">Pipeline: default</option>
                {pipelines.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px 18px' }}>
              <button onClick={() => setShowNewDeal(false)} style={{ height: 34, padding: '0 16px', borderRadius: 4, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', color: '#0A0A0A', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={createNewDeal} disabled={savingNewDeal || !newDeal.title.trim()} style={{ height: 34, padding: '0 16px', borderRadius: 4, background: '#0A0A0A', border: '1px solid #0A0A0A', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: savingNewDeal ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !newDeal.title.trim() ? 0.4 : 1 }}>{savingNewDeal ? 'Creating…' : 'Create deal'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
