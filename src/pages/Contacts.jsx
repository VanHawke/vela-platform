import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, User, Mail, Phone, Linkedin, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

export default function Contacts() {
  const nav = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
  const [sortDir, setSortDir] = useState('asc')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '', notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('id, data, updated_at').order('updated_at', { ascending: false })
    setContacts((data || []).map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at })))
    setLoading(false)
  }

  const save = async () => {
    if (!form.firstName.trim() && !form.lastName.trim()) return
    const now = new Date().toISOString()
    const id = editing || `c${Date.now()}`
    const existing = contacts.find(c => c.id === id)
    const data = { ...(existing || {}), ...form, id }
    delete data.updated_at
    await supabase.from('contacts').upsert({ id, data, updated_at: now }, { onConflict: 'id' })
    reset(); load()
  }

  const remove = async (id) => {
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const edit = (c) => {
    setEditing(c.id)
    setForm({ firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', title: c.title || '', notes: c.notes || '' })
    setShowForm(true)
  }

  const reset = () => { setShowForm(false); setEditing(null); setForm({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '', notes: '' }) }

  const filtered = useMemo(() => {
    let list = contacts
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => [c.firstName, c.lastName, c.email, c.company, c.title].some(f => f?.toLowerCase().includes(q)))
    }
    list = [...list].sort((a, b) => {
      const nameA = (a.firstName || '').toLowerCase()
      const nameB = (b.firstName || '').toLowerCase()
      return sortDir === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    })
    return list
  }, [contacts, search, sortDir])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  useEffect(() => { setPage(0) }, [search])

  const displayName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed'

  const glass = { margin: '0 16px', padding: '12px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const card = { background: '#FFFFFF', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'box-shadow 0.15s ease', cursor: 'pointer' }
  const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 8 }}>
      <div style={glass}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Contacts</h1>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} contact{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Plus style={{ width: 14, height: 14 }} /> Add Contact
        </button>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." style={{ ...inputStyle, padding: '8px 12px 8px 34px' }} />
        </div>
        <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }}>
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1, color: 'var(--text-secondary)', padding: 2 }}><ChevronLeft style={{ width: 16, height: 16 }} /></button>
            <span>{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1, color: 'var(--text-secondary)', padding: 2 }}><ChevronRight style={{ width: 16, height: 16 }} /></button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(8)].map((_, i) => <div key={i} style={{ height: 64, background: 'rgba(0,0,0,0.03)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}</div>
        ) : paged.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            <User style={{ width: 32, height: 32, marginBottom: 12, opacity: 0.4 }} />
            <p style={{ fontSize: 13, fontFamily: 'var(--font)' }}>{search ? 'No contacts match' : 'No contacts yet'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paged.map(contact => (
              <div key={contact.id} style={card} onClick={() => nav(`/contacts/${contact.id}`)} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'} onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{(contact.firstName || contact.lastName || '?')[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(contact)}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[contact.title, contact.company].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 }}>
                  {contact.email && <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}><Mail style={{ width: 15, height: 15 }} /></a>}
                  {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#0a66c2'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}><Linkedin style={{ width: 15, height: 15 }} /></a>}
                  {contact.phone && <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}><Phone style={{ width: 15, height: 15 }} /></a>}
                  <button onClick={(e) => { e.stopPropagation(); edit(contact) }} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', opacity: 0.5, transition: 'opacity 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); remove(contact.id) }} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, transition: 'all 0.15s', padding: 2 }} onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-tertiary)' }}><X style={{ width: 14, height: 14 }} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div onClick={e => e.target === e.currentTarget && reset()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>{editing ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={reset} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} placeholder="First name *" style={{ ...inputStyle, flex: 1 }} />
                <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Last name" style={{ ...inputStyle, flex: 1 }} />
              </div>
              {[{ key: 'email', placeholder: 'Email', type: 'email' }, { key: 'phone', placeholder: 'Phone' }, { key: 'company', placeholder: 'Company' }, { key: 'title', placeholder: 'Job title' }].map(f => (
                <input key={f.key} type={f.type || 'text'} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
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
