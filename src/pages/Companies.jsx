import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, Building2, Globe, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
  const [form, setForm] = useState({ name: '', industry: '', website: '', country: '', notes: '' })

  useEffect(() => { load() }, [])

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
  }

  const remove = async (id) => {
    await supabase.from('companies').delete().eq('id', id)
    setCompanies(prev => prev.filter(c => c.id !== id))
  }

  const edit = (c) => {
    setEditing(c.id)
    setForm({ name: c.name || '', industry: c.industry || '', website: c.website || '', country: c.country || '', notes: c.notes || '' })
    setShowForm(true)
  }

  const reset = () => { setShowForm(false); setEditing(null); setForm({ name: '', industry: '', website: '', country: '', notes: '' }) }

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(c => [c.name, c.industry, c.country].some(f => f?.toLowerCase().includes(q)))
  }, [companies, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [search])

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Companies</h1>
          <p className="text-xs text-white/30 mt-0.5">{filtered.length.toLocaleString()} compan{filtered.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 text-xs bg-white text-black px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Company
        </button>
      </div>
      <div className="px-6 py-3 border-b border-white/8 flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 transition-colors" />
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
            <Building2 className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">{search ? 'No companies match' : 'No companies yet'}</p>
          </div>
        ) : (
          <div className="p-6 space-y-2">
            {paged.map(company => (
              <div key={company.id} className="glass rounded-xl border border-white/8 px-5 py-4 flex items-center justify-between group hover:border-white/15 transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-white/50" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/85 truncate">{company.name}</p>
                    <p className="text-xs text-white/40 truncate">{[company.industry, company.country].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  {company.openDeals > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">{company.openDeals} open</span>}
                  {company.wonDeals > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">{company.wonDeals} won</span>}
                  {company.website && <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Globe className="h-4 w-4" /></a>}
                  <button onClick={() => edit(company)} className="text-xs text-white/30 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all">Edit</button>
                  <button onClick={() => remove(company.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X className="h-4 w-4" /></button>
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
              <h2 className="text-base font-semibold text-white">{editing ? 'Edit Company' : 'Add Company'}</h2>
              <button onClick={reset} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {[{ key: 'name', placeholder: 'Company name *' }, { key: 'industry', placeholder: 'Industry' }, { key: 'website', placeholder: 'Website' }, { key: 'country', placeholder: 'Country' }].map(f => (
                <input key={f.key} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
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
