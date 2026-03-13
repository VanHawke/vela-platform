import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Mail, Phone, Linkedin, Building2, Clock, Globe, Edit3, X, ExternalLink } from 'lucide-react'

export default function ContactDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('id, data, updated_at').eq('id', id).single()
    if (data) {
      const c = { id: data.id, ...data.data, updated_at: data.updated_at }
      setContact(c)
      setForm({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', title: c.title || '', linkedin: c.linkedin || '', notes: c.notes || '' })
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

  const glass = {
    background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)',
  }

  const card = {
    background: '#FFFFFF', borderRadius: 16, padding: 24,
    border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  const inputStyle = {
    width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13,
    color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box',
  }

  const labelStyle = { fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!contact) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>Contact not found</p>
        <button onClick={() => nav('/contacts')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>Back to Contacts</button>
      </div>
    )
  }

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
        <button onClick={() => setEditing(!editing)} style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
          background: editing ? 'transparent' : 'var(--accent)', color: editing ? 'var(--text-secondary)' : '#fff',
          padding: '6px 14px', borderRadius: 8, border: editing ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          {editing ? <><X style={{ width: 14, height: 14 }} /> Cancel</> : <><Edit3 style={{ width: 14, height: 14 }} /> Edit</>}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left column - profile card */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar + name card */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {contact.picture ? (
                <img src={contact.picture} alt="" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                    {(contact.firstName || contact.lastName || '?')[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{displayName(contact)}</p>
                {contact.title && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{contact.title}</p>}
                {contact.company && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Building2 style={{ width: 11, height: 11 }} /> {contact.company}
                  </p>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {contact.email && (
                <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <Mail style={{ width: 13, height: 13 }} /> Email
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <Phone style={{ width: 13, height: 13 }} /> Call
                </a>
              )}
              {contact.linkedin && (
                <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <Linkedin style={{ width: 13, height: 13 }} /> LinkedIn
                </a>
              )}
            </div>
          </div>

          {/* Activity info */}
          <div style={card}>
            <p style={labelStyle}>Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {contact.lastActivity && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                  <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                  Last activity: {daysAgo(contact.lastActivity)} ({new Date(contact.lastActivity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})
                </div>
              )}
              {contact.createdAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                  <Clock style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                  Created: {new Date(contact.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
              {contact.source && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                  <ExternalLink style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
                  Source: {contact.source}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - details / edit form */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={card}>
            {editing ? (
              <>
                <p style={{ ...labelStyle, marginBottom: 16 }}>Edit Contact</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={labelStyle}>First Name</p>
                      <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={labelStyle}>Last Name</p>
                      <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  {[
                    { key: 'title', label: 'Job Title' },
                    { key: 'company', label: 'Company' },
                    { key: 'email', label: 'Email' },
                    { key: 'phone', label: 'Phone' },
                    { key: 'linkedin', label: 'LinkedIn URL' },
                  ].map(f => (
                    <div key={f.key}>
                      <p style={labelStyle}>{f.label}</p>
                      <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                    </div>
                  ))}
                  <div>
                    <p style={labelStyle}>Notes</p>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} />
                  </div>
                  <button onClick={save} style={{ alignSelf: 'flex-end', fontSize: 13, fontWeight: 500, background: 'var(--accent)', color: '#fff', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Save Changes
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ ...labelStyle, marginBottom: 16 }}>Contact Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {[
                    { label: 'First Name', value: contact.firstName },
                    { label: 'Last Name', value: contact.lastName },
                    { label: 'Job Title', value: contact.title },
                    { label: 'Company', value: contact.company },
                    { label: 'Email', value: contact.email, link: contact.email ? `mailto:${contact.email}` : null },
                    { label: 'Phone', value: contact.phone, link: contact.phone ? `tel:${contact.phone}` : null },
                    { label: 'LinkedIn', value: contact.linkedin ? 'View Profile' : null, link: contact.linkedin },
                    { label: 'Status', value: contact.status },
                    { label: 'Owner', value: contact.owner },
                    { label: 'Preferred Contact', value: contact.preferredContact },
                  ].map(f => (
                    <div key={f.label}>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{f.label}</p>
                      {f.link ? (
                        <a href={f.link} target={f.link?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font)', textDecoration: 'none' }}>
                          {f.value || '—'}
                        </a>
                      ) : (
                        <p style={{ fontSize: 13, color: f.value ? 'var(--text)' : 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font)' }}>{f.value || '—'}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Notes section */}
                {contact.notes && contact.notes !== '[]' && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <p style={{ ...labelStyle, marginBottom: 8 }}>Notes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{contact.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
