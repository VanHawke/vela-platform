import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ChevronDown, Clock, User, Building2, X, Send, Users, ExternalLink,
  Plus, Settings, GripVertical, Eye, EyeOff, Check, Trash2, Loader2
} from 'lucide-react'
import DocumentSection from '@/components/documents/DocumentSection'

const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

const STAGES = [
  { id: 'To revisit',                          label: 'To Revisit' },
  { id: 'Contact made',                         label: 'Contact Made' },
  { id: 'In Dialogue',                          label: 'In Dialogue' },
  { id: 'Qualified',                            label: 'Qualified' },
  { id: 'Meeting arranged (brand x RH)',        label: 'Meeting Arranged' },
]
const CLOSED_STAGES = [
  { id: 'Closed Won', label: 'Won' },
  { id: 'Closed Lost', label: 'Lost' },
]

// ── Pipeline Manager Dropdown ─────────────────────────────
function PipelineManager({ pipelines, activePipeline, onSelect, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowSettings(false) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addPipeline = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const maxOrder = Math.max(0, ...pipelines.map(p => p.sort_order))
    const { data, error } = await supabase.from('pipelines')
      .insert({ org_id: ORG_ID, name, sort_order: maxOrder + 1, visible: true })
      .select().single()
    if (!error && data) {
      onUpdate([...pipelines, data])
      setNewName('')
      onSelect(data.name)
    }
    setSaving(false)
  }

  const toggleVisible = async (pl) => {
    const { data } = await supabase.from('pipelines').update({ visible: !pl.visible }).eq('id', pl.id).select().single()
    if (data) onUpdate(pipelines.map(p => p.id === data.id ? data : p))
  }

  const deletePipeline = async (pl) => {
    if (!confirm(`Delete pipeline "${pl.name}"? All deals in this pipeline will remain but won't be reachable. This cannot be undone.`)) return
    await supabase.from('pipelines').delete().eq('id', pl.id)
    const updated = pipelines.filter(p => p.id !== pl.id)
    onUpdate(updated)
    if (activePipeline === pl.name && updated.length > 0) onSelect(updated[0].name)
  }

  // Drag-to-reorder
  const handleDragStart = (id) => setDragging(id)
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id) }
  const handleDrop = async (targetId) => {
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const ordered = [...pipelines].sort((a, b) => a.sort_order - b.sort_order)
    const fromIdx = ordered.findIndex(p => p.id === dragging)
    const toIdx   = ordered.findIndex(p => p.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...ordered]
    const [item] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, item)
    const updated = reordered.map((p, i) => ({ ...p, sort_order: i }))
    onUpdate(updated)
    setDragging(null); setDragOver(null)
    // Persist order
    for (const p of updated) {
      await supabase.from('pipelines').update({ sort_order: p.sort_order }).eq('id', p.id)
    }
  }

  const sorted = [...pipelines].sort((a, b) => a.sort_order - b.sort_order)
  const active = pipelines.find(p => p.name === activePipeline)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); setShowSettings(false) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)',
          background: 'rgba(0,0,0,0.03)', cursor: 'pointer',
          fontSize: 13, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font)',
        }}>
        <span>{activePipeline}</span>
        <ChevronDown size={14} color="var(--text-secondary)" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 260, overflow: 'hidden',
          fontFamily: 'var(--font)',
        }}>
          {/* Pipeline list */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            {sorted.filter(p => p.visible).map(pl => (
              <button key={pl.id} onClick={() => { onSelect(pl.name); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: pl.name === activePipeline ? 500 : 400 }}>{pl.name}</span>
                {pl.name === activePipeline && <Check size={14} color="#1A1A1A" />}
              </button>
            ))}
          </div>

          {/* Settings section */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <button onClick={() => setShowSettings(s => !s)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Settings size={14} color="var(--text-secondary)" />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Manage pipelines</span>
            </button>
          </div>

          {/* Manage panel */}
          {showSettings && (
            <div style={{ padding: '10px 14px 4px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Drag to reorder
              </p>
              {sorted.map(pl => (
                <div key={pl.id}
                  draggable
                  onDragStart={() => handleDragStart(pl.id)}
                  onDragOver={e => handleDragOver(e, pl.id)}
                  onDrop={() => handleDrop(pl.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 0', borderRadius: 6, cursor: 'grab',
                    background: dragOver === pl.id ? 'rgba(0,0,0,0.04)' : 'transparent',
                    opacity: dragging === pl.id ? 0.4 : 1,
                  }}>
                  <GripVertical size={13} color="var(--text-tertiary)" style={{ cursor: 'grab', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: pl.visible ? 'var(--text)' : 'var(--text-tertiary)' }}>{pl.name}</span>
                  <button onClick={() => toggleVisible(pl)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-tertiary)', display: 'flex' }}>
                    {pl.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button onClick={() => deletePipeline(pl)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#ef4444', display: 'flex' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new pipeline */}
          <div style={{ padding: '8px 14px 10px' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Plus size={14} color="#0055CC" style={{ flexShrink: 0 }} />
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPipeline()}
                placeholder="New pipeline name…"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 14,
                  color: 'var(--text)', fontFamily: 'var(--font)', background: 'transparent',
                }}
              />
              {newName.trim() && (
                <button onClick={addPipeline} disabled={saving} style={{ background: '#1A1A1A', border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', color: '#fff', fontSize: 11 }}>
                  {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : 'Add'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Pipeline({ user }) {
  const [deals, setDeals] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [pipelineFilter, setPipelineFilter] = useState('Haas F1')
  const [showClosed, setShowClosed] = useState(false)
  const [dragDeal, setDragDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [dealCompany, setDealCompany] = useState(null)
  const [dealContacts, setDealContacts] = useState([])
  const [dealCampaigns, setDealCampaigns] = useState([])
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [companyDomains, setCompanyDomains] = useState({})
  const nav = useNavigate()

  useEffect(() => { if (user?.id) load() }, [user?.id])

  const load = async () => {
    setLoading(true)
    const [{ data: dealsData }, { data: plData }, { data: orgs }] = await Promise.all([
      supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false }),
      supabase.from('pipelines').select('*').eq('org_id', ORG_ID).order('sort_order'),
      supabase.from('companies').select('data->>name, data->>website').not('data->>website', 'is', null).not('data->>website', 'eq', ''),
    ])
    setDeals((dealsData || []).map(row => ({ _id: row.id, ...row.data, updated_at: row.updated_at })))
    if (plData && plData.length > 0) {
      setPipelines(plData)
      setPipelineFilter(plData.find(p => p.visible)?.name || plData[0]?.name || 'Haas F1')
    }
    const domainMap = {}
    ;(orgs || []).forEach(o => { if (o.name && o.website) domainMap[o.name] = o.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] })
    setCompanyDomains(domainMap)
    setLoading(false)
  }

  const activeStages = useMemo(() => showClosed ? [...STAGES, ...CLOSED_STAGES] : STAGES, [showClosed])
  const filteredDeals = useMemo(() => deals.filter(d => d.pipeline === pipelineFilter), [deals, pipelineFilter])
  const dealsByStage = (stageId) => filteredDeals.filter(d => d.stage === stageId)

  const selectDeal = async (deal) => {
    setSelectedDeal(deal); setLoadingPanel(true)
    setDealCompany(null); setDealContacts([]); setDealCampaigns([])
    if (deal.company) {
      const { data: orgs } = await supabase.from('companies').select('id, data').filter('data->>name', 'eq', deal.company).limit(1)
      if (orgs?.length > 0) setDealCompany({ id: orgs[0].id, ...orgs[0].data })
      const { data: contacts } = await supabase.from('contacts').select('id, data').filter('data->>company', 'eq', deal.company).order('updated_at', { ascending: false }).limit(20)
      const cl = (contacts || []).map(ct => ({ id: ct.id, ...ct.data }))
      if (deal.contactName) {
        const pi = cl.findIndex(ct => (ct.firstName + ' ' + (ct.lastName || '')).trim().includes(deal.contactName?.split(' ')[0]))
        if (pi > 0) { const [p] = cl.splice(pi, 1); cl.unshift(p) }
      }
      setDealContacts(cl)
      const campMap = {}
      cl.forEach(ct => (ct.lemlistCampaigns || []).forEach(camp => {
        if (!camp.name) return
        if (!campMap[camp.name]) campMap[camp.name] = { name: camp.name, contacts: 0 }
        campMap[camp.name].contacts++
      }))
      setDealCampaigns(Object.values(campMap).sort((a, b) => b.contacts - a.contacts))
    }
    setLoadingPanel(false)
  }

  const closePanel = () => { setSelectedDeal(null); setDealCompany(null); setDealContacts([]); setDealCampaigns([]) }
  const panelOpen = !!selectedDeal

  const moveStage = async (deal, newStage) => {
    const now = new Date().toISOString()
    const updated = { ...deal }
    delete updated._id; delete updated.updated_at
    updated.stage = newStage
    if (newStage === 'Closed Won') { updated.status = 'won'; updated.wonDate = now.split('T')[0] }
    else if (newStage === 'Closed Lost') { updated.status = 'lost'; updated.lostDate = now.split('T')[0] }
    else updated.status = 'open'
    await supabase.from('deals').upsert({ id: deal._id, data: updated, updated_at: now }, { onConflict: 'id' })
    setDeals(prev => prev.map(d => d._id === deal._id ? { ...updated, _id: deal._id, updated_at: now } : d))
  }

  const handleDragStart = (e, deal) => { setDragDeal(deal); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal._id); e.target.style.opacity = '0.4' }
  const handleDragEnd = (e) => { e.target.style.opacity = '1'; setDragDeal(null); setDragOverStage(null) }
  const handleDragOver = (e, stageId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stageId) }
  const handleDragLeave = () => setDragOverStage(null)
  const handleDrop = (e, stageId) => { e.preventDefault(); setDragOverStage(null); if (dragDeal && dragDeal.stage !== stageId) moveStage(dragDeal, stageId); setDragDeal(null) }

  const daysAgo = (d) => {
    if (!d) return null
    const diff = Math.floor((new Date() - new Date(d)) / 86400000)
    if (diff === 0) return 'Today'; if (diff === 1) return '1d ago'
    if (diff < 30) return `${diff}d ago`; if (diff < 365) return `${Math.floor(diff/30)}mo ago`
    return `${Math.floor(diff/365)}y ago`
  }
  const staleStyle = (d) => {
    if (!d) return { color: 'var(--text-tertiary)' }
    const diff = Math.floor((new Date() - new Date(d)) / 86400000)
    if (diff > 60) return { color: '#ef4444' }; if (diff > 30) return { color: '#f59e0b' }
    return { color: 'var(--text-tertiary)' }
  }

  const activeDealCount = useMemo(() => filteredDeals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost').length, [filteredDeals])
  const sectionTitle = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const emptyText = { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', fontStyle: 'italic' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 8 }}>
      {/* Toolbar */}
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
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#1A1A1A' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>Show closed</span>
          </label>
          <PipelineManager
            pipelines={pipelines}
            activePipeline={pipelineFilter}
            onSelect={setPipelineFilter}
            onUpdate={setPipelines}
          />
        </div>
      </div>

      {/* Board + panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', padding: '0 16px 16px' }}>
        <div style={{ flex: 1, overflowX: 'auto', paddingTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, height: '100%', minWidth: 'max-content' }}>
            {activeStages.map(stage => {
              const stageDeals = dealsByStage(stage.id)
              const isOver = dragOverStage === stage.id
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
                  <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stage.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: '1px 7px' }}>{stageDeals.length}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading ? (
                      [...Array(2)].map((_, i) => <div key={i} style={{ height: 80, background: 'rgba(0,0,0,0.03)', borderRadius: 10 }} />)
                    ) : stageDeals.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font)' }}>No deals</p>
                    ) : stageDeals.map(deal => (
                      <div key={deal._id}
                        draggable
                        onDragStart={e => handleDragStart(e, deal)}
                        onDragEnd={handleDragEnd}
                        onClick={() => selectDeal(deal)}
                        style={{ background: '#FFFFFF', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'grab', transition: 'box-shadow 0.15s ease' }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {companyDomains[deal.company] ? (
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                              <img src={`https://www.google.com/s2/favicons?domain=${companyDomains[deal.company]}&sz=64`} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />
                            </div>
                          ) : (
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Building2 style={{ width: 11, height: 11, color: 'var(--text-tertiary)' }} />
                            </div>
                          )}
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {deal.company || deal.title}
                          </p>
                        </div>
                        {deal.contactName && (
                          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User style={{ width: 10, height: 10, opacity: 0.4 }} />{deal.contactName}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 3, ...staleStyle(deal.lastActivity) }}>
                            <Clock style={{ width: 9, height: 9 }} />{daysAgo(deal.lastActivity) || 'No activity'}
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

        {/* Deal slide-out panel */}
        <div style={{ width: panelOpen ? 380 : 0, minWidth: panelOpen ? 380 : 0, transition: 'width 0.3s ease, min-width 0.3s ease, opacity 0.2s ease', opacity: panelOpen ? 1 : 0, overflow: 'hidden', marginLeft: panelOpen ? 16 : 0 }}>
          {selectedDeal && (
            <div style={{ width: 380, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '20px 20px 16px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {companyDomains[selectedDeal.company] ? (
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        <img src={`https://www.google.com/s2/favicons?domain=${companyDomains[selectedDeal.company]}&sz=128`} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 style={{ width: 18, height: 18, color: 'var(--text-tertiary)' }} />
                      </div>
                    )}
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{selectedDeal.company || selectedDeal.title}</h2>
                      {dealCompany?.industry && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{dealCompany.industry}{dealCompany.country ? ` · ${dealCompany.country}` : ''}</p>}
                    </div>
                  </div>
                  <button onClick={closePanel} style={{ background: 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                    <Building2 style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} /> Rights Holder: <strong>{selectedDeal.pipeline || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                    <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} /> Stage: <strong>{selectedDeal.stage || '—'}</strong>
                  </div>
                </div>
                {dealCompany && (
                  <button onClick={() => nav(`/organisations?org=${dealCompany.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    <ExternalLink style={{ width: 12, height: 12 }} /> View Organisation
                  </button>
                )}
              </div>
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}><Users style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Contacts ({dealContacts.length})</p>
                {loadingPanel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[...Array(2)].map((_, i) => <div key={i} style={{ height: 40, background: 'rgba(0,0,0,0.03)', borderRadius: 8 }} />)}</div>
                ) : dealContacts.length === 0 ? <p style={emptyText}>No contacts linked</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dealContacts.map((ct, i) => (
                      <div key={ct.id} onClick={() => nav(`/contacts/${ct.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', background: i === 0 ? 'rgba(59,130,246,0.04)' : 'transparent', border: i === 0 ? '1px solid rgba(59,130,246,0.1)' : '1px solid transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(59,130,246,0.04)' : 'transparent'}>
                        {ct.picture ? <img src={ct.picture} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: 'cover' }} /> : (
                          <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{(ct.firstName || '?')[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{[ct.firstName, ct.lastName].filter(Boolean).join(' ')}{i === 0 ? ' (Primary)' : ''}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: 'var(--font)' }}>{ct.title || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}><Send style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Lemlist Campaigns</p>
                {dealCampaigns.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dealCampaigns.map(camp => (
                      <div key={camp.name} style={{ padding: '8px 10px', background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)' }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{camp.name}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{camp.contacts} contact{camp.contacts !== 1 ? 's' : ''}</p>
                      </div>
                    ))}
                  </div>
                ) : <p style={emptyText}>No campaigns linked</p>}
              </div>
              <DocumentSection
                linkedDealId={selectedDeal?._id}
                linkedCompanyId={dealCompany?.id}
                companyName={selectedDeal?.company}
                linkedTeam={selectedDeal?.pipeline}
                entityLabel="Documents"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
