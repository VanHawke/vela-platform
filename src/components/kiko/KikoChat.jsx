import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import KikoSymbol from './KikoSymbol'
import PipelineNotifications from '@/components/PipelineNotifications'

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
  const navigate = useNavigate()
  const outletCtx = useOutletContext() || {}
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialMessage)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [showSteps, setShowSteps] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [micStream, setMicStream] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeConvId, setActiveConvId] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [kikoAlerts, setKikoAlerts] = useState([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const transcribeRef = useRef({ media: null, recorder: null })
  const hasMessages = messages.length > 0 || streaming

  // Equalizer → opens voice mode overlay
  const openVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicStream(stream)
      setVoiceOpen(true)
    } catch (err) {
      console.error('Mic permission denied:', err)
    }
  }

  // Mic → speech-to-text transcription into prompt bar
  const startTranscribe = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      transcribeRef.current.media = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks = []
      transcribeRef.current.recorder = recorder
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (blob.size < 500) { setTranscribing(false); return }
        const base64 = await new Promise((res) => {
          const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob)
        })
        const sttRes = await fetch('/api/voice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transcribe', audio: base64 })
        })
        const stt = await sttRes.json()
        if (stt.text) setInput(prev => prev + (prev ? ' ' : '') + stt.text)
        setTranscribing(false)
      }
      recorder.start()
      setTranscribing(true)
    } catch { setTranscribing(false) }
  }
  const stopTranscribe = () => {
    if (transcribeRef.current.recorder?.state === 'recording') transcribeRef.current.recorder.stop()
    if (transcribeRef.current.media) { transcribeRef.current.media.getTracks().forEach(t => t.stop()); transcribeRef.current.media = null }
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

  // Watch for Home button reset from Layout
  const resetKey = outletCtx.kikoResetKey
  useEffect(() => {
    if (resetKey > 0) startNewChat()
  }, [resetKey])

  // Fetch proactive alerts on mount
  useEffect(() => {
    fetch('/api/kiko-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get' }) })
      .then(r => r.json())
      .then(d => { setKikoAlerts((d.alerts || []).slice(0, 3)); setLoadingAlerts(false) })
      .catch(() => setLoadingAlerts(false))
  }, [])

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
    setThinkingSteps([])
    setShowSteps(false)
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          userEmail: user?.email,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          currentPage: (window.location.pathname.replace('/', '') || 'home') + (window.location.search || ''),
          pageEntity: (() => {
            const path = window.location.pathname
            const search = window.location.search
            const params = new URLSearchParams(search)
            if (path.startsWith('/contacts/')) return { type: 'contact', id: path.split('/contacts/')[1] }
            if (params.get('org')) return { type: 'company', id: params.get('org') }
            return null
          })(),
        }),
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = '', pendingNav = null
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
            if (j.toolStatus !== undefined) {
              setToolStatus(j.toolStatus)
              if (j.toolStatus) setThinkingSteps(prev => [...prev, { label: j.toolStatus, time: Date.now() }])
            }
            if (j.navigate) {
              // Store pending navigation, execute after stream completes
              pendingNav = j.navigate
            }
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
      // If Kiko requested navigation, sync conversation to Layout and navigate
      if (pendingNav) {
        if (outletCtx.setKikoMessages) outletCtx.setKikoMessages(updated)
        if (outletCtx.setKikoConvId) outletCtx.setKikoConvId(newId || activeConvId)
        setTimeout(() => {
          if (outletCtx.kikoNavigate) outletCtx.kikoNavigate(pendingNav)
          else navigate('/' + (pendingNav === 'home' ? '' : pendingNav))
        }, 100)
      }
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
              {/* Mic — speech-to-text transcription */}
              <button onClick={transcribing ? stopTranscribe : startTranscribe} title="Dictate" style={{
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: transcribing ? '#C62828' : 'transparent',
                color: transcribing ? '#fff' : T.textTertiary,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              {/* Equalizer — voice mode (talk directly) */}
              <button onClick={openVoice} title="Voice mode" style={{
                width: 40, height: 40, borderRadius: '50%', background: 'transparent', border: 'none',
                color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor" opacity="0.6" />
                  <rect x="8" y="5" width="2" height="14" rx="1" fill="currentColor" opacity="0.8" />
                  <rect x="12" y="7" width="2" height="10" rx="1" fill="currentColor" />
                  <rect x="16" y="4" width="2" height="16" rx="1" fill="currentColor" opacity="0.8" />
                  <rect x="20" y="9" width="2" height="6" rx="1" fill="currentColor" opacity="0.6" />
                </svg>
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

          {/* Kiko Insights — proactive intelligence */}
          {!loadingAlerts && kikoAlerts.length > 0 && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 580, margin: '0 auto 20px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2, fontFamily: T.font, textAlign: 'center' }}>Kiko Insights</p>
              {kikoAlerts.map((a, i) => {
                const color = a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#3b82f6'
                return (
                  <button key={a.id || i} onClick={() => handleSubmit(`Tell me more about: ${a.title}`)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s', width: '100%', fontFamily: T.font
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = color + '40'; e.currentTarget.style.background = color + '06' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: color, marginTop: 6, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: T.text, margin: 0, lineHeight: 1.4 }}>{a.title}</p>
                      <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0', lineHeight: 1.3 }}>{(a.detail || '').slice(0, 100)}{(a.detail || '').length > 100 ? '...' : ''}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

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
          {/* Pipeline notifications — always visible at top */}
          {messages.length === 0 && (
            <div style={{ marginBottom: 16 }}>
              <PipelineNotifications />
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role !== 'user' && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
                  <KikoSymbol size={13} color="#fff" />
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

          {/* Kiko thinking indicator — Concept C: breathing dot + progress + expandable steps */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
                <KikoSymbol size={13} color="#fff" />
              </div>
              <div style={{ maxWidth: 320 }}>
                {/* Main thinking bubble */}
                <div style={{ padding: '10px 14px', borderRadius: T.radiusSm, background: T.accentSoft }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, flexShrink: 0, animation: 'kikoBreathe 2s ease-in-out infinite' }} />
                    <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>
                      {toolStatus || 'Kiko is thinking...'}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: T.accent, animation: 'kikoProgress 3s ease-in-out infinite', backgroundSize: '200% 100%', backgroundImage: `linear-gradient(90deg, ${T.accent} 0%, ${T.textSecondary} 50%, ${T.accent} 100%)` }} />
                  </div>
                </div>
                {/* Expandable steps */}
                {thinkingSteps.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <button onClick={() => setShowSteps(!showSteps)} style={{ fontSize: 10, color: T.textTertiary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, padding: '2px 0', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      {showSteps ? 'Hide process' : `Show process (${thinkingSteps.length} steps)`}
                    </button>
                    {showSteps && (
                      <div style={{ padding: '6px 10px', borderRadius: 8, background: T.accentSoft, border: `1px solid ${T.border}`, marginTop: 4 }}>
                        {thinkingSteps.map((step, i) => {
                          const isLast = i === thinkingSteps.length - 1
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: isLast ? '#007AFF' : '#34C759', animation: isLast ? 'pulse 1s infinite' : 'none' }} />
                              <span style={{ color: isLast ? T.textSecondary : T.textTertiary }}>{step.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Streaming response */}
          {streaming && streamText && (
            <div style={{ marginBottom: 12, display: 'flex' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
                <KikoSymbol size={13} color="#fff" />
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
              <>
                <button onClick={transcribing ? stopTranscribe : startTranscribe} title="Dictate" style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: transcribing ? '#C62828' : 'transparent',
                  color: transcribing ? '#fff' : T.textTertiary,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
                <button onClick={openVoice} title="Voice mode" style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none',
                  color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor" opacity="0.6" />
                    <rect x="8" y="5" width="2" height="14" rx="1" fill="currentColor" opacity="0.8" />
                    <rect x="12" y="7" width="2" height="10" rx="1" fill="currentColor" />
                    <rect x="16" y="4" width="2" height="16" rx="1" fill="currentColor" opacity="0.8" />
                    <rect x="20" y="9" width="2" height="6" rx="1" fill="currentColor" opacity="0.6" />
                  </svg>
                </button>
              </>
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
