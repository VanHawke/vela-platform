import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, User, Mail, Phone, Linkedin, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

export default function Contacts({ user }) {
  const nav = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
  const [sortDir, setSortDir] = useState('asc')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '', notes: '' })

  useEffect(() => { if (user?.id) load() }, [user?.id])

  const load = async () => {
    setLoading(true)
    let allData = [], from = 0
    const batch = 1000
    while (true) {
      const { data } = await supabase.from('contacts').select('id, data, updated_at')
        .order('updated_at', { ascending: false }).range(from, from + batch - 1)
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < batch) break
      from += batch
    }
    setContacts(allData.map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at })))
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

  const glass = { padding: '12px 20px', borderRadius: 20, background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(40px) saturate(1.3)', WebkitBackdropFilter: 'blur(40px) saturate(1.3)', border: '0.5px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 50, padding: '10px 14px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }
  const pillBtn = (bg, bc, col) => ({ padding: '8px 18px', borderRadius: 50, background: bg, border: `0.5px solid ${bc}`, fontSize: 11, color: col, fontWeight: 400, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', fontFamily: 'var(--font)' })
  const actionBtn = { width: 30, height: 30, borderRadius: 50, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)', flexShrink: 0 }
  const stageColors = { 'To revisit': ['rgba(255,255,255,0.04)','rgba(255,255,255,0.08)','rgba(255,255,255,0.2)'], 'Contact made': ['rgba(139,108,246,0.08)','rgba(139,108,246,0.15)','rgba(139,108,246,0.55)'], 'In Dialogue': ['rgba(245,158,11,0.08)','rgba(245,158,11,0.15)','rgba(245,158,11,0.6)'], 'Qualified': ['rgba(6,214,160,0.08)','rgba(6,214,160,0.15)','rgba(6,214,160,0.55)'], 'Meeting arranged (brand x RH)': ['rgba(59,130,246,0.08)','rgba(59,130,246,0.15)','rgba(59,130,246,0.55)'] }
  const avatarColors = ['rgba(139,108,246,0.15)', 'rgba(6,214,160,0.15)', 'rgba(236,72,153,0.15)', 'rgba(59,130,246,0.15)', 'rgba(245,158,11,0.15)']
  const avatarTextColors = ['rgba(139,108,246,0.7)', 'rgba(6,214,160,0.7)', 'rgba(236,72,153,0.7)', 'rgba(59,130,246,0.7)', 'rgba(245,158,11,0.7)']
  const getAvatarColor = (name) => { const i = (name || '').charCodeAt(0) % 5; return [avatarColors[i], avatarTextColors[i]] }
  const getStage = (c) => { const s = c.stage || c.dealStage || ''; return stageColors[s] ? s : '' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 200, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.03em', fontFamily: 'var(--font)' }}>Contacts</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontWeight: 300, marginTop: 2, fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} contacts</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: 260, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(30px)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 50, padding: '0 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
            <Search style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginRight: 8 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font)', height: 38, fontWeight: 300 }} />
          </div>
          <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={pillBtn('rgba(139,108,246,0.08)','rgba(139,108,246,0.18)','rgba(139,108,246,0.65)')}>
            <option value="asc">A → Z</option><option value="desc">Z → A</option>
          </select>
          <button onClick={() => setShowForm(true)} style={pillBtn('rgba(6,214,160,0.08)','rgba(6,214,160,0.15)','rgba(6,214,160,0.6)')}>+ Add</button>
        </div>
      </div>

      {/* Main content — list + sidebar */}
      <div style={{ flex: 1, padding: '16px 24px', display: 'flex', gap: 16, overflow: 'hidden' }}>
        {/* Contact list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            [...Array(8)].map((_, i) => <div key={i} style={{ height: 64, background: 'rgba(255,255,255,0.03)', borderRadius: 16, animation: 'shimmer 1.5s infinite' }} />)
          ) : paged.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.15)' }}>
              <User style={{ width: 32, height: 32, marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13, fontFamily: 'var(--font)', fontWeight: 300 }}>{search ? 'No contacts match' : 'No contacts yet'}</p>
            </div>
          ) : (
            <>
              {paged.map(contact => {
                const [abg, atc] = getAvatarColor(contact.firstName || contact.lastName)
                const stage = getStage(contact)
                const sc = stageColors[stage]
                return (
                  <div key={contact.id} onClick={() => nav(`/contacts/${contact.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', border: '0.5px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.3s', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                    {/* Avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: 50, background: abg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 13, fontWeight: 400, color: atc, fontFamily: 'var(--font)' }}>{(contact.firstName || '?')[0]?.toUpperCase()}{(contact.lastName || '')[0]?.toUpperCase() || ''}</span>
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(contact)}</div>
                      <div style={{ fontSize: 12, fontWeight: 300, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{[contact.title, contact.company].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    {/* Stage pill */}
                    {stage && sc && (
                      <div style={{ fontSize: 10, padding: '4px 12px', borderRadius: 50, background: sc[0], border: `0.5px solid ${sc[1]}`, color: sc[2], fontWeight: 400, backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)', whiteSpace: 'nowrap', flexShrink: 0 }}>{stage}</div>
                    )}
                    {/* Quick actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                      {contact.email && <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()} style={actionBtn} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,108,246,0.2)'; e.currentTarget.style.color = 'rgba(139,108,246,0.6)' }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.15)' }}><Mail style={{ width: 14, height: 14 }} /></a>}
                      {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={actionBtn} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,108,246,0.2)'; e.currentTarget.style.color = 'rgba(139,108,246,0.6)' }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.15)' }}><Linkedin style={{ width: 14, height: 14 }} /></a>}
                      {contact.phone && <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()} style={actionBtn} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,108,246,0.2)'; e.currentTarget.style.color = 'rgba(139,108,246,0.6)' }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.15)' }}><Phone style={{ width: 14, height: 14 }} /></a>}
                    </div>
                  </div>
                )
              })}
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font)' }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1, color: 'rgba(255,255,255,0.3)', padding: 4 }}><ChevronLeft style={{ width: 16, height: 16 }} /></button>
                  <span>{page + 1} / {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1, color: 'rgba(255,255,255,0.3)', padding: 4 }}><ChevronRight style={{ width: 16, height: 16 }} /></button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Overview stats */}
          <div style={{ ...glass, flexDirection: 'column', alignItems: 'stretch', padding: 18 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 300, marginBottom: 12, fontFamily: 'var(--font)' }}>Overview</div>
            {[
              ['Total', filtered.length.toLocaleString(), 'rgba(255,255,255,0.6)'],
              ['With email', contacts.filter(c => c.email).length.toLocaleString(), 'rgba(6,214,160,0.6)'],
              ['With company', contacts.filter(c => c.company).length.toLocaleString(), 'rgba(139,108,246,0.6)'],
            ].map(([label, val, col]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 300, fontFamily: 'var(--font)' }}>{label}</span>
                <span style={{ fontSize: 12, color: col, fontWeight: 400, fontFamily: 'var(--font)' }}>{val}</span>
              </div>
            ))}
          </div>
          {/* Alphabet nav */}
          <div style={{ borderRadius: 20, background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(30px)', border: '0.5px solid rgba(255,255,255,0.08)', padding: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => (
              <button key={l} onClick={() => setSearch(l)} style={{ width: 24, height: 24, borderRadius: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontWeight: 300, transition: 'all 0.2s', background: 'transparent', border: 'none', fontFamily: 'var(--font)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,108,246,0.12)'; e.currentTarget.style.color = 'rgba(139,108,246,0.6)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.15)' }}
              >{l}</button>
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div onClick={e => e.target === e.currentTarget && reset()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(24px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'rgba(14,14,20,0.9)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 24, border: '0.5px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 80px rgba(0,0,0,0.5)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 200, color: 'rgba(255,255,255,0.9)', margin: 0, fontFamily: 'var(--font)' }}>{editing ? 'Edit Contact' : 'Add Contact'}</h2>
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
              <button onClick={reset} style={{ flex: 1, padding: '10px 0', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 50, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={save} style={{ flex: 1, padding: '10px 0', fontSize: 13, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font)' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
