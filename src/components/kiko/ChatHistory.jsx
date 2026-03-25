import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { MessageCircle, Mic, ChevronRight, ChevronLeft, Plus, Trash2, Star, MoreHorizontal, Pencil } from 'lucide-react'

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
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [starredIds, setStarredIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kiko_starred_chats') || '[]') } catch { return [] }
  })

  const deletedIdsRef = useRef(new Set())
  const menuRef = useRef(null)
  const orgId = user?.app_metadata?.org_id

  async function loadConversations() {
    if (!user?.id || !orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, title, messages, updated_at')
      .eq('org_id', orgId)
      .neq('archived', true)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (data) setConversations(data.filter(c => !deletedIdsRef.current.has(c.id)))
    setLoading(false)
  }

  useEffect(() => { loadConversations() }, [user?.id, orgId])
  useEffect(() => { if (open) loadConversations() }, [open, activeConvId])
  useEffect(() => {
    if (!open) return
    const iv = setInterval(loadConversations, 5000)
    return () => clearInterval(iv)
  }, [open])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function deleteConversation(id) {
    setMenuOpenId(null)
    deletedIdsRef.current.add(id)
    setConversations(prev => prev.filter(c => c.id !== id))
    await supabase.from('conversations').update({ archived: true }).eq('id', id)
  }

  async function renameConversation(id) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: renameValue.trim() } : c))
    setRenamingId(null)
  }

  function startRename(conv) {
    setMenuOpenId(null)
    setRenamingId(conv.id)
    setRenameValue(conv.title || '')
  }

  function toggleStar(id) {
    setMenuOpenId(null)
    const next = starredIds.includes(id) ? starredIds.filter(s => s !== id) : [...starredIds, id]
    setStarredIds(next)
    localStorage.setItem('kiko_starred_chats', JSON.stringify(next))
  }

  function getPreview(conv) {
    const msgs = conv.messages || []
    const last = msgs[msgs.length - 1]
    if (!last) return 'Empty conversation'
    return (last.content || '').slice(0, 80) + ((last.content || '').length > 80 ? '...' : '')
  }

  function isVoice(conv) { return conv.title?.startsWith('🎤') }

  // Collapsed state
  if (!open) {
    return (
      <button onClick={onToggle} style={{
        position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)',
        zIndex: 200, width: 28, height: 80, borderRadius: '0 10px 10px 0',
        background: T.surface, border: `1px solid ${T.border}`, borderLeft: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '2px 0 8px rgba(255,255,255,0.15)', color: T.textTertiary,
      }}>
        <ChevronRight size={14} />
      </button>
    )
  }

  // Expanded panel — wider (360px)
  return (
    <>
      <button onClick={onToggle} style={{
        position: 'fixed', left: 400, top: 'calc(50% + 28px)', transform: 'translateY(-50%)',
        zIndex: 201, width: 28, height: 80, borderRadius: '0 10px 10px 0',
        background: T.surface, border: `1px solid ${T.border}`, borderLeft: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '2px 0 8px rgba(255,255,255,0.15)', color: T.textTertiary,
      }}>
        <ChevronLeft size={14} />
      </button>

      <div style={{
        position: 'fixed', top: 48, left: 0, width: 400, height: 'calc(100% - 48px)', zIndex: 200,
        background: '#111114', borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 16px rgba(0,0,0,0.3)',
        animation: 'slideInLeft 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: T.font }}>Chats</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { onNewChat(); onToggle() }} style={{
              width: 34, height: 34, borderRadius: 50, border: 'none',
              background: T.accentSoft, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}><Plus size={16} /></button>
            <button onClick={onToggle} style={{
              width: 34, height: 34, borderRadius: 50, border: 'none',
              background: T.accentSoft, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)',
            }}><ChevronLeft size={16} /></button>
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: T.font }}>Loading...</p>
          ) : conversations.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: T.font }}>No conversations yet</p>
          ) : (
            conversations.map(conv => {
              const active = conv.id === activeConvId
              const voice = isVoice(conv)
              const starred = starredIds.includes(conv.id)
              return (
                <div key={conv.id} onClick={() => onSelectConversation(conv)}
                  style={{
                    padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                    marginBottom: 2, transition: 'background 0.1s',
                    background: active ? T.accentSoft : 'transparent',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}
                  onMouseOver={e => { if (!active) e.currentTarget.style.background = T.surfaceHover }}
                  onMouseOut={e => { if (!active) e.currentTarget.style.background = active ? T.accentSoft : 'transparent' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === conv.id ? (
                      <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameConversation(conv.id); if (e.key === 'Escape') setRenamingId(null) }}
                        onBlur={() => renameConversation(conv.id)}
                        autoFocus onClick={e => e.stopPropagation()}
                        style={{ width: '100%', fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 6px', outline: 'none', background: T.bg }} />
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280,
                        }}>{starred ? '★ ' : ''}{(conv.title || 'Untitled').replace('🎤 ', '')}</span>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: T.font, flexShrink: 0 }}>
                          {timeAgo(conv.updated_at)}
                        </span>
                      </div>
                    )}
                    <p style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: T.font, margin: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4,
                    }}>{getPreview(conv)}</p>
                  </div>

                  {/* Three-dot menu — Claude style */}
                  <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }} ref={menuOpenId === conv.id ? menuRef : null}>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id) }}
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: 'none',
                        background: menuOpenId === conv.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.3)', transition: 'all 0.15s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                      onMouseOut={e => { if (menuOpenId !== conv.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' } }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuOpenId === conv.id && (
                      <div onClick={e => e.stopPropagation()} style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 4,
                        width: 180, background: 'rgba(20,20,26,0.95)', backdropFilter: 'blur(20px)',
                        borderRadius: 14, border: `1.5px solid ${T.glassBorder}`,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: 6, zIndex: 300,
                      }}>
                        <button onClick={() => toggleStar(conv.id)} style={{
                          width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent', color: '#fff', textAlign: 'left',
                          fontSize: 14, cursor: 'pointer', fontFamily: T.font,
                          display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s',
                        }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                           onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <Star size={14} style={{ color: starred ? '#F59E0B' : 'rgba(255,255,255,0.4)' }} />
                          {starred ? 'Unstar' : 'Star'}
                        </button>
                        <button onClick={() => startRename(conv)} style={{
                          width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent', color: '#fff', textAlign: 'left',
                          fontSize: 14, cursor: 'pointer', fontFamily: T.font,
                          display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s',
                        }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                           onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <Pencil size={14} style={{ color: 'rgba(255,255,255,0.4)' }} /> Rename
                        </button>
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />
                        <button onClick={() => deleteConversation(conv.id)} style={{
                          width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent', color: '#C62828', textAlign: 'left',
                          fontSize: 14, cursor: 'pointer', fontFamily: T.font,
                          display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s',
                        }} onMouseOver={e => e.currentTarget.style.background = 'rgba(198,40,40,0.06)'}
                           onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <Trash2 size={14} /> Delete
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
