import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Mail, Phone, Linkedin, Building2, Clock, Edit3, X, ExternalLink, Send, Inbox, CalendarCheck, ChevronRight } from 'lucide-react'

export default function ContactDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [activities, setActivities] = useState([])
  const [orgId, setOrgId] = useState(null)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('id, data, updated_at').eq('id', id).single()
    if (data) {
      const c = { id: data.id, ...data.data, updated_at: data.updated_at }
      setContact(c)
      setForm({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', title: c.title || '', linkedin: c.linkedin || '', notes: c.notes || '' })

      // Find linked organisation
      if (c.companyId) {
        setOrgId(c.companyId)
      } else if (c.company) {
        const { data: orgs } = await supabase.from('companies').select('id, data')
          .filter('data->>name', 'eq', c.company).limit(1)
        if (orgs && orgs.length > 0) setOrgId(orgs[0].id)
      }

      // Load activities
      const { data: acts } = await supabase.from('contact_activities')
        .select('*').eq('contact_id', data.id)
        .order('created_at', { ascending: false }).limit(50)
      setActivities(acts || [])
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

  const displayName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed'

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

  const urgencyColor = (u) => u === 'overdue' ? '#ef4444' : u === 'high' ? '#f59e0b' : u === 'due' ? '#3b82f6' : 'var(--text-tertiary)'

  const glass = { background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)' }
  const card = { background: '#FFFFFF', borderRadius: 16, padding: 24, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const sectionTitle = { fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const emptyText = { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', fontStyle: 'italic' }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 24, height: 24, border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
  if (!contact) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}><p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>Contact not found</p><button onClick={() => nav('/contacts')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>Back to Contacts</button></div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 8 }}>
      {/* Glass toolbar */}
      <div style={{ margin: '0 16px', padding: '10px 20px', borderRadius: 16, ...glass, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => nav('/contacts')} style={{ background: 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{displayName(contact)}</h1>
            {contact.title && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{contact.title}</p>}
          </div>
        </div>
        <button onClick={() => setEditing(!editing)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, background: editing ? 'transparent' : 'var(--accent)', color: editing ? 'var(--text-secondary)' : '#fff', padding: '6px 14px', borderRadius: 8, border: editing ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          {editing ? <><X style={{ width: 14, height: 14 }} /> Cancel</> : <><Edit3 style={{ width: 14, height: 14 }} /> Edit</>}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left column */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar + name card */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {contact.picture ? (
                <img src={contact.picture} alt="" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{(contact.firstName || contact.lastName || '?')[0]?.toUpperCase()}</span>
                </div>
              )}
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{displayName(contact)}</p>
                {contact.title && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{contact.title}</p>}
                {contact.company && (
                  <p onClick={() => orgId && nav(`/organisations?org=${orgId}`)} style={{ fontSize: 12, color: orgId ? 'var(--accent)' : 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4, cursor: orgId ? 'pointer' : 'default' }}>
                    <Building2 style={{ width: 11, height: 11 }} /> {contact.company} {orgId && <ChevronRight style={{ width: 10, height: 10 }} />}
                  </p>
                )}
              </div>
            </div>
            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {contact.email && <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}><Mail style={{ width: 13, height: 13 }} /> Email</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}><Phone style={{ width: 13, height: 13 }} /> Call</a>}
              {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}><Linkedin style={{ width: 13, height: 13 }} /> LinkedIn</a>}
            </div>
          </div>

          {/* Tasks Due */}
          <div style={card}>
            <p style={sectionTitle}>Tasks Due</p>
            {nextTask ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, border: `1px solid ${urgencyColor(nextTask.urgency)}20` }}>
                <CalendarCheck style={{ width: 16, height: 16, color: urgencyColor(nextTask.urgency), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{nextTask.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{nextTask.channel} · {nextTask.urgency === 'overdue' ? 'Overdue' : nextTask.urgency === 'high' ? 'High priority' : nextTask.urgency === 'due' ? 'Due soon' : 'Upcoming'}</p>
                </div>
              </div>
            ) : (
              <p style={emptyText}>No tasks due</p>
            )}
          </div>

          {/* Activity info */}
          <div style={card}>
            <p style={sectionTitle}>Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contact.lastActivity && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                  <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                  Last activity: {daysAgo(contact.lastActivity)} ({formatDate(contact.lastActivity)})
                </div>
              )}
              {contact.createdAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                  <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                  Created: {formatDate(contact.createdAt)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                <ExternalLink style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                Preferred Contact Channel: <strong>{preferredChannel}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Contact details / edit form */}
          <div style={card}>
            {editing ? (
              <>
                <p style={{ ...sectionTitle, marginBottom: 16 }}>Edit Contact</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}><p style={labelStyle}>First Name</p><input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} style={inputStyle} /></div>
                    <div style={{ flex: 1 }}><p style={labelStyle}>Last Name</p><input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} style={inputStyle} /></div>
                  </div>
                  {[{ key: 'title', label: 'Job Title' }, { key: 'company', label: 'Company' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'linkedin', label: 'LinkedIn URL' }].map(f => (
                    <div key={f.key}><p style={labelStyle}>{f.label}</p><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} /></div>
                  ))}
                  <div><p style={labelStyle}>Notes</p><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} /></div>
                  <button onClick={save} style={{ alignSelf: 'flex-end', fontSize: 13, fontWeight: 500, background: 'var(--accent)', color: '#fff', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>Save Changes</button>
                </div>
              </>
            ) : (
              <>
                <p style={sectionTitle}>Contact Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {[
                    { label: 'First Name', value: contact.firstName },
                    { label: 'Last Name', value: contact.lastName },
                    { label: 'Job Title', value: contact.title },
                    { label: 'Company', value: contact.company, onClick: orgId ? () => nav(`/organisations?org=${orgId}`) : null },
                    { label: 'Email', value: contact.email, link: contact.email ? `mailto:${contact.email}` : null },
                    { label: 'Phone', value: contact.phone, link: contact.phone ? `tel:${contact.phone}` : null },
                    { label: 'LinkedIn', value: contact.linkedin ? 'View Profile' : null, link: contact.linkedin },
                    { label: 'Preferred Contact Channel', value: preferredChannel },
                  ].map(f => (
                    <div key={f.label}>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{f.label}</p>
                      {f.link ? (
                        <a href={f.link} target={f.link?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font)', textDecoration: 'none' }}>{f.value || '—'}</a>
                      ) : f.onClick ? (
                        <p onClick={f.onClick} style={{ fontSize: 13, color: 'var(--accent)', margin: 0, fontFamily: 'var(--font)', cursor: 'pointer' }}>{f.value || '—'}</p>
                      ) : (
                        <p style={{ fontSize: 13, color: f.value ? 'var(--text)' : 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font)' }}>{f.value || '—'}</p>
                      )}
                    </div>
                  ))}
                </div>
                {contact.notes && contact.notes !== '[]' && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <p style={{ ...labelStyle, marginBottom: 8 }}>Notes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{contact.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Active Campaign */}
          <div style={card}>
            <p style={sectionTitle}>Active Campaign</p>
            {campaigns.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaigns.slice(0, 1).map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(59,130,246,0.04)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.1)' }}>
                    <Send style={{ width: 14, height: 14, color: '#3b82f6', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{c.name}</p>
                      {c.lastEvent && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>Last event: {daysAgo(c.lastEvent)} · {c.events} event{c.events !== 1 ? 's' : ''}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : contact?.outreachStatus ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)', margin: 0 }}>{contact.outreachStatus}</p>
            ) : (
              <p style={emptyText}>No active campaign</p>
            )}
          </div>

          {/* Campaign History */}
          <div style={card}>
            <p style={sectionTitle}>Campaign History</p>
            {campaigns.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {campaigns.map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font)' }}>{c.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.events > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>{c.events} events</span>}
                      {c.lastEvent && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>{formatDate(c.lastEvent)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={emptyText}>No campaign history yet — data will appear as Lemlist events flow in</p>
            )}
          </div>

          {/* Correspondence */}
          <div style={card}>
            <p style={sectionTitle}>Correspondence</p>
            {lastSent || lastReceived ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lastSent && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
                    <Send style={{ width: 14, height: 14, color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Last sent: {activityLabel(lastSent.type)}</p>
                      {lastSent.email_subject && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{lastSent.email_subject}</p>}
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{formatDate(lastSent.created_at)} · {lastSent.campaign_name || ''}</p>
                    </div>
                  </div>
                )}
                {lastReceived && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'rgba(16,185,129,0.04)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.1)' }}>
                    <Inbox style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Last received: {activityLabel(lastReceived.type)}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{formatDate(lastReceived.created_at)} · {lastReceived.campaign_name || ''}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={emptyText}>No correspondence logged yet — data will appear as emails and messages are sent</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
