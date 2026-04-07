// src/pages/Segments.jsx — Lead segment manager
// Visual rule builder, live preview, auto-enrollment toggle.
import { useState, useEffect } from 'react'
import { Plus, X, Users, Zap, Trash2, Play, ChevronRight, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#0D0D0F', card: '#141416', cardHover: '#1A1A1E',
  border: 'rgba(255,255,255,0.06)', borderHover: 'rgba(255,255,255,0.10)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)',
  textTer: 'rgba(245,245,248,0.32)', textMut: 'rgba(245,245,248,0.16)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399',
  red: '#F87171', amber: '#FBBF24', blue: '#60A5FA',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", r: 8,
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }
const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', color: C.text, fontSize: 12, fontFamily: C.font, outline: 'none' }

const FIELDS = [
  { id: 'data.title', label: 'Title (job)' },
  { id: 'data.email', label: 'Email' },
  { id: 'data.name', label: 'Name' },
  { id: 'data.company', label: 'Company name' },
  { id: 'data.linkedin', label: 'LinkedIn URL' },
  { id: 'company.industry', label: 'Company industry' },
  { id: 'company.employee_count', label: 'Company size' },
  { id: 'company.revenue_estimate', label: 'Company revenue' },
  { id: 'company.hq_location', label: 'Company HQ' },
  { id: 'company.last_funding_round', label: 'Last funding' },
]
const OPS = [
  { id: 'is', label: 'is' },
  { id: 'is_not', label: 'is not' },
  { id: 'contains', label: 'contains' },
  { id: 'not_contains', label: 'does not contain' },
  { id: 'starts_with', label: 'starts with' },
  { id: 'exists', label: 'exists' },
  { id: 'not_exists', label: 'is empty' },
  { id: 'gt', label: '>' },
  { id: 'lt', label: '<' },
  { id: 'gte', label: '≥' },
  { id: 'lte', label: '≤' },
]

export default function Segments() {
  const [segments, setSegments] = useState([])
  const [sequences, setSequences] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | segment
  const [form, setForm] = useState({ name: '', description: '', criteria: { and: [] }, sequence_id: '', auto_enroll: false })
  const [previewCount, setPreviewCount] = useState(null)
  const [previewSample, setPreviewSample] = useState([])
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/segments')
      const j = await r.json()
      setSegments(j.segments || [])
      const { data: seqs } = await supabase.from('kiko_sequences').select('id, name').order('created_at', { ascending: false })
      setSequences(seqs || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function startNew() {
    setForm({ name: '', description: '', criteria: { and: [{ field: 'data.title', op: 'contains', value: '' }] }, sequence_id: '', auto_enroll: false })
    setPreviewCount(null)
    setPreviewSample([])
    setEditing('new')
  }

  function startEdit(seg) {
    setForm({ name: seg.name, description: seg.description || '', criteria: seg.criteria || { and: [] }, sequence_id: seg.sequence_id || '', auto_enroll: !!seg.auto_enroll })
    setPreviewCount(seg.last_match_count || null)
    setPreviewSample([])
    setEditing(seg)
  }

  async function preview() {
    setPreviewing(true)
    try {
      const url = `/api/segments?action=preview_criteria&criteria=${encodeURIComponent(JSON.stringify(form.criteria))}`
      const r = await fetch(url)
      const j = await r.json()
      setPreviewCount(j.count ?? 0)
      setPreviewSample(j.sample || [])
    } catch (e) { console.error(e) }
    setPreviewing(false)
  }

  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    try {
      const isUpdate = editing && editing !== 'new'
      const url = isUpdate ? `/api/segments?id=${editing.id}` : '/api/segments'
      const method = isUpdate ? 'PATCH' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await r.json()
      if (j.segment) {
        await load()
        setEditing(null)
      } else { alert(j.error || 'Save failed') }
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this segment?')) return
    await fetch(`/api/segments?id=${id}`, { method: 'DELETE' })
    await load()
  }

  function addRule() {
    setForm({ ...form, criteria: { and: [...(form.criteria.and || []), { field: 'data.title', op: 'contains', value: '' }] } })
  }
  function updRule(idx, patch) {
    const next = [...(form.criteria.and || [])]
    next[idx] = { ...next[idx], ...patch }
    setForm({ ...form, criteria: { and: next } })
  }
  function delRule(idx) {
    setForm({ ...form, criteria: { and: form.criteria.and.filter((_, i) => i !== idx) } })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, marginBottom: 4 }}>Lead Segments</h1>
          <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>Saved filters that auto-enroll matching contacts into sequences</p>
        </div>
        <button onClick={startNew} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} />New segment</button>
      </div>

      {!editing && (
        <div style={{ ...glass, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: C.textTer, fontSize: 12 }}>Loading...</div>}
          {!loading && segments.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: C.textTer, fontSize: 12 }}>
              <Filter size={28} style={{ marginBottom: 10, opacity: 0.4 }} /><br/>
              No segments yet. Create one to define a target audience and auto-enroll matching contacts.
            </div>
          )}
          {segments.map(seg => (
            <div key={seg.id} onClick={() => startEdit(seg)} style={{ padding: '16px 20px', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(167,139,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={16} style={{ color: C.purple }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{seg.name}</span>
                  {seg.auto_enroll && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: 'rgba(45,212,191,0.10)', color: C.teal, border: '0.5px solid rgba(45,212,191,0.20)', fontWeight: 500 }}>AUTO-ENROLL</span>}
                </div>
                <div style={{ fontSize: 11, color: C.textTer }}>
                  {seg.last_match_count != null ? `${seg.last_match_count} matched` : 'Not run yet'}
                  {seg.total_enrolled > 0 && ` · ${seg.total_enrolled} enrolled total`}
                  {seg.last_run_at && ` · last run ${new Date(seg.last_run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); del(seg.id); }} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer', padding: 6 }}><Trash2 size={13} /></button>
              <ChevronRight size={14} style={{ color: C.textTer }} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div style={{ ...glass, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{editing === 'new' ? 'New segment' : 'Edit segment'}</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.textTer, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</div>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. CMOs at fintech companies" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: C.textTer, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description (optional)</div>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this segment captures" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Criteria — match if ALL of these are true</div>
                <button onClick={addRule} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>+ Add rule</button>
              </div>
              {(form.criteria.and || []).map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <select value={rule.field} onChange={e => updRule(i, { field: e.target.value })} style={{ ...inputStyle, flex: '1.3', fontSize: 11 }}>
                    {FIELDS.map(f => <option key={f.id} value={f.id} style={{ background: '#111' }}>{f.label}</option>)}
                  </select>
                  <select value={rule.op} onChange={e => updRule(i, { op: e.target.value })} style={{ ...inputStyle, flex: '0.8', fontSize: 11 }}>
                    {OPS.map(o => <option key={o.id} value={o.id} style={{ background: '#111' }}>{o.label}</option>)}
                  </select>
                  {rule.op !== 'exists' && rule.op !== 'not_exists' && (
                    <input value={rule.value || ''} onChange={e => updRule(i, { value: e.target.value })} placeholder="value" style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
                  )}
                  <button onClick={() => delRule(i)} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer', padding: 4 }}><X size={12} /></button>
                </div>
              ))}
              {(form.criteria.and || []).length === 0 && (
                <div style={{ padding: 14, textAlign: 'center', color: C.textTer, fontSize: 11, fontStyle: 'italic', border: `0.5px dashed ${C.border}`, borderRadius: 6 }}>No rules — segment will match all contacts. Add a rule to filter.</div>
              )}
            </div>

            <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: 'rgba(45,212,191,0.04)', border: `0.5px solid rgba(45,212,191,0.10)` }}>
              <div style={{ fontSize: 9, color: C.teal, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Auto-enrollment (optional)</div>
              <div style={{ marginBottom: 10 }}>
                <select value={form.sequence_id} onChange={e => setForm({ ...form, sequence_id: e.target.value })} style={{ ...inputStyle, fontSize: 11 }}>
                  <option value="" style={{ background: '#111' }}>Don't auto-enroll (just save the filter)</option>
                  {sequences.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.name}</option>)}
                </select>
              </div>
              {form.sequence_id && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.textSec, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.auto_enroll} onChange={e => setForm({ ...form, auto_enroll: e.target.checked })} />
                  Run daily at 7am MF and auto-enroll new matches
                </label>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 14px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>{saving ? 'Saving...' : 'Save segment'}</button>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ ...glass, padding: 16, alignSelf: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.text }}>Live preview</span>
              <button onClick={preview} disabled={previewing} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Play size={9} />{previewing ? 'Running...' : 'Run'}</button>
            </div>
            {previewCount != null && (
              <>
                <div style={{ fontSize: 28, fontWeight: 500, color: C.purple, textAlign: 'center', padding: '12px 0' }}>{previewCount}</div>
                <div style={{ fontSize: 9, color: C.textTer, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Matches</div>
                {previewSample.length > 0 && (
                  <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 9, color: C.textTer, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sample</div>
                    {previewSample.map((s, i) => (
                      <div key={i} style={{ padding: '6px 0', fontSize: 10, color: C.textSec, borderBottom: i < previewSample.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                        <div style={{ color: C.text, marginBottom: 2 }}>{s.name || s.email}</div>
                        <div style={{ color: C.textTer, fontSize: 9 }}>{s.title} · {s.company}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {previewCount == null && (
              <div style={{ padding: 20, textAlign: 'center', color: C.textTer, fontSize: 10, fontStyle: 'italic' }}>Click "Run" to see how many contacts match your criteria.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
