// TemplateEditorModal.jsx — Create/edit document templates
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function TemplateEditorModal({ onClose }) {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', doc_type: 'other', description: '', output_format: 'html', field_schema: [] })

  useEffect(() => { supabase.from('kiko_doc_templates').select('*').order('name').then(({ data }) => setTemplates(data || [])) }, [])

  const save = async () => {
    if (!form.name) return
    if (editing?.id) {
      await supabase.from('kiko_doc_templates').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
    } else {
      await supabase.from('kiko_doc_templates').insert(form)
    }
    setEditing(null); setForm({ name: '', doc_type: 'other', description: '', output_format: 'html', field_schema: [] })
    supabase.from('kiko_doc_templates').select('*').order('name').then(({ data }) => setTemplates(data || []))
  }

  const del = async (id) => {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('kiko_doc_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const S = { input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif' }, label: { fontSize: 11, fontWeight: 600, color: '#6B6B6B', display: 'block', marginBottom: 4 } }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{editing ? (editing.id ? 'Edit Template' : 'New Template') : 'Document Templates'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#A0A0A0' }}>✕</button>
        </div>

        {!editing ? (
          <div>
            {templates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#6B6B6B' }}>{t.doc_type} · {(t.field_schema || []).length} fields · {t.output_format}</div>
                </div>
                <button onClick={() => { setEditing(t); setForm({ name: t.name, doc_type: t.doc_type, description: t.description || '', output_format: t.output_format, field_schema: t.field_schema || [] }) }} style={{ fontSize: 11, color: '#5a6470', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => del(t.id)} style={{ fontSize: 11, color: '#b8643e', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
            <button onClick={() => { setEditing({}); setForm({ name: '', doc_type: 'other', description: '', output_format: 'html', field_schema: [] }) }} style={{ width: '100%', padding: 10, borderRadius: 8, background: '#0A0A0A', border: 'none', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 8 }}>+ New Template</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={S.label}>Name</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={S.input} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={S.label}>Type</label>
                <select value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))} style={S.input}>
                  {['pitch_deck','proposal','nda','brief','report','agreement','other'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                </select></div>
              <div style={{ flex: 1 }}><label style={S.label}>Format</label>
                <select value={form.output_format} onChange={e => setForm(p => ({ ...p, output_format: e.target.value }))} style={S.input}>
                  {['html','pdf','docx'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select></div>
            </div>
            <div><label style={S.label}>Description</label><textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...S.input, resize: 'vertical' }} /></div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={S.label}>Fields ({form.field_schema.length})</label>
                <button onClick={() => setForm(p => ({ ...p, field_schema: [...p.field_schema, { name: '', label: '', type: 'text', required: false }] }))} style={{ fontSize: 11, color: '#5a6470', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add</button>
              </div>
              {form.field_schema.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input value={f.name} onChange={e => { const fs = [...form.field_schema]; fs[i] = { ...fs[i], name: e.target.value }; setForm(p => ({ ...p, field_schema: fs })) }} placeholder="field_name" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }} />
                  <input value={f.label || ''} onChange={e => { const fs = [...form.field_schema]; fs[i] = { ...fs[i], label: e.target.value }; setForm(p => ({ ...p, field_schema: fs })) }} placeholder="Label" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }} />
                  <select value={f.type || 'text'} onChange={e => { const fs = [...form.field_schema]; fs[i] = { ...fs[i], type: e.target.value }; setForm(p => ({ ...p, field_schema: fs })) }} style={{ width: 75, padding: '6px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', fontSize: 11 }}>
                    {['text','number','date','currency','textarea','select'].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <button onClick={() => setForm(p => ({ ...p, field_schema: p.field_schema.filter((_, idx) => idx !== i) }))} style={{ fontSize: 13, color: '#b8643e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', color: '#6B6B6B', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#0A0A0A', border: 'none', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Save Template</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}