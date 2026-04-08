// src/pages/Campaigns.jsx — Campaign Prospecting view
// Left rail: campaign list. Main: prospects table for selected campaign.
// Real data from Supabase. Realtime updates. Pause/activate per-campaign and per-prospect.
import { useState, useEffect, useCallback } from 'react'
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
        contact_name: e.contact_name || e.contact_email?.split('@')[0] || 'Unknown',
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

  // Realtime subscription — refresh prospects when queue or enrollments change
  useEffect(() => {
    if (!selectedId) return
    const ch = supabase
      .channel(`campaign_${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_sequence_enrollments', filter: `sequence_id=eq.${selectedId}` }, () => loadProspects(selectedId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_outreach_queue' }, () => loadProspects(selectedId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId, loadProspects])

  // ── actions ──
  async function toggleCampaign(seq) {
    const newState = !seq.is_active
    await supabase.from('kiko_sequences').update({ is_active: newState }).eq('id', seq.id)
    setCampaigns(prev => prev.map(c => c.id === seq.id ? { ...c, is_active: newState } : c))
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
          <button
            onClick={() => nav('/campaigns/new')}
            title="New campaign"
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><Plus size={14} /></button>
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
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{p.contact_name}</div>
                          <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{p.contact_email}</div>
                        </td>
                        <td style={cell}>
                          <div style={{ fontSize: 12, color: C.text }}>{p.company || '—'}</div>
                          <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{p.title || ''}</div>
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
    </div>
  )
}
