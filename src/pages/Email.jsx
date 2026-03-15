import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Mail, Star, Send, FileText, AlertTriangle, Trash2, Search, RefreshCw, Loader2, Plus, Inbox } from 'lucide-react'
import EmailThread from './EmailThread'
import EmailCompose from './EmailCompose'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', yellow: '#FF9500',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'STARRED', label: 'Starred', icon: Star },
  { id: 'SENT', label: 'Sent', icon: Send },
  { id: 'DRAFT', label: 'Drafts', icon: FileText },
  { id: 'SPAM', label: 'Spam', icon: AlertTriangle },
  { id: 'TRASH', label: 'Bin', icon: Trash2 },
]

function extractName(addr) {
  if (!addr) return ''
  const m = addr.match(/^"?([^"<]+)"?\s*</)
  return m ? m[1].trim() : addr.split('@')[0]
}

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (now - date < 7 * 86400000) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Email({ user }) {
  const [folder, setFolder] = useState('INBOX')
  const [emails, setEmails] = useState([])
  const [selectedThread, setSelectedThread] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [composing, setComposing] = useState(null) // null | 'new' | { mode: 'reply'|'forward', email }
  const [nextPageToken, setNextPageToken] = useState(null)
  const email = user?.email

  // Auto-sync on mount, then load
  useEffect(() => {
    if (!email) return
    handleSync().then(() => fetchEmails())
  }, [email])

  // Refetch when folder changes
  useEffect(() => {
    if (email) fetchEmails()
  }, [folder])

  const fetchEmails = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ email, action: 'list-live', label: folder, maxResults: '50' })
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/email?${params}`)
      const data = await res.json()
      setEmails(data.emails || [])
      setNextPageToken(data.nextPageToken || null)
      // Count unread from results
      if (folder === 'INBOX') {
        const unread = (data.emails || []).filter(e => !e.is_read).length
        setUnreadCount(unread)
      }
    } catch (err) {
      console.error('[Email] Fetch error:', err)
    } finally { setLoading(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'sync' }),
      })
    } catch {} finally { setSyncing(false) }
  }

  const handleStar = async (em, e) => {
    e.stopPropagation()
    const newStarred = !em.is_starred
    await fetch('/api/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'star', id: em.gmail_id, is_starred: newStarred }),
    })
    setEmails(prev => prev.map(x => x.gmail_id === em.gmail_id ? { ...x, is_starred: newStarred } : x))
  }

  const handleTrash = async (threadId) => {
    // Find all emails in thread and trash them
    const threadEmails = emails.filter(e => e.thread_id === threadId)
    for (const em of threadEmails) {
      await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'trash', id: em.gmail_id }),
      })
    }
    setEmails(prev => prev.filter(e => e.thread_id !== threadId))
    if (selectedThread === threadId) setSelectedThread(null)
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter') fetchEmails()
  }

  // Group by thread — show latest message per thread
  const threadMap = {}
  emails.forEach(em => {
    const tid = em.thread_id || em.gmail_id
    if (!threadMap[tid] || new Date(em.date) > new Date(threadMap[tid].date)) {
      threadMap[tid] = em
    }
  })
  const threadList = Object.values(threadMap).sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: T.font, background: T.bg }}>
      {/* Left — Folders */}
      <div style={{ width: 200, borderRight: `1px solid ${T.border}`, padding: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button onClick={() => setComposing('new')} style={{
          width: '100%', height: 40, borderRadius: 12, border: 'none', background: T.accent, color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 12, fontFamily: T.font,
        }}>
          <Plus size={14} /> Compose
        </button>

        {FOLDERS.map(f => {
          const Icon = f.icon
          const active = folder === f.id
          return (
            <button key={f.id} onClick={() => { setFolder(f.id); setSelectedThread(null) }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
              background: active ? T.accentSoft : 'transparent', fontFamily: T.font,
              color: active ? T.text : T.textSecondary, fontSize: 13, fontWeight: active ? 600 : 400,
              transition: 'all 0.1s',
            }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.id === 'INBOX' && unreadCount > 0 && (
                <span style={{ fontSize: 10, background: T.blue, color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{unreadCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Middle — Email list */}
      <div style={{ width: 380, borderRight: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Search + sync bar */}
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textTertiary }} />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearch}
              placeholder="Search emails..." style={{
                width: '100%', height: 34, borderRadius: 10, border: `1px solid ${T.border}`,
                background: T.bg, paddingLeft: 32, paddingRight: 10, fontSize: 12,
                fontFamily: T.font, color: T.text, outline: 'none',
              }} />
          </div>
          <button onClick={() => { handleSync().then(fetchEmails) }} disabled={syncing} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
            color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: T.textTertiary }} />
            </div>
          ) : threadList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontSize: 13 }}>
              <Mail size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
              <p>No emails</p>
            </div>
          ) : threadList.map(em => {
            const active = selectedThread === em.thread_id
            const unread = !em.is_read
            return (
              <button key={em.gmail_id} onClick={() => { setSelectedThread(em.thread_id); setComposing(null) }}
                style={{
                  width: '100%', textAlign: 'left', display: 'block', padding: '12px 16px',
                  borderBottom: `1px solid ${T.border}`, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(0,122,255,0.04)' : unread ? 'rgba(0,122,255,0.02)' : 'transparent',
                  borderLeft: active ? `3px solid ${T.blue}` : '3px solid transparent',
                  transition: 'all 0.1s', fontFamily: T.font,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  {unread && <div style={{ width: 6, height: 6, borderRadius: 3, background: T.blue, flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: unread ? 600 : 400, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {extractName(em.from_address)}
                  </span>
                  <span style={{ fontSize: 10, color: T.textTertiary, flexShrink: 0 }}>{formatDate(em.date)}</span>
                  <button onClick={(e) => handleStar(em, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                    <Star size={12} style={{ fill: em.is_starred ? T.yellow : 'none', color: em.is_starred ? T.yellow : T.textTertiary }} />
                  </button>
                </div>
                <p style={{ fontSize: 12, fontWeight: unread ? 600 : 400, color: unread ? T.text : T.textSecondary, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {em.subject || '(no subject)'}
                </p>
                <p style={{ fontSize: 11, color: T.textTertiary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {em.snippet}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right — Thread viewer / Compose */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {composing ? (
          <EmailCompose
            mode={typeof composing === 'string' ? composing : composing.mode}
            replyTo={typeof composing === 'object' ? composing.email : null}
            userEmail={email}
            onClose={() => setComposing(null)}
            onSent={() => { setComposing(null); fetchEmails() }}
          />
        ) : selectedThread ? (
          <EmailThread
            threadId={selectedThread}
            userEmail={email}
            onReply={(em) => setComposing({ mode: 'reply', email: em })}
            onReplyAll={(em) => setComposing({ mode: 'reply-all', email: em })}
            onForward={(em) => setComposing({ mode: 'forward', email: em })}
            onTrash={() => handleTrash(selectedThread)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: T.textTertiary }}>
            <Mail size={36} style={{ marginBottom: 12, opacity: 0.2 }} />
            <p style={{ fontSize: 14, fontFamily: T.font }}>Select an email to read</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
