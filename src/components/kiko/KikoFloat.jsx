import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ArrowUp, Mic, MicOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import KikoSymbol from './KikoSymbol'
import KikoVoice from './KikoVoice'
import DOMPurify from 'dompurify'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)', text: '#1A1A1A',
  textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

// Keyframe injection — runs once
const STYLES = `
@keyframes kikoRipple {
  0%   { transform: scale(0.88); opacity: 0.5; }
  100% { transform: scale(1.45); opacity: 0; }
}
@keyframes kikoSpringIn {
  0%   { transform: scale(0.72) translateY(12px); opacity: 0; }
  60%  { transform: scale(1.04) translateY(-3px); opacity: 1; }
  80%  { transform: scale(0.98) translateY(1px); }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes kikoFabSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(45deg); }
}
@keyframes kikoFabSpinBack {
  from { transform: rotate(45deg); }
  to   { transform: rotate(0deg); }
}
@keyframes kikoChipIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kikoBreathe {
  0%,100% { opacity: 0.4; } 50% { opacity: 1; }
}
@keyframes kikoProgress {
  0%   { width: 0%; margin-left: 0; }
  50%  { width: 70%; margin-left: 0; }
  100% { width: 0%; margin-left: 100%; }
}
@keyframes kikoVortexSpin { to { transform: rotate(360deg); } }
.kiko-panel { transform-origin: bottom right; }
.kiko-panel.entering { animation: kikoSpringIn 0.42s cubic-bezier(0.34,1.56,0.64,1) forwards; }
.kiko-fab-open { animation: kikoFabSpin 0.3s cubic-bezier(0.34,1.3,0.64,1) forwards; }
.kiko-fab-close { animation: kikoFabSpinBack 0.25s cubic-bezier(0.34,1,0.64,1) forwards; }
`
if (!document.getElementById('kiko-float-styles')) {
  const el = document.createElement('style')
  el.id = 'kiko-float-styles'
  el.textContent = STYLES
  document.head.appendChild(el)
}

function md(text) {
  if (!text) return ''
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.04);padding:8px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 0"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

function EqIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="8" width="2" height="8" rx="1" fill={color} opacity="0.6" />
      <rect x="8" y="5" width="2" height="14" rx="1" fill={color} opacity="0.8" />
      <rect x="12" y="7" width="2" height="10" rx="1" fill={color} />
      <rect x="16" y="4" width="2" height="16" rx="1" fill={color} opacity="0.8" />
      <rect x="20" y="9" width="2" height="6" rx="1" fill={color} opacity="0.6" />
    </svg>
  )
}

const CHIPS = [
  'Brief me on my pipeline',
  "What's happening in F1?",
  'Draft a follow-up email',
  'Summarise yesterday',
]

export default function KikoFloat({ user, messages: sharedMessages, setMessages: setSharedMessages, convId: sharedConvId, setConvId: setSharedConvId, onNavigate }) {
  const [open, setOpen] = useState(sharedMessages?.length > 0)
  const [hasPanel, setHasPanel] = useState(sharedMessages?.length > 0)
  const [panelKey, setPanelKey] = useState(0)
  const [input, setInput] = useState('')
  const messages = sharedMessages || []
  const setMessages = setSharedMessages || (() => {})
  const [streaming, setStreaming] = useState(false)
  const [toolStatus, setToolStatus] = useState(null)
  const [streamText, setStreamText] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [fabClass, setFabClass] = useState('')
  const convId = sharedConvId || null
  const setConvId = setSharedConvId || (() => {})
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const mediaRef = useRef(null)
  const recorderRef = useRef(null)

  const hasMessages = messages.length > 0 || streaming

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  function toggleOpen() {
    if (!open) {
      setOpen(true)
      setHasPanel(true)
      setPanelKey(k => k + 1)
      setFabClass('kiko-fab-open')
    } else {
      setOpen(false)
      setFabClass('kiko-fab-close')
      setTimeout(() => setHasPanel(false), 280)
    }
  }

  function checkNavigation(text) {
    const routes = { 'pipeline': '/pipeline', 'deals': '/deals', 'contacts': '/contacts', 'companies': '/companies', 'email': '/email', 'calendar': '/calendar', 'documents': '/documents', 'tasks': '/tasks', 'settings': '/settings', 'home': '/', 'dashboard': '/dashboard', 'memory': '/memory' }
    const lower = text.toLowerCase()
    for (const [key, path] of Object.entries(routes)) {
      if (lower.includes(`navigating to ${key}`) || lower.includes(`opening ${key}`) || lower.includes(`pulling up ${key}`) || lower.includes(`[navigate:${key}]`)) { navigate(path); return true }
    }
    return false
  }

  const handleSubmit = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')
    if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true); setStreamText(''); setToolStatus(null)
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg, userEmail: user?.email,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          currentPage: (window.location.pathname.replace('/', '') || 'home') + (window.location.search || ''),
          pageEntity: (() => {
            const path = window.location.pathname; const params = new URLSearchParams(window.location.search)
            if (path.startsWith('/contacts/')) return { type: 'contact', id: path.split('/contacts/')[1] }
            if (params.get('org')) return { type: 'company', id: params.get('org') }
            return null
          })(),
        }),
      })
      const reader = res.body.getReader(); const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6); if (d === '[DONE]') continue
          try { const j = JSON.parse(d); if (j.delta) { full += j.delta; setStreamText(full) }; if (j.navigate) navigate('/' + (j.navigate === 'home' ? '' : j.navigate)); if (j.toolStatus !== undefined) setToolStatus(j.toolStatus) } catch {}
        }
      }
      const kikoMsg = { role: 'assistant', content: full }
      setMessages(prev => [...prev, kikoMsg]); setStreamText(''); checkNavigation(full)
      const allMsgs = [...messages, userMsg, kikoMsg]
      if (user?.id) {
        const orgId = user?.app_metadata?.org_id
        if (convId) {
          await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        } else {
          let autoTitle = msg.slice(0, 60)
          try { const tr = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: msg, response: full.slice(0, 300) }) }); const tj = await tr.json(); if (tj.title) autoTitle = tj.title } catch {}
          const { data } = await supabase.from('conversations').insert({ user_id: user.id, org_id: orgId, title: autoTitle, messages: allMsgs }).select('id').single()
          if (data?.id) setConvId(data.id)
        }
      }
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]); setStreamText('') }
    finally { setStreaming(false) }
  }, [input, streaming, messages, user, convId, open])

  const processFileForKiko = async (file) => {
    if (!file || !user?.email || fileUploading || streaming) return
    setFileUploading(true)
    if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
    const statusMsg = { role: 'user', content: `📎 Uploading: ${file.name}` }
    setMessages(prev => [...prev, statusMsg])
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const safeEmail = (user.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')
      const path = `documents/${safeEmail}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('vela-assets').upload(path, file)
      if (uploadError) throw new Error(uploadError.message)
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', storagePath: path, publicUrl, fileName: file.name, fileType: file.type, accessLevel: 'workspace', userEmail: user.email }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Processing failed')
      const intel = result.intelligence || {}
      const summary = [intel.summary, intel.detected_entity ? `Entity: ${intel.detected_entity}` : ''].filter(Boolean).join(' ')
      setMessages(prev => prev.map(m => m === statusMsg ? { role: 'user', content: `📎 Uploaded: ${file.name}` } : m))
      handleSubmit(`I just uploaded "${file.name}". Analysis: ${summary}. Talking points: ${(intel.talking_points || []).join(', ')}. Give me a brief summary.`)
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: `Upload failed: ${err.message}` }]) }
    finally { setFileUploading(false) }
  }

  async function startTranscribe() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks = []
      recorderRef.current = recorder
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (blob.size < 500) { setTranscribing(false); return }
        const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob) })
        const sttRes = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe', audio: base64 }) })
        const stt = await sttRes.json()
        if (stt.text) setInput(prev => prev + (prev ? ' ' : '') + stt.text)
        setTranscribing(false)
      }
      recorder.start(); setTranscribing(true)
      if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
    } catch { setTranscribing(false) }
  }

  function stopTranscribe() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    if (mediaRef.current) { mediaRef.current.getTracks().forEach(t => t.stop()); mediaRef.current = null }
  }

  async function openVoiceMode() {
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setVoiceOpen(stream) } catch {}
  }

  // Voice overlay
  if (voiceOpen) {
    return (
      <KikoVoice
        onClose={() => { if (voiceOpen?.getTracks) voiceOpen.getTracks().forEach(t => t.stop()); setVoiceOpen(false) }}
        user={user} micStream={voiceOpen} mini={true}
        onShowPrompt={() => { if (voiceOpen?.getTracks) voiceOpen.getTracks().forEach(t => t.stop()); setVoiceOpen(false); setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }}
      />
    )
  }

  const panelW = 340

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFileForKiko(f); e.target.value = '' }}
        style={{ display: 'none' }} />

      {/* ── Spring pop panel ── */}
      {hasPanel && (
        <div key={panelKey} className={`kiko-panel ${open ? 'entering' : ''}`} style={{
          position: 'fixed', bottom: 88, right: 24, width: panelW,
          zIndex: 100, borderRadius: 18,
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '0.5px solid rgba(0,0,0,0.07)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 160px)',
          opacity: open ? 1 : 0,
          transition: open ? 'none' : 'opacity 0.2s ease',
          pointerEvents: open ? 'all' : 'none',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: hasMessages ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KikoSymbol size={17} color={T.accent} animate={streaming ? (streamText ? 'streaming' : 'thinking') : 'idle'} />
              <span style={{ fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.font }}>Kiko</span>
            </div>
            <button onClick={toggleOpen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4, display: 'flex', borderRadius: 6, lineHeight: 1 }}>
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          {hasMessages && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role !== 'user' && (
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                      <KikoSymbol size={12} color="#fff" />
                    </div>
                  )}
                  <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : 8, background: msg.role === 'user' ? T.accent : T.accentSoft, color: msg.role === 'user' ? '#fff' : T.textSecondary, fontSize: 12, lineHeight: 1.55, fontFamily: T.font }}>
                    {msg.role === 'user' ? msg.content : <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />}
                  </div>
                </div>
              ))}
              {streaming && !streamText && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <KikoSymbol size={12} color="#fff" animate="thinking" />
                  </div>
                  <div style={{ padding: '7px 11px', borderRadius: 8, background: T.accentSoft }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, flexShrink: 0, animation: 'kikoBreathe 2s ease-in-out infinite' }} />
                      <span style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.font }}>{toolStatus || 'Thinking…'}</span>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: 'rgba(0,0,0,0.06)', marginTop: 5, overflow: 'hidden', width: 120 }}>
                      <div style={{ height: '100%', borderRadius: 1, background: T.accent, animation: 'kikoProgress 2.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
              )}
              {streaming && streamText && (
                <div style={{ marginBottom: 8, display: 'flex' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                    <KikoSymbol size={12} color="#fff" animate="streaming" />
                  </div>
                  <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: 8, background: T.accentSoft, fontSize: 12, color: T.textSecondary, lineHeight: 1.55, fontFamily: T.font }}>
                    <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                    <span style={{ animation: 'kikoBreathe 1s infinite' }}>▍</span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}

          {/* Chips — only when no conversation yet */}
          {!hasMessages && (
            <div style={{ padding: '10px 12px 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CHIPS.map((chip, i) => (
                <button key={chip} onClick={() => handleSubmit(chip)} style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 20,
                  border: '0.5px solid rgba(0,0,0,0.09)', background: 'rgba(0,0,0,0.03)',
                  color: T.textSecondary, cursor: 'pointer', fontFamily: T.font,
                  animation: `kikoChipIn 0.3s ease ${0.08 + i * 0.05}s both`,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)' }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input bar inside panel */}
          <div style={{ padding: '8px 10px 10px', display: 'flex', alignItems: 'center', gap: 6, borderTop: hasMessages ? '0.5px solid rgba(0,0,0,0.06)' : 'none', marginTop: hasMessages ? 0 : 8 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading || streaming} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {fileUploading
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'kikoVortexSpin 1s linear infinite' }}><circle cx="12" cy="12" r="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>}
            </button>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) handleSubmit() }}
              placeholder="Ask anything…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.text, fontFamily: T.font }} />
            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: transcribing ? '#C62828' : 'transparent', color: transcribing ? '#fff' : T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {transcribing ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            <button onClick={openVoiceMode} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <EqIcon size={14} color={T.textTertiary} />
            </button>
            <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming}
              style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: input.trim() && !streaming ? T.accent : 'rgba(0,0,0,0.06)', color: input.trim() && !streaming ? '#fff' : T.textTertiary, cursor: input.trim() && !streaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── FAB button ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 101 }}>
        {/* Idle pulse ring — only when closed */}
        {!open && (
          <div style={{ position: 'absolute', inset: -7, borderRadius: 20, border: '1.5px solid rgba(26,26,26,0.18)', animation: 'kikoRipple 2.8s ease-out infinite', pointerEvents: 'none' }} />
        )}
        <button onClick={toggleOpen} className={fabClass} style={{
          width: 52, height: 52, borderRadius: 15,
          background: T.accent, border: 'none', color: '#fff',
          cursor: 'pointer',
          boxShadow: open
            ? '0 6px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)'
            : '0 10px 40px rgba(0,0,0,0.22), 0 3px 10px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'box-shadow 0.25s, border-radius 0.25s',
          transformOrigin: 'center',
        }}>
          {open
            ? <X size={20} />
            : <KikoSymbol size={26} color="#fff" animate={streaming ? (streamText ? 'streaming' : 'thinking') : 'idle'} />
          }
        </button>
      </div>
    </>
  )
}
