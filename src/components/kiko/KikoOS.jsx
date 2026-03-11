import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import KikoSymbol from './KikoSymbol'
import { X, ArrowUp, Mic, AudioLines } from 'lucide-react'

// Markdown renderer (same as KikoChat)
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
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

// PAGE ROUTES for Kiko navigation
const PAGE_ROUTES = {
  home: '/', pipeline: '/pipeline', contacts: '/contacts',
  deals: '/deals', companies: '/companies', email: '/email',
  calendar: '/calendar', documents: '/documents', tasks: '/tasks',
  settings: '/settings', dashboard: '/dashboard',
}

export default function KikoOS({ user, onOpenVoice }) {
  const [stage, setStage] = useState(0) // 0=icon, 1=prompt, 2=conversation
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [convId, setConvId] = useState(null)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const nav = useNavigate()
  const loc = useLocation()
  const currentPage = loc.pathname.replace('/', '') || 'home'

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setStage(s => s === 0 ? 1 : s === 1 ? 0 : s)
      }
      if (e.key === 'Escape') setStage(0)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { if (stage === 1) inputRef.current?.focus() }, [stage])
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])

  // Check Kiko's response for navigation commands
  function checkForNavigation(text) {
    const lower = text.toLowerCase()
    for (const [page, route] of Object.entries(PAGE_ROUTES)) {
      if (lower.includes(`navigating to ${page}`) || lower.includes(`opening ${page}`) ||
          lower.includes(`pulling up ${page}`) || lower.includes(`showing ${page}`)) {
        setTimeout(() => nav(route), 800)
        return
      }
    }
  }

  const saveConv = async (msgs, id, title) => {
    if (!user?.id) return id
    try {
      if (id) {
        await supabase.from('conversations').update({ messages: msgs, updated_at: new Date().toISOString() }).eq('id', id)
        return id
      }
      const { data } = await supabase.from('conversations').insert({
        user_id: user.id, org_id: user.app_metadata?.org_id,
        title: (title || 'Kiko').slice(0, 60), messages: msgs
      }).select('id').single()
      return data?.id || null
    } catch { return id }
  }

  const handleSubmit = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')
    if (stage < 2) setStage(2)
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
          currentPage
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
            if (j.navigate) { setTimeout(() => nav(PAGE_ROUTES[j.navigate] || '/'), 600) }
          } catch {}
        }
      }

      const kikoMsg = { role: 'assistant', content: full }
      const updated = [...messages, userMsg, kikoMsg]
      setMessages(prev => [...prev, kikoMsg])
      setStreamText('')
      setToolStatus(null)
      checkForNavigation(full)
      const newId = await saveConv(updated.map(m => ({ role: m.role, content: m.content })), convId, msg)
      if (newId && !convId) setConvId(newId)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setStreamText('')
    } finally { setStreaming(false) }
  }, [input, streaming, messages, user, convId, currentPage, stage])

  // ── STAGE 0: Floating Kiko symbol ──
  if (stage === 0) {
    return (
      <button onClick={() => setStage(1)} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100, width: 52, height: 52,
        borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff',
        cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s',
      }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <KikoSymbol size={26} color="#fff" />
      </button>
    )
  }

  // ── STAGE 1: Expanded prompt bar ──
  if (stage === 1) {
    return (
      <div className="glass animate-scale-in" style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        borderRadius: 28, padding: '6px 6px 6px 16px',
        display: 'flex', alignItems: 'center', gap: 6, width: 420,
      }}>
        <KikoSymbol size={20} color="var(--text-tertiary)" />
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) handleSubmit() }}
          placeholder="Ask Kiko anything..." autoFocus
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)' }} />
        {/* Mic — transcribe to text */}
        <button title="Transcribe speech to text" style={{
          width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none',
          color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Mic size={16} /></button>
        {/* Equalizer — voice mode */}
        <button onClick={onOpenVoice} title="Talk to Kiko" style={{
          width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none',
          color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><AudioLines size={16} /></button>
        {/* Submit */}
        <button onClick={() => handleSubmit()} disabled={!input.trim()} style={{
          width: 36, height: 36, borderRadius: '50%', background: input.trim() ? 'var(--accent)' : 'var(--accent-soft)',
          border: 'none', color: input.trim() ? '#fff' : 'var(--text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><ArrowUp size={16} /></button>
        <button onClick={() => setStage(0)} style={{
          width: 24, height: 24, borderRadius: '50%', background: 'transparent', border: 'none',
          color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14,
        }}>×</button>
      </div>
    )
  }

  // ── STAGE 2: Full conversation (expands upward from prompt bar) ──
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      width: 420, maxHeight: 'calc(100vh - 100px)',
      display: 'flex', flexDirection: 'column',
      borderRadius: 20, overflow: 'hidden',
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      animation: 'slideUpFade 0.25s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KikoSymbol size={18} color="var(--text)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)' }}>Kiko</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>· {currentPage}</span>
        </div>
        <button onClick={() => setStage(0)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4,
        }}><X size={16} /></button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 120, maxHeight: 400 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role !== 'user' && (
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 3 }}>
                <KikoSymbol size={12} color="#fff" />
              </div>
            )}
            {msg.role === 'user' ? (
              <div style={{ maxWidth: '80%', padding: '8px 14px', borderRadius: '14px 14px 4px 14px', background: 'var(--accent)', color: '#fff', fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--font)' }}>{msg.content}</div>
            ) : (
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 10, background: 'var(--accent-soft)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font)' }}>
                <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />
              </div>
            )}
          </div>
        ))}
        {toolStatus && (
          <div style={{ padding: '6px 0', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', animation: 'pulse 1s infinite' }} />{toolStatus}
          </div>
        )}

        {streaming && streamText && (
          <div style={{ marginBottom: 10, display: 'flex' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 3 }}>
              <KikoSymbol size={12} color="#fff" />
            </div>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 10, background: 'var(--accent-soft)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font)' }}>
              <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
              <span style={{ animation: 'pulse 1s infinite', marginLeft: 2 }}>▍</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', borderRadius: 24, padding: '4px 4px 4px 14px', border: '1px solid var(--border)' }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
            placeholder="Ask Kiko..." disabled={streaming} autoFocus
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }} />
          <button title="Transcribe" style={{ width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={14} /></button>
          <button onClick={onOpenVoice} title="Voice mode" style={{ width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AudioLines size={14} /></button>
          <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
            width: 30, height: 30, borderRadius: '50%', background: input.trim() ? 'var(--accent)' : 'var(--accent-soft)',
            border: 'none', color: input.trim() ? '#fff' : 'var(--text-tertiary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><ArrowUp size={14} /></button>
        </div>
      </div>
    </div>
  )
}
