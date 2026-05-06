import { useState, useRef, useEffect } from 'react'
import { X, Send, Save, ChevronDown } from 'lucide-react'

export default function KikoEmailComposer({ to = '', subject = '', body = '', onClose, visible = true }) {
  const [toVal, setToVal] = useState(to)
  const [subjectVal, setSubjectVal] = useState(subject)
  const [bodyVal, setBodyVal] = useState(body)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => { if (to) setToVal(to) }, [to])
  useEffect(() => { if (subject) setSubjectVal(subject) }, [subject])
  useEffect(() => { if (body) setBodyVal(body) }, [body])
  useEffect(() => { if (visible && bodyRef.current) bodyRef.current.focus() }, [visible])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const saveDraft = async () => {
    setSending(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/create-gmail-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toVal, subject: subjectVal, body: bodyVal, sender: 'matt.smith' })
      })
      if (res.ok) showToast('Draft saved to Gmail')
      else showToast('Failed — check console', 'error')
    } catch { showToast('Network error', 'error') }
    setSending(false)
  }

  if (!visible) return null

  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: '#0A0A0A', color: '#fff',
        fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
      }}>
        <span>Compose Email</span>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* To */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 16px' }}>
        <span style={{ fontSize: 12, color: '#999', width: 56, flexShrink: 0 }}>To</span>
        <input value={toVal} onChange={e => setToVal(e.target.value)} placeholder="recipient@company.com" style={{
          flex: 1, border: 'none', outline: 'none', padding: '10px 0', fontSize: 13,
          fontFamily: 'inherit', color: '#0A0A0A', background: 'transparent',
        }} />
      </div>

      {/* Subject */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 16px' }}>
        <span style={{ fontSize: 12, color: '#999', width: 56, flexShrink: 0 }}>Subject</span>
        <input value={subjectVal} onChange={e => setSubjectVal(e.target.value)} placeholder="Subject line" style={{
          flex: 1, border: 'none', outline: 'none', padding: '10px 0', fontSize: 13,
          fontFamily: 'inherit', color: '#0A0A0A', fontWeight: 500, background: 'transparent',
        }} />
      </div>

      {/* Body */}
      <textarea
        ref={bodyRef}
        value={bodyVal}
        onChange={e => setBodyVal(e.target.value)}
        placeholder={'Dear [Name],\n\nWrite your email here...\n\nKind regards,'}
        style={{
          flex: 1, minHeight: 200, maxHeight: 400,
          border: 'none', outline: 'none', resize: 'vertical',
          padding: '14px 16px', fontSize: 13, lineHeight: 1.7,
          fontFamily: 'inherit', color: '#0A0A0A', background: 'transparent',
        }}
      />

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        background: '#FAFAF8',
      }}>
        <button onClick={saveDraft} disabled={sending} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 6,
          background: '#0A0A0A', color: '#fff', border: 'none',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          opacity: sending ? 0.6 : 1, fontFamily: 'inherit',
          transition: 'opacity 150ms',
        }}>
          <Save size={12} />
          {sending ? 'Saving...' : 'Save to Gmail Drafts'}
        </button>
        <span style={{ fontSize: 11, color: '#B0B0B0' }}>
          Sends from Matt Smith
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 20px', borderRadius: 8,
          background: toast.type === 'error' ? '#DC2626' : '#16A34A',
          color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 10,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
