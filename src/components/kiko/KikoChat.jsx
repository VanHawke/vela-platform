import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'

// Design tokens (from approved render)
const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  radius: 16, radiusSm: 10, radiusXl: 24,
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}
const glass = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
}

// Markdown renderer
function md(text) {
  if (!text) return ''
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.04);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-–•] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$2</li>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:16px 0"/>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

function getGreeting() {
  const h = new Date().getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const CHIPS = ['Brief me on my pipeline', "What's happening in F1", 'Draft a follow-up email', 'Summarise yesterday']

export default function KikoChat({ user, compact = false, initialMessage = '' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialMessage)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [micStream, setMicStream] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeConvId, setActiveConvId] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const hasMessages = messages.length > 0 || streaming

  // Request mic permission before opening voice overlay (must be in user gesture)
  const openVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicStream(stream)
      setVoiceOpen(true)
    } catch (err) {
      console.error('Mic permission denied:', err)
    }
  }

  // Load a previous conversation
  const loadConversation = (conv) => {
    if (!conv?.messages) return
    setMessages(conv.messages.map(m => ({ role: m.role, content: m.content })))
    setActiveConvId(conv.id)
    setStreamText('')
    setStreaming(false)
  }

  // Start a fresh conversation
  const startNewChat = () => {
    setMessages([])
    setActiveConvId(null)
    setStreamText('')
    setStreaming(false)
    setInput('')
    inputRef.current?.focus()
  }

  useEffect(() => { if (initialMessage && !messages.length) handleSubmit(initialMessage) }, [])
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])

  const saveConversation = async (allMsgs, convId, title) => {
    if (!user?.id) return convId
    try {
      if (convId) {
        await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        return convId
      }
      const { data } = await supabase.from('conversations').insert({
        user_id: user.id, org_id: user.app_metadata?.org_id,
        title: (title || 'New conversation').slice(0, 60),
        messages: allMsgs
      }).select('id').single()
      return data?.id || null
    } catch { return convId }
  }

  const handleSubmit = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)
    setStreamText('')
    setToolStatus(null)
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          currentPage: window.location.pathname.replace('/', '') || 'home'
        }),
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; setStreamText(full) }
            if (j.toolStatus !== undefined) setToolStatus(j.toolStatus)
          } catch {}
        }
      }
      const kikoMsg = { role: 'assistant', content: full }
      const updated = [...messages, userMsg, kikoMsg]
      setMessages(prev => [...prev, kikoMsg])
      setStreamText('')
      setToolStatus(null)
      const newId = await saveConversation(
        updated.map(m => ({ role: m.role, content: m.content })),
        activeConvId, msg
      )
      if (newId && !activeConvId) setActiveConvId(newId)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setStreamText('')
    } finally { setStreaming(false) }
  }, [input, streaming, messages, user, activeConvId])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Sunny'

  // ── WELCOME STATE (no messages yet) ──
  if (!hasMessages && !compact) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, background: T.bg }}>
        <div style={{ width: '100%', maxWidth: 680, textAlign: 'center' }}>
          <h1 style={{ fontSize: 36, fontWeight: 300, color: T.text, margin: '0 0 4px', fontFamily: T.font, letterSpacing: '-0.02em' }}>
            {getGreeting()}, {firstName}
          </h1>
          <p style={{ fontSize: 15, color: T.textTertiary, margin: '0 0 48px', fontFamily: T.font }}>How can Kiko help?</p>

          {/* Main prompt bar — glass pill */}
          <div style={{ ...glass, borderRadius: 28, padding: '8px 8px 8px 24px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <input
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder="Ask anything..." autoFocus
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: T.text, fontFamily: T.font, height: 44 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={openVoice} style={{
                width: 40, height: 40, borderRadius: '50%', background: 'transparent', border: 'none',
                color: T.textTertiary, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }} title="Voice">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
                width: 40, height: 40, borderRadius: '50%',
                background: input.trim() ? T.accent : T.accentSoft,
                border: 'none', color: input.trim() ? '#fff' : T.textTertiary,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>
          </div>

          {/* Suggestion chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {CHIPS.map(c => (
              <button key={c} onClick={() => handleSubmit(c)} style={{
                padding: '10px 18px', borderRadius: 24, background: T.surface,
                border: `1px solid ${T.border}`, color: T.textSecondary,
                fontSize: 13, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s'
              }}
                onMouseOver={e => { e.currentTarget.style.borderColor = T.borderHover; e.currentTarget.style.background = T.surfaceHover }}
                onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface }}
              >{c}</button>
            ))}
          </div>
        </div>
        {voiceOpen && <KikoVoice onClose={() => { setVoiceOpen(false); if (micStream) { micStream.getTracks().forEach(t => t.stop()); setMicStream(null) } }} user={user} micStream={micStream} />}
        {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => setHistoryOpen(!historyOpen)} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} />}
      </div>
    )
  }

  // ── CONVERSATION STATE ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : 24 }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto', width: '100%' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role !== 'user' && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: T.font }}>K</span>
                </div>
              )}
              {msg.role === 'user' ? (
                <div style={{
                  maxWidth: '75%', padding: '10px 16px', borderRadius: '16px 16px 4px 16px',
                  background: T.accent, color: '#fff', fontSize: 13, lineHeight: 1.5, fontFamily: T.font,
                }}>{msg.content}</div>
              ) : (
                <div style={{
                  maxWidth: '75%', padding: '12px 16px', borderRadius: T.radiusSm,
                  background: T.accentSoft, fontSize: 13, color: T.textSecondary,
                  lineHeight: 1.5, fontFamily: T.font,
                }}>
                  <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />
                </div>
              )}
            </div>
          ))}

          {/* Tool status */}
          {toolStatus && (
            <div style={{ padding: '8px 0', color: T.textTertiary, fontSize: 12, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.textTertiary, animation: 'pulse 1s infinite' }} />
              {toolStatus}
            </div>
          )}

          {/* Streaming response */}
          {streaming && streamText && (
            <div style={{ marginBottom: 12, display: 'flex' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: T.font }}>K</span>
              </div>
              <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: T.radiusSm, background: T.accentSoft, fontSize: 13, color: T.textSecondary, lineHeight: 1.5, fontFamily: T.font }}>
                <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                <span style={{ animation: 'pulse 1s infinite', marginLeft: 2 }}>▍</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Bottom input bar */}
      <div style={{ padding: compact ? 12 : 16, borderTop: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bg, borderRadius: 28, padding: '6px 6px 6px 16px', border: `1px solid ${T.border}` }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder="Ask Kiko..." disabled={streaming} autoFocus
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.text, fontFamily: T.font }}
            />
            {!compact && (
              <button onClick={openVoice} style={{
                width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none',
                color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            )}
            <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
              width: 32, height: 32, borderRadius: '50%',
              background: input.trim() ? T.accent : T.accentSoft,
              border: 'none', color: input.trim() ? '#fff' : T.textTertiary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Voice overlay */}
      {voiceOpen && <KikoVoice onClose={() => { setVoiceOpen(false); if (micStream) { micStream.getTracks().forEach(t => t.stop()); setMicStream(null) } }} user={user} micStream={micStream} />}
      {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => setHistoryOpen(!historyOpen)} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} />}
    </div>
  )
}
