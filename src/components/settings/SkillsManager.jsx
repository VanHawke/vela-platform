import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'

export default function SkillsManager() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // skill id being edited
  const [form, setForm] = useState({ name: '', keywords: '', content: '', active: true })

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase.from('kiko_skills').select('*').order('name')
    setSkills(data || [])
    setLoading(false)
  }

  const startEdit = (skill) => {
    setEditing(skill.id)
    setForm({ name: skill.name, keywords: (skill.trigger_keywords || []).join(', '), content: skill.content || '', active: skill.is_active !== false })
  }

  const startNew = () => {
    setEditing('new')
    setForm({ name: '', keywords: '', content: '', active: true })
  }

  const save = async () => {
    const payload = {
      name: form.name, content: form.content, is_active: form.active,
      trigger_keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
    }
    if (editing === 'new') {
      await supabase.from('kiko_skills').insert(payload)
    } else {
      await supabase.from('kiko_skills').update(payload).eq('id', editing)
    }
    setEditing(null)
    load()
  }

  const toggleActive = async (skill) => {
    await supabase.from('kiko_skills').update({ is_active: !skill.is_active }).eq('id', skill.id)
    load()
  }

  const card = { background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }
  const inp = { width: '100%', background: 'rgba(0,0,0,0.02)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: T.text, fontFamily: T.font, fontWeight: 300, outline: 'none' }

  if (loading) return <div style={{ color: T.textTertiary, fontSize: 14 }}>Loading skills...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: 0, fontFamily: T.font }}>Kiko Skills</h3>
          <p style={{ fontSize: 12, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font }}>{skills.length} skills — auto-injected into Kiko by keyword match</p>
        </div>
        <button onClick={startNew} style={{ padding: '6px 16px', borderRadius: 50, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, color: 'rgba(124,92,252,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: T.font, fontWeight: 400 }}>+ New Skill</button>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Skill name (e.g. negotiation_psychology)" style={inp} />
            <input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} placeholder="Keywords, comma separated (e.g. negotiate, BATNA, concession)" style={inp} />
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Skill content — the knowledge Kiko will use when this skill is triggered..." rows={8} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '6px 16px', borderRadius: 50, background: 'transparent', border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              <button onClick={save} disabled={!form.name || !form.content} style={{ padding: '6px 16px', borderRadius: 50, background: T.accentGradient, border: 'none', color: '#FFFFFF', fontSize: 13, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, opacity: form.name && form.content ? 1 : 0.4 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Skill cards */}
      {skills.map(skill => (
        <div key={skill.id} style={{ ...card, opacity: skill.is_active !== false ? 1 : 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.text, fontFamily: T.font, marginBottom: 3 }}>{skill.name}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font, marginBottom: 6 }}>{(skill.trigger_keywords || []).join(', ')}</div>
            <div style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.font, fontWeight: 300, lineHeight: 1.5, maxHeight: 48, overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.content?.slice(0, 150)}...</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => toggleActive(skill)} style={{ padding: '4px 10px', borderRadius: 50, border: `1px solid ${T.border}`, background: 'transparent', color: skill.is_active !== false ? 'rgba(6,214,160,0.6)' : T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>{skill.is_active !== false ? 'Active' : 'Off'}</button>
            <button onClick={() => startEdit(skill)} style={{ padding: '4px 10px', borderRadius: 50, border: `1px solid ${T.border}`, background: 'transparent', color: T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>Edit</button>
          </div>
        </div>
      ))}
    </div>
  )
}
