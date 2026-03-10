import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Briefcase, Users, Building2, CheckSquare, TrendingUp } from 'lucide-react'

const stageColor = (s) => {
  if (s === 'Closed Won') return 'bg-emerald-500/20 text-emerald-300'
  if (s === 'Closed Lost') return 'bg-red-500/20 text-red-300'
  if (s === 'Proposal made') return 'bg-violet-500/20 text-violet-300'
  if (s === 'Negotiations started') return 'bg-amber-500/20 text-amber-300'
  if (s === 'Qualified') return 'bg-blue-500/20 text-blue-300'
  return 'bg-white/10 text-white/50'
}

export default function Dashboard({ user }) {
  const [stats, setStats] = useState({ deals: 0, contacts: 0, companies: 0, tasks: 0 })
  const [recentDeals, setRecentDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [dealsRes, contactsRes, companiesRes, tasksRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at').order('updated_at', { ascending: false }).limit(5),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'todo'),
      ])
      const deals = (dealsRes.data || []).map(row => ({ id: row.id, ...row.data, updated_at: row.updated_at }))
      setStats({
        deals: deals.length,
        contacts: contactsRes.count || 0,
        companies: companiesRes.count || 0,
        tasks: tasksRes.count || 0,
      })
      setRecentDeals(deals)
    } catch (err) {
      console.error('[Dashboard]', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Active Deals', value: stats.deals, icon: Briefcase, color: 'text-violet-400' },
    { label: 'Contacts', value: stats.contacts, icon: Users, color: 'text-blue-400' },
    { label: 'Companies', value: stats.companies, icon: Building2, color: 'text-emerald-400' },
    { label: 'Open Tasks', value: stats.tasks, icon: CheckSquare, color: 'text-amber-400' },
  ]

  const formatCurrency = (v, currency = 'GBP') => {
    if (!v) return ''
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : '\u00A3'
    return `${sym}${Number(v).toLocaleString()}`
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-white mb-6">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className="glass rounded-xl p-4 border border-white/8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40 font-medium uppercase tracking-wide">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="text-3xl font-semibold text-white">
                  {loading ? <div className="h-8 w-12 bg-white/10 rounded animate-pulse" /> : card.value.toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
        <div className="glass rounded-xl border border-white/8 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Deals</h2>
            <TrendingUp className="h-4 w-4 text-white/30" />
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}</div>
          ) : recentDeals.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/25">No deals yet</div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentDeals.map(deal => (
                <div key={deal.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/3 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/80 font-medium truncate">{deal.title}</p>
                    <p className="text-xs text-white/30 mt-0.5 truncate">{[deal.company, deal.pipeline].filter(Boolean).join(' \u00B7 ') || '\u2014'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    {deal.value > 0 && <span className="text-sm text-white/60">{formatCurrency(deal.value, deal.currency)}</span>}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${stageColor(deal.stage)}`}>{deal.stage}</span>
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
