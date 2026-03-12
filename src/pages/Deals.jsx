import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, X, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react'

const STAGES = [
  'Contact made', 'In Dialogue', 'Meeting arranged', 'Qualified',
  'Meeting arranged (brand x RH)', 'Proposal made', 'Negotiations started',
  'To revisit', 'Closed Won', 'Closed Lost'
]

const stageColor = (s) => {
  if (s === 'Closed Won') return 'bg-emerald-500/20 text-emerald-300'
  if (s === 'Closed Lost') return 'bg-red-500/20 text-red-300'
  if (s === 'Proposal made') return 'bg-violet-500/20 text-violet-300'
  if (s === 'Negotiations started') return 'bg-amber-500/20 text-amber-300'
  if (s === 'Qualified') return 'bg-blue-500/20 text-blue-300'
  if (s === 'Meeting arranged' || s === 'Meeting arranged (brand x RH)') return 'bg-cyan-500/20 text-cyan-300'
  if (s === 'In Dialogue') return 'bg-indigo-500/20 text-indigo-300'
  if (s === 'To revisit') return 'bg-orange-500/20 text-orange-300'
  return 'bg-white/10 text-white/50'
}

const PAGE_SIZE = 50

export default function Deals() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(0)
  const [form, setForm] = useState({ title: '', company: '', value: '', stage: 'Contact made', pipeline: '', notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false })
    setDeals((data || []).map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at })))
    setLoading(false)
  }

  const save = async () => {
    if (!form.title.trim()) return
    const now = new Date().toISOString()
    const id = editing || `deal${Date.now()}`
    const existing = deals.find(d => d.id === id)
    const data = { ...(existing || {}), ...form, value: form.value ? Number(form.value) : 0, id }
    delete data.updated_at
    await supabase.from('deals').upsert({ id, data, updated_at: now }, { onConflict: 'id' })
    reset(); load()
  }

  const remove = async (id) => {
    await supabase.from('deals').delete().eq('id', id)
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  const edit = (d) => {
    setEditing(d.id)
    setForm({ title: d.title || '', company: d.company || '', value: d.value || '', stage: d.stage || 'Contact made', pipeline: d.pipeline || '', notes: d.notes || '' })
    setShowForm(true)
  }

  const reset = () => { setShowForm(false); setEditing(null); setForm({ title: '', company: '', value: '', stage: 'Contact made', pipeline: '', notes: '' }) }

  const filtered = useMemo(() => {
    let result = deals
    if (stageFilter) result = result.filter(d => d.stage === stageFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d => [d.title, d.company, d.contactName, d.pipeline].some(f => f?.toLowerCase().includes(q)))
    }
    return result
  }, [deals, search, stageFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalValue = filtered.reduce((sum, d) => sum + (Number(d.value) || 0), 0)

  useEffect(() => { setPage(0) }, [search, stageFilter])

  const formatCurrency = (v, currency = 'GBP') => {
    if (!v) return ''
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : '\u00A3'
    return `${sym}${Number(v).toLocaleString()}`
  }

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
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)' }}>Deals</h1>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} deal{filtered.length !== 1 ? 's' : ''}{totalValue > 0 ? ` · Pipeline: ${formatCurrency(totalValue)}` : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: 8,
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          <Plus className="h-3.5 w-3.5" /> Add Deal
        </button>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals..." style={{
            width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 12px 8px 34px', fontSize: 13, color: 'var(--text)',
            outline: 'none', fontFamily: 'var(--font)',
          }} />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 outline-none focus:border-white/25 transition-colors">
          <option value="" className="bg-[#1a1a1a]">All stages</option>
          {STAGES.map(s => <option key={s} value={s} className="bg-[#1a1a1a]">{s}</option>)}
        </select>
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
            <Briefcase className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">{search || stageFilter ? 'No deals match' : 'No deals yet'}</p>
          </div>
        ) : (
          <div className="p-6 space-y-2">
            {paged.map(deal => (
              <div key={deal.id} className="glass rounded-xl border border-white/8 px-5 py-4 flex items-center justify-between group hover:border-white/15 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white/85 truncate">{deal.title}</p>
                    {deal.pipeline && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 flex-shrink-0">{deal.pipeline}</span>}
                  </div>
                  <p className="text-xs text-white/40 truncate">{[deal.company, deal.contactName].filter(Boolean).join(' \u00B7 ') || '\u2014'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  {deal.value > 0 && <span className="text-sm text-white/50">{formatCurrency(deal.value, deal.currency)}</span>}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${stageColor(deal.stage)}`}>{deal.stage}</span>
                  <button onClick={() => edit(deal)} className="text-xs text-white/30 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all">Edit</button>
                  <button onClick={() => remove(deal.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && reset()}>
          <div className="glass rounded-2xl border border-white/15 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editing ? 'Edit Deal' : 'Add Deal'}</h2>
              <button onClick={reset} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Deal name *" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              <input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="Value" type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              <select value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-white/25 transition-colors">
                {STAGES.map(s => <option key={s} value={s} className="bg-[#1a1a1a]">{s}</option>)}
              </select>
              <input value={form.pipeline} onChange={e => setForm(p => ({ ...p, pipeline: e.target.value }))} placeholder="Pipeline (e.g. Haas F1)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
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
