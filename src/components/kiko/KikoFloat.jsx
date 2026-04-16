import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ArrowUp, Mic } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
// Design tokens — hardcoded (matching Sequences.jsx)
const C = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#FAFAF7',
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.12)',
  text: '#0A0A0A',
  textSec: '#6B6B6B',
  textTer: '#A0A0A0',
  textMut: '#A0A0A0',
  purple: '#0A0A0A',
  teal: '#0A0A0A',
  green: '#34D399',
  red: '#F87171',
  amber: '#FBBF24',
  blue: '#60A5FA',
  linkedin: '#0077B5',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  r: 8,
}
import KikoWaveform from './KikoWaveform'
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice'
// KikoVoice removed — voice stays in FAB circle
import DOMPurify from 'dompurify'
import { useDynamicChips } from '@/hooks/useDynamicChips'

// Strip orphaned Unicode surrogates — prevents API JSON parse errors from emoji corruption
function sanitizeUnicode(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += str[i] + str[i + 1];
        i++;
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Orphaned low surrogate — skip
    } else {
      result += str[i];
    }
  }
  return result;
}

// Theme imported from @/lib/theme.js

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
@keyframes kikoPulseRing {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.06); }
}
@keyframes kikoBreatheScale {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.015); }
}
@keyframes kikoDotPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes kikoOrbPulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.15); opacity: 0.7; }
}
@keyframes kikoOrbBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}
@keyframes kikoBarPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
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
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.04);padding:8px;border-radius:8px;font-size:11px;overflow-x:auto;margin:4px 0;border:0.5px solid rgba(0,0,0,0.08)"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.04);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
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

// Chips are now dynamic — see useDynamicChips hook

export default function KikoFloat({ user, messages: sharedMessages, setMessages: setSharedMessages, convId: sharedConvId, setConvId: setSharedConvId, onNavigate, autoVoice, onAutoVoiceConsumed }) {
  const loc = useLocation()
  const isHome = loc.pathname === '/'
  const currentPage = loc.pathname.replace('/', '') || 'home'
  const dynamicChips = useDynamicChips(currentPage, true)
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
  const { status: voiceStatus, speaking: voiceSpeaking } = useRealtimeVoice({
    active: voiceOpen,
    onClose: () => { setVoiceOpen(false); window.dispatchEvent(new CustomEvent('kiko_voice_state', { detail: { active: false } })) },
    onMessage: (msg) => {
      // Forward voice transcripts up to Layout via custom event so Layout's
      // handleVoiceMessage saves them to the conversations table
      window.dispatchEvent(new CustomEvent('kiko_voice_message', { detail: msg }))
    },
  })
  const [floatVoiceState, setFloatVoiceState] = useState({ speaking: false, status: 'connecting', energy: 0, pitch: 0 })
  const [fileUploading, setFileUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null) // { file, previewUrl, name, type }
  const [fileDragging, setFileDragging] = useState(false)
  const [fabClass, setFabClass] = useState('')
  const pendingNavRef = useRef(null) // Navigation queued during stream, executed after
  const abortRef = useRef(null) // AbortController for stop button
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

  // Reset voiceOpen when KikoVoice closes (e.g. via "Goodbye Kiko" command)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.active === false) setVoiceOpen(false)
    }
    window.addEventListener('kiko_voice_state', handler)
    return () => window.removeEventListener('kiko_voice_state', handler)
  }, [])

  // Auto-activate inline voice when navigating from fullscreen voice (voice follows you)
  useEffect(() => {
    if (autoVoice) {
      setVoiceOpen(true)
      if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
      onAutoVoiceConsumed?.()
    }
  }, [autoVoice])

  // Auto-reopen after navigation (page reload preserves state via sessionStorage)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kiko_reopen')
      if (!raw) return
      sessionStorage.removeItem('kiko_reopen')
      const { convId: savedConvId, timestamp } = JSON.parse(raw)
      if (Date.now() - timestamp > 10000) return // Stale (>10s old), ignore
      console.log('[KikoFloat] Auto-reopening after navigation, convId:', savedConvId)
      if (savedConvId) {
        setConvId(savedConvId)
        // Load conversation from Supabase
        supabase.from('conversations').select('messages').eq('id', savedConvId).single().then(({ data }) => {
          if (data?.messages?.length) {
            setMessages(data.messages)
            setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open')
          }
        })
      } else {
        setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open')
      }
    } catch {}
  }, [])

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

  // Navigation is handled via pendingNavRef — queued during SSE stream, executed post-stream

  const handleSubmit = useCallback(async (text) => {
    const msg = sanitizeUnicode((text || input).trim())
    if (!msg || streaming) return
    setInput('')
    if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true); setStreamText(''); setToolStatus(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: msg, userEmail: user?.email,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          currentPage: (window.kikoPageContext?.page || window.location.pathname.replace('/', '') || 'home'),
          pageContext: window.kikoPageContext || { page: window.location.pathname.replace('/', '') || 'home', path: window.location.pathname },
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
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; setStreamText(full) }
            if (j.navigate) {
              console.log('[KikoFloat] Navigate queued:', j.navigate)
              pendingNavRef.current = j.navigate
            }
            if (j.toolStatus !== undefined) setToolStatus(j.toolStatus)
          } catch {}
        }
      }
      const kikoMsg = { role: 'assistant', content: full }
      setMessages(prev => [...prev, kikoMsg]); setStreamText('')
      const allMsgs = [...messages, userMsg, kikoMsg]
      // Save conversation BEFORE navigation (navigation reloads the page)
      let savedConvId = convId
      if (user?.id) {
        const orgId = user?.app_metadata?.org_id
        if (convId) {
          await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        } else {
          let autoTitle = msg.slice(0, 60)
          try { const tr = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: msg, response: full.slice(0, 300) }) }); const tj = await tr.json(); if (tj.title) autoTitle = tj.title } catch {}
          const { data } = await supabase.from('conversations').insert({ user_id: user.id, org_id: orgId, title: autoTitle, messages: allMsgs }).select('id').single()
          if (data?.id) { setConvId(data.id); savedConvId = data.id }
        }
      }
      // Navigate AFTER conversation is saved
      if (pendingNavRef.current) {
        const navTarget = pendingNavRef.current
        pendingNavRef.current = null
        console.log('[KikoFloat] Navigating to:', navTarget, '| convId:', savedConvId)
        sessionStorage.setItem('kiko_reopen', JSON.stringify({ convId: savedConvId, timestamp: Date.now() }))
        window.location.href = '/' + (navTarget === 'home' ? '' : navTarget)
        return // Stop execution — page is reloading
      }
    } catch (err) { if (err.name !== 'AbortError') { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]); } setStreamText('') }
    finally { setStreaming(false); abortRef.current = null }
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

  // Stage file for preview before processing
  const stageFile = (file) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setPendingFile({ file, previewUrl, name: file.name, type: file.type })
    if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
  }

  const clearPendingFile = () => { if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null) }

  const submitWithFile = () => {
    if (!pendingFile) return
    processFileForKiko(pendingFile.file)
    setPendingFile(null)
  }

  // Drag and drop handlers
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setFileDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setFileDragging(false) }
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setFileDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) stageFile(f) }

  async function startTranscribe() {
    if (transcribing) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      try {
        const sr = new SR()
        sr.continuous = true; sr.interimResults = false; sr.lang = 'en-US'
        recorderRef.current = sr
        mediaRef.current = true
        const baseInput = input
        const finals = []
        setTranscribing(true)
        sr.onresult = e => {
          for (let i = 0; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              const text = e.results[i][0].transcript.trim()
              if (text && !finals.includes(text)) finals.push(text)
            }
          }
          const display = (baseInput ? baseInput + ' ' : '') + finals.join(' ')
          setInput(display.trim())
        }
        sr.onerror = (e) => {
          console.error('[Float Dictate] error:', e.error)
          if (e.error === 'not-allowed') { setTranscribing(false); mediaRef.current = null }
        }
        sr.onend = () => { if (recorderRef.current === sr && mediaRef.current) { try { sr.start() } catch {} } }
        sr.start()
        if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
      } catch { setTranscribing(false) }
    } else {
      // Web Speech API unavailable — Whisper fallback removed (api/voice never existed)
      console.warn('[Float Dictate] Web Speech API not supported in this browser. Use the EQ button for full voice mode.')
      setTranscribing(false)
    }
  }

  function stopTranscribe() {
    mediaRef.current = null
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch {}
      recorderRef.current = null
    }
    setTranscribing(false)
  }

  async function openVoiceMode() {
    // Stay inline — no fullscreen portal. WebRTC runs headlessly via useRealtimeVoice hook.
    setVoiceOpen(true)
    if (!open) { setOpen(true); setHasPanel(true); setPanelKey(k => k + 1); setFabClass('kiko-fab-open') }
    window.dispatchEvent(new CustomEvent('kiko_voice_state', { detail: { active: true, speaking: false, thinking: false, status: 'Listening' } }))
  }

  function closeVoiceMode() {
    setVoiceOpen(false)
    setFloatVoiceState({ speaking: false, status: 'idle', energy: 0 })
    window.dispatchEvent(new CustomEvent('kiko_voice_state', { detail: { active: false } }))
  }

  // Hide KikoFloat entirely on homepage — Kiko IS the wave there
  if (isHome && !voiceOpen) return null

  // Voice mode now stays inside float — no more full-page takeover

  const panelW = 340

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) stageFile(f); e.target.value = '' }} style={{ display: 'none' }} />

      {/* ── Spring pop panel ── */}
      {hasPanel && (
        <div key={panelKey} className={`kiko-panel ${open ? 'entering' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          style={{
          position: 'fixed', bottom: 88, right: 24, width: panelW,
          zIndex: 100, borderRadius: 24,
          background: '#FFFFFF',
          border: `1px solid rgba(0,0,0,0.08)`,
          borderTop: `1px solid rgba(0,0,0,0.06)`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 160px)',
          opacity: open ? 1 : 0,
          transition: open ? 'none' : 'opacity 0.2s ease',
          pointerEvents: open ? 'all' : 'none',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: hasMessages ? '1.5px solid rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 12, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)' }}>
                <KikoWaveform width={24} height={12} mini />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: C.font }}>Kiko</span>
              {voiceOpen && (
                <span style={{ fontSize: 10, fontWeight: 500, color: voiceSpeaking ? '#06D6A0' : voiceStatus === 'thinking' ? '#7C9CF6' : voiceStatus === 'error' ? '#FF5050' : '#A0A0A0', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: voiceSpeaking ? '#06D6A0' : voiceStatus === 'connecting' ? '#F59E0B' : '#06D6A0', animation: voiceSpeaking ? 'none' : 'pulse 1.5s ease-in-out infinite' }} />
                  {voiceSpeaking ? 'Speaking' : voiceStatus === 'thinking' ? 'Thinking' : voiceStatus === 'connecting' ? 'Connecting' : 'Listening'}
                </span>
              )}
            </div>
            <button onClick={toggleOpen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textTer, padding: 4, display: 'flex', borderRadius: 6, lineHeight: 1 }}>
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          {hasMessages && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: msg.role !== 'user' ? 4 : 8 }}>
                  <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role !== 'user' && (
                    <div style={{ width: 20, height: 20, borderRadius: 50, background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                      <KikoWaveform width={18} height={10} mini />
                    </div>
                  )}
                  <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : 8, background: msg.role === 'user' ? C.purple : 'rgba(0,0,0,0.04)', color: msg.role === 'user' ? '#FFFFFF' : C.textSec, fontSize: 13, lineHeight: 1.55, fontFamily: C.font }}>
                    {msg.role === 'user' ? msg.content : <span dangerouslySetInnerHTML={{ __html: md(msg.content) }} />}
                  </div>
                  </div>
                  {msg.role !== 'user' && !streaming && (
                    <div style={{ display: 'flex', gap: 1, marginTop: 2, paddingLeft: 28 }}>
                      <button onClick={() => { navigator.clipboard?.writeText(msg.content); }} title="Copy" style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#A0A0A0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#6B6B6B' }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A0A0A0' }}
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
                      <button onClick={() => { if (i > 0) { const ui = messages.slice(0, i).findLastIndex(m => m.role === 'user'); if (ui >= 0) handleSubmit(messages[ui].content) } }} title="Retry" style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#A0A0A0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#6B6B6B' }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A0A0A0' }}
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>
                    </div>
                  )}
                </div>
              ))}
              {streaming && !streamText && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <KikoWaveform width={18} height={10} mini />
                  </div>
                  <div style={{ padding: '7px 11px', borderRadius: 50, background: 'rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.purple, flexShrink: 0, animation: 'kikoBreathe 2s ease-in-out infinite' }} />
                      <span style={{ fontSize: 12, color: C.textSec, fontFamily: C.font }}>{toolStatus || 'Thinking…'}</span>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: 'rgba(0,0,0,0.03)', marginTop: 5, overflow: 'hidden', width: 120 }}>
                      <div style={{ height: '100%', borderRadius: 1, background: C.purple, animation: 'kikoProgress 2.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
              )}
              {streaming && streamText && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                      <KikoWaveform width={18} height={10} mini />
                    </div>
                    <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: 50, background: 'rgba(0,0,0,0.04)', fontSize: 13, color: C.textSec, lineHeight: 1.55, fontFamily: C.font }}>
                      <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                      <span style={{ animation: 'kikoBreathe 1s infinite' }}>▍</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                    <button onClick={() => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; if (streamText) setMessages(prev => [...prev, { role: 'assistant', content: streamText }]); setStreamText(''); setStreaming(false) } }}
                      style={{ padding: '4px 12px', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.02)', cursor: 'pointer', fontSize: 11, color: '#A0A0A0', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.1s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#6B6B6B' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; e.currentTarget.style.color = '#A0A0A0' }}
                    ><span style={{ width: 8, height: 8, borderRadius: 1.5, background: 'currentColor', display: 'inline-block' }} /> Stop</button>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}

          {/* Chips — only when no conversation yet */}
          {!hasMessages && (
            <div style={{ padding: '10px 12px 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {dynamicChips.map((chip, i) => (
                <button key={chip} onClick={() => handleSubmit(chip)} style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 50,
                  border: '0.5px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.04)',
                  color: C.textSec, cursor: 'pointer', fontFamily: C.font,
                  animation: `kikoChipIn 0.3s ease ${0.08 + i * 0.05}s both`,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.04)' }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input bar inside panel */}
          {/* File preview strip */}
          {pendingFile && (
            <div style={{ padding: '8px 12px 0', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.02)', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                {pendingFile.previewUrl
                  ? <img src={pendingFile.previewUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(0,0,0,0.55)', fontWeight: 500 }}>{pendingFile.name.split('.').pop()?.toUpperCase()}</div>
                }
                <span style={{ fontSize: 11, color: '#6B6B6B', fontFamily: C.font, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
                <button onClick={clearPendingFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0A0', padding: 2, fontSize: 12, lineHeight: 1 }}>✕</button>
              </div>
            </div>
          )}
          <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', gap: 6, borderTop: hasMessages ? '1px solid rgba(0,0,0,0.06)' : 'none', marginTop: hasMessages ? 0 : 8 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.04)', color: C.textTer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
              {fileUploading
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'kikoVortexSpin 1s linear infinite' }}><circle cx="12" cy="12" r="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>}
            </button>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && input.trim()) { e.preventDefault(); handleSubmit() } }}
              placeholder="Ask me anything...."
              rows={1}
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: C.text, fontFamily: C.font, resize: 'none', minHeight: 24, maxHeight: 120, lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content' }} />
            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(0,0,0,0.08)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.04)', color: transcribing ? 'rgba(34,197,94,0.9)' : C.textTer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
              <Mic size={13} />
              {transcribing && <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: 'rgba(34,197,94,0.9)', animation: 'kikoBreathe 1s ease-in-out infinite' }} />}
            </button>
            <button onClick={voiceOpen ? closeVoiceMode : openVoiceMode} style={{ width: 30, height: 30, borderRadius: 9999, border: voiceOpen ? '1.5px solid rgba(255,59,48,0.2)' : '1px solid rgba(6,214,160,0.2)', background: voiceOpen ? 'rgba(255,59,48,0.08)' : 'rgba(6,214,160,0.06)', color: voiceOpen ? 'rgba(255,59,48,0.7)' : 'rgba(6,214,160,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: 'all 0.3s' }}>
              {voiceOpen ? <div style={{ width: 8, height: 8, borderRadius: 1.5, background: 'rgba(255,59,48,0.7)' }} /> : <EqIcon size={14} color="rgba(6,214,160,0.7)" />}
            </button>
            <button onClick={() => { if (pendingFile) submitWithFile(); else handleSubmit(); }} disabled={(!input.trim() && !pendingFile) || streaming}
              style={{ width: 30, height: 30, borderRadius: 9999, border: (input.trim() || pendingFile) && !streaming ? 'none' : `1px solid ${C.border}`, background: (input.trim() || pendingFile) && !streaming ? 'linear-gradient(135deg, #5a6470, #0A0A0A)' : 'rgba(0,0,0,0.04)', color: (input.trim() || pendingFile) && !streaming ? '#FFFFFF' : C.textTer, cursor: (input.trim() || pendingFile) && !streaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: (input.trim() || pendingFile) ? '0 4px 16px rgba(90,100,112,0.3)' : '0 1px 2px rgba(0,0,0,0.15)' }}>
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── FAB button — Dark sphere with KikoWaveform, teal aura when speaking ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 101, width: 60, height: 60 }}>
        {/* Teal aura rings — visible when voice is active */}
        {voiceOpen && <>
          <div style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(6,214,160,0.25)', animation: 'kikoPulseRing 2s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: '1.5px solid rgba(6,214,160,0.12)', animation: 'kikoPulseRing 2s ease-in-out 0.5s infinite', pointerEvents: 'none' }} />
        </>}
        {/* Idle breathing ring — subtle purple */}
        {!open && !voiceOpen && <>
          <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.10)', animation: 'kikoPulseRing 4s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.08)', animation: 'kikoPulseRing 4s ease-in-out 1s infinite', pointerEvents: 'none' }} />
        </>}
        <button onClick={toggleOpen} className={fabClass} style={{
          width: 60, height: 60, borderRadius: '50%',
          background: voiceOpen
            ? 'radial-gradient(circle at 40% 35%, rgba(10,28,24,1), rgba(8,8,12,1))'
            : 'radial-gradient(circle at 40% 35%, rgba(35,28,55,1), rgba(15,13,22,1))',
          border: voiceOpen ? '2px solid rgba(6,214,160,0.25)' : '2px solid rgba(0,0,0,0.14)',
          color: '#0A0A0A',
          cursor: 'pointer',
          boxShadow: voiceOpen
            ? '0 0 0 3px rgba(6,214,160,0.08), 0 0 20px rgba(6,214,160,0.10), 0 6px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(0,0,0,0.08)'
            : '0 0 0 3px rgba(0,0,0,0.04), 0 0 16px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
          transformOrigin: 'center',
          position: 'relative',
        }}
          onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor = voiceOpen ? 'rgba(6,214,160,0.4)' : 'rgba(0,0,0,0.14)'; e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = voiceOpen ? '0 0 0 4px rgba(6,214,160,0.08), 0 0 24px rgba(6,214,160,0.12), 0 8px 24px rgba(0,0,0,0.14)' : '0 0 0 4px rgba(0,0,0,0.05), 0 0 32px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.14)' }}}
          onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = voiceOpen ? 'rgba(6,214,160,0.25)' : 'rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = voiceOpen ? '0 0 0 3px rgba(6,214,160,0.08), 0 0 20px rgba(6,214,160,0.10), 0 6px 20px rgba(0,0,0,0.12)' : '0 0 0 2px rgba(0,0,0,0.03), 0 0 14px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.12)' }}}
        >
          {voiceOpen
            ? <div style={{ transform: open ? 'rotate(-45deg)' : 'none', transition: 'transform 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><KikoWaveform width={40} height={40} mini volume={0} speaking={voiceSpeaking} lightBars /></div>
            : open
              ? <X size={18} />
              : <KikoWaveform width={40} height={40} mini volume={0} speaking={false} lightBars />
          }
        </button>
      </div>
    </>
  )
}
