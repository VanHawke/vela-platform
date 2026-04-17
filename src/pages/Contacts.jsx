// Contacts.jsx — Tabular Review style with hover preview popups
// Mockup-faithful port of kiko-contacts.html

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import './Contacts.css'

const PAGE_SIZE = 50

const SECTOR_CLASS = {
  'Banking': 'banking', 'FinTech': 'fintech', 'Fintech': 'fintech',
  'Gaming': 'gaming', 'Telecoms': 'telecoms', 'Telecom': 'telecoms',
  'Luxury': 'luxury',
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Contacts({ user }) {
  const nav = useNavigate()
  const [contacts, setContacts] = useState([])
  const [companyIdByName, setCompanyIdByName] = useState({}) // { "citi": "org123", ... }
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('kiko_contacts_sort') || 'recent' } catch { return 'recent' }
  }) // recent | name_asc | name_desc | company_asc
  const [hoverContact, setHoverContact] = useState(null)
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 })
  const hoverTimer = useRef(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Add-contact modal state
  const [showForm, setShowForm] = useState(false)
  const [showDedup, setShowDedup] = useState(false)
  const [dedupGroups, setDedupGroups] = useState([])
  const [dedupLoading, setDedupLoading] = useState(false)

  async function findDuplicates() {
    setDedupLoading(true)
    try {
      const res = await fetch('/api/contact-dedup')
      const data = await res.json()
      setDedupGroups(data.groups || [])
      setShowDedup(true)
    } catch (e) { console.error('Dedup error:', e) }
    setDedupLoading(false)
  }

  async function mergeContacts(keepId, deleteId) {
    try {
      await fetch('/api/contact-dedup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, deleteId }),
      })
      setDedupGroups(prev => prev.filter(g => !g.contacts.some(c => c.id === deleteId)))
      setContacts(prev => prev.filter(c => c.id !== deleteId))
    } catch (e) { console.error('Merge error:', e) }
  }
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '', notes: '' })
  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '', notes: '' })
    setShowForm(false)
  }
  const saveContact = async () => {
    if (saving) return
    if (!form.firstName.trim() && !form.lastName.trim()) return
    setSaving(true)
    const now = new Date().toISOString()
    const id = `c${Date.now()}`
    const data = { ...form, id, name: `${form.firstName} ${form.lastName}`.trim() }
    await supabase.from('contacts').upsert({ id, data, updated_at: now }, { onConflict: 'id' })
    setSaving(false)
    resetForm()
    setReloadKey(k => k + 1)
  }

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      // Fast first paint: load most recent 500 first, render immediately.
      // Then load the rest in the background so the full list is there by the time the user scrolls/searches.
      const { data: initialData } = await supabase
        .from('contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(0, 499)
      if (cancelled) return
      setContacts(initialData || [])
      setLoading(false)

      // Stream remaining rows in batches of 1000, append as they arrive
      ;(async () => {
        let from = 500
        const batchSize = 1000
        while (!cancelled) {
          const { data: batch } = await supabase
            .from('contacts')
            .select('*')
            .order('updated_at', { ascending: false })
            .range(from, from + batchSize - 1)
          if (!batch || batch.length === 0) break
          if (cancelled) return
          setContacts(prev => [...prev, ...batch])
          if (batch.length < batchSize) break
          from += batchSize
        }
      })()

      // OFF CRITICAL PATH: load companies lookup map lazily for company→org linking.
      supabase.from('companies').select('id, data').then(({ data: companiesData }) => {
        if (cancelled) return
        const map = {}
        ;(companiesData || []).forEach(c => {
          const n = c.data?.name
          if (n) map[n.toLowerCase().trim()] = c.id
        })
        setCompanyIdByName(map)
      })
    })()
    return () => { cancelled = true }
  }, [user?.id, reloadKey])

  const filtered = useMemo(() => {
    // Normalize JSONB-style rows: contacts table stores { id, data: jsonb, org_id }
    const normalized = contacts.map(c => {
      const d = c.data || {}
      const fullName = d.name || [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ').trim() || '—'
      return {
        id: c.id,
        name: fullName,
        email: d.email || '',
        title: d.title || '',
        company: d.company || '',
        sector: d.sector || d.industry || '',
        status: (d.status || '').toLowerCase().includes('active') ? 'engaged' : (d.status || '').toLowerCase() || '',
        last_touch: d.lastActivity || (c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''),
        notes: d.notes || d.researchNotes?.[0] || '',
        _raw: c,
      }
    })
    const q = search.toLowerCase()
    const matched = !search ? normalized : normalized.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    )
    // Apply sort
    const sorted = [...matched]
    if (sortBy === 'name_asc') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'name_desc') sorted.sort((a, b) => b.name.localeCompare(a.name))
    else if (sortBy === 'company_asc') sorted.sort((a, b) => (a.company || 'zz').localeCompare(b.company || 'zz'))
    // 'recent' is the default order from the query (updated_at desc)
    return sorted
  }, [contacts, search, sortBy])

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  // No MOCK fallback — real data only. Empty state rendered below when filtered is empty.
  const display = paged

  // Hover preview popup positioning
  const onRowEnter = (c, e) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const r = e.target.closest('tr').getBoundingClientRect()
      const popW = 360
      const left = Math.max(20, r.left - popW - 16)
      setHoverPos({ top: r.top, left })
      setHoverContact(c)
    }, 250)
  }
  const onRowLeave = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoverContact(null), 100)
  }

  return (
    <div className="ct">
      <PageHeader
        eyebrowCategory="DATABASE"
        eyebrowSuffix="Prospect universe"
        title="Contacts"
        stats={[
          { value: filtered.length.toLocaleString() || display.length, label: 'Total' },
        ]}
        toolbar={
          <>
            <input
              className="ct-search"
              placeholder="Search by name, company, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            />
            <select
              className="ct-sort"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(0)
                try { localStorage.setItem('kiko_contacts_sort', e.target.value) } catch {}
              }}
              title="Sort contacts"
            >
              <option value="recent">Recent</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="company_asc">Company A–Z</option>
            </select>
            <button className="ct-pri-btn" style={{ background: 'transparent', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.10)' }} onClick={findDuplicates} disabled={dedupLoading}>
              {dedupLoading ? 'Scanning...' : 'Find duplicates'}
            </button>
            <button className="ct-pri-btn" onClick={() => setShowForm(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New contact
            </button>
          </>
        }
      />

      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Company</th>
              <th>Title</th>
              <th>Sector</th>
              <th>Last touch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {display.map(c => {
              const sector = c.sector || c.metadata?.sector || ''
              const sectorClass = SECTOR_CLASS[sector] || ''
              const companyKey = (c.company || '').toLowerCase().trim()
              const companyId = companyKey ? companyIdByName[companyKey] : null
              const handleCompanyClick = (e) => {
                if (!companyId) return
                e.stopPropagation()
                nav(`/organisations?org=${companyId}`)
              }
              return (
                <tr key={c.id} onClick={() => nav(`/contacts/${c.id}`)} onMouseEnter={(e) => onRowEnter(c, e)} onMouseLeave={onRowLeave}>
                  <td><div className="ct-mark">{initials(c.name)}</div></td>
                  <td><div className="ct-name">{c.name || '—'} {(c.email && c.company && c.title) ? <span title="Enriched profile" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#06D6A0', marginLeft: 6, verticalAlign: 'middle' }} /> : <span title="Thin profile — needs enrichment" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#D1D1D1', marginLeft: 6, verticalAlign: 'middle' }} />}</div></td>
                  <td>
                    {c.company ? (
                      <span
                        className={companyId ? 'ct-company-link' : ''}
                        onClick={handleCompanyClick}
                        title={companyId ? 'Open organisation' : ''}
                      >{c.company}</span>
                    ) : '—'}
                  </td>
                  <td>{c.title || '—'}</td>
                  <td>{sector && <span className={`ct-tag ${sectorClass}`}>{sector}</span>}</td>
                  <td className="ct-when">{c.last_touch || c.metadata?.last_touch || '—'}</td>
                  <td>{c.status && <span className={`ct-status ${c.status}`}>{c.status}</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <div className="ct-empty">
            {search
              ? <>No contacts match "<strong>{search}</strong>". Try a different search or <button className="ct-empty-link" onClick={() => setSearch('')}>clear</button>.</>
              : <>No contacts yet. Click <strong>+ New contact</strong> to add one.</>
            }
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="ct-pager">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
            <span>{page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next →</button>
          </div>
        )}
      </div>

      {/* HOVER PREVIEW POPUP */}
      {hoverContact && (
        <div className="ct-popup" style={{ top: hoverPos.top, left: hoverPos.left }}>
          <div className="ct-popup-h">
            <div className="ct-popup-mark">{initials(hoverContact.name)}</div>
            <div>
              <div className="ct-popup-name">{hoverContact.name}</div>
              <div className="ct-popup-title">{hoverContact.title || ''} · {hoverContact.company || ''}</div>
            </div>
          </div>
          <div className="ct-popup-meta">
            <div><strong>Email:</strong> {hoverContact.email || '—'}</div>
            <div><strong>Last touch:</strong> {hoverContact.last_touch || hoverContact.metadata?.last_touch || '—'}</div>
            <div><strong>Sector:</strong> {hoverContact.sector || '—'}</div>
          </div>
          {hoverContact.notes && <div className="ct-popup-notes">{hoverContact.notes}</div>}
        </div>
      )}

      {/* ADD CONTACT MODAL */}
      {showForm && (
        <div className="ct-modal-backdrop" onClick={resetForm}>
          <div className="ct-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-modal-h">
              <h3>New contact</h3>
              <button className="ct-modal-x" onClick={resetForm}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="ct-modal-body">
              <div className="ct-modal-row">
                <input placeholder="First name *" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} autoFocus />
                <input placeholder="Last name" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
              </div>
              <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <input placeholder="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <input placeholder="Company" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
              <input placeholder="Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <textarea placeholder="Notes" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="ct-modal-actions">
              <button className="ct-modal-btn secondary" onClick={resetForm}>Cancel</button>
              <button className="ct-modal-btn primary" onClick={saveContact} disabled={saving || (!form.firstName.trim() && !form.lastName.trim())}>
                {saving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedup Modal */}
      {showDedup && (
        <div className="ct-modal-overlay" onClick={() => setShowDedup(false)}>
          <div className="ct-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>Duplicate Contacts</h3>
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>{dedupGroups.length} groups found · {dedupGroups.reduce((s, g) => s + g.contacts.length, 0)} contacts</span>
              </div>
              <button className="ct-modal-btn secondary" onClick={() => setShowDedup(false)} style={{ padding: '4px 10px' }}>✕</button>
            </div>
            {dedupGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                <p style={{ color: '#6B6B6B', fontSize: 14 }}>No duplicates found. Your contacts are clean.</p>
              </div>
            ) : (
              dedupGroups.map((group, gi) => {
                const FIELDS = ['name', 'firstName', 'lastName', 'email', 'title', 'company', 'phone', 'linkedinUrl', 'linkedin_headline', 'linkedin_industry']
                const displayFields = FIELDS.filter(f => group.contacts.some(c => c[f]))
                return (
                  <div key={gi} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 14px', background: '#FAFAF7', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#A0A0A0', fontWeight: 500 }}>{group.reason}</span>
                      <span style={{ fontSize: 10, color: '#A0A0A0' }}>{group.contacts.length} contacts</span>
                    </div>
                    {/* Field comparison table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#A0A0A0', fontWeight: 500, fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>Field</th>
                            {group.contacts.map((c, ci) => (
                              <th key={c.id} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.06)', color: ci === 0 ? '#059669' : '#0A0A0A' }}>
                                {ci === 0 ? '✓ Primary' : `Contact ${ci + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displayFields.map(f => {
                            const values = group.contacts.map(c => c[f] || '')
                            const allSame = values.every(v => v === values[0])
                            return (
                              <tr key={f}>
                                <td style={{ padding: '5px 12px', color: '#6B6B6B', fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.03)' }}>{f.replace(/_/g, ' ')}</td>
                                {values.map((v, vi) => (
                                  <td key={vi} style={{ padding: '5px 12px', color: '#0A0A0A', borderBottom: '1px solid rgba(0,0,0,0.03)', background: !allSame && v && vi > 0 ? '#FEF3C7' : 'transparent', fontSize: 12 }}>
                                    {v || <span style={{ color: '#D0D0D0' }}>—</span>}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                          <tr>
                            <td style={{ padding: '5px 12px', color: '#6B6B6B', fontSize: 11 }}>updated</td>
                            {group.contacts.map(c => (
                              <td key={c.id} style={{ padding: '5px 12px', fontSize: 11, color: '#A0A0A0' }}>
                                {c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {/* Merge actions */}
                    <div style={{ padding: '10px 14px', background: '#FAFAF7', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {group.contacts.slice(1).map(c => (
                        <button key={c.id} onClick={() => mergeContacts(group.contacts[0].id, c.id)} style={{
                          padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: '#FEF2F2', color: '#DC2626',
                          fontSize: 11, cursor: 'pointer', fontWeight: 500,
                        }}>
                          Merge "{c.name || c.firstName || 'Contact'}" → Primary
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}


const MOCK_CONTACTS = [
  { id: 'c1', name: 'James Bardrick',     company: 'Citi',         title: 'Country Officer UK',        sector: 'Banking',  last_touch: '2h ago',     status: 'hot',    email: 'james.bardrick@citi.com',  notes: 'Just promoted. F1 2027 angle landing well — replied within 4h to Touch 3.' },
  { id: 'c2', name: 'David Sundheim',     company: 'D1 Capital',   title: 'Founder',                    sector: 'FinTech',  last_touch: '4h ago',     status: 'hot',    email: 'd.sundheim@d1.com',         notes: 'Sports IP thesis aligned. Wants deck + comparable transactions.' },
  { id: 'c3', name: 'Catherine Halford',  company: 'ANZ',          title: 'Head of Brand APAC',        sector: 'Banking',  last_touch: 'Yesterday',  status: 'engaged',email: 'c.halford@anz.com',         notes: 'On APAC roadshow until 28 Apr. Will revisit week of 28th.' },
  { id: 'c4', name: 'Alex Cross',         company: 'Barclays',     title: 'CMO',                        sector: 'Banking',  last_touch: '3d ago',     status: 'engaged',email: 'a.cross@barclays.com',      notes: 'Scheduled call Friday 11:00 UK. Pre-read sent.' },
  { id: 'c5', name: 'Paul Gewirtz',       company: 'Goldman Sachs',title: 'Head of Brand',              sector: 'Banking',  last_touch: '2d ago',     status: 'engaged',email: 'p.gewirtz@gs.com',          notes: 'Meeting tomorrow 14:00. F1 vs rugby economics 1-pager ready.' },
  { id: 'c6', name: 'Mark Nelson',        company: 'Stripe',       title: 'VP Marketing',               sector: 'FinTech',  last_touch: '1d ago',     status: 'engaged',email: 'mark@stripe.com',            notes: 'FE 2026 angle. Loop in brand team. Mon 21 10:00 PT.' },
  { id: 'c7', name: 'Rajesh Suri',        company: 'DBS',          title: 'Head of Sponsorship',        sector: 'Banking',  last_touch: '1w ago',     status: 'cold',   email: 'r.suri@dbs.com',             notes: 'No reply to Touch 2. Try APAC angle for Singapore GP.' },
  { id: 'c8', name: 'Tom Tucker',         company: 'Schroders',    title: 'Marketing Director',         sector: 'Banking',  last_touch: '2w ago',     status: 'cold',   email: 't.tucker@schroders.com',    notes: 'Quiet. Add to Touch 5 breakup queue.' },
  { id: 'c9', name: 'Sarah Lee',          company: 'JPMorgan',     title: 'Brand Director',             sector: 'Banking',  last_touch: 'New',        status: 'new',    email: 's.lee@jpm.com',              notes: 'Just joined from AmEx. Ex-Mercedes account lead. Warm intro likely.' },
  { id: 'c10',name: 'Maria Gonzales',     company: 'Telefónica',   title: 'Head of Sponsorship',        sector: 'Telecoms', last_touch: '5d ago',     status: 'engaged',email: 'm.gonzales@telefonica.com',  notes: 'MotoGP angle landed. Wants Spanish GP activation rates.' },
]
