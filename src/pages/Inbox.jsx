// src/pages/Inbox.jsx — Unified reply inbox
// All sequence replies in one view, threaded with original outreach,
// AI-suggested response panel, one-click reply via Gmail API.
import { useState, useEffect } from 'react'
import { Mail, ArrowRight, CheckCircle, Sparkles, Send, X, Clock } from 'lucide-react'

const C = {
  bg: '#0D0D0F', card: '#141416', cardHover: '#1A1A1E',
  border: 'rgba(255,255,255,0.06)', borderHover: 'rgba(255,255,255,0.10)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)',
  textTer: 'rgba(245,245,248,0.32)', textMut: 'rgba(245,245,248,0.16)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399',
  red: '#F87171', amber: '#FBBF24', blue: '#60A5FA',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", r: 8,
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }

export default function Inbox() {
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [thread, setThread] = useState([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState('unhandled') // unhandled | all

  useEffect(() => { loadReplies() }, [])

  async function loadReplies() {
    setLoading(true)
    try {
      const r = await fetch('/api/inbox?action=list')
      const j = await r.json()
      setReplies(j.replies || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function selectReply(reply) {
    setSelected(reply)
    setThread([])
    setSuggestion('')
    setReplyText('')
    if (reply.gmail_thread_id) {
      setLoadingThread(true)
      try {
        const r = await fetch(`/api/inbox?action=thread&id=${reply.id}`)
        const j = await r.json()
        setThread(j.messages || [])
      } catch (e) { console.error(e) }
      setLoadingThread(false)
    }
  }

  async function generateSuggestion() {
    if (!selected) return
    setLoadingSuggestion(true)
    try {
      const r = await fetch(`/api/inbox?action=suggest&id=${selected.id}`)
      const j = await r.json()
      setSuggestion(j.suggestion || '')
      setReplyText(j.suggestion || '')
    } catch (e) { console.error(e) }
    setLoadingSuggestion(false)
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return
    setSending(true)
    try {
      const r = await fetch('/api/inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action: 'send_reply', reply_text: replyText }),
      })
      const j = await r.json()
      if (j.ok) {
        await loadReplies()
        setSelected(null)
        setReplyText('')
      } else { alert('Send failed: ' + j.error) }
    } catch (e) { alert('Send failed: ' + e.message) }
    setSending(false)
  }

  async function markHandled(id) {
    try {
      await fetch('/api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'mark_handled' }) })
      await loadReplies()
    } catch {}
  }

  const filtered = filter === 'unhandled' ? replies.filter(r => !r.reply_handled) : replies
  const unhandledCount = replies.filter(r => !r.reply_handled).length

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, marginBottom: 4 }}>Inbox</h1>
          <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>All sequence replies in one place</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setFilter('unhandled')} style={{ padding: '6px 12px', borderRadius: 6, border: `0.5px solid ${filter === 'unhandled' ? 'rgba(167,139,250,0.3)' : C.border}`, background: filter === 'unhandled' ? 'rgba(167,139,250,0.08)' : 'transparent', color: filter === 'unhandled' ? C.purple : C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Unhandled {unhandledCount > 0 && <span style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 8, background: 'rgba(167,139,250,0.15)', fontSize: 9 }}>{unhandledCount}</span>}</button>
          <button onClick={() => setFilter('all')} style={{ padding: '6px 12px', borderRadius: 6, border: `0.5px solid ${filter === 'all' ? 'rgba(167,139,250,0.3)' : C.border}`, background: filter === 'all' ? 'rgba(167,139,250,0.08)' : 'transparent', color: filter === 'all' ? C.purple : C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>All</button>
          <button onClick={loadReplies} style={{ padding: '6px 12px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 16 }}>
        {/* Reply list */}
        <div style={{ ...glass, overflow: 'hidden', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: C.textTer, fontSize: 12 }}>Loading replies...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.textTer, fontSize: 12 }}>
              <Mail size={24} style={{ marginBottom: 8, opacity: 0.4 }} /><br/>
              No replies yet. They'll appear here when leads respond to your sequences.
            </div>
          )}
          {filtered.map(r => {
            const isSelected = selected?.id === r.id
            const seqName = r.kiko_sequence_enrollments?.kiko_sequences?.name || 'Sequence'
            const ago = r.reply_received_at ? timeAgo(r.reply_received_at) : ''
            return (
              <div key={r.id} onClick={() => selectReply(r)} style={{ padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer', background: isSelected ? 'rgba(167,139,250,0.06)' : 'transparent', borderLeft: isSelected ? `2px solid ${C.purple}` : '2px solid transparent', transition: 'all 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{r.to_name || r.to_email}</span>
                  {!r.reply_handled && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple }} />}
                </div>
                <div style={{ fontSize: 10, color: C.textTer, marginBottom: 4 }}>{r.company} · {seqName} · Step {r.step_number}</div>
                <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.reply_snippet || '(no snippet)'}</div>
                <div style={{ fontSize: 9, color: C.textMut, marginTop: 4 }}>{ago}</div>
              </div>
            )
          })}
        </div>

        {/* Reply composer */}
        {selected && (
          <div style={{ ...glass, padding: 20, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{selected.to_name || selected.to_email}</div>
                <div style={{ fontSize: 11, color: C.textTer, marginTop: 2 }}>{selected.company} · {selected.to_email}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>

            {/* Original outreach */}
            <div style={{ padding: 12, marginBottom: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>You sent</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.text, marginBottom: 4 }}>{selected.subject}</div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{(selected.body_plain || '').slice(0, 400)}{(selected.body_plain || '').length > 400 ? '...' : ''}</div>
            </div>

            {/* Reply */}
            <div style={{ padding: 12, marginBottom: 14, borderRadius: 8, background: 'rgba(167,139,250,0.04)', border: `0.5px solid rgba(167,139,250,0.10)` }}>
              <div style={{ fontSize: 9, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>They replied</div>
              {loadingThread ? (
                <div style={{ fontSize: 11, color: C.textTer }}>Loading thread...</div>
              ) : thread.length > 0 ? (
                thread.slice(1).map((msg, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, color: C.textTer, marginBottom: 3 }}>{msg.from} · {msg.date}</div>
                    <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.body || msg.snippet}</div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{selected.reply_snippet}</div>
              )}
            </div>

            {/* AI suggestion */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={11} style={{ color: C.purple }} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your reply</span>
                </div>
                <button onClick={generateSuggestion} disabled={loadingSuggestion} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid rgba(167,139,250,0.15)`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>{loadingSuggestion ? 'Drafting...' : suggestion ? 'Regenerate' : '✨ Suggest a reply'}</button>
              </div>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={6} placeholder="Type your reply or click ✨ Suggest a reply..." style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', color: C.text, fontSize: 12, fontFamily: C.font, resize: 'vertical', lineHeight: 1.6, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => markHandled(selected.id)} style={{ padding: '8px 14px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={11} />Mark handled</button>
              <button onClick={sendReply} disabled={sending || !replyText.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: replyText.trim() ? 'linear-gradient(135deg, #7C5CFC, #2DD4BF)' : 'rgba(255,255,255,0.04)', color: replyText.trim() ? '#fff' : C.textTer, fontSize: 11, cursor: replyText.trim() ? 'pointer' : 'default', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}><Send size={11} />{sending ? 'Sending...' : 'Send reply'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(dt) {
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
