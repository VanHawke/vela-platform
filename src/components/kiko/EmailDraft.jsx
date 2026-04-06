// src/components/kiko/EmailDraft.jsx — Email draft frame with tone CTAs and Gmail send
import { useState, useRef } from 'react'
import { Send, Pen, RotateCcw } from 'lucide-react'
import T from '@/lib/theme'

export function isEmailDraft(text) {
  if (!text || text.length < 80) return false
  const lower = text.toLowerCase()
  // Must have Subject: in some form
  const hasSubject = /\*?\*?subject\*?\*?\s*:/i.test(text)
  if (!hasSubject) return false
  const hasGreeting = /\b(dear|hi |hello |hey )\b/i.test(text)
  const hasSignoff = /\b(regards|sincerely|best,|sunny|cheers|thank)/i.test(lower)
  const hasDraftLabel = lower.includes('suggested draft') || lower.includes('email draft') || lower.includes('draft email') || lower.includes('here\'s the email') || lower.includes('here is the email') || lower.includes('drafted')
  const hasTo = /\*?\*?to\*?\*?\s*:/i.test(text)
  // Also match when Subject: + To: appear together (strong signal even without greeting)
  const hasSubjectAndTo = hasSubject && hasTo
  return hasGreeting || hasSignoff || hasDraftLabel || hasSubjectAndTo
}

export function extractEmailSection(text) {
  // Try SUGGESTED DRAFT header first (most reliable)
  const draftHeaderIdx = text.search(/#{1,3}\s*\d*\.?\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT\s*EMAIL)/i)
  // Then try "Here's the email" / "Here is the draft" intro patterns
  const hereIdx = text.search(/(?:Here(?:'|'|&#39;)?s the (?:email|draft)|Here is the (?:email|draft)|I(?:'|'|&#39;)?ve drafted)[^:]*:\s*/i)
  // Then Subject: directly
  const subjectIdx = text.search(/(?:^|\n|\.|\:)\s*\*?\*?Subject\*?\*?\s*:/im)
  
  if (draftHeaderIdx === -1 && hereIdx === -1 && subjectIdx === -1) return { pre: text, email: null }
  
  // Use the earliest reliable marker
  let emailStart
  if (draftHeaderIdx > -1) emailStart = draftHeaderIdx
  else if (hereIdx > -1) {
    // Find where the actual email starts after "Here's the email:"
    const afterHere = text.slice(hereIdx).search(/\n\s*\*?\*?Subject\*?\*?\s*:/i)
    emailStart = afterHere > -1 ? hereIdx + afterHere : hereIdx
  }
  else emailStart = subjectIdx > 0 ? subjectIdx : 0
  
  return { pre: text.slice(0, emailStart).trim(), email: text.slice(emailStart).trim() }
}

function parseEmail(text) {
  let t = text
    .replace(/#{1,3}\s*\d*\.?\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT)\s*/gi, '')
    .replace(/\*?\*?\[Subject to[^\]]*\]\*?\*?\s*/gi, '')
  // Insert newlines to split concatenated Subject/To/Dear
  t = t.replace(/(Subject\s*:)/i, '\n$1').replace(/(To\s*:)/i, '\n$1').replace(/(Dear\s+\w)/i, '\n$1')

  const subMatch = t.match(/\*?\*?Subject\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  const subject = subMatch ? subMatch[1]
    .replace(/\*\*/g, '')
    .replace(/â€"/g, '-').replace(/â€"/g, '-')
    .replace(/[\u2014\u2013\u2015\u2012\u2010\u2011]/g, '-')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .trim() : ''
  const toMatch = t.match(/\*?\*?To\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''

  let bodyStartIdx = 0
  if (toMatch) bodyStartIdx = t.indexOf(toMatch[0]) + toMatch[0].length
  else if (subMatch) bodyStartIdx = t.indexOf(subMatch[0]) + subMatch[0].length
  let rawBody = t.slice(bodyStartIdx)

  // Aggressively cut at sign-off + name + any commentary
  // Cut at sign-off or commentary — works with or without newlines
  const cutPatterns = [
    /(Best regards|Kind regards|Regards|Sincerely|Best|Cheers|Warm regards),?\s*(Sunny|Van Hawke)/i,
    /\n\s*\*\*(Analysis|My recommendation|Key positioning|Strategic|Next steps|Timing|Note)[:\s]/i,
    /\n\s*(This reengagement|This targets|The email positions|I've framed|I'd push back|I recommend|My recommendation)/i,
    /\n\s*(Analysis:|Note:|Recommendation:)/i,
  ]
  for (const pat of cutPatterns) {
    const idx = rawBody.search(pat)
    if (idx > 15) { rawBody = rawBody.slice(0, idx).trim(); break }
  }
  // AGGRESSIVE final cleanup — remove ANY sign-off, username, company name anywhere
  let body = rawBody
    .replace(/\*\*/g, '')
    .replace(/\[Current[^\]]*\]/gi, '')
    .replace(/Best regards,?\s*/gi, '')
    .replace(/Kind regards,?\s*/gi, '')
    .replace(/Warm regards,?\s*/gi, '')
    .replace(/Regards,?\s*/gi, '')
    .replace(/Sincerely,?\s*/gi, '')
    .replace(/Cheers,?\s*/gi, '')
    .replace(/Sunny\s*Sidhu/gi, '')
    .replace(/Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?\s*/gi, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
  return { subject, to, body }
}

function renderBody(text) {
  return text
    // Nuclear strip — catch ANY remaining username/company/sign-off
    .replace(/Best regards,?\s*/gi, '')
    .replace(/Kind regards,?\s*/gi, '')
    .replace(/Warm regards,?\s*/gi, '')
    .replace(/Regards,?\s*/gi, '')
    .replace(/Sincerely,?\s*/gi, '')
    .replace(/Cheers,?\s*/gi, '')
    .replace(/Sunny\s*Sidhu/gi, '')
    .replace(/Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?\s*/gi, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/\n/g, '<br/>')
    .replace(/<br\/>\s*<br\/>\s*<br\/>/g, '<br/><br/>')
    .trim()
}

export default function EmailDraft({ text }) {
  const parsed = parseEmail(text)
  const [currentBody, setCurrentBody] = useState(parsed.body)
  const originalBodyRef = useRef(parsed.body)
  const [hasRewritten, setHasRewritten] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [sent, setSent] = useState(false)
  const { subject, to } = parsed

  // Create Gmail draft silently via API — no popup window
  const handleSendGmail = async () => {
    setSent('sending')
    try {
      const cleanBody = currentBody
        .replace(/Sunny\s*Sidhu/gi, '')
        .replace(/Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?\s*/gi, '')
        .replace(/Best regards,?\s*/gi, '')
        .replace(/Kind regards,?\s*/gi, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim()
      const res = await fetch('/api/gmail-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body: cleanBody })
      })
      const data = await res.json()
      if (data.success) {
        setSent('done')
      } else {
        console.error('[EmailDraft] Gmail draft failed:', data.error)
        setSent('error')
        setTimeout(() => setSent(false), 3000)
      }
    } catch (e) {
      console.error('[EmailDraft] Gmail draft error:', e)
      setSent('error')
      setTimeout(() => setSent(false), 3000)
    }
  }

  // In-place rewrite via lightweight API (no tools/memory overhead)
  const handleRewrite = async (prompt) => {
    setRewriting(true)
    try {
      const res = await fetch('/api/rewrite-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, body: currentBody })
      })
      const data = await res.json()
      console.log('[EmailDraft] Rewrite response:', data)
      if (data.success && data.body && data.body.length > 20) {
        setCurrentBody(data.body)
        setHasRewritten(true)
      } else {
        console.error('[EmailDraft] Rewrite returned empty or short body')
      }
    } catch (e) { console.error('[EmailDraft] Rewrite failed:', e) }
    setRewriting(false)
  }

  const handleRevert = () => { setCurrentBody(originalBodyRef.current); setHasRewritten(false) }

  const tones = [
    { label: 'More Direct', prompt: 'Rewrite this email body more directly and concisely.' },
    { label: 'Warmer Tone', prompt: 'Rewrite this email body with a warmer, more personable tone.' },
    { label: 'Shorter', prompt: 'Make this email body much shorter while keeping the key message.' },
  ]

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(238,238,238,0.1)', background: 'rgba(238,238,238,0.02)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(238,238,238,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(238,238,238,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(238,238,238,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(238,238,238,0.25)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 15, color: 'rgba(238,238,238,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>
      {/* Body */}
      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(238,238,238,0.7)', fontFamily: T.font, lineHeight: '1.7', opacity: rewriting ? 0.3 : 1, transition: 'opacity 0.3s' }}
        dangerouslySetInnerHTML={{ __html: renderBody(currentBody) }} />
      {rewriting && <div style={{ padding: '4px 18px 10px', fontSize: 11, color: 'rgba(167,139,250,0.5)', fontFamily: T.font }}>Rewriting...</div>}
      {/* Actions */}
      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(238,238,238,0.06)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => handleRewrite(t.prompt)} disabled={rewriting} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(238,238,238,0.03)',
            border: '0.5px solid rgba(238,238,238,0.08)', color: rewriting ? 'rgba(238,238,238,0.2)' : 'rgba(238,238,238,0.4)',
            fontSize: 11, cursor: rewriting ? 'wait' : 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
          }}
            onMouseOver={e => { if (!rewriting) { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.03)'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
          ><Pen size={9} /> {t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {hasRewritten && (
          <button onClick={handleRevert} style={{ padding: '5px 12px', borderRadius: 50, background: 'rgba(238,238,238,0.03)', border: '0.5px solid rgba(238,238,238,0.08)', color: 'rgba(238,238,238,0.4)', fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s', marginRight: 4 }}
            onMouseOver={e => { e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}
            onMouseOut={e => { e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
          ><RotateCcw size={9} /> Revert</button>
        )}
        <button onClick={handleSendGmail} disabled={sent === 'sending' || sent === 'done'} style={{
          padding: '6px 14px', borderRadius: 50,
          background: sent === 'done' ? 'rgba(34,197,94,0.08)' : sent === 'error' ? 'rgba(255,80,80,0.08)' : 'rgba(167,139,250,0.06)',
          border: sent === 'done' ? '1px solid rgba(34,197,94,0.15)' : sent === 'error' ? '1px solid rgba(255,80,80,0.15)' : '1px solid rgba(167,139,250,0.12)',
          color: sent === 'done' ? 'rgba(34,197,94,0.8)' : sent === 'error' ? 'rgba(255,80,80,0.8)' : 'rgba(167,139,250,0.75)',
          fontSize: 12, cursor: (sent === 'sending' || sent === 'done') ? 'default' : 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, transition: 'all 0.15s',
        }}
          onMouseOver={e => { if (!sent) e.currentTarget.style.background = 'rgba(167,139,250,0.12)' }}
          onMouseOut={e => { if (!sent) e.currentTarget.style.background = 'rgba(167,139,250,0.06)' }}
        ><Send size={11} /> {sent === 'sending' ? 'Creating draft...' : sent === 'done' ? 'Draft saved' : sent === 'error' ? 'Failed — retry' : 'Send to Gmail'}</button>
      </div>
    </div>
  )
}
