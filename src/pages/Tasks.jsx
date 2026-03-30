import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import { Plus, X, CheckSquare, Square, Calendar, ChevronRight, Send, RefreshCw, Clock, Building2 } from 'lucide-react'
import T from '@/lib/theme'
import DOMPurify from 'dompurify'
import DoubleHelix from '@/components/kiko/DoubleHelix'

function md(text) {
  if (!text) return ''
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(255,255,255,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todo')
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'Email Follow-up', notes: '', dueDate: '', company: '', contact: '' })
  const [kikoLoading, setKikoLoading] = useState(false)
  const [kikoRec, setKikoRec] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').order('updated_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
    const todo = (data || []).filter(t => !t.data?.completed).length
    const topTasks = (data || []).filter(t => !t.data?.completed).slice(0, 10).map(t => `${t.data?.type || 'Task'}: ${t.data?.notes || t.data?.company || '?'}${t.data?.dueDate ? ` (due ${t.data.dueDate})` : ''}`).join(', ')
    setPageContext({ page: 'tasks', summary: `Tasks: ${todo} pending, ${(data || []).length} total`, visibleItems: topTasks })
  }

  const save = async () => {
    if (!form.type.trim()) return
    const newTask = { type: form.type, notes: form.notes, dueDate: form.dueDate || null, company: form.company, contact: form.contact, completed: false, createdAt: new Date().toISOString(), assignedTo: 'Sunny Sidhu' }
    await supabase.from('tasks').insert({ id: `t${Date.now()}`, data: newTask, user_id: user?.id, org_id: user?.app_metadata?.org_id, updated_at: new Date().toISOString() })
    setShowForm(false)
    setForm({ type: 'Email Follow-up', notes: '', dueDate: '', company: '', contact: '' })
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
    if (selected?.id === id) { setSelected(null); setKikoRec(null) }
  }

  // Kiko recommendation for selected task
  const getKikoRec = useCallback(async (task) => {
    setSelected(task)
    setKikoLoading(true)
    setKikoRec(null)
    try {
      const d = task.data || {}
      const prompt = `I have a task: "${d.type || 'Task'}" for ${d.company || 'unknown company'}${d.contact ? ` (contact: ${d.contact})` : ''}. Notes: "${d.notes || 'none'}". Due: ${d.dueDate || 'no date set'}. ${d.completed ? 'COMPLETED.' : ''}\n\nProvide:\n1. ANALYSIS — One paragraph on the current state, what we know about this company/contact, and any timing signals.\n2. RECOMMENDED ACTION — What specifically to do next.\n3. SUGGESTED DRAFT — If this is an email or LinkedIn task, write a draft message (max 150 words, authority tone, no pricing, no pleasantries).\n4. TIMING — When to execute this action and why.\n\nBe specific and actionable. Use web search if needed for company intelligence.`

      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, currentPage: 'tasks', userEmail: user?.email || '', conversationHistory: [] })
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6); if (raw === '[DONE]') continue
          try { const j = JSON.parse(raw); if (j.delta) { full += j.delta; setKikoRec(full) } } catch {}
        }
      }
      if (full) setKikoRec(full)
    } catch (e) { setKikoRec('Error generating recommendation: ' + e.message) }
    finally { setKikoLoading(false) }
  }, [user])

  const filtered = tasks.filter(t => {
    if (filter === 'todo') return !t.data?.completed
    if (filter === 'done') return t.data?.completed
    if (filter === 'overdue') return !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < new Date()
    return true
  })

  const overdueCount = tasks.filter(t => !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < new Date()).length
  const todoCount = tasks.filter(t => !t.data?.completed).length

  const priorityColor = (task) => {
    const d = task.data || {}
    if (d.completed) return 'rgba(6,214,160,0.4)'
    if (d.dueDate && new Date(d.dueDate) < new Date()) return 'rgba(255,59,48,0.6)'
    if (d.dueDate && new Date(d.dueDate) < new Date(Date.now() + 7 * 86400000)) return 'rgba(245,158,11,0.5)'
    return 'rgba(212,167,106,0.3)'
  }

  const card = { background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.04)`, borderRadius: 12, padding: '12px 14px', marginBottom: 6, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'all 0.15s' }
  const inp = { width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: '8px 12px', fontSize: 14, color: T.text, fontFamily: T.font, fontWeight: 300, outline: 'none' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textTertiary, fontFamily: T.font, fontWeight: 300 }}>Loading tasks...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: T.font }}>
      {/* LEFT — Task List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 400, color: T.text, margin: 0 }}>Tasks</h1>
            <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>{todoCount} outstanding{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(212,167,106,0.08)', border: '1px solid rgba(212,167,106,0.15)', color: 'rgba(212,167,106,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> New</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 10px', flexWrap: 'wrap' }}>
          {[['todo', `Outstanding (${todoCount})`], ['overdue', `Overdue (${overdueCount})`], ['done', 'Completed'], ['all', 'All']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 400, cursor: 'pointer', fontFamily: T.font,
              border: `1px solid ${filter === key ? 'rgba(212,167,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
              background: filter === key ? 'rgba(212,167,106,0.08)' : 'transparent',
              color: filter === key ? 'rgba(212,167,106,0.8)' : 'rgba(255,255,255,0.3)',
            }}>{label}</button>
          ))}
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {/* New task form */}
          {showForm && (
            <div style={{ ...card, flexDirection: 'column', gap: 8, marginBottom: 12, borderColor: 'rgba(212,167,106,0.15)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...inp, flex: 1 }}>
                  <option value="Email Follow-up">Email Follow-up</option>
                  <option value="LinkedIn Follow-up">LinkedIn Follow-up</option>
                  <option value="Schedule Call">Schedule Call</option>
                  <option value="Send Proposal">Send Proposal</option>
                  <option value="Internal Review">Internal Review</option>
                  <option value="Contract Review">Contract Review</option>
                  <option value="Other">Other</option>
                </select>
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company" style={{ ...inp, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Contact name" style={{ ...inp, flex: 1 }} />
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ ...inp, flex: 1 }} />
              </div>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes / description" style={inp} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={save} style={{ padding: '7px 20px', borderRadius: 8, background: 'rgba(212,167,106,0.12)', border: '1px solid rgba(212,167,106,0.2)', color: 'rgba(212,167,106,0.8)', fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Save</button>
                <button onClick={() => setShowForm(false)} style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: `1px solid rgba(255,255,255,0.06)`, color: T.textTertiary, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontWeight: 300, fontSize: 14 }}>
              {filter === 'done' ? 'No completed tasks.' : 'No outstanding tasks.'}
            </div>
          )}

          {filtered.map(task => {
            const d = task.data || {}
            const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && !d.completed
            const isSelected = selected?.id === task.id
            return (
              <div key={task.id} onClick={() => getKikoRec(task)} style={{
                ...card,
                borderColor: isSelected ? 'rgba(212,167,106,0.3)' : 'rgba(255,255,255,0.04)',
                background: isSelected ? 'rgba(212,167,106,0.03)' : 'rgba(255,255,255,0.02)',
              }}
                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}}
                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}}
              >
                {/* Priority bar */}
                <div style={{ width: 3, height: 36, borderRadius: 2, flexShrink: 0, marginTop: 2, background: priorityColor(task) }} />
                {/* Checkbox */}
                <button onClick={e => { e.stopPropagation(); toggle(task) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: d.completed ? 'rgba(6,214,160,0.5)' : T.textTertiary, flexShrink: 0, padding: 0, marginTop: 1 }}>
                  {d.completed ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{d.type || 'Task'}</div>
                  <div style={{ fontSize: 14, fontWeight: 400, color: d.completed ? T.textTertiary : 'rgba(255,255,255,0.8)', textDecoration: d.completed ? 'line-through' : 'none', marginBottom: 4, lineHeight: 1.4 }}>{d.notes || d.type || 'Untitled'}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {d.company && <span style={{ fontSize: 11, color: 'rgba(0,212,170,0.5)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: 3 }}><Building2 size={9} /> {d.company}</span>}
                    {d.contact && <span style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300 }}>{d.contact}</span>}
                    {d.dueDate && <span style={{ fontSize: 11, color: isOverdue ? 'rgba(255,59,48,0.6)' : T.textTertiary, fontWeight: 300, display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={9} /> {new Date(d.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{isOverdue ? ' · Overdue' : ''}</span>}
                  </div>
                </div>
                {/* Delete */}
                <button onClick={e => { e.stopPropagation(); deleteTask(task.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.08)', flexShrink: 0, padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,59,48,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.08)'}
                ><X size={13} /></button>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT — Kiko Recommendation Panel */}
      <div style={{ flex: 1, borderLeft: `1px solid rgba(255,255,255,0.04)`, display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.01)', flexShrink: 0, minWidth: 0 }}>
        {/* Panel header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 40, height: 12, overflow: 'hidden' }}>
            <DoubleHelix width={40} height={12} mini />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(212,167,106,0.6)', letterSpacing: '0.04em' }}>Kiko Recommendation</span>
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!selected && !kikoLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textTertiary, fontWeight: 300, fontSize: 13 }}>
              <div style={{ marginBottom: 8, opacity: 0.3 }}><ChevronRight size={20} /></div>
              Select a task to get Kiko's recommendation
            </div>
          )}

          {kikoLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
              <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DoubleHelix width={48} height={48} />
              </div>
              <span style={{ fontSize: 13, color: 'rgba(212,167,106,0.6)', fontWeight: 400 }}>Analysing task...</span>
            </div>
          )}

          {kikoRec && selected && (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: 300, lineHeight: 1.65 }}>
              {/* Task context header */}
              <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{selected.data?.type}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{selected.data?.company}{selected.data?.contact ? ` · ${selected.data.contact}` : ''}</div>
              </div>
              <span dangerouslySetInnerHTML={{ __html: md(kikoRec) }} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        {selected && kikoRec && !kikoLoading && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => getKikoRec(selected)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '1px solid rgba(212,167,106,0.15)', background: 'rgba(212,167,106,0.04)', color: 'rgba(212,167,106,0.7)', cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Regenerate</button>
            <button onClick={() => { toggle(selected); setSelected(null); setKikoRec(null) }} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '1px solid rgba(6,214,160,0.15)', background: 'rgba(6,214,160,0.04)', color: 'rgba(6,214,160,0.6)', cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><CheckSquare size={10} /> Complete</button>
            <button onClick={() => { navigator.clipboard.writeText(kikoRec) }} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontFamily: T.font }}>Copy</button>
          </div>
        )}
      </div>
    </div>
  )
}
