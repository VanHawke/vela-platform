import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Mail, Star, Send, FileText, AlertTriangle, Trash2,
  Search, RefreshCw, Archive, Reply, ReplyAll, Forward,
  ChevronRight, Paperclip, MailOpen, Loader2, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DOMPurify from 'dompurify'

const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Mail },
  { id: 'STARRED', label: 'Starred', icon: Star },
  { id: 'SENT', label: 'Sent', icon: Send },
  { id: 'DRAFT', label: 'Drafts', icon: FileText },
  { id: 'SPAM', label: 'Spam', icon: AlertTriangle },
  { id: 'TRASH', label: 'Trash', icon: Trash2 },
]

const CATEGORY_COLORS = {
  deal: 'bg-blue-500/20 text-blue-400',
  sponsor: 'bg-purple-500/20 text-purple-400',
  legal: 'bg-red-500/20 text-red-400',
  personal: 'bg-green-500/20 text-green-400',
  finance: 'bg-yellow-500/20 text-yellow-400',
}

export default function Email({ user }) {
  const [folder, setFolder] = useState('INBOX')
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [composing, setComposing] = useState(null) // null | 'new' | 'reply' | 'reply-all' | 'forward'
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const email = user?.email

  useEffect(() => {
    if (email) fetchEmails()
  }, [email, folder, page])

  const fetchEmails = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/email?email=${encodeURIComponent(email)}&folder=${folder}&page=${page}`)
      const data = await res.json()
      if (data.emails) setEmails(data.emails)
      if (data.unread !== undefined) setUnreadCount(data.unread)
      if (data.total !== undefined) setTotal(data.total)
    } catch (err) {
      console.error('[Email] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'sync' }),
      })
      const data = await res.json()
      console.log('[Email] Sync result:', data)
      await fetchEmails()
    } catch (err) {
      console.error('[Email] Sync error:', err)
    } finally {
      setSyncing(false)
    }
  }

  const handleSelectEmail = async (em) => {
    setSelectedEmail(em)
    setComposing(null)
    if (!em.is_read) {
      // Mark as read
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'read', id: em.gmail_id, is_read: true }),
      })
      setEmails(prev => prev.map(e => e.gmail_id === em.gmail_id ? { ...e, is_read: true } : e))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    // Fetch full body
    const res = await fetch(`/api/email?email=${encodeURIComponent(email)}&action=get&id=${em.gmail_id}`)
    const full = await res.json()
    if (full.body_html || full.body_text) setSelectedEmail(prev => ({ ...prev, ...full }))
  }

  const handleStar = async (em, e) => {
    e.stopPropagation()
    const newStarred = !em.is_starred
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'star', id: em.gmail_id, is_starred: newStarred }),
    })
    setEmails(prev => prev.map(e => e.gmail_id === em.gmail_id ? { ...e, is_starred: newStarred } : e))
  }

  const handleTrash = async (em) => {
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'trash', id: em.gmail_id }),
    })
    setEmails(prev => prev.filter(e => e.gmail_id !== em.gmail_id))
    if (selectedEmail?.gmail_id === em.gmail_id) setSelectedEmail(null)
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return fetchEmails()
    setLoading(true)
    try {
      const res = await fetch(`/api/email?email=${encodeURIComponent(email)}&action=search&q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setEmails(data.emails || [])
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const extractName = (addr) => {
    if (!addr) return ''
    const match = addr.match(/^"?([^"<]+)"?\s*</)
    return match ? match[1].trim() : addr.split('@')[0]
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar — folders */}
      <div className="w-[200px] border-r border-white/8 p-3 flex flex-col gap-1 flex-shrink-0">
        <Button
          onClick={() => setComposing('new')}
          size="sm"
          className="w-full mb-3 bg-white text-black hover:bg-white/90"
        >
          <Plus className="h-4 w-4 mr-1" /> Compose
        </Button>
        {FOLDERS.map(f => {
          const Icon = f.icon
          const isActive = folder === f.id
          return (
            <button
              key={f.id}
              onClick={() => { setFolder(f.id); setPage(1); setSelectedEmail(null) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left ${
                isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{f.label}</span>
              {f.id === 'INBOX' && unreadCount > 0 && (
                <span className="text-[10px] bg-white/15 text-white/60 px-1.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Middle — email list */}
      <div className="w-[360px] border-r border-white/8 flex flex-col flex-shrink-0">
        {/* Search + sync */}
        <div className="p-3 border-b border-white/8 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-white/20" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search emails..."
              className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white"
            />
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-white/30 hover:text-white/60 transition-colors p-1"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/20">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/20 text-sm">
              <MailOpen className="h-8 w-8 mb-2" />
              <p>No emails{folder !== 'INBOX' ? ` in ${folder.toLowerCase()}` : ''}</p>
              <button onClick={handleSync} className="text-white/40 text-xs mt-2 underline">
                Sync from Gmail
              </button>
            </div>
          ) : (
            emails.map(em => (
              <button
                key={em.gmail_id}
                onClick={() => handleSelectEmail(em)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                  selectedEmail?.gmail_id === em.gmail_id ? 'bg-white/8' : 'hover:bg-white/5'
                } ${!em.is_read ? 'bg-white/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm flex-1 truncate ${!em.is_read ? 'text-white font-medium' : 'text-white/60'}`}>
                    {extractName(em.from_address)}
                  </span>
                  <span className="text-[10px] text-white/20 flex-shrink-0">{formatDate(em.date)}</span>
                  <button onClick={(e) => handleStar(em, e)} className="flex-shrink-0">
                    <Star className={`h-3 w-3 ${em.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-white/15'}`} />
                  </button>
                </div>
                <p className={`text-xs truncate mb-0.5 ${!em.is_read ? 'text-white/80' : 'text-white/40'}`}>
                  {em.subject || '(no subject)'}
                </p>
                <p className="text-[11px] text-white/20 truncate">{em.snippet}</p>
                {em.kiko_category && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full mt-1 inline-block ${CATEGORY_COLORS[em.kiko_category] || 'bg-white/10 text-white/40'}`}>
                    {em.kiko_category}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="p-2 border-t border-white/8 flex items-center justify-between text-xs text-white/30">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="disabled:opacity-30 hover:text-white/50"
            >
              Previous
            </button>
            <span>{page} / {Math.ceil(total / 50)}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / 50)}
              className="disabled:opacity-30 hover:text-white/50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Right — email viewer / compose */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {composing ? (
          <ComposePane
            mode={composing}
            replyTo={composing !== 'new' ? selectedEmail : null}
            userEmail={email}
            onClose={() => setComposing(null)}
            onSent={() => { setComposing(null); fetchEmails() }}
          />
        ) : selectedEmail ? (
          <EmailViewer
            email={selectedEmail}
            userEmail={email}
            onReply={() => setComposing('reply')}
            onReplyAll={() => setComposing('reply-all')}
            onForward={() => setComposing('forward')}
            onTrash={() => handleTrash(selectedEmail)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/15 text-sm">
            Select an email to read
          </div>
        )}
      </div>
    </div>
  )
}

// --- Email Viewer ---
function EmailViewer({ email: em, userEmail, onReply, onReplyAll, onForward, onTrash }) {
  const iframeRef = useRef(null)

  useEffect(() => {
    if (iframeRef.current && em.body_html) {
      const doc = iframeRef.current.contentDocument
      const sanitized = DOMPurify.sanitize(em.body_html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'a', 'img', 'div', 'span', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'strong', 'em'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'width', 'height', 'target', 'colspan', 'rowspan'],
      })
      doc.open()
      doc.write(`
        <html><head><style>
          body { font-family: -apple-system, system-ui, sans-serif; font-size: 14px; color: #e0e0e0; background: #0a0a0a; margin: 16px; line-height: 1.6; }
          a { color: #8b8bff; }
          img { max-width: 100%; height: auto; }
          blockquote { border-left: 3px solid #333; margin: 8px 0; padding-left: 12px; color: #888; }
        </style></head><body>${sanitized}</body></html>
      `)
      doc.close()
    }
  }, [em.body_html])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-white/8">
        <h2 className="text-lg text-white mb-2">{em.subject || '(no subject)'}</h2>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="text-white/60">{em.from_address}</span>
          <ChevronRight className="h-3 w-3" />
          <span>{em.to_addresses?.join(', ')}</span>
        </div>
        {em.cc_addresses?.length > 0 && (
          <p className="text-xs text-white/25 mt-1">CC: {em.cc_addresses.join(', ')}</p>
        )}
        <p className="text-xs text-white/20 mt-1">{em.date ? new Date(em.date).toLocaleString() : ''}</p>
        {em.has_attachments && (
          <div className="flex items-center gap-1 mt-2 text-xs text-white/30">
            <Paperclip className="h-3 w-3" /> Attachments
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-white/5">
        <button onClick={onReply} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 px-2 py-1.5 rounded hover:bg-white/5">
          <Reply className="h-3.5 w-3.5" /> Reply
        </button>
        <button onClick={onReplyAll} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 px-2 py-1.5 rounded hover:bg-white/5">
          <ReplyAll className="h-3.5 w-3.5" /> Reply All
        </button>
        <button onClick={onForward} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 px-2 py-1.5 rounded hover:bg-white/5">
          <Forward className="h-3.5 w-3.5" /> Forward
        </button>
        <div className="flex-1" />
        <button onClick={onTrash} className="flex items-center gap-1 text-xs text-white/40 hover:text-red-400 px-2 py-1.5 rounded hover:bg-white/5">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      {/* Kiko analysis card */}
      {(em.kiko_summary || em.kiko_category) && (
        <div className="mx-5 mt-3 p-3 bg-purple-500/5 border border-purple-500/10 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-purple-400">Kiko Analysis</span>
            {em.kiko_category && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[em.kiko_category] || 'bg-white/10 text-white/40'}`}>
                {em.kiko_category}
              </span>
            )}
          </div>
          {em.kiko_summary && <p className="text-xs text-white/40">{em.kiko_summary}</p>}
          {em.kiko_action && (
            <p className="text-xs text-purple-300/60 mt-1">Suggested: {em.kiko_action}</p>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {em.body_html ? (
          <iframe
            ref={iframeRef}
            title="Email body"
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="p-5 text-sm text-white/50 whitespace-pre-wrap">
            {em.body_text || em.snippet || 'No content'}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Compose Pane ---
function ComposePane({ mode, replyTo, userEmail, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (mode === 'reply' && replyTo) {
      setTo(replyTo.from_address || '')
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`)
    } else if (mode === 'reply-all' && replyTo) {
      const allRecipients = [replyTo.from_address, ...(replyTo.to_addresses || [])].filter(a => a !== userEmail)
      setTo(allRecipients.join(', '))
      setCc((replyTo.cc_addresses || []).filter(a => a !== userEmail).join(', '))
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`)
    } else if (mode === 'forward' && replyTo) {
      setSubject(`Fwd: ${replyTo.subject}`)
      setBody(`\n\n---------- Forwarded message ----------\nFrom: ${replyTo.from_address}\nDate: ${replyTo.date}\nSubject: ${replyTo.subject}\n\n${replyTo.body_text || replyTo.snippet || ''}`)
    }
  }, [mode, replyTo])

  const handleSend = async () => {
    if (!to.trim()) return
    setSending(true)
    try {
      const action = (mode === 'reply' || mode === 'reply-all') ? mode : 'send'
      const payload = {
        email: userEmail,
        action,
        to,
        cc: cc || undefined,
        subject,
        body_html: `<div style="font-family: -apple-system, system-ui, sans-serif; font-size: 14px;">${body.replace(/\n/g, '<br>')}</div>`,
      }
      if (replyTo && (mode === 'reply' || mode === 'reply-all')) {
        payload.id = replyTo.gmail_id
      }
      if (replyTo?.thread_id) payload.thread_id = replyTo.thread_id

      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (result.ok) onSent()
    } catch (err) {
      console.error('[Email] Send error:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
        <h3 className="text-sm font-medium text-white">
          {mode === 'new' ? 'New Message' : mode === 'reply' ? 'Reply' : mode === 'reply-all' ? 'Reply All' : 'Forward'}
        </h3>
        <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60">Cancel</button>
      </div>
      <div className="p-4 space-y-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 w-8">To</span>
          <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs bg-white/5 border-white/10 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 w-8">Cc</span>
          <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 text-xs bg-white/5 border-white/10 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 w-8">Subj</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-xs bg-white/5 border-white/10 text-white" />
        </div>
      </div>
      <div className="flex-1 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          className="w-full h-full bg-transparent text-sm text-white placeholder:text-white/20 outline-none resize-none"
        />
      </div>
      <div className="px-5 py-3 border-t border-white/8 flex items-center gap-2">
        <Button onClick={handleSend} disabled={sending || !to.trim()} size="sm" className="bg-white text-black hover:bg-white/90">
          {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
          Send
        </Button>
      </div>
    </div>
  )
}
