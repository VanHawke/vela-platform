import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageCircle, Mic, ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

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

  const orgId = user?.app_metadata?.org_id

  async function loadConversations() {
    if (!user?.id || !orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, title, messages, updated_at')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (data) setConversations(data)
    setLoading(false)
  }

  useEffect(() => { loadConversations() }, [user?.id, orgId])
  // Refresh when panel opens
  useEffect(() => { if (open) loadConversations() }, [open])

  async function deleteConversation(id, e) {
    e.stopPropagation()
    await supabase.from('conversations').delete().eq('id', id)
    setConversations(prev => prev.filter(c => c.id !== id))
  }

  function getPreview(conv) {
    const msgs = conv.messages || []
    const last = msgs[msgs.length - 1]
    if (!last) return 'Empty conversation'
    return (last.content || '').slice(0, 80) + ((last.content || '').length > 80 ? '...' : '')
  }

  function isVoice(conv) {
    return conv.title?.startsWith('🎤')
  }

  // Collapsed state — just a toggle tab on the right edge
  if (!open) {
    return (
      <button onClick={onToggle} style={{
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        zIndex: 90, width: 28, height: 80, borderRadius: '10px 0 0 10px',
        background: T.surface, border: `1px solid ${T.border}`, borderRight: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.04)', color: T.textTertiary,
      }}>
        <ChevronLeft size={14} />
      </button>
    )
  }

  // Expanded panel
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 320, height: '100%', zIndex: 90,
      background: T.surface, borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.04)',
      animation: 'slideInRight 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.font }}>Chats</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { onNewChat(); }} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: T.accentSoft, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: T.text,
          }}><Plus size={16} /></button>
          <button onClick={onToggle} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: T.accentSoft, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: T.textTertiary,
          }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: T.textTertiary, fontSize: 12, fontFamily: T.font }}>Loading...</p>
        ) : conversations.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: T.textTertiary, fontSize: 12, fontFamily: T.font }}>No conversations yet</p>
        ) : (
          conversations.map(conv => {
            const active = conv.id === activeConvId
            const voice = isVoice(conv)
            return (
              <div key={conv.id} onClick={() => onSelectConversation(conv)}
                style={{
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  marginBottom: 2, transition: 'background 0.1s',
                  background: active ? T.accentSoft : 'transparent',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
                onMouseOver={e => { if (!active) e.currentTarget.style.background = T.surfaceHover }}
                onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0, marginTop: 1,
                  background: active ? T.accent : T.accentSoft,
                  color: active ? '#fff' : T.textTertiary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {voice ? <Mic size={13} /> : <MessageCircle size={13} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.font,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180,
                    }}>{(conv.title || 'Untitled').replace('🎤 ', '')}</span>
                    <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font, flexShrink: 0 }}>
                      {timeAgo(conv.updated_at)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 11, color: T.textTertiary, fontFamily: T.font, margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    lineHeight: 1.4,
                  }}>{getPreview(conv)}</p>
                </div>
                <button onClick={(e) => deleteConversation(conv.id, e)} style={{
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: T.textTertiary, opacity: 0.5, flexShrink: 0, marginTop: 2,
                }}
                  onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#C62828' }}
                  onMouseOut={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = T.textTertiary }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
