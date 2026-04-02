// src/components/kiko/EmailDraft.jsx — Email draft frame with tone CTAs and Gmail send
import { useState, useRef } from 'react'
import { Send, Pen, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  return { pre: text.slice(0, emailStart).trim(), email: text.slice(emailStart).trim() }
}

function parseEmail(text) {
  let t = text
    .replace(/#{1,3}\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT)\s*/gi, '')
    .replace(/\*?\*?\[Subject to[^\]]*\]\*?\*?\s*/gi, '')
  t = t.replace(/(Subject\s*:)/i, '\n$1')
  t = t.replace(/(To\s*:)/i, '\n$1')

  const subMatch = t.match(/\*?\*?Subject\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  const subject = subMatch ? subMatch[1].replace(/\*\*/g, '').trim() : ''
  const toMatch = t.match(/\*?\*?To\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''

  let bodyStartIdx = 0
  if (toMatch) bodyStartIdx = t.indexOf(toMatch[0]) + toMatch[0].length
  else if (subMatch) bodyStartIdx = t.indexOf(subMatch[0]) + subMatch[0].length
  let rawBody = t.slice(bodyStartIdx)

  // Cut at sign-off + name
  const signoffMatch = rawBody.match(/\n\s*(Best regards|Kind regards|Regards|Sincerely|Best|Cheers),?\s*\n?\s*(Sunny\s*Sidhu|Sunny)?\s*(Van Hawke[^\n]*)?\s*\n/i)
  if (signoffMatch) {
    rawBody = rawBody.slice(0, rawBody.indexOf(signoffMatch[0])).trim()
  }

  // Cut at Kiko commentary patterns
  const cuts = [
    /\n\s*\*\*(Key positioning|Strategic|Next steps|Timing|My recommendation|Analysis|Note)[^*]*\*\*/i,
    /\n\s*(This targets|The email positions|I've framed|I'd push back|I recommend|My recommendation|This reengagement)/i,
    /\n\s*Sunny\s*Sidhu/i,
    /\n\s*Van Hawke/i,
  ]
  for (const c of cuts) {
    const idx = rawBody.search(c)
    if (idx > 20) { rawBody = rawBody.slice(0, idx).trim(); break }
  }

  let body = rawBody.replace(/\*\*/g, '').replace(/\[Current[^\]]*\]/gi, '').trim()
  return { subject, to, body }
}

function renderBody(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

export default function EmailDraft({ text, onRewrite, onSendGmail }) {
  const [sent, setSent] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const parsed = parseEmail(text)
  const [currentBody, setCurrentBody] = useState(parsed.body)
  const originalBodyRef = useRef(parsed.body)
  const [hasRewritten, setHasRewritten] = useState(false)
  const { subject, to } = parsed

  const handleSendGmail = () => {
    // Dispatch to KikoChat which sends via Kiko's gmail_create_draft tool
    if (onSendGmail) {
      onSendGmail(subject, to, currentBody)
    } else {
      window.dispatchEvent(new CustomEvent('kiko_action', {
        detail: { action: 'create_gmail_draft', subject, to, body: currentBody }
      }))
    }
    setSent(true)
  }

  const handleRewrite = async (prompt) => {
    setRewriting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
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
      // Strip Subject/To/sign-off/commentary from rewrite
      let rewritten = full
        .replace(/\*\*/g, '')
        .replace(/^.*Subject:.*\n?/im, '')
        .replace(/^.*To:.*\n?/im, '')
        .replace(/\n\s*(Best regards|Regards|Sincerely|Best|Cheers),?\s*\n?\s*(Sunny\s*Sidhu|Sunny)?\s*(Van Hawke[^\n]*)?\s*$/i, '')
        .replace(/\n\s*\*\*(Analysis|My recommendation|Note)[^]*$/i, '')
        .trim()
      if (rewritten.length > 20) {
        setCurrentBody(rewritten)
        setHasRewritten(true)
      }
    } catch (e) { console.error('Rewrite failed:', e) }
    setRewriting(false)
  }

  const handleRevert = () => { setCurrentBody(originalBodyRef.current); setHasRewritten(false) }

  const tones = [
    { label: 'More Direct', prompt: `Rewrite this email body more directly and concisely. Output ONLY the rewritten email body paragraphs — no subject, no To, no sign-off, no name, no commentary:\n\n${currentBody}` },
    { label: 'Warmer Tone', prompt: `Rewrite this email body with a warmer, personable tone. Output ONLY the rewritten email body paragraphs — no subject, no To, no sign-off, no name, no commentary:\n\n${currentBody}` },
    { label: 'Shorter', prompt: `Make this email body much shorter. Output ONLY the rewritten email body paragraphs — no subject, no To, no sign-off, no name, no commentary:\n\n${currentBody}` },
  ]

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
        {to && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.25)' }}>To:</span> {to}</div>}
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
      </div>
      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, lineHeight: '1.7', opacity: rewriting ? 0.4 : 1, transition: 'opacity 0.2s' }}
        dangerouslySetInnerHTML={{ __html: renderBody(currentBody) }} />
      {rewriting && <div style={{ padding: '4px 18px 8px', fontSize: 11, color: 'rgba(139,108,246,0.5)', fontFamily: T.font, fontStyle: 'italic' }}>Rewriting...</div>}
      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => handleRewrite(t.prompt)} disabled={rewriting} style={{
            padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: rewriting ? 'wait' : 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s', opacity: rewriting ? 0.5 : 1,
          }}
            onMouseOver={e => { if (!rewriting) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          ><Pen size={9} /> {t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {hasRewritten && (
          <button onClick={handleRevert} style={{ padding: '5px 12px', borderRadius: 50, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseOut={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          ><RotateCcw size={9} /> Revert</button>
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
