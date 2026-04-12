// src/components/campaigns/BulkEditStepsModal.jsx
// Bulk find/replace inside step content across sequences in a category.
// Sunny spec 2026-04-12 v0.0.40 (deferred from 4c).

import { useState, useEffect } from 'react'
import { X, Edit3, Check, AlertTriangle } from 'lucide-react'

const T = {
  text: '#f4f4f6',
  textTertiary: '#9b9ba3',
  accent: '#7c5cfc',
  accentTeal: '#7c5cfc',
  border: '#26262f',
  surface: 'rgba(124,92,252,0.04)',
  glass: 'rgba(20,20,22,0.92)',
}

const CATEGORIES = [
  'banking', 'fintech', 'cybersecurity', 'cloud', 'ai_data', 'software',
  'semiconductors', 'telecom', 'gaming', 'crypto', 'energy', 'automotive',
  'hospitality', 'fashion', 'watches', 'food_bev', 'health', 'logistics',
  'legal', 'robotics',
]

export default function BulkEditStepsModal({ onClose, initialCategory }) {
  const [category, setCategory] = useState(initialCategory || 'cybersecurity')
  const [sequences, setSequences] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [fields, setFields] = useState({ template: true, subject: true })
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)

  const loadSequences = async () => {
    setLoading(true)
    setResults(null)
    try {
      const r = await fetch(`/api/bulk-edit-steps?category=${category}`)
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setSequences(data.sequences || [])
      setSelectedIds(new Set((data.sequences || []).map(s => s.id)))
    } catch (err) {
      alert('Failed to load sequences: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSequences() }, [category])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const onApply = async () => {
    if (selectedIds.size === 0) return alert('Pick at least one sequence')
    if (!find) return alert('Find string required')
    if (find === replace) return alert('Find and replace are identical (no-op)')
    const targetFields = Object.keys(fields).filter(k => fields[k])
    if (targetFields.length === 0) return alert('Pick at least one field (template or subject)')
    if (!confirm(`Apply this change to ${selectedIds.size} sequences? This is permanent.`)) return

    setRunning(true)
    try {
      const r = await fetch('/api/bulk-edit-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence_ids: [...selectedIds], find, replace, fields: targetFields,
        }),
      })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'apply failed')
      setResults(data)
    } catch (err) {
      alert('Failed to apply: ' + err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 720, maxHeight: '90vh',
        background: T.glass, borderRadius: 14,
        border: `1px solid ${T.border}`, padding: 24,
        display: 'flex', flexDirection: 'column', gap: 14,
        overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Edit3 size={16} color={T.accent} />
            <h2 style={{ fontSize: 16, fontWeight: 500, color: T.text, margin: 0 }}>Bulk edit step content</h2>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, background: 'transparent',
            border: `1px solid ${T.border}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary,
          }}><X size={13} /></button>
        </div>

        <div style={{ fontSize: 11, color: T.textTertiary, lineHeight: 1.5 }}>
          Find/replace text inside step templates and subjects across all sequences in a category.
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Category</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sequences in {category} ({sequences.length})
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setSelectedIds(new Set(sequences.map(s => s.id)))}
                style={{ padding: '4px 10px', borderRadius: 5, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 10, cursor: 'pointer' }}>
                Select all
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ padding: '4px 10px', borderRadius: 5, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 10, cursor: 'pointer' }}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, maxHeight: 180, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 16, fontSize: 11, color: T.textTertiary, textAlign: 'center' }}>Loading sequences…</div>}
            {!loading && sequences.length === 0 && <div style={{ padding: 16, fontSize: 11, color: T.textTertiary, textAlign: 'center' }}>No sequences match this category.</div>}
            {!loading && sequences.map(seq => (
              <label key={seq.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderBottom: `0.5px solid ${T.border}`, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={selectedIds.has(seq.id)} onChange={() => toggleSelect(seq.id)} style={{ accentColor: T.accent }} />
                <div style={{ flex: 1, fontSize: 11, color: T.text }}>
                  {seq.name}
                  {seq.is_active && <span style={{ marginLeft: 8, fontSize: 9, color: T.accentTeal, textTransform: 'uppercase' }}>● live</span>}
                </div>
                <div style={{ fontSize: 9, color: T.textTertiary, fontFamily: 'ui-monospace,monospace' }}>{seq.step_count} steps</div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Find</div>
            <textarea value={find} onChange={(e) => setFind(e.target.value)} rows={2} placeholder="Text to find (case-sensitive, exact match)"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Replace with</div>
            <textarea value={replace} onChange={(e) => setReplace(e.target.value)} rows={2} placeholder="Replacement text (leave empty to delete)"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.textTertiary }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={fields.template} onChange={(e) => setFields(f => ({ ...f, template: e.target.checked }))} style={{ accentColor: T.accent }} />
              Template body
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={fields.subject} onChange={(e) => setFields(f => ({ ...f, subject: e.target.checked }))} style={{ accentColor: T.accent }} />
              Email subject
            </label>
          </div>
        </div>

        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.20)',
          display: 'flex', gap: 10,
        }}>
          <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 10, color: '#9b9ba3', lineHeight: 1.5 }}>
            <strong style={{ color: '#fbbf24' }}>This is permanent.</strong> No undo. Test with one sequence first.
          </div>
        </div>

        <button onClick={onApply} disabled={running || loading} style={{
          padding: '12px', borderRadius: 8,
          background: running ? 'rgba(124,92,252,0.10)' : T.accent,
          border: 'none', color: running ? T.accent : '#14141a',
          fontSize: 13, fontWeight: 500, cursor: running ? 'wait' : 'pointer', fontFamily: 'inherit',
          opacity: (running || loading) ? 0.6 : 1,
        }}>
          {running ? 'Applying changes…' : `Apply to ${selectedIds.size} sequence${selectedIds.size === 1 ? '' : 's'}`}
        </button>

        {results && (
          <div style={{
            padding: 12, borderRadius: 8,
            background: 'rgba(124,92,252,0.06)', border: '1px solid rgba(124,92,252,0.30)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Check size={14} color={T.accentTeal} />
              <div style={{ fontSize: 12, fontWeight: 500, color: T.accentTeal }}>
                {results.total_changes} changes across {results.results.filter(r => r.changes > 0).length} sequences
              </div>
            </div>
            <div style={{ fontSize: 10, color: T.textTertiary, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>
              {results.results.map(r => (
                <div key={r.id}>
                  {r.changes > 0 ? '✓' : '·'} <span style={{ color: r.changes > 0 ? T.text : T.textTertiary }}>{r.name}</span> <span style={{ color: T.textTertiary }}>({r.changes})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
