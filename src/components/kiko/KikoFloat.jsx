import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ArrowUp, Mic, MicOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import KikoSymbol from './KikoSymbol'
import KikoVoice from './KikoVoice'
import DOMPurify from 'dompurify'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', text: '#1A1A1A',
  textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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

// Equalizer icon for voice mode button
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

export default function KikoFloat({ user, messages: sharedMessages, setMessages: setSharedMessages, convId: sharedConvId, setConvId: setSharedConvId, onNavigate }) {
  const [stage, setStage] = useState(sharedMessages?.length > 0 ? 2 : 0) // auto-show panel if conversation exists
  const [input, setInput] = useState('')
  const messages = sharedMessages || []
  const setMessages = setSharedMessages || (() => {})
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const convId = sharedConvId || null
  const setConvId = setSharedConvId || (() => {})
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const mediaRef = useRef(null)
  const recorderRef = useRef(null)

  useEffect(() => {
    if (stage === 1) inputRef.current?.focus()
  }, [stage])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Parse navigation commands from Kiko's response
  function checkNavigation(text) {
    const lower = text.toLowerCase()
    const routes = {
      'pipeline': '/pipeline', 'deals': '/deals', 'contacts': '/contacts',
      'companies': '/companies', 'email': '/email', 'calendar': '/calendar',
      'documents': '/documents', 'tasks': '/tasks', 'settings': '/settings',
      'home': '/', 'dashboard': '/dashboard', 'memory': '/memory',
    }
    // Look for navigation intent patterns
    for (const [key, path] of Object.entries(routes)) {
      if (lower.includes(`navigating to ${key}`) || lower.includes(`opening ${key}`) ||
          lower.includes(`pulling up ${key}`) || lower.includes(`showing ${key}`) ||
          lower.includes(`[navigate:${key}]`)) {
        navigate(path)
        return true
      }
    }
    return false
  }

  // Submit message to Kiko
  const handleSubmit = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')
    if (stage < 2) setStage(2)
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)
    setStreamText('')
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
          try { const j = JSON.parse(d); if (j.delta) { full += j.delta; setStreamText(full) }; if (j.navigate) navigate('/' + (j.navigate === 'home' ? '' : j.navigate)) } catch {}
        }
      }

      const kikoMsg = { role: 'assistant', content: full }
      setMessages(prev => [...prev, kikoMsg])
      setStreamText('')
      // Check for navigation commands
      checkNavigation(full)
      // Save conversation
      const allMsgs = [...messages, userMsg, kikoMsg]
      if (user?.id) {
        const orgId = user?.app_metadata?.org_id
        if (convId) {
          await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        } else {
          const { data } = await supabase.from('conversations').insert({
            user_id: user.id, org_id: orgId,
            title: msg.slice(0, 60), messages: allMsgs
          }).select('id').single()
          if (data?.id) setConvId(data.id)
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setStreamText('')
    } finally { setStreaming(false) }
  }, [input, streaming, messages, user, convId, stage])

  // Mic: speech-to-text transcription into prompt bar
  async function startTranscribe() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks = []
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (blob.size < 500) { setTranscribing(false); return }
        const base64 = await new Promise((res) => {
          const r = new FileReader()
          r.onload = () => res(r.result.split(',')[1])
          r.readAsDataURL(blob)
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
      if (stage < 1) setStage(1)
    } catch { setTranscribing(false) }
  }

  function stopTranscribe() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    if (mediaRef.current) { mediaRef.current.getTracks().forEach(t => t.stop()); mediaRef.current = null }
  }

  // Equalizer: open voice mode
  async function openVoiceMode() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setVoiceOpen(stream)
    } catch { console.error('Mic denied') }
  }

  const hasMessages = messages.length > 0 || streaming

  // ── STAGE 0: Floating Kiko symbol ──
  if (stage === 0 && !voiceOpen) {
    return (
      <button onClick={() => setStage(1)} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        width: 52, height: 52, borderRadius: '50%',
        background: T.accent, border: 'none', color: '#fff',
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

  // Voice overlay
  if (voiceOpen) {
    return <KikoVoice onClose={() => { if (voiceOpen && voiceOpen.getTracks) voiceOpen.getTracks().forEach(t => t.stop()); setVoiceOpen(false) }} user={user} micStream={voiceOpen} />
  }

  // ── STAGE 1 & 2: Prompt bar (+ panel if stage 2) ──
  return (
    <>
      {/* Stage 2: Conversation panel expanding upward */}
      {stage === 2 && hasMessages && (
        <div className="animate-fade-in" style={{
          position: 'fixed', bottom: 72, right: 24, width: 400, maxHeight: 'calc(100vh - 140px)',
          zIndex: 100, borderRadius: 16, overflow: 'hidden',
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)', border: `1px solid ${T.border}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KikoSymbol size={18} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>Kiko</span>
            </div>
            <button onClick={() => setStage(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4 }}><X size={14} /></button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role !== 'user' && (
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                    <KikoSymbol size={12} color="#fff" />
                  </div>
                )}
                <div style={{
                  maxWidth: '80%', padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : 8,
                  background: msg.role === 'user' ? T.accent : T.accentSoft,
                  color: msg.role === 'user' ? '#fff' : T.textSecondary,
                  fontSize: 12, lineHeight: 1.5, fontFamily: T.font,
                }}>
                  {msg.role === 'user' ? msg.content : <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />}
                </div>
              </div>
            ))}
            {streaming && streamText && (
              <div style={{ marginBottom: 8, display: 'flex' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                  <KikoSymbol size={12} color="#fff" />
                </div>
                <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 8, background: T.accentSoft, fontSize: 12, color: T.textSecondary, lineHeight: 1.5, fontFamily: T.font }}>
                  <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                  <span style={{ animation: 'pulse 1s infinite' }}>▍</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      {/* Prompt bar — always visible in stage 1 & 2 */}
      <div className="glass animate-scale-in" style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 101,
        borderRadius: 28, padding: '5px 5px 5px 16px',
        display: 'flex', alignItems: 'center', gap: 6,
        width: stage === 2 ? 400 : 380,
      }}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) handleSubmit() }}
          placeholder="Ask Kiko..." autoFocus={stage >= 1}
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: T.text, fontFamily: T.font }} />

        {/* Mic — speech-to-text transcription */}
        <button onClick={transcribing ? stopTranscribe : startTranscribe} title="Dictate"
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: transcribing ? '#C62828' : 'transparent', color: transcribing ? '#fff' : T.textTertiary,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {transcribing ? <MicOff size={15} /> : <Mic size={15} />}
        </button>

        {/* Equalizer — voice mode (talk directly) */}
        <button onClick={openVoiceMode} title="Voice mode"
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: 'transparent', color: T.textTertiary,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          <EqIcon size={16} color={T.textTertiary} />
        </button>

        {/* Submit */}
        <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming}
          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: input.trim() ? T.accent : T.accentSoft,
            color: input.trim() ? '#fff' : T.textTertiary,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          <ArrowUp size={14} />
        </button>

        {/* Close */}
        <button onClick={() => setStage(0)} style={{
          width: 24, height: 24, borderRadius: '50%', background: 'transparent',
          border: 'none', color: T.textTertiary, cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>
    </>
  )
}
