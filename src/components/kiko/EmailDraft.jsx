// src/components/kiko/EmailDraft.jsx — Renders email drafts with tone CTAs and Send to Gmail
import { useState } from 'react'
import { Send, Pen } from 'lucide-react'
import T from '@/lib/theme'

// Detect if text contains an email draft
export function isEmailDraft(text) {
  if (!text) return false
  const lower = text.toLowerCase()
  return (lower.includes('subject:') && (lower.includes('best regards') || lower.includes('best,') || lower.includes('regards,') || lower.includes('sunny sidhu') || lower.includes('sincerely') || lower.includes('sunny')))
    || (lower.includes('suggested draft') && lower.includes('subject:'))
    || (lower.includes('**subject**:') || lower.includes('**subject:**'))
}

// Parse email components — handles both line-separated and concatenated formats
function parseEmail(text) {
  // First normalise: insert newlines before known markers if missing
  let t = text
    .replace(/#{1,3}\s*SUGGESTED\s*DRAFT\s*/gi, '')
    .replace(/\*?\*?\[Subject to[^\]]*\]\*?\*?\s*/gi, '')
  // Insert newlines before Subject:/To: if they're concatenated
  t = t.replace(/(Subject\s*:)/i, '\n$1')
  t = t.replace(/(To\s*:)/i, '\n$1')

  // Extract Subject
  const subMatch = t.match(/Subject\s*:\s*(.+?)(?:\n|To\s*:)/i)
  const subject = subMatch ? subMatch[1].replace(/\*\*/g, '').trim() : ''
  
  // Extract To
  const toMatch = t.match(/To\s*:\s*(.+?)(?:\n|[A-Z][a-z])/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''
  
  // Extract body — everything after To: line (and recipient), before ## TIMING
  let bodyStart = t.indexOf(to) + to.length
  if (bodyStart <= to.length) {
    // Fallback: body starts after Subject line
    const sIdx = t.search(/Subject\s*:.*\n/i)
    bodyStart = sIdx > -1 ? t.indexOf('\n', sIdx) + 1 : 0
  }
  let body = t.slice(bodyStart).replace(/##\s*TIMING[\s\S]*/i, '').trim()
  
  // Clean up body — remove leading To: remnants and name
  body = body.replace(/^To\s*:\s*[^\n]*\n?/i, '').trim()
  // Remove [Current...] patterns
  body = body.replace(/\[Current[^\]]*\]\s*/gi, '').trim()
  
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

  // Split body into paragraphs for clean rendering
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim())

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.25)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, lineHeight: '1.7' }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '12px 0 0' }}>{p.trim()}</p>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => onRewrite?.(t.prompt)} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
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
