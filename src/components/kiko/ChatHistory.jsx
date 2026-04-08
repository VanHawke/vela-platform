import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { ChevronRight, ChevronLeft, Plus, Trash2, MoreHorizontal, Pencil, MessageCircle, Search } from 'lucide-react'

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ChatHistory({ user, open, onToggle, onSelectConversation, onNewChat, activeConvId, onShowAllChats }) {
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
      const [kikoRes, importedRes] = await Promise.all([
        orgId ? supabase.from('conversations').select('id, title, updated_at').eq('org_id', orgId).neq('archived', true).order('updated_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        supabase.from('kiko_imported_conversations').select('id, title, source, original_date').eq('user_id', user.id).eq('processed', true).order('original_date', { ascending: false }).limit(500),
      ])
      const kiko = (kikoRes.data || []).filter(c => !deletedIdsRef.current.has(c.id)).map(c => ({ id: c.id, title: c.title || 'Untitled', date: c.updated_at, type: 'kiko' }))
      const imported = (importedRes.data || []).map(c => ({ id: 'imp_' + c.id, realId: c.id, title: c.title || 'Untitled', date: c.original_date, type: 'imported', source: c.source }))
      setAllConvos([...kiko, ...imported].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    } catch (e) { console.error('[ChatHistory] load error:', e) }
    setLoading(false)
  }

  async function selectConversation(conv) {
    const now = new Date().toISOString()
    setAllConvos(prev => prev.map(c => c.id === conv.id ? { ...c, date: now } : c).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    if (conv.type === 'kiko') {
      const { data } = await supabase.from('conversations').select('messages').eq('id', conv.id).single()
      onSelectConversation({ id: conv.id, messages: data?.messages || [], title: conv.title, type: 'kiko' })
      supabase.from('conversations').update({ updated_at: now }).eq('id', conv.id).then(() => {})
    } else {
      const realId = conv.realId || conv.id.replace('imp_', '')
      const { data } = await supabase.from('kiko_imported_conversations').select('messages').eq('id', realId).single()
      const msgs = (data?.messages || []).map(m => ({ role: m.role === 'human' ? 'user' : m.role, content: m.content || '' }))
      onSelectConversation({ id: conv.id, messages: msgs, title: conv.title, type: 'imported' })
      supabase.from('kiko_imported_conversations').update({ original_date: now }).eq('id', realId).then(() => {})
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
    if (conv.type === 'kiko') { await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', conv.id) }
    else { await supabase.from('kiko_imported_conversations').update({ title: renameValue.trim() }).eq('id', conv.realId || conv.id.replace('imp_', '')) }
    setAllConvos(prev => prev.map(c => c.id === conv.id ? { ...c, title: renameValue.trim() } : c))
    setRenamingId(null)
  }

  const recents = allConvos.slice(0, 20)

  // Collapsed strip
  if (!open) return (
    <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(238,238,238,0.04)', cursor: 'pointer' }} onClick={onToggle}>
      <ChevronRight size={14} style={{ color: T.textTertiary }} />
    </div>
  )

  // Conversation row renderer
  const ConvRow = ({ conv }) => {
    const active = conv.id === activeConvId
    return (
      <div key={conv.id} onClick={() => selectConversation(conv)}
        style={{ padding: '10px 12px', borderRadius: 12, cursor: 'pointer', marginBottom: 1, transition: 'background 0.1s', background: active ? T.accentSoft : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
        onMouseOver={e => { if (!active) e.currentTarget.style.background = T.surfaceHover }}
        onMouseOut={e => { if (!active) e.currentTarget.style.background = active ? T.accentSoft : 'transparent' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renamingId === conv.id ? (
            <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameConversation(conv); if (e.key === 'Escape') setRenamingId(null) }}
              onBlur={() => renameConversation(conv)} autoFocus onClick={e => e.stopPropagation()}
              style={{ width: '100%', fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: T.font, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 6px', outline: 'none', background: T.bg }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(238,238,238,0.8)', fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 280 }}>
              {(conv.title || 'Untitled').replace('🎤 ', '')}
            </span>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpenId === conv.id ? menuRef : null}>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id) }}
            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.15)', transition: 'color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color = 'rgba(238,238,238,0.5)'}
            onMouseOut={e => { if (menuOpenId !== conv.id) e.currentTarget.style.color = 'rgba(238,238,238,0.15)' }}>
            <MoreHorizontal size={14} />
          </button>
          {menuOpenId === conv.id && (
            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 140, background: 'rgba(20,20,26,0.95)', backdropFilter: 'blur(20px)', borderRadius: 10, border: `1px solid ${T.glassBorder}`, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 4, zIndex: 300 }}>
              <button onClick={() => { setMenuOpenId(null); setRenamingId(conv.id); setRenameValue(conv.title || '') }}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', textAlign: 'left', fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 7 }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(238,238,238,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <Pencil size={12} style={{ color: 'rgba(238,238,238,0.4)' }} /> Rename
              </button>
              <button onClick={() => deleteConversation(conv)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#C62828', textAlign: 'left', fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 7 }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(198,40,40,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: 300, flexShrink: 0, height: '100%', background: '#111114', borderRight: '1px solid rgba(238,238,238,0.04)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: T.font }}>Chats</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { onNewChat(); }} title="New chat" style={{ width: 30, height: 30, borderRadius: 50, border: 'none', background: T.accentSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Plus size={14} /></button>
          <button onClick={onToggle} style={{ width: 30, height: 30, borderRadius: 50, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.4)' }}><ChevronLeft size={14} /></button>
        </div>
      </div>

      {/* Recents label */}
      <div style={{ padding: '4px 16px 8px', fontSize: 11, fontWeight: 500, color: 'rgba(238,238,238,0.35)', fontFamily: T.font, letterSpacing: '0.03em' }}>
        Recents
      </div>

      {/* Recent conversations — top 20 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: 'rgba(238,238,238,0.3)', fontSize: 13, fontFamily: T.font }}>Loading…</p>
        ) : recents.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: 'rgba(238,238,238,0.3)', fontSize: 13, fontFamily: T.font }}>No conversations yet</p>
        ) : (
          recents.map(conv => <ConvRow key={conv.id} conv={conv} />)
        )}
      </div>

      {/* All chats button — bottom */}
      {allConvos.length > 0 && (
        <button onClick={() => onShowAllChats?.(allConvos, selectConversation, deleteConversation)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderTop: `1px solid ${T.border}`, background: 'transparent', border: 'none', borderTop: `1px solid ${T.border}`, cursor: 'pointer', color: 'rgba(238,238,238,0.5)', fontFamily: T.font, fontSize: 13, fontWeight: 400, transition: 'color 0.15s', width: '100%', textAlign: 'left' }}
          onMouseOver={e => e.currentTarget.style.color = 'rgba(238,238,238,0.8)'}
          onMouseOut={e => e.currentTarget.style.color = 'rgba(238,238,238,0.5)'}>
          <MessageCircle size={16} />
          All chats
        </button>
      )}
    </div>
  )
}
