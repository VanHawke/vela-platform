// src/pages/Campaigns.jsx — Campaign Prospecting view
// Left rail: campaign list. Main: prospects table for selected campaign.
// Real data from Supabase. Realtime updates. Pause/activate per-campaign and per-prospect.
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import T from '@/lib/theme'
import BulkEditStepsModal from '@/components/campaigns/BulkEditStepsModal'
import {
  Mail, Linkedin, Eye, MousePointer, Reply, AlertTriangle, Clock,
  Pause, Play, Plus, Search, RefreshCw, X, ChevronRight, Trash2,
  Archive, ArchiveRestore, UserPlus,
} from 'lucide-react'

// ── helpers ──
function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }

// Strip emoji/symbol prefixes from corrupted scraped names
function cleanName(s) { return (s || '').replace(/^[^\p{L}]+/u, '').trim() }
function parseContactName(name, email) {
  const cleaned = cleanName(name)
  if (cleaned) return cleaned
  return email?.split('@')[0] || 'Unknown'
}

// Status pill colors per prospect status
function statusBadge(status) {
  const map = {
    active:    { label: 'Active',   bg: 'rgba(0,0,0,0.06)', fg: '#0A0A0A', br: 'rgba(0,0,0,0.10)' },
    replied:   { label: 'Replied',  bg: 'rgba(0,0,0,0.06)', fg: '#0A0A0A', br: 'rgba(0,0,0,0.10)' },
    bounced:   { label: 'Bounced',  bg: 'rgba(248,113,113,0.10)', fg: '#f87171', br: 'rgba(248,113,113,0.25)' },
    completed: { label: 'Done',     bg: 'rgba(0,0,0,0.04)', fg: 'rgba(0,0,0,0.35)', br: 'rgba(0,0,0,0.08)' },
    paused:    { label: 'Paused',   bg: 'rgba(251,191,36,0.10)', fg: '#fbbf24', br: 'rgba(251,191,36,0.25)' },
    stale:     { label: 'Stale',    bg: 'rgba(148,163,184,0.10)', fg: '#94a3b8', br: 'rgba(148,163,184,0.25)' },
  }
  const c = map[status] || map.active
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 500,
      background: c.bg, color: c.fg, border: `1px solid ${c.br}`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{c.label}</span>
  )
}

// Compute derived prospect status from enrollment + queue rows
function deriveStatus(enr, queueRows) {
  if (enr.bounce_detected_at) return 'bounced'
  if (enr.reply_detected_at || enr.status === 'replied') return 'replied'
  if (enr.status === 'completed') return 'completed'
  if (enr.status === 'paused') return 'paused'
  // stale: enrolled > 30 days ago, no recent activity
  const lastAct = queueRows.reduce((max, q) => {
    const ts = q.last_opened_at || q.last_clicked_at || q.sent_at || q.created_at
    return ts && (!max || ts > max) ? ts : max
  }, null)
  if (lastAct) {
    const daysSince = (Date.now() - new Date(lastAct)) / 86400000
    if (daysSince > 30) return 'stale'
  } else {
    const daysSince = (Date.now() - new Date(enr.created_at)) / 86400000
    if (daysSince > 30) return 'stale'
  }
  return 'active'
}

// ── main component ──
export default function Campaigns({ user }) {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [campaigns, setCampaigns] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('selected') || null)
  const [prospects, setProspects] = useState([])
  const [prospectQueue, setProspectQueue] = useState([]) // raw queue rows for detail panel
  const [selectedProspect, setSelectedProspect] = useState(null)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [sortField, setSortField] = useState('name') // name, company, status, step
  const [sortDir, setSortDir] = useState('asc')
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveTargetId, setMoveTargetId] = useState(null)
  const [moveMode, setMoveMode] = useState('duplicate') // 'duplicate' or 'move'
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Build-campaign modal state
  const [buildOpen, setBuildOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [buildCategory, setBuildCategory] = useState('banking')
  const [buildTeam, setBuildTeam] = useState('auto') // 'auto' or a team id
  const [buildPhase, setBuildPhase] = useState('idle') // idle, building, review, enrolling, done, error
  const [buildResult, setBuildResult] = useState(null)
  const [buildError, setBuildError] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // campaign id to confirm delete
  const [addProspectsOpen, setAddProspectsOpen] = useState(false)
  const [addProspectsQuery, setAddProspectsQuery] = useState('')
  const [addProspectsPhase, setAddProspectsPhase] = useState('idle') // idle, sourcing, review, enrolling, done, error
  const [addProspectsResult, setAddProspectsResult] = useState(null)
  const [addProspectsError, setAddProspectsError] = useState(null)

  // Load all campaigns for the left rail
  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    const { data: seqs } = await supabase.from('kiko_sequences').select('*').order('created_at', { ascending: false })
    const { data: enrolls } = await supabase.from('kiko_sequence_enrollments').select('sequence_id, status, reply_detected_at, bounce_detected_at')
    const counts = {}
    ;(enrolls || []).forEach(e => {
      const sid = e.sequence_id
      if (!counts[sid]) counts[sid] = { total: 0, active: 0, replied: 0, bounced: 0 }
      counts[sid].total++
      if (e.bounce_detected_at) counts[sid].bounced++
      else if (e.reply_detected_at || e.status === 'replied') counts[sid].replied++
      else if (e.status === 'active') counts[sid].active++
    })
    const arr = (seqs || []).map(s => ({
      ...s,
      counts: counts[s.id] || { total: 0, active: 0, replied: 0, bounced: 0 },
    }))
    // Sort: live first, then by created
    arr.sort((a, b) => {
      // Archived always last
      if (a.archived && !b.archived) return 1
      if (!a.archived && b.archived) return -1
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })
    setCampaigns(arr)
    setLoading(false)
    if (!selectedId && arr.length > 0) setSelectedId(arr[0].id)
    setPageContext({ page: 'campaigns', summary: `Campaigns: ${arr.length} sequences` })
  }, [selectedId])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  // Load prospects for the selected campaign
  const loadProspects = useCallback(async (sequenceId) => {
    if (!sequenceId) return
    setDetailLoading(true)
    const { data: enrs } = await supabase
      .from('kiko_sequence_enrollments')
      .select('*')
      .eq('sequence_id', sequenceId)
      .order('created_at', { ascending: false })
    const enrollIds = (enrs || []).map(e => e.id)
    let queue = []
    if (enrollIds.length > 0) {
      const { data: q } = await supabase
        .from('kiko_outreach_queue')
        .select('enrollment_id, step_number, channel, status, sent_at, opened_at, last_opened_at, opens_count, clicked_at, last_clicked_at, clicks_count, last_clicked_url, reply_received_at, reply_snippet, subject, scheduled_for')
        .in('enrollment_id', enrollIds)
      queue = q || []
    }
    // Build per-prospect rows
    const rows = (enrs || []).map(e => {
      const qRows = queue.filter(q => q.enrollment_id === e.id)
      const sentSteps = qRows.filter(q => q.status === 'sent')
      const opens = qRows.reduce((s, q) => s + (q.opens_count || 0), 0)
      const clicks = qRows.reduce((s, q) => s + (q.clicks_count || 0), 0)
      const lastSent = sentSteps.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0))[0]
      const lastOpen = qRows.filter(q => q.last_opened_at).sort((a, b) => new Date(b.last_opened_at) - new Date(a.last_opened_at))[0]
      const lastClick = qRows.filter(q => q.last_clicked_at).sort((a, b) => new Date(b.last_clicked_at) - new Date(a.last_clicked_at))[0]
      const nextStep = qRows.find(q => q.status === 'pending' || q.status === 'queued')
      // Last action computed: most recent of sent/opened/clicked/replied
      const events = []
      if (e.reply_detected_at) events.push({ type: 'replied', at: e.reply_detected_at })
      if (lastClick) events.push({ type: 'clicked', at: lastClick.last_clicked_at })
      if (lastOpen) events.push({ type: 'opened', at: lastOpen.last_opened_at })
      if (lastSent) events.push({ type: 'sent', at: lastSent.sent_at })
      events.sort((a, b) => new Date(b.at) - new Date(a.at))
      const lastAction = events[0] || null
      return {
        id: e.id,
        contact_email: e.contact_email,
        contact_name: parseContactName(e.contact_name, e.contact_email),
        company: e.company || (e.contact_email?.split('@')[1] || ''),
        title: e.title || '',
        current_step: e.current_step || 1,
        status: deriveStatus(e, qRows),
        sent_count: sentSteps.length,
        opens_count: opens,
        clicks_count: clicks,
        replied: !!e.reply_detected_at || e.status === 'replied',
        bounced: !!e.bounce_detected_at,
        last_action: lastAction,
        next_send_at: e.next_send_at,
        next_step_channel: nextStep?.channel,
        next_step_subject: nextStep?.subject,
        linkedin_url: e.linkedin_url,
        raw: e,
      }
    })
    setProspects(rows)
    setProspectQueue(queue || [])
    setDetailLoading(false)
  }, [])

  useEffect(() => { if (selectedId) { loadProspects(selectedId); setSelectedProspect(null) } }, [selectedId, loadProspects])

  // Realtime subscription — refresh prospects when queue or enrollments change,
  // refresh campaigns list when any sequence's is_active flag flips so the rail dot updates
  useEffect(() => {
    if (!selectedId) return
    const ch = supabase
      .channel(`campaign_${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_sequence_enrollments', filter: `sequence_id=eq.${selectedId}` }, () => loadProspects(selectedId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_outreach_queue' }, () => loadProspects(selectedId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kiko_sequences' }, () => loadCampaigns())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId, loadProspects, loadCampaigns])

  // ── actions ──
  async function toggleCampaign(seq) {
    const newState = !seq.is_active
    await supabase.from('kiko_sequences').update({ is_active: newState }).eq('id', seq.id)
    setCampaigns(prev => prev.map(c => c.id === seq.id ? { ...c, is_active: newState } : c))
    // Also reload to make sure rail sort + dot reflects truth
    loadCampaigns()
  }

  async function archiveCampaign(seq) {
    if (seq.is_active) {
      await supabase.from('kiko_sequences').update({ is_active: false }).eq('id', seq.id)
    }
    await supabase.from('kiko_sequences').update({ archived: true, archived_at: new Date().toISOString(), is_active: false }).eq('id', seq.id)
    setCampaigns(prev => prev.map(c => c.id === seq.id ? { ...c, archived: true, is_active: false } : c))
    if (selectedId === seq.id) {
      const next = campaigns.find(c => c.id !== seq.id && !c.archived)
      setSelectedId(next?.id || null)
    }
  }

  async function unarchiveCampaign(seq) {
    await supabase.from('kiko_sequences').update({ archived: false, archived_at: null }).eq('id', seq.id)
    setCampaigns(prev => prev.map(c => c.id === seq.id ? { ...c, archived: false } : c))
  }

  async function deleteCampaign(seq) {
    try {
      // CASCADE handles all FK tables automatically
      const { error } = await supabase.from('kiko_sequences').delete().eq('id', seq.id)
      if (error) { alert('Delete failed: ' + error.message); setConfirmDelete(null); return }
      setConfirmDelete(null)
      setCampaigns(prev => prev.filter(c => c.id !== seq.id))
      if (selectedId === seq.id) setSelectedId(null)
      setSelectedProspect(null)
    } catch (err) {
      alert('Delete failed: ' + err.message)
      setConfirmDelete(null)
    }
  }

  const [sourceProgress, setSourceProgress] = useState(0)
  const [sourceMessage, setSourceMessage] = useState('')

  async function addMoreProspects() {
    setAddProspectsPhase('sourcing')
    setAddProspectsError(null)
    setAddProspectsResult(null)
    setSourceProgress(0)
    setSourceMessage('Starting research...')

    // Use typed query, or fall back to campaign criteria
    const criteria = addProspectsQuery.trim() || selectedCampaign?.description || selectedCampaign?.target_persona || selectedCampaign?.name || ''
    if (!criteria) { setAddProspectsPhase('error'); setAddProspectsError('No criteria available. Please describe what prospects to find.'); return }

    try {
      // Get existing enrolled contacts to avoid duplicates
      const { data: existing } = await supabase.from('kiko_sequence_enrollments').select('contact_email').eq('sequence_id', selectedId)
      const existingEmails = (existing || []).map(e => e.contact_email?.toLowerCase()).filter(Boolean)

      const resp = await fetch('/api/source-prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: selectedCampaign?.name || '',
          description: criteria,
          targetPersona: selectedCampaign?.target_persona || '',
          sequenceId: selectedId,
          existingEmails,
          maxCompanies: 50,
          contactsPerCompany: 2,
        }),
      })

      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let allProspects = []
      let allCompanies = []
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.progress) setSourceProgress(parsed.progress)
              if (parsed.message) setSourceMessage(parsed.message)
              if (parsed.phase === 'complete') {
                allProspects = parsed.prospects || []
                allCompanies = parsed.companies || []
              }
              if (parsed.phase === 'error') {
                setAddProspectsPhase('error')
                setAddProspectsError(parsed.message)
                return
              }
            } catch {}
          }
        }
      }

      if (allProspects.length === 0) {
        setAddProspectsPhase('review')
        setAddProspectsResult({ contacts: [], companies: allCompanies, message: 'No new prospects found matching criteria. Try broadening your search.' })
        return
      }

      const candidates = allProspects.map((p, i) => ({
        id: `new_${i}`,
        name: [p.first_name, p.last_name].filter(Boolean).join(' '),
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        email: p.email || '',
        title: p.title || '',
        company: p.company_name || '',
        companyDomain: p.company_website || '',
        linkedin: p.linkedin_url || '',
        location: p.location || p.company_hq || '',
        industry: p.company_industry || '',
        revenue: p.company_revenue || '',
        whyRelevant: p.why_relevant || '',
        email_valid: p.email_valid,
        email_domain_match: p.email_domain_match,
        sponsorship_history: p.sponsorship_history || '',
        selected: p.email_valid !== false, // auto-deselect unverified emails
      }))
      setAddProspectsPhase('review')
      setAddProspectsResult({ contacts: candidates, companies: allCompanies, message: `Sourced ${candidates.length} prospects from ${allCompanies.length} companies` })
    } catch (err) {
      setAddProspectsPhase('error')
      setAddProspectsError(err.message)
    }
  }

  async function enrollSelected() {
    if (!addProspectsResult?.contacts) return
    const toEnroll = addProspectsResult.contacts.filter(c => c.selected)
    if (!toEnroll.length) { alert('Select at least one prospect to enroll'); return }
    setAddProspectsPhase('enrolling')
    setSourceMessage(`Enrolling ${toEnroll.length} prospects...`)
    setSourceProgress(0)
    let enrolled = 0, skipped = 0
    for (const c of toEnroll) {
      try {
        // Upsert contact into CRM
        const contactData = {
          firstName: c.firstName, lastName: c.lastName, email: c.email, title: c.title,
          company: c.company, companyDomain: c.companyDomain, linkedin: c.linkedin,
          location: c.location, industry: c.industry, lead_source: 'kiko_sourced',
        }
        let contactId = c.id
        if (c.id.startsWith('new_')) {
          // Check if contact already exists
          const { data: existCheck } = await supabase.from('contacts').select('id').ilike('data->>email', c.email).limit(1)
          if (existCheck?.length) {
            contactId = existCheck[0].id
          } else {
            const { data: inserted } = await supabase.from('contacts').insert({ org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5', data: contactData }).select('id')
            contactId = inserted?.[0]?.id || c.id
          }
        }
        // Enroll
        const { error } = await supabase.from('kiko_sequence_enrollments').insert({
          sequence_id: selectedId, contact_id: contactId,
          contact_name: c.name, contact_email: c.email, company: c.company,
          linkedin_url: c.linkedin, status: 'active', current_step: 1,
          enrolled_at: new Date().toISOString(),
        })
        if (error) { skipped++; continue }
        enrolled++
      } catch { skipped++ }
      setSourceProgress(Math.round(((enrolled + skipped) / toEnroll.length) * 100))
    }
    setAddProspectsPhase('done')
    setAddProspectsResult(`Enrolled ${enrolled} new prospects into campaign. ${skipped > 0 ? `${skipped} skipped (duplicates or errors).` : ''}`)
    await loadProspects(selectedId)
    await loadCampaigns()
  }

  // ── Deterministic campaign builder ──
  // v0.0.38: passes a job_id (uuid) so the backend can write live stage progress
  // and BuildingProgress can poll /api/job-status?id=xxx for real backend state
  // instead of relying on a frontend timer estimate.
  const [buildJobId, setBuildJobId] = useState(null)
  async function runBuildCampaign() {
    setBuildPhase('building')
    setBuildError(null)
    setBuildResult(null)
    // Generate a fresh uuid for this build run
    const jobId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setBuildJobId(jobId)
    try {
      const payload = { category: buildCategory, job_id: jobId, user_id: user?.id }
      if (buildTeam && buildTeam !== 'auto') payload.preferredTeam = buildTeam
      const r = await fetch('/api/build-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok || !data.success) throw new Error(data.message || data.error || 'Build failed')
      setBuildResult(data)
      setBuildPhase('review')
    } catch (err) {
      setBuildError(err.message)
      setBuildPhase('error')
    }
  }

  async function runEnroll() {
    if (!buildResult?.sequence_id) return
    setBuildPhase('enrolling')
    try {
      const r = await fetch('/api/build-campaign-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: buildResult.sequence_id }),
      })
      const data = await r.json()
      if (!r.ok || !data.success) throw new Error(data.error || 'Enroll failed')
      setBuildPhase('done')
      // Refresh the rail to show the newly active campaign
      await loadCampaigns()
      // Auto-select the new campaign
      setSelectedId(buildResult.sequence_id)
    } catch (err) {
      setBuildError(err.message)
      setBuildPhase('error')
    }
  }

  function closeBuildModal() {
    setBuildOpen(false)
    setBuildPhase('idle')
    setBuildResult(null)
    setBuildError(null)
  }

  async function pauseProspect(p) {
    const newStatus = p.status === 'paused' ? 'active' : 'paused'
    await supabase.from('kiko_sequence_enrollments').update({ status: newStatus }).eq('id', p.id)
    loadProspects(selectedId)
  }

  async function removeProspect(p) {
    if (!confirm(`Remove ${p.contact_name} from this campaign?`)) return
    await supabase.from('kiko_outreach_queue').delete().eq('enrollment_id', p.id)
    await supabase.from('kiko_sequence_enrollments').delete().eq('id', p.id)
    loadProspects(selectedId)
  }

  // ── derived/filtered prospects ──
  const filteredProspects = prospects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.contact_name?.toLowerCase().includes(q) || p.company?.toLowerCase().includes(q) || p.contact_email?.toLowerCase().includes(q) || p.title?.toLowerCase().includes(q))
    }
    return true
  }).sort((a, b) => {
    let va, vb
    if (sortField === 'name') { va = a.contact_name || ''; vb = b.contact_name || '' }
    else if (sortField === 'company') { va = a.company || ''; vb = b.company || '' }
    else if (sortField === 'status') { va = a.status || ''; vb = b.status || '' }
    else if (sortField === 'step') { va = a.current_step || 0; vb = b.current_step || 0 }
    else { va = a.contact_name || ''; vb = b.contact_name || '' }
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const selectedCampaign = campaigns.find(c => c.id === selectedId)
  const totalSteps = selectedCampaign?.steps?.length || 0

  // ── styles ──
  const C = T // color tokens shorthand
  const cell = { padding: '10px 14px', fontSize: 12, color: C.text, borderBottom: `1px solid rgba(0,0,0,0.04)`, verticalAlign: 'middle', fontFamily: C.font }
  const headerCell = { ...cell, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#A0A0A0', fontWeight: 500, background: '#FAFAF8', position: 'sticky', top: 0, zIndex: 1, borderBottom: '1px solid rgba(0,0,0,0.06)' }

  // ── render ──
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: C.font, color: C.text, background: C.bg }}>

      {/* ─── LEFT RAIL: Campaign list ─── */}
      <aside style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border || 'rgba(0,0,0,0.06)'}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Campaigns</div>
            <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{campaigns.length} total</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setBuildOpen(true); setBuildPhase('idle') }}
              title="Auto-build campaign"
              style={{ padding: '0 10px', height: 28, borderRadius: 6, border: 'none', background: '#0A0A0A', color: '#FEFEFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'inherit', fontWeight: 500 }}
            >+ Build</button>
            <button
              onClick={() => setBulkEditOpen(true)}
              title="Bulk find/replace step content across sequences in a category"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
            >✎</button>
            <button
              onClick={() => nav('/campaigns/new')}
              title="New blank campaign"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><Plus size={14} /></button>
          </div>
        </div>
        {/* Archive toggle */}
        <div style={{ padding: '0 18px 8px', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowArchived(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 5, border: 'none', background: !showArchived ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', fontFamily: C.font, fontSize: 11, color: !showArchived ? C.text : C.textTertiary, fontWeight: !showArchived ? 500 : 400 }}>Active ({campaigns.filter(c => !c.archived).length})</button>
          <button onClick={() => setShowArchived(true)} style={{ flex: 1, padding: '6px 0', borderRadius: 5, border: 'none', background: showArchived ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', fontFamily: C.font, fontSize: 11, color: showArchived ? C.text : C.textTertiary, fontWeight: showArchived ? 500 : 400 }}>Archived ({campaigns.filter(c => c.archived).length})</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <div style={{ padding: 24, fontSize: 11, color: C.textTertiary, textAlign: 'center' }}>Loading...</div>
          ) : campaigns.filter(c => showArchived ? c.archived : !c.archived).length === 0 ? (
            <div style={{ padding: 24, fontSize: 11, color: C.textTertiary, textAlign: 'center' }}>{showArchived ? 'No archived campaigns' : 'No campaigns yet'}</div>
          ) : campaigns.filter(c => showArchived ? c.archived : !c.archived).map(c => {
            const isSelected = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 12px', marginBottom: 4, borderRadius: 6, border: 'none',
                  background: isSelected ? 'rgba(0,0,0,0.06)' : 'transparent',
                  cursor: 'pointer', fontFamily: C.font,
                  borderLeft: isSelected ? '2px solid #0A0A0A' : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.is_active ? '#0A0A0A' : 'rgba(148,163,184,0.4)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textTertiary, display: 'flex', gap: 8, paddingLeft: 12 }}>
                  <span>{c.counts.total} prospects</span>
                  {c.counts.replied > 0 && <span style={{ color: '#0A0A0A' }}>{c.counts.replied} replied</span>}
                  {c.counts.bounced > 0 && <span style={{ color: '#f87171' }}>{c.counts.bounced} bounced</span>}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ─── MAIN: Prospecting table for selected campaign ─── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {!selectedCampaign ? (
          <div style={{ flex: 1, padding: '32px 28px', overflowY: 'auto' }}>
            <div style={{ fontSize: 20, fontWeight: 400, color: '#0A0A0A', marginBottom: 2, fontFamily: C.font, letterSpacing: '-0.01em' }}>Campaign Overview</div>
            <div style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 20, fontFamily: C.font }}>Outreach performance across all campaigns</div>
            {/* Aggregate stats */}
            {(() => {
              const active = campaigns.filter(c => c.is_active).length
              const totalProspects = campaigns.reduce((s, c) => s + (c.counts?.total || 0), 0)
              const totalReplied = campaigns.reduce((s, c) => s + (c.counts?.replied || 0), 0)
              const totalBounced = campaigns.reduce((s, c) => s + (c.counts?.bounced || 0), 0)
              const replyRate = totalProspects > 0 ? Math.round((totalReplied / totalProspects) * 100) : 0
              const bounceRate = totalProspects > 0 ? Math.round((totalBounced / totalProspects) * 100) : 0
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
                  <div style={{ padding: '14px 18px', background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 500, fontFamily: C.font }}>{active}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2, fontFamily: C.font, letterSpacing: '0.03em' }}>Active campaigns</div>
                  </div>
                  <div style={{ padding: '14px 18px', background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 500, fontFamily: C.font }}>{totalProspects.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2, fontFamily: C.font, letterSpacing: '0.03em' }}>Contacts enrolled</div>
                  </div>
                  <div style={{ padding: '14px 18px', background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: replyRate > 0 ? '#00B464' : '#0A0A0A', fontFamily: C.font }}>{replyRate}%</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2, fontFamily: C.font, letterSpacing: '0.03em' }}>Reply rate</div>
                  </div>
                  <div style={{ padding: '14px 18px', background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: bounceRate > 5 ? '#f87171' : '#0A0A0A', fontFamily: C.font }}>{bounceRate}%</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2, fontFamily: C.font, letterSpacing: '0.03em' }}>Bounce rate</div>
                  </div>
                </div>
              )
            })()}
            {/* Campaign performance table */}
            {campaigns.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: C.font }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#FAFAF7' }}>Campaign</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#FAFAF7' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#FAFAF7' }}>Enrolled</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: 11, color: '#A0A0A0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#FAFAF7' }}>Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(c.id)}
                        onMouseOver={e => e.currentTarget.style.background = '#FAFAF7'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 14px', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{c.name}</td>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {c.is_active
                            ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(125,138,100,0.12)', color: '#7d8a64', border: '1px solid rgba(125,138,100,0.2)', textTransform: 'uppercase', fontWeight: 500 }}>Active</span>
                            : <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#F5F4F1', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', fontWeight: 500 }}>Draft</span>
                          }
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)', color: '#6B6B6B' }}>{c.counts?.total || 0}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)', color: c.counts?.replied > 0 ? '#7d8a64' : '#A0A0A0', fontWeight: c.counts?.replied > 0 ? 500 : 400 }}>{c.counts?.replied || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {campaigns.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 13 }}>No campaigns yet. Click ⚡ Build to create your first.</div>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '20px 28px 14px', borderBottom: `1px solid ${C.border || 'rgba(0,0,0,0.06)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h1 style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: 0, fontFamily: C.font, letterSpacing: '-0.01em' }}>{selectedCampaign.name}</h1>
                    {selectedCampaign.is_active ? (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,180,100,0.08)', color: '#00B464', border: '1px solid rgba(0,180,100,0.2)', fontWeight: 500 }}>Active</span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.04)', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.08)', fontWeight: 500 }}>Draft</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textTertiary }}>
                    {totalSteps} steps · {selectedCampaign.target_persona || 'No persona set'} · {prospects.length} prospects enrolled
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => toggleCampaign(selectedCampaign)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {selectedCampaign.is_active ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                  </button>
                  <button
                    onClick={() => nav(`/campaigns/${selectedCampaign.id}`)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}
                  >Edit sequence</button>
                  <button
                    onClick={() => { setAddProspectsQuery(selectedCampaign?.description || selectedCampaign?.target_persona || ''); setAddProspectsOpen(true) }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                  ><UserPlus size={12} /> Add prospects</button>
                  {selectedCampaign.archived ? (
                    <button
                      onClick={() => unarchiveCampaign(selectedCampaign)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                    ><ArchiveRestore size={12} /> Restore</button>
                  ) : (
                    <button
                      onClick={() => archiveCampaign(selectedCampaign)}
                      title="Archive this campaign"
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTertiary, fontSize: 12, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                    ><Archive size={12} /> Archive</button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(selectedCampaign.id)}
                    title="Permanently delete this campaign and all prospects"
                    style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                  ><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            </div>

            {/* Campaign performance stats bar */}
            {(() => {
              const total = prospects.length
              const sent = prospects.reduce((s, p) => s + (p.sent_count || 0), 0)
              const opens = prospects.reduce((s, p) => s + (p.opens_count || 0), 0)
              const clicks = prospects.reduce((s, p) => s + (p.clicks_count || 0), 0)
              const replied = prospects.filter(p => p.replied).length
              const bounced = prospects.filter(p => p.bounced).length
              const openRate = sent > 0 ? Math.round((opens / sent) * 100) : 0
              const replyRate = total > 0 ? Math.round((replied / total) * 100) : 0
              const clickRate = sent > 0 ? Math.round((clicks / sent) * 100) : 0
              const bounceRate = total > 0 ? Math.round((bounced / total) * 100) : 0
              const stats = [
                { label: 'Enrolled', value: total, color: '#0A0A0A' },
                { label: 'Sent', value: sent, color: '#0A0A0A' },
                { label: 'Open rate', value: `${openRate}%`, color: openRate > 30 ? '#7d8a64' : '#0A0A0A' },
                { label: 'Click rate', value: `${clickRate}%`, color: clickRate > 5 ? '#7d8a64' : '#0A0A0A' },
                { label: 'Reply rate', value: `${replyRate}%`, color: replyRate > 10 ? '#7d8a64' : '#0A0A0A' },
                { label: 'Bounced', value: `${bounceRate}%`, color: bounceRate > 5 ? '#B8643E' : '#A0A0A0' },
              ]
              return (
                <div style={{ display: 'flex', gap: 0, padding: '0 28px', borderBottom: `1px solid ${C.border}` }}>
                  {stats.map((s, i) => (
                    <div key={i} style={{ flex: 1, padding: '12px 0', textAlign: 'center', borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: s.color, fontFamily: C.font }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 1 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Filter bar */}
            <div style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border || 'rgba(0,0,0,0.06)'}` }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textTertiary }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search prospects..."
                  style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, border: `1px solid ${C.border || 'rgba(0,0,0,0.08)'}`, background: 'rgba(0,0,0,0.03)', color: C.text, fontSize: 12, fontFamily: C.font, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'active', 'replied', 'bounced', 'stale', 'paused'].map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: `1px solid ${statusFilter === f ? 'rgba(0,0,0,0.10)' : 'transparent'}`,
                      background: statusFilter === f ? 'rgba(0,0,0,0.06)' : 'transparent',
                      color: statusFilter === f ? '#0A0A0A' : C.textSecondary,
                      fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, textTransform: 'capitalize',
                    }}
                  >{f}</button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: C.textTertiary }}>
                {filteredProspects.length} of {prospects.length}
              </div>
              <button
                onClick={() => loadProspects(selectedId)}
                title="Refresh"
                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><RefreshCw size={12} /></button>
            </div>

            {/* Prospect table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {detailLoading ? (
                <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: C.textTertiary }}>Loading prospects...</div>
              ) : filteredProspects.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 8 }}>No prospects {statusFilter !== 'all' ? `with status "${statusFilter}"` : 'enrolled yet'}</div>
                  <div style={{ fontSize: 11, color: C.textTertiary, marginBottom: 16 }}>Add contacts to start sending</div>
                  <button
                    onClick={() => nav(`/campaigns/${selectedId}`)}
                    style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', background: 'rgba(0,0,0,0.06)', color: '#0A0A0A', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}
                  >Add prospects</button>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...headerCell, width: 36, textAlign: 'center' }}>
                        <input type="checkbox" checked={bulkSelected.size === filteredProspects.length && filteredProspects.length > 0} onChange={() => { if (bulkSelected.size === filteredProspects.length) setBulkSelected(new Set()); else setBulkSelected(new Set(filteredProspects.map(p => p.id))) }} style={{ accentColor: '#0A0A0A', cursor: 'pointer' }} />
                      </th>
                      {[{f:'name',l:'Prospect'},{f:'company',l:'Company'},{f:'step',l:'Step',c:true},{f:null,l:'Engagement',c:true},{f:null,l:'Last action'},{f:null,l:'Next'},{f:'status',l:'Status',c:true},{f:null,l:''}].map((col,ci) => (
                        <th key={ci} onClick={col.f ? () => { if (sortField === col.f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(col.f); setSortDir('asc') } } : undefined}
                          style={{ ...headerCell, textAlign: col.c ? 'center' : ci === 7 ? 'right' : 'left', cursor: col.f ? 'pointer' : 'default', userSelect: 'none', paddingRight: ci === 7 ? 28 : undefined }}>
                          {col.l}{col.f && sortField === col.f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {/* Bulk action bar */}
                  {bulkSelected.size > 0 && (
                    <thead>
                      <tr>
                        <td colSpan={9} style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: C.font }}>
                            <span style={{ fontWeight: 500, color: '#0A0A0A' }}>{bulkSelected.size} selected</span>
                            <button onClick={async () => { for (const id of bulkSelected) await pauseProspect(prospects.find(p => p.id === id)); setBulkSelected(new Set()); await loadProspects(selectedId) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#D4A843', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Pause</button>
                            <button onClick={async () => { for (const id of bulkSelected) { await supabase.from('kiko_sequence_enrollments').update({ status: 'active' }).eq('id', id) }; setBulkSelected(new Set()); await loadProspects(selectedId) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#00B464', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Resume</button>
                            <button onClick={() => { setMoveMode('duplicate'); setMoveModalOpen(true) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#0A0A0A', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Duplicate to campaign</button>
                            <button onClick={() => { setMoveMode('move'); setMoveModalOpen(true) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#0A0A0A', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Move to campaign</button>
                            <button onClick={async () => { if (!confirm(`Remove ${bulkSelected.size} prospects?`)) return; for (const id of bulkSelected) await removeProspect(prospects.find(p => p.id === id)); setBulkSelected(new Set()); await loadProspects(selectedId) }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: '#f87171', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Remove</button>
                            <button onClick={() => setBulkSelected(new Set())} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#A0A0A0', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Clear</button>
                          </div>
                        </td>
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {filteredProspects.map(p => (
                      <tr key={p.id} style={{ transition: 'background 0.1s', background: bulkSelected.has(p.id) ? 'rgba(0,0,0,0.02)' : 'transparent' }} onMouseEnter={e => { if (!bulkSelected.has(p.id)) e.currentTarget.style.background = 'rgba(0,0,0,0.015)' }} onMouseLeave={e => { if (!bulkSelected.has(p.id)) e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ ...cell, width: 36, textAlign: 'center' }}>
                          <input type="checkbox" checked={bulkSelected.has(p.id)} onChange={() => { const next = new Set(bulkSelected); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); setBulkSelected(next) }} onClick={e => e.stopPropagation()} style={{ accentColor: '#0A0A0A', cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...cell, paddingLeft: 0 }}>
                          <div
                            onClick={() => setSelectedProspect(selectedProspect?.id === p.id ? null : p)}
                            style={{ fontSize: 13, color: selectedProspect?.id === p.id ? '#0A0A0A' : C.text, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                            title="View prospect detail"
                          >{p.contact_name}</div>
                          <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {p.contact_email}
                            {p.email_verified && <span style={{ fontSize: 8, color: '#00B464', fontWeight: 600 }}>✓ verified</span>}
                            {p.email_confidence > 0 && !p.email_verified && <span style={{ fontSize: 8, color: p.email_confidence > 0.7 ? '#D4A843' : '#A0A0A0' }}>{Math.round(p.email_confidence * 100)}%</span>}
                            {p.email_source && <span style={{ fontSize: 8, color: '#A0A0A0' }}>{p.email_source}</span>}
                          </div>
                          {p.title && <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2, fontStyle: 'italic' }}>{p.title}</div>}
                        </td>
                        <td style={cell}>
                          <div style={{ fontSize: 12, color: C.text }}>{p.company || '—'}</div>
                        </td>
                        <td style={{ ...cell, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{p.current_step}<span style={{ color: C.textTertiary, fontWeight: 400 }}> / {totalSteps || '?'}</span></div>
                        </td>
                        <td style={{ ...cell, textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                            <span title="Sent" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: p.sent_count > 0 ? C.text : C.textTertiary }}><Mail size={11} />{p.sent_count}</span>
                            <span title="Opens" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: p.opens_count > 0 ? '#0A0A0A' : C.textTertiary }}><Eye size={11} />{p.opens_count}</span>
                            <span title="Clicks" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: p.clicks_count > 0 ? '#0A0A0A' : C.textTertiary }}><MousePointer size={11} />{p.clicks_count}</span>
                            {p.replied && <span title="Replied" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0A0A0A' }}><Reply size={11} /></span>}
                            {p.bounced && <span title="Bounced" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#f87171' }}><AlertTriangle size={11} /></span>}
                          </div>
                        </td>
                        <td style={cell}>
                          {p.last_action ? (
                            <div>
                              <div style={{ fontSize: 12, color: C.text, textTransform: 'capitalize' }}>{p.last_action.type}</div>
                              <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{timeAgo(p.last_action.at)}</div>
                            </div>
                          ) : <span style={{ fontSize: 11, color: C.textTertiary }}>—</span>}
                        </td>
                        <td style={cell}>
                          {p.next_send_at && p.status === 'active' ? (
                            <div>
                              <div style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {p.next_step_channel === 'linkedin' ? <Linkedin size={11} /> : <Mail size={11} />}
                                Step {p.current_step}
                              </div>
                              <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{timeAgo(p.next_send_at)}</div>
                            </div>
                          ) : <span style={{ fontSize: 11, color: C.textTertiary }}>—</span>}
                        </td>
                        <td style={{ ...cell, textAlign: 'center' }}>{statusBadge(p.status)}</td>
                        <td style={{ ...cell, textAlign: 'right', paddingRight: 28 }}>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button onClick={() => pauseProspect(p)} title={p.status === 'paused' ? 'Resume' : 'Pause'} style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: 'transparent', color: C.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {p.status === 'paused' ? <Play size={11} /> : <Pause size={11} />}
                            </button>
                            <button onClick={() => removeProspect(p)} title="Remove" style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: 'transparent', color: C.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Prospect Detail Panel (slides from right) ── */}
      {selectedProspect && (() => {
        const p = selectedProspect
        const qRows = prospectQueue.filter(q => q.enrollment_id === p.id).sort((a, b) => (a.step_number || 0) - (b.step_number || 0))
        const campaignName = selectedCampaign?.name || 'Campaign'
        return (
          <div style={{ width: 360, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: '#FEFEFC', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font }}>{p.contact_name}</div>
                  {p.title && <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2, fontFamily: C.font }}>{p.title}</div>}
                  <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 1, fontFamily: C.font }}>{p.company}</div>
                </div>
                <button onClick={() => setSelectedProspect(null)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A0A0', fontSize: 12 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {p.contact_email && <span style={{ fontSize: 10, color: '#6B6B6B', padding: '2px 8px', background: '#F5F4F1', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: C.font }}>{p.contact_email}{p.email_verified ? <span style={{ color: '#00B464', fontSize: 8, fontWeight: 600 }}>✓</span> : p.email_confidence > 0 ? <span style={{ color: '#A0A0A0', fontSize: 8 }}>{Math.round(p.email_confidence * 100)}%</span> : null}</span>}
                {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0077B5', padding: '2px 8px', background: 'rgba(0,119,181,0.06)', borderRadius: 4, textDecoration: 'none', fontFamily: C.font }}>LinkedIn</a>}
                {statusBadge(p.status)}
              </div>
            </div>

            {/* Campaign stats */}
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`, background: '#FAFAF8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font }}>{campaignName}</div>
                  <div style={{ fontSize: 10, color: '#6B6B6B', marginTop: 1, fontFamily: C.font }}>Step {p.current_step} of {totalSteps || '?'}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#6B6B6B', fontFamily: C.font }}>
                  <span>{p.sent_count} sent</span>
                  <span>{p.opens_count} opens</span>
                  <span>{p.clicks_count} clicks</span>
                </div>
              </div>
            </div>

            {/* Step-by-step timeline */}
            <div style={{ padding: '16px 20px', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12, fontWeight: 500 }}>Sequence Timeline</div>
              {qRows.length === 0 && <div style={{ fontSize: 12, color: '#A0A0A0', padding: '12px 0' }}>No steps sent yet</div>}
              {qRows.map((q, qi) => {
                const isSent = q.status === 'sent'
                const isPending = q.status === 'pending' || q.status === 'queued'
                const isLI = q.channel === 'linkedin'
                const hasOpened = q.opens_count > 0
                const hasClicked = q.clicks_count > 0
                const hasReply = !!q.reply_received_at
                return (
                  <div key={qi} style={{ display: 'flex', gap: 10, marginBottom: 0 }}>
                    {/* Timeline line + dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: isSent ? (hasReply ? '#7d8a64' : hasOpened ? '#0A0A0A' : '#6B6B6B') : isPending ? '#B89C5C' : '#C0C0C0', border: '2px solid #FFFFFF', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', marginTop: 4, flexShrink: 0 }} />
                      {qi < qRows.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'rgba(0,0,0,0.08)', minHeight: 24 }} />}
                    </div>
                    {/* Step content */}
                    <div style={{ flex: 1, paddingBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A' }}>
                          Step {q.step_number || qi + 1}: {isLI ? 'LinkedIn' : 'Email'}
                        </span>
                        {isPending && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(184,156,92,0.12)', color: '#B89C5C', fontWeight: 500 }}>Pending</span>}
                      </div>
                      {q.subject && <div style={{ fontSize: 11, color: '#6B6B6B', marginBottom: 4 }}>{q.subject}</div>}
                      {isSent && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B6B6B' }}>
                            <Mail size={10} /> Sent {q.sent_at ? timeAgo(q.sent_at) : ''}
                          </div>
                          {hasOpened && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0A0A0A' }}>
                              <Eye size={10} /> Opened {q.opens_count}× {q.opened_at ? '· ' + timeAgo(q.opened_at) : ''}
                            </div>
                          )}
                          {hasClicked && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0A0A0A' }}>
                              <MousePointer size={10} /> Clicked {q.clicks_count}× {q.last_clicked_url ? '· ' + q.last_clicked_url.slice(0, 30) + '...' : ''}
                            </div>
                          )}
                          {hasReply && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#7d8a64', fontWeight: 500 }}>
                              <Reply size={10} /> Replied {q.reply_received_at ? timeAgo(q.reply_received_at) : ''}
                            </div>
                          )}
                          {q.reply_snippet && (
                            <div style={{ fontSize: 11, color: '#6B6B6B', background: '#F5F4F1', padding: '6px 10px', borderRadius: 6, marginTop: 2, fontStyle: 'italic', lineHeight: 1.4 }}>
                              "{q.reply_snippet.slice(0, 120)}{q.reply_snippet.length > 120 ? '...' : ''}"
                            </div>
                          )}
                          {!hasOpened && !hasClicked && !hasReply && (
                            <div style={{ fontSize: 11, color: '#A0A0A0' }}>No engagement yet</div>
                          )}
                        </div>
                      )}
                      {isPending && q.scheduled_for && (
                        <div style={{ fontSize: 11, color: '#B89C5C' }}>Scheduled: {new Date(q.scheduled_for).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer actions */}
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 6 }}>
              <button onClick={() => nav(`/contacts?email=${encodeURIComponent(p.contact_email || '')}`)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#0A0A0A', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>View Contact</button>
              {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,119,181,0.2)', background: 'rgba(0,119,181,0.06)', color: '#0077B5', fontSize: 12, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}><Linkedin size={12} />LinkedIn</a>}
            </div>
          </div>
        )
      })()}

      {/* ── Build Campaign modal ── */}
      {buildOpen && (
        <div onClick={closeBuildModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: 'calc(100vw - 48px)', maxHeight: '85vh', overflowY: 'auto', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>⚡ Build Campaign</div>
                <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 3 }}>Picks team, sources every relevant company in our CRM plus fresh web targets, identifies decision-makers, filters against {buildResult?.excluded_companies_count ?? 'all'} known F1 partners.</div>
              </div>
              <button onClick={closeBuildModal} style={{ background: 'transparent', border: 'none', color: C.textTertiary, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 6 }}>✕</button>
            </div>

            {buildPhase === 'idle' && (
              <div>
                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Category</div>
                <select value={buildCategory} onChange={e => setBuildCategory(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FFFFFF', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
                  <option value="banking">Banking / Financial Services</option>
                  <option value="fintech">FinTech / Payments</option>
                  <option value="cybersecurity">Cybersecurity</option>
                  <option value="cloud">Cloud / IT Infrastructure</option>
                  <option value="ai_data">AI / Data Analytics</option>
                  <option value="software">Enterprise Software</option>
                  <option value="semiconductors">Semiconductors / Hardware</option>
                  <option value="telecom">Telecoms / Connectivity</option>
                  <option value="gaming">Gaming / Entertainment</option>
                  <option value="crypto">Crypto / Web3</option>
                  <option value="energy">Energy / Petrochemical</option>
                  <option value="automotive">Automotive / Engineering</option>
                  <option value="hospitality">Hospitality / Travel</option>
                  <option value="fashion">Fashion / Lifestyle</option>
                  <option value="watches">Watches / Luxury</option>
                  <option value="food_bev">Food & Beverage</option>
                  <option value="health">Health / Wellness</option>
                  <option value="logistics">Logistics / Shipping</option>
                  <option value="legal">Legal / Professional Services</option>
                  <option value="robotics">Robotics / Manufacturing</option>
                  <option value="whiskey">Whiskey / Premium Spirits</option>
                </select>

                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>F1 Team</div>
                <select value={buildTeam} onChange={e => setBuildTeam(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FFFFFF', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
                  <option value="auto">Auto — pick first open team alphabetically</option>
                  <option value="haas">Haas F1</option>
                  <option value="cadillac">Cadillac F1</option>
                  <option value="audi">Audi F1</option>
                  <option value="aston_martin">Aston Martin</option>
                  <option value="alpine">Alpine</option>
                  <option value="williams">Williams</option>
                  <option value="racing_bulls">Racing Bulls</option>
                  <option value="mclaren">McLaren</option>
                  <option value="ferrari">Ferrari</option>
                  <option value="mercedes">Mercedes</option>
                  <option value="red_bull">Red Bull</option>
                </select>
                <div style={{ fontSize: 11, color: C.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
                  Pipeline: pick team (your choice or alphabetical default) → verify slot is open → source 50 companies via web search with 320+ company exclusion list → identify decision-makers for top 8. ~80 seconds. If you pick a team that's already blocked in this category, the builder will refuse and tell you why.
                </div>

                {/* CRM match preview (v0.0.39) */}
                <CrmMatchPreview category={buildCategory} />

                <button onClick={runBuildCampaign} style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 }}>
                  Build {buildCategory} campaign{buildTeam !== 'auto' ? ` for ${buildTeam.replace('_', ' ')}` : ''}
                </button>
              </div>
            )}

            {buildPhase === 'building' && (
              <BuildingProgress jobId={buildJobId} />
            )}

            {buildPhase === 'review' && buildResult && (
              <div>
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{buildResult.team.name} F1 — {buildResult.category.name}</div>
                  <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, lineHeight: 1.5 }}>{buildResult.why}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#FFFFFF', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.top_50.length}</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>TARGETS SOURCED</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#FFFFFF', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.violations_caught}</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>EXCLUSIONS CAUGHT</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#FFFFFF', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.blocked_teams.length}/11</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>TEAMS BLOCKED</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>All targets sourced ({buildResult.top_50.length})</div>
                <div style={{ marginBottom: 18, maxHeight: 360, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  {buildResult.top_50.map((t, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: i < buildResult.top_50.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', color: '#0A0A0A', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{t.company}</div>
                        <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>
                          {(t.decision_makers && t.decision_makers.length > 0)
                            ? t.decision_makers.map(dm => `${dm.name}${dm.title ? ' · ' + dm.title : ''}`).join(' / ')
                            : (t.decision_maker_name ? `${t.decision_maker_name}${t.decision_maker_title ? ' · ' + t.decision_maker_title : ''}` : '—')
                          }
                        </div>
                        <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2, opacity: 0.7 }}>{t.revenue} · {t.hq}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={closeBuildModal} style={{ flex: 1, padding: '12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSecondary, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={runEnroll} style={{ flex: 2, padding: '12px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Enrol all {buildResult.top_50.length} targets (paused for review)
                  </button>
                </div>
              </div>
            )}

            {buildPhase === 'enrolling' && (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>Enrolling all {buildResult?.top_50?.length || 0} targets into sequence...</div>
              </div>
            )}

            {buildPhase === 'done' && (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14, color: C.text, marginBottom: 6 }}>Targets enrolled — sequence paused for review</div>
                <div style={{ fontSize: 11, color: C.textTertiary, marginBottom: 24 }}>{buildResult?.top_50?.length || 0} targets enrolled. Open the sequence, verify all targets, then activate.</div>
                <button onClick={closeBuildModal} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Close</button>
              </div>
            )}

            {buildPhase === 'error' && (
              <div style={{ padding: '24px 20px' }}>
                <div style={{ fontSize: 13, color: '#F87171', marginBottom: 8 }}>Build failed</div>
                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 16, fontFamily: 'monospace', padding: 10, background: '#FFFFFF', borderRadius: 6 }}>{buildError}</div>
                <button onClick={() => setBuildPhase('idle')} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Try again</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk edit steps modal (v0.0.40) */}
      {bulkEditOpen && (
        <BulkEditStepsModal onClose={() => setBulkEditOpen(false)} initialCategory="cybersecurity" />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FEFEFC', borderRadius: 14, maxWidth: 400, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#0A0A0A', marginBottom: 8, fontFamily: C.font }}>Delete campaign?</div>
            <div style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 20, fontFamily: C.font }}>
              This will permanently delete <strong>{campaigns.find(c => c.id === confirmDelete)?.name}</strong> and remove all {campaigns.find(c => c.id === confirmDelete)?.counts?.total || 0} enrolled prospects. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.1)`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button onClick={() => { const target = campaigns.find(camp => camp.id === confirmDelete); if (target) deleteCampaign(target) }} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f87171', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}

      {/* Add prospects panel */}
      {/* Duplicate to campaign modal */}
      {moveModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setMoveModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FEFEFC', borderRadius: 14, maxWidth: 420, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: '#0A0A0A', margin: '0 0 6px', fontFamily: C.font }}>{moveMode === 'move' ? 'Move' : 'Duplicate'} {bulkSelected.size} prospects to campaign</h3>
            <p style={{ fontSize: 12, color: '#6B6B6B', margin: '0 0 16px', fontFamily: C.font }}>{moveMode === 'move' ? 'Prospects will be removed from this campaign and added to the target.' : 'Prospects will be copied into the target campaign at step 1.'}</p>
            <div style={{ maxHeight: 250, overflowY: 'auto', border: `1px solid rgba(0,0,0,0.06)`, borderRadius: 8, marginBottom: 16 }}>
              {campaigns.filter(c => c.id !== selectedId && !c.archived).map(c => (
                <div key={c.id} onClick={() => setMoveTargetId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: moveTargetId === c.id ? 'rgba(0,0,0,0.04)' : 'transparent', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${moveTargetId === c.id ? '#0A0A0A' : 'rgba(0,0,0,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {moveTargetId === c.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0A0A0A' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0', fontFamily: C.font }}>{c.counts?.total || 0} prospects</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMoveModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button disabled={!moveTargetId} onClick={async () => {
                let copied = 0; let skipped = 0
                const selected = prospects.filter(p => bulkSelected.has(p.id))
                // Dedup: check existing enrollments in target campaign
                const { data: existing } = await supabase.from('kiko_sequence_enrollments').select('contact_email').eq('sequence_id', moveTargetId)
                const existingEmails = new Set((existing || []).map(e => e.contact_email?.toLowerCase()).filter(Boolean))
                for (const p of selected) {
                  if (existingEmails.has(p.contact_email?.toLowerCase())) { skipped++; continue }
                  const { error } = await supabase.from('kiko_sequence_enrollments').insert({
                    sequence_id: moveTargetId, contact_id: p.contact_id || null,
                    contact_name: p.contact_name, contact_email: p.contact_email, company: p.company,
                    linkedin_url: p.linkedin_url, status: 'active', current_step: 1,
                    enrolled_at: new Date().toISOString(),
                  })
                  if (!error) copied++
                }
                // If moving, remove from current campaign
                if (moveMode === 'move') {
                  for (const p of selected) {
                    await supabase.from('kiko_sequence_enrollments').delete().eq('id', p.id)
                  }
                }
                setMoveModalOpen(false); setBulkSelected(new Set())
                alert(`${moveMode === 'move' ? 'Moved' : 'Duplicated'} ${copied} prospects to ${campaigns.find(c => c.id === moveTargetId)?.name}${skipped ? ` (${skipped} already enrolled, skipped)` : ''}`)
                await loadCampaigns(); await loadProspects(selectedId)
              }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: moveTargetId ? '#0A0A0A' : 'rgba(0,0,0,0.1)', color: moveTargetId ? '#FEFEFC' : '#A0A0A0', fontSize: 12, fontWeight: 500, cursor: moveTargetId ? 'pointer' : 'default', fontFamily: C.font }}>{moveMode === 'move' ? 'Move' : 'Duplicate'}</button>
            </div>
          </div>
        </div>
      )}

      {addProspectsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { setAddProspectsOpen(false); setAddProspectsPhase('idle'); setAddProspectsError(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FEFEFC', borderRadius: 14, maxWidth: 520, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font }}>Add prospects to {selectedCampaign?.name}</div>
              <button onClick={() => { setAddProspectsOpen(false); setAddProspectsPhase('idle') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0A0' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 16, fontFamily: C.font }}>
              Kiko will research and source new companies and decision-makers matching your campaign criteria, then let you review and enroll them. Existing prospects won't be duplicated.
            </div>
            {addProspectsPhase === 'idle' && (
              <>
                {selectedCampaign && (
                  <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 8, marginBottom: 12, fontSize: 11, color: '#6B6B6B', fontFamily: C.font }}>
                    <div style={{ fontWeight: 500, color: '#0A0A0A', marginBottom: 4 }}>Current campaign criteria</div>
                    {selectedCampaign.description && <div style={{ marginBottom: 2 }}>{selectedCampaign.description}</div>}
                    {selectedCampaign.target_persona && <div>Target: {selectedCampaign.target_persona}</div>}
                    <div style={{ marginTop: 4, color: '#A0A0A0' }}>Enrolled: {selectedCampaign.counts?.total || 0} prospects</div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 6, fontFamily: C.font }}>Kiko will deep-research companies matching your criteria, find decision-makers, and add them to this campaign. Adjust the criteria below or use the defaults:</div>
                <textarea
                  value={addProspectsQuery}
                  onChange={e => setAddProspectsQuery(e.target.value)}
                  placeholder={selectedCampaign?.description || selectedCampaign?.target_persona || 'e.g. "Technology companies with $100M+ revenue that invest in F1 sponsorships"'}
                  style={{ width: '100%', height: 70, padding: 12, borderRadius: 8, border: `1px solid rgba(0,0,0,0.1)`, background: 'rgba(0,0,0,0.02)', fontSize: 13, fontFamily: C.font, resize: 'vertical', outline: 'none', boxSizing: 'border-box', color: '#0A0A0A' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setAddProspectsOpen(false); setAddProspectsPhase('idle') }} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.1)`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
                  <button onClick={() => addMoreProspects()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={12} /> Source new prospects</button>
                </div>
              </>
            )}
            {addProspectsPhase === 'sourcing' && (
              <div style={{ padding: 24 }}>
                <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${sourceProgress}%`, height: '100%', background: '#7d8a64', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 500, marginBottom: 6, fontFamily: C.font }}>Sourcing new prospects...</div>
                <div style={{ fontSize: 11, color: '#6B6B6B', fontFamily: C.font, lineHeight: 1.5 }}>{sourceMessage}</div>
                <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 8, fontFamily: C.font }}>This may take 1-3 minutes. Kiko is researching companies and finding decision-makers.</div>
              </div>
            )}
            {addProspectsPhase === 'review' && addProspectsResult && (
              <div>
                <div style={{ fontSize: 12, color: '#0A0A0A', fontWeight: 500, marginBottom: 4, fontFamily: C.font }}>{addProspectsResult.message}</div>
                {addProspectsResult.companies?.length > 0 && (
                  <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 12, fontFamily: C.font }}>From {addProspectsResult.companies.length} companies researched</div>
                )}
                {addProspectsResult.contacts?.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <button onClick={() => {
                        const allSelected = addProspectsResult.contacts.every(c => c.selected)
                        setAddProspectsResult({ ...addProspectsResult, contacts: addProspectsResult.contacts.map(c => ({ ...c, selected: !allSelected })) })
                      }} style={{ fontSize: 11, color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: C.font, textDecoration: 'underline' }}>
                        {addProspectsResult.contacts.every(c => c.selected) ? 'Deselect all' : 'Select all'}
                      </button>
                      <span style={{ fontSize: 11, color: '#A0A0A0', fontFamily: C.font }}>{addProspectsResult.contacts.filter(c => c.selected).length} / {addProspectsResult.contacts.length} selected</span>
                    </div>
                    <div style={{ maxHeight: 350, overflowY: 'auto', border: `1px solid rgba(0,0,0,0.06)`, borderRadius: 8 }}>
                      {addProspectsResult.contacts.map((c, i) => (
                        <div key={c.id} onClick={() => {
                          const updated = [...addProspectsResult.contacts]
                          updated[i] = { ...updated[i], selected: !updated[i].selected }
                          setAddProspectsResult({ ...addProspectsResult, contacts: updated })
                        }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < addProspectsResult.contacts.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none', cursor: 'pointer', background: c.selected ? 'rgba(125,138,100,0.04)' : 'transparent', transition: 'background 0.15s' }}>
                          <input type="checkbox" checked={c.selected} readOnly style={{ accentColor: '#7d8a64', pointerEvents: 'none' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {c.name}
                              {c.email_valid ? <span style={{ fontSize: 9, color: '#00B464' }}>✓ verified</span> : c.email_valid === false ? <span style={{ fontSize: 9, color: '#f87171' }}>⚠ unverified</span> : null}
                            </div>
                            <div style={{ fontSize: 11, color: '#6B6B6B', fontFamily: C.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title} · {c.company}{c.revenue ? ` · ${c.revenue}` : ''}</div>
                            {c.email && <div style={{ fontSize: 10, color: '#A0A0A0', fontFamily: C.font }}>{c.email}{c.email_domain_match === false ? ' ⚠ domain mismatch' : ''}</div>}
                            {c.sponsorship_history && c.sponsorship_history !== 'Not researched' && <div style={{ fontSize: 9, color: '#7d8a64', fontFamily: C.font, marginTop: 2 }}>🏎 {c.sponsorship_history.slice(0, 80)}{c.sponsorship_history.length > 80 ? '...' : ''}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <button onClick={() => setAddProspectsPhase('idle')} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.1)`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Back</button>
                      <button onClick={enrollSelected} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={12} /> Enroll {addProspectsResult.contacts.filter(c => c.selected).length} prospects</button>
                    </div>
                  </>
                )}
                {(!addProspectsResult.contacts || addProspectsResult.contacts.length === 0) && (
                  <button onClick={() => setAddProspectsPhase('idle')} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.1)`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font, marginTop: 12 }}>Try different criteria</button>
                )}
              </div>
            )}
            {addProspectsPhase === 'enrolling' && (
              <div style={{ padding: 24 }}>
                <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${sourceProgress}%`, height: '100%', background: '#7d8a64', borderRadius: 3, transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 500, fontFamily: C.font }}>{sourceMessage}</div>
              </div>
            )}
            {addProspectsPhase === 'done' && (
              <div style={{ padding: 24 }}>
                <div style={{ width: '100%', height: 4, background: '#7d8a64', borderRadius: 2, marginBottom: 16 }} />
                <div style={{ fontSize: 14, color: '#7d8a64', fontWeight: 500, marginBottom: 8, fontFamily: C.font }}>Prospects sourced and enrolled</div>
                {typeof addProspectsResult === 'string' && addProspectsResult.length > 10 && (
                  <div style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 16, fontFamily: C.font, maxHeight: 150, overflowY: 'auto', padding: '8px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{addProspectsResult}</div>
                )}
                <button onClick={() => { setAddProspectsOpen(false); setAddProspectsPhase('idle'); setAddProspectsQuery('') }} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>Done</button>
              </div>
            )}
            {addProspectsPhase === 'error' && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#f87171', marginBottom: 8, fontFamily: C.font }}>Something went wrong</div>
                <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 16, fontFamily: C.font }}>{addProspectsError}</div>
                <button onClick={() => setAddProspectsPhase('idle')} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.1)`, background: 'transparent', color: '#0A0A0A', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
// v0.0.38 (Sunny spec 2026-04-12): polls /api/job-status?id={jobId} every 1.5s
// for real backend stage progress instead of frontend timer estimation.
// Falls back to timer mode if no jobId is provided (backward compat).
// ─────────────────────────────────────────────────────────────────────
function CrmMatchPreview({ category }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!category) return
    setLoading(true)
    setData(null)
    fetch(`/api/crm-match-preview?category=${category}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [category])

  if (loading) {
    return (
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.06)', fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
        Checking CRM for {category} matches…
      </div>
    )
  }

  if (!data || data.error) return null

  const hasMatches = data.contact_count > 0
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: hasMatches ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
      border: `0.5px solid ${hasMatches ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.08)'}`,
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasMatches ? 6 : 0 }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          background: hasMatches ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: hasMatches ? '#0A0A0A' : 'rgba(0,0,0,0.40)',
        }}>{hasMatches ? '✓' : 'i'}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: hasMatches ? '#0A0A0A' : 'rgba(0,0,0,0.45)' }}>
          {hasMatches
            ? `${data.contact_count} relevant contacts at ${data.company_count} CRM companies`
            : `No CRM matches — build will source entirely from web search`}
        </div>
      </div>
      {hasMatches && data.sample_companies?.length > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.50)', lineHeight: 1.6, paddingLeft: 26 }}>
          {data.sample_companies.slice(0, 4).map((c, i) => (
            <span key={i}>
              {c.name} <span style={{ color: 'rgba(0,0,0,0.30)' }}>({c.contact_count})</span>
              {i < Math.min(3, data.sample_companies.length - 1) ? ' · ' : ''}
            </span>
          ))}
          {data.sample_companies.length > 4 && <span style={{ color: 'rgba(0,0,0,0.30)' }}> + {data.sample_companies.length - 4} more</span>}
        </div>
      )}
    </div>
  )
}

function BuildingProgress({ jobId }) {
  const stages = [
    { label: 'Selecting team via partnership matrix', sub: 'Querying active F1 partnerships', durationMs: 3000 },
    { label: 'Loading category exclusion set', sub: 'Filtering blocked teams + overlap conflicts', durationMs: 3000 },
    { label: 'Querying CRM for industry matches', sub: 'Scoring companies + contacts', durationMs: 8000 },
    { label: 'Web search for fresh prospects', sub: 'Real-time sourcing via Claude + web_search', durationMs: 35000 },
    { label: 'Identifying decision-makers', sub: 'CMO / VP Marketing / Head of Brand / CRO', durationMs: 15000 },
    { label: 'Validating against partner exclusions', sub: 'Defense in depth — no F1 partner duplicates', durationMs: 6000 },
  ]
  const [currentStage, setCurrentStage] = React.useState(0)
  const [elapsed, setElapsed] = React.useState(0)
  const [backendDetail, setBackendDetail] = React.useState(null)
  const [pollMode, setPollMode] = React.useState(false)  // true once we get a real job status

  React.useEffect(() => {
    const startTime = Date.now()
    const elapsedTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 250)

    // ── Real backend polling path (v0.0.38) ──
    let pollInterval = null
    let timerInterval = null
    if (jobId) {
      pollInterval = setInterval(async () => {
        try {
          const r = await fetch(`/api/job-status?id=${jobId}`, { cache: 'no-store' })
          if (!r.ok) return  // 404 ok — backend might not have inserted the row yet
          const job = await r.json()
          if (job?.current_stage != null) {
            // Convert 1-indexed backend stage → 0-indexed frontend stage
            // Stage N is currently running, so frontend "active" should be N-1
            setCurrentStage(Math.max(0, job.current_stage - 1))
            setBackendDetail(job.stage_detail || job.stage_label || null)
            setPollMode(true)
          }
          if (job?.status === 'completed') {
            setCurrentStage(stages.length)  // all done
            clearInterval(pollInterval)
          } else if (job?.status === 'failed') {
            clearInterval(pollInterval)
          }
        } catch {} // non-fatal
      }, 1500)
    }

    // ── Timer fallback (only when poll mode hasn't kicked in yet) ──
    timerInterval = setInterval(() => {
      // If we're already in poll mode, the backend is driving the stage state
      if (pollMode) return
      const e = Math.floor((Date.now() - startTime) / 1000)
      let cumulative = 0
      for (let i = 0; i < stages.length; i++) {
        cumulative += stages[i].durationMs
        if (e * 1000 < cumulative) {
          setCurrentStage(i)
          return
        }
      }
      setCurrentStage(stages.length - 1)
    }, 250)

    return () => {
      clearInterval(elapsedTimer)
      if (pollInterval) clearInterval(pollInterval)
      if (timerInterval) clearInterval(timerInterval)
    }
  }, [jobId, pollMode])

  return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>⚡ Building campaign...</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pollMode && <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>● live</span>}
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', fontFamily: 'ui-monospace,monospace' }}>{elapsed}s elapsed</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stages.map((stage, i) => {
          const isActive = i === currentStage
          const isDone = i < currentStage
          const isPending = i > currentStage
          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 8,
              background: isActive ? 'rgba(0,0,0,0.06)' : isDone ? 'rgba(0,0,0,0.03)' : 'transparent',
              border: `0.5px solid ${isActive ? 'rgba(0,0,0,0.10)' : isDone ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)'}`,
              transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
              opacity: isPending ? 0.4 : 1,
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#0A0A0A' : isActive ? 'transparent' : 'rgba(0,0,0,0.06)', border: isActive ? '1.5px solid #0A0A0A' : 'none' }}>
                {isDone && <span style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>✓</span>}
                {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0A0A0A', animation: 'pulse 1.2s ease-in-out infinite' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: isActive ? '#fff' : isDone ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)', fontWeight: 500, marginBottom: 2 }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.40)' }}>
                  {isActive && backendDetail ? backendDetail : stage.sub}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 20, fontSize: 10, color: 'rgba(0,0,0,0.35)', textAlign: 'center', lineHeight: 1.6 }}>
        {pollMode ? 'Live backend progress. Don\'t close this window.' : 'Total expected: 60-90 seconds. Don\'t close this window.'}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
