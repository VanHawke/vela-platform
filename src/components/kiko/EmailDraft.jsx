// src/components/kiko/EmailDraft.jsx — Renders email drafts with tone CTAs and Send to Gmail
import { useState } from 'react'
import { Send, Pen } from 'lucide-react'
import T from '@/lib/theme'

// Detect if text contains an email draft — very inclusive
export function isEmailDraft(text) {
  if (!text || text.length < 80) return false
  const lower = text.toLowerCase()
  // Must have Subject:
  if (!lower.includes('subject:') && !lower.includes('**subject**:')) return false
  // Must have some sign of email body (greeting or sign-off)
  const hasGreeting = /\b(dear|hi |hello |hey )\b/i.test(text)
  const hasSignoff = /\b(regards|sincerely|best,|sunny|cheers|thank)/i.test(lower)
  const hasDraftLabel = lower.includes('suggested draft') || lower.includes('email draft') || lower.includes('draft email')
  const hasTo = lower.includes('to:') || lower.includes('**to**:')
  return hasGreeting || hasSignoff || hasDraftLabel || hasTo
}

// Extract email from text that may contain research + draft
export function extractEmailSection(text) {
  // Find where the email starts — look for Subject: line
  const subjectIdx = text.search(/(?:^|\n)\s*\*?\*?Subject\*?\*?\s*:/im)
  if (subjectIdx === -1) return { pre: text, email: null }
  // Look for the start of the draft section (## SUGGESTED DRAFT, etc.)
  const draftHeaderIdx = text.search(/##\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT)/i)
  const emailStart = draftHeaderIdx > -1 ? draftHeaderIdx : subjectIdx
  const pre = text.slice(0, emailStart).trim()
  const emailText = text.slice(emailStart).trim()
  return { pre, email: emailText }
}

function parseEmail(text) {
  let t = text
    .replace(/#{1,3}\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT)\s*/gi, '')
    .replace(/\*?\*?\[Subject to[^\]]*\]\*?\*?\s*/gi, '')
  // Insert newlines before Subject:/To: if concatenated
  t = t.replace(/(Subject\s*:)/i, '\n$1')
  t = t.replace(/(To\s*:)/i, '\n$1')

  const subMatch = t.match(/Subject\s*:\s*(.+?)(?:\n|$)/i)
  const subject = subMatch ? subMatch[1].replace(/\*\*/g, '').trim() : ''

  const toMatch = t.match(/To\s*:\s*(.+?)(?:\n|$)/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''

  // Body starts after the To: line, or after Subject: if no To
  let bodyStart = 0
  if (toMatch) {
    bodyStart = t.indexOf(toMatch[0]) + toMatch[0].length
  } else if (subMatch) {
    bodyStart = t.indexOf(subMatch[0]) + subMatch[0].length
  }
  let body = t.slice(bodyStart)
    .replace(/##\s*TIMING[\s\S]*/i, '')
    .replace(/\[Current[^\]]*\]/gi, '')
    .trim()
  return { subject, to, body }
}

export default function EmailDraft({ text, onRewrite }) {
  const [sent, setSent] = useState(false)
  const { subject, to, body } = parseEmail(text)

  const handleSendGmail = () => {
    window.dispatchEvent(new CustomEvent('kiko_action', {
      detail: { action: 'create_gmail_draft', subject, to, body }
    }))
    setSent(true)
  }

  const tones = [
    { label: 'More Direct', prompt: `Rewrite this email more directly and concisely:\n\nSubject: ${subject}\n\n${body}` },
    { label: 'Warmer Tone', prompt: `Rewrite this email with a warmer, more personable tone:\n\nSubject: ${subject}\n\n${body}` },
    { label: 'Shorter', prompt: `Make this email significantly shorter while keeping the key message:\n\nSubject: ${subject}\n\n${body}` },
  ]

  const paragraphs = body.split(/\n\n+/).filter(p => p.trim())

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.25)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>
      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, lineHeight: '1.7' }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '12px 0 0' }}>{p.trim()}</p>
        ))}
      </div>
      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => onRewrite?.(t.prompt)} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          ><Pen size={9} /> {t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleSendGmail} disabled={sent} style={{
          padding: '6px 14px', borderRadius: 50,
          background: sent ? 'rgba(34,197,94,0.08)' : 'rgba(139,108,246,0.06)',
          border: sent ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(139,108,246,0.12)',
          color: sent ? 'rgba(34,197,94,0.8)' : 'rgba(139,108,246,0.75)',
          fontSize: 12, cursor: sent ? 'default' : 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, transition: 'all 0.15s',
        }}
          onMouseOver={e => { if (!sent) e.currentTarget.style.background = 'rgba(139,108,246,0.12)' }}
          onMouseOut={e => { if (!sent) e.currentTarget.style.background = 'rgba(139,108,246,0.06)' }}
        ><Send size={11} /> {sent ? 'Draft created' : 'Send to Gmail'}</button>
      </div>
    </div>
  )
}
