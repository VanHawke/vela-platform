import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Briefcase, Users, Building2, CheckSquare, TrendingUp } from 'lucide-react'
import PipelineNotifications from '@/components/PipelineNotifications'

const stageColor = (s) => {
  if (s === 'Closed Won') return 'bg-emerald-50 text-emerald-700'
  if (s === 'Closed Lost') return 'bg-red-50 text-red-700'
  if (s === 'Proposal made') return 'bg-violet-50 text-violet-700'
  if (s === 'Negotiations started') return 'bg-amber-50 text-amber-700'
  if (s === 'Qualified') return 'bg-blue-50 text-blue-700'
  return 'bg-black/[0.04] text-[#6B6B6B]'
}

export default function Dashboard({ user }) {
  const [stats, setStats] = useState({ deals: 0, contacts: 0, companies: 0, tasks: 0 })
  const [recentDeals, setRecentDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user?.id) load() }, [user?.id])
  const load = async () => {
    setLoading(true)
    const [dealsRes, contactsRes, companiesRes, tasksRes, dealCountRes] = await Promise.all([
      supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false }).limit(5),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }),
      supabase.from('deals').select('id', { count: 'exact', head: true }),
    ])
    setRecentDeals((dealsRes.data||[]).map(r => ({ id: r.id, ...r.data, updated_at: r.updated_at })))

    setStats({ deals: dealCountRes.count||0, contacts: contactsRes.count||0, companies: companiesRes.count||0, tasks: tasksRes.count||0 })
    setLoading(false)
  }

  const cards = [
    { label: 'Active Deals', value: stats.deals, icon: Briefcase, color: 'text-violet-500' },
    { label: 'Contacts', value: stats.contacts, icon: Users, color: 'text-blue-500' },
    { label: 'Companies', value: stats.companies, icon: Building2, color: 'text-emerald-500' },
    { label: 'Open Tasks', value: stats.tasks, icon: CheckSquare, color: 'text-amber-500' },
  ]

  const fmt = (v, c='GBP') => { if (!v) return ''; const s = c==='USD'?'$':c==='EUR'?'€':'£'; return `${s}${Number(v).toLocaleString()}` }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-[24px] font-semibold text-[#1A1A1A] mb-6">Dashboard</h1>
        <div className="mb-6">
          <PipelineNotifications />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map(c => { const I = c.icon; return (
            <div key={c.label} className="bg-white rounded-2xl p-5 border border-black/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#ABABAB] font-semibold uppercase tracking-wider">{c.label}</span>
                <I className={`h-4 w-4 ${c.color}`} />
              </div>
              <div className="text-[28px] font-semibold text-[#1A1A1A]">
                {loading ? <div className="h-8 w-16 skeleton" /> : c.value.toLocaleString()}
              </div>
            </div>
          )})}
        </div>

        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Recent Deals</h2>
            <TrendingUp className="h-4 w-4 text-[#CDCDCD]" />
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="h-12 skeleton" />)}</div>
          ) : recentDeals.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#ABABAB]">No deals yet</div>
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {recentDeals.map(d => (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-[#1A1A1A] font-medium truncate">{d.title}</p>
                    <p className="text-[12px] text-[#ABABAB] mt-0.5 truncate">{[d.company, d.pipeline].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    {d.value > 0 && <span className="text-[13px] text-[#6B6B6B]">{fmt(d.value, d.currency)}</span>}
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${stageColor(d.stage)}`}>{d.stage}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
