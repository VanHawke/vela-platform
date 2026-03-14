import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, Building2, Globe, ChevronLeft, ChevronRight, Users, Linkedin, Send, ExternalLink } from 'lucide-react'

const PAGE_SIZE = 50

// Extract domain from email for logo
const getDomain = (email) => {
  if (!email || !email.includes('@')) return null
  const d = email.split('@')[1]
  if (!d || ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com'].includes(d)) return null
  return d
}

// Company logo with Clearbit fallback
function OrgLogo({ domain, name, size = 36 }) {
  if (domain) {
    return (
      <div style={{ width: size, height: size, borderRadius: size > 30 ? 10 : 8, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size > 36 ? 128 : 64}`} alt="" style={{ width: size * 0.7, height: size * 0.7, objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size > 30 ? 10 : 8, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Building2 style={{ width: size * 0.44, height: size * 0.44, color: 'var(--text-tertiary)' }} />
    </div>
  )
}

export default function Organisations() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
  const [form, setForm] = useState({ name: '', industry: '', website: '', country: '', notes: '' })
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [orgContacts, setOrgContacts] = useState([])
  const [orgLinkedin, setOrgLinkedin] = useState(null)
  const [orgDomain, setOrgDomain] = useState(null)
  const [orgCampaigns, setOrgCampaigns] = useState([])
  const [orgLastComm, setOrgLastComm] = useState({ sent: null, received: null })
  const [loadingPanel, setLoadingPanel] = useState(false)

  useEffect(() => { load() }, [])

  // Auto-open org from query param (e.g. from ContactDetail clickthrough)
  useEffect(() => {
    const orgParam = searchParams.get('org')
    if (orgParam && companies.length > 0 && !selectedOrg) {
      const found = companies.find(c => c.id === orgParam)
      if (found) selectOrg(found)
    }
  }, [companies, searchParams])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('companies').select('id, data, updated_at').order('updated_at', { ascending: false })
    setCompanies((data || []).map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at })))
    setLoading(false)
  }

  const save = async () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString()
    const id = editing || `org${Date.now()}`
    const existing = companies.find(c => c.id === id)
    const data = { ...(existing || {}), ...form, id }
    delete data.updated_at
    await supabase.from('companies').upsert({ id, data, updated_at: now }, { onConflict: 'id' })
    reset(); load()
    if (selectedOrg?.id === id) selectOrg({ ...data, id, updated_at: now })
  }

  const remove = async (id) => {
    await supabase.from('companies').delete().eq('id', id)
    setCompanies(prev => prev.filter(c => c.id !== id))
    if (selectedOrg?.id === id) closePanel()
  }

  const edit = (c) => {
    setEditing(c.id)
    setForm({ name: c.name || '', industry: c.industry || '', website: c.website || '', country: c.country || '', notes: c.notes || '' })
    setShowForm(true)
  }

  const reset = () => { setShowForm(false); setEditing(null); setForm({ name: '', industry: '', website: '', country: '', notes: '' }) }

  const selectOrg = async (company) => {
    setSelectedOrg(company)
    setLoadingPanel(true)
    setOrgContacts([])
    setOrgLinkedin(null)
    setOrgDomain(null)
    setOrgCampaigns([])

    const { data: contacts } = await supabase.from('contacts').select('id, data')
      .or(`data->>companyId.eq.${company.id},data->>company.eq.${company.name}`)
      .order('updated_at', { ascending: false }).limit(50)

    const contactList = (contacts || []).map(c => ({ id: c.id, ...c.data }))
    setOrgContacts(contactList)

    // Derive company LinkedIn from contacts
    const withLi = contactList.find(c => c.companyLinkedin)
    setOrgLinkedin(withLi?.companyLinkedin || company.linkedin || null)

    // Derive domain from first contact email
    const firstDomain = contactList.map(c => getDomain(c.email)).find(Boolean)
    setOrgDomain(firstDomain || (company.website ? company.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null))

    // Campaign data from contacts' Lemlist data + activities table
    const campMap = {}
    contactList.forEach(c => {
      if (c.lemlistCampaigns && Array.isArray(c.lemlistCampaigns)) {
        c.lemlistCampaigns.forEach(camp => {
          if (!camp.name) return
          if (!campMap[camp.name]) campMap[camp.name] = { name: camp.name, contacts: 0, status: camp.status, lastContact: c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : '' }
          campMap[camp.name].contacts++
        })
      }
      if (c.lastCampaign && !campMap[c.lastCampaign]) {
        campMap[c.lastCampaign] = { name: c.lastCampaign, contacts: 1, status: null, lastContact: '' }
      }
    })

    // Also check activities table for event-level data
    const contactIds = contactList.map(c => c.id)
    if (contactIds.length > 0) {
      const { data: activities } = await supabase.from('contact_activities')
        .select('campaign_name, type, email_subject, created_at, contact_id').in('contact_id', contactIds)
        .order('created_at', { ascending: false }).limit(200)
      ;(activities || []).forEach(a => {
        if (a.campaign_name) {
          if (!campMap[a.campaign_name]) campMap[a.campaign_name] = { name: a.campaign_name, contacts: 0, status: null, lastContact: '' }
          if (!campMap[a.campaign_name].lastEvent || a.created_at > campMap[a.campaign_name].lastEvent) {
            campMap[a.campaign_name].lastEvent = a.created_at
            campMap[a.campaign_name].lastEventType = a.type
            campMap[a.campaign_name].lastSubject = a.email_subject
          }
        }
      })
      // Store last sent/received for org panel
      const lastSent = (activities || []).find(a => ['emailsSent', 'linkedinSent'].includes(a.type))
      const lastReceived = (activities || []).find(a => ['emailsReplied', 'linkedinReplied'].includes(a.type))
      setOrgLastComm({ sent: lastSent || null, received: lastReceived || null })
    }

    setOrgCampaigns(Object.values(campMap).sort((a, b) => (b.contacts || 0) - (a.contacts || 0)))
    setLoadingPanel(false)
  }

  const closePanel = () => { setSelectedOrg(null); setOrgContacts([]); setOrgLinkedin(null); setOrgDomain(null); setOrgCampaigns([]); setOrgLastComm({ sent: null, received: null }) }

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(c => [c.name, c.industry, c.country].some(f => f?.toLowerCase().includes(q)))
  }, [companies, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  useEffect(() => { setPage(0) }, [search])

  const glass = { margin: '0 16px', padding: '12px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const listCard = { background: '#FFFFFF', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'box-shadow 0.15s ease', cursor: 'pointer' }
  const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }
  const sectionTitle = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const emptyText = { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', fontStyle: 'italic' }
  const fieldRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }
  const fieldLabel = { fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }

  const panelOpen = !!selectedOrg
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  // Derive domain for list items from company name (simple heuristic)
  const listDomainCache = useMemo(() => {
    const cache = {}
    companies.forEach(c => {
      if (c.website) cache[c.id] = c.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    })
    return cache
  }, [companies])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 8 }}>
      <div style={glass}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Organisations</h1>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} organisation{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Plus style={{ width: 14, height: 14 }} /> Add Organisation
        </button>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organisations..." style={{ ...inputStyle, padding: '8px 12px 8px 34px' }} />
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1, color: 'var(--text-secondary)', padding: 2 }}><ChevronLeft style={{ width: 16, height: 16 }} /></button>
            <span>{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1, color: 'var(--text-secondary)', padding: 2 }}><ChevronRight style={{ width: 16, height: 16 }} /></button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', padding: '0 16px 16px' }}>
        {/* Org list */}
        <div style={{ flex: 1, overflowY: 'auto', transition: 'flex 0.3s ease', minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(8)].map((_, i) => <div key={i} style={{ height: 64, background: 'rgba(0,0,0,0.03)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}</div>
          ) : paged.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
              <Building2 style={{ width: 32, height: 32, marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 13, fontFamily: 'var(--font)' }}>{search ? 'No organisations match' : 'No organisations yet'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {paged.map(company => (
                <div key={company.id} style={{ ...listCard, background: selectedOrg?.id === company.id ? 'rgba(26,26,26,0.04)' : '#FFFFFF', borderColor: selectedOrg?.id === company.id ? 'rgba(26,26,26,0.12)' : 'rgba(0,0,0,0.06)' }}
                  onClick={() => selectOrg(company)}
                  onMouseEnter={e => { if (selectedOrg?.id !== company.id) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                    <OrgLogo domain={listDomainCache[company.id]} name={company.name} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.industry || '—'}{company.country ? ` · ${company.country}` : ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 }}>
                    {company.openDeals > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', color: '#3b82f6', fontWeight: 500, fontFamily: 'var(--font)' }}>{company.openDeals} open</span>}
                    {company.wonDeals > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', color: '#10b981', fontWeight: 500, fontFamily: 'var(--font)' }}>{company.wonDeals} won</span>}
                    <button onClick={(e) => { e.stopPropagation(); edit(company) }} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', opacity: 0.5, transition: 'opacity 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); remove(company.id) }} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, transition: 'all 0.15s', padding: 2 }} onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-tertiary)' }}><X style={{ width: 14, height: 14 }} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slide-out panel */}
        <div style={{ width: panelOpen ? 400 : 0, minWidth: panelOpen ? 400 : 0, transition: 'width 0.3s ease, min-width 0.3s ease, opacity 0.2s ease', opacity: panelOpen ? 1 : 0, overflow: 'hidden', marginLeft: panelOpen ? 16 : 0 }}>
          {selectedOrg && (
            <div style={{ width: 400, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Header card */}
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '20px 20px 16px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <OrgLogo domain={orgDomain} name={selectedOrg.name} size={48} />
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{selectedOrg.name}</h2>
                      {selectedOrg.industry && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{selectedOrg.industry}</p>}
                    </div>
                  </div>
                  <button onClick={closePanel} style={{ background: 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>

                {/* Fields - always visible */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                  <div>
                    <p style={fieldLabel}>Industry / Sector</p>
                    <p style={{ fontSize: 13, color: selectedOrg.industry ? 'var(--text)' : 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{selectedOrg.industry || 'Not set — edit to add'}</p>
                  </div>
                  <div>
                    <p style={fieldLabel}>Country HQ</p>
                    <p style={{ fontSize: 13, color: selectedOrg.country ? 'var(--text)' : 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{selectedOrg.country || 'Not set — edit to add'}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {orgLinkedin ? (
                    <a href={orgLinkedin} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0a66c2', background: 'rgba(10,102,194,0.06)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(10,102,194,0.12)' }}>
                      <Linkedin style={{ width: 13, height: 13 }} /> LinkedIn
                    </a>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.02)', padding: '6px 12px', borderRadius: 8, fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                      <Linkedin style={{ width: 13, height: 13 }} /> No LinkedIn
                    </span>
                  )}
                  {selectedOrg.website ? (
                    <a href={selectedOrg.website.startsWith('http') ? selectedOrg.website : `https://${selectedOrg.website}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                      <ExternalLink style={{ width: 13, height: 13 }} /> Website
                    </a>
                  ) : orgDomain ? (
                    <a href={`https://${orgDomain}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                      <ExternalLink style={{ width: 13, height: 13 }} /> {orgDomain}
                    </a>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.02)', padding: '6px 12px', borderRadius: 8, fontFamily: 'var(--font)', border: '1px solid rgba(0,0,0,0.04)' }}>
                      <Globe style={{ width: 13, height: 13 }} /> No website
                    </span>
                  )}
                  <button onClick={() => edit(selectedOrg)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Edit
                  </button>
                </div>
              </div>

              {/* Contacts */}
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}><Users style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Contacts ({orgContacts.length})</p>
                {loadingPanel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 40, background: 'rgba(0,0,0,0.03)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />)}</div>
                ) : orgContacts.length === 0 ? (
                  <p style={emptyText}>No contacts linked</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {orgContacts.map(c => (
                      <div key={c.id} onClick={() => nav(`/contacts/${c.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {c.picture ? (
                          <img src={c.picture} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{(c.firstName || c.lastName || '?')[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed'}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Campaign */}
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}><Send style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 6 }} />Active Campaign</p>
                {orgCampaigns.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {orgCampaigns.map(c => (
                      <div key={c.name} style={{ padding: '8px 10px', background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)' }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{c.name}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{c.contacts} contact{c.contacts !== 1 ? 's' : ''}{c.status ? ` · ${c.status}` : ''}{c.lastEvent ? ` · Last: ${formatDate(c.lastEvent)}` : ''}</p>
                      </div>
                    ))}
                  </div>
                ) : <p style={emptyText}>No active campaign</p>}
              </div>

              {/* Campaign History */}
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}>Campaign History</p>
                {orgCampaigns.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {orgCampaigns.map(c => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', flexShrink: 0, marginLeft: 8 }}>{c.contacts} contact{c.contacts !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : <p style={emptyText}>No campaign history yet</p>}
              </div>
              {/* Last Communication */}
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={sectionTitle}>Last Communication</p>
                {orgLastComm.sent || orgLastComm.received ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {orgLastComm.sent && (
                      <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Last sent: {orgLastComm.sent.type === 'emailsSent' ? 'Email' : 'LinkedIn message'}</p>
                        {orgLastComm.sent.email_subject && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{orgLastComm.sent.email_subject}</p>}
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{formatDate(orgLastComm.sent.created_at)} · {orgLastComm.sent.campaign_name || ''}</p>
                      </div>
                    )}
                    {orgLastComm.received && (
                      <div style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.04)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.1)' }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Last received: {orgLastComm.received.type === 'emailsReplied' ? 'Email reply' : 'LinkedIn reply'}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{formatDate(orgLastComm.received.created_at)}</p>
                      </div>
                    )}
                  </div>
                ) : <p style={emptyText}>No communications logged yet</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <div onClick={e => e.target === e.currentTarget && reset()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{editing ? 'Edit Organisation' : 'Add Organisation'}</h2>
              <button onClick={reset} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[{ key: 'name', placeholder: 'Organisation name *' }, { key: 'industry', placeholder: 'Industry / Sector' }, { key: 'website', placeholder: 'Website (e.g. company.com)' }, { key: 'country', placeholder: 'Country HQ' }].map(f => (
                <input key={f.key} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
              ))}
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} style={{ ...inputStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={reset} style={{ flex: 1, padding: '10px 0', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={save} style={{ flex: 1, padding: '10px 0', fontSize: 13, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font)' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
