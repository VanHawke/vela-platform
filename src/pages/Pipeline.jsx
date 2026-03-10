import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, X, DollarSign } from 'lucide-react'

const PIPELINES = ['', 'ONE Championship', 'Haas F1', 'Formula E', 'Alpine F1', 'Esports']

const STAGES = [
  { id: 'Contact made', label: 'Contact Made', color: 'border-white/20' },
  { id: 'In Dialogue', label: 'In Dialogue', color: 'border-indigo-500/40' },
  { id: 'Meeting arranged', label: 'Meeting', color: 'border-cyan-500/40' },
  { id: 'Qualified', label: 'Qualified', color: 'border-blue-500/40' },
  { id: 'Proposal made', label: 'Proposal', color: 'border-violet-500/40' },
  { id: 'Negotiations started', label: 'Negotiation', color: 'border-amber-500/40' },
  { id: 'Closed Won', label: 'Won', color: 'border-emerald-500/40' },
  { id: 'Closed Lost', label: 'Lost', color: 'border-red-500/40' },
]

export default function Pipeline() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(null)
  const [pipelineFilter, setPipelineFilter] = useState('')
  const [newDeal, setNewDeal] = useState({ title: '', company: '', value: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false })
    setDeals((data || []).map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at })))
    setLoading(false)
  }

  const filteredDeals = useMemo(() => {
    if (!pipelineFilter) return deals
    return deals.filter(d => d.pipeline === pipelineFilter)
  }, [deals, pipelineFilter])

  const addDeal = async (stage) => {
    if (!newDeal.title.trim()) return
    const id = `deal${Date.now()}`
    const now = new Date().toISOString()
    const data = {
      id, title: newDeal.title, company: newDeal.company,
      value: newDeal.value ? Number(newDeal.value) : 0,
      stage, status: 'open', pipeline: pipelineFilter || '',
      source: 'Manual', owner: 'Sunny Sidhu', createdAt: now.split('T')[0],
    }
    await supabase.from('deals').upsert({ id, data, updated_at: now }, { onConflict: 'id' })
    setDeals(prev => [{ ...data, updated_at: now }, ...prev])
    setAdding(null)
    setNewDeal({ title: '', company: '', value: '' })
  }

  const moveStage = async (deal, newStage) => {
    const now = new Date().toISOString()
    const data = { ...deal }
    delete data.updated_at
    data.stage = newStage
    if (newStage === 'Closed Won') data.status = 'won'
    else if (newStage === 'Closed Lost') data.status = 'lost'
    else data.status = 'open'
    await supabase.from('deals').upsert({ id: deal.id, data, updated_at: now }, { onConflict: 'id' })
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...data, updated_at: now } : d))
  }

  const deleteDeal = async (id) => {
    await supabase.from('deals').delete().eq('id', id)
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  const dealsByStage = (stageId) => filteredDeals.filter(d => d.stage === stageId)

  const formatValue = (v) => {
    if (!v) return null
    return Number(v).toLocaleString()
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Pipeline</h1>
          <p className="text-xs text-white/30 mt-0.5">{filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}</p>
        </div>
        <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/60 outline-none focus:border-white/25 transition-colors">
          <option value="" className="bg-[#1a1a1a]">All Pipelines</option>
          {PIPELINES.filter(Boolean).map(p => <option key={p} value={p} className="bg-[#1a1a1a]">{p}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {STAGES.map(stage => {
            const stageDeals = dealsByStage(stage.id)
            const stageTotal = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
            return (
              <div key={stage.id} className={`w-64 flex flex-col glass rounded-xl border ${stage.color} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-white/8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">{stage.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/30">{stageDeals.length}</span>
                      <button onClick={() => { setAdding(stage.id); setNewDeal({ title: '', company: '', value: '' }) }} className="text-white/30 hover:text-white/60 transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {stageTotal > 0 && <p className="text-[10px] text-white/25 mt-1">{'\u00A3'}{stageTotal.toLocaleString()}</p>}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {adding === stage.id && (
                    <div className="bg-white/8 rounded-lg p-3 space-y-2">
                      <input autoFocus value={newDeal.title} onChange={e => setNewDeal(p => ({ ...p, title: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addDeal(stage.id)} placeholder="Deal name" className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none border-b border-white/20 pb-1" />
                      <input value={newDeal.company} onChange={e => setNewDeal(p => ({ ...p, company: e.target.value }))} placeholder="Company" className="w-full bg-transparent text-xs text-white/70 placeholder:text-white/30 outline-none" />
                      <input value={newDeal.value} onChange={e => setNewDeal(p => ({ ...p, value: e.target.value }))} placeholder="Value" type="number" className="w-full bg-transparent text-xs text-white/70 placeholder:text-white/30 outline-none" />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => addDeal(stage.id)} className="flex-1 text-xs bg-white text-black rounded-md py-1 font-medium hover:bg-white/90 transition-colors">Add</button>
                        <button onClick={() => setAdding(null)} className="text-white/30 hover:text-white/60"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                  {loading ? (
                    [...Array(2)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)
                  ) : stageDeals.map(deal => (
                    <div key={deal.id} className="bg-white/5 hover:bg-white/8 rounded-lg p-3 group transition-colors">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm text-white/80 font-medium leading-tight">{deal.title}</p>
                        <button onClick={() => deleteDeal(deal.id)} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all ml-2 flex-shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {deal.company && <p className="text-xs text-white/40 mb-1">{deal.company}</p>}
                      {deal.pipeline && <p className="text-[10px] text-white/25 mb-2">{deal.pipeline}</p>}
                      <div className="flex items-center justify-between">
                        {formatValue(deal.value) ? <span className="text-xs text-white/50 flex items-center gap-0.5"><DollarSign className="h-3 w-3" />{formatValue(deal.value)}</span> : <span />}
                        <select value={deal.stage} onChange={e => moveStage(deal, e.target.value)} className="text-[10px] bg-white/10 text-white/50 rounded px-1.5 py-0.5 outline-none cursor-pointer">
                          {STAGES.map(s => <option key={s.id} value={s.id} className="bg-[#1a1a1a]">{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
