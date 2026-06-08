// src/pages/Records.jsx — Redesign v2: Unified CRM page (Contacts + Organisations)
// Sandbox-faithful layout with real Supabase data, A-Z default sort, drill-in navigation

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { setPageContext } from '@/lib/pageContext'

const PAGE_SIZE = 50
const C = T // color shorthand

function initials(name) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/)
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function fmtMoney(val) {
  if (!val) return '—'
  const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.]/g, '')) : val
  if (isNaN(num)) return val
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}bn`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}m`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}k`
  return `$${num}`
}

function statusBadge(s) {
  if (!s) return null
  const m = {
    active: { bg: 'rgba(0,0,0,0.06)', fg: '#0A0A0A' }, engaged: { bg: 'rgba(0,0,0,0.06)', fg: '#0A0A0A' },
    cold: { bg: 'rgba(90,100,112,0.10)', fg: '#5A6470' }, won: { bg: 'rgba(125,138,100,0.18)', fg: '#7d8a64' },
    replied: { bg: 'rgba(125,138,100,0.12)', fg: '#7d8a64' }, bounced: { bg: 'rgba(184,100,62,0.10)', fg: '#b8643e' },
  }
  const c = m[s.toLowerCase()] || m.active
  return <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 500, background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: C.font }}>{s}</span>
}

export default function Records({ user }) {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState(() => searchParams.get('view') || 'people')
  const [contacts, setContacts] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name_asc') // A-Z default
  const [page, setPage] = useState(0)

  const switchView = (v) => { setView(v); setSearchParams({ view: v }, { replace: true }); setPage(0); setSearch('') }

  // ── Data fetching ──
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      // Load contacts (first 500 fast, then stream rest)
      const { data: initialContacts } = await supabase.from('contacts').select('*').order('updated_at', { ascending: false }).range(0, 499)
      if (!cancelled) { setContacts(initialContacts || []); setLoading(false); setPageContext({ page: 'records', summary: `Records: ${(initialContacts||[]).length} contacts`, tab: 'people' }) }
      ;(async () => {
        let from = 500
        while (!cancelled) {
          const { data: batch } = await supabase.from('contacts').select('*').order('updated_at', { ascending: false }).range(from, from + 999)
          if (!batch || batch.length === 0 || cancelled) break
          setContacts(prev => [...prev, ...batch])
          if (batch.length < 1000) break
          from += 1000
        }
      })()
      // Load companies (paginate — no 1000 cap)
      const { data: initialCompanies } = await supabase.from('companies').select('*').order('data->>name', { ascending: true }).range(0, 999)
      if (!cancelled) setCompanies(initialCompanies || [])
      ;(async () => {
        let from = 1000
        while (!cancelled) {
          const { data: batch } = await supabase.from('companies').select('*').order('data->>name', { ascending: true }).range(from, from + 999)
          if (!batch || batch.length === 0 || cancelled) break
          setCompanies(prev => [...prev, ...batch])
          if (batch.length < 1000) break
          from += 1000
        }
      })()
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // ── Normalize contacts ──
  const normalizedContacts = useMemo(() => {
    return contacts.map(c => {
      const d = c.data || {}
      const fullName = d.name || [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ').trim() || '—'
      return {
        id: c.id, name: fullName, email: d.email || '', title: d.title || '',
        company: d.company || '', sector: d.sector || d.industry || '',
        picture: d.picture || d.profilePicture || d.avatar || null,
        linkedin: d.linkedin || d.linkedinUrl || null,
        lastContacted: d.lastActivity ? new Date(d.lastActivity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
        daysSinceActivity: d.lastActivity ? Math.floor((Date.now() - new Date(d.lastActivity)) / 86400000) : null,
      }
    })
  }, [contacts])

  // ── Normalize companies ──
  const normalizedCompanies = useMemo(() => {
    return companies.map(c => {
      const d = c.data || {}
      return {
        id: c.id, name: d.name || '—', industry: d.industry || d.sector || '',
        size: d.employees || d.employeeCount || d.size || '', 
        location: [d.address, d.country].filter(Boolean).join(', ') || d.location || d.hqLocation || '',
        deals: (d.openDeals || 0) + (d.wonDeals || 0), 
        contacts: d.peopleCount || d.contactCount || 0, 
        website: d.website || d.domain || '',
        founded: d.founded || '', revenueEst: d.revenueEst || '',
        totalFunding: d.totalFunding || '', lastRound: d.lastRound || '',
        valuation: d.valuation || '', competitors: d.competitors || '',
      }
    })
  }, [companies])

  // ── Filter + sort ──
  const filteredContacts = useMemo(() => {
    const q = search.toLowerCase()
    let list = !search ? normalizedContacts : normalizedContacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    )
    if (sortBy === 'name_asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'name_desc') list = [...list].sort((a, b) => b.name.localeCompare(a.name))
    else if (sortBy === 'company_asc') list = [...list].sort((a, b) => (a.company || 'zzz').localeCompare(b.company || 'zzz'))
    return list
  }, [normalizedContacts, search, sortBy])

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase()
    let list = !search ? normalizedCompanies : normalizedCompanies.filter(c =>
      c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)
    )
    if (sortBy === 'name_asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'name_desc') list = [...list].sort((a, b) => b.name.localeCompare(a.name))
    return list
  }, [normalizedCompanies, search, sortBy])

  const items = view === 'people' ? filteredContacts : filteredCompanies
  const paged = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))

  // ── Styles ──
  const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(0,0,0,0.06)', fontFamily: C.font }
  const tdStyle = { padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 12.5, fontFamily: C.font }

  return (
    <div style={{ fontFamily: C.font, color: '#0A0A0A', background: '#FEFEFC', minHeight: 'calc(100vh - 56px)' }}>
      {/* PageHead — matching sandbox exactly */}
      <div style={{ padding: '24px 44px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#0A0A0A', marginBottom: 10 }}>CRM</div>
            <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 300, fontSize: 36, letterSpacing: '-0.018em', lineHeight: 1.0, margin: 0 }}>{view === 'people' ? 'Contacts' : 'Organisations'}</h1>
            <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 8 }}>{items.length.toLocaleString()} of {view === 'people' ? `${normalizedContacts.length.toLocaleString()} contacts` : `${normalizedCompanies.length.toLocaleString()} organisations`}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', borderRadius: 24, padding: 2 }}>
              {['people', 'companies'].map(v => (
                <button key={v} onClick={() => switchView(v)} style={{ padding: '5px 14px', borderRadius: 24, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: C.font, background: view === v ? '#fff' : 'transparent', color: view === v ? '#0A0A0A' : '#6B6B6B', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.04)' : 'none', transition: 'all 0.15s' }}>{v === 'people' ? 'People' : 'Companies'}</button>
              ))}
            </div>
            <button style={{ height: 32, padding: '0 14px', background: '#0A0A0A', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 4, fontSize: 12, fontWeight: 500, fontFamily: C.font }}>+ Add</button>
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div style={{ padding: '0 44px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder={`Search ${view === 'people' ? 'people' : 'companies'}…`}
          style={{ width: 280, padding: '8px 12px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, fontFamily: C.font, fontWeight: 450, background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 2 }}>
          {[{ id: 'name_asc', label: 'A–Z' }, { id: 'name_desc', label: 'Z–A' }, ...(view === 'people' ? [{ id: 'company_asc', label: 'Company' }] : [])].map(s => (
            <button key={s.id} onClick={() => { setSortBy(s.id); setPage(0) }} style={{ padding: '5px 10px', borderRadius: 6, border: sortBy === s.id ? '1px solid #0A0A0A' : '1px solid rgba(0,0,0,0.08)', background: sortBy === s.id ? 'rgba(0,0,0,0.04)' : 'transparent', fontSize: 11, fontWeight: 500, color: sortBy === s.id ? '#0A0A0A' : '#6B6B6B', cursor: 'pointer', fontFamily: C.font }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ margin: '0 44px 20px', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {view === 'people'
              ? ['Name', 'Company', 'Title', 'Sector', 'Last contacted'].map(h => <th key={h} style={thStyle}>{h}</th>)
              : ['Company', 'Industry', 'Size', 'Location', 'Funding', 'Revenue'].map(h => <th key={h} style={thStyle}>{h}</th>)
            }
          </tr></thead>
          <tbody>
            {view === 'people' ? paged.map(c => (
              <tr key={c.id} onClick={() => nav(`/contacts/${c.id}`)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { for (const td of e.currentTarget.children) td.style.background = '#F5F4F1' }}
                onMouseLeave={e => { for (const td of e.currentTarget.children) td.style.background = 'transparent' }}>
                <td style={tdStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {c.picture ? (
                    <img src={c.picture} alt="" referrerPolicy="no-referrer" loading="lazy" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'grid' }} />
                  ) : null}
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `hsl(${c.name.charCodeAt(0) * 7 % 360}, 45%, 55%)`, display: c.picture ? 'none' : 'grid', placeItems: 'center', fontSize: 9, fontWeight: 600, color: '#fff', flexShrink: 0 }}>{initials(c.name)}</div>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                </div></td>
                <td style={{ ...tdStyle, color: '#6B6B6B' }}>{c.company || '—'}</td>
                <td style={{ ...tdStyle, color: '#6B6B6B' }}>{c.title || '—'}</td>
                <td style={{ ...tdStyle, color: '#A0A0A0', fontSize: 11 }}>{c.sector || '—'}</td>
                <td style={{ ...tdStyle, color: '#A0A0A0', fontSize: 11 }}>{c.lastContacted || '—'}</td>
              </tr>
            )) : paged.map(c => (
              <tr key={c.id} onClick={() => nav(`/records/company/${c.id}`)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { for (const td of e.currentTarget.children) td.style.background = '#F5F4F1' }}
                onMouseLeave={e => { for (const td of e.currentTarget.children) td.style.background = 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                <td style={{ ...tdStyle, color: '#6B6B6B' }}>{c.industry || '—'}</td>
                <td style={{ ...tdStyle, color: '#A0A0A0', fontSize: 11 }}>{c.size || '—'}</td>
                <td style={{ ...tdStyle, color: '#A0A0A0', fontSize: 11 }}>{c.location || '—'}</td>
                <td style={{ ...tdStyle, fontSize: 11 }}>{c.totalFunding || '—'}</td>
                <td style={{ ...tdStyle, fontSize: 11 }}>{c.revenueEst || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
            {search ? `No ${view === 'people' ? 'contacts' : 'companies'} match "${search}".` : `No ${view === 'people' ? 'contacts' : 'organisations'} yet.`}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>Loading…</div>
        )}
      </div>

      {/* Pagination */}
      {items.length > PAGE_SIZE && (
        <div style={{ padding: '0 44px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', background: page === 0 ? 'transparent' : '#fff', color: page === 0 ? '#A0A0A0' : '#0A0A0A', fontSize: 12, fontWeight: 500, cursor: page === 0 ? 'default' : 'pointer', fontFamily: C.font }}>Previous</button>
          <span style={{ fontSize: 12, color: '#6B6B6B' }}>{page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', background: page >= totalPages - 1 ? 'transparent' : '#fff', color: page >= totalPages - 1 ? '#A0A0A0' : '#0A0A0A', fontSize: 12, fontWeight: 500, cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontFamily: C.font }}>Next</button>
        </div>
      )}
    </div>
  )
}
