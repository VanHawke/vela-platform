import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { ChevronRight, ChevronLeft, Plus, Trash2, MoreHorizontal, Pencil } from 'lucide-react'

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ChatHistory({ user, open, onToggle, onSelectConversation, onNewChat, activeConvId }) {
  const [allConvos, setAllConvos] = useState([])
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuOpenId, setMenuOpenId] = useState(null)
  const deletedIdsRef = useRef(new Set())
  const menuRef = useRef(null)
  const orgId = user?.app_metadata?.org_id

  async function loadAll() {
    if (!user?.id) return
    setLoading(true)
    try {
      // Load both sources in parallel — titles only, NO messages (too heavy)
      const [kikoRes, importedRes] = await Promise.all([
        orgId ? supabase.from('conversations').select('id, title, updated_at').eq('org_id', orgId).neq('archived', true).order('updated_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        supabase.from('kiko_imported_conversations').select('id, title, source, original_date').eq('user_id', user.id).eq('processed', true).order('original_date', { ascending: false }).limit(500),
      ])
      const kiko = (kikoRes.data || []).filter(c => !deletedIdsRef.current.has(c.id)).map(c => ({
        id: c.id, title: c.title || 'Untitled', date: c.updated_at, type: 'kiko',
      }))
      const imported = (importedRes.data || []).map(c => ({
        id: 'imp_' + c.id, realId: c.id, title: c.title || 'Untitled', date: c.original_date, type: 'imported', source: c.source,
      }))
      setAllConvos([...kiko, ...imported].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    } catch (e) { console.error('[ChatHistory] load error:', e) }
    setLoading(false)
  }

  // Load full messages only when a conversation is clicked
  async function selectConversation(conv) {
    if (conv.type === 'kiko') {
      const { data } = await supabase.from('conversations').select('messages').eq('id', conv.id).single()
      onSelectConversation({ id: conv.id, messages: data?.messages || [], title: conv.title, type: 'kiko' })
    } else {
      const { data } = await supabase.from('kiko_imported_conversations').select('messages').eq('id', conv.realId || conv.id.replace('imp_', '')).single()
      const msgs = (data?.messages || []).map(m => ({ role: m.role === 'human' ? 'user' : m.role, content: m.content || '' }))
      onSelectConversation({ id: conv.id, messages: msgs, title: conv.title, type: 'imported' })
    }
  }

  useEffect(() => { loadAll() }, [user?.id, orgId])
  useEffect(() => { if (open) loadAll() }, [open, activeConvId])

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function deleteConversation(conv) {
    setMenuOpenId(null)
    setAllConvos(prev => prev.filter(c => c.id !== conv.id))
    if (conv.type === 'kiko') {
      deletedIdsRef.current.add(conv.id)
      await supabase.from('conversations').update({ archived: true }).eq('id', conv.id)
    } else {
      await supabase.from('kiko_imported_conversations').delete().eq('id', conv.realId || conv.id.replace('imp_', ''))
    }
  }

  async function renameConversation(conv) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    if (conv.type === 'kiko') {
      await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', conv.id)
    } else {
      await supabase.from('kiko_imported_conversations').update({ title: renameValue.trim() }).eq('id', conv.realId || conv.id.replace('imp_', ''))
    }
    setAllConvos(prev => prev.map(c => c.id === conv.id ? { ...c, title: renameValue.trim() } : c))
    setRenamingId(null)
  }

  if (!open) {
    return (
      <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${T.border}`, cursor: 'pointer' }} onClick={onToggle}>
        <ChevronRight size={14} style={{ color: T.textTertiary }} />
      </div>
    )
  }

  return (
    <>
      <div style={{ width: 400, flexShrink: 0, height: '100%', background: '#111114', borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: T.font }}>Chats</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { onNewChat(); onToggle() }} style={{ width: 34, height: 34, borderRadius: 50, border: 'none', background: T.accentSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Plus size={16} /></button>
            <button onClick={onToggle} style={{ width: 34, height: 34, borderRadius: 50, border: 'none', background: T.accentSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}><ChevronLeft size={16} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: T.font }}>Loading…</p>
          ) : allConvos.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: T.font }}>No conversations yet</p>
          ) : (
            allConvos.map(conv => {
              const active = conv.id === activeConvId
              return (
                <div key={conv.id} onClick={() => selectConversation(conv)}
                  style={{ padding: '12px 14px', borderRadius: 14, cursor: 'pointer', marginBottom: 2, transition: 'background 0.1s', background: active ? T.accentSoft : 'transparent', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                  onMouseOver={e => { if (!active) e.currentTarget.style.background = T.surfaceHover }}
                  onMouseOut={e => { if (!active) e.currentTarget.style.background = active ? T.accentSoft : 'transparent' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === conv.id ? (
                      <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameConversation(conv); if (e.key === 'Escape') setRenamingId(null) }}
                        onBlur={() => renameConversation(conv)} autoFocus onClick={e => e.stopPropagation()}
                        style={{ width: '100%', fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 6px', outline: 'none', background: T.bg }} />
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 290 }}>
                          {(conv.title || 'Untitled').replace('🎤 ', '')}
                        </span>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: T.font, flexShrink: 0, marginLeft: 8 }}>
                          {timeAgo(conv.date)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpenId === conv.id ? menuRef : null}>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id) }}
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: menuOpenId === conv.id ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', transition: 'all 0.15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
                      onMouseOut={e => { if (menuOpenId !== conv.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)' } }}
                    ><MoreHorizontal size={15} /></button>
                    {menuOpenId === conv.id && (
                      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 150, background: 'rgba(20,20,26,0.95)', backdropFilter: 'blur(20px)', borderRadius: 12, border: `1.5px solid ${T.glassBorder}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: 5, zIndex: 300 }}>
                        <button onClick={() => { setMenuOpenId(null); setRenamingId(conv.id); setRenameValue(conv.title || '') }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#fff', textAlign: 'left', fontSize: 13, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <Pencil size={13} style={{ color: 'rgba(255,255,255,0.4)' }} /> Rename
                        </button>
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 6px' }} />
                        <button onClick={() => deleteConversation(conv)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#C62828', textAlign: 'left', fontSize: 13, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(198,40,40,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
