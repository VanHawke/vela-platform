import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Search, FileText, BarChart3, Newspaper, Grid3X3, Building2, CheckSquare, Mic, Settings, Users, GitBranch, Calendar } from 'lucide-react'

const T = {
  text: '#1A1A1A', sub: '#6B6B6B', muted: '#ABABAB',
  border: 'rgba(0,0,0,0.08)', soft: 'rgba(0,0,0,0.04)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const PAGES = [
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', icon: GitBranch, section: 'pages' },
  { id: 'calendar', label: 'Calendar', path: '/calendar', icon: Calendar, section: 'pages' },
  { id: 'contacts', label: 'Contacts', path: '/contacts', icon: Users, section: 'pages' },
  { id: 'email', label: 'Outreach Intelligence', path: '/email', icon: BarChart3, section: 'pages' },
  { id: 'news', label: 'News Signals', path: '/news', icon: Newspaper, section: 'pages' },
  { id: 'matrix', label: 'Partnership Matrix', path: '/partnership-matrix', icon: Grid3X3, section: 'pages' },
  { id: 'documents', label: 'Knowledge Library', path: '/documents', icon: FileText, section: 'pages' },
  { id: 'organisations', label: 'Organisations', path: '/organisations', icon: Building2, section: 'pages' },
  { id: 'tasks', label: 'Tasks', path: '/tasks', icon: CheckSquare, section: 'pages' },
]

const ACTIONS = [
  { id: 'voice', label: 'Start voice mode', icon: Mic, section: 'actions', action: 'voice' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'actions', path: '/settings' },
]

export default function CommandPalette({ open, onClose, onVoice }) {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const searchTimeout = useRef(null)

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setSearchResults([]); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // Search contacts/companies from Supabase when typing
  useEffect(() => {
    if (!query || query.length < 2) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const q = query.trim()
        const [contacts, companies] = await Promise.all([
          supabase.from('contacts').select('id,data').or(`data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*,data->>company.ilike.*${q}*`).limit(4),
          supabase.from('companies').select('id,data').or(`data->>name.ilike.*${q}*`).limit(3),
        ])
        const results = []
        ;(contacts.data || []).forEach(c => {
          const d = c.data || {}
          results.push({ id: `c-${c.id}`, label: `${d.firstName || ''} ${d.lastName || ''}`.trim(), sub: d.company || d.title || '', path: `/contacts/${c.id}`, icon: Users, section: 'results' })
        })
        ;(companies.data || []).forEach(c => {
          const d = c.data || {}
          results.push({ id: `o-${c.id}`, label: d.name || '', sub: d.industry || '', path: `/organisations?org=${c.id}`, icon: Building2, section: 'results' })
        })
        setSearchResults(results)
      } catch {} finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(searchTimeout.current)
  }, [query])

  const filteredPages = query
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES
  const filteredActions = query
    ? ACTIONS.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : ACTIONS

  const allItems = [...(searchResults.length > 0 ? searchResults : []), ...filteredPages, ...filteredActions]

  const handleSelect = useCallback((item) => {
    onClose()
    if (item.action === 'voice') { onVoice?.(); return }
    if (item.path) nav(item.path)
  }, [nav, onClose, onVoice])

  const handleKeyDown = (e) => {
    e.stopPropagation() // prevent ALL keystrokes from reaching chat behind palette
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && allItems[selected]) { handleSelect(allItems[selected]) }
  }

  if (!open) return null

  let lastSection = ''

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 'min(20vh, 160px)' }}>
      <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{
        width: 440, background: '#fff', borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)',
        border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden',
        animation: 'scaleIn 0.15s ease-out',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <Search size={16} color={T.muted} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search pages, contacts, deals..." autoFocus
            onInput={e => e.stopPropagation()}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: T.text, fontFamily: T.font, background: 'transparent' }} />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px' }}>
          {allItems.map((item, i) => {
            const Icon = item.icon
            const showSection = item.section !== lastSection
            lastSection = item.section
            const sectionLabel = item.section === 'results' ? 'Results' : item.section === 'pages' ? 'Pages' : 'Actions'
            return (
              <div key={item.id}>
                {showSection && (
                  <div style={{ padding: '8px 10px 4px', fontSize: 10, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: T.font }}>{sectionLabel}</div>
                )}
                <button onClick={() => handleSelect(item)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 8, border: 'none', textAlign: 'left',
                  background: i === selected ? 'rgba(0,0,0,0.05)' : 'transparent',
                  cursor: 'pointer', fontFamily: T.font, transition: 'background 0.1s',
                }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: T.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color={T.sub} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                    {item.sub && <div style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>}
                  </div>
                </button>
              </div>
            )
          })}
          {searching && <div style={{ padding: '12px 10px', fontSize: 12, color: T.muted, fontFamily: T.font }}>Searching...</div>}
          {query && !searching && allItems.length === 0 && <div style={{ padding: '12px 10px', fontSize: 12, color: T.muted, fontFamily: T.font }}>No results</div>}
        </div>

        {/* Keyboard hints */}
        <div style={{ padding: '8px 16px', borderTop: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', gap: 16, justifyContent: 'center' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['esc', 'close']].map(([key, label]) => (
            <span key={key} style={{ fontSize: 10, color: T.muted, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', fontSize: 10, fontFamily: 'inherit' }}>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
