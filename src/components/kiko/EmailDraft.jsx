// src/components/kiko/EmailDraft.jsx — Renders email drafts with tone CTAs and Send to Gmail
import { useState } from 'react'
import { Send, Pen } from 'lucide-react'
import T from '@/lib/theme'

export function isEmailDraft(text) {
  if (!text || text.length < 80) return false
  const lower = text.toLowerCase()
  if (!lower.includes('subject:') && !lower.includes('**subject**:')) return false
  const hasGreeting = /\b(dear|hi |hello |hey )\b/i.test(text)
  const hasSignoff = /\b(regards|sincerely|best,|sunny|cheers|thank)/i.test(lower)
  const hasDraftLabel = lower.includes('suggested draft') || lower.includes('email draft') || lower.includes('draft email')
  const hasTo = lower.includes('to:') || lower.includes('**to**:')
  return hasGreeting || hasSignoff || hasDraftLabel || hasTo
}

export function extractEmailSection(text) {
  const subjectIdx = text.search(/(?:^|\n)\s*\*?\*?Subject\*?\*?\s*:/im)
  if (subjectIdx === -1) return { pre: text, email: null }
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

  // Extract Subject
  const subMatch = t.match(/\*?\*?Subject\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  const subject = subMatch ? subMatch[1].replace(/\*\*/g, '').trim() : ''

  // Extract To
  const toMatch = t.match(/\*?\*?To\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''

  // Find where the actual email body starts (after To: line, or after Subject:)
  let bodyStartIdx = 0
  if (toMatch) {
    bodyStartIdx = t.indexOf(toMatch[0]) + toMatch[0].length
  } else if (subMatch) {
    bodyStartIdx = t.indexOf(subMatch[0]) + subMatch[0].length
  }

  let rawBody = t.slice(bodyStartIdx)

  // Cut body at the sign-off — everything after is Kiko's commentary
  const signoffPatterns = [
    /\n\s*(Best regards|Kind regards|Regards|Sincerely|Best|Cheers|Thank you|Thanks),?\s*\n\s*(Sunny\s*Sidhu|Sunny)\s*/i,
    /\n\s*(Sunny\s*Sidhu)\s*\n/i,
  ]
  for (const pat of signoffPatterns) {
    const m = rawBody.match(pat)
    if (m) {
      // Include the sign-off in the body, cut everything after
      const signoffEnd = rawBody.indexOf(m[0]) + m[0].length
      // Find end of sign-off block (next blank line or ## header)
      const afterSignoff = rawBody.slice(signoffEnd)
      const cutPoint = afterSignoff.search(/\n\s*(\*\*|##|Key |Strategic |Next |This |The |I |Note)/)
      if (cutPoint > -1) {
        rawBody = rawBody.slice(0, signoffEnd + cutPoint).trim()
      } else {
        rawBody = rawBody.slice(0, signoffEnd).trim()
      }
      break
    }
  }

  // Also cut at common Kiko commentary markers if no sign-off found
  const commentaryMarkers = [
    /\n\s*\*\*Key positioning/i,
    /\n\s*\*\*Strategic rationale/i,
    /\n\s*\*\*Next steps/i,
    /\n\s*\*\*Timing/i,
    /\n\s*\*\*My recommendation/i,
    /\n\s*\*\*Note:/i,
    /\n\s*##\s*TIMING/i,
    /\n\s*This targets/i,
    /\n\s*The email positions/i,
    /\n\s*I've framed/i,
    /\n\s*I'd push back/i,
    /\n\s*I recommend/i,
    /\n\s*My recommendation/i,
  ]
  for (const marker of commentaryMarkers) {
    const idx = rawBody.search(marker)
    if (idx > 20) { // Only cut if there's real content before the marker
      rawBody = rawBody.slice(0, idx).trim()
      break
    }
  }

  // Clean markdown bold markers, brackets, and sign-off name (Gmail adds signature)
  let body = rawBody
    .replace(/\*\*/g, '')
    .replace(/\[Current[^\]]*\]/gi, '')
    .replace(/\n\s*(Best regards|Kind regards|Regards|Sincerely|Best|Cheers),?\s*\n?\s*(Sunny\s*Sidhu|Sunny)?\s*$/i, '')
    .replace(/\n\s*Sunny\s*Sidhu\s*$/i, '')
    .trim()

  return { subject, to, body }
}

// Simple inline markdown → HTML (bold, italic, links)
function renderBody(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

export default function EmailDraft({ text, onRewrite }) {
  const [sent, setSent] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const parsed = parseEmail(text)
  const [currentBody, setCurrentBody] = useState(parsed.body)
  const [originalBody] = useState(parsed.body)
  const [hasRewritten, setHasRewritten] = useState(false)
  const subject = parsed.subject
  const to = parsed.to
  const body = currentBody

  const handleSendGmail = () => {
    window.dispatchEvent(new CustomEvent('kiko_action', {
      detail: { action: 'create_gmail_draft', subject, to, body }
    }))
    setSent(true)
  }

  const handleRewrite = async (prompt) => {
    setRewriting(true)
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, voiceMode: false, greeting: false })
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try { const d = JSON.parse(line.slice(6)); if (d.token) full += d.token } catch {}
          }
        }
      }
      // Extract just the email body from the rewrite response
      const rewritten = full.replace(/\*\*/g, '').replace(/^.*Subject:.*\n/i, '').replace(/^.*To:.*\n/i, '').replace(/##.*$/gm, '').replace(/\n\s*(Best regards|Regards|Sincerely|Best),?\s*\n?\s*(Sunny\s*Sidhu|Sunny)?\s*$/i, '').trim()
      if (rewritten.length > 20) {
        setCurrentBody(rewritten)
        setHasRewritten(true)
      }
    } catch (e) { console.error('Rewrite failed:', e) }
    setRewriting(false)
  }

  const handleRevert = () => { setCurrentBody(originalBody); setHasRewritten(false) }

  const tones = [
    { label: 'More Direct', prompt: `Rewrite this email more directly and concisely. Output ONLY the email body text, no subject line, no commentary, no sign-off name:\n\n${body}` },
    { label: 'Warmer Tone', prompt: `Rewrite this email with a warmer tone. Output ONLY the email body text, no subject line, no commentary, no sign-off name:\n\n${body}` },
    { label: 'Shorter', prompt: `Make this email significantly shorter. Output ONLY the email body text, no subject line, no commentary, no sign-off name:\n\n${body}` },
  ]

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.25)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>
      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, lineHeight: '1.7', position: 'relative' }}
        dangerouslySetInnerHTML={{ __html: renderBody(body) }} />
      {rewriting && <div style={{ padding: '8px 18px', fontSize: 12, color: 'rgba(139,108,246,0.6)', fontFamily: T.font }}>Rewriting...</div>}
      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => handleRewrite(t.prompt)} disabled={rewriting} style={{
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
        {hasRewritten && (
          <button onClick={handleRevert} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseOut={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          >↩ Revert</button>
        )}
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
