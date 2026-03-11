import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Mic, AudioLines } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import KikoVoice from './KikoVoice'

const CHIPS = ['Brief me on my pipeline', "What's happening in F1", 'Draft a follow-up email', "Summarise yesterday"]

function getGreeting() {
  const h = new Date().getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function KikoChat({ user, compact = false, initialMessage = '' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialMessage)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [activeConvId, setActiveConvId] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const hasMessages = messages.length > 0 || streaming

  // Auto-send initial message from panel
  useEffect(() => {
    if (initialMessage && !messages.length) handleSubmit(initialMessage)
  }, [])

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
        messages: allMsgs, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
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
          message: msg, conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
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
      const newId = await saveConversation(updated.map(m => ({ role: m.role, content: m.content })), activeConvId, msg)
      if (newId && !activeConvId) setActiveConvId(newId)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setStreamText('')
    } finally { setStreaming(false) }
  }, [input, streaming, messages, user, activeConvId])

  // Render: Welcome state or conversation
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!hasMessages ? (
          /* Welcome — Kiko home */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: compact ? 20 : 40 }}>
            <div style={{ width: '100%', maxWidth: compact ? '100%' : 680, textAlign: 'center' }}>
              {!compact && <>
                <h1 style={{ fontSize: 36, fontWeight: 300, color: 'var(--text)', margin: '0 0 4px', fontFamily: 'var(--font)', letterSpacing: '-0.02em' }}>
                  {getGreeting()}, {user?.user_metadata?.full_name?.split(' ')[0] || 'Sunny'}
                </h1>
                <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: '0 0 48px', fontFamily: 'var(--font)' }}>How can Kiko help?</p>
              </>}
              {/* Prompt bar */}
              <div className="glass" style={{ borderRadius: 'var(--radius-pill)', padding: '8px 8px 8px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                  placeholder="Ask anything..." autoFocus
                  style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:16, color:'var(--text)', fontFamily:'var(--font)', height:44 }} />
                {!compact && <button onClick={() => setVoiceOpen(true)} style={{ width:40, height:40, borderRadius:'50%', background:'transparent', border:'none', color:'var(--text-tertiary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Mic size={20} /></button>}
                <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
                  width:40, height:40, borderRadius:'50%', background: input.trim() ? 'var(--accent)' : 'var(--accent-soft)',
                  border:'none', color: input.trim() ? '#fff' : 'var(--text-tertiary)', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', flexShrink:0
                }}><ArrowUp size={18} /></button>
              </div>
              {/* Chips */}
              {!compact && <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:24 }}>
                {CHIPS.map(c => (
                  <button key={c} onClick={() => handleSubmit(c)} style={{
                    padding:'10px 18px', borderRadius:24, background:'var(--surface)', border:'1px solid var(--border)',
                    color:'var(--text-secondary)', fontSize:13, cursor:'pointer', fontFamily:'var(--font)', transition:'all 0.15s'
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='var(--border-hover)'; e.currentTarget.style.background='var(--surface-hover)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--surface)' }}
                  >{c}</button>
                ))}
              </div>}
            </div>
          </div>
        ) : (
          /* Conversation view */
          <div style={{ maxWidth: compact ? '100%' : 680, margin:'0 auto', width:'100%', padding: compact ? 16 : 24 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom:16, display:'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth:'85%', padding:'12px 16px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--accent-soft)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  fontSize:14, lineHeight:1.6, fontFamily:'var(--font)', whiteSpace:'pre-wrap'
                }}>{msg.content}</div>
              </div>
            ))}
            {/* Tool status */}
            {toolStatus && <div style={{ padding:'8px 16px', color:'var(--text-tertiary)', fontSize:12, fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--text-tertiary)', animation:'pulse 1s infinite' }} />
              {toolStatus}
            </div>}
            {/* Streaming */}
            {streaming && streamText && (
              <div style={{ marginBottom:16 }}>
                <div style={{ maxWidth:'85%', padding:'12px 16px', borderRadius:'16px 16px 16px 4px', background:'var(--accent-soft)', color:'var(--text)', fontSize:14, lineHeight:1.6, fontFamily:'var(--font)', whiteSpace:'pre-wrap' }}>
                  {streamText}<span style={{ animation:'pulse 1s infinite' }}>▍</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Bottom input bar (when in conversation) */}
      {hasMessages && (
        <div style={{ padding: compact ? 12 : 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: compact ? '100%' : 680, margin:'0 auto' }}>
            <div className="glass" style={{ borderRadius:'var(--radius-pill)', padding:'6px 6px 6px 20px', display:'flex', alignItems:'center', gap:8 }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Ask Kiko..." disabled={streaming}
                style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:14, color:'var(--text)', fontFamily:'var(--font)' }} />
              {!compact && <button onClick={() => setVoiceOpen(true)} style={{ width:36, height:36, borderRadius:'50%', background:'transparent', border:'none', color:'var(--text-tertiary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Mic size={18} /></button>}
              <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
                width:36, height:36, borderRadius:'50%', background: input.trim() ? 'var(--accent)' : 'var(--accent-soft)',
                border:'none', color: input.trim() ? '#fff' : 'var(--text-tertiary)', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
              }}><ArrowUp size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Voice overlay */}
      {voiceOpen && <KikoVoice onClose={() => setVoiceOpen(false)} user={user} />}
    </div>
  )
}
