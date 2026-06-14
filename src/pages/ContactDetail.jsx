import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Mail, Linkedin, Building2, Clock, Edit3, ExternalLink, Send, CalendarCheck, ChevronRight } from 'lucide-react'
import DocumentSection from '@/components/documents/DocumentSection'
import EmailDraft from '@/components/kiko/EmailDraft'
import { ConflictBadge } from '@/hooks/usePartnershipConflict'
import { setPageContext } from '@/lib/pageContext'

export default function ContactDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [activities, setActivities] = useState([])
  const [orgId, setOrgId] = useState(null)
  const [dealInfo, setDealInfo] = useState(null)
  const [campaignHistory, setCampaignHistory] = useState([])
  const [companyData, setCompanyData] = useState(null)
  const [rightPanel, setRightPanel] = useState('overview') // overview | email | linkedin | edit
  const [kikoDraft, setKikoDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('id, data, updated_at').eq('id', id).single()
    if (data) {
      const c = { id: data.id, ...data.data, updated_at: data.updated_at }
      setContact(c)
      setForm({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', title: c.title || '', linkedin: c.linkedin || '', notes: c.notes || '' })
      setPageContext({ page: 'contact_detail', summary: `Viewing ${c.firstName || ''} ${c.lastName || ''} — ${c.title || ''} at ${c.company || ''}`, contact: { name: `${c.firstName || ''} ${c.lastName || ''}`, company: c.company, email: c.email, title: c.title } })

      // Find linked organisation + company data
      if (c.companyId) {
        setOrgId(c.companyId)
        const { data: compRow } = await supabase.from('companies').select('id, data').eq('id', c.companyId).single()
        if (compRow) setCompanyData(compRow.data)
      } else if (c.company) {
        const { data: orgs } = await supabase.from('companies').select('id, data')
          .filter('data->>name', 'eq', c.company).limit(1)
        if (orgs && orgs.length > 0) { setOrgId(orgs[0].id); setCompanyData(orgs[0].data) }
      }

      // Load activities
      const { data: acts } = await supabase.from('contact_activities')
        .select('*').eq('contact_id', data.id)
        .order('created_at', { ascending: false }).limit(50)
      setActivities(acts || [])

      // Load deal info for this company
      if (c.company) {
        const { data: dealRows } = await supabase.from('deals').select('data')
          .filter('data->>company', 'eq', c.company).limit(1)
        if (dealRows && dealRows.length > 0) setDealInfo(dealRows[0].data)
      }

      // Load campaign history — every campaign that has ever included this contact
      // (links via campaign_targets.contact_id which is set when build-campaign sources
      // from CRM in v0.0.21+). Plus campaigns where the contact's email matches as a
      // fallback for older campaigns built before contact_id was wired.
      const { data: byContactId } = await supabase.from('campaign_targets')
        .select('id, campaign_id, decision_maker_email, verification_status, created_at, kiko_sequences(name, is_active)')
        .eq('contact_id', data.id)
      const { data: byEmail } = c.email ? await supabase.from('campaign_targets')
        .select('id, campaign_id, decision_maker_email, verification_status, created_at, kiko_sequences(name, is_active)')
        .eq('decision_maker_email', c.email)
        .is('contact_id', null) : { data: [] }
      const allCampaigns = [...(byContactId || []), ...(byEmail || [])]
      // Dedupe by campaign_id (keep most recent)
      const seen = new Set()
      const unique = []
      for (const ct of allCampaigns) {
        if (seen.has(ct.campaign_id)) continue
        seen.add(ct.campaign_id)
        unique.push(ct)
      }
      setCampaignHistory(unique)
    }
    setLoading(false)
  }

  const save = async () => {
    if (!contact) return
    const now = new Date().toISOString()
    const existing = { ...contact }
    delete existing.id; delete existing.updated_at
    const merged = { ...existing, ...form }
    await supabase.from('contacts').update({ data: merged, updated_at: now }).eq('id', id)
    setEditing(false)
    load()
  }

  // Strip emoji + symbol prefixes, parse "{emoji} First Last" patterns from corrupted scraped data
  function cleanName(s) {
    if (!s) return ''
    // Remove leading emoji/symbols/punctuation, keep letters/spaces/hyphens/apostrophes
    return s.replace(/^[^\p{L}]+/u, '').trim()
  }
  function parseDisplayName(c) {
    let first = cleanName(c.firstName || '')
    let last = cleanName(c.lastName || '')
    // If firstName empty but lastName looks like full name, split it
    if (!first && last && last.includes(' ')) {
      const parts = last.split(/\s+/)
      first = parts[0]
      last = parts.slice(1).join(' ')
    }
    return { first, last }
  }
  const displayName = (c) => {
    const { first, last } = parseDisplayName(c)
    return [first, last].filter(Boolean).join(' ') || 'Unnamed'
  }

  const daysAgo = (dateStr) => {
    if (!dateStr) return null
    const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 30) return `${diff}d ago`
    if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
    return `${Math.floor(diff / 365)}y ago`
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  // Derive active/past campaigns from activities
  const campaignMap = {}
  activities.forEach(a => {
    if (a.campaign_name) {
      if (!campaignMap[a.campaign_name]) campaignMap[a.campaign_name] = { name: a.campaign_name, events: 0, lastEvent: a.created_at }
      campaignMap[a.campaign_name].events++
      if (a.created_at > campaignMap[a.campaign_name].lastEvent) campaignMap[a.campaign_name].lastEvent = a.created_at
    }
  })
  const campaigns = Object.values(campaignMap).sort((a, b) => b.lastEvent.localeCompare(a.lastEvent))
  // Also include campaign stored on contact data
  const storedCampaign = contact?.lastCampaign
  if (storedCampaign && !campaignMap[storedCampaign]) {
    campaigns.unshift({ name: storedCampaign, events: 0, lastEvent: null })
  }

  // Derive correspondence
  const sentActivities = activities.filter(a => ['emailsSent', 'linkedinSent', 'linkedinInviteDone'].includes(a.type))
  const receivedActivities = activities.filter(a => ['emailsReplied', 'linkedinReplied', 'emailsOpened', 'emailsClicked'].includes(a.type))
  const lastSent = sentActivities[0]
  const lastReceived = receivedActivities[0]

  // Derive preferred channel from interaction counts
  const emailInteractions = activities.filter(a => a.type?.startsWith('emails')).length
  const linkedinInteractions = activities.filter(a => a.type?.startsWith('linkedin')).length
  const preferredChannel = emailInteractions + linkedinInteractions > 0
    ? (linkedinInteractions > emailInteractions ? 'LinkedIn' : 'Email')
    : (contact?.preferredContact || 'Email')

  // Derive next task due
  const hasReply = activities.some(a => ['emailsReplied', 'linkedinReplied'].includes(a.type))
  const lastActivityDate = contact?.lastActivity ? new Date(contact.lastActivity) : null
  const daysSinceActivity = lastActivityDate ? Math.floor((new Date() - lastActivityDate) / 86400000) : null

  let nextTask = null
  if (hasReply) {
    nextTask = { label: 'Follow up on reply', channel: preferredChannel, urgency: 'high' }
  } else if (daysSinceActivity !== null && daysSinceActivity > 14) {
    nextTask = { label: 'Re-engagement follow-up', channel: preferredChannel, urgency: daysSinceActivity > 30 ? 'overdue' : 'due' }
  } else if (daysSinceActivity !== null && daysSinceActivity > 7) {
    nextTask = { label: 'Check-in follow-up', channel: preferredChannel, urgency: 'upcoming' }
  }

  const activityLabel = (type) => {
    const map = {
      emailsSent: 'Email sent', emailsOpened: 'Email opened', emailsClicked: 'Link clicked',
      emailsReplied: 'Email reply received', emailsBounced: 'Email bounced', emailsUnsubscribed: 'Unsubscribed',
      emailsInterested: 'Marked interested', emailsNotInterested: 'Marked not interested',
      linkedinSent: 'LinkedIn message sent', linkedinReplied: 'LinkedIn reply', linkedinInviteDone: 'LinkedIn invite sent',
      linkedinVisitDone: 'LinkedIn profile visited', linkedinOpened: 'LinkedIn message opened',
      linkedinInterested: 'Interested (LinkedIn)', linkedinNotInterested: 'Not interested (LinkedIn)',
    }
    return map[type] || type
  }


  // ── Draft with Kiko ──
  const handleDraftWithKiko = async () => {
    setDraftLoading(true)
    setRightPanel('email')
    try {
      const res = await fetch('https://api.vanhawke.agency/api/contact/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contact.email || '',
          name: displayName(contact),
          title: contact.title || '',
          company: contact.company || '',
          sector: contact.sector || contact.industry || '',
        })
      })
      const d = await res.json()
      if (d && !d.error) {
        setKikoDraft(`Subject: ${d.subject || ''}
To: ${contact.email || ''}

${d.body || ''}`)
      } else {
        setKikoDraft(`Subject: 
To: ${contact.email || ''}

[Kiko could not draft this: ${d?.error || 'unknown error'}]`)
      }
    } catch (e) { console.error('Draft failed:', e); setKikoDraft(`[Draft failed: ${e.message}]`) }
    setDraftLoading(false)
  }

  // ── Engagement score (computed from activities) ──
  const opens = activities.filter(a => a.type === 'emailsOpened').length
  const clicks = activities.filter(a => a.type === 'emailsClicked').length
  const replies = activities.filter(a => ['emailsReplied', 'linkedinReplied'].includes(a.type)).length
  const liInteractions = activities.filter(a => a.type?.startsWith('linkedin')).length
  const engagementScore = Math.min(100, Math.round((opens * 5) + (clicks * 15) + (replies * 40) + (liInteractions * 10)))
  const warmthLabel = engagementScore >= 60 ? 'Hot' : engagementScore >= 30 ? 'Warm' : 'Cold'
  const warmthColor = engagementScore >= 60 ? '#7d8a64' : engagementScore >= 30 ? '#B89C5C' : '#5A6470'

  // ── Styles (Legora tokens) ──
  const F = "'Source Serif 4', Georgia, serif"
  const sh = { fontFamily: F, fontWeight: 300, fontSize: 16, letterSpacing: '-0.01em', margin: '0 0 10px', color: '#0A0A0A' }
  const crd = { background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '2px 0', marginBottom: 16 }
  const field = { display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }
  const fl = { fontSize: 11, color: '#A0A0A0' }
  const fv = { fontSize: 12, fontWeight: 450 }
  const sig = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }
  const sigI = (bg) => ({ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0, background: bg })
  const inputSt = { width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 450, outline: 'none', boxSizing: 'border-box' }
  const labelSt = { fontSize: 11, fontWeight: 500, color: '#A0A0A0', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div style={{ color: '#A0A0A0', fontSize: 13 }}>Loading…</div></div>
  if (!contact) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><p style={{ fontSize: 13, color: '#A0A0A0' }}>Contact not found</p><button onClick={() => nav('/records')} style={{ fontSize: 12, color: '#0A0A0A', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>Back to Records</button></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", color: '#0A0A0A', background: '#FEFEFC' }}>
      {/* ═══ Header ═══ */}
      <div style={{ padding: '14px 44px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => nav('/records')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ArrowLeft size={18} stroke="#6B6B6B" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {contact.picture ? (
              <img src={contact.picture} alt="" referrerPolicy="no-referrer" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'grid') }} />
            ) : null}
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F5F4F1', display: contact.picture ? 'none' : 'grid', placeItems: 'center', fontSize: 15, fontWeight: 400, color: '#6B6B6B' }}>{((contact.firstName || contact.name || '?')[0] || '?').toUpperCase()}{((contact.lastName || '')[0] || '').toUpperCase()}</div>
            <div>
              <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 22, letterSpacing: '-0.015em', margin: 0 }}>{displayName(contact)}</h1>
              <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>{contact.title}{contact.title && contact.company ? ' at ' : ''}{contact.company}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            { id: 'overview', label: 'Overview', icon: <Building2 size={12} />, style: {} },
            { id: 'email', label: 'Email', icon: <Mail size={12} />, style: {} },
            { id: 'linkedin', label: 'LinkedIn', icon: <Linkedin size={12} />, style: { background: rightPanel === 'linkedin' ? 'rgba(0,119,181,0.12)' : 'rgba(0,119,181,0.06)', border: rightPanel === 'linkedin' ? '1px solid rgba(0,119,181,0.3)' : '1px solid rgba(0,119,181,0.15)', color: '#0077B5' } },
          ].map(b => (
            <button key={b.id} onClick={() => { setRightPanel(b.id); if (b.id !== 'edit') setEditing(false) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: rightPanel === b.id && b.id !== 'linkedin' ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)', border: rightPanel === b.id && b.id !== 'linkedin' ? '1px solid rgba(0,0,0,0.14)' : '1px solid rgba(0,0,0,0.08)', color: rightPanel === b.id && b.id !== 'linkedin' ? '#0A0A0A' : '#6B6B6B', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', ...b.style }}>
              {b.icon} {b.label}
            </button>
          ))}
          <button onClick={() => { setRightPanel('edit'); setEditing(true) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: '#0A0A0A', color: '#fff', border: '1px solid #0A0A0A', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Edit3 size={12} /> Edit
          </button>
        </div>
      </div>

      {/* ═══ Content — two-column: left = metrics/info, right = dynamic panel ═══ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 44px', display: 'flex', gap: 20 }}>

        {/* ── LEFT COLUMN: metrics, Kiko action, contact info ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Metric tiles */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: F, fontSize: 22, fontWeight: 300, color: engagementScore < 30 ? '#b8643e' : engagementScore < 60 ? '#B89C5C' : '#7d8a64' }}>{engagementScore}</div>
              <div style={{ fontSize: 10, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginTop: 6 }}>Engagement</div>
              <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 4 }}>{opens} open{opens !== 1 ? 's' : ''} · {replies} repl{replies !== 1 ? 'ies' : 'y'}</div>
            </div>
            <div style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: F, fontSize: 22, fontWeight: 300, color: warmthColor }}>{warmthLabel}</div>
              <div style={{ fontSize: 10, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginTop: 6 }}>Warmth</div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 6, overflow: 'hidden' }}><div style={{ height: '100%', width: `${engagementScore}%`, borderRadius: 2, background: warmthColor }} /></div>
            </div>
            <div style={{ flex: 1, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: F, fontSize: 22, fontWeight: 300 }}>{daysSinceActivity !== null ? daysAgo(contact.lastActivity) : '—'}</div>
              <div style={{ fontSize: 10, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginTop: 6 }}>Since contact</div>
              {daysSinceActivity > 30 && <div style={{ fontSize: 10, color: '#b8643e', marginTop: 4 }}>Overdue</div>}
            </div>
          </div>

          {/* Suggested next action */}
          {nextTask && (
            <>
              <h2 style={sh}>Suggested next action <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: 'rgba(125,138,100,0.12)', color: '#7d8a64', marginLeft: 6, fontFamily: "'Inter', sans-serif" }}>Kiko</span></h2>
              <div style={{ background: '#fff', border: '1.5px solid rgba(125,138,100,0.3)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={sigI('rgba(125,138,100,0.10)')}><ExternalLink size={12} color="#7d8a64" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>{nextTask.label}</div>
                  <div style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 }}>
                    {hasReply ? `${displayName(contact)} replied — follow up via ${preferredChannel.toLowerCase()}.` :
                     daysSinceActivity > 30 ? `No activity for ${daysAgo(contact.lastActivity)}. Fresh approach via ${preferredChannel.toLowerCase()}${companyData?.totalFunding ? `, referencing ${contact.company}'s ${companyData.totalFunding} funding` : ''}.` :
                     `Check-in via ${preferredChannel.toLowerCase()} to maintain momentum.`}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button onClick={handleDraftWithKiko} disabled={draftLoading} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: draftLoading ? 0.5 : 1 }}>{draftLoading ? 'Drafting...' : 'Draft with Kiko'}</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Contact information */}
          <h2 style={sh}>Contact information</h2>
          <div style={crd}>
            <div style={field}><span style={fl}>Email</span><span style={fv}>{contact.email ? <a href={`mailto:${contact.email}`} style={{ color: '#0077B5', textDecoration: 'none', fontSize: 12 }}>{contact.email}</a> : '—'}</span></div>
            <div style={field}><span style={fl}>Phone</span><span style={fv}>{contact.phone || '—'}</span></div>
            <div style={field}><span style={fl}>Company</span><span style={fv}>{contact.company || '—'}</span></div>
            <div style={field}><span style={fl}>Title</span><span style={fv}>{contact.title || '—'}</span></div>
            <div style={field}><span style={fl}>Sector</span><span style={fv}>{contact.sector || contact.industry || '—'}</span></div>
            <div style={field}><span style={fl}>LinkedIn</span><span style={fv}>{(contact.linkedin || contact.linkedinUrl) ? <a href={contact.linkedin || contact.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0077B5', textDecoration: 'none', fontSize: 12 }}>View profile</a> : '—'}</span></div>
            <div style={{ ...field, borderBottom: 'none' }}><span style={fl}>Preferred channel</span><span style={fv}>{preferredChannel}</span></div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: dynamic panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* OVERVIEW panel */}
          {rightPanel === 'overview' && (<>
            {companyData && (<>
              <h2 style={sh}>Company context</h2>
              <div onClick={() => orgId && nav(`/records/company/${orgId}`)} style={{ padding: '10px 14px', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, marginBottom: 16, cursor: orgId ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{companyData.name || contact.company}</span>
                  {orgId && <ChevronRight size={12} color="#A0A0A0" />}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[{ l: 'Industry', v: companyData.industry || companyData.sector }, { l: 'Funding', v: companyData.totalFunding }, { l: 'Revenue', v: companyData.revenueEst }, { l: 'Headcount', v: companyData.employees || companyData.size }].map(s => s.v ? (
                    <div key={s.l}><div style={{ fontSize: 10, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{s.l}</div><div style={{ fontSize: 12, marginTop: 2 }}>{s.v}</div></div>
                  ) : null)}
                </div>
              </div>
            </>)}

            <h2 style={sh}>Correspondence history</h2>
            <div style={{ ...crd, padding: '4px 0' }}>
              {activities.filter(a => ['emailsSent', 'emailsReplied', 'emailsOpened', 'emailsBounced', 'linkedinSent', 'linkedinReplied', 'linkedinInviteDone'].includes(a.type)).slice(0, 10).length > 0 ? activities.filter(a => ['emailsSent', 'emailsReplied', 'emailsOpened', 'emailsBounced', 'linkedinSent', 'linkedinReplied', 'linkedinInviteDone'].includes(a.type)).slice(0, 10).map((a, i) => {
                const isReply = a.type?.includes('Replied')
                const isLinkedin = a.type?.startsWith('linkedin')
                const isBounce = a.type?.includes('Bounced')
                const dotColor = isReply ? '#7d8a64' : isLinkedin ? '#0077B5' : isBounce ? '#b8643e' : '#0A0A0A'
                return (
                  <div key={a.id || i} style={sig}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{activityLabel(a.type)}</span>
                        <span style={{ fontSize: 10, color: '#A0A0A0' }}>{formatDate(a.created_at)}</span>
                      </div>
                      {a.campaign_name && <div style={{ marginTop: 4 }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', color: '#6B6B6B', fontWeight: 500 }}>{a.campaign_name}</span></div>}
                    </div>
                  </div>
                )
              }) : <div style={{ padding: 14, color: '#A0A0A0', fontSize: 12, textAlign: 'center' }}>No correspondence logged yet</div>}
            </div>

            <h2 style={sh}>Campaign enrollment</h2>
            <div style={{ ...crd, padding: '4px 0' }}>
              {campaigns.length > 0 ? campaigns.map(c => (
                <div key={c.name} style={sig}>
                  <div style={sigI('rgba(125,138,100,0.10)')}><Send size={12} color="#7d8a64" /></div>
                  <div><div style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</div><div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{c.events} event{c.events !== 1 ? 's' : ''}{c.lastEvent ? ` · Last: ${formatDate(c.lastEvent)}` : ''}</div></div>
                </div>
              )) : <div style={{ padding: 14, color: '#A0A0A0', fontSize: 12, textAlign: 'center' }}>No campaigns yet</div>}
            </div>

            <DocumentSection linkedCompanyId={orgId} companyName={contact?.company} entityLabel="Documents shared" />

            <h2 style={{ ...sh, marginTop: 16 }}>Activity & tasks</h2>
            <div style={{ ...crd, padding: '4px 0' }}>
              {nextTask && (
                <div style={sig}>
                  <div style={sigI('rgba(184,100,62,0.10)')}><CalendarCheck size={12} color="#b8643e" /></div>
                  <div><div style={{ fontSize: 12, fontWeight: 500, color: nextTask.urgency === 'overdue' ? '#b8643e' : '#0A0A0A' }}>{nextTask.label}</div><div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{nextTask.channel} · Last: {contact.lastActivity ? formatDate(contact.lastActivity) : '—'}</div></div>
                </div>
              )}
              <div style={{ ...sig, borderBottom: 'none' }}>
                <div style={sigI('rgba(0,0,0,0.04)')}><Clock size={12} color="#6B6B6B" /></div>
                <div><div style={{ fontSize: 12, fontWeight: 500 }}>Preferred channel: {preferredChannel}</div><div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{emailInteractions + linkedinInteractions} touchpoint{emailInteractions + linkedinInteractions !== 1 ? 's' : ''}</div></div>
              </div>
            </div>
          </>)}

          {/* EMAIL panel — reuses existing EmailDraft component */}
          {rightPanel === 'email' && (
            <div>
              <h2 style={sh}>Compose email</h2>
              {draftLoading ? (
                <div style={{ ...crd, padding: '40px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#7d8a64' }}>Kiko is drafting...</div>
                </div>
              ) : kikoDraft ? (
                <EmailDraft text={kikoDraft} defaultTo={contact.email} defaultSender={null} />
              ) : (
                <EmailDraft text={`Subject: \nTo: ${contact.email || ''}\n\n`} defaultTo={contact.email} defaultSender={null} />
              )}
            </div>
          )}

          {/* LINKEDIN panel */}
          {rightPanel === 'linkedin' && (
            <div>
              <h2 style={{ ...sh, color: '#0077B5' }}>LinkedIn</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <a href={contact.linkedin || contact.linkedinUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '14px', background: '#fff', border: '1px solid rgba(0,119,181,0.15)', borderRadius: 14, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', color: '#0A0A0A' }}>
                  <ExternalLink size={18} color="#0077B5" style={{ marginBottom: 4 }} />
                  <div style={{ fontSize: 11, fontWeight: 500 }}>View profile</div>
                  <div style={{ fontSize: 10, color: '#6B6B6B' }}>Opens new tab</div>
                </a>
                <div onClick={() => { setRightPanel('email'); setKikoDraft(null) }} style={{ flex: 1, padding: '14px', background: 'rgba(0,119,181,0.04)', border: '1.5px solid rgba(0,119,181,0.2)', borderRadius: 14, cursor: 'pointer', textAlign: 'center' }}>
                  <Send size={18} color="#0077B5" style={{ marginBottom: 4 }} />
                  <div style={{ fontSize: 11, fontWeight: 500 }}>Draft message</div>
                  <div style={{ fontSize: 10, color: '#6B6B6B' }}>Via Matt's account · tracked</div>
                </div>
              </div>
              {(contact.linkedin || contact.linkedinUrl) && (
                <div style={crd}>
                  <div style={field}><span style={fl}>LinkedIn URL</span><span style={fv}><a href={contact.linkedin || contact.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0077B5', textDecoration: 'none', fontSize: 12 }}>{(contact.linkedin || contact.linkedinUrl || '').replace('https://www.linkedin.com/in/', '')}</a></span></div>
                  <div style={{ ...field, borderBottom: 'none' }}><span style={fl}>Connection status</span><span style={fv}>{activities.some(a => a.type === 'linkedinInviteDone') ? 'Connected' : 'Not connected'}</span></div>
                </div>
              )}
            </div>
          )}

          {/* EDIT panel */}
          {rightPanel === 'edit' && editing && (
            <div>
              <h2 style={sh}>Edit contact</h2>
              <div style={{ ...crd, padding: '16px 14px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}><p style={labelSt}>First name</p><input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} style={inputSt} /></div>
                  <div style={{ flex: 1 }}><p style={labelSt}>Last name</p><input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} style={inputSt} /></div>
                </div>
                {[{ key: 'title', label: 'Job title' }, { key: 'company', label: 'Company' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'linkedin', label: 'LinkedIn URL' }].map(f => (
                  <div key={f.key} style={{ marginBottom: 10 }}><p style={labelSt}>{f.label}</p><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputSt} /></div>
                ))}
                <div style={{ marginBottom: 10 }}><p style={labelSt}>Notes</p><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputSt, resize: 'none' }} /></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={save} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Save changes</button>
                  <button onClick={() => { setEditing(false); setRightPanel('overview') }} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#6B6B6B', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
