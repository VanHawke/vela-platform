import { useState, useEffect, useCallback } from 'react'
import { setPageContext } from '@/lib/pageContext'
import { Mail, MousePointer, Reply, AlertTriangle, Clock, ChevronRight, ChevronLeft, RefreshCw, Users, BarChart3, Send, Linkedin, Phone, ArrowRight, X, Eye } from 'lucide-react'
import T from '@/lib/theme'
import CompanyLogo from '@/components/CompanyLogo'

// ── Helpers ──
function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function statusGroup(c) {
  const s = (c.state || c.status || '').toLowerCase()
  if (s === 'running' || s === 'active' || s === 'sending') return 0
  if (s === 'paused') return 1
  return 2 // draft, archived, completed, etc
}

function statusLabel(c) {
  const s = (c.state || c.status || '').toLowerCase()
  if (s === 'running' || s === 'active' || s === 'sending') return 'Running'
  if (s === 'paused') return 'Paused'
  if (s === 'draft') return 'Draft'
  if (s === 'archived') return 'Archived'
  return s || 'Unknown'
}

function statusColor(c) {
  const s = (c.state || c.status || '').toLowerCase()
  if (s === 'running' || s === 'active' || s === 'sending') return { bg: 'rgba(6,214,160,0.08)', color: 'rgba(6,214,160,0.7)', border: 'rgba(6,214,160,0.15)' }
  if (s === 'paused') return { bg: 'rgba(245,166,35,0.08)', color: 'rgba(245,166,35,0.7)', border: 'rgba(245,166,35,0.15)' }
  return { bg: 'rgba(25,25,25,0.40)', color: T.textTertiary, border: 'rgba(255,224,194,0.06)' }
}

function stepIcon(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('email') || t.includes('mail')) return <Mail size={14} style={{ color: 'rgba(255,224,194,0.7)' }} />
  if (t.includes('linkedin')) return <Linkedin size={14} style={{ color: 'rgba(0,119,181,0.7)' }} />
  if (t.includes('call') || t.includes('phone')) return <Phone size={14} style={{ color: 'rgba(0,212,170,0.7)' }} />
  if (t.includes('delay') || t.includes('wait')) return <Clock size={14} style={{ color: 'rgba(255,224,194,0.35)' }} />
  return <Send size={14} style={{ color: 'rgba(255,224,194,0.45)' }} />
}

function activityIcon(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('replied')) return <Reply size={12} style={{ color: 'rgba(6,214,160,0.8)' }} />
  if (t.includes('opened') || t.includes('open')) return <Eye size={12} style={{ color: 'rgba(255,224,194,0.6)' }} />
  if (t.includes('clicked')) return <MousePointer size={12} style={{ color: 'rgba(0,212,170,0.6)' }} />
  if (t.includes('bounced')) return <AlertTriangle size={12} style={{ color: 'rgba(255,59,48,0.6)' }} />
  if (t.includes('linkedin')) return <Linkedin size={12} style={{ color: 'rgba(0,119,181,0.6)' }} />
  if (t.includes('sent')) return <Mail size={12} style={{ color: 'rgba(255,224,194,0.45)' }} />
  return <Mail size={12} style={{ color: 'rgba(255,224,194,0.30)' }} />
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }

// ── Main Component ──
export default function Lemlist({ user }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  // Campaign detail view
  const [stats, setStats] = useState(null)
  const [leads, setLeads] = useState([])
  const [sequenceSteps, setSequenceSteps] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [campaignActivities, setCampaignActivities] = useState([])
  // Lead detail view
  const [selectedLead, setSelectedLead] = useState(null)
  const [leadActivities, setLeadActivities] = useState([])
  const [leadActLoading, setLeadActLoading] = useState(false)

  useEffect(() => { loadCampaigns() }, [])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/lemlist-data?action=campaigns')
      const c = await res.json()
      const arr = Array.isArray(c) ? c : []
      // Sort: running first, then paused, then rest — within each group by createdAt desc
      arr.sort((a, b) => {
        const gA = statusGroup(a), gB = statusGroup(b)
        if (gA !== gB) return gA - gB
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      })
      setCampaigns(arr)
      setPageContext({ page: 'lemlist', summary: `Lemlist: ${arr.length} campaigns`, visibleItems: arr.slice(0, 8).map(x => `${x.name} (${statusLabel(x)})`).join(', ') })
    } catch (e) { console.error('[Lemlist]', e) }
    finally { setLoading(false) }
  }

  const selectCampaign = async (c) => {
    setSelectedCampaign(c)
    setSelectedLead(null)
    setLeadActivities([])
    setDetailLoading(true)
    setStats(null)
    setLeads([])
    setSequenceSteps([])
    try {
      // Parallel fetch: stats + activities
      const [statsRes, actRes] = await Promise.all([
        fetch(`/api/lemlist-data?action=stats&campaign_id=${c._id}`),
        fetch(`/api/lemlist-data?action=activities&campaign_id=${c._id}`),
      ])
      const [statsData, actData] = await Promise.all([
        statsRes.json(), actRes.json(),
      ])
      setStats(statsData || {})
      // Derive unique leads from activities (richer data than /leads endpoint)
      const actArr = Array.isArray(actData) ? actData : []
      setCampaignActivities(actArr)
      const leadMap = {}
      for (const a of actArr) {
        const email = a.leadEmail || a.email || ''
        if (!email) continue
        if (!leadMap[email]) {
          leadMap[email] = {
            email,
            firstName: a.leadFirstName || a.firstName || '',
            lastName: a.leadLastName || a.lastName || '',
            companyName: a.leadCompanyName || a.companyName || '',
            _id: a.leadId || email,
            lastActivity: a.createdAt,
            lastType: a.type,
            activities: 1,
          }
        } else {
          leadMap[email].activities++
          // Keep most recent activity info
          if (a.createdAt > leadMap[email].lastActivity) {
            leadMap[email].lastActivity = a.createdAt
            leadMap[email].lastType = a.type
          }
          // Fill in missing names
          if (!leadMap[email].firstName && (a.leadFirstName || a.firstName)) leadMap[email].firstName = a.leadFirstName || a.firstName
          if (!leadMap[email].companyName && (a.leadCompanyName || a.companyName)) leadMap[email].companyName = a.leadCompanyName || a.companyName
        }
      }
      const derivedLeads = Object.values(leadMap).sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0))
      setLeads(derivedLeads)
      // Derive sequence steps from activities (API sequence_steps endpoint not available)
      const stepMap = {}
      for (const a of actArr) {
        const stepNum = a.stepNumber || a.sequenceStep || 0
        const t = (a.type || '').toLowerCase()
        if (stepNum > 0 && t.includes('sent')) {
          if (!stepMap[stepNum]) {
            stepMap[stepNum] = {
              _id: `step_${stepNum}`,
              stepNumber: stepNum,
              type: t.includes('linkedin') ? 'linkedin' : t.includes('email') ? 'email' : 'other',
              subject: a.subject || '',
              count: 0,
            }
          }
          stepMap[stepNum].count++
          if (!stepMap[stepNum].subject && a.subject) stepMap[stepNum].subject = a.subject
        }
      }
      const derivedSteps = Object.values(stepMap).sort((a, b) => a.stepNumber - b.stepNumber)
      setSequenceSteps(derivedSteps)
    } catch (e) { console.error('[Lemlist detail]', e) }
    finally { setDetailLoading(false) }
  }

  const selectLead = (lead) => {
    setSelectedLead(lead)
    // Filter activities for this lead from already-loaded campaign activities
    const email = lead.email || ''
    const filtered = campaignActivities.filter(a => {
      const aEmail = a.leadEmail || a.email || ''
      return aEmail.toLowerCase() === email.toLowerCase()
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    setLeadActivities(filtered)
  }

  // Shared styles
  const card = { background: 'rgba(25,25,25,0.30)', border: '1px solid rgba(25,25,25,0.40)', borderRadius: 12, transition: 'all 0.15s' }
  const statCard = { ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }
  const sectionTitle = { fontSize: 12, fontWeight: 500, color: 'rgba(255,224,194,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', fontFamily: T.font }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textTertiary, fontFamily: T.font, fontWeight: 300 }}>Loading Lemlist...</div>

  // ── RENDER ──
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: T.font }}>

      {/* ═══ LEFT PANEL — Campaign List ═══ */}
      <div style={{ width: 280, borderRight: '1px solid rgba(25,25,25,0.40)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 400, color: T.text, margin: 0 }}>Lemlist</h1>
            <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>{campaigns.length} campaigns</p>
          </div>
          <button onClick={loadCampaigns} style={{ width: 28, height: 28, borderRadius: 50, border: 'none', background: 'rgba(25,25,25,0.40)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary }}>
            <RefreshCw size={12} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {(() => {
            let lastGroup = -1
            return campaigns.map(c => {
              const grp = statusGroup(c)
              const showHeader = grp !== lastGroup
              lastGroup = grp
              const isActive = selectedCampaign?._id === c._id
              const sc = statusColor(c)
              return (
                <div key={c._id}>
                  {showHeader && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,224,194,0.30)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '12px 12px 6px', marginTop: grp > 0 ? 8 : 0 }}>
                      {grp === 0 ? 'Running' : grp === 1 ? 'Paused' : 'Other'}
                    </div>
                  )}
                  <div onClick={() => selectCampaign(c)} style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 3, cursor: 'pointer', transition: 'all 0.15s',
                    background: isActive ? 'rgba(255,224,194,0.06)' : 'rgba(238,238,238,0.015)',
                    border: `1px solid ${isActive ? 'rgba(255,224,194,0.15)' : 'rgba(25,25,25,0.35)'}`,
                  }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(25,25,25,0.40)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'rgba(238,238,238,0.015)' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? '#fff' : 'rgba(238,238,238,0.65)', marginBottom: 4, lineHeight: 1.35 }}>{c.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontWeight: 500 }}>{statusLabel(c)}</span>
                      {c.inSequenceLeadCount > 0 && <span style={{ fontSize: 10, color: T.textTertiary }}>{c.inSequenceLeadCount} leads</span>}
                      <span style={{ fontSize: 10, color: 'rgba(255,224,194,0.15)', marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* ═══ MIDDLE PANEL — Campaign Detail ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!selectedCampaign ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary, fontWeight: 300, fontSize: 14 }}>
            Select a campaign to view details
          </div>
        ) : detailLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary, fontWeight: 300, fontSize: 14 }}>Loading campaign data...</div>
        ) : (
          <>
            {/* Campaign header + stats */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(25,25,25,0.40)' }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: T.text, margin: '0 0 4px' }}>{selectedCampaign.name}</h2>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                {(() => { const sc = statusColor(selectedCampaign); return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontWeight: 500 }}>{statusLabel(selectedCampaign)}</span> })()}
                <span style={{ fontSize: 12, color: T.textTertiary }}>{leads.length} leads</span>
              </div>

              {/* Stats bar */}
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Sent', value: stats.sent || stats.emailsSent || 0 },
                    { label: 'Opened', value: stats.opened || stats.emailsOpened || 0, rate: pct(stats.opened || stats.emailsOpened || 0, stats.sent || stats.emailsSent || 1) },
                    { label: 'Clicked', value: stats.clicked || stats.emailsClicked || 0, rate: pct(stats.clicked || stats.emailsClicked || 0, stats.sent || stats.emailsSent || 1) },
                    { label: 'Replied', value: stats.replied || stats.emailsReplied || 0, rate: pct(stats.replied || stats.emailsReplied || 0, stats.sent || stats.emailsSent || 1), accent: true },
                    { label: 'Bounced', value: stats.bounced || stats.emailsBounced || 0, danger: true },
                    { label: 'Interested', value: stats.interested || 0, accent: true },
                  ].map(s => (
                    <div key={s.label} style={statCard}>
                      <span style={{ fontSize: 10, color: 'rgba(255,224,194,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: s.danger && s.value > 0 ? 'rgba(255,59,48,0.8)' : s.accent && s.value > 0 ? 'rgba(6,214,160,0.8)' : 'rgba(238,232,220,0.70)' }}>{s.value}{s.rate !== undefined ? <span style={{ fontSize: 11, fontWeight: 400, color: T.textTertiary, marginLeft: 4 }}>{s.rate}%</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scrollable content: sequence + leads */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px' }}>

              {/* Sequence flow */}
              {sequenceSteps.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={sectionTitle}>Sequence Flow</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 20 }}>
                    {/* Vertical line */}
                    <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 1, background: 'rgba(255,224,194,0.06)' }} />
                    {sequenceSteps.map((step, idx) => (
                      <div key={step._id || idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: -17, top: 12, width: 10, height: 10, borderRadius: '50%', background: '#111114', border: '2px solid rgba(255,224,194,0.4)', zIndex: 1 }} />
                        <div style={{ flex: 1, ...card, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            {stepIcon(step.type)}
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(238,232,220,0.60)', textTransform: 'capitalize' }}>{step.type === 'linkedin' ? 'LinkedIn Message' : step.type === 'email' ? 'Email' : 'Action'}</span>
                            <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 'auto' }}>Step {step.stepNumber} · {step.count} sent</span>
                          </div>
                          {step.subject && <div style={{ fontSize: 13, color: 'rgba(255,224,194,0.55)', marginTop: 4 }}>Subject: {step.subject}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leads list */}
              <div>
                <p style={sectionTitle}><Users size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 6 }} />Leads ({leads.length})</p>
                {leads.length === 0 && <div style={{ fontSize: 13, color: T.textTertiary, fontWeight: 300, padding: 12 }}>No leads in this campaign</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {leads.map((lead, idx) => {
                    const isSelected = selectedLead?.email === lead.email
                    const lastType = (lead.lastType || '').replace(/([A-Z])/g, ' $1').trim()
                    const isReply = (lead.lastType || '').toLowerCase().includes('replied')
                    const isBounce = (lead.lastType || '').toLowerCase().includes('bounced')
                    return (
                      <div key={lead._id || idx} onClick={() => selectLead(lead)} style={{
                        ...card, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        background: isSelected ? 'rgba(255,224,194,0.06)' : card.background,
                        borderColor: isSelected ? 'rgba(255,224,194,0.15)' : 'rgba(25,25,25,0.40)',
                      }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(25,25,25,0.40)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(25,25,25,0.30)' }}
                      >
                        <CompanyLogo name={lead.companyName || lead.firstName} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(238,232,220,0.70)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lead.firstName || ''} {lead.lastName || ''}{lead.companyName ? ` · ${lead.companyName}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.email}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, fontWeight: 500, textTransform: 'capitalize',
                            background: isReply ? 'rgba(6,214,160,0.08)' : isBounce ? 'rgba(255,59,48,0.08)' : 'rgba(25,25,25,0.40)',
                            color: isReply ? 'rgba(6,214,160,0.7)' : isBounce ? 'rgba(255,59,48,0.7)' : T.textTertiary,
                          }}>{lastType || 'active'}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,224,194,0.25)' }}>{lead.activities} events · {timeAgo(lead.lastActivity)}</span>
                        </div>
                        <ChevronRight size={14} style={{ color: 'rgba(255,224,194,0.15)', flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ RIGHT PANEL — Lead Activity Detail ═══ */}
      {selectedLead && (
        <div style={{ width: 380, borderLeft: '1px solid rgba(25,25,25,0.40)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'rgba(238,238,238,0.01)' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(25,25,25,0.40)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{selectedLead.firstName || ''} {selectedLead.lastName || ''}</div>
              <div style={{ fontSize: 12, color: T.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLead.email}{selectedLead.companyName ? ` · ${selectedLead.companyName}` : ''}</div>
            </div>
            <button onClick={() => setSelectedLead(null)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(25,25,25,0.40)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,224,194,0.35)' }}>
              <X size={14} />
            </button>
          </div>

          {/* Activity timeline */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            <p style={sectionTitle}>Activity Timeline</p>
            {leadActivities.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: T.textTertiary, fontSize: 13 }}>No activities recorded for this lead</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 20 }}>
                <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: 'rgba(25,25,25,0.40)' }} />
                {leadActivities.map((a, i) => {
                  const typeLabel = (a.type || 'unknown').replace(/([A-Z])/g, ' $1').trim()
                  const isReply = (a.type || '').toLowerCase().includes('replied')
                  const isSent = (a.type || '').toLowerCase().includes('sent')
                  return (
                    <div key={a._id || i} style={{ display: 'flex', gap: 10, padding: '8px 0', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -17, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#111114', border: `2px solid ${isReply ? 'rgba(6,214,160,0.5)' : 'rgba(255,224,194,0.3)'}`, zIndex: 1 }} />
                      <div style={{ flex: 1, ...card, padding: '10px 12px', background: isReply ? 'rgba(6,214,160,0.03)' : card.background, borderColor: isReply ? 'rgba(6,214,160,0.1)' : 'rgba(25,25,25,0.40)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          {activityIcon(a.type)}
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,224,194,0.55)', textTransform: 'capitalize' }}>{typeLabel}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,224,194,0.15)', marginLeft: 'auto' }}>{a.createdAt ? new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        {/* Subject line if available */}
                        {a.subject && <div style={{ fontSize: 12, color: 'rgba(238,238,238,0.45)', marginBottom: 2 }}>Subject: {a.subject}</div>}
                        {/* Campaign name */}
                        {a.campaignName && <div style={{ fontSize: 11, color: 'rgba(255,224,194,0.25)' }}>{a.campaignName}</div>}
                        {/* Message content if sent/replied */}
                        {(isSent || isReply) && a.text && (
                          <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(25,25,25,0.30)', border: '0.5px solid rgba(32,30,24,0.50)', fontSize: 12, color: 'rgba(255,224,194,0.45)', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {a.text}
                          </div>
                        )}
                        {(isSent || isReply) && a.html && !a.text && (
                          <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(25,25,25,0.30)', border: '0.5px solid rgba(32,30,24,0.50)', fontSize: 12, color: 'rgba(255,224,194,0.45)', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto' }}
                            dangerouslySetInnerHTML={{ __html: a.html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') }} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
