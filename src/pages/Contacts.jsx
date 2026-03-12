import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, User, Mail, Phone, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
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
    if (!search) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c => [c.firstName, c.lastName, c.email, c.company, c.title].some(f => f?.toLowerCase().includes(q)))
  }, [contacts, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [search])

  const displayName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed'

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div style={{
        margin: '8px 16px 0', padding: '12px 20px', borderRadius: 16,
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Contacts</h1>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} contact{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: 8,
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          <Plus className="h-3.5 w-3.5" /> Add Contact
        </button>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." style={{
            width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 12px 8px 34px', fontSize: 13, color: 'var(--text)',
            outline: 'none', fontFamily: 'var(--font)',
          }} />
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="disabled:opacity-20 hover:text-white/60 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="disabled:opacity-20 hover:text-white/60 transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/25">
            <User className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">{search ? 'No contacts match' : 'No contacts yet'}</p>
          </div>
        ) : (
          <div className="p-6 space-y-2">
            {paged.map(contact => (
              <div key={contact.id} className="glass rounded-xl border border-white/8 px-5 py-4 flex items-center justify-between group hover:border-white/15 transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-white/70">{(contact.firstName || contact.lastName || '?')[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/85 truncate">{displayName(contact)}</p>
                    <p className="text-xs text-white/40 truncate">{[contact.title, contact.company].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  {contact.status && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/30">{contact.status}</span>}
                  {contact.email && <a href={`mailto:${contact.email}`} className="text-white/30 hover:text-white/60 transition-colors"><Mail className="h-4 w-4" /></a>}
                  {contact.phone && <a href={`tel:${contact.phone}`} className="text-white/30 hover:text-white/60 transition-colors"><Phone className="h-4 w-4" /></a>}
                  <button onClick={() => edit(contact)} className="text-xs text-white/30 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all">Edit</button>
                  <button onClick={() => remove(contact.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && reset()}>
          <div className="glass rounded-2xl border border-white/15 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editing ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={reset} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} placeholder="First name *" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
                <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Last name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              </div>
              {[{ key: 'email', placeholder: 'Email', type: 'email' }, { key: 'phone', placeholder: 'Phone' }, { key: 'company', placeholder: 'Company' }, { key: 'title', placeholder: 'Job title' }].map(f => (
                <input key={f.key} type={f.type || 'text'} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              ))}
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors resize-none" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={reset} className="flex-1 py-2 text-sm text-white/50 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={save} className="flex-1 py-2 text-sm bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
