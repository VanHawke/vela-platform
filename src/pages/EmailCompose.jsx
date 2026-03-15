import { useState, useEffect, useRef } from 'react'
import { Send, X, Bold, Italic, Underline, Link, List, Loader2 } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)', blue: '#007AFF',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

function extractEmail(addr) {
  if (!addr) return ''
  const m = addr.match(/<([^>]+)>/)
  return m ? m[1] : addr
}

export default function EmailCompose({ mode, replyTo, userEmail, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [showCc, setShowCc] = useState(false)
  const editorRef = useRef(null)

  useEffect(() => {
    if (mode === 'reply' && replyTo) {
      setTo(extractEmail(replyTo.from_address) || '')
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`)
    } else if (mode === 'reply-all' && replyTo) {
      const all = [replyTo.from_address, ...(Array.isArray(replyTo.to_addresses) ? replyTo.to_addresses : [])].map(extractEmail).filter(a => a && a !== userEmail)
      setTo(all.join(', '))
      const ccList = (replyTo.cc_addresses || []).map(extractEmail).filter(a => a && a !== userEmail)
      if (ccList.length) { setCc(ccList.join(', ')); setShowCc(true) }
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`)
    } else if (mode === 'forward' && replyTo) {
      setSubject(`Fwd: ${replyTo.subject || ''}`)
    }
  }, [mode, replyTo])

  // Set initial content in contentEditable after mount
  useEffect(() => {
    if (!editorRef.current) return
    if (mode === 'forward' && replyTo) {
      const fwd = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;color:#6B6B6B;font-size:13px">
        <p><b>From:</b> ${replyTo.from_address || ''}<br>
        <b>Date:</b> ${replyTo.date ? new Date(replyTo.date).toLocaleString() : ''}<br>
        <b>Subject:</b> ${replyTo.subject || ''}</p>
        ${replyTo.body_html || replyTo.snippet || ''}
      </div>`
      editorRef.current.innerHTML = fwd
    } else if ((mode === 'reply' || mode === 'reply-all') && replyTo) {
      const quote = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;color:#6B6B6B;font-size:13px">
        <p>On ${replyTo.date ? new Date(replyTo.date).toLocaleString() : ''}, ${replyTo.from_address || ''} wrote:</p>
        ${replyTo.body_html || replyTo.snippet || ''}
      </div>`
      editorRef.current.innerHTML = `<p><br></p>${quote}`
      // Place cursor at start
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(editorRef.current.firstChild || editorRef.current, 0)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editorRef.current.innerHTML = '<p><br></p>'
    }
    editorRef.current.focus()
  }, [])

  const execCmd = (cmd, val = null) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
  }

  const insertLink = () => {
    const url = prompt('Enter URL:')
    if (url) execCmd('createLink', url)
  }

  const handleSend = async () => {
    if (!to.trim()) return
    setSending(true)
    try {
      const bodyHtml = editorRef.current?.innerHTML || ''
      const payload = {
        email: userEmail,
        action: (mode === 'reply' || mode === 'reply-all') ? mode : 'send',
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body_html: bodyHtml,
      }
      if (replyTo?.gmail_id && (mode === 'reply' || mode === 'reply-all')) {
        payload.id = replyTo.gmail_id
      }
      if (replyTo?.thread_id) payload.thread_id = replyTo.thread_id

      const res = await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (result.ok) onSent()
      else console.error('[Compose] Send error:', result)
    } catch (err) {
      console.error('[Compose] Error:', err)
    } finally { setSending(false) }
  }

  const title = mode === 'new' ? 'New Message' : mode === 'reply' ? 'Reply' : mode === 'reply-all' ? 'Reply All' : 'Forward'

  const fieldStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
    borderBottom: `1px solid ${T.border}`, height: 40,
  }
  const labelStyle = { fontSize: 12, color: T.textTertiary, width: 36, flexShrink: 0, fontFamily: T.font }
  const inputStyle = {
    flex: 1, border: 'none', outline: 'none', fontSize: 13, color: T.text,
    fontFamily: T.font, background: 'transparent', height: '100%',
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: T.font, background: T.surface }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4,
        }}><X size={16} /></button>
      </div>

      {/* Fields */}
      <div style={fieldStyle}>
        <span style={labelStyle}>To</span>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" style={inputStyle} autoFocus={mode === 'new'} />
        {!showCc && <button onClick={() => setShowCc(true)} style={{ fontSize: 11, color: T.textTertiary, background: 'none', border: 'none', cursor: 'pointer' }}>Cc/Bcc</button>}
      </div>
      {showCc && (
        <>
          <div style={fieldStyle}>
            <span style={labelStyle}>Cc</span>
            <input value={cc} onChange={e => setCc(e.target.value)} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Bcc</span>
            <input value={bcc} onChange={e => setBcc(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}
      <div style={fieldStyle}>
        <span style={labelStyle}>Subj</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={inputStyle} />
      </div>

      {/* Formatting toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 12px', borderBottom: `1px solid ${T.border}` }}>
        {[
          { icon: Bold, cmd: 'bold' },
          { icon: Italic, cmd: 'italic' },
          { icon: Underline, cmd: 'underline' },
          { icon: List, cmd: 'insertUnorderedList' },
          { icon: Link, cmd: 'link' },
        ].map(btn => (
          <button key={btn.cmd} onClick={() => btn.cmd === 'link' ? insertLink() : execCmd(btn.cmd)} style={{
            width: 30, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary,
          }}
            onMouseOver={e => e.currentTarget.style.background = T.accentSoft}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <btn.icon size={14} />
          </button>
        ))}
      </div>

      {/* Rich text editor (contentEditable) */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            minHeight: '100%', outline: 'none', fontSize: 14, lineHeight: 1.6,
            color: T.text, fontFamily: '-apple-system, system-ui, sans-serif',
          }}
          onPaste={(e) => {
            // Allow rich paste (HTML signatures etc)
            const html = e.clipboardData?.getData('text/html')
            if (html) {
              e.preventDefault()
              document.execCommand('insertHTML', false, html)
            }
          }}
        />
      </div>

      {/* Send bar */}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handleSend} disabled={sending || !to.trim()} style={{
          height: 36, padding: '0 20px', borderRadius: 10, border: 'none',
          background: to.trim() ? T.accent : T.accentSoft,
          color: to.trim() ? '#fff' : T.textTertiary,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
        }}>
          {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
          Send
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
