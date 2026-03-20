import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import KikoSymbol from './KikoSymbol'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.08)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  radius: 16, radiusSm: 10, radiusXl: 24,
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

function md(text) {
  if (!text) return ''
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.04);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-\u2013\u2022] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
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

// Kiko 4-dot symbol (asymmetric diamond) with optional staggered animation
const KikoDots = ({ size = 40, color = '#fff', animated = false }) => {
  const dots = [
    { cx: 15, cy: 17, delay: '0s' },
    { cx: 33, cy: 17, delay: '0.3s' },
    { cx: 20, cy: 31, delay: '0.6s' },
    { cx: 28, cy: 31, delay: '0.9s' },
  ]
  const r = size * 0.09
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={Math.max(r, 2.5)} fill={color} opacity="0.85"
          style={animated ? { animation: `kikoDotPulse 2.5s ease-in-out ${d.delay} infinite` } : undefined} />
      ))}
    </svg>
  )
}

// Avatar equalizer: 7 bars with unique max heights and speeds
const AvatarEq = () => {
  const bars = [
    { anim: 'eqBar0', speed: '0.45s' },
    { anim: 'eqBar1', speed: '0.40s' },
    { anim: 'eqBar2', speed: '0.50s' },
    { anim: 'eqBar3', speed: '0.42s' },
    { anim: 'eqBar4', speed: '0.48s' },
    { anim: 'eqBar5', speed: '0.55s' },
    { anim: 'eqBar6', speed: '0.43s' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(34,197,94,0.7)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.06}s infinite` }} />
      ))}
    </div>
  )
}

// CTA equalizer: 5 smaller bars, always pulsing
const CtaEq = () => {
  const bars = [
    { anim: 'eqBarS0', speed: '0.50s' },
    { anim: 'eqBarS1', speed: '0.42s' },
    { anim: 'eqBarS2', speed: '0.55s' },
    { anim: 'eqBarS3', speed: '0.45s' },
    { anim: 'eqBarS4', speed: '0.48s' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(34,197,94,0.7)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.07}s infinite` }} />
      ))}
    </div>
  )
}

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const toggleHistory = (val) => {
    const next = typeof val === 'boolean' ? val : !historyOpen
    setHistoryOpen(next)
    window.dispatchEvent(new CustomEvent('kiko_history_state', { detail: { open: next } }))
  }
  const [activeConvId, setActiveConvId] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [dictateError, setDictateError] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const transcribeRef = useRef({ media: null, recorder: null, sr: null, active: false, baseInput: '' })
  const dragCounterRef = useRef(0)
  const [chatDragOver, setChatDragOver] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)

  // Voice mode state — inline, no overlay
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceMicStream, setVoiceMicStream] = useState(null)
  const [voiceState, setVoiceState] = useState({})
  const [voiceMessages, setVoiceMessages] = useState([])

  const hasMessages = messages.length > 0 || streaming

  // Notify Layout of voice state changes (for nav bar Listening pill)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kiko_voice_state', { detail: { active: voiceActive, speaking: voiceState.speaking, thinking: voiceState.thinking, status: voiceState.status } }))
  }, [voiceActive, voiceState.speaking, voiceState.thinking, voiceState.status])
  const hasVoiceMessages = voiceMessages.length > 0

  // Start voice mode — don't pre-acquire mic, let KikoVoice handle it
  const startVoice = async () => {
    setVoiceActive(true)
    setVoiceMessages([])
  }

  // Stop voice mode
  const stopVoice = () => {
    setVoiceActive(false)
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
  }

  // Voice state callback from headless KikoVoice
  const handleVoiceState = useCallback((state) => setVoiceState(state), [])
  const handleVoiceMessage = useCallback((msg) => {
    setVoiceMessages(prev => [...prev, msg])
    // In conversation state, also add to main messages so they appear in the chat
    if (messages.length > 0) {
      const mapped = { role: msg.role === 'kiko' ? 'assistant' : 'user', content: msg.content }
      setMessages(prev => [...prev, mapped])
    }
  }, [messages.length])

  // Dictation (speech-to-text into input field) — uses Web Speech API for instant results
  const startTranscribe = async () => {
    if (transcribing) return
    setDictateError('')
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      try {
        const sr = new SR()
        sr.continuous = true
        sr.interimResults = true
        sr.lang = 'en-US'
        transcribeRef.current.sr = sr
        transcribeRef.current.active = true
        transcribeRef.current.baseInput = input // snapshot input before dictation
        let accumulated = '' // all finalized text from this dictation session
        setTranscribing(true)
        sr.onresult = (e) => {
          let interim = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              const text = e.results[i][0].transcript.trim()
              if (text) accumulated += (accumulated ? ' ' : '') + text
              interim = ''
            } else {
              interim = e.results[i][0].transcript
            }
          }
          // Update input: base + accumulated finals + current interim
          const base = transcribeRef.current.baseInput
          const display = base + (base && accumulated ? ' ' : '') + accumulated + (interim ? ' ' + interim : '')
          setInput(display)
        }
        sr.onerror = (e) => {
          console.error('[Dictate] error:', e.error)
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            setDictateError('Mic access denied — check browser permissions')
            setTranscribing(false)
            transcribeRef.current.active = false
          } else if (e.error === 'no-speech') {
            // Ignore no-speech, it auto-restarts
          } else {
            setDictateError(`Dictation error: ${e.error}`)
            setTranscribing(false)
            transcribeRef.current.active = false
          }
        }
        sr.onend = () => {
          if (transcribeRef.current.active && transcribeRef.current.sr === sr) {
            try { sr.start() } catch { setTranscribing(false); transcribeRef.current.active = false }
          }
        }
        sr.start()
      } catch (err) {
        console.error('[Dictate] Failed to start:', err)
        setTranscribing(false)
        transcribeRef.current.active = false
      }
    } else {
      // Fallback: Whisper API
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
      } catch (err) { console.error('[Dictate] Whisper fallback failed:', err); setTranscribing(false) }
    }
  }
  const stopTranscribe = () => {
    transcribeRef.current.active = false
    if (transcribeRef.current.sr) { try { transcribeRef.current.sr.stop() } catch {} transcribeRef.current.sr = null }
    if (transcribeRef.current.recorder?.state === 'recording') transcribeRef.current.recorder.stop()
    if (transcribeRef.current.media) { transcribeRef.current.media.getTracks().forEach(t => t.stop()); transcribeRef.current.media = null }
    setTranscribing(false)
  }

  const loadConversation = (conv) => {
    if (!conv?.messages) return
    setMessages(conv.messages.map(m => ({ role: m.role, content: m.content })))
    setActiveConvId(conv.id); setStreamText(''); setStreaming(false)
  }
  const startNewChat = () => {
    setMessages([]); setActiveConvId(null); setStreamText(''); setStreaming(false); setInput('')
    setVoiceActive(false); setVoiceMessages([])
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
    inputRef.current?.focus()
  }

  useEffect(() => { if (initialMessage && !messages.length) handleSubmit(initialMessage) }, [])
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText, voiceMessages])

  const resetKey = outletCtx.kikoResetKey
  useEffect(() => { if (resetKey > 0) startNewChat() }, [resetKey])

  const saveConversation = async (allMsgs, convId, userMsg, kikoResponse) => {
    if (!user?.id) return convId
    try {
      if (convId) {
        await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        return convId
      }
      let autoTitle = (userMsg || 'New conversation').slice(0, 60)
      try {
        console.log('[KikoChat] Generating title for:', userMsg?.slice(0, 60))
        const tr = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: userMsg, response: (kikoResponse || '').slice(0, 300) }) })
        const tj = await tr.json()
        console.log('[KikoChat] Title result:', tj)
        if (tj.title) autoTitle = tj.title
      } catch (e) { console.error('[KikoChat] Title generation failed:', e) }
      const { data } = await supabase.from('conversations').insert({
        user_id: user.id, org_id: user.app_metadata?.org_id, title: autoTitle.slice(0, 60), messages: allMsgs
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
    setStreaming(true); setStreamText(''); setToolStatus(null); setThinkingSteps([]); setShowSteps(false)
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
      let full = '', buf = '', pendingNav = null
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6); if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; setStreamText(full) }
            if (j.toolStatus !== undefined) { setToolStatus(j.toolStatus); if (j.toolStatus) setThinkingSteps(prev => [...prev, { label: j.toolStatus, time: Date.now() }]) }
            if (j.navigate) pendingNav = j.navigate
          } catch {}
        }
      }
      const kikoMsg = { role: 'assistant', content: full }
      const updated = [...messages, userMsg, kikoMsg]
      setMessages(prev => [...prev, kikoMsg]); setStreamText(''); setToolStatus(null)
      const newId = await saveConversation(updated.map(m => ({ role: m.role, content: m.content })), activeConvId, msg, full)
      if (newId && !activeConvId) setActiveConvId(newId)
      if (pendingNav) {
        if (outletCtx.setKikoMessages) outletCtx.setKikoMessages(updated)
        if (outletCtx.setKikoConvId) outletCtx.setKikoConvId(newId || activeConvId)
        setTimeout(() => { if (outletCtx.kikoNavigate) outletCtx.kikoNavigate(pendingNav); else navigate('/' + (pendingNav === 'home' ? '' : pendingNav)) }, 100)
      }
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]); setStreamText('') }
    finally { setStreaming(false) }
  }, [input, streaming, messages, user, activeConvId])

  const processFileForKiko = async (file) => {
    if (!file || !user?.email || fileUploading || streaming) return
    setFileUploading(true)
    const statusMsg = { role: 'user', content: `Uploading: ${file.name}` }
    setMessages(prev => [...prev, statusMsg])
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/__+/g, '_')
      const safeEmail = (user.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')
      const path = `documents/${safeEmail}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('vela-assets').upload(path, file)
      if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', storagePath: path, publicUrl, fileName: file.name, fileType: file.type, accessLevel: 'workspace', userEmail: user.email }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Processing failed')
      const intel = result.intelligence || {}
      const summary = [intel.summary, intel.detected_entity ? `Entity: ${intel.detected_entity}` : '', intel.detected_team ? `F1 Team: ${intel.detected_team}` : ''].filter(Boolean).join(' ')
      setMessages(prev => prev.map(m => m === statusMsg ? { role: 'user', content: `Uploaded: ${file.name}` } : m))
      handleSubmit(`I just uploaded "${file.name}". Analysis: ${summary}. Key stats: ${(intel.key_stats || []).join(', ')}. Positioning: ${intel.positioning || 'N/A'}. Talking points: ${(intel.talking_points || []).join(', ')}. Give me a brief summary.`)
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: `Upload failed: ${err.message}` }]) }
    finally { setFileUploading(false) }
  }

  const handleFileDrop = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setChatDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) processFileForKiko(file) }
  const handleFileDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setChatDragOver(true) }
  const handleFileDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setChatDragOver(false) } }
  const handleFileDragOver = (e) => { e.preventDefault(); e.stopPropagation() }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Sunny'
  const trans = 'all 0.6s cubic-bezier(0.4,0,0.2,1)'

  // ── Prompt bar (shared) — mic becomes stop button during voice mode ──
  const PromptBar = ({ welcome = false }) => {
    const sz = welcome ? 36 : 30
    const ic = welcome ? 17 : 15
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 28, padding: welcome ? '8px 8px 8px 16px' : '6px 6px 6px 14px',
        border: '0.5px solid rgba(255,255,255,0.8)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
        maxWidth: welcome ? 540 : (compact ? '100%' : 680),
        width: '100%', margin: '0 auto',
      }}>
        <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) processFileForKiko(f); e.target.value = '' }} style={{ display: 'none' }} />
        {/* Paperclip */}
        <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading || streaming} title="Attach file" style={{
          width: sz, height: sz, borderRadius: '50%', border: 'none',
          background: 'transparent', color: T.textTertiary,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        {/* Text input */}
        <input
          ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
          placeholder={fileUploading ? "Analysing document..." : "Ask Kiko anything..."} autoFocus
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: welcome ? 15 : 13, color: T.text, fontFamily: T.font, height: welcome ? 40 : 32 }}
        />
        {/* Mic / Stop */}
        {voiceActive ? (
          <button onClick={stopVoice} title="Stop voice" style={{
            width: sz, height: sz, borderRadius: '50%', border: 'none',
            background: 'rgba(239,68,68,0.1)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} />
          </button>
        ) : (
          <>
          <button onClick={transcribing ? stopTranscribe : startTranscribe} title={transcribing ? 'Stop dictation' : 'Dictate'} style={{
            width: sz, height: sz, borderRadius: '50%', border: 'none',
            background: transcribing ? 'rgba(34,197,94,0.12)' : 'transparent',
            color: transcribing ? 'rgba(34,197,94,0.9)' : T.textTertiary,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', flexShrink: 0,
          }}>
            <svg width={ic + 1} height={ic + 1} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            {transcribing && <span style={{ position: 'absolute', top: welcome ? 2 : 1, right: welcome ? 2 : 1, width: 7, height: 7, borderRadius: '50%', background: 'rgba(34,197,94,0.9)', animation: 'kikoBreathe 1s ease-in-out infinite' }} />}
          </button>
          {/* Voice mode — equalizer icon */}
          {!welcome && !voiceActive && (
            <button onClick={startVoice} title="Talk to Kiko" style={{
              width: sz, height: sz, borderRadius: '50%', border: 'none',
              background: 'transparent', color: T.textTertiary,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none">
                <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor" opacity="0.6" />
                <rect x="8" y="5" width="2" height="14" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="12" y="7" width="2" height="10" rx="1" fill="currentColor" />
                <rect x="16" y="4" width="2" height="16" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="20" y="9" width="2" height="6" rx="1" fill="currentColor" opacity="0.6" />
              </svg>
            </button>
          )}
          </>
        )}
        {/* Send */}
        <button onClick={() => handleSubmit()} disabled={!input.trim() || streaming} style={{
          width: sz, height: sz, borderRadius: '50%',
          background: input.trim() ? T.accent : 'rgba(0,0,0,0.05)',
          border: 'none', color: input.trim() ? '#fff' : T.textTertiary,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}>
          <svg width={welcome ? 15 : 13} height={welcome ? 15 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </div>
    )
  }

  // ── Render message bubbles (shared between text and voice) ──
  const renderMessages = (msgs, isVoice = false) => msgs.map((msg, i) => {
    const isUser = msg.role === 'user'
    const isKiko = isVoice ? msg.role === 'kiko' : msg.role === 'assistant'
    return (
      <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {isKiko && (
          <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
            <KikoSymbol size={14} color="#fff" />
          </div>
        )}
        <div style={{
          maxWidth: '75%', padding: '10px 14px',
          borderRadius: 14,
          background: isUser ? 'rgba(0,0,0,0.04)' : '#fff',
          color: isUser ? T.text : T.textSecondary,
          border: isKiko ? `0.5px solid ${T.border}` : 'none',
          fontSize: 13, lineHeight: 1.5, fontFamily: T.font,
        }}>
          {isUser ? msg.content : <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />}
        </div>
      </div>
    )
  })

  // ── WELCOME STATE (no text messages, not in voice mode) ──
  if (!hasMessages && !compact) {
    return (
      <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative', overflow: 'hidden' }}>
        {chatDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #1A1A1A', borderRadius: 16, margin: 8, pointerEvents: 'none' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: T.font }}>Drop file for Kiko to analyse</p>
          </div>
        )}

        {/* Center content — transitions between idle and voice-active */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: voiceActive ? 'flex-start' : 'center', paddingTop: voiceActive ? 16 : 0, transition: trans, overflow: 'hidden', minHeight: 0 }}>

          {/* Avatar */}
          <div onClick={voiceActive ? stopVoice : startVoice} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: voiceActive ? 12 : 28, cursor: 'pointer', transition: trans, flexShrink: 0, width: voiceActive ? 100 : 180, height: voiceActive ? 100 : 180 }}>
            {/* Pulse rings — use explicit top/left/width/height for cross-browser */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: voiceActive ? 26 : 42, border: `2px solid ${voiceActive ? 'rgba(34,197,94,0.15)' : 'rgba(26,26,26,0.08)'}`, animation: 'kikoPulseRing 2.5s ease-in-out infinite', transition: trans }} />
            <div style={{ position: 'absolute', top: voiceActive ? -6 : -10, left: voiceActive ? -6 : -10, right: voiceActive ? -6 : -10, bottom: voiceActive ? -6 : -10, borderRadius: voiceActive ? 30 : 48, border: `1.5px solid ${voiceActive ? 'rgba(34,197,94,0.08)' : 'rgba(26,26,26,0.04)'}`, animation: 'kikoPulseRing 2.5s ease-in-out 0.6s infinite', transition: trans }} />
            {/* Avatar square */}
            <div style={{
              width: voiceActive ? 64 : 120, height: voiceActive ? 64 : 120,
              borderRadius: voiceActive ? 18 : 30, background: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'kikoBreatheScale 4s ease-in-out infinite',
              transition: trans, overflow: 'hidden', position: 'relative',
            }}>
              {/* Dots — show in idle AND when voice active but not speaking */}
              <div style={{ position: 'absolute', opacity: (voiceActive && voiceState.speaking) ? 0 : 1, transition: `opacity 0.4s` }}>
                <KikoDots size={voiceActive ? 28 : 52} color="#fff" animated />
              </div>
              {/* Equalizer bars — ONLY when Kiko is speaking */}
              <div style={{ position: 'absolute', opacity: (voiceActive && voiceState.speaking) ? 1 : 0, transition: `opacity 0.4s` }}>
                <AvatarEq />
              </div>
            </div>
          </div>

          {/* Greeting text — collapses when voice active */}
          <div style={{ maxHeight: voiceActive ? 0 : 80, opacity: voiceActive ? 0 : 1, overflow: 'hidden', transition: trans, textAlign: 'center' }}>
            <h1 style={{ fontSize: 28, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font, letterSpacing: '-0.02em' }}>
              {getGreeting()}, {firstName}
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.3)', margin: 0, fontFamily: T.font }}>What would you like to do?</p>
          </div>

          {/* Equalizer CTA — only in idle state */}
          {!voiceActive && (
            <button onClick={startVoice} style={{
              marginTop: 20, padding: '10px 22px', borderRadius: 24,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.2s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.25)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.06)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.15)' }}
            >
              <CtaEq />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(34,197,94,0.8)', fontFamily: T.font }}>Talk to Kiko</span>
            </button>
          )}

          {/* Prompt bar + chips — inline in idle state, directly below CTA */}
          {!voiceActive && (
            <div style={{ width: '100%', maxWidth: 540, marginTop: 20, padding: '0 24px', transition: trans }}>
              <PromptBar welcome />
              {dictateError && (
                <p style={{ textAlign: 'center', fontSize: 11, color: '#C62828', fontFamily: T.font, margin: '8px 0 0', animation: 'fadeIn 0.2s' }}>{dictateError}</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {CHIPS.map(c => (
                  <button key={c} onClick={() => handleSubmit(c)} style={{
                    padding: '8px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    border: '0.5px solid rgba(255,255,255,0.7)', color: T.textSecondary,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    fontSize: 12, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s'
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.8)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.6)' }}
                  >{c}</button>
                ))}
              </div>
            </div>
          )}

          {/* Voice conversation area */}
          {voiceActive && (
            <div style={{ flex: 1, width: '100%', maxWidth: 680, overflowY: 'auto', padding: '0 24px 16px', opacity: 1, transition: trans, minHeight: 0 }}>
              {voiceState.status === 'error' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ fontSize: 13, color: '#C62828', fontFamily: T.font, margin: '0 0 8px' }}>Mic not available — check browser permissions</p>
                  <button onClick={stopVoice} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 20, background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer', fontFamily: T.font, color: T.textSecondary }}>Close</button>
                </div>
              )}
              {renderMessages(voiceMessages, true)}
              {voiceState.transcript && (
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: 'rgba(0,0,0,0.06)', fontSize: 13, color: T.textSecondary, fontFamily: T.font, fontStyle: 'italic' }}>
                    {voiceState.transcript}
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Bottom: prompt bar fixed footer ONLY during voice mode */}
        {voiceActive && (
          <div style={{ padding: '8px 24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, background: T.bg }}>
            <PromptBar welcome />
          </div>
        )}

        {/* Headless KikoVoice — runs WebRTC connection, no UI */}
        {voiceActive && (
          <KikoVoice
            headless
            onClose={stopVoice}
            user={user}
            micStream={voiceMicStream}
            onVoiceState={handleVoiceState}
            onVoiceMessage={handleVoiceMessage}
          />
        )}

        {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} />}
      </div>
    )
  }

  // ── CONVERSATION STATE (text messages) ──
  return (
    <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, position: 'relative', overflow: 'hidden' }}>
      {chatDragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #1A1A1A', borderRadius: 16, margin: 8, pointerEvents: 'none' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: T.font }}>Drop file for Kiko to analyse</p>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : 24 }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto', width: '100%' }}>
          {renderMessages(messages)}
          {/* Thinking indicator */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
                <KikoSymbol size={13} color="#fff" animate="thinking" />
              </div>
              <div style={{ maxWidth: 320 }}>
                <div style={{ padding: '10px 14px', borderRadius: T.radiusSm, background: T.accentSoft }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, flexShrink: 0, animation: 'kikoBreathe 2s ease-in-out infinite' }} />
                    <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>{toolStatus || 'Kiko is thinking...'}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: T.accent, animation: 'kikoProgress 3s ease-in-out infinite' }} />
                  </div>
                </div>
                {thinkingSteps.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <button onClick={() => setShowSteps(!showSteps)} style={{ fontSize: 10, color: T.textTertiary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, padding: '2px 0', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      {showSteps ? 'Hide process' : `Show process (${thinkingSteps.length} steps)`}
                    </button>
                    {showSteps && (
                      <div style={{ padding: '6px 10px', borderRadius: 8, background: T.accentSoft, border: `0.5px solid ${T.border}`, marginTop: 4 }}>
                        {thinkingSteps.map((step, si) => {
                          const isLast = si === thinkingSteps.length - 1
                          return (
                            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>
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
              <div style={{ width: 24, height: 24, borderRadius: 7, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10, marginTop: 4 }}>
                <KikoSymbol size={13} color="#fff" animate="streaming" />
              </div>
              <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: T.radiusSm, background: '#fff', border: `0.5px solid ${T.border}`, fontSize: 13, color: T.textSecondary, lineHeight: 1.5, fontFamily: T.font }}>
                <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                <span style={{ animation: 'pulse 1s infinite', marginLeft: 2 }}>|</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
      <div style={{ padding: compact ? 12 : 16, borderTop: `0.5px solid ${T.border}` }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto' }}>
          <PromptBar />
          {dictateError && (
            <p style={{ textAlign: 'center', fontSize: 11, color: '#C62828', fontFamily: T.font, margin: '6px 0 0' }}>{dictateError}</p>
          )}
        </div>
      </div>
      {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} />}
      {/* Headless KikoVoice — runs WebRTC for voice mode within conversation */}
      {voiceActive && (
        <KikoVoice
          headless
          onClose={stopVoice}
          user={user}
          micStream={voiceMicStream}
          onVoiceState={handleVoiceState}
          onVoiceMessage={handleVoiceMessage}
        />
      )}
    </div>
  )
}
