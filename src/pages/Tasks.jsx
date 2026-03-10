import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, X, CheckSquare, Square, Calendar } from 'lucide-react'

const PRIORITIES = ['low', 'medium', 'high']
const priorityColor = (p) => ({ low: 'text-white/30', medium: 'text-amber-400/70', high: 'text-red-400/70' }[p] || 'text-white/30')

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todo')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '' })

  useEffect(() => { if (user?.email) load() }, [user?.email])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').eq('user_email', user.email).order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  const save = async () => {
    if (!form.title.trim()) return
    await supabase.from('tasks').insert({ ...form, user_email: user.email, status: 'todo', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    setShowForm(false)
    setForm({ title: '', description: '', priority: 'medium', due_date: '' })
    load()
  }

  const toggle = async (task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  const remove = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const filtered = tasks.filter(t => filter === 'all' ? true : filter === 'todo' ? t.status !== 'done' : t.status === 'done')

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Tasks</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 text-xs bg-white text-black px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Task
        </button>
      </div>
      <div className="px-6 py-3 border-b border-white/8 flex gap-1">
        {['todo', 'done', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>{f}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/25">
            <CheckSquare className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No {filter === 'all' ? '' : filter} tasks</p>
          </div>
        ) : (
          <div className="p-6 space-y-2">
            {filtered.map(task => (
              <div key={task.id} className={`glass rounded-xl border border-white/8 px-5 py-3.5 flex items-center gap-4 group hover:border-white/15 transition-colors ${task.status === 'done' ? 'opacity-50' : ''}`}>
                <button onClick={() => toggle(task)} className="flex-shrink-0 text-white/40 hover:text-white/70 transition-colors">
                  {task.status === 'done' ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-white/40' : 'text-white/85'}`}>{task.title}</p>
                  {task.description && <p className="text-xs text-white/30 mt-0.5 truncate">{task.description}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {task.due_date && <span className="text-xs text-white/30 flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  <span className={`text-xs font-medium ${priorityColor(task.priority)}`}>{task.priority}</span>
                  <button onClick={() => remove(task.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="glass rounded-2xl border border-white/15 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Add Task</h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task name *" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors" />
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors resize-none" />
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-white/25 transition-colors">
                {PRIORITIES.map(p => <option key={p} value={p} className="bg-[#1a1a1a] capitalize">{p}</option>)}
              </select>
              <input value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} type="date" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-white/25 transition-colors" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm text-white/50 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={save} className="flex-1 py-2 text-sm bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
