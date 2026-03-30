import { useState, useRef, useEffect } from 'react'
import T from '@/lib/theme'
import { Search, X, Trash2 } from 'lucide-react'

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function AllChatsView({ convos, onSelect, onDelete, onClose }) {
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = search.trim()
    ? convos.filter(c => (c.title || '').toLowerCase().includes(search.toLowerCase()))
    : convos

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 700, margin: '0 auto', padding: '40px 24px 24px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#fff', fontFamily: T.font, margin: 0 }}>Chats</h1>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 50, border: 'none', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', transition: 'background 0.15s' }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
        <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search your chats…"
          style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: `1.5px solid ${T.glassBorder}`, background: T.glass, backdropFilter: T.glassBlur, color: '#fff', fontSize: 14, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: T.font, marginBottom: 12, padding: '0 4px' }}>
        {search ? `${filtered.length} results` : `${convos.length} conversations`}
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)', fontSize: 14, fontFamily: T.font }}>
            {search ? 'No chats match your search' : 'No conversations yet'}
          </p>
        ) : (
          filtered.map(conv => (
            <div key={conv.id} onClick={() => { onSelect(conv); onClose() }}
              style={{ padding: '14px 16px', borderBottom: `1px solid rgba(255,255,255,0.04)`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s', borderRadius: 8 }}
              onMouseOver={e => e.currentTarget.style.background = T.surfaceHover}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: T.font, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(conv.title || 'Untitled').replace('🎤 ', '')}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: T.font, marginTop: 2, display: 'block' }}>
                  {conv.date ? timeAgo(conv.date) : ''}
                </span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDelete(conv) }}
                style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', transition: 'color 0.15s', flexShrink: 0 }}
                onMouseOver={e => e.currentTarget.style.color = 'rgba(198,40,40,0.8)'}
                onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
