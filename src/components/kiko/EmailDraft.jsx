// src/components/kiko/EmailDraft.jsx — Renders email drafts with tone CTAs and Send to Gmail
import { useState } from 'react'
import { Send, RefreshCw, Pen } from 'lucide-react'
import T from '@/lib/theme'

// Detect if text contains an email draft
export function isEmailDraft(text) {
  if (!text) return false
  const lower = text.toLowerCase()
  return (lower.includes('subject:') && (lower.includes('best regards') || lower.includes('best,') || lower.includes('regards,') || lower.includes('sunny sidhu') || lower.includes('sincerely')))
    || (lower.includes('## suggested draft') && lower.includes('subject:'))
    || (lower.includes('**subject**:') || lower.includes('**subject:**'))
}

// Parse email components from text
function parseEmail(text) {
  const lines = text.split('\n')
  let subject = '', to = '', body = '', inBody = false, preBody = ''
  for (const line of lines) {
    const l = line.trim()
    if (!subject && (l.match(/^\*?\*?subject\*?\*?:/i) || l.match(/^subject:/i))) {
      subject = l.replace(/^\*?\*?subject\*?\*?:\s*/i, '').replace(/\*\*/g, '').trim()
    } else if (!to && (l.match(/^\*?\*?to\*?\*?:/i) || l.match(/^to:/i))) {
      to = l.replace(/^\*?\*?to\*?\*?:\s*/i, '').replace(/\*\*/g, '').trim()
    } else if (subject && !inBody && l === '') {
      inBody = true
    } else if (inBody || (subject && !l.startsWith('##') && !l.startsWith('**Subject') && !l.startsWith('*['))) {
      inBody = true
      body += line + '\n'
    } else {
      preBody += line + '\n'
    }
  }
  // Clean body — strip signature area trailing content after ## TIMING etc
  body = body.replace(/##\s*TIMING[\s\S]*/i, '').trim()
  return { subject, to, body, preBody: preBody.trim() }
}

export default function EmailDraft({ text, onRewrite }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { subject, to, body } = parseEmail(text)

  const handleSendGmail = async () => {
    setSending(true)
    try {
      // Dispatch event to trigger Gmail draft creation via Kiko
      window.dispatchEvent(new CustomEvent('kiko_action', {
        detail: { action: 'create_gmail_draft', subject, to, body }
      }))
      setSent(true)
    } catch { setSending(false) }
  }

  const tones = [
    { label: 'More Direct', prompt: `Rewrite this email more directly and concisely:\n\nSubject: ${subject}\n\n${body}` },
    { label: 'Warmer', prompt: `Rewrite this email with a warmer, more personable tone:\n\nSubject: ${subject}\n\n${body}` },
    { label: 'Shorter', prompt: `Make this email significantly shorter while keeping the key message:\n\nSubject: ${subject}\n\n${body}` },
  ]

  return (
    <div style={{ margin: '8px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.08)' }}>
      {/* Email header */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: T.font, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.3)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>

      {/* Email body */}
      <div style={{ padding: '16px', fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, lineHeight: '1.6', whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.015)' }}>
        {body}
      </div>

      {/* Actions bar */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)', borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {/* Tone buttons */}
        {tones.map(t => (
          <button key={t.label} onClick={() => onRewrite?.(t.prompt)} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
          ><Pen size={10} /> {t.label}</button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Send to Gmail */}
        <button onClick={handleSendGmail} disabled={sending || sent} style={{
          padding: '6px 14px', borderRadius: 50,
          background: sent ? 'rgba(34,197,94,0.1)' : 'rgba(139,108,246,0.08)',
          border: sent ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(139,108,246,0.15)',
          color: sent ? 'rgba(34,197,94,0.8)' : 'rgba(139,108,246,0.8)',
          fontSize: 12, cursor: sent ? 'default' : 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500,
          transition: 'all 0.15s',
        }}
          onMouseOver={e => { if (!sent) { e.currentTarget.style.background = 'rgba(139,108,246,0.14)' }}}
          onMouseOut={e => { if (!sent) { e.currentTarget.style.background = 'rgba(139,108,246,0.08)' }}}
        >
          <Send size={11} /> {sent ? 'Draft created' : sending ? 'Creating...' : 'Send to Gmail'}
        </button>
      </div>
    </div>
  )
}
