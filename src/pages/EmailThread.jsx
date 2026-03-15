import { useState, useEffect, useRef } from 'react'
import { Reply, ReplyAll, Forward, Trash2, ChevronDown, ChevronUp, Paperclip, Download } from 'lucide-react'
import DOMPurify from 'dompurify'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', text: '#1A1A1A',
  textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)', blue: '#007AFF',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

function extractName(addr) {
  if (!addr) return ''
  const m = addr.match(/^"?([^"<]+)"?\s*</)
  return m ? m[1].trim() : addr.split('@')[0]
}

function extractEmail(addr) {
  if (!addr) return ''
  const m = addr.match(/<([^>]+)>/)
  return m ? m[1] : addr
}

export default function EmailThread({ threadId, userEmail, onReply, onReplyAll, onForward, onTrash }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({}) // msgId => bool
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!threadId) return
    setLoading(true)
    setMessages([])
    fetch(`/api/email?email=${encodeURIComponent(userEmail)}&action=thread&threadId=${threadId}`)
      .then(r => r.json())
      .then(data => {
        const msgs = data.messages || []
        setMessages(msgs)
        // Auto-expand the last message
        if (msgs.length > 0) {
          const last = msgs[msgs.length - 1]
          setExpanded({ [last.gmail_id]: true })
        }
        setLoading(false)
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })
      .catch(() => setLoading(false))
  }, [threadId])

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (messages.length === 0) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary, fontSize: 13 }}>Thread not found</div>
  }

  const subject = messages[0]?.subject || '(no subject)'
  const lastMsg = messages[messages.length - 1]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: T.font }}>
      {/* Thread header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text, margin: '0 0 6px', lineHeight: 1.3 }}>{subject}</h2>
        <span style={{ fontSize: 11, color: T.textTertiary }}>
          {messages.length} message{messages.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 16px', borderBottom: `1px solid ${T.border}` }}>
        {[
          { label: 'Reply', icon: Reply, action: () => onReply(lastMsg) },
          { label: 'Reply All', icon: ReplyAll, action: () => onReplyAll(lastMsg) },
          { label: 'Forward', icon: Forward, action: () => onForward(lastMsg) },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
            border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.textSecondary,
            fontFamily: T.font, transition: 'background 0.1s',
          }}
            onMouseOver={e => e.currentTarget.style.background = T.accentSoft}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <btn.icon size={14} /> {btn.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onTrash} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
          border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.textTertiary,
          fontFamily: T.font,
        }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,59,48,0.06)'; e.currentTarget.style.color = '#FF3B30' }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textTertiary }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {messages.map((msg, i) => {
          const isExpanded = expanded[msg.gmail_id]
          const isLast = i === messages.length - 1
          const fromName = extractName(msg.from_address)
          const fromEmail = extractEmail(msg.from_address)
          const dateStr = msg.date ? new Date(msg.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

          return (
            <div key={msg.gmail_id} style={{ marginBottom: 8, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden', background: T.surface }}>
              {/* Message header — clickable to expand/collapse */}
              <button onClick={() => toggleExpand(msg.gmail_id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                border: 'none', cursor: 'pointer', background: isExpanded ? T.surface : T.bg, textAlign: 'left',
                fontFamily: T.font, transition: 'background 0.1s',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: T.accentSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 13, fontWeight: 600, color: T.textSecondary,
                }}>
                  {fromName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fromName}</span>
                    <span style={{ fontSize: 11, color: T.textTertiary }}>{fromEmail}</span>
                  </div>
                  {!isExpanded && (
                    <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.snippet || msg.body_text?.slice(0, 100) || ''}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 10, color: T.textTertiary, flexShrink: 0 }}>{dateStr}</span>
                {isExpanded ? <ChevronUp size={14} color={T.textTertiary} /> : <ChevronDown size={14} color={T.textTertiary} />}
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* To/CC */}
                  <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 10, lineHeight: 1.6 }}>
                    <span>To: {Array.isArray(msg.to_addresses) ? msg.to_addresses.join(', ') : (msg.to_addresses || '')}</span>
                    {msg.cc_addresses && msg.cc_addresses.length > 0 && (
                      <span style={{ display: 'block' }}>CC: {msg.cc_addresses.join(', ')}</span>
                    )}
                  </div>
                  {msg.has_attachments && msg.attachments?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {msg.attachments.map((att, ai) => (
                        <a key={ai} href={`/api/email?email=${encodeURIComponent(userEmail)}&action=attachment&messageId=${att.messageId}&attachmentId=${att.id}&filename=${encodeURIComponent(att.filename)}`}
                          download={att.filename} target="_blank" rel="noopener"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                            borderRadius: 8, background: T.accentSoft, fontSize: 11, color: T.textSecondary,
                            textDecoration: 'none', border: `1px solid ${T.border}`, fontFamily: T.font,
                          }}
                          onMouseOver={e => e.currentTarget.style.borderColor = T.blue}
                          onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
                          <Paperclip size={11} />
                          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                          <span style={{ color: T.textTertiary }}>{att.size ? `${(att.size / 1024).toFixed(0)}KB` : ''}</span>
                          <Download size={11} style={{ color: T.blue }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {msg.has_attachments && (!msg.attachments || msg.attachments.length === 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textTertiary, marginBottom: 8 }}>
                      <Paperclip size={12} /> Attachments
                    </div>
                  )}
                  {/* Body */}
                  <MessageBody html={msg.body_html} text={msg.body_text || msg.snippet} />
                </div>
              )}
            </div>
          )
        })}
        <div ref={scrollRef} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function MessageBody({ html, text }) {
  const iframeRef = useRef(null)

  useEffect(() => {
    if (!iframeRef.current || !html) return
    const doc = iframeRef.current.contentDocument
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p','br','b','i','u','a','img','div','span','table','tr','td','th','thead','tbody','h1','h2','h3','h4','ul','ol','li','blockquote','pre','code','hr','strong','em','center','font','style'],
      ALLOWED_ATTR: ['href','src','alt','style','class','width','height','target','colspan','rowspan','color','face','size','align','valign','bgcolor','border','cellpadding','cellspacing'],
    })
    doc.open()
    doc.write(`<html><head><style>
      body { font-family: -apple-system, system-ui, sans-serif; font-size: 14px; color: #1A1A1A; background: #fff; margin: 0; padding: 0; line-height: 1.6; word-wrap: break-word; }
      a { color: #007AFF; }
      img { max-width: 100%; height: auto; }
      blockquote { border-left: 3px solid #e0e0e0; margin: 8px 0; padding-left: 12px; color: #6B6B6B; }
      table { border-collapse: collapse; max-width: 100%; }
      td, th { padding: 4px 8px; }
    </style></head><body>${clean}</body></html>`)
    doc.close()
    // Auto-size iframe
    const resize = () => {
      if (iframeRef.current?.contentDocument?.body) {
        iframeRef.current.style.height = iframeRef.current.contentDocument.body.scrollHeight + 20 + 'px'
      }
    }
    setTimeout(resize, 100)
    setTimeout(resize, 500)
  }, [html])

  if (!html) {
    return <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text || ''}</div>
  }

  return <iframe ref={iframeRef} title="Email" style={{ width: '100%', border: 'none', minHeight: 100 }} sandbox="allow-same-origin" />
}
