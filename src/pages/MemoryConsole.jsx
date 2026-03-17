import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Brain, Trash2, Save, Plus, ChevronDown, ChevronRight, Clock, FileText } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function MemoryConsole({ user }) {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)

  const orgId = user?.app_metadata?.org_id

  async function loadMemories() {
    setLoading(true)
    const { data, error } = await supabase
      .from('kiko_memories')
      .select('*')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
    if (!error && data) setMemories(data.filter(m => !m.is_directory))
    setLoading(false)
  }

  useEffect(() => { if (orgId) loadMemories() }, [orgId])

  async function handleSave(id) {
    setSaving(true)
    await supabase.from('kiko_memories')
      .update({ content: editContent, updated_at: new Date().toISOString() })
      .eq('id', id)
    setEditing(null)
    await loadMemories()
    setSaving(false)
  }

  async function handleDelete(id, path) {
    if (!confirm(`Delete memory "${path}"? This cannot be undone.`)) return
    await supabase.from('kiko_memories').delete().eq('id', id)
    await loadMemories()
  }

  async function handleCreate() {
    if (!newPath.trim() || !newContent.trim()) return
    const path = newPath.startsWith('/memories/') ? newPath : `/memories/${newPath}`
    setSaving(true)
    await supabase.from('kiko_memories').insert({
      path, content: newContent, is_directory: false,
      org_id: orgId, updated_at: new Date().toISOString()
    })
    setCreating(false)
    setNewPath('')
    setNewContent('')
    await loadMemories()
    setSaving(false)
  }

  const memoryCount = memories.length
  const totalSize = memories.reduce((sum, m) => sum + (m.content?.length || 0), 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={22} /> Memory Console
          </h1>
          <p style={{ fontSize: 13, color: T.textTertiary, margin: '4px 0 0', fontFamily: T.font }}>
            {memoryCount} memories · {(totalSize / 1024).toFixed(1)}KB total
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={{
          height: 40, padding: '0 20px', borderRadius: 12, background: T.accent,
          color: '#fff', border: 'none', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <Plus size={16} /> New Memory
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ margin: '0 32px 16px', padding: 20, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
          <input value={newPath} onChange={e => setNewPath(e.target.value)}
            placeholder="Memory name (e.g. client_preferences.md)"
            style={{ width: '100%', height: 40, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 14px', fontSize: 13, color: T.text, fontFamily: T.font, outline: 'none', background: T.bg, marginBottom: 8 }} />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="Memory content..."
            style={{ width: '100%', height: 120, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14, fontSize: 13, color: T.text, fontFamily: T.font, outline: 'none', background: T.bg, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleCreate} disabled={saving} style={{
              height: 36, padding: '0 16px', borderRadius: 10, background: T.accent, color: '#fff',
              border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font
            }}>{saving ? 'Saving...' : 'Create'}</button>
            <button onClick={() => { setCreating(false); setNewPath(''); setNewContent('') }} style={{
              height: 36, padding: '0 16px', borderRadius: 10, background: T.surface, color: T.textSecondary,
              border: `1px solid ${T.border}`, fontSize: 13, cursor: 'pointer', fontFamily: T.font
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontSize: 13 }}>Loading memories...</div>
        ) : memories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontSize: 13 }}>No memories stored yet. Kiko will create them as you interact.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memories.map(mem => {
              const isExpanded = expanded === mem.id
              const isEditing = editing === mem.id
              const name = mem.path.split('/').pop()
              const lines = (mem.content || '').split('\n').length
              const size = ((mem.content || '').length / 1024).toFixed(1)

              return (
                <div key={mem.id} style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                  {/* Header row */}
                  <div onClick={() => { setExpanded(isExpanded ? null : mem.id); if (isEditing) setEditing(null) }}
                    style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12, transition: 'background 0.1s' }}
                    onMouseOver={e => e.currentTarget.style.background = T.surfaceHover}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    {isExpanded ? <ChevronDown size={16} color={T.textTertiary} /> : <ChevronRight size={16} color={T.textTertiary} />}
                    <FileText size={16} color={T.textSecondary} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.text, fontFamily: T.font }}>{name}</span>
                    <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>{lines} lines · {size}KB</span>
                    <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {timeAgo(mem.updated_at)}
                    </span>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${T.border}` }}>
                      {isEditing ? (
                        <div style={{ paddingTop: 12 }}>
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                            style={{ width: '100%', minHeight: 200, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14, fontSize: 13, color: T.text, fontFamily: 'monospace', outline: 'none', background: T.bg, resize: 'vertical', lineHeight: 1.6 }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button onClick={() => handleSave(mem.id)} disabled={saving} style={{
                              height: 32, padding: '0 14px', borderRadius: 8, background: T.accent, color: '#fff',
                              border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4
                            }}><Save size={12} /> {saving ? 'Saving...' : 'Save'}</button>
                            <button onClick={() => setEditing(null)} style={{
                              height: 32, padding: '0 14px', borderRadius: 8, background: T.surface, color: T.textSecondary,
                              border: `1px solid ${T.border}`, fontSize: 12, cursor: 'pointer', fontFamily: T.font
                            }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ paddingTop: 12 }}>
                          <pre style={{ fontSize: 13, color: T.textSecondary, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                            {mem.content}
                          </pre>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button onClick={() => { setEditing(mem.id); setEditContent(mem.content) }} style={{
                              height: 32, padding: '0 14px', borderRadius: 8, background: T.accentSoft, color: T.text,
                              border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font
                            }}>Edit</button>
                            <button onClick={() => handleDelete(mem.id, mem.path)} style={{
                              height: 32, padding: '0 14px', borderRadius: 8, background: '#FFF0F0', color: '#C62828',
                              border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4
                            }}><Trash2 size={12} /> Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
