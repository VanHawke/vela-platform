import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import T from '@/lib/theme'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import KikoSymbol from './KikoSymbol'

// Theme imported from @/lib/theme.js

function md(text) {
  if (!text) return ''
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0;border:0.5px solid rgba(255,255,255,0.06)"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(255,255,255,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-\u2013\u2022] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$2</li>')
    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.85);margin:16px 0 8px">$1</div>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:0.5px solid rgba(255,255,255,0.06);margin:16px 0"/>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

function getGreeting() {
  const h = new Date().getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const CHIPS = ['Brief me on today', 'What needs my attention?', "What's happening in F1", 'Analyse my pipeline', 'Check my emails', 'Who should I follow up with?']

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
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(6,214,160,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.06}s infinite` }} />
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
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(6,214,160,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.07}s infinite` }} />
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
    // Always add voice messages to main chat so they appear as transcript
    const mapped = { role: msg.role === 'kiko' ? 'assistant' : 'user', content: msg.content }
    setMessages(prev => [...prev, mapped])
  }, [])

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

  const handleSubmit = useCallback(async (text, fileAttachments = []) => {
    const msg = (text || input).trim()
    if ((!msg && !fileAttachments.length) || streaming) return
    setInput('')
    const displayMsg = msg || (fileAttachments.length ? `Uploaded ${fileAttachments.length} file(s)` : '')
    const userMsg = { role: 'user', content: displayMsg }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true); setStreamText(''); setToolStatus(null); setThinkingSteps([]); setShowSteps(false)
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg || 'Analyse this file.', userEmail: user?.email,
          attachments: fileAttachments,
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
            if (j.thinking) { setThinkingSteps(prev => [...prev, { label: 'Reasoning...', time: Date.now() }]) }
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
    if (!file || fileUploading || streaming) return
    setFileUploading(true)
    try {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      const isText = file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|js|jsx|ts|py|html|css|xml|yaml|yml)$/i)

      if (isText) {
        // Text files: read as text, send directly
        const text = await file.text()
        handleSubmit(`I've uploaded "${file.name}". Here are the contents:\n\n${text.slice(0, 50000)}\n\nAnalyse this.`)
      } else {
        // Binary files: convert to base64
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result.split(',')[1])
          r.onerror = () => rej(new Error('Failed to read file'))
          r.readAsDataURL(file)
        })
        if (isImage) {
          handleSubmit(`I've uploaded an image: "${file.name}". Analyse it.`, [{ type: 'image', mediaType: file.type, data: base64 }])
        } else if (isPdf) {
          handleSubmit(`I've uploaded a PDF: "${file.name}". Analyse it thoroughly.`, [{ type: 'document', mediaType: 'application/pdf', data: base64 }])
        } else {
          // Unsupported binary — just acknowledge
          handleSubmit(`I've uploaded "${file.name}" (${file.type}, ${(file.size/1024).toFixed(0)}KB). This file type can't be directly analysed. Try PDF, images, or text files.`)
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Upload failed: ${err.message}` }])
    } finally { setFileUploading(false) }
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
        background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 28, padding: welcome ? '6px 6px 6px 20px' : '4px 4px 4px 14px',
        border: `0.5px solid ${T.border}`,
        maxWidth: welcome ? 520 : (compact ? '100%' : 640),
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
          placeholder={fileUploading ? "Analysing document..." : "Ask anything"} autoFocus
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: welcome ? 15 : 14, color: 'rgba(255,255,255,0.7)', fontFamily: T.font, height: welcome ? 44 : 36, fontWeight: 300 }}
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
          width: welcome ? 40 : sz, height: welcome ? 40 : sz, borderRadius: '50%',
          background: input.trim() ? T.accent : 'rgba(255,255,255,0.04)',
          border: input.trim() ? 'none' : `0.5px solid ${T.border}`,
          color: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0, opacity: input.trim() ? 0.85 : 0.5,
        }}>
          <svg width={welcome ? 15 : 13} height={welcome ? 15 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    )
  }

  // ── Render message bubbles (shared between text and voice) ──
  const renderMessages = (msgs, isVoice = false) => msgs.map((msg, i) => {
    const isUser = msg.role === 'user'
    const isKiko = isVoice ? msg.role === 'kiko' : msg.role === 'assistant'
    return (
      <div key={i} style={{ marginBottom: 24, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 12 }}>
        {isKiko && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0, marginTop: 8, boxShadow: `0 0 8px rgba(139,108,246,0.3)` }} />
        )}
        <div style={{
          maxWidth: isUser ? '70%' : '100%',
          padding: isUser ? '11px 18px' : '0',
          borderRadius: isUser ? '18px 18px 4px 18px' : 0,
          background: isUser ? T.userMsg : 'transparent',
          backdropFilter: isUser ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: isUser ? 'blur(20px)' : 'none',
          border: isUser ? `0.5px solid ${T.userMsgBorder}` : 'none',
          color: isUser ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
          fontSize: 14, lineHeight: 1.75, fontFamily: T.font, fontWeight: 300,
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
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
        {chatDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(26,26,26,0.3)', borderRadius: 18, margin: 8, pointerEvents: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.textSecondary} strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: T.text, fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
            <p style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.font, margin: 0 }}>PDF, images, spreadsheets, text files</p>
          </div>
        )}

        {/* Center content — transitions between idle and voice-active */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: voiceActive ? 'flex-start' : 'center', paddingTop: voiceActive ? 16 : 0, transition: trans, overflow: 'hidden', minHeight: 0 }}>

          {/* Avatar */}
          <div onClick={voiceActive ? stopVoice : startVoice} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: voiceActive ? 12 : 28, cursor: 'pointer', transition: trans, flexShrink: 0, width: voiceActive ? 100 : 180, height: voiceActive ? 100 : 180 }}>
            {/* Pulse rings — use explicit top/left/width/height for cross-browser */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '50%', border: `1px solid ${voiceActive ? 'rgba(34,197,94,0.15)' : 'rgba(139,108,246,0.1)'}`, animation: 'kikoPulseRing 2.5s ease-in-out infinite', transition: trans }} />
            <div style={{ position: 'absolute', top: voiceActive ? -6 : -12, left: voiceActive ? -6 : -12, right: voiceActive ? -6 : -12, bottom: voiceActive ? -6 : -12, borderRadius: '50%', border: `0.5px solid ${voiceActive ? 'rgba(34,197,94,0.08)' : 'rgba(6,214,160,0.06)'}`, animation: 'kikoPulseRing 2.5s ease-in-out 0.6s infinite', transition: trans }} />
            {/* Avatar square */}
            <div style={{
              width: voiceActive ? 64 : 100, height: voiceActive ? 64 : 100,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(139,108,246,0.9), rgba(6,214,160,0.7))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: trans, overflow: 'hidden', position: 'relative',
              boxShadow: '0 0 60px rgba(139,108,246,0.2), 0 0 120px rgba(6,214,160,0.1)',
            }}>
              <div style={{ position: 'absolute', top: '12%', left: '18%', width: '35%', height: '28%', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', filter: 'blur(5px)' }} />
              {/* Dots — show in idle AND when voice active but not speaking */}
              <div style={{ position: 'absolute', opacity: (voiceActive && voiceState.speaking) ? 0 : 1, transition: `opacity 0.4s` }}>
                <KikoDots size={voiceActive ? 28 : 36} color="#fff" animated />
              </div>
              {/* Equalizer bars — ONLY when Kiko is speaking */}
              <div style={{ position: 'absolute', opacity: (voiceActive && voiceState.speaking) ? 1 : 0, transition: `opacity 0.4s` }}>
                <AvatarEq />
              </div>
            </div>
          </div>

          {/* Greeting text — collapses when voice active */}
          <div style={{ maxHeight: voiceActive ? 0 : 80, opacity: voiceActive ? 0 : 1, overflow: 'hidden', transition: trans, textAlign: 'center' }}>
            <h1 style={{ fontSize: 36, fontWeight: 200, color: 'rgba(255,255,255,0.95)', margin: '0 0 8px', fontFamily: T.font, letterSpacing: '-0.03em' }}>
              {getGreeting()}, {firstName}
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', margin: 0, fontFamily: T.font, fontWeight: 300, letterSpacing: '0.02em' }}>What would you like to work on?</p>
          </div>

          {/* Equalizer CTA — only in idle state */}
          {!voiceActive && (
            <button onClick={startVoice} style={{
              marginTop: 20, padding: '5px 16px', borderRadius: 20,
              background: 'rgba(6,214,160,0.04)', border: '0.5px solid rgba(6,214,160,0.15)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(6,214,160,0.08)'; e.currentTarget.style.borderColor = 'rgba(6,214,160,0.25)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(6,214,160,0.04)'; e.currentTarget.style.borderColor = 'rgba(6,214,160,0.15)' }}
            >
              <CtaEq />
              <span style={{ fontSize: 12, fontWeight: 300, color: 'rgba(6,214,160,0.6)', fontFamily: T.font }}>Talk to Kiko</span>
            </button>
          )}

          {/* Prompt bar + chips — inline in idle state, directly below CTA */}
          {!voiceActive && (
            <div style={{ width: '100%', maxWidth: 540, marginTop: 20, padding: '0 24px', transition: trans }}>
              <PromptBar welcome />
              {dictateError && (
                <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,80,80,0.7)', fontFamily: T.font, margin: '8px 0 0', animation: 'fadeIn 0.2s' }}>{dictateError}</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {CHIPS.map(c => (
                  <button key={c} onClick={() => handleSubmit(c)} style={{
                    padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.03)',
                    border: `0.5px solid ${T.border}`, color: T.textTertiary,
                    fontSize: 12, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s', fontWeight: 300,
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textTertiary }}
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
                  <p style={{ fontSize: 13, color: 'rgba(255,80,80,0.7)', fontFamily: T.font, margin: '0 0 8px' }}>Mic not available — check browser permissions</p>
                  <button onClick={stopVoice} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontFamily: T.font, color: T.textSecondary }}>Close</button>
                </div>
              )}
              {renderMessages(voiceMessages, true)}
              {voiceState.transcript && (
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', fontSize: 13, color: T.textSecondary, fontFamily: T.font, fontStyle: 'italic' }}>
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
          <div style={{ padding: '8px 24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, background: 'transparent' }}>
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
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {chatDragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(26,26,26,0.3)', borderRadius: 18, margin: 8, pointerEvents: 'none' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.textSecondary} strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 500, color: T.text, fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.font, margin: 0 }}>PDF, images, spreadsheets, text files</p>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : 24 }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto', width: '100%' }}>
          {renderMessages(messages)}
          {/* Thinking indicator */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0, marginTop: 8, boxShadow: '0 0 8px rgba(139,108,246,0.4)' }} />
              <div style={{ maxWidth: 360 }}>
                <div style={{ padding: '12px 16px', borderRadius: 14, background: 'rgba(139,108,246,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.5px solid rgba(139,108,246,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, flexShrink: 0, animation: 'kikoBreathe 1.5s ease-in-out infinite', boxShadow: '0 0 6px rgba(139,108,246,0.5)' }} />
                    <span style={{ fontSize: 11, color: 'rgba(139,108,246,0.5)', fontFamily: T.font, fontWeight: 300 }}>{toolStatus || 'thinking'}</span>
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
                            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: T.textTertiary, fontFamily: T.font, fontWeight: 300 }}>
                              <span style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: isLast ? T.accent : T.accentTeal, animation: isLast ? 'pulse 1s infinite' : 'none' }} />
                              <span style={{ color: isLast ? 'rgba(139,108,246,0.5)' : T.textTertiary }}>{step.label}</span>
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
            <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0, marginTop: 8, boxShadow: '0 0 8px rgba(139,108,246,0.3)' }} />
              <div style={{ flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, fontFamily: T.font, fontWeight: 300 }}>
                <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                <span style={{ animation: 'pulse 1s infinite', marginLeft: 2, color: 'rgba(139,108,246,0.4)' }}>|</span>
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
