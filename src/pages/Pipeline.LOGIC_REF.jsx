import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import {
  ChevronDown, Clock, User, Building2, X, Send, Users, ExternalLink,
  Plus, Settings, GripVertical, Eye, EyeOff, Check, Trash2, Loader2, ArrowRight, CheckSquare
} from 'lucide-react'
import DocumentSection from '@/components/documents/DocumentSection'
import CompanyLogo from '@/components/CompanyLogo'
import PageHeader from '@/components/layout/PageHeader'

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
// Rendered via createPortal → escapes any parent overflow/backdrop-filter
// stacking context that would clip an absolute-positioned child.
function PipelineManager({ pipelines, activePipeline, onSelect, onUpdate }) {
  const [open, setOpen]               = useState(false)
  const [showManage, setShowManage]   = useState(false)
  const [addingNew, setAddingNew]     = useState(false)
  const [newName, setNewName]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [dragging, setDragging]       = useState(null)
  const [dragOver, setDragOver]       = useState(null)
  const [dropPos, setDropPos]         = useState({ top: 0, left: 0, width: 0 })
  const triggerRef  = useRef(null)
  const newInputRef = useRef(null)

  // Measure trigger position each time we open
  useEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const menuW = Math.max(r.width, 280)
      // If dropdown would overflow right edge, anchor to right side of trigger
      const wouldOverflow = r.left + menuW > window.innerWidth - 16
      setDropPos({
        top: r.bottom + 6,
        left: wouldOverflow ? undefined : r.left,
        right: wouldOverflow ? (window.innerWidth - r.right) : undefined,
        width: menuW
      })
    }
  }, [open])

  // Auto-focus input when add form opens
  useEffect(() => {
    if (addingNew) setTimeout(() => newInputRef.current?.focus(), 30)
  }, [addingNew])

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onMouse = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      // Check portal container
      const portal = document.getElementById('pipeline-dropdown-portal')
      if (portal?.contains(e.target)) return
      closeAll()
    }
    const onKey = (e) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  const closeAll = () => { setOpen(false); setShowManage(false); setAddingNew(false); setNewName('') }

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
      setAddingNew(false)
      onSelect(data.name)
      setOpen(false)
    }
    setSaving(false)
  }

  const toggleVisible = async (pl) => {
    const { data } = await supabase.from('pipelines').update({ visible: !pl.visible }).eq('id', pl.id).select().single()
    if (data) onUpdate(pipelines.map(p => p.id === data.id ? data : p))
  }

  const deletePipeline = async (pl) => {
    if (!confirm(`Delete "${pl.name}"? Deals will remain in the database but won't be reachable from the pipeline view.`)) return
    await supabase.from('pipelines').delete().eq('id', pl.id)
    const updated = pipelines.filter(p => p.id !== pl.id)
    onUpdate(updated)
    if (activePipeline === pl.name && updated.length > 0) onSelect(updated[0].name)
  }

  // Drag-to-reorder
  const onDragStart = (id) => setDragging(id)
  const onDragOver  = (e, id) => { e.preventDefault(); setDragOver(id) }
  const onDrop = async (targetId) => {
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const ordered = [...pipelines].sort((a, b) => a.sort_order - b.sort_order)
    const fi = ordered.findIndex(p => p.id === dragging)
    const ti = ordered.findIndex(p => p.id === targetId)
    if (fi === -1 || ti === -1) return
    const reordered = [...ordered]
    const [item] = reordered.splice(fi, 1)
    reordered.splice(ti, 0, item)
    const updated = reordered.map((p, i) => ({ ...p, sort_order: i }))
    onUpdate(updated)
    setDragging(null); setDragOver(null)
    for (const p of updated) await supabase.from('pipelines').update({ sort_order: p.sort_order }).eq('id', p.id)
  }

  const sorted  = [...pipelines].sort((a, b) => a.sort_order - b.sort_order)
  const visible = sorted.filter(p => p.visible)

  // ── Shared text style (always DM Sans via var(--font)) ──
  const tx = (extra = {}) => ({ fontFamily: 'var(--font)', ...extra })

  const dropdown = open ? createPortal(
    <div
      id="pipeline-dropdown-portal"
      style={{
        position: 'fixed',
        top: dropPos.top,
        left: dropPos.left,
        right: dropPos.right,
        minWidth: dropPos.width,
        zIndex: 9999,
        background: 'var(--surface)',
        borderRadius: 50,
        border: '1.5px solid var(--border-hover)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(25,25,25,0.40)',
        overflow: 'hidden',
      }}
    >
      {/* ── All Pipelines option ── */}
      <div style={{ padding: '6px 0', borderBottom: '1.5px solid var(--border)' }}>
        <button
          onClick={() => { onSelect('All'); closeAll() }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={tx({ flex: 1, fontSize: 15, color: 'var(--text)', fontWeight: activePipeline === 'All' ? 500 : 400 })}>All Pipelines</span>
          {activePipeline === 'All' && <Check size={14} strokeWidth={2.5} color="var(--text)" />}
        </button>
      </div>
      {/* ── Active pipelines ── */}
      <div style={{ padding: '6px 0', borderBottom: '1.5px solid var(--border)' }}>
        {visible.map(pl => (
          <button key={pl.id}
            onClick={() => { onSelect(pl.name); closeAll() }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={tx({ flex: 1, fontSize: 15, color: 'var(--text)', fontWeight: pl.name === activePipeline ? 500 : 400 })}>{pl.name}</span>
            {pl.name === activePipeline && <Check size={14} strokeWidth={2.5} color="var(--text)" />}
          </button>
        ))}
      </div>

      {/* ── Manage toggle ── */}
      <div style={{ padding: '4px 0', borderBottom: '1.5px solid var(--border)' }}>
        <button
          onClick={() => { setShowManage(s => !s); setAddingNew(false) }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Settings size={14} color="var(--text-tertiary)" />
          <span style={tx({ fontSize: 14, color: 'var(--text-secondary)' })}>Manage pipelines</span>
          {showManage && <Check size={12} color="var(--text-tertiary)" style={{ marginLeft: 'auto' }} />}
        </button>
      </div>

      {/* ── Manage panel (reorder / visibility / delete) ── */}
      {showManage && (
        <div style={{ padding: '10px 16px 8px', borderBottom: '1.5px solid var(--border)' }}>
          <p style={tx({ fontSize: 10, fontWeight: 400, color: 'var(--text-tertiary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 })}>
            Drag to reorder
          </p>
          {sorted.map(pl => (
            <div key={pl.id}
              draggable
              onDragStart={() => onDragStart(pl.id)}
              onDragOver={e => onDragOver(e, pl.id)}
              onDrop={() => onDrop(pl.id)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                borderRadius: 6, cursor: 'grab',
                background: dragOver === pl.id ? 'var(--surface-hover)' : 'transparent',
                opacity: dragging === pl.id ? 0.35 : 1,
              }}>
              <GripVertical size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              <span style={tx({ flex: 1, fontSize: 14, color: pl.visible ? 'var(--text)' : 'var(--text-tertiary)' })}>{pl.name}</span>
              <button onClick={() => toggleVisible(pl)} title={pl.visible ? 'Hide' : 'Show'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--text-tertiary)', display: 'flex', borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
                {pl.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button onClick={() => deletePipeline(pl)} title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--text-tertiary)', display: 'flex', borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── New pipeline ── */}
      {!addingNew ? (
        // Discovery affordance: visible button, not hidden input
        <button
          onClick={() => { setAddingNew(true); setShowManage(false) }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surface-hover)', border: '1.5px solid var(--border-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={13} color="var(--text-secondary)" strokeWidth={2} />
          </div>
          <span style={tx({ fontSize: 15, color: 'var(--text-secondary)' })}>New pipeline</span>
        </button>
      ) : (
        // Expanded inline form — focused, labelled, keyboard-complete
        <div style={{ padding: '12px 16px 14px' }}>
          <p style={tx({ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 6 })}>Pipeline name</p>
          <input
            ref={newInputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addPipeline() }
              if (e.key === 'Escape') { setAddingNew(false); setNewName('') }
            }}
            placeholder="e.g. McLaren F1, UEFA…"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 50,
              border: '1px solid var(--border-hover)',
              background: 'var(--bg)',
              fontSize: 15, color: 'var(--text)',
              fontFamily: 'var(--font)',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--text)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-hover)'}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={addPipeline}
              disabled={!newName.trim() || saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 50,
                background: newName.trim() ? 'var(--text)' : 'var(--surface-hover)',
                border: 'none', cursor: newName.trim() ? 'pointer' : 'default',
                fontSize: 14, fontWeight: 500, color: newName.trim() ? '#0A0A0A' : 'var(--text-tertiary)',
                fontFamily: 'var(--font)', transition: 'all 0.15s',
              }}>
              {saving
                ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <><ArrowRight size={13} /> Create pipeline</>}
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewName('') }}
              style={{ padding: '8px 12px', borderRadius: 50, background: 'transparent', border: '1.5px solid var(--border-hover)', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
              Cancel
            </button>
          </div>
          <p style={tx({ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 })}>
            Press Enter to create · Escape to cancel
          </p>
        </div>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderRadius: 50,
          border: open ? '1px solid var(--border-hover)' : '1px solid var(--border)',
          background: open ? 'var(--surface-hover)' : 'var(--surface)',
          cursor: 'pointer', transition: 'all 0.15s',
          fontSize: 14, fontWeight: 500,
          color: 'var(--text)', fontFamily: 'var(--font)',
          boxShadow: open ? 'none' : 'var(--shadow-sm)',
        }}>
        <span>{activePipeline}</span>
        <ChevronDown size={14} color="var(--text-tertiary)" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {dropdown}
    </div>
  )
}

export default function Pipeline({ user }) {
  const [deals, setDeals] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [pipelineFilter, setPipelineFilter] = useState('All')
  const [showClosed, setShowClosed] = useState(false)
  const [dragDeal, setDragDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [dealCompany, setDealCompany] = useState(null)
  const [dealContacts, setDealContacts] = useState([])
  const [dealCampaigns, setDealCampaigns] = useState([])
  const [dealTasks, setDealTasks] = useState([])
  const [activityNote, setActivityNote] = useState('')
  const [activityType, setActivityType] = useState(null)
  const [savingActivity, setSavingActivity] = useState(false)
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
      // Keep 'All' as default — only override if not set
      if (pipelineFilter !== 'All' && !plData.find(p => p.name === pipelineFilter)) {
        setPipelineFilter(plData.find(p => p.visible)?.name || plData[0]?.name || 'Haas F1')
      }
    }
    const domainMap = {}
    ;(orgs || []).forEach(o => { if (o.name && o.website) domainMap[o.name] = o.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] })
    setCompanyDomains(domainMap)
    setLoading(false)

    // Register page context for Kiko
    const activeDeals = (dealsData || []).filter(d => !['won','lost'].includes(d.data?.status))
    const stageCount = {}
    activeDeals.forEach(d => { const s = d.data?.stage || 'Unknown'; stageCount[s] = (stageCount[s] || 0) + 1 })
    const topDeals = activeDeals.slice(0, 15).map(d => `${d.data?.company || '?'} (${d.data?.stage || '?'})`).join(', ')
    setPageContext({ page: 'pipeline', summary: `Pipeline: ${activeDeals.length} active deals`, stageDistribution: stageCount, dealCount: activeDeals.length, visibleItems: topDeals })
  }

  const activeStages = useMemo(() => showClosed ? [...STAGES, ...CLOSED_STAGES] : STAGES, [showClosed])
  const filteredDeals = useMemo(() => pipelineFilter === 'All' ? deals : deals.filter(d => d.pipeline === pipelineFilter), [deals, pipelineFilter])
  const dealsByStage = (stageId) => filteredDeals.filter(d => d.stage === stageId)

  const selectDeal = async (deal) => {
    setSelectedDeal(deal); setLoadingPanel(true)
    setDealCompany(null); setDealContacts([]); setDealCampaigns([]); setDealTasks([])
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
      // Fetch tasks for this company
      const { data: taskData } = await supabase.from('tasks').select('*').filter('data->>company', 'ilike', `%${deal.company}%`).order('updated_at', { ascending: false }).limit(5)
      setDealTasks((taskData || []).filter(t => !t.data?.completed))
    }
    setLoadingPanel(false)
  }

  const closePanel = () => { setSelectedDeal(null); setDealCompany(null); setDealContacts([]); setDealCampaigns([]); setDealTasks([]); setActivityNote(''); setActivityType(null) }

  const logActivity = async (type) => {
    if (savingActivity || !selectedDeal) return
    setSavingActivity(true)
    const now = new Date().toISOString()
    await supabase.from('activities').insert({
      type, entity_name: selectedDeal.company || selectedDeal.title,
      deal_id: selectedDeal._id, subject: activityNote || `${type} logged`,
      status: 'completed', completed_at: now,
      metadata: { contact: selectedDeal.contactName, pipeline: selectedDeal.pipeline, logged_by: 'user' }
    })
    // Update deal's last activity
    await supabase.from('deals').update({ updated_at: now }).eq('id', selectedDeal._id)
    setActivityNote(''); setActivityType(null); setSavingActivity(false)
  }
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
    // Log stage change for audit trail
    await supabase.from('deal_stage_history').insert({ deal_id: deal._id, from_stage: deal.stage, to_stage: newStage, changed_by: 'user', changed_at: now })
    // Log to activities feed
    await supabase.from('activities').insert({ type: 'stage_change', deal_id: deal._id, entity_name: deal.company || deal.name, subject: `${deal.stage} → ${newStage}`, status: 'completed', completed_at: now, metadata: { from_stage: deal.stage, to_stage: newStage, contact: deal.contact } })
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

  // Stage accent colours for left-border + header
  const stageAccent = {
    'To revisit': 'rgba(0,0,0,0.06)',
    'Contact made': 'rgba(124,92,252,0.3)',
    'In Dialogue': 'rgba(245,158,11,0.35)',
    'Qualified': 'rgba(6,214,160,0.35)',
    'Meeting arranged (brand x RH)': 'rgba(59,130,246,0.35)',
    'Closed Won': 'rgba(6,214,160,0.4)',
    'Closed Lost': 'rgba(226,75,74,0.3)',
  }
  const stageTextColor = {
    'To revisit': 'rgba(124,92,252,0.35)',
    'Contact made': 'rgba(124,92,252,0.6)',
    'In Dialogue': 'rgba(245,158,11,0.7)',
    'Qualified': 'rgba(6,214,160,0.7)',
    'Meeting arranged (brand x RH)': 'rgba(59,130,246,0.7)',
    'Closed Won': 'rgba(6,214,160,0.7)',
    'Closed Lost': 'rgba(226,75,74,0.6)',
  }
  const sectionTitle = { fontSize: 12, fontWeight: 300, color: '#6B6B6B', fontFamily: 'var(--font)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const emptyText = { fontSize: 13, color: '#6B6B6B', fontFamily: 'var(--font)', fontStyle: 'italic', fontWeight: 300 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        eyebrowCategory="REVENUE"
        eyebrowSuffix="Pipeline"
        title="Pipeline"
        stats={[
          { value: activeDealCount, label: 'Active deals' },
        ]}
      />
      {/* Toolbar */}
      <div style={{
        margin: '0 16px 12px', padding: '12px 20px', borderRadius: 10,
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'rgba(0,0,0,0.08)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>Show closed</span>
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
                    width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    borderRadius: 10,
                    border: isOver ? '1px dashed rgba(125,138,100,0.45)' : '1px solid rgba(0,0,0,0.06)',
                    background: isOver ? 'rgba(125,138,100,0.06)' : '#FAFAF7',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}>
                  <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 400, color: stageTextColor[stage.id] || 'rgba(124,92,252,0.35)', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stage.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 300, color: stageTextColor[stage.id] || 'rgba(0,0,0,0.10)', fontFamily: 'var(--font)', background: `${stageAccent[stage.id] || 'rgba(25,25,25,0.40)'}33`, borderRadius: 50, padding: '2px 6px' }}>{stageDeals.length}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading ? (
                      [...Array(2)].map((_, i) => <div key={i} style={{ height: 70, background: 'rgba(0,0,0,0.03)', borderRadius: 10 }} />)
                    ) : stageDeals.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#A0A0A0', textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font)', fontWeight: 400 }}>No deals</p>
                    ) : stageDeals.map(deal => (
                      <div key={deal._id}
                        draggable
                        onDragStart={e => handleDragStart(e, deal)}
                        onDragEnd={handleDragEnd}
                        onClick={() => selectDeal(deal)}
                        style={{ background: '#FFFFFF', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.08)', borderLeft: `3px solid ${stageAccent[stage.id] || 'rgba(0,0,0,0.10)'}`, cursor: 'grab', transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {companyDomains[deal.company] ? (
                            <CompanyLogo name={deal.company} domain={companyDomains[deal.company]} size={18} />
                          ) : (
                            <CompanyLogo name={deal.company} size={18} />
                          )}
                          <p style={{ fontSize: 13, fontWeight: 400, color: '#0A0A0A', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {deal.company || deal.title}
                          </p>
                        </div>
                        {deal.contactName && (
                          <p style={{ fontSize: 11, color: '#6B6B6B', margin: '4px 0 0', fontFamily: 'var(--font)' }}>
                            {deal.contactName}{deal.industry ? ` · ${deal.industry}` : ''}
                          </p>
                        )}
                        {!deal.contactName && deal.industry && (
                          <p style={{ fontSize: 11, color: '#6B6B6B', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{deal.industry}</p>
                        )}
                        {/* Pipeline badge — visible in All view */}
                        {pipelineFilter === 'All' && deal.pipeline && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.05)', color: 'rgba(124,92,252,0.6)', fontWeight: 500, fontFamily: 'var(--font)' }}>{deal.pipeline}</span>
                          </div>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font)', ...staleStyle(deal.lastActivity) }}>
                            {daysAgo(deal.lastActivity) ? (staleStyle(deal.lastActivity).color === '#ef4444' ? '⏱ ' : staleStyle(deal.lastActivity).color === '#f59e0b' ? '⏱ ' : '✓ ') : ''}{daysAgo(deal.lastActivity) || 'No activity'}
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
              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '20px 20px 16px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {companyDomains[selectedDeal.company] ? (
                      <div style={{ width: 40, height: 40, borderRadius: 50, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        <img src={`https://www.google.com/s2/favicons?domain=${companyDomains[selectedDeal.company]}&sz=128`} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="font-size:14px;font-weight:600;color:rgba(124,92,252,0.7)">${(selectedDeal.company || '?')[0].toUpperCase()}</span>` }} />
                      </div>
                    ) : (
                      <CompanyLogo name={selectedDeal.company} domain={companyDomains[selectedDeal.company]} size={40} />
                    )}
                    <div>
                      <h2 style={{ fontSize: 17, fontWeight: 400, color: '#0A0A0A', margin: 0, fontFamily: 'var(--font)' }}>{selectedDeal.company || selectedDeal.title}</h2>
                      {dealCompany?.industry && <p style={{ fontSize: 13, color: 'rgba(124,92,252,0.45)', margin: '3px 0 0', fontFamily: 'var(--font)', fontWeight: 300 }}>{dealCompany.industry}{dealCompany.country ? ` · ${dealCompany.country}` : ''}</p>}
                    </div>
                  </div>
                  <button onClick={closePanel} style={{ background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 50, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B6B6B', flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                    <Building2 style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} /> Rights Holder: <strong>{selectedDeal.pipeline || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                    <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} /> Stage: <strong>{selectedDeal.stage || '—'}</strong>
                  </div>
                </div>
                {dealCompany && (
                  <button onClick={() => nav(`/organisations?org=${dealCompany.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', background: 'rgba(0,0,0,0.04)', padding: '6px 12px', borderRadius: 50, border: '1.5px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 300 }}>
                    <ExternalLink style={{ width: 12, height: 12 }} /> View Organisation
                  </button>
                )}
              </div>
              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <p style={sectionTitle}><Users style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Contacts ({dealContacts.length})</p>
                {loadingPanel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[...Array(2)].map((_, i) => <div key={i} style={{ height: 40, background: 'rgba(25,25,25,0.30)', borderRadius: 50 }} />)}</div>
                ) : dealContacts.length === 0 ? <p style={emptyText}>No contacts linked</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dealContacts.map((ct, i) => (
                      <div key={ct.id} onClick={() => nav(`/contacts/${ct.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 50, cursor: 'pointer', transition: 'background 0.15s', background: i === 0 ? 'rgba(59,130,246,0.06)' : 'transparent', border: i === 0 ? '1.5px solid rgba(59,130,246,0.12)' : '1.5px solid transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(25,25,25,0.40)'}
                        onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(59,130,246,0.06)' : 'transparent'}>
                        {ct.picture ? <img src={ct.picture} alt="" style={{ width: 28, height: 28, borderRadius: 50, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="font-size:11px;font-weight:600;color:rgba(124,92,252,0.7)">${(ct.firstName || '?')[0]?.toUpperCase()}${(ct.lastName || '')[0]?.toUpperCase() || ''}</span>` }} /> : (
                          <div style={{ width: 28, height: 28, borderRadius: 50, background: 'rgba(25,25,25,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(124,92,252,0.45)', fontFamily: 'var(--font)' }}>{(ct.firstName || '?')[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 400, color: '#0A0A0A', margin: 0, fontFamily: 'var(--font)' }}>{[ct.firstName, ct.lastName].filter(Boolean).join(' ')}{i === 0 ? ' (Primary)' : ''}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: 'var(--font)' }}>{ct.title || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <p style={sectionTitle}><Send style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Lemlist Campaigns</p>
                {dealCampaigns.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dealCampaigns.map(camp => (
                      <div key={camp.name} style={{ padding: '8px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 50, border: '1.5px solid rgba(59,130,246,0.12)' }}>
                        <p style={{ fontSize: 14, fontWeight: 400, color: '#0A0A0A', margin: 0, fontFamily: 'var(--font)' }}>{camp.name}</p>
                        <p style={{ fontSize: 11, color: '#6B6B6B', margin: '2px 0 0', fontFamily: 'var(--font)', fontWeight: 300 }}>{camp.contacts} contact{camp.contacts !== 1 ? 's' : ''}</p>
                      </div>
                    ))}
                  </div>
                ) : <p style={emptyText}>No campaigns linked</p>}
              </div>
              {/* Tasks Due for this deal */}
              {dealTasks.length > 0 && (
                <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <p style={sectionTitle}><CheckSquare style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Tasks Due ({dealTasks.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dealTasks.map(task => {
                      const d = task.data || {}
                      const isOverdue = d.dueDate && new Date(d.dueDate) < new Date()
                      return (
                        <div key={task.id} onClick={() => nav('/command-centre')} style={{ padding: '8px 10px', background: isOverdue ? 'rgba(255,59,48,0.04)' : 'rgba(6,214,160,0.04)', borderRadius: 12, border: `1.5px solid ${isOverdue ? 'rgba(255,59,48,0.1)' : 'rgba(6,214,160,0.1)'}`, cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = isOverdue ? 'rgba(255,59,48,0.08)' : 'rgba(6,214,160,0.08)'}
                          onMouseLeave={e => e.currentTarget.style.background = isOverdue ? 'rgba(255,59,48,0.04)' : 'rgba(6,214,160,0.04)'}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 500, color: isOverdue ? 'rgba(255,59,48,0.6)' : 'rgba(6,214,160,0.6)', textTransform: 'uppercase' }}>{d.type || 'Task'}</span>
                            {isOverdue && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,59,48,0.08)', color: 'rgba(255,59,48,0.6)', fontWeight: 500 }}>OVERDUE</span>}
                            {d.dueDate && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{d.dueDate}</span>}
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 400, color: '#6B6B6B', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{d.notes || d.contact || 'View in Command Centre →'}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* Quick Activity Logger */}
              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <p style={sectionTitle}><Clock style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Log Activity</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {['Call', 'Meeting', 'Email Sent', 'LinkedIn', 'Note'].map(t => (
                    <button key={t} onClick={() => activityType === t ? setActivityType(null) : setActivityType(t)}
                      style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 400, fontFamily: 'var(--font)', cursor: 'pointer', border: `1px solid ${activityType === t ? 'rgba(124,92,252,0.3)' : 'rgba(0,0,0,0.04)'}`, background: activityType === t ? 'rgba(0,0,0,0.05)' : 'rgba(25,25,25,0.30)', color: activityType === t ? 'rgba(124,92,252,0.8)' : 'rgba(0,0,0,0.14)', transition: 'all 0.15s' }}>{t}</button>
                  ))}
                </div>
                {activityType && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={activityNote} onChange={e => setActivityNote(e.target.value)} placeholder={`Notes for ${activityType}...`}
                      onKeyDown={e => e.key === 'Enter' && logActivity(activityType.toLowerCase().replace(' ', '_'))}
                      style={{ flex: 1, background: 'rgba(25,25,25,0.30)', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#6B6B6B', fontFamily: 'var(--font)', outline: 'none' }} />
                    <button onClick={() => logActivity(activityType.toLowerCase().replace(' ', '_'))} disabled={savingActivity}
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer', border: '1px solid rgba(6,214,160,0.2)', background: 'rgba(6,214,160,0.06)', color: 'rgba(6,214,160,0.7)' }}>{savingActivity ? '...' : 'Log'}</button>
                  </div>
                )}
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
