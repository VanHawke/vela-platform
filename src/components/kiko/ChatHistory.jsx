import { useState, useEffect, useRef, useMemo } from 'react'
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

// Format date+time for chat history sidebar (Sunny spec 2026-04-12)
// Today: "14:32 today"  Yesterday: "09:15 yesterday"  Older: "10 Apr 14:32"
function formatRelativeTime(d) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `${time} today`
  if (isYesterday) return `${time} yesterday`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + time
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
        // Always show own conversations only — super_admin can request Matt's via Kiko
        orgId
          ? supabase.from('conversations').select('id, title, updated_at').eq('user_id', user.id).neq('archived', true).order('updated_at', { ascending: false }).limit(50)
          : supabase.from('conversations').select('id, title, updated_at').eq('user_id', user.id).neq('archived', true).order('updated_at', { ascending: false }).limit(50),
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
  // Listen for rename events from KikoChat
  useEffect(() => {
    const handler = () => loadAll()
    window.addEventListener('kiko-chat-updated', handler)
    return () => window.removeEventListener('kiko-chat-updated', handler)
  }, [])
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

  const [searchQuery, setSearchQuery] = useState('')

  // ═══ TIME GROUPING — Today / Yesterday / Previous 7 Days / Older ═══
  const groupedConvos = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    const filtered = searchQuery.trim()
      ? allConvos.filter(c => (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : allConvos

    const groups = { today: [], yesterday: [], week: [], older: [] }
    for (const conv of filtered.slice(0, 50)) {
      const d = new Date(conv.date || 0)
      if (d >= today) groups.today.push(conv)
      else if (d >= yesterday) groups.yesterday.push(conv)
      else if (d >= weekAgo) groups.week.push(conv)
      else groups.older.push(conv)
    }
    return groups
  }, [allConvos, searchQuery])

  const GroupLabel = ({ label }) => (
    <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 500, color: '#A0A0A0', fontFamily: T.font, letterSpacing: '0.03em' }}>{label}</div>
  )

  // Collapsed strip — positioned absolute so it doesn't shift content centering
  if (!open) return (
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(0,0,0,0.03)', cursor: 'pointer', zIndex: 10 }} onClick={onToggle}>
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
            <div>
              <span style={{ fontSize: 13, fontWeight: 400, color: '#0A0A0A', fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 280 }}>
                {(conv.title || 'Untitled').replace('🎤 ', '')}
              </span>
              {conv.date && (
                <span style={{ fontSize: 10, fontWeight: 400, color: '#A0A0A0', fontFamily: T.font, marginTop: 2, display: 'block' }}>
                  {formatRelativeTime(conv.date)}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpenId === conv.id ? menuRef : null}>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id) }}
            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A0A0', transition: 'color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color = '#6B6B6B'}
            onMouseOut={e => { if (menuOpenId !== conv.id) e.currentTarget.style.color = 'rgba(0,0,0,0.08)' }}>
            <MoreHorizontal size={14} />
          </button>
          {menuOpenId === conv.id && (
            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 140, background: 'rgba(20,20,26,0.95)', backdropFilter: 'blur(20px)', borderRadius: 10, border: `1px solid ${T.glassBorder}`, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 4, zIndex: 300 }}>
              <button onClick={() => { setMenuOpenId(null); setRenamingId(conv.id); setRenameValue(conv.title || '') }}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', textAlign: 'left', fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 7 }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <Pencil size={12} style={{ color: '#A0A0A0' }} /> Rename
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
    <div style={{ width: 300, flexShrink: 0, height: '100%', background: '#FFFFFF', borderRight: '1px solid rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: T.font }}>Chats</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { onNewChat(); }} title="New chat" style={{ width: 30, height: 30, borderRadius: 50, border: 'none', background: '#0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#2A2A2A'} onMouseLeave={e => e.currentTarget.style.background = '#0A0A0A'}><Plus size={14} /></button>
          <button onClick={onToggle} style={{ width: 30, height: 30, borderRadius: 50, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A0A0' }}><ChevronLeft size={14} /></button>
        </div>
      </div>

      {/* Search input */}
      <div style={{ padding: '0 10px 8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A0A0A0', pointerEvents: 'none' }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats..."
            style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)', fontSize: 12, fontFamily: T.font, color: '#0A0A0A', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'rgba(0,0,0,0.15)'}
            onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.06)'}
          />
        </div>
      </div>

      {/* Time-grouped conversations */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>Loading…</p>
        ) : (allConvos.length === 0) ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>No conversations yet</p>
        ) : searchQuery && !groupedConvos.today.length && !groupedConvos.yesterday.length && !groupedConvos.week.length && !groupedConvos.older.length ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#A0A0A0', fontSize: 13, fontFamily: T.font }}>No matches</p>
        ) : (
          <>
            {groupedConvos.today.length > 0 && <><GroupLabel label="Today" />{groupedConvos.today.map(c => <ConvRow key={c.id} conv={c} />)}</>}
            {groupedConvos.yesterday.length > 0 && <><GroupLabel label="Yesterday" />{groupedConvos.yesterday.map(c => <ConvRow key={c.id} conv={c} />)}</>}
            {groupedConvos.week.length > 0 && <><GroupLabel label="Previous 7 Days" />{groupedConvos.week.map(c => <ConvRow key={c.id} conv={c} />)}</>}
            {groupedConvos.older.length > 0 && <><GroupLabel label="Older" />{groupedConvos.older.map(c => <ConvRow key={c.id} conv={c} />)}</>}
          </>
        )}
      </div>

      {/* All chats button — bottom */}
      {allConvos.length > 0 && (
        <button onClick={() => onShowAllChats?.(allConvos, selectConversation, deleteConversation)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderTop: `1px solid ${T.border}`, background: 'transparent', border: 'none', borderTop: `1px solid ${T.border}`, cursor: 'pointer', color: '#6B6B6B', fontFamily: T.font, fontSize: 13, fontWeight: 400, transition: 'color 0.15s', width: '100%', textAlign: 'left' }}
          onMouseOver={e => e.currentTarget.style.color = '#0A0A0A'}
          onMouseOut={e => e.currentTarget.style.color = '#6B6B6B'}>
          <MessageCircle size={16} />
          All chats
        </button>
      )}
    </div>
  )
}
