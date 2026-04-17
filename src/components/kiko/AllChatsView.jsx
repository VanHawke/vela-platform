import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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

export default function AllChatsView({ convos, onSelect, onDelete, onClose, userId }) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = show all, array = show results
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced deep search — queries title + message content
  const doSearch = useCallback((q) => {
    if (!q.trim()) { setSearchResults(null); setSearching(false); return }
    setSearching(true)
    supabase.rpc('search_conversations', { query: q.trim(), uid: userId }).then(({ data, error }) => {
      if (error) {
        // Fallback to title-only search if RPC fails
        const titleMatches = convos.filter(c => (c.title || '').toLowerCase().includes(q.toLowerCase()))
        setSearchResults(titleMatches)
      } else {
        // Map RPC results to our format
        const results = (data || []).map(r => ({
          id: 'imp_' + r.id, realId: r.id, title: r.title, date: r.original_date,
          type: 'imported', source: r.source, matchType: r.match_type,
        }))
        // Also include Kiko conversation title matches
        const kikoMatches = convos.filter(c => c.type === 'kiko' && (c.title || '').toLowerCase().includes(q.toLowerCase()))
        setSearchResults([...kikoMatches, ...results])
      }
      setSearching(false)
    })
  }, [convos, userId])

  const handleSearch = (val) => {
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSearchResults(null); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const displayed = searchResults !== null ? searchResults : convos

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 700, margin: '0 auto', padding: '40px 24px 24px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0A0A0A', fontFamily: T.font, margin: 0 }}>Chats</h1>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 50, border: 'none', background: 'rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6B6B', transition: 'background 0.15s' }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}>
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#A0A0A0' }} />
        <input ref={inputRef} value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Search your chats…"
          style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.10)', background: '#FAFAF7', color: '#0A0A0A', fontSize: 14, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: '#A0A0A0', fontFamily: T.font, marginBottom: 12, padding: '0 4px' }}>
        {searching ? 'Searching…' : search ? `${displayed.length} results` : `${convos.length} conversations`}
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!searching && displayed.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 14, fontFamily: T.font }}>
            {search ? 'No chats match your search' : 'No conversations yet'}
          </p>
        ) : (
          displayed.map(conv => (
            <div key={conv.id} onClick={() => { onSelect(conv); onClose() }}
              style={{ padding: '14px 16px', borderBottom: `1px solid rgba(0,0,0,0.03)`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s', borderRadius: 8 }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', fontFamily: T.font, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(conv.title || 'Untitled').replace('🎤 ', '')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: '#A0A0A0', fontFamily: T.font }}>{conv.date ? timeAgo(conv.date) : ''}</span>
                  {conv.matchType === 'content' && search && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 50, background: 'rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.55)', fontFamily: T.font }}>in messages</span>
                  )}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDelete(conv) }}
                style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A0A0', transition: 'color 0.15s', flexShrink: 0 }}
                onMouseOver={e => e.currentTarget.style.color = 'rgba(198,40,40,0.8)'}
                onMouseOut={e => e.currentTarget.style.color = '#A0A0A0'}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
