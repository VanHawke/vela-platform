import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import T from '@/lib/theme'
import taskManager from '@/lib/kikoTaskManager'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import KikoSymbol from './KikoSymbol'
import DoubleHelix from './DoubleHelix'
import DraftPreview, { detectDraft } from './DraftPreview'
import KikoInsights from './KikoInsights'

// Theme imported from @/lib/theme.js

function md(text) {
  if (!text) return ''
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Supabase generated-files image → inline preview
    .replace(/\[View\/Download\]\((https:\/\/[^\s)]*generated-files[^\s)]*\.png[^\s)]*)\)/g, '<div style="margin:8px 0"><a href="$1" target="_blank" rel="noopener"><img src="$1" style="max-width:100%;max-height:360px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);box-shadow:0 4px 16px rgba(0,0,0,0.3)" /></a></div>')
    // Supabase generated-files links → download buttons
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]*generated-files[^\s)]*)\)/g, '<a href="$2" target="_blank" download="$1" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;margin:6px 0;background:rgba(139,108,246,0.06);border:1px solid rgba(139,108,246,0.15);color:rgba(139,108,246,0.8);font-size:13px;font-weight:400;text-decoration:none">📄 $1 <span style="font-size:11px">↓</span></a>')
    // Regular markdown links
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:rgba(139,108,246,0.7);text-decoration:none;border-bottom:1px solid rgba(139,108,246,0.2)">$1</a>')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,255,255,0.07);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0;border:1.5px solid rgba(255,255,255,0.1)"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.07);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(255,255,255,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-\u2013\u2022] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$2</li>')
    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.85);margin:16px 0 8px">$1</div>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1.5px solid rgba(255,255,255,0.1);margin:16px 0"/>')
    .replace(/\n/g, '<br/>')
  return DOMPurify.sanitize(h)
}

function getGreeting() {
  const h = new Date().getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const CHIPS = ['Brief me', 'Pipeline update', 'Check emails', 'F1 calendar']

// Kiko 4-dot symbol (asymmetric diamond) with optional staggered animation
const KikoDots = ({ size = 40, color = 'rgba(255,255,255,0.04)', animated = false }) => {
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
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editText, setEditText] = useState('')
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
  const abortRef = useRef(null)
  const streamTextRef = useRef('')
  const lastQueryRef = useRef('')
  const streamingRef = useRef(false)

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

  // Edit mode: pre-fill input when edit button clicked
  useEffect(() => {
    if (editingIdx !== null) { setInput(editText); inputRef.current?.focus(); setEditingIdx(null) }
  }, [editingIdx])

  // Auto-load conversation after navigation (page reload preserves state via sessionStorage)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kiko_reopen')
      if (!raw) return
      sessionStorage.removeItem('kiko_reopen')
      const { convId: savedConvId, timestamp } = JSON.parse(raw)
      if (Date.now() - timestamp > 10000) return
      if (savedConvId) {
        console.log('[KikoChat] Auto-loading conversation after navigation, convId:', savedConvId)
        setActiveConvId(savedConvId)
        supabase.from('conversations').select('messages').eq('id', savedConvId).single().then(({ data }) => {
          if (data?.messages?.length) setMessages(data.messages)
        })
      }
    } catch {}
  }, [])
  const hasVoiceMessages = voiceMessages.length > 0

  // Start voice mode — don't pre-acquire mic, let KikoVoice handle it
  const startVoice = async () => {
    setVoiceActive(true)
    setVoiceMessages([])
    // Tell Layout to hide header for full-screen voice
    window.dispatchEvent(new CustomEvent('kiko_voice_fullscreen', { detail: { active: true } }))
  }

  // Stop voice mode — save transcript to history, return to homepage
  const stopVoice = async () => {
    setVoiceActive(false)
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
    window.dispatchEvent(new CustomEvent('kiko_voice_fullscreen', { detail: { active: false } }))
    // Clear audio globals so helix stops reacting
    window.__kikoAudioEnergy = 0
    window.__kikoAudioPitch = 0

    // Save voice conversation to chat history if there are messages
    if (voiceMessages.length > 0) {
      try {
        const convId = `voice_${Date.now()}`
        const mapped = voiceMessages.map(m => ({ role: m.role === 'kiko' ? 'assistant' : 'user', content: m.content }))
        // Auto-rename from first user message
        const firstUserMsg = voiceMessages.find(m => m.role === 'user')
        const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '') : 'Voice conversation'
        await supabase.from('conversations').insert({
          user_id: user?.id, org_id: user?.app_metadata?.org_id, title,
          messages: mapped,
        })
      } catch (e) { console.warn('Failed to save voice transcript:', e) }
    }

    // Clear messages to return to homepage
    setMessages([])
    setVoiceMessages([])
  }

  // Voice state callback from headless KikoVoice
  const handleVoiceState = useCallback((state) => setVoiceState(state), [])
  const handleVoiceMessage = useCallback((msg) => {
    // Only save to voiceMessages — NOT to main messages (prevents transcript from showing)
    setVoiceMessages(prev => [...prev, msg])
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

  // Background task persistence — save streaming on unmount, restore on mount
  useEffect(() => {
    // On mount: check for completed background tasks
    const completed = taskManager.getCompletedTasks()
    if (completed.length > 0) {
      completed.forEach(task => {
        setMessages(prev => [...prev,
          { role: 'user', content: task.query },
          { role: 'assistant', content: task.response + '\n\n*[Completed in background]*' }
        ])
        taskManager.dismissTask(task.id)
      })
    }
    // On mount: check for interrupted tasks in localStorage
    try {
      const interrupted = localStorage.getItem('kiko_interrupted_task')
      if (interrupted) {
        const task = JSON.parse(interrupted)
        if (Date.now() - task.timestamp < 300000) { // within 5 minutes
          setMessages(prev => [...prev,
            { role: 'user', content: task.query },
            { role: 'assistant', content: task.partial + '\n\n*[Interrupted — type "continue" to resume]*' }
          ])
        }
        localStorage.removeItem('kiko_interrupted_task')
      }
    } catch {}
    // On unmount: if streaming, save partial response
    return () => {
      if (streamingRef.current && streamTextRef.current) {
        // Save to localStorage for resume
        try {
          localStorage.setItem('kiko_interrupted_task', JSON.stringify({
            query: lastQueryRef.current, partial: streamTextRef.current, timestamp: Date.now()
          }))
        } catch {}
        // Also save to task manager for toast notification
        const taskId = 'task_' + Date.now()
        taskManager.startTask(taskId, lastQueryRef.current, activeConvId)
        taskManager.appendToTask(taskId, streamTextRef.current)
        taskManager.completeTask(taskId)
        if (abortRef.current) abortRef.current.abort()
      }
    }
  }, [])

  const saveConversation = async (allMsgs, convId, userMsg, kikoResponse) => {
    if (!user?.id) return convId
    try {
      if (convId) {
        await supabase.from('conversations').update({ messages: allMsgs, updated_at: new Date().toISOString() }).eq('id', convId)
        return convId
      }
      let autoTitle = (userMsg || 'New conversation').slice(0, 60)
      try {
        const tr = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: userMsg, response: (kikoResponse || '').slice(0, 300) }) })
        if (tr.ok) {
          const tj = await tr.json()
          if (tj.title) autoTitle = tj.title
        }
      } catch (e) { /* title gen failed, use truncated message */ }
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
    streamingRef.current = true; streamTextRef.current = ''; lastQueryRef.current = msg || ''

    // AbortController for stop/halt
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Page context — tells Kiko what page user is viewing
      const pageCtx = window.kikoPageContext || { page: window.location.pathname.replace('/', '') || 'home' }

      // Detect deep research queries — route to parallel multi-agent endpoint
      const RESEARCH_TRIGGERS = ['deep research', 'research ', 'deep dive on', 'full research', 'investigate ', 'intel on ', 'intelligence on ']
      const isResearch = msg && RESEARCH_TRIGGERS.some(t => msg.toLowerCase().startsWith(t) || msg.toLowerCase().includes(t))
      const apiUrl = isResearch ? '/api/kiko-research' : '/api/kiko'

      const res = await fetch(apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(isResearch ? { query: msg, userEmail: user?.email } : {
          message: msg || 'Analyse this file.', userEmail: user?.email,
          attachments: fileAttachments,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          currentPage: pageCtx.page || (window.location.pathname.replace('/', '') || 'home'),
          pageContext: pageCtx,
          pageEntity: (() => {
            const path = window.location.pathname; const params = new URLSearchParams(window.location.search)
            if (path.startsWith('/contacts/')) return { type: 'contact', id: path.split('/contacts/')[1] }
            if (params.get('org')) return { type: 'company', id: params.get('org') }
            return null
          })(),
          personality: (() => { try { const s = JSON.parse(localStorage.getItem('kiko_settings') || '{}'); return s.kiko_personality || 'executive' } catch { return 'executive' } })(),
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
            if (j.delta) { full += j.delta; setStreamText(full); streamTextRef.current = full }
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
        const savedId = newId || activeConvId
        console.log('[KikoChat] Navigating to:', pendingNav, '| convId:', savedId)
        sessionStorage.setItem('kiko_reopen', JSON.stringify({ convId: savedId, timestamp: Date.now() }))
        const target = pendingNav === 'home' ? '/' : `/${pendingNav}`
        window.location.href = target
        return // Stop execution — page is reloading
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stopped Kiko — save partial response
        if (streamText) setMessages(prev => [...prev, { role: 'assistant', content: streamText + '\n\n*[Stopped by user]*' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      }
      setStreamText('')
    }
    finally { setStreaming(false); streamingRef.current = false }
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
        background: T.glass, backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur,
        borderRadius: 50, padding: welcome ? '7px 7px 7px 24px' : '4px 4px 4px 14px',
        border: `1.5px solid ${T.glassBorder}`,
        boxShadow: T.glassShadow,
        maxWidth: welcome ? 540 : (compact ? '100%' : 640),
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
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: welcome ? 15 : 15, color: 'rgba(255,255,255,0.85)', fontFamily: T.font, height: welcome ? 44 : 36, fontWeight: 300 }}
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
          {/* Voice CTA — teal equalizer */}
          {!voiceActive && (
            <button onClick={startVoice} title="Talk to Kiko" style={{
              width: sz, height: sz, borderRadius: 50, border: '1.5px solid rgba(6,214,160,0.15)',
              background: 'rgba(6,214,160,0.08)', color: 'rgba(6,214,160,0.7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(6,214,160,0.06)', transition: 'all 0.3s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(6,214,160,0.15)'; e.currentTarget.style.borderColor = 'rgba(6,214,160,0.25)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(6,214,160,0.08)'; e.currentTarget.style.borderColor = 'rgba(6,214,160,0.15)' }}
            >
              <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none">
                <rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(6,214,160,0.6)" />
                <rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(6,214,160,0.8)" />
                <rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(6,214,160,1)" />
                <rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(6,214,160,0.8)" />
                <rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(6,214,160,0.6)" />
              </svg>
            </button>
          )}
          </>
        )}
        {/* Send / Stop button */}
        {streaming ? (
          <button onClick={stopKiko} title="Stop Kiko" style={{
            width: welcome ? 42 : sz, height: welcome ? 42 : sz, borderRadius: 50,
            background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.15)',
            color: 'rgba(239,68,68,0.7)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0, marginLeft: 3,
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.15)' }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} />
          </button>
        ) : (
          <button onClick={() => handleSubmit()} disabled={!input.trim()} style={{
            width: welcome ? 42 : sz, height: welcome ? 42 : sz, borderRadius: 50,
            background: input.trim() ? T.accentGradient : 'rgba(255,255,255,0.04)',
            border: input.trim() ? 'none' : '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.9)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0, opacity: input.trim() ? 0.9 : 0.5,
            boxShadow: input.trim() ? '0 4px 16px rgba(139,108,246,0.3)' : 'none',
            marginLeft: 3,
          }}>
            <svg width={welcome ? 15 : 13} height={welcome ? 15 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        )}
      </div>
    )
  }

  // ── Render message bubbles (shared between text and voice) ──
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text.replace(/<[^>]+>/g, '')); }
  const editAndResend = (idx) => { setEditingIdx(idx); setEditText(messages[idx]?.content || ''); }
  const stopKiko = () => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setStreaming(false); setToolStatus(null) } }
  const regenerateResponse = (idx) => {
    // Find the user message before this kiko message
    const userIdx = messages.slice(0, idx).findLastIndex(m => m.role === 'user')
    if (userIdx >= 0) handleSubmit(messages[userIdx].content)
  }

  const renderMessages = (msgs, isVoice = false) => msgs.map((msg, i) => {
    const isUser = msg.role === 'user'
    const isKiko = isVoice ? msg.role === 'kiko' : msg.role === 'assistant'
    const isHovered = hoveredMsg === i
    return (
      <div key={i} style={{ marginBottom: 24, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 12, position: 'relative' }}
        onMouseEnter={() => setHoveredMsg(i)} onMouseLeave={() => setHoveredMsg(null)}>
        {isKiko && (
          <div style={{ width: 120, marginTop: 4, flexShrink: 0 }}>
            <DoubleHelix width={120} height={20} mini />
          </div>
        )}
        <div style={{
          maxWidth: isUser ? '65%' : '100%',
          padding: isUser ? '13px 20px' : '0',
          borderRadius: isUser ? '20px 20px 6px 20px' : 0,
          background: isUser ? T.userMsg : 'transparent',
          backdropFilter: isUser ? 'blur(40px)' : 'none',
          WebkitBackdropFilter: isUser ? 'blur(40px)' : 'none',
          border: isUser ? `1.5px solid ${T.userMsgBorder}` : 'none',
          color: isUser ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.88)',
          fontSize: 16, lineHeight: 1.85, fontFamily: T.font, fontWeight: isUser ? 400 : 400,
        }}>
          {isUser ? msg.content : (() => {
            // Strip ---DRAFT--- block from display text (rendered separately in DraftPreview)
            const displayText = msg.content.replace(/---DRAFT---[\s\S]*?---END DRAFT---/gi, '').trim()
            return displayText ? <span dangerouslySetInnerHTML={{ __html: md(displayText) }} /> : null
          })()}
          {/* Draft Preview Panel — renders below Kiko's message if a draft is detected */}
          {isKiko && !streaming && (() => {
            const draft = detectDraft(msg.content)
            if (!draft) return null
            return <DraftPreview draft={draft}
              onToneAdjust={(tone) => handleSubmit(`${tone} the draft you just wrote. Keep everything else the same.`)}
              onCopy={() => {}}
              onSendToGmail={() => handleSubmit(`Send the email draft you just wrote to Gmail. Use draft_email tool.`)} />
          })()}
        </div>
        {/* Action buttons — below message, Claude-style */}
        {isHovered && !streaming && (
          <div style={{ display: 'flex', gap: 2, marginTop: 4, paddingLeft: isUser ? 0 : 48, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {(() => {
              const abtn = (onClick, title, children) => (
                <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', transition: 'all 0.15s', padding: 0 }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
                >{children}</button>
              )
              const iconSz = { width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
              const CopyIcon = <svg {...iconSz} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              const ThumbUpIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
              const ThumbDownIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
              const RetryIcon = <svg {...iconSz} viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
              const EditIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              return <>
                {abtn(() => copyToClipboard(msg.content), 'Copy', CopyIcon)}
                {isKiko && abtn(() => {}, 'Good response', ThumbUpIcon)}
                {isKiko && abtn(() => {}, 'Bad response', ThumbDownIcon)}
                {isKiko && abtn(() => regenerateResponse(i), 'Retry', RetryIcon)}
                {isUser && abtn(() => editAndResend(i), 'Edit', EditIcon)}
              </>
            })()}
          </div>
        )}
      </div>
    )
  })

  // ── WELCOME STATE (no text messages, not in voice mode) ──
  if (!hasMessages && !compact) {
    return (
      <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
        {chatDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(26,26,26,0.3)', borderRadius: 18, margin: 8, pointerEvents: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.textSecondary} strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 500, color: T.text, fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
            <p style={{ fontSize: 13, color: T.textTertiary, fontFamily: T.font, margin: 0 }}>PDF, images, spreadsheets, text files</p>
          </div>
        )}

        {/* Center content */}
        <div id="kikoHomeContent" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', transition: trans, overflow: 'auto', minHeight: 0, padding: '0 24px 20px' }}>

          {/* Top spacer — pushes avatar to visual centre */}
          <div style={{ flex: voiceActive ? 1 : 0.8, transition: 'flex 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />

          {/* Wave — always visible, scales up in voice mode */}
          <div id="kikoWaveHome" style={{
            width: '90%', maxWidth: 900, marginBottom: voiceActive ? 0 : 28, overflow: 'visible', padding: '16px 0',
            cursor: voiceActive ? 'default' : 'pointer',
            transform: voiceActive ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
            maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          }}
            onMouseEnter={e => { if (!voiceActive) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => { if (!voiceActive) e.currentTarget.style.transform = 'scale(1)' }}>
            <DoubleHelix width={900} height={100} speaking={voiceActive && voiceState.speaking} energy={voiceState.energy || 0} pitch={voiceState.pitch || 0} onClick={voiceActive ? undefined : () => startVoice()} />
          </div>

          {/* Voice controls — visible only in voice mode */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            opacity: voiceActive ? 1 : 0, maxHeight: voiceActive ? 200 : 0,
            transform: voiceActive ? 'translateY(0)' : 'translateY(-20px)',
            transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
            overflow: 'hidden', pointerEvents: voiceActive ? 'auto' : 'none',
          }}>
            {/* Status bar — amber connecting, green live, red error */}
            <div style={{ width: 280, height: 3, borderRadius: 50, overflow: 'hidden', opacity: voiceState.speaking ? 0 : 1, transition: 'opacity 0.5s' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 50, background: voiceState.status === 'error' ? 'linear-gradient(90deg, transparent, rgba(255,80,80,0.5), transparent)' : voiceState.status === 'connecting' ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' : 'linear-gradient(90deg, transparent, rgba(6,214,160,0.5), transparent)', animation: 'kikoListenPulse 2s ease-in-out infinite' }} />
            </div>
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 300, fontFamily: T.font, color: voiceState.status === 'error' ? 'rgba(255,80,80,0.4)' : voiceState.status === 'connecting' ? 'rgba(245,158,11,0.3)' : voiceState.speaking ? 'rgba(139,108,246,0.25)' : 'rgba(255,255,255,0.12)', transition: 'color 0.3s' }}>
              {voiceState.status === 'error' ? 'Connection failed' : voiceState.status === 'connecting' ? 'Connecting...' : voiceState.speaking ? 'Kiko is speaking...' : 'Listening...'}
            </div>
            <button onClick={stopVoice} style={{
              marginTop: 24, padding: '10px 28px', borderRadius: 50,
              background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)',
              fontSize: 13, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontFamily: T.font,
              fontWeight: 300, transition: 'all 0.3s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,80,80,0.15)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
            >Goodbye Kiko</button>
          </div>

          {/* Greeting — slides down and fades in voice mode */}
          <div id="kikoGreeting" style={{
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 100,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1)',
            overflow: 'hidden',
          }}>
            <h1 style={{ fontSize: 25, fontWeight: 200, color: 'rgba(255,255,255,0.95)', margin: '0 0 4px', fontFamily: T.font, letterSpacing: '-0.03em', textAlign: 'center' }}>
              {getGreeting()}, {firstName}
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', margin: '0 0 18px', fontFamily: T.font, fontWeight: 300, textAlign: 'center' }}>What would you like to work on?</p>
          </div>

          {/* Prompt bar — slides down in voice mode */}
          <div id="kikoPromptWrap" style={{
            width: '100%', maxWidth: 540, marginBottom: 14,
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 100,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.05s',
            overflow: 'hidden', pointerEvents: voiceActive ? 'none' : 'auto',
          }}>
                <PromptBar welcome />
                {dictateError && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,80,80,0.7)', fontFamily: T.font, margin: '8px 0 0', animation: 'fadeIn 0.2s' }}>{dictateError}</p>
                )}
              </div>

              {/* 4 chips only — below prompt bar */}
              <div id="kikoChipsWrap" style={{
                display: 'flex', gap: 8, justifyContent: 'center', maxWidth: 540, marginBottom: voiceActive ? 0 : 20,
                opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 60,
                transform: voiceActive ? 'translateY(30px)' : 'translateY(0)',
                transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.1s',
                overflow: 'hidden', pointerEvents: voiceActive ? 'none' : 'auto',
              }}>
                {CHIPS.map(c => (
                  <button key={c} onClick={() => handleSubmit(c)} style={{
                    padding: '11px 26px', borderRadius: 50, background: T.glass,
                    backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur,
                    border: `1.5px solid ${T.glassBorder}`, color: 'rgba(255,255,255,0.55)',
                    fontSize: 13, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.2s', fontWeight: 400,
                    boxShadow: T.glassShadow,
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = T.glassShadowHover }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = T.glassBorder; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.background = T.glass; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = T.glassShadow }}
                  >{c}</button>
                ))}
              </div>

          {/* Urgent alerts only — dismissible */}
          {!voiceActive && <KikoInsights onAction={(text) => handleSubmit(text)} />}

          {/* Bottom spacer */}
          <div style={{ flex: voiceActive ? 1 : 0.3, transition: 'flex 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />
        </div>

        {/* Headless KikoVoice — runs WebRTC connection when active */}
        {voiceActive && <KikoVoice headless onClose={stopVoice} user={user} micStream={voiceMicStream} onVoiceState={handleVoiceState} onVoiceMessage={handleVoiceMessage} />}

        {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} />}
      </div>
    )
  }

  // ── CONVERSATION STATE (text messages) ──
  return (
    <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {chatDragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(26,26,26,0.3)', borderRadius: 18, margin: 8, pointerEvents: 'none' }}>
          <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.textSecondary} strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: T.text, fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 13, color: T.textTertiary, fontFamily: T.font, margin: 0 }}>PDF, images, spreadsheets, text files</p>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : 24 }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto', width: '100%' }}>
          {renderMessages(messages)}
          {/* Thinking indicator — prominent pulsing orb */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 24, display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'radial-gradient(circle, rgba(139,108,246,0.5) 0%, rgba(0,212,170,0.3) 60%, transparent 100%)',
                boxShadow: '0 0 24px rgba(139,108,246,0.4), 0 0 48px rgba(0,212,170,0.15), inset 0 0 12px rgba(139,108,246,0.3)',
                animation: 'kikoThink 1.5s ease-in-out infinite',
              }} />
              <div style={{ flex: 1, maxWidth: 400 }}>
                <div style={{
                  padding: '14px 18px', borderRadius: 16,
                  background: 'rgba(139,108,246,0.06)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                  border: '1.5px solid rgba(139,108,246,0.15)',
                  boxShadow: '0 0 20px rgba(139,108,246,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, color: 'rgba(139,108,246,0.8)', fontFamily: T.font, fontWeight: 400, flex: 1 }}>
                      {toolStatus || 'Kiko is thinking...'}
                    </span>
                    <button onClick={stopKiko} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, flexShrink: 0 }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                    >Stop</button>
                  </div>
                </div>
                {thinkingSteps.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <button onClick={() => setShowSteps(!showSteps)} style={{ fontSize: 12, color: 'rgba(139,108,246,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, padding: '2px 0' }}>
                      {showSteps ? 'Hide process' : `Show process (${thinkingSteps.length} steps)`}
                    </button>
                    {showSteps && (
                      <div style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(139,108,246,0.03)', border: `1px solid rgba(139,108,246,0.08)`, marginTop: 4 }}>
                        {thinkingSteps.map((step, si) => {
                          const isLast = si === thinkingSteps.length - 1
                          return (
                            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, color: T.textTertiary, fontFamily: T.font, fontWeight: 300 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isLast ? 'rgba(139,108,246,0.7)' : 'rgba(0,212,170,0.5)', animation: isLast ? 'pulse 1s infinite' : 'none' }} />
                              <span style={{ color: isLast ? 'rgba(139,108,246,0.7)' : T.textTertiary }}>{step.label}</span>
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
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, fontFamily: T.font, fontWeight: 300 }}>
                  <span dangerouslySetInnerHTML={{ __html: md(streamText) }} />
                  <span style={{ animation: 'pulse 1s infinite', marginLeft: 2, color: 'rgba(139,108,246,0.4)' }}>|</span>
                </div>
                <button onClick={stopKiko} style={{ marginTop: 6, padding: '5px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: T.font }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
                >&#9632; Stop generating</button>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
      <div style={{ padding: compact ? 12 : 16, borderTop: `1.5px solid ${T.border}` }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto' }}>
          <PromptBar />
          {dictateError && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#C62828', fontFamily: T.font, margin: '6px 0 0' }}>{dictateError}</p>
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.12)', fontFamily: T.font, margin: '8px 0 0', fontWeight: 300 }}>Kiko is AI and can make mistakes. Please double-check responses.</p>
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
