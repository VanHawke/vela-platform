// src/pages/Campaigns.jsx — Campaign Prospecting view
// Left rail: campaign list. Main: prospects table for selected campaign.
// Real data from Supabase. Realtime updates. Pause/activate per-campaign and per-prospect.
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import T from '@/lib/theme'
import {
  Mail, Linkedin, Eye, MousePointer, Reply, AlertTriangle, Clock,
  Pause, Play, Plus, Search, RefreshCw, X, ChevronRight, Trash2,
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
    active:    { label: 'Active',   bg: 'rgba(45,212,191,0.10)', fg: '#2dd4bf', br: 'rgba(45,212,191,0.25)' },
    replied:   { label: 'Replied',  bg: 'rgba(167,139,250,0.10)', fg: '#a78bfa', br: 'rgba(167,139,250,0.25)' },
    bounced:   { label: 'Bounced',  bg: 'rgba(248,113,113,0.10)', fg: '#f87171', br: 'rgba(248,113,113,0.25)' },
    completed: { label: 'Done',     bg: 'rgba(167,139,250,0.06)', fg: 'rgba(167,139,250,0.5)', br: 'rgba(167,139,250,0.15)' },
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
  const [campaigns, setCampaigns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Build-campaign modal state
  const [buildOpen, setBuildOpen] = useState(false)
  const [buildCategory, setBuildCategory] = useState('banking')
  const [buildTeam, setBuildTeam] = useState('auto') // 'auto' or a team id
  const [buildPhase, setBuildPhase] = useState('idle') // idle, building, review, enrolling, done, error
  const [buildResult, setBuildResult] = useState(null)
  const [buildError, setBuildError] = useState(null)

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
        .select('enrollment_id, step_number, channel, status, sent_at, opened_at, opens_count, clicked_at, clicks_count, last_clicked_url, reply_received_at, reply_snippet, subject, scheduled_for')
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
    setDetailLoading(false)
  }, [])

  useEffect(() => { if (selectedId) loadProspects(selectedId) }, [selectedId, loadProspects])

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
  })

  const selectedCampaign = campaigns.find(c => c.id === selectedId)
  const totalSteps = selectedCampaign?.steps?.length || 0

  // ── styles ──
  const C = T // color tokens shorthand
  const cell = { padding: '12px 14px', fontSize: 12, color: C.text, borderBottom: `0.5px solid ${C.border || 'rgba(255,255,255,0.06)'}`, verticalAlign: 'middle' }
  const headerCell = { ...cell, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textTertiary || 'rgba(238,238,238,0.45)', fontWeight: 500, background: 'rgba(0,0,0,0.15)', position: 'sticky', top: 0, zIndex: 1 }

  // ── render ──
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: C.font, color: C.text, background: C.bg }}>

      {/* ─── LEFT RAIL: Campaign list ─── */}
      <aside style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border || 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Campaigns</div>
            <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{campaigns.length} total</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setBuildOpen(true); setBuildPhase('idle') }}
              title="Auto-build campaign (deterministic — picks team, sources 50 targets, identifies decision-makers)"
              style={{ padding: '0 10px', height: 28, borderRadius: 6, border: `1px solid rgba(167,139,250,0.35)`, background: 'rgba(167,139,250,0.08)', color: '#A78BFA', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'inherit', fontWeight: 500 }}
            >⚡ Build</button>
            <button
              onClick={() => nav('/campaigns/new')}
              title="New blank campaign"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><Plus size={14} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <div style={{ padding: 24, fontSize: 11, color: C.textTertiary, textAlign: 'center' }}>Loading...</div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: 24, fontSize: 11, color: C.textTertiary, textAlign: 'center' }}>No campaigns yet</div>
          ) : campaigns.map(c => {
            const isSelected = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 12px', marginBottom: 4, borderRadius: 6, border: 'none',
                  background: isSelected ? 'rgba(167,139,250,0.10)' : 'transparent',
                  cursor: 'pointer', fontFamily: C.font,
                  borderLeft: isSelected ? '2px solid #a78bfa' : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.is_active ? '#2dd4bf' : 'rgba(148,163,184,0.4)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: isSelected ? '#fff' : 'rgba(238,238,238,0.85)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textTertiary, display: 'flex', gap: 8, paddingLeft: 12 }}>
                  <span>{c.counts.total} prospects</span>
                  {c.counts.replied > 0 && <span style={{ color: '#a78bfa' }}>{c.counts.replied} replied</span>}
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textTertiary, fontSize: 13 }}>
            Select a campaign from the left
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '20px 28px 14px', borderBottom: `1px solid ${C.border || 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 500, color: C.text, margin: 0 }}>{selectedCampaign.name}</h1>
                    {selectedCampaign.is_active ? (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(45,212,191,0.10)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Live</span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.10)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Draft</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textTertiary }}>
                    {totalSteps} steps · {selectedCampaign.target_persona || 'No persona set'} · {prospects.length} prospects enrolled
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => toggleCampaign(selectedCampaign)}
                    style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${selectedCampaign.is_active ? 'rgba(251,191,36,0.30)' : 'rgba(45,212,191,0.30)'}`, background: selectedCampaign.is_active ? 'rgba(251,191,36,0.08)' : 'rgba(45,212,191,0.08)', color: selectedCampaign.is_active ? '#fbbf24' : '#2dd4bf', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {selectedCampaign.is_active ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                  </button>
                  <button
                    onClick={() => nav(`/campaigns/${selectedCampaign.id}`)}
                    style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}
                  >Edit sequence</button>
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <div style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border || 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textTertiary }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search prospects..."
                  style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, border: `1px solid ${C.border || 'rgba(255,255,255,0.08)'}`, background: 'rgba(0,0,0,0.20)', color: C.text, fontSize: 12, fontFamily: C.font, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'active', 'replied', 'bounced', 'stale', 'paused'].map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: `1px solid ${statusFilter === f ? 'rgba(167,139,250,0.30)' : 'transparent'}`,
                      background: statusFilter === f ? 'rgba(167,139,250,0.10)' : 'transparent',
                      color: statusFilter === f ? '#a78bfa' : C.textSecondary,
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
                    style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.30)', background: 'rgba(167,139,250,0.10)', color: '#a78bfa', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}
                  >Add prospects</button>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...headerCell, textAlign: 'left' }}>Prospect</th>
                      <th style={{ ...headerCell, textAlign: 'left' }}>Company</th>
                      <th style={{ ...headerCell, textAlign: 'center' }}>Step</th>
                      <th style={{ ...headerCell, textAlign: 'center' }}>Engagement</th>
                      <th style={{ ...headerCell, textAlign: 'left' }}>Last action</th>
                      <th style={{ ...headerCell, textAlign: 'left' }}>Next</th>
                      <th style={{ ...headerCell, textAlign: 'center' }}>Status</th>
                      <th style={{ ...headerCell, textAlign: 'right', paddingRight: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProspects.map(p => (
                      <tr key={p.id} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...cell, paddingLeft: 28 }}>
                          <div
                            onClick={() => nav(`/contacts?email=${encodeURIComponent(p.contact_email || '')}`)}
                            style={{ fontSize: 13, color: C.text, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#a78bfa'}
                            onMouseLeave={e => e.currentTarget.style.color = C.text}
                            title="Open contact record"
                          >{p.contact_name}</div>
                          <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{p.contact_email}</div>
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
                            <span title="Opens" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: p.opens_count > 0 ? '#a78bfa' : C.textTertiary }}><Eye size={11} />{p.opens_count}</span>
                            <span title="Clicks" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: p.clicks_count > 0 ? '#2dd4bf' : C.textTertiary }}><MousePointer size={11} />{p.clicks_count}</span>
                            {p.replied && <span title="Replied" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#a78bfa' }}><Reply size={11} /></span>}
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

      {/* ── Build Campaign modal ── */}
      {buildOpen && (
        <div onClick={closeBuildModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: 'calc(100vw - 48px)', maxHeight: '85vh', overflowY: 'auto', background: '#262624', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 14, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', margin: '0 auto' }}>
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
                <select value={buildCategory} onChange={e => setBuildCategory(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1F1F1D', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
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
                </select>

                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>F1 Team</div>
                <select value={buildTeam} onChange={e => setBuildTeam(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1F1F1D', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
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

                <button onClick={runBuildCampaign} style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 }}>
                  Build {buildCategory} campaign{buildTeam !== 'auto' ? ` for ${buildTeam.replace('_', ' ')}` : ''}
                </button>
              </div>
            )}

            {buildPhase === 'building' && (
              <BuildingProgress jobId={buildJobId} />
            )}

            {buildPhase === 'review' && buildResult && (
              <div>
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{buildResult.team.name} F1 — {buildResult.category.name}</div>
                  <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, lineHeight: 1.5 }}>{buildResult.why}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.top_50.length}</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>TARGETS SOURCED</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.violations_caught}</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>EXCLUSIONS CAUGHT</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{buildResult.blocked_teams.length}/11</div>
                    <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>TEAMS BLOCKED</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>All targets sourced ({buildResult.top_50.length})</div>
                <div style={{ marginBottom: 18, maxHeight: 360, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  {buildResult.top_50.map((t, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: i < buildResult.top_50.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(167,139,250,0.12)', color: '#A78BFA', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
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
                  <button onClick={runEnroll} style={{ flex: 2, padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 16, fontFamily: 'monospace', padding: 10, background: '#1F1F1D', borderRadius: 6 }}>{buildError}</div>
                <button onClick={() => setBuildPhase('idle')} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────
// BuildingProgress — multi-stage progress for the campaign builder.
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
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
        Checking CRM for {category} matches…
      </div>
    )
  }

  if (!data || data.error) return null

  const hasMatches = data.contact_count > 0
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: hasMatches ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.03)',
      border: `0.5px solid ${hasMatches ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.08)'}`,
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasMatches ? 6 : 0 }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          background: hasMatches ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: hasMatches ? '#2DD4BF' : 'rgba(255,255,255,0.4)',
        }}>{hasMatches ? '✓' : 'i'}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: hasMatches ? '#2DD4BF' : 'rgba(255,255,255,0.55)' }}>
          {hasMatches
            ? `${data.contact_count} relevant contacts at ${data.company_count} CRM companies`
            : `No CRM matches — build will source entirely from web search`}
        </div>
      </div>
      {hasMatches && data.sample_companies?.length > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', lineHeight: 1.6, paddingLeft: 26 }}>
          {data.sample_companies.slice(0, 4).map((c, i) => (
            <span key={i}>
              {c.name} <span style={{ color: 'rgba(255,255,255,0.30)' }}>({c.contact_count})</span>
              {i < Math.min(3, data.sample_companies.length - 1) ? ' · ' : ''}
            </span>
          ))}
          {data.sample_companies.length > 4 && <span style={{ color: 'rgba(255,255,255,0.30)' }}> + {data.sample_companies.length - 4} more</span>}
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
          {pollMode && <span style={{ fontSize: 9, color: 'rgba(45,212,191,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>● live</span>}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'ui-monospace,monospace' }}>{elapsed}s elapsed</div>
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
              background: isActive ? 'rgba(167,139,250,0.10)' : isDone ? 'rgba(45,212,191,0.05)' : 'transparent',
              border: `0.5px solid ${isActive ? 'rgba(167,139,250,0.30)' : isDone ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
              opacity: isPending ? 0.4 : 1,
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#2DD4BF' : isActive ? 'transparent' : 'rgba(255,255,255,0.06)', border: isActive ? '1.5px solid #A78BFA' : 'none' }}>
                {isDone && <span style={{ color: '#1F1F1D', fontSize: 11, fontWeight: 700 }}>✓</span>}
                {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A78BFA', animation: 'pulse 1.2s ease-in-out infinite' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: isActive ? '#fff' : isDone ? 'rgba(45,212,191,0.85)' : 'rgba(255,255,255,0.55)', fontWeight: 500, marginBottom: 2 }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                  {isActive && backendDetail ? backendDetail : stage.sub}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 20, fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.6 }}>
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
