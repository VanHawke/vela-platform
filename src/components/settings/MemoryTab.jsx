// src/components/settings/MemoryTab.jsx
// Memory tab — visualize what Kiko remembers about the user, edit/delete facts.
// Sunny spec 2026-04-12 v0.0.39.
//
// Layout:
//   ┌──────────────────────────────────────────┐
//   │ [Search] [Category filter] [+ Add fact]  │
//   ├──────────────────────────────────────────┤
//   │ Category sidebar │  Fact rows            │
//   │ all (1110)       │   ┌─────────────────┐ │
//   │ inferred (1102)  │   │ value           │ │
//   │ family (1)       │   │ src · 5d ago    │ │
//   │ work (2)         │   │ [edit] [delete] │ │
//   │ ...              │   └─────────────────┘ │
//   └──────────────────────────────────────────┘

import { useState, useEffect } from 'react'
import { Search, Plus, Trash2, Edit3, X, Check } from 'lucide-react'

const T = {
  text: '#EEEEEE',
  textTertiary: 'rgba(238,238,238,0.45)',
  accent: '#A78BFA',
  accentTeal: '#2DD4BF',
  border: 'rgba(238,238,238,0.10)',
  surface: 'rgba(238,238,238,0.04)',
  surfaceHover: 'rgba(238,238,238,0.07)',
  glass: 'rgba(20,20,22,0.6)',
  glassBorder: 'rgba(238,238,238,0.08)',
  font: 'inherit',
  radius: 12,
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function MemoryTab({ user }) {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newFact, setNewFact] = useState({ category: 'manual', key: '', value: '' })

  const PAGE_SIZE = 100

  const load = async (reset = true) => {
    if (!user?.id) return
    if (reset) setLoading(true); else setLoadingMore(true)
    try {
      const offset = reset ? 0 : rows.length
      const params = new URLSearchParams({ user_id: user.id, limit: String(PAGE_SIZE), offset: String(offset) })
      if (category !== 'all') params.set('category', category)
      if (query.trim()) params.set('q', query.trim())
      const r = await fetch(`/api/memory-tab?${params}`)
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      const newRows = data.rows || []
      if (reset) {
        setRows(newRows)
      } else {
        setRows(prev => [...prev, ...newRows])
      }
      setCounts(data.counts || {})
      setTotal(data.total || 0)
      setHasMore(newRows.length === PAGE_SIZE)
    } catch (err) {
      console.error('[MemoryTab] load failed:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { load(true) }, [user?.id, category])

  const onSearch = (e) => {
    if (e.key === 'Enter') load(true)
  }

  const onDelete = async (id) => {
    if (!confirm('Delete this fact? This cannot be undone.')) return
    try {
      const r = await fetch(`/api/memory-tab?id=${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json())?.error || 'delete failed')
      setRows(prev => prev.filter(x => x.id !== id))
      setTotal(t => Math.max(0, t - 1))
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  const onSaveEdit = async (id) => {
    if (!editValue || editValue.length < 3) return
    try {
      const r = await fetch('/api/memory-tab', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value: editValue }),
      })
      if (!r.ok) throw new Error((await r.json())?.error || 'update failed')
      setRows(prev => prev.map(x => x.id === id ? { ...x, value: editValue } : x))
      setEditingId(null)
      setEditValue('')
    } catch (err) {
      alert('Failed to update: ' + err.message)
    }
  }

  const onAddFact = async () => {
    if (!newFact.category || !newFact.key || !newFact.value) {
      alert('All fields required')
      return
    }
    try {
      const r = await fetch('/api/memory-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newFact, user_id: user.id }),
      })
      if (!r.ok) throw new Error((await r.json())?.error || 'add failed')
      setAdding(false)
      setNewFact({ category: 'manual', key: '', value: '' })
      load()
    } catch (err) {
      alert('Failed to add: ' + err.message)
    }
  }

  const categoryList = [
    { id: 'all', label: 'All', count: total },
    ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({ id: cat, label: cat, count }))
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header card */}
      <div style={{
        background: T.glass, backdropFilter: 'blur(24px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        borderRadius: T.radius, border: `0.5px solid ${T.glassBorder}`,
        borderTop: `0.5px solid rgba(238,238,238,0.15)`, padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: T.text, margin: 0, fontFamily: T.font }}>
              What Kiko remembers about you
            </h3>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>
              {total} total facts. Edit or delete anything Kiko has learned. New facts you add are tagged "manual" and never auto-deleted.
            </div>
          </div>
          <button onClick={() => setAdding(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(167,139,250,0.12)', border: `1px solid ${T.accent}`,
            color: T.accent, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
          }}>
            <Plus size={13} /> Add fact
          </button>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px', height: 36, borderRadius: 8,
          background: T.surface, border: `1px solid ${T.border}`,
        }}>
          <Search size={13} color={T.textTertiary} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearch}
            placeholder="Search facts… (press Enter)"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: T.text, fontSize: 12, fontFamily: T.font,
            }}
          />
          {query && (
            <button onClick={() => { setQuery(''); load() }} style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: T.textTertiary,
            }}><X size={12} /></button>
          )}
        </div>
      </div>

      {/* Add fact form */}
      {adding && (
        <div style={{
          background: T.glass, borderRadius: T.radius,
          border: `1px solid ${T.accent}`, padding: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.accent, marginBottom: 10 }}>Add new fact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={newFact.category} onChange={(e) => setNewFact(f => ({ ...f, category: e.target.value }))}
              placeholder="Category (e.g. family, work, preference)"
              style={{ padding: '8px 12px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
            <input value={newFact.key} onChange={(e) => setNewFact(f => ({ ...f, key: e.target.value }))}
              placeholder="Key (short label, e.g. 'Daughter Maya')"
              style={{ padding: '8px 12px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
            <textarea value={newFact.value} onChange={(e) => setNewFact(f => ({ ...f, value: e.target.value }))}
              placeholder="Full fact (e.g. 'Daughter Maya born 12 March 2020, attends Oatlands School Year 1')"
              rows={3}
              style={{ padding: '8px 12px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAdding(false); setNewFact({ category: 'manual', key: '', value: '' }) }}
                style={{ padding: '7px 14px', borderRadius: 6, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>
                Cancel
              </button>
              <button onClick={onAddFact}
                style={{ padding: '7px 14px', borderRadius: 6, background: T.accent, border: 'none', color: '#0A0A0C', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>
                Save fact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content: sidebar + rows */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Category sidebar */}
        <div style={{
          width: 180, flexShrink: 0,
          background: T.glass, borderRadius: T.radius,
          border: `0.5px solid ${T.glassBorder}`,
          padding: 8, maxHeight: 480, overflowY: 'auto',
        }}>
          {categoryList.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 10px', marginBottom: 2, borderRadius: 6,
              background: category === c.id ? 'rgba(167,139,250,0.12)' : 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: T.font,
              color: category === c.id ? T.accent : T.text, fontSize: 11, fontWeight: 500,
              textAlign: 'left', textTransform: 'capitalize',
            }}>
              <span>{c.label}</span>
              <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: 'ui-monospace,monospace' }}>{c.count}</span>
            </button>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && (
            <div style={{ padding: 20, fontSize: 12, color: T.textTertiary, textAlign: 'center' }}>Loading…</div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ padding: 40, fontSize: 12, color: T.textTertiary, textAlign: 'center', background: T.glass, borderRadius: T.radius, border: `0.5px solid ${T.glassBorder}` }}>
              No facts in this category{query ? ` matching "${query}"` : ''}.
            </div>
          )}
          {!loading && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
              {rows.map(row => (
                <div key={row.id} style={{
                  background: T.surface, borderRadius: 8,
                  border: `0.5px solid ${T.border}`, padding: 12,
                  transition: 'background 0.12s',
                }}>
                  {editingId === row.id ? (
                    <div>
                      <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={3}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.accent}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button onClick={() => { setEditingId(null); setEditValue('') }}
                          style={{ padding: '5px 10px', borderRadius: 5, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
                        <button onClick={() => onSaveEdit(row.id)}
                          style={{ padding: '5px 10px', borderRadius: 5, background: T.accentTeal, border: 'none', color: '#0A0A0C', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={10} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, marginBottom: 6 }}>{row.value}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9, color: T.textTertiary }}>
                          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: row.source === 'manual' ? T.accent : T.textTertiary }}>{row.category}</span>
                          <span>·</span>
                          <span>{row.source}</span>
                          <span>·</span>
                          <span>{timeAgo(row.updated_at || row.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setEditingId(row.id); setEditValue(row.value) }}
                            style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Edit"><Edit3 size={11} /></button>
                          <button onClick={() => onDelete(row.id)}
                            style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: `1px solid ${T.border}`, color: 'rgba(255,100,100,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Delete"><Trash2 size={11} /></button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {hasMore && (
                <button onClick={() => load(false)} disabled={loadingMore} style={{
                  padding: '10px 16px', borderRadius: 6, marginTop: 4,
                  background: 'rgba(167,139,250,0.08)', border: `1px solid rgba(167,139,250,0.20)`,
                  color: T.accent, fontSize: 11, fontWeight: 500, cursor: loadingMore ? 'wait' : 'pointer',
                  fontFamily: 'inherit', opacity: loadingMore ? 0.6 : 1,
                }}>
                  {loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
