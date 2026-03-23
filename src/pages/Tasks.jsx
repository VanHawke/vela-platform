import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import { Plus, X, CheckSquare, Square, Calendar, ChevronRight } from 'lucide-react'
import T from '@/lib/theme'

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todo')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: '', notes: '', dueDate: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').order('updated_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
    const todo = (data || []).filter(t => !t.data?.completed).length
    setPageContext({ page: 'tasks', summary: `Tasks: ${todo} pending, ${(data || []).length} total` })
  }

  const save = async () => {
    if (!form.type.trim()) return
    const newTask = { type: form.type, notes: form.notes, dueDate: form.dueDate || null, completed: false, createdAt: new Date().toISOString(), createdBy: 'Sunny Sidhu', assignedTo: 'Sunny Sidhu' }
    await supabase.from('tasks').insert({ id: `t${Date.now()}`, data: newTask, user_id: user?.id, org_id: user?.app_metadata?.org_id, updated_at: new Date().toISOString() })
    setShowForm(false)
    setForm({ type: '', notes: '', dueDate: '' })
    load()
  }

  const toggle = async (task) => {
    const updated = { ...task.data, completed: !task.data?.completed, completedAt: !task.data?.completed ? new Date().toISOString() : null }
    await supabase.from('tasks').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, data: updated } : t))
  }

  const deleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const filtered = tasks.filter(t => {
    if (filter === 'todo') return !t.data?.completed
    if (filter === 'done') return t.data?.completed
    return true
  })

  const priorityColor = { high: 'rgba(255,59,48,0.6)', medium: 'rgba(245,158,11,0.5)', low: 'rgba(139,108,246,0.3)' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: T.font, fontWeight: 300 }}>Loading tasks...</div>

  const card = { background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.04)`, borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', transition: 'all 0.15s' }

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 400, color: T.text, fontFamily: T.font, margin: 0 }}>Tasks</h1>
          <p style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font, fontWeight: 300, marginTop: 2 }}>
            {filtered.length} {filter === 'done' ? 'completed' : 'outstanding'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['todo', 'done', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 400,
              border: `1px solid ${filter === f ? 'rgba(139,108,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
              background: filter === f ? 'rgba(139,108,246,0.08)' : 'transparent',
              color: filter === f ? 'rgba(139,108,246,0.8)' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', fontFamily: T.font,
            }}>{f === 'todo' ? 'Outstanding' : f === 'done' ? 'Completed' : 'All'}</button>
          ))}
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '5px 14px', borderRadius: 20, background: 'rgba(139,108,246,0.08)',
            border: '1px solid rgba(139,108,246,0.15)', color: 'rgba(139,108,246,0.7)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font,
          }}>+ New</button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...card, flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Task type (e.g. Email Follow-up, Schedule Call)" style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: T.text, fontFamily: T.font, fontWeight: 300, outline: 'none' }} />
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: T.text, fontFamily: T.font, fontWeight: 300, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.text, fontFamily: T.font, outline: 'none' }} />
            <button onClick={save} style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(139,108,246,0.12)', border: '1px solid rgba(139,108,246,0.2)', color: 'rgba(139,108,246,0.8)', fontSize: 12, cursor: 'pointer', fontFamily: T.font }}>Save</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: `1px solid rgba(255,255,255,0.06)`, color: T.textTertiary, fontSize: 12, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontFamily: T.font, fontWeight: 300, fontSize: 13 }}>
          {filter === 'done' ? 'No completed tasks yet.' : 'No outstanding tasks. Nice work.'}
        </div>
      )}

      {filtered.map(task => {
        const d = task.data || {}
        const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && !d.completed
        return (
          <div key={task.id} style={card}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}
          >
            <button onClick={() => toggle(task)} style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: d.completed ? 'rgba(6,214,160,0.5)' : T.textTertiary, flexShrink: 0 }}>
              {d.completed ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{d.type || 'Task'}</div>
              <div style={{ fontSize: 13, fontWeight: 400, color: d.completed ? T.textTertiary : T.text, fontFamily: T.font, textDecoration: d.completed ? 'line-through' : 'none', marginBottom: 4 }}>{d.notes || d.type || 'Untitled'}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {d.assignedTo && <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 300 }}>{d.assignedTo}</span>}
                {d.dueDate && <span style={{ fontSize: 10, color: isOverdue ? 'rgba(255,59,48,0.6)' : T.textTertiary, fontWeight: 300, display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={10} /> {new Date(d.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{isOverdue ? ' · Overdue' : ''}</span>}
              </div>
            </div>
            <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.1)', flexShrink: 0 }}><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
