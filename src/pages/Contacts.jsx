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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [hoverContact, setHoverContact] = useState(null)
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 })
  const hoverTimer = useRef(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (cancelled) return
      if (error) { console.error('[Contacts] fetch error', error); setContacts([]) }
      else { setContacts(data || []) }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

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
    if (!search) return normalized
    const q = search.toLowerCase()
    return normalized.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    )
  }, [contacts, search])

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))


  const display = paged.length > 0 ? paged : MOCK_CONTACTS

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
            <button className="ct-pri-btn">
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
              return (
                <tr key={c.id} onClick={() => nav(`/contacts/${c.id}`)} onMouseEnter={(e) => onRowEnter(c, e)} onMouseLeave={onRowLeave}>
                  <td><div className="ct-mark">{initials(c.name)}</div></td>
                  <td><div className="ct-name">{c.name || '—'}</div></td>
                  <td>{c.company || '—'}</td>
                  <td>{c.title || '—'}</td>
                  <td>{sector && <span className={`ct-tag ${sectorClass}`}>{sector}</span>}</td>
                  <td className="ct-when">{c.last_touch || c.metadata?.last_touch || '—'}</td>
                  <td>{c.status && <span className={`ct-status ${c.status}`}>{c.status}</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

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
