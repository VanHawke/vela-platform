import { useState } from 'react'
import T from '@/lib/theme'

// Detect if Kiko's response contains a draft email/message
export function detectDraft(text) {
  if (!text) return null

  // Pattern 1: Structured ---DRAFT--- block
  const draftBlock = text.match(/---DRAFT---\n?([\s\S]*?)---END DRAFT---/i)
  if (draftBlock) {
    const block = draftBlock[1].trim()
    const toMatch = block.match(/^To:\s*(.+)/im)
    const subjectMatch = block.match(/^Subject:\s*(.+)/im)
    const lastHeader = subjectMatch ? subjectMatch.index + subjectMatch[0].length : (toMatch ? toMatch.index + toMatch[0].length : 0)
    const body = block.slice(lastHeader).trim()
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : '',
      to: toMatch ? toMatch[1].trim() : '',
      body,
      type: (toMatch && toMatch[1].includes('@')) ? 'email' : 'message'
    }
  }

  // Pattern 2: Subject + To with email
  const subjectMatch = text.match(/Subject:\s*"?([^"\n]+)"?/i)
  const toMatch = text.match(/To:\s*([^\n,]+@[^\n,]+)/i)
  if (subjectMatch && toMatch) {
    const lines = text.split('\n')
    let bodyStart = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().match(/^(Dear |Hi |Hello |Hey |\w+,\s*$)/i)) { bodyStart = i; break }
    }
    if (bodyStart === -1) bodyStart = lines.findIndex((l, idx) => idx > 0 && l.trim().length > 20 && !l.match(/^(Subject|To|From|CC|BCC):/i))
    if (bodyStart === -1) return null
    let bodyEnd = lines.length
    for (let i = bodyStart + 1; i < lines.length; i++) {
      if (lines[i].match(/^(Sunny|Best regards|Kind regards|Cheers|Thanks,|Warm regards|Sincerely)/i)) { bodyEnd = i + 2; break }
    }
    const body = lines.slice(bodyStart, Math.min(bodyEnd, lines.length)).join('\n').trim()
    if (body.length < 30) return null
    return { subject: subjectMatch[1].trim(), to: toMatch[1].trim(), body, type: 'email' }
  }

  // Pattern 3: Subject line alone (most common Kiko pattern)
  if (subjectMatch) {
    const lines = text.split('\n')
    const subIdx = lines.findIndex(l => l.match(/Subject:/i))
    if (subIdx === -1) return null
    // Find body start: first line after Subject that looks like email content
    let bodyStart = -1
    for (let i = subIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim()
      if (l.length > 15 && !l.match(/^(To|From|CC|BCC|Subject):/i)) { bodyStart = i; break }
    }
    if (bodyStart === -1) return null
    let bodyEnd = lines.length
    for (let i = bodyStart + 1; i < lines.length; i++) {
      if (lines[i].match(/^(Sunny|Best regards|Kind regards|Cheers|Thanks,|Warm regards|Sincerely)/i)) { bodyEnd = i + 2; break }
    }
    const body = lines.slice(bodyStart, Math.min(bodyEnd, lines.length)).join('\n').trim()
    if (body.length < 40) return null
    const toLoose = text.match(/To:\s*(.+)/im)
    return { subject: subjectMatch[1].trim(), to: toLoose ? toLoose[1].trim() : '', body, type: 'email' }
  }

  // Pattern 4: "Dear X" + sign-off pattern (email without Subject header)
  const dearMatch = text.match(/^(Dear |Hi |Hello )\w/m)
  const signOff = text.match(/^(Best regards|Kind regards|Warm regards|Sincerely|Thanks,|Cheers)/m)
  if (dearMatch && signOff) {
    const lines = text.split('\n')
    const startIdx = lines.findIndex(l => l.match(/^(Dear |Hi |Hello )\w/))
    const endIdx = lines.findIndex(l => l.match(/^(Best regards|Kind regards|Warm regards|Sincerely|Thanks,|Cheers)/))
    if (startIdx >= 0 && endIdx > startIdx) {
      const body = lines.slice(startIdx, Math.min(endIdx + 2, lines.length)).join('\n').trim()
      if (body.length < 40) return null
      return { subject: '', to: '', body, type: 'email' }
    }
  }

  return null
}

export default function DraftPreview({ draft, onToneAdjust, onCopy, onSendToGmail }) {
  const [copied, setCopied] = useState(false)
  const [editInput, setEditInput] = useState('')
  if (!draft) return null

  const handleCopy = () => {
    const text = draft.type === 'email'
      ? `Subject: ${draft.subject}\nTo: ${draft.to}\n\n${draft.body}`
      : draft.body
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.()
  }

  const toneChips = ['More professional', 'More concise', 'More friendly', 'Add urgency', 'Soften tone', 'Make shorter']

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', marginTop: 12, maxWidth: 580, backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.2)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.55)', fontFamily: T.font }}>
          {draft.type === 'email' ? '✉️ Email Draft' : '💬 Message Draft'}
        </span>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={handleCopy} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, fontWeight: 400 }}>{copied ? '✓ Copied' : 'Copy'}</button>
          {draft.type === 'email' && <button onClick={onSendToGmail} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(6,214,160,0.14)', background: 'rgba(6,214,160,0.06)', color: 'rgba(6,214,160,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, fontWeight: 400 }}>Send to Gmail ↗</button>}
        </div>
      </div>

      {/* Meta fields */}
      {(draft.to || draft.subject) && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {draft.to && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', width: 42, textAlign: 'right', fontFamily: T.font }}>To:</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: T.font, fontWeight: 300 }}>{draft.to}</span>
          </div>}
          {draft.subject && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', width: 42, textAlign: 'right', fontFamily: T.font }}>Subject:</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: T.font, fontWeight: 300 }}>{draft.subject}</span>
          </div>}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '12px 14px', fontSize: 15, lineHeight: 1.85, color: 'rgba(255,255,255,0.85)', fontFamily: T.font, fontWeight: 400, whiteSpace: 'pre-wrap' }}>
        {draft.body}
      </div>

      {/* Tone shortcuts */}
      <div style={{ display: 'flex', gap: 5, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.03)', flexWrap: 'wrap' }}>
        {toneChips.map(tone => (
          <button key={tone} onClick={() => onToneAdjust?.(tone)} style={{
            padding: '3px 9px', borderRadius: 50, border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.32)',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, transition: 'all 0.15s',
          }}>{tone}</button>
        ))}
      </div>

      {/* Free-form edit input */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <input value={editInput} onChange={e => setEditInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && editInput.trim()) { onToneAdjust?.(editInput.trim()); setEditInput('') } }}
          placeholder="Edit instruction... (e.g. change CTA to phone call)"
          style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: T.font, fontWeight: 300, outline: 'none' }} />
        {editInput.trim() && <button onClick={() => { onToneAdjust?.(editInput.trim()); setEditInput('') }} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(139,108,246,0.15)', background: 'rgba(139,108,246,0.06)',
          color: 'rgba(139,108,246,0.6)', fontSize: 11, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, flexShrink: 0,
        }}>Apply</button>}
      </div>
    </div>
  )
}
