// src/components/kiko/EmailDraft.jsx — Email draft frame with tone CTAs, copy, edit, and team Gmail send
import { useState, useRef, useEffect } from 'react'
import { Send, Pen, RotateCcw, Copy, Check, ChevronDown, Clock, Mail } from 'lucide-react'
import T from '@/lib/theme'

// Display name + agency email mapping
const DISPLAY_NAMES = { 'sunny@vanhawke.agency': 'Sunny Sidhu', 'matt.smith@vanhawke.agency': 'Matt Smith' }
function displayName(email) { return DISPLAY_NAMES[email] || email?.split('@')[0] || 'Unknown' }
function agencyEmail(email) { return email?.replace('@vanhawke.com', '@vanhawke.agency') || email }

export function isEmailDraft(text) {
  if (!text || text.length < 60) return false
  const lower = text.toLowerCase()
  const hasSubject = /\*?\*?subject\*?\*?\s*:/i.test(text) || /^subject\s*:/im.test(text) || /re:\s/i.test(text.split('\n')[0] || '')
  const hasGreeting = /\b(dear\s|hi\s|hello\s|hey\s|good\s(morning|afternoon|evening))/i.test(text)
  const hasSignoff = /\b(kind\s+regards|best\s+regards|warm\s+regards|sincerely|best,|regards,|cheers,|thank\s+you)/i.test(lower)
  const hasDraftLabel = lower.includes('suggested draft') || lower.includes('email draft') || lower.includes('draft email') || lower.includes('here\'s the email') || lower.includes('here is the email') || lower.includes('i\'ve drafted') || lower.includes('here\'s a draft') || lower.includes('draft:') || lower.includes('proposed email')
  const hasTo = /\*?\*?to\*?\*?\s*:/i.test(text)
  const hasSubjectAndTo = hasSubject && hasTo
  const hasEmailStructure = hasSubject && (hasGreeting || hasSignoff)
  const hasDraftStructure = hasDraftLabel && (hasGreeting || hasSignoff)
  return hasEmailStructure || hasDraftStructure || hasSubjectAndTo || (hasGreeting && hasSignoff && text.length > 150)
}

export function extractEmailSection(text) {
  const draftHeaderIdx = text.search(/#{1,3}\s*\d*\.?\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT\s*EMAIL)/i)
  const hereIdx = text.search(/(?:Here(?:'|'|&#39;)?s the (?:email|draft)|Here is the (?:email|draft)|I(?:'|'|&#39;)?ve drafted)[^:]*:\s*/i)
  const subjectIdx = text.search(/(?:^|\n|\.|\:)\s*\*?\*?Subject\*?\*?\s*:/im)
  if (draftHeaderIdx === -1 && hereIdx === -1 && subjectIdx === -1) return { pre: text, email: null }
  let emailStart
  if (draftHeaderIdx > -1) emailStart = draftHeaderIdx
  else if (hereIdx > -1) { const afterHere = text.slice(hereIdx).search(/\n\s*\*?\*?Subject\*?\*?\s*:/i); emailStart = afterHere > -1 ? hereIdx + afterHere : hereIdx }
  else emailStart = subjectIdx > 0 ? subjectIdx : 0
  return { pre: text.slice(0, emailStart).trim(), email: text.slice(emailStart).trim() }
}

function parseEmail(text) {
  // First: try to isolate the DRAFT section if the text contains a brief + draft
  // Look for "DRAFT REPLY", "DRAFT EMAIL", "DRAFT:", "5. DRAFT" etc.
  const draftSectionMatch = text.match(/(?:#{1,4}\s*)?(?:\*{0,2})?\s*(?:\d+\.?\s*)?(?:DRAFT\s*(?:REPLY|EMAIL|OUTREACH|FOLLOW[- ]?UP)?)[:\s\*—\-]*\n/i)
  let emailText = text
  if (draftSectionMatch) {
    emailText = text.slice(draftSectionMatch.index + draftSectionMatch[0].length)
  }
  
  let t = emailText.replace(/#{1,3}\s*\d*\.?\s*(SUGGESTED\s*DRAFT|EMAIL\s*DRAFT|DRAFT)\s*/gi, '').replace(/\*?\*?\[Subject to[^\]]*\]\*?\*?\s*/gi, '')
  t = t.replace(/(Subject\s*:)/i, '\n$1').replace(/(To\s*:)/i, '\n$1').replace(/(Dear\s+\w)/i, '\n$1')
  const subMatch = t.match(/\*?\*?Subject\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  const subject = subMatch ? subMatch[1].replace(/\*\*/g, '').replace(/[\u2014\u2013]/g, '-').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").trim() : ''
  const toMatch = t.match(/\*?\*?To\*?\*?\s*:\s*(.+?)(?:\n|$)/i)
  let to = toMatch ? toMatch[1].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim() : ''
  let bodyStartIdx = 0
  if (toMatch) bodyStartIdx = t.indexOf(toMatch[0]) + toMatch[0].length
  else if (subMatch) bodyStartIdx = t.indexOf(subMatch[0]) + subMatch[0].length
  let rawBody = t.slice(bodyStartIdx)
  // Hard cut at sign-off line — everything after is commentary
  const signoffPatterns = [
    { pat: /\n\s*(Best regards|Kind regards|Regards|Sincerely|Best|Cheers|Warm regards|Thanks|Thank you|Yours|All the best),?\s*\n/i, keep: true },
    { pat: /\n\s*(Best regards|Kind regards|Regards|Sincerely|Best|Cheers|Warm regards|Thanks|Thank you|Yours|All the best),?\s*$/i, keep: true },
    { pat: /\n\s*---\s*\n/, keep: false },
    { pat: /\n\s*---\s*$/, keep: false },
    { pat: /\n\s*(Sunny\s*Sidhu|Matt\s*Smith)\s*$/im, keep: false },
    { pat: /\n\s*(CEO|CRO|COO|Managing Director)\s*$/im, keep: false },
    { pat: /\n\s*(Van\s*Hawke)\s/im, keep: false },
    { pat: /\n\s*\*\*(Analysis|My recommendation|Key positioning|Strategic|Next steps|Timing|Note|Why this works|Sound right)[:\s?]/i, keep: false },
    { pat: /\n\s*(This reengagement|This targets|The email positions|I've framed|I'd push back|I recommend|This references|This approach|This email|This draft|Sound right|The tone)/i, keep: false },
  ]
  for (const { pat, keep } of signoffPatterns) {
    const match = rawBody.match(pat)
    if (match && match.index > 15) {
      rawBody = keep ? rawBody.slice(0, match.index + match[0].length).trim() : rawBody.slice(0, match.index).trim()
      break
    }
  }
  // Clean up names, titles, company — but KEEP sign-offs
  let body = rawBody
    .replace(/\*\*/g, '')
    .replace(/\[Current[^\]]*\]/gi, '')
    .replace(/\n\s*(Sunny\s*Sidhu|Matt\s*Smith)\s*$/im, '')
    .replace(/\n\s*(Sunny\s*Sidhu|Matt\s*Smith)\s*\n/gi, '\n')
    .replace(/\n\s*(CEO|CRO|COO|Managing Director|Director)\s*$/im, '')
    .replace(/\n?\s*(Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?)\s*$/im, '')
    .replace(/\n\s*vanhawke\.(com|agency)\s*$/im, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*–\s*/g, ', ')
    .trim()
  return { subject, to, body }
}

function renderBody(text) {
  if (!text || !text.trim()) return ''
  // Strip commentary after --- separator (preserve body before it)
  let cleaned = text
  const dashIdx = cleaned.indexOf('\n---\n')
  if (dashIdx > 20) cleaned = cleaned.slice(0, dashIdx)
  // Strip sign-offs for display (Gmail signature handles these)
  cleaned = cleaned
    .replace(/\n\s*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Cheers|Thanks|Thank you|Best),?\s*$/im, '')
    .replace(/\n\s*(Sunny\s*Sidhu|Matt\s*Smith)\s*$/im, '')
    .replace(/\n\s*(Van\s*Hawke\s*(Group|Agency|Maison)?\s*(Inc\.?)?)\s*$/im, '')
    .trim()
  // Fallback: if processing stripped everything, show raw text
  if (!cleaned && text.trim()) {
    cleaned = text.replace(/\n---\n[\s\S]*$/, '').trim()
  }
  return cleaned
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/\n/g, '<br/>')
    .replace(/<br\/>\s*<br\/>\s*<br\/>/g, '<br/><br/>')
    .trim()
}

export default function EmailDraft({ text, defaultSender, defaultTo }) {
  const parsed = parseEmail(text)
  const [currentBody, setCurrentBody] = useState(parsed.body)
  const originalBodyRef = useRef(parsed.body)
  const [hasRewritten, setHasRewritten] = useState(false)

  // CRITICAL: Update body when streaming delivers new content
  // Always take the latest parse result — during streaming, the draft section may arrive
  // AFTER analysis sections, making the correctly-parsed draft SHORTER than the raw text.
  // The old `>` comparison blocked this update. Now: update whenever the parsed body changes.
  useEffect(() => {
    if (!hasRewritten && parsed.body && parsed.body !== currentBody) {
      setCurrentBody(parsed.body)
      originalBodyRef.current = parsed.body
    }
  }, [parsed.body])
  const [rewriting, setRewriting] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [sendDropdownOpen, setSendDropdownOpen] = useState(false)
  const [senderDropdownOpen, setSenderDropdownOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduled, setScheduled] = useState(null)
  const [testDropdownOpen, setTestDropdownOpen] = useState(false)
  const [testSent, setTestSent] = useState(null) // { display: 'Mon 29 Apr at 09:00' }
  const [customDateTime, setCustomDateTime] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [teamMembers, setTeamMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null) // whose Gmail drafts folder
  const [selectedSender, setSelectedSender] = useState(null) // who the email is FROM (determines signature)
  const dropdownRef = useRef(null)
  const senderDropdownRef = useRef(null)
  const testDropdownRef = useRef(null)
  const editRef = useRef(null)
  const { subject: parsedSubject, to: parsedTo } = parsed
  const [currentSubject, setCurrentSubject] = useState(parsedSubject)
  const [currentTo, setCurrentTo] = useState(parsedTo || defaultTo || '')

  // Keep subject and to in sync with streaming updates
  useEffect(() => {
    if (parsedSubject && parsedSubject.length > (currentSubject || '').length) setCurrentSubject(parsedSubject)
  }, [parsedSubject])
  useEffect(() => {
    if (parsedTo && parsedTo.length > (currentTo || '').length) setCurrentTo(parsedTo)
  }, [parsedTo])

  // Load team members via API (bypasses RLS) — cached to prevent re-fetch on re-mount
  useEffect(() => {
    if (teamMembers.length > 0) return // already loaded
    const load = async () => {
      try {
        const res = await fetch('https://api.vanhawke.agency/api/team-members')
        const data = await res.json()
        if (data.ok && data.members?.length > 0) {
          setTeamMembers(data.members)
          const me = data.members.find(u => u.role === 'super_admin') || data.members[0]
          if (me) { 
            setSelectedMember(me)
            const senderMatch = defaultSender ? data.members.find(m => m.email?.includes(defaultSender)) : null
            setSelectedSender(senderMatch || me) 
          }
        }
      } catch {}
    }
    load()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setSendDropdownOpen(false)
      if (testDropdownRef.current && !testDropdownRef.current.contains(e.target)) setTestDropdownOpen(false)
      if (senderDropdownRef.current && !senderDropdownRef.current.contains(e.target)) setSenderDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus textarea when entering edit mode
  useEffect(() => { if (editing && editRef.current) editRef.current.focus() }, [editing])

  const handleCopy = () => {
    const fullEmail = `Subject: ${currentSubject}\nTo: ${currentTo}\n\n${currentBody}`
    navigator.clipboard.writeText(fullEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEdit = () => {
    setEditText(currentBody)
    setEditing(true)
  }

  const handleSaveEdit = () => {
    setCurrentBody(editText)
    setEditing(false)
    setHasRewritten(true)
  }

  const handleCancelEdit = () => { setEditing(false) }

  const getScheduleOptions = () => {
    const now = new Date()
    const opts = []
    // In 1 hour
    const h1 = new Date(now.getTime() + 3600000)
    opts.push({ label: `In 1 hour (${h1.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`, value: h1.toISOString() })
    // Tomorrow 9am local
    const tom9 = new Date(now); tom9.setDate(tom9.getDate() + 1); tom9.setHours(9, 0, 0, 0)
    opts.push({ label: `Tomorrow 9:00 AM`, value: tom9.toISOString() })
    // Tomorrow 2pm local
    const tom14 = new Date(now); tom14.setDate(tom14.getDate() + 1); tom14.setHours(14, 0, 0, 0)
    opts.push({ label: `Tomorrow 2:00 PM`, value: tom14.toISOString() })
    // Next Monday 9am
    const mon = new Date(now); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(9, 0, 0, 0)
    if (mon > now) opts.push({ label: `Monday 9:00 AM`, value: mon.toISOString() })
    return opts
  }

  // Recipient timezone options for optimum send time
  const recipientTimezones = [
    { label: 'US East Coast (9 AM ET)', offset: 5 },    // ET = UTC-5 (or -4 DST)
    { label: 'US West Coast (9 AM PT)', offset: 8 },    // PT = UTC-8 (or -7 DST)
    { label: 'UK (9 AM GMT)', offset: 0 },
    { label: 'Central Europe (9 AM CET)', offset: -1 },  // CET = UTC+1
    { label: 'Middle East (9 AM GST)', offset: -4 },
    { label: 'Asia Pacific (9 AM SGT)', offset: -8 },
  ]

  const handleOptimumSend = (offsetHours) => {
    // Calculate tomorrow at 9am in recipient's timezone
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    // 9am UTC + offset = 9am in recipient's local
    tomorrow.setUTCHours(9 + offsetHours, 0, 0, 0)
    handleSchedule(tomorrow.toISOString())
  }

  const handleSchedule = async (scheduledFor) => {
    const senderEmail = selectedSender?.email || 'sunny@vanhawke.agency'
    if (!currentTo || !currentSubject || !currentBody) return
    setScheduleOpen(false)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/schedule-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: currentTo, subject: currentSubject, body: currentBody, sender: senderEmail, scheduledFor, recipientName: currentTo.split('@')[0] }),
      })
      const data = await res.json()
      if (data.ok || data.success) {
        setScheduled({ display: data.display || 'Scheduled' })
        setTimeout(() => setScheduled(null), 5000)
      }
    } catch (e) { console.error('[EmailDraft] Schedule failed:', e) }
  }

  const handleSendGmail = async (member) => {
    const targetEmail = member?.email || selectedMember?.email || 'sunny@vanhawke.agency'
    const senderEmail = selectedSender?.email || 'sunny@vanhawke.agency'
    if (!currentSubject && !currentBody) { setSent('error'); setTimeout(() => setSent(false), 3000); return }
    setSent('sending')
    setSendDropdownOpen(false)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/create-gmail-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: currentTo, subject: currentSubject, body: currentBody, draftFor: targetEmail, sender: senderEmail })
      })
      if (!res.ok) { const errText = await res.text(); console.error('[EmailDraft] HTTP error:', res.status, errText); throw new Error(`HTTP ${res.status}`) }
      const data = await res.json()
      if (data.ok || data.success) {
        const label = targetEmail === 'sunny@vanhawke.agency' ? 'done' : `done-${targetEmail}`
        setSent(label)
        setTimeout(() => setSent(false), 3000)
        // PersonaMail correction capture: if user edited the draft, capture the diff
        if (originalBodyRef.current && currentBody !== originalBodyRef.current) {
          fetch('https://api.vanhawke.agency/api/capture-correction', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original: originalBodyRef.current, edited: currentBody, recipient: currentTo, subject: currentSubject })
          }).catch(() => {}) // fire and forget
        }
      } else {
        console.error('[EmailDraft] API error:', data.error)
        setSent('error')
        setTimeout(() => setSent(false), 3000)
      }
    } catch (e) {
      console.error('[EmailDraft] Send failed:', e)
      setSent('error')
      setTimeout(() => setSent(false), 3000)
    }
  }

  // ── SEND NOW — actually sends the email to the prospect ──
  const [sendNowState, setSendNowState] = useState(false) // false | 'confirm' | 'sending' | 'sent' | 'error'
  const handleSendNow = async () => {
    if (sendNowState === false) { setSendNowState('confirm'); return }
    if (sendNowState !== 'confirm') return
    if (!currentTo || !currentSubject || !currentBody) { setSendNowState('error'); setTimeout(() => setSendNowState(false), 3000); return }
    setSendNowState('sending')
    try {
      const res = await fetch('https://api.vanhawke.agency/api/gmail-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: currentTo, subject: currentSubject, body: currentBody, sender: selectedSender?.email || 'sunny@vanhawke.agency' })
      })
      const data = await res.json()
      if (data.ok || data.success || data.messageId) {
        setSendNowState('sent')
        // Capture correction if user edited the draft
        if (originalBodyRef.current && currentBody !== originalBodyRef.current) {
          fetch('https://api.vanhawke.agency/api/capture-correction', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original: originalBodyRef.current, edited: currentBody, recipient: currentTo, subject: currentSubject })
          }).catch(() => {})
        }
      } else { setSendNowState('error'); setTimeout(() => setSendNowState(false), 3000) }
    } catch (e) { console.error('[EmailDraft] Send now failed:', e); setSendNowState('error'); setTimeout(() => setSendNowState(false), 3000) }
  }

  const handleRewrite = async (prompt) => {
    setRewriting(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/rewrite-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, body: currentBody }) })
      const data = await res.json()
      if (data.success && data.body && data.body.length > 20) { setCurrentBody(data.body); setHasRewritten(true) }
    } catch (e) { console.error('[EmailDraft] Rewrite failed:', e) }
    setRewriting(false)
  }

  const handleRevert = () => { setCurrentBody(originalBodyRef.current); setHasRewritten(false) }
  const tones = [
    { label: 'More Direct', prompt: 'Rewrite this email body more directly and concisely.' },
    { label: 'Warmer Tone', prompt: 'Rewrite this email body with a warmer, more personable tone.' },
    { label: 'Shorter', prompt: 'Make this email body much shorter while keeping the key message.' },
  ]

  const sentLabel = typeof sent === 'string' && sent.startsWith('done-') ? `Saved to ${displayName(sent.replace('done-', ''))}'s drafts` : sent === 'done' ? 'Saved to your drafts' : sent === 'sending' ? 'Creating draft...' : sent === 'error' ? 'Failed — retry' : null

  return (
    <div style={{ margin: '12px 0', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.02)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#A0A0A0', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
          {currentTo && <div style={{ fontSize: 13, color: '#6B6B6B', fontFamily: T.font, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#A0A0A0' }}>To:</span> <input value={currentTo} onChange={e => setCurrentTo(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 13, color: '#6B6B6B', fontFamily: T.font, flex: 1, background: 'transparent', padding: 0 }} /></div>}
          <div style={{ fontSize: 15, color: '#0A0A0A', fontFamily: T.font, fontWeight: 500 }}>{currentSubject}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <button onClick={handleCopy} title="Copy email" style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: copied ? '#00B464' : '#A0A0A0', transition: 'all 0.15s' }}
            onMouseOver={e => { if (!copied) e.currentTarget.style.color = '#0A0A0A' }} onMouseOut={e => { if (!copied) e.currentTarget.style.color = '#A0A0A0' }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button onClick={handleEdit} title="Edit draft" style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.08)', background: editing ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: editing ? '#0A0A0A' : '#A0A0A0', transition: 'all 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color = '#0A0A0A'} onMouseOut={e => { if (!editing) e.currentTarget.style.color = '#A0A0A0' }}>
            <Pen size={14} />
          </button>
        </div>
      </div>
      {/* Body — editable or read-only */}
      {editing ? (
        <div style={{ padding: '12px 18px' }}>
          <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#FFFFFF', fontSize: 14, color: '#0A0A0A', fontFamily: T.font, lineHeight: '1.7', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleCancelEdit} style={{ padding: '5px 12px', borderRadius: 50, border: '0.5px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
            <button onClick={handleSaveEdit} style={{ padding: '5px 12px', borderRadius: 50, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 11, cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>Save changes</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 18px', fontSize: 14, color: '#6B6B6B', fontFamily: T.font, lineHeight: '1.7', opacity: rewriting ? 0.3 : 1, transition: 'opacity 0.3s' }}
          dangerouslySetInnerHTML={{ __html: renderBody(currentBody) }} />
      )}
      {rewriting && <div style={{ padding: '4px 18px 10px', fontSize: 11, color: 'rgba(0,0,0,0.35)', fontFamily: T.font }}>Rewriting...</div>}
      {/* Actions */}
      <div style={{ padding: '10px 14px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
        {tones.map(t => (
          <button key={t.label} onClick={() => handleRewrite(t.prompt)} disabled={rewriting || editing} style={{
            padding: '7px 14px', borderRadius: 50, background: 'rgba(0,0,0,0.02)',
            border: '0.5px solid rgba(0,0,0,0.08)', color: '#A0A0A0',
            fontSize: 11, cursor: rewriting ? 'wait' : 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
          }}
            onMouseOver={e => { if (!rewriting) { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#6B6B6B' }}}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; e.currentTarget.style.color = '#A0A0A0' }}
          ><Pen size={9} /> {t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {hasRewritten && (
          <button onClick={handleRevert} style={{ padding: '5px 12px', borderRadius: 50, background: 'rgba(0,0,0,0.02)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#A0A0A0', fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}
            onMouseOver={e => e.currentTarget.style.color = '#6B6B6B'} onMouseOut={e => e.currentTarget.style.color = '#A0A0A0'}
          ><RotateCcw size={9} /> Revert</button>
        )}
        {/* Sender selector */}
        <div ref={senderDropdownRef} style={{ position: 'relative', marginRight: 4 }}>
          <button onClick={() => setSenderDropdownOpen(!senderDropdownOpen)} style={{
            padding: '5px 10px', borderRadius: 50, background: 'rgba(0,0,0,0.02)',
            border: '0.5px solid rgba(0,0,0,0.08)', color: '#6B6B6B',
            fontSize: 11, cursor: 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
          }} onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
            From: {displayName(selectedSender?.email)} <ChevronDown size={10} />
          </button>
          {senderDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 200, maxWidth: 'calc(100vw - 32px)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 10, color: '#A0A0A0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontFamily: T.font }}>Send as:</div>
              {teamMembers.map(m => (
                <button key={m.id} onClick={() => { setSelectedSender(m); setSelectedMember(m); setSenderDropdownOpen(false) }} style={{ width: '100%', padding: '10px 12px', background: selectedSender?.id === m.id ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#0A0A0A', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'} onMouseOut={e => { if (selectedSender?.id !== m.id) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#6B6B6B' }}>{m.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{displayName(m.email)}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0' }}>{agencyEmail(m.email)}</div>
                  </div>
                  {selectedSender?.id === m.id && <Check size={14} style={{ color: '#00B464' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* SEND NOW — primary action, sends email directly */}
        <button onClick={handleSendNow} disabled={sendNowState === 'sending' || sendNowState === 'sent'} style={{
          padding: '6px 14px', borderRadius: 50,
          background: sendNowState === 'sent' ? 'rgba(34,197,94,0.1)' : sendNowState === 'error' ? 'rgba(255,80,80,0.1)' : sendNowState === 'confirm' ? 'rgba(180,90,40,0.12)' : 'rgba(180,90,40,0.08)',
          border: sendNowState === 'sent' ? '1px solid rgba(34,197,94,0.2)' : sendNowState === 'confirm' ? '1px solid rgba(180,90,40,0.3)' : '1px solid rgba(180,90,40,0.15)',
          color: sendNowState === 'sent' ? 'rgba(34,197,94,0.8)' : sendNowState === 'error' ? 'rgba(255,80,80,0.8)' : 'rgba(180,90,40,0.85)',
          fontSize: 12, cursor: sendNowState === 'sent' ? 'default' : 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, transition: 'all 0.15s',
        }}>
          <Send size={11} /> {sendNowState === 'sent' ? 'Sent' : sendNowState === 'sending' ? 'Sending...' : sendNowState === 'error' ? 'Failed' : sendNowState === 'confirm' ? `Confirm send to ${currentTo?.split('@')[0]}?` : 'Send now'}
        </button>
        {sendNowState === 'confirm' && (
          <button onClick={() => setSendNowState(false)} style={{ padding: '6px 10px', borderRadius: 50, background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.4)', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>
            Cancel
          </button>
        )}

        {/* Send to Gmail with member dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <div style={{ display: 'flex' }}>
            <button onClick={() => handleSendGmail(selectedMember)} disabled={sent === 'sending'} style={{
              padding: '6px 12px', borderRadius: '50px 0 0 50px',
              background: sentLabel?.includes('Saved') ? 'rgba(34,197,94,0.08)' : sent === 'error' ? 'rgba(255,80,80,0.08)' : 'rgba(0,0,0,0.04)',
              border: sentLabel?.includes('Saved') ? '1px solid rgba(34,197,94,0.15)' : sent === 'error' ? '1px solid rgba(255,80,80,0.15)' : '1px solid rgba(0,0,0,0.08)',
              borderRight: 'none',
              color: sentLabel?.includes('Saved') ? 'rgba(34,197,94,0.8)' : sent === 'error' ? 'rgba(255,80,80,0.8)' : 'rgba(0,0,0,0.55)',
              fontSize: 12, cursor: sent ? 'default' : 'pointer', fontFamily: T.font,
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, transition: 'all 0.15s',
            }}>
              <Send size={11} /> {sentLabel || `Send to ${displayName(selectedMember?.email)} drafts`}
            </button>
            <button onClick={() => setSendDropdownOpen(!sendDropdownOpen)} disabled={sent === 'sending'} style={{
              padding: '6px 8px', borderRadius: '0 50px 50px 0',
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderLeft: '0.5px solid rgba(0,0,0,0.06)',
              color: 'rgba(0,0,0,0.4)', fontSize: 10, cursor: sent ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
            }}>
              <ChevronDown size={12} />
            </button>
          </div>
          {sendDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, maxWidth: 'calc(100vw - 32px)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 10, color: '#A0A0A0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontFamily: T.font }}>Send draft to:</div>
              {teamMembers.map(m => (
                <button key={m.id} onClick={() => { setSelectedMember(m); setSendDropdownOpen(false) }} style={{ width: '100%', padding: '10px 12px', background: selectedMember?.id === m.id ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#0A0A0A', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'} onMouseOut={e => { if (selectedMember?.id !== m.id) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#6B6B6B' }}>{m.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{displayName(m.email)}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0' }}>{agencyEmail(m.email)}</div>
                  </div>
                  {selectedMember?.id === m.id && <Check size={14} style={{ color: '#00B464' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Schedule send button */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setScheduleOpen(!scheduleOpen)} style={{
            padding: '6px 12px', borderRadius: 50,
            background: scheduled ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.04)',
            border: scheduled ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(0,0,0,0.08)',
            color: scheduled ? 'rgba(34,197,94,0.8)' : 'rgba(0,0,0,0.55)',
            fontSize: 12, cursor: 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, transition: 'all 0.15s',
          }}>
            <Clock size={11} /> {scheduled ? `Scheduled: ${scheduled.display}` : 'Schedule'}
          </button>
          {scheduleOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 270, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 10, color: '#A0A0A0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontFamily: T.font }}>
                Schedule from {displayName(selectedSender?.email)}
              </div>
              {/* Quick schedule options */}
              {getScheduleOptions().map((opt, i) => (
                <button key={i} onClick={() => handleSchedule(opt.value)} style={{ width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#0A0A0A', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <Clock size={11} style={{ color: '#A0A0A0' }} />
                  {opt.label}
                </button>
              ))}
              {/* Recipient timezone section */}
              <div style={{ padding: '6px 12px 4px', fontSize: 10, color: '#7C5CFC', borderTop: '0.5px solid rgba(0,0,0,0.05)', fontFamily: T.font, fontWeight: 600, letterSpacing: '0.03em' }}>
                Optimum for recipient
              </div>
              {recipientTimezones.map((tz, i) => (
                <button key={`tz-${i}`} onClick={() => handleOptimumSend(tz.offset)} style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#6B6B6B', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(124,92,252,0.04)'; e.currentTarget.style.color = '#7C5CFC' }} onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B6B6B' }}>
                  <span style={{ fontSize: 10 }}>⚡</span> {tz.label}
                </button>
              ))}
              {/* Custom picker */}
              <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.05)', padding: '8px 12px' }}>
                {!showCustomPicker ? (
                  <button onClick={() => setShowCustomPicker(true)} style={{ width: '100%', padding: '6px 0', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#6B6B6B', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Pen size={11} style={{ color: '#A0A0A0' }} /> Custom date & time
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="datetime-local" value={customDateTime} onChange={e => setCustomDateTime(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12, fontFamily: T.font, color: '#0A0A0A', outline: 'none' }}
                      min={new Date().toISOString().slice(0, 16)} />
                    <button onClick={() => { if (customDateTime) { handleSchedule(new Date(customDateTime).toISOString()); setShowCustomPicker(false); setCustomDateTime('') } }}
                      disabled={!customDateTime}
                      style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: customDateTime ? '#7C5CFC' : 'rgba(0,0,0,0.06)', color: customDateTime ? '#fff' : '#A0A0A0', fontSize: 11, fontWeight: 600, cursor: customDateTime ? 'pointer' : 'default', fontFamily: T.font }}>
                      Set
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Send Test button — dropdown of team members */}
        <div style={{ position: 'relative' }} ref={testDropdownRef}>
          <button onClick={() => setTestDropdownOpen(!testDropdownOpen)} style={{
            padding: '6px 12px', borderRadius: 50,
            background: testSent ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.04)',
            border: testSent ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(0,0,0,0.08)',
            color: testSent ? 'rgba(34,197,94,0.8)' : 'rgba(0,0,0,0.55)',
            fontSize: 12, cursor: 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500,
          }}>
            <Mail size={11} /> {testSent || 'Send test'}
          </button>
          {testDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 10, color: '#A0A0A0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontFamily: T.font }}>Send test email to:</div>
              {[
                { label: 'Send to myself', email: 'sunny@vanhawke.agency' },
                { label: 'Send to Matt', email: 'matt.smith@vanhawke.agency' },
                { label: 'Send to all team', email: 'ALL' },
              ].concat(teamMembers.filter(m => !['sunny@vanhawke.com','matt.smith@vanhawke.com','sunny@vanhawke.agency','matt.smith@vanhawke.agency'].includes(m.email)).map(m => ({ label: `Send to ${displayName(m.email)}`, email: agencyEmail(m.email) }))).map((opt, i) => (
                <button key={i} onClick={async (e) => {
                  e.stopPropagation()
                  setTestDropdownOpen(false)
                  setTestSent('Sending...')
                  const recipients = opt.email === 'ALL' 
                    ? ['sunny@vanhawke.agency', 'matt.smith@vanhawke.agency'] 
                    : [opt.email]
                  try {
                    const senderEmail = selectedSender?.email || 'sunny@vanhawke.agency'
                    let allOk = true
                    for (const recipient of recipients) {
                      const res = await fetch('https://api.vanhawke.agency/api/gmail-send', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to: recipient, subject: `[TEST] ${currentSubject}`, body: currentBody, sender: senderEmail, isTest: true })
                      })
                      const data = await res.json()
                      if (!data.success && !data.ok) allOk = false
                    }
                    setTestSent(allOk ? 'Sent ✓' : 'Failed')
                    setTimeout(() => setTestSent(null), 3000)
                  } catch { setTestSent('Failed'); setTimeout(() => setTestSent(null), 3000) }
                }} style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#0A0A0A', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: opt.email === 'ALL' ? 'rgba(124,92,252,0.1)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: opt.email === 'ALL' ? '#7C5CFC' : '#6B6B6B' }}>{opt.email === 'ALL' ? '✦' : opt.email[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0' }}>{opt.email === 'ALL' ? 'All team members' : opt.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
