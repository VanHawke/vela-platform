import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'dompurify'
import T from '@/lib/theme'
import taskManager from '@/lib/kikoTaskManager'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import AllChatsView from './AllChatsView'
import KikoSymbol from './KikoSymbol'
import KikoWaveform from './KikoWaveform'
// DraftPreview disabled — EmailDraft handles all email drafts
import KikoInsights, { InsightsBadge } from './KikoInsights'
import EmailDraft, { isEmailDraft, extractEmailSection } from './EmailDraft'
import { useDynamicChips } from '@/hooks/useDynamicChips'

// Theme imported from @/lib/theme.js

const mdCache = new Map()
function stripToolXml(t) {
  if (!t) return ''
  return t
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<tool_call>[\s\S]*/gi, '')
    .replace(/<tool_name>[\s\S]*?<\/tool_name>/gi, '')
    .replace(/<tool_name>[\s\S]*/gi, '')
    .replace(/<tool_parameters>[\s\S]*?<\/tool_parameters>/gi, '')
    .replace(/<tool_parameters>[\s\S]*/gi, '')
    .replace(/<\/?tool_function_result>/gi, '')
    .replace(/<ask_\w+>[\s\S]*?<\/ask_\w+>/gi, '')
    .replace(/<ask_\w+>[\s\S]*/gi, '')
    .replace(/<\/?ask_\w+>/gi, '')
    .replace(/<[a-z_]+>[\s\S]*?<\/[a-z_]+>/gi, function(m) {
      // Only strip if it looks like an XML tool tag (lowercase with underscores), not HTML
      if (m.match(/^<(tool|ask|draft|search|lookup|agent|function|intent)/i)) return ''
      return m
    })
    .trim()
}
function md(text) {
  if (!text) return ''
  if (mdCache.has(text)) return mdCache.get(text)
  let h = text
    // Fix missing spaces after periods (sentences running together)
    .replace(/\.([A-Z])/g, '. $1')
    .replace(/\:([A-Z])/g, ': $1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Supabase generated-files image → inline preview
    .replace(/\[View\/Download\]\((https:\/\/[^\s)]*generated-files[^\s)]*\.png[^\s)]*)\)/g, '<div style="margin:8px 0"><a href="$1" target="_blank" rel="noopener"><img src="$1" style="max-width:100%;max-height:360px;border-radius:12px;border:0.5px solid rgba(255,224,194,0.06);box-shadow:0 4px 16px rgba(0,0,0,0.3)" /></a></div>')
    // Supabase generated-files links → download buttons
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]*generated-files[^\s)]*)\)/g, '<a href="$2" target="_blank" download="$1" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;margin:6px 0;background:rgba(255,224,194,0.06);border:1px solid rgba(255,224,194,0.15);color:rgba(255,224,194,0.8);font-size:13px;font-weight:400;text-decoration:none">📄 $1 <span style="font-size:11px">↓</span></a>')
    // Regular markdown links
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:rgba(255,224,194,0.7);text-decoration:none;border-bottom:1px solid rgba(255,224,194,0.2)">$1</a>')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,224,194,0.05);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0;border:0.5px solid rgba(32,30,24,0.50)"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,224,194,0.05);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(238,238,238,0.85);font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-\u2013\u2022] (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$2</li>')
    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:500;color:rgba(238,238,238,0.85);margin:16px 0 8px">$1</div>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:0.5px solid rgba(32,30,24,0.50);margin:16px 0"/>')
    .replace(/\n/g, '<br/>')
  // Split thinking text from response BEFORE collapsing
  const plainText = h.replace(/<[^>]+>/g, '')
  const thinkCount = (plainText.match(/(?:I'll |Let me |Now let me |I need to |I see |I found |Looking |Searching |Now I'll |Perfect!|I'm going to )/gi) || []).length
  if (thinkCount >= 2) {
    const markers = [/Here(&.+?;|')s /, /I(&.+?;|')ve drafted/, /I(&.+?;|')ve created/, /Email Draft/, /EMAIL DRAFT/, /Subject\s*:/, /SUGGESTED DRAFT/, /STRATEGIC/, /ANALYSIS/, /RECOMMENDATION/, /###\s/, /##\s/]
    let splitIdx = -1
    for (const m of markers) { const idx = h.search(m); if (idx > 30) { splitIdx = idx; break } }
    if (splitIdx > 0) {
      const thinkHtml = h.slice(0, splitIdx).trim()
      const respHtml = h.slice(splitIdx).trim()
      const steps = (thinkHtml.replace(/<[^>]+>/g, '').match(/(?:Let me|Now let|I'll|I need|Checking|Searching|Looking|I found|I see)/gi) || []).length
      h = `<details style="margin:0 0 8px;cursor:pointer"><summary style="font-size:12px;color:rgba(238,238,238,0.35);font-weight:500;padding:8px 0;list-style:none;display:flex;align-items:center;gap:8px"><span style="display:inline-flex;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,224,194,0.12);font-size:10px;align-items:center;justify-content:center;flex-shrink:0;color:rgba(255,224,194,0.25)">›</span><span style="color:rgba(255,224,194,0.5)">Kiko's reasoning</span> <span style="color:rgba(238,238,238,0.25)">· ${steps} steps</span></summary><div style="font-size:13px;color:rgba(238,238,238,0.35);padding:8px 12px;line-height:1.7;border-left:2px solid rgba(255,224,194,0.08);margin:4px 0 8px 7px;background:rgba(25,25,25,0.30);border-radius:0 6px 6px 0">${thinkHtml}</div></details>${respHtml}`
    }
  }
  const result = DOMPurify.sanitize(h, { ADD_TAGS: ['details', 'summary'] })
  if (text.length < 50000) { mdCache.set(text, result); if (mdCache.size > 200) mdCache.delete(mdCache.keys().next().value) }
  return result
}

function getGreeting() {
  const h = new Date().getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

// Chips are now dynamic — see useDynamicChips hook

// Kiko 4-dot symbol (asymmetric diamond) with optional staggered animation
const KikoDots = ({ size = 40, color = 'rgba(255,224,194,0.04)', animated = false }) => {
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
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(255,224,194,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.06}s infinite` }} />
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
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(255,224,194,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.07}s infinite` }} />
      ))}
    </div>
  )
}

export default function KikoChat({ user, compact = false, initialMessage = '' }) {
  const navigate = useNavigate()
  const outletCtx = useOutletContext() || {}
  const dynamicChips = useDynamicChips('home', false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialMessage)
  const [typewriterText, setTypewriterText] = useState('')
  const typewriterDone = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editText, setEditText] = useState('')
  const editingIdxRef = useRef(null)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [showSteps, setShowSteps] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  // Poll alert count from KikoInsights
  useEffect(() => {
    const iv = setInterval(() => { if (window.__kikoAlertCount !== undefined) setAlertCount(window.__kikoAlertCount) }, 2000)
    return () => clearInterval(iv)
  }, [])
  const toggleHistory = (val) => {
    const next = typeof val === 'boolean' ? val : !historyOpen
    setHistoryOpen(next)
    window.dispatchEvent(new CustomEvent('kiko_history_state', { detail: { open: next } }))
  }
  const [activeConvId, setActiveConvId] = useState(null)
  const [convTitle, setConvTitle] = useState('')
  const [titleMenuOpen, setTitleMenuOpen] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [dictateError, setDictateError] = useState('')
  const scrollRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const transcribeRef = useRef({ media: null, recorder: null, sr: null, active: false, baseInput: '', committed: '' })
  const composingRef = useRef(false) // Track IME/macOS dictation composition
  const dragCounterRef = useRef(0)
  const [chatDragOver, setChatDragOver] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState(null) // { url, name, file }
  const [pendingAttachment, setPendingAttachment] = useState(null) // { type, mediaType, data, previewUrl, name }
  const [allChatsData, setAllChatsData] = useState(null) // { convos, onSelect, onDelete }
  const [showAllMsgs, setShowAllMsgs] = useState(false)
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
    if (editingIdx !== null) {
      editingIdxRef.current = editingIdx
      setInput(editText)
      inputRef.current?.focus()
      setEditingIdx(null)
    }
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
        sr.continuous = false  // Single phrase — avoids duplicate restarts
        sr.interimResults = true  // Show live transcription as user speaks
        sr.lang = 'en-US'
        transcribeRef.current.sr = sr
        transcribeRef.current.active = true
        transcribeRef.current.baseInput = input
        transcribeRef.current.committed = ''  // All committed final text
        setTranscribing(true)
        sr.onresult = (e) => {
          let interim = ''
          let newFinal = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = e.results[i][0].transcript.trim()
            if (e.results[i].isFinal) {
              newFinal += (newFinal ? ' ' : '') + text
            } else {
              interim = text
            }
          }
          if (newFinal) transcribeRef.current.committed += (transcribeRef.current.committed ? ' ' : '') + newFinal
          const base = transcribeRef.current.baseInput
          const committed = transcribeRef.current.committed
          const display = (base ? base + ' ' : '') + committed + (interim ? ' ' + interim : '')
          setInput(display.trim())
        }
        sr.onerror = (e) => {
          console.error('[Dictate] error:', e.error)
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            setDictateError('Mic access denied — check browser permissions')
            setTranscribing(false)
            transcribeRef.current.active = false
          } else if (e.error === 'no-speech') {
            // Ignore no-speech, it auto-restarts
          } else if (e.error === 'network' || e.error === 'aborted') {
            // Suppress transient errors — silently retry
            console.warn('[Dictate] transient error:', e.error)
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
    justLoadedRef.current = true
    setMessages(conv.messages.map(m => ({ role: m.role, content: m.content })))
    setActiveConvId(conv.id); setStreamText(''); setStreaming(false); setShowAllMsgs(false)
  }
  const startNewChat = () => {
    setMessages([]); setActiveConvId(null); setStreamText(''); setStreaming(false); setInput('')
    setVoiceActive(false); setVoiceMessages([])
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
    inputRef.current?.focus()
  }

  useEffect(() => { if (initialMessage && !messages.length) handleSubmit(initialMessage) }, [])
  const justLoadedRef = useRef(false)
  useEffect(() => {
    if (justLoadedRef.current) {
      // Instant scroll on conversation load — no animation
      scrollRef.current?.scrollIntoView({ behavior: 'instant' })
      justLoadedRef.current = false
    } else {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamText, voiceMessages])

  // Load conversation title when activeConvId changes
  useEffect(() => {
    if (!activeConvId) { setConvTitle(''); setIsStarred(false); return }
    (async () => {
      const { data } = await supabase.from('conversations').select('title, starred').eq('id', activeConvId).single()
      if (data) { setConvTitle(data.title || 'New conversation'); setIsStarred(!!data.starred) }
    })()
  }, [activeConvId])

  // Typewriter placeholder — runs once per view
  useEffect(() => {
    if (typewriterDone.current) return
    typewriterDone.current = true
    const phrase = 'Ask me anything....'
    let i = 0
    const timer = setInterval(() => {
      i++
      setTypewriterText(phrase.slice(0, i))
      if (i >= phrase.length) clearInterval(timer)
    }, 70)
    return () => clearInterval(timer)
  }, [])

  const toggleStar = async () => {
    if (!activeConvId) return
    const newVal = !isStarred
    setIsStarred(newVal)
    await supabase.from('conversations').update({ starred: newVal }).eq('id', activeConvId)
    setTitleMenuOpen(false)
  }
  const startRename = () => { setRenameValue(convTitle); setIsRenaming(true); setTitleMenuOpen(false) }
  const confirmRename = async () => {
    if (!activeConvId || !renameValue.trim()) return
    setConvTitle(renameValue.trim())
    setIsRenaming(false)
    await supabase.from('conversations').update({ title: renameValue.trim() }).eq('id', activeConvId)
  }
  const deleteConversation = async () => {
    if (!activeConvId) return
    await supabase.from('conversations').delete().eq('id', activeConvId)
    setActiveConvId(null); setConvTitle(''); setMessages([]); setTitleMenuOpen(false)
  }

  // Close title menu on click outside
  useEffect(() => {
    if (!titleMenuOpen) return
    const handler = () => setTitleMenuOpen(false)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [titleMenuOpen])

  const resetKey = outletCtx.kikoResetKey
  useEffect(() => { if (resetKey > 0) startNewChat() }, [resetKey])

  // Auto-resize handled by CSS field-sizing: content

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

  const handleSubmit = useCallback(async (text, fileAttachments = [], hiddenContext = '') => {
    const msg = (text || input).trim()
    // Include pending attachment if present
    const allAttachments = [...fileAttachments]
    if (pendingAttachment) allAttachments.push(pendingAttachment)
    if ((!msg && !allAttachments.length) || streaming) return
    // Stop dictation on submit
    if (transcribing) { transcribeRef.current.active = false; if (transcribeRef.current.sr) { try { transcribeRef.current.sr.stop() } catch {} transcribeRef.current.sr = null }; setTranscribing(false) }
    const effectiveMsg = msg || (allAttachments.length ? `Analyse this file: "${allAttachments[0].name || 'uploaded file'}"` : '')
    setInput('')
    setPendingAttachment(null)
    const displayMsg = effectiveMsg
    const apiMsg = hiddenContext ? effectiveMsg + '\n\n' + hiddenContext : effectiveMsg
    const imgPreview = allAttachments.find(a => a.type === 'image' && a.previewUrl)?.previewUrl || null
    const userMsg = { role: 'user', content: displayMsg, timestamp: Date.now(), imagePreview: imgPreview }
    if (imgPreview) setImagePreview(null)
    // If editing a previous message, truncate conversation at that point
    if (editingIdxRef.current !== null) {
      const editIdx = editingIdxRef.current
      editingIdxRef.current = null
      setMessages(prev => [...prev.slice(0, editIdx), userMsg])
    } else {
      setMessages(prev => [...prev, userMsg])
    }
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
          message: apiMsg, userEmail: user?.email,
          attachments: allAttachments,
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
            if (j.thinking) { setThinkingSteps(prev => prev.some(s => s.label === 'Reasoning...') ? prev : [...prev, { label: 'Reasoning...', time: Date.now() }]) }
            if (j.toolStatus !== undefined) { setToolStatus(j.toolStatus); if (j.toolStatus && j.toolStatus !== 'Connecting...' && j.toolStatus !== 'Composing response...') setThinkingSteps(prev => prev.some(s => s.label === j.toolStatus) ? prev : [...prev, { label: j.toolStatus, time: Date.now() }]) }
            if (j.navigate) pendingNav = j.navigate
          } catch {}
        }
      }
      const kikoMsg = { role: 'assistant', content: full, timestamp: Date.now(), steps: thinkingSteps.length > 0 ? [...thinkingSteps] : undefined }
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
  }, [input, streaming, messages, user, activeConvId, pendingAttachment])

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
        handleSubmit(`📎 Uploaded: "${file.name}" (${(text.length/1000).toFixed(0)}K chars). Analyse this file.`, [], `[FILE CONTENTS — "${file.name}"]\n\n${text.slice(0, 50000)}\n\n[END OF FILE]\n\nAnalyse this.`)
      } else {
        // Binary files: convert to base64
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result.split(',')[1])
          r.onerror = () => rej(new Error('Failed to read file'))
          r.readAsDataURL(file)
        })
        if (isImage) {
          // Store as pending — let user add a comment before submitting
          const previewUrl = URL.createObjectURL(file)
          setImagePreview({ url: previewUrl, name: file.name })
          setPendingAttachment({ type: 'image', mediaType: file.type, data: base64, previewUrl, name: file.name })
          setFileUploading(false)
          return // Don't auto-submit
        } else {
          // Document files: extract text server-side then send to Kiko
          const isDocument = file.name.match(/\.(docx?|xlsx?|xlsm|pptx?|pdf)$/i)
          if (isDocument) {
            if (file.size > 15 * 1024 * 1024) {
              handleSubmit(`File "${file.name}" is too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum is 15MB.`)
              return
            }
            try {
              let extractBody;
              // Large files (> 3MB base64 ~ 2MB file): upload to Supabase Storage first to avoid Vercel 413
              if (base64.length > 3_000_000) {
                const tmpPath = `tmp/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
                const { error: upErr } = await supabase.storage.from('vela-assets').upload(tmpPath, file)
                if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
                extractBody = JSON.stringify({ filename: file.name, storagePath: tmpPath })
              } else {
                extractBody = JSON.stringify({ filename: file.name, data: base64 })
              }
              const res = await fetch('/api/file-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: extractBody
              })
              const result = await res.json()
              if (!res.ok) throw new Error(result.error || 'Extraction failed')
              const meta = result.metadata || {}
              const displayText = `📎 Uploaded: "${file.name}" (${meta.type}${meta.pages ? `, ${meta.pages} pages` : ''}, ${(result.text.length/1000).toFixed(0)}K chars). Analyse this document.`
              const context = `[DOCUMENT CONTENTS — "${file.name}"]\n\n${result.text}\n\n[END OF DOCUMENT]\n\nAnalyse this document thoroughly.`
              handleSubmit(displayText, [], context)
            } catch (extractErr) {
              handleSubmit(`I uploaded "${file.name}" but extraction failed: ${extractErr.message}. Please try again or use a different format.`)
            }
          } else {
            handleSubmit(`I've uploaded "${file.name}" (${file.type}, ${(file.size/1024).toFixed(0)}KB). This file type isn't supported yet. Try PDF, Word, Excel, PowerPoint, images, or text files.`)
          }
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

  // Safety: auto-dismiss drag overlay after 4s (catches stuck state from missed events)
  useEffect(() => {
    if (!chatDragOver) return
    const timer = setTimeout(() => { dragCounterRef.current = 0; setChatDragOver(false) }, 4000)
    const dismissOnDrop = () => { dragCounterRef.current = 0; setChatDragOver(false) }
    window.addEventListener('drop', dismissOnDrop)
    window.addEventListener('dragend', dismissOnDrop)
    return () => { clearTimeout(timer); window.removeEventListener('drop', dismissOnDrop); window.removeEventListener('dragend', dismissOnDrop) }
  }, [chatDragOver])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const trans = 'all 0.6s cubic-bezier(0.4,0,0.2,1)'

  // ── Prompt bar (shared) — rewritten to match approved mockup ──
  const PromptBar = ({ welcome = false }) => {
    const ic = 15
    const hasContent = input.trim() || pendingAttachment
    const [promptFocused, setPromptFocused] = useState(false)
    const [mousePos, setMousePos] = useState({ x: 50, y: 50 })
    const barRef = useRef(null)
    const throttleRef = useRef(null)
    const handleBarMouseMove = useCallback((e) => {
      if (!barRef.current || throttleRef.current) return
      throttleRef.current = setTimeout(() => {
        const rect = barRef.current?.getBoundingClientRect()
        if (rect) setMousePos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 })
        throttleRef.current = null
      }, 40)
    }, [])
    return (
      <div ref={barRef} onMouseMove={handleBarMouseMove} style={{
        display: 'flex', flexDirection: 'column',
        background: 'rgba(25,25,25,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 24,
        padding: welcome ? '12px 14px 8px' : '12px 14px 8px',
        position: 'relative',
        border: `1px solid ${promptFocused ? 'rgba(255,224,194,0.2)' : transcribing ? 'rgba(34,197,94,0.2)' : T.border}`,
        boxShadow: promptFocused
          ? `0 0 0 1px rgba(255,224,194,0.1), 0 0 20px rgba(255,224,194,0.06), ${T.shadow2}`
          : T.shadow1,
        transition: `all 400ms ${T.spring}`,
        maxWidth: welcome ? 680 : (compact ? '100%' : 680),
        width: '100%', margin: '0 auto',
        overflow: 'visible',
      }}>
        {/* Peach cursor-following glow */}
        {promptFocused && <div style={{ position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none', background: `radial-gradient(circle 140px at ${mousePos.x}% ${mousePos.y}%, rgba(255,224,194,0.06) 0%, transparent 70%)`, transition: `opacity 300ms ${T.ease}`, opacity: 1, zIndex: 0 }} />}
        {/* Shimmer edge on focus */}
        {promptFocused && <div style={{ position: 'absolute', inset: -1, borderRadius: 25, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent 0%, rgba(255,224,194,0.08) 25%, rgba(255,224,194,0.12) 50%, rgba(255,224,194,0.08) 75%, transparent 100%)', backgroundSize: '200% 100%', animation: 'glowShimmer 3s linear infinite', opacity: 0.6, zIndex: 0 }} />}
        {/* Pending image preview */}
        {pendingAttachment?.previewUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 10px', marginBottom: 8, borderBottom: '0.5px solid rgba(255,224,194,0.06)' }}>
            <img src={pendingAttachment.previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.4)', fontFamily: T.font, flex: 1 }}>{pendingAttachment.name}</span>
            <button onClick={() => { setPendingAttachment(null); setImagePreview(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(238,238,238,0.3)', padding: 4, fontSize: 14, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>✕</button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) processFileForKiko(f); e.target.value = '' }} style={{ display: 'none' }} />

        {welcome ? (
        /* ── HOMEPAGE: Single row [attach] [textarea] [mic] [EQ] [send] ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 2 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: T.accentSoft, border: `1px solid ${T.border}`, color: T.dimText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.input; e.currentTarget.style.color = '#b4b4b4'; e.currentTarget.style.boxShadow = T.liquidBtnHover }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.dimText; e.currentTarget.style.boxShadow = T.liquidBtnShadow }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <textarea ref={inputRef} value={input} dir="ltr" onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              onFocus={() => setPromptFocused(true)} onBlur={() => setTimeout(() => setPromptFocused(false), 150)}
              placeholder="" autoFocus rows={1}
              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: 'rgba(238,238,238,0.85)', fontFamily: T.font, minHeight: 24, maxHeight: 200, fontWeight: 400, resize: 'none', lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', verticalAlign: 'middle', display: 'block', position: 'relative', zIndex: 2 }} />
            {!input && !fileUploading && !pendingAttachment && typewriterText && (
              <div style={{ position: 'absolute', top: 4, left: 0, fontSize: 15, color: 'rgba(238,238,238,0.25)', fontFamily: T.font, fontWeight: 400, pointerEvents: 'none', lineHeight: '24px' }}>
                {typewriterText}<span style={{ opacity: typewriterText.length < 19 ? 1 : 0, animation: typewriterText.length < 19 ? 'kikoBreathe 0.6s step-end infinite' : 'none' }}>|</span>
              </div>
            )}
          </div>
          {voiceActive ? (
            <button onClick={stopVoice} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (<>
            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(255,224,194,0.12)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : T.glass, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : T.ghostText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
              onMouseEnter={e => { if (!transcribing) { e.currentTarget.style.boxShadow = T.liquidBtnHover; e.currentTarget.style.color = '#b4b4b4' }}}
              onMouseLeave={e => { if (!transcribing) { e.currentTarget.style.boxShadow = T.liquidBtnShadow; e.currentTarget.style.color = T.ghostText }}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </button>
            <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(255,224,194,0.12)', background: T.primarySoft, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(255,224,194,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = T.liquidBtnHover; e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = T.liquidBtnShadow; e.currentTarget.style.transform = 'scale(1)' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(255,224,194,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(255,224,194,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(255,224,194,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(255,224,194,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(255,224,194,0.6)" /></svg>
            </button>
          </>)}
          {streaming ? (
            <button onClick={stopKiko} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: T.liquidBtnShadow }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (
            <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: 30, height: 30, borderRadius: 9999, background: hasContent ? T.accentGradient : T.glass, border: hasContent ? 'none' : `1px solid ${T.border}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(238,238,238,0.95)', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hasContent ? 1 : 0.25, boxShadow: hasContent ? `0 4px 16px rgba(255,224,194,0.3)` : T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
        </div>
        ) : (
        /* ── CONVERSATION: Two-row layout — textarea top, icons bottom ── */
        <>
        <textarea ref={inputRef} value={input} dir="ltr" onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          onFocus={() => setPromptFocused(true)} onBlur={() => setTimeout(() => setPromptFocused(false), 150)}
          placeholder={fileUploading ? "Processing file..." : pendingAttachment ? "Add a comment..." : "Ask me anything...."}
          autoFocus rows={1}
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: 'rgba(238,238,238,0.85)', fontFamily: T.font, minHeight: 44, maxHeight: 300, fontWeight: 400, resize: 'none', lineHeight: '1.5', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', position: 'relative', zIndex: 2 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: T.accentSoft, border: `1px solid ${T.border}`, color: T.dimText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.input; e.currentTarget.style.color = '#b4b4b4'; e.currentTarget.style.boxShadow = T.liquidBtnHover }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.dimText; e.currentTarget.style.boxShadow = T.liquidBtnShadow }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {voiceActive ? (
              <button onClick={stopVoice} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
            ) : (<>
              <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(255,224,194,0.12)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : T.glass, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : T.ghostText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
                onMouseEnter={e => { if (!transcribing) { e.currentTarget.style.boxShadow = T.liquidBtnHover; e.currentTarget.style.color = '#b4b4b4' }}}
                onMouseLeave={e => { if (!transcribing) { e.currentTarget.style.boxShadow = T.liquidBtnShadow; e.currentTarget.style.color = T.ghostText }}}>
                <svg width={ic + 1} height={ic + 1} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                {transcribing && <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: 'rgba(34,197,94,0.9)' }} />}
              </button>
              <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(255,224,194,0.12)', background: T.primarySoft, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(255,224,194,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = T.liquidBtnHover; e.currentTarget.style.transform = 'scale(1.05)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = T.liquidBtnShadow; e.currentTarget.style.transform = 'scale(1)' }}>
                <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(255,224,194,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(255,224,194,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(255,224,194,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(255,224,194,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(255,224,194,0.6)" /></svg>
              </button>
            </>)}
            {streaming ? (
              <button onClick={stopKiko} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: T.liquidBtnShadow }}><div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
            ) : (
              <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: 30, height: 30, borderRadius: 9999, background: hasContent ? T.accentGradient : T.glass, border: hasContent ? 'none' : `1px solid ${T.border}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(238,238,238,0.95)', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hasContent ? 1 : 0.25, boxShadow: hasContent ? '0 4px 16px rgba(255,224,194,0.3)' : T.liquidBtnShadow, transition: `all 250ms ${T.spring}` }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            )}
          </div>
        </div>
        </>
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
      <div key={i} style={{ marginBottom: 24, position: 'relative' }}
        onMouseEnter={() => setHoveredMsg(i)} onMouseLeave={() => setHoveredMsg(null)}>
        {/* Kiko label for assistant messages */}
        {isKiko && <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,224,194,0.55)', fontFamily: T.font, marginBottom: 6 }}>Kiko</div>}
        {/* Collapsible reasoning steps on completed messages */}
        {isKiko && msg.steps?.length > 0 && (() => {
          const isOpen = expandedSteps === i
          const completedCount = msg.steps.filter(s => !s.label?.includes('...')).length
          const totalCount = msg.steps.length
          return (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setExpandedSteps(isOpen ? null : i)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                fontSize: 12, color: 'rgba(255,224,194,0.55)', background: isOpen ? T.glass : 'rgba(255,224,194,0.03)',
                backdropFilter: isOpen ? 'blur(16px)' : 'none', WebkitBackdropFilter: isOpen ? 'blur(16px)' : 'none',
                border: `1px solid ${isOpen ? T.glassHover : 'rgba(255,224,194,0.08)'}`,
                borderRadius: isOpen ? '8px 8px 0 0' : 8,
                cursor: 'pointer', fontFamily: T.font, padding: '8px 12px', fontWeight: 500,
                boxShadow: isOpen ? T.glassShadow : 'none',
                transition: `all 250ms ${T.spring}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" style={{ transition: 'transform 0.3s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}><path d="M6 9l6 6 6-6"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.accent }}>Kiko's reasoning</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: T.dimText, fontWeight: 500 }}>{completedCount}/{totalCount} steps</span>
                  <div style={{ width: 48, height: 3, borderRadius: 9999, background: '#222222', overflow: 'hidden' }}>
                    <div style={{ width: `${(completedCount / totalCount) * 100}%`, height: '100%', borderRadius: 9999, background: T.accent, transition: `width 400ms ${T.spring}` }} />
                  </div>
                </div>
              </button>
              {isOpen && (
                <div style={{
                  background: T.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${T.glassHover}`, borderTop: 'none',
                  borderRadius: '0 0 8px 8px', padding: '6px 0', overflow: 'hidden',
                  boxShadow: T.glassShadow,
                }}>
                  <div style={{ padding: '0 6px' }}>
                    {msg.steps.map((step, si) => {
                      const isAgent = step.label?.includes('Agent') || step.label?.includes('agent')
                      return (
                        <div key={si} style={{ display: 'flex', gap: 10, padding: '5px 8px', borderRadius: 6 }}>
                          <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="5" fill={isAgent ? T.accent : 'rgba(255,224,194,0.4)'} opacity="0.8" />
                            </svg>
                            {si < msg.steps.length - 1 && <span style={{ flex: 1, width: 1, background: 'rgba(255,224,194,0.06)', marginTop: 3 }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.5)', fontFamily: T.font, fontWeight: 400, lineHeight: 1.5 }}>{step.label}</span>
                            {step.tools && <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                              {(Array.isArray(step.tools) ? step.tools : []).map((tool, ti) => (
                                <span key={ti} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,224,194,0.04)', border: '1px solid rgba(255,224,194,0.06)', color: T.dimText }}>{tool}</span>
                              ))}
                            </div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          maxWidth: isUser ? '65%' : '100%',
          padding: isUser ? '13px 20px' : '0',
          borderRadius: isUser ? '8px 8px 4px 8px' : 0,
          background: isUser ? 'rgba(255,224,194,0.04)' : 'transparent',
          border: isUser ? `0.5px solid ${T.border}` : 'none',
          color: isUser ? 'rgba(238,238,238,0.95)' : 'rgba(238,238,238,0.85)',
          fontSize: 15, lineHeight: 1.7, fontFamily: T.font, fontWeight: 400,
        }}>
          {isUser ? <>
            {msg.imagePreview && <img src={msg.imagePreview} alt="Upload" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 12, marginBottom: 8, display: 'block', objectFit: 'cover' }} />}
            {msg.content}
          </> : (() => {
            // Strip ---DRAFT--- block from display text (rendered separately in DraftPreview)
            let displayText = stripToolXml(msg.content.replace(/---DRAFT---[\s\S]*?---END DRAFT---/gi, ''))
            // Strip thinking text before email detection (same logic as md() thinking collapse)
            const thinkPhraseCount = (displayText.match(/(?:I'll |Let me |Now let me |I need to |I see |I found |Looking |Searching |Now I'll |Perfect!|I'm going to )/gi) || []).length
            let responseText = displayText
            if (thinkPhraseCount >= 2) {
              const respMarkers = [/Here(?:'|')s /, /I(?:'|')ve drafted/, /I(?:'|')ve created/, /Email Draft/, /EMAIL DRAFT/, /Subject\s*:/, /SUGGESTED DRAFT/, /STRATEGIC/, /ANALYSIS/, /RECOMMENDATION/, /###\s/, /##\s/]
              for (const m of respMarkers) { const idx = displayText.search(m); if (idx > 30) { responseText = displayText.slice(idx); break } }
            }
            if (isKiko && isEmailDraft(responseText)) {
              // Use full displayText for extraction so thinking text goes into pre (md() collapses it)
              const { pre, email } = extractEmailSection(displayText)
              const signoffEnd = email ? email.search(/\n\s*(\*\*Key positioning|\*\*Strategic|\*\*Next steps|\*\*Timing|##\s*TIMING|This targets|The email positions|I've framed|I recommend|\*\*Analysis|\*\*My recommendation|I'd push back)/i) : -1
              const postEmail = signoffEnd > 20 ? email.slice(signoffEnd).trim() : ''
              const emailOnly = signoffEnd > 20 ? email.slice(0, signoffEnd).trim() : email
              // Only render EmailDraft if the parsed email has actual body content
              const testParse = emailOnly ? (() => { try { const m = emailOnly.match(/\*?\*?Subject\*?\*?\s*:\s*(.+?)(?:\n|$)/i); const t = emailOnly.match(/\*?\*?To\*?\*?\s*:\s*(.+?)(?:\n|$)/i); const bodyStart = t ? emailOnly.indexOf(t[0]) + t[0].length : (m ? emailOnly.indexOf(m[0]) + m[0].length : 0); const rawBody = emailOnly.slice(bodyStart).replace(/\*\*/g,'').replace(/Best regards.*$/is,'').replace(/Sunny\s*Sidhu/gi,'').replace(/Van\s*Hawke[^\n]*/gi,'').trim(); return rawBody.length > 30; } catch { return false } })() : false
              if (testParse) {
                return <>
                  {pre && <span dangerouslySetInnerHTML={{ __html: md(pre) }} />}
                  {emailOnly && <EmailDraft text={emailOnly} />}
                  {postEmail && <span dangerouslySetInnerHTML={{ __html: md(postEmail) }} />}
                </>
              }
            }
            return displayText ? <span dangerouslySetInnerHTML={{ __html: md(displayText) }} /> : null
          })()}
          {/* DraftPreview DISABLED — EmailDraft handles all email rendering */}
        </div>
        </div>
        {/* Timestamp + action buttons — single row. Kiko ribbon sits left of icons. */}
        {!streaming && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginTop: 6, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {/* Timestamp */}
            <span style={{ fontSize: 11, color: 'rgba(255,224,194,0.15)', fontFamily: T.font, marginRight: 4 }}>
              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            {(() => {
              const abtn = (onClick, title, children) => (
                <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,224,194,0.2)', transition: 'all 0.12s', padding: 0 }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.55)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,224,194,0.2)' }}
                >{children}</button>
              )
              const iconSz = { width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
              const CopyIcon = <svg {...iconSz} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              const EditIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              const ThumbUpIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
              const ThumbDownIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
              const RetryIcon = <svg {...iconSz} viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
              if (isUser) return <>{abtn(() => editAndResend(i), 'Edit', EditIcon)}{abtn(() => copyToClipboard(msg.content), 'Copy', CopyIcon)}</>
              if (isKiko) return <>{abtn(() => copyToClipboard(msg.content), 'Copy', CopyIcon)}{abtn(() => {}, 'Good', ThumbUpIcon)}{abtn(() => {}, 'Bad', ThumbDownIcon)}{abtn(() => regenerateResponse(i), 'Retry', RetryIcon)}</>
              return null
            })()}
          </div>
        )}
        {/* Kiko Waveform — below the action icons */}
        {isKiko && !streaming && (
          <div style={{ marginTop: 4 }}>
            <KikoWaveform width={60} height={14} mini />
          </div>
        )}
      </div>
    )
  })

  // ── WELCOME STATE (no text messages, not in voice mode) ──
  if (!hasMessages && !compact) {
    return (
      <div style={{ display: 'flex', height: '100%', flex: 1 }}>
      {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} onShowAllChats={(convos, onSelect, onDelete) => setAllChatsData({ convos, onSelect, onDelete })} />}
      <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {chatDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,224,194,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(255,224,194,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,224,194,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 500, color: 'rgba(238,238,238,0.9)', fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
            <p style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', fontFamily: T.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
          </div>
        )}

        {/* Center content */}
        {allChatsData ? (
          <AllChatsView
            convos={allChatsData.convos}
            userId={user?.id}
            onSelect={(conv) => { allChatsData.onSelect(conv); setAllChatsData(null) }}
            onDelete={(conv) => { allChatsData.onDelete(conv); setAllChatsData(d => d ? { ...d, convos: d.convos.filter(c => c.id !== conv.id) } : null) }}
            onClose={() => setAllChatsData(null)}
          />
        ) : (
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
            <KikoWaveform width={900} height={48} speaking={voiceActive && voiceState.speaking} volume={voiceState.energy || 0} onClick={voiceActive ? undefined : () => startVoice()} />
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
              <div style={{ width: '100%', height: '100%', borderRadius: 50, background: voiceState.status === 'error' ? 'linear-gradient(90deg, transparent, rgba(255,80,80,0.5), transparent)' : voiceState.status === 'connecting' ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' : 'linear-gradient(90deg, transparent, rgba(255,224,194,0.5), transparent)', animation: 'kikoListenPulse 2s ease-in-out infinite' }} />
            </div>
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 300, fontFamily: T.font, color: voiceState.status === 'error' ? 'rgba(255,80,80,0.4)' : voiceState.status === 'connecting' ? 'rgba(245,158,11,0.3)' : voiceState.speaking ? 'rgba(255,224,194,0.25)' : 'rgba(255,224,194,0.12)', transition: 'color 0.3s' }}>
              {voiceState.status === 'error' ? 'Connection failed' : voiceState.status === 'connecting' ? 'Connecting...' : voiceState.speaking ? 'Kiko is speaking...' : 'Listening...'}
            </div>
            <button onClick={stopVoice} style={{
              marginTop: 24, padding: '10px 28px', borderRadius: 50,
              background: 'rgba(255,224,194,0.04)', border: '0.5px solid rgba(32,30,24,0.50)',
              fontSize: 13, color: 'rgba(238,238,238,0.25)', cursor: 'pointer', fontFamily: T.font,
              fontWeight: 300, transition: 'all 0.3s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,80,80,0.15)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.06)'; e.currentTarget.style.borderColor = 'rgba(32,30,24,0.50)'; e.currentTarget.style.color = 'rgba(238,238,238,0.25)' }}
            >Goodbye Kiko</button>
          </div>

          {/* Greeting — slides down and fades in voice mode */}
          <div id="kikoGreeting" style={{
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 100,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1)',
            overflow: 'hidden',
          }}>
            <h1 style={{ fontSize: 42, fontWeight: 200, color: 'rgba(238,238,238,0.95)', margin: '0 0 6px', fontFamily: T.font, letterSpacing: '-0.03em', textAlign: 'center' }}>
              {getGreeting()}, {firstName}
            </h1>
            <p style={{ fontSize: 18, color: 'rgba(238,238,238,0.35)', margin: '0 0 0', fontFamily: T.font, fontWeight: 300, textAlign: 'center' }}>What would you like to work on?</p>
          </div>

          {/* Prompt bar — slides down in voice mode */}
          <div id="kikoPromptWrap" style={{
            width: '100%', maxWidth: 720, marginBottom: 14, marginTop: 48,
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 300,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.05s',
            overflow: voiceActive ? 'hidden' : 'visible', pointerEvents: voiceActive ? 'none' : 'auto',
          }}>
                {PromptBar({ welcome: true })}
                {dictateError && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,80,80,0.7)', fontFamily: T.font, margin: '8px 0 0', animation: 'fadeIn 0.2s' }}>{dictateError}</p>
                )}
              </div>

              {/* 4 chips only — below prompt bar */}
              <div id="kikoChipsWrap" style={{
                display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 720, marginBottom: voiceActive ? 0 : 20,
                opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 60,
                transform: voiceActive ? 'translateY(30px)' : 'translateY(0)',
                transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.1s',
                overflow: 'hidden', pointerEvents: voiceActive ? 'none' : 'auto',
              }}>
                {alertCount > 0 && <InsightsBadge count={alertCount} onClick={() => setInsightsOpen(true)} />}
                {dynamicChips.slice(0, 3).map(c => (
                  <button key={c} onClick={() => handleSubmit(c)} style={{
                    padding: '6px 16px', borderRadius: 50, background: T.glass,
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: `1px solid ${T.glassBorder}`, color: 'rgba(238,238,238,0.55)',
                    fontSize: 12, cursor: 'pointer', fontFamily: T.font, fontWeight: 400,
                    boxShadow: T.liquidBtnShadow, whiteSpace: 'nowrap',
                    transition: `all 250ms ${T.spring}`,
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = T.glassHover; e.currentTarget.style.color = 'rgba(238,238,238,0.85)'; e.currentTarget.style.boxShadow = T.liquidBtnHover; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = T.glassBorder; e.currentTarget.style.color = 'rgba(238,238,238,0.55)'; e.currentTarget.style.boxShadow = T.liquidBtnShadow; e.currentTarget.style.transform = 'translateY(0)' }}
                  >{c}</button>
                ))}
              </div>

          {/* Bottom spacer */}
          <div style={{ flex: voiceActive ? 1 : 0.3, transition: 'flex 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />
        </div>
        )}

        {/* LiveKit Voice overlay */}
        {voiceActive && <KikoVoice onClose={stopVoice} user={user} onVoiceState={handleVoiceState} />}

        {/* Notifications panel — slides from right */}
        <KikoInsights open={insightsOpen} onClose={() => setInsightsOpen(false)} onAction={(text) => { setInsightsOpen(false); handleSubmit(text) }} />
      </div>
      </div>
    )
  }

  // ── CONVERSATION STATE (text messages) ──
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {!compact && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} onShowAllChats={(convos, onSelect, onDelete) => setAllChatsData({ convos, onSelect, onDelete })} />}
    <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {chatDragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,224,194,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
          <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(255,224,194,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,224,194,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: 'rgba(238,238,238,0.9)', fontFamily: T.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', fontFamily: T.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
        </div>
      )}
      {allChatsData ? (
        <AllChatsView
          convos={allChatsData.convos}
          userId={user?.id}
          onSelect={(conv) => { allChatsData.onSelect(conv); setAllChatsData(null) }}
          onDelete={(conv) => { allChatsData.onDelete(conv); setAllChatsData(d => d ? { ...d, convos: d.convos.filter(c => c.id !== conv.id) } : null) }}
          onClose={() => setAllChatsData(null)}
        />
      ) : (
      <>
      {/* Chat title bar with dropdown */}
      {activeConvId && convTitle && (
        <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', flexShrink: 0 }}>
          {isRenaming ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <input value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setIsRenaming(false) }} autoFocus
                style={{ flex: 1, border: '0.5px solid rgba(255,224,194,0.15)', borderRadius: 8, background: 'rgba(255,224,194,0.04)', padding: '5px 10px', fontSize: 13, color: T.text, fontFamily: T.font, outline: 'none' }} />
              <button onClick={confirmRename} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(255,224,194,0.3)', background: 'rgba(255,224,194,0.1)', color: T.accent, cursor: 'pointer', fontFamily: T.font }}>Save</button>
            </div>
          ) : (
            <button onClick={() => setTitleMenuOpen(!titleMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 13, fontWeight: 500, maxWidth: '70%' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,224,194,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {isStarred && <span style={{ color: '#F59E0B', fontSize: 12 }}>★</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convTitle}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.4, transform: titleMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6"/></svg>
            </button>
          )}
          {/* Dropdown menu */}
          {titleMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 16, zIndex: 50, minWidth: 160, background: 'rgba(25,25,25,0.30)', backdropFilter: 'blur(40px) saturate(1.4)', WebkitBackdropFilter: 'blur(40px) saturate(1.4)', border: '0.5px solid rgba(32,30,24,0.50)', borderRadius: 10, padding: 4, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              <button onClick={toggleStar} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: T.text, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,224,194,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <span style={{ fontSize: 14 }}>{isStarred ? '★' : '☆'}</span> {isStarred ? 'Unstar' : 'Star'}
              </button>
              <button onClick={startRename} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: T.text, fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,224,194,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg> Rename
              </button>
              <div style={{ height: 1, background: 'rgba(255,224,194,0.06)', margin: '4px 8px' }} />
              <button onClick={deleteConversation} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,80,80,0.8)', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Delete
              </button>
            </div>
          )}
        </div>
      )}
      <div ref={scrollContainerRef} onScroll={(e) => {
        const el = e.currentTarget
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        setShowScrollDown(!atBottom)
      }} style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : 24, position: 'relative' }}>
        <div style={{ maxWidth: compact ? '100%' : 680, margin: '0 auto', width: '100%' }}>
          {messages.length > 40 && !showAllMsgs && (
            <button onClick={() => setShowAllMsgs(true)} style={{ display: 'block', margin: '0 auto 16px', padding: '6px 16px', borderRadius: 12, background: 'rgba(255,224,194,0.04)', border: '0.5px solid rgba(32,30,24,0.40)', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font }}>
              Show {messages.length - 40} earlier messages
            </button>
          )}
          {renderMessages(showAllMsgs ? messages : messages.slice(-40))}
          {/* Thinking indicator — prominent pulsing orb */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 24, display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0' }}>
              <div style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KikoWaveform width={36} height={36} mini />
              </div>
              <div style={{ flex: 1, maxWidth: 400 }}>
                <div style={{
                  padding: '14px 18px', borderRadius: 8,
                  background: 'rgba(255,224,194,0.06)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                  border: '1.5px solid rgba(255,224,194,0.15)',
                  boxShadow: '0 0 20px rgba(255,224,194,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, color: 'rgba(255,224,194,0.8)', fontFamily: T.font, fontWeight: 400, flex: 1 }}>
                      {toolStatus || 'Kiko is thinking...'}
                    </span>
                    <button onClick={stopKiko} style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,224,194,0.06)', border: '1px solid rgba(32,30,24,0.50)', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, flexShrink: 0 }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(32,30,24,0.50)'; e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
                    >Stop</button>
                  </div>
                </div>
                {thinkingSteps.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <button onClick={() => setShowSteps(!showSteps)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      fontSize: 12, color: 'rgba(255,224,194,0.6)', background: 'rgba(255,224,194,0.04)',
                      border: '1px solid rgba(255,224,194,0.1)', borderRadius: 10,
                      cursor: 'pointer', fontFamily: T.font, padding: '8px 12px', fontWeight: 500,
                      transition: 'all 0.2s',
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid rgba(255,224,194,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,224,194,0.6)" strokeWidth="2.5"><path d={showSteps ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}/></svg>
                      </span>
                      <span>Kiko's reasoning</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,224,194,0.35)' }}>{thinkingSteps.length} steps</span>
                    </button>
                    <div style={{ maxHeight: showSteps ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)' }}>
                      <div style={{ padding: '8px 0 0' }}>
                        {thinkingSteps.map((step, si) => {
                          const isLast = si === thinkingSteps.length - 1
                          const isAgent = step.label.includes('Agent') || step.label.includes('agent')
                          const isMemory = step.label.includes('memory') || step.label.includes('Memory')
                          const dotColor = isAgent ? 'rgba(255,224,194,0.6)' : isMemory ? 'rgba(255,224,194,0.5)' : 'rgba(255,224,194,0.5)'
                          return (
                            <div key={si} style={{ display: 'flex', gap: 10, padding: '5px 0', opacity: 1, transition: 'opacity 0.3s' }}>
                              <div style={{ width: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isLast ? 'rgba(255,224,194,0.7)' : dotColor, flexShrink: 0, animation: isLast ? 'pulse 1.2s infinite' : 'none' }} />
                                {!isLast && <span style={{ flex: 1, width: 1, background: 'rgba(255,224,194,0.08)', marginTop: 4 }} />}
                              </div>
                              <span style={{ fontSize: 12, color: isLast ? 'rgba(255,224,194,0.65)' : 'rgba(238,238,238,0.4)', fontFamily: T.font, fontWeight: 400, lineHeight: 1.5 }}>{step.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Streaming response */}
          {streaming && streamText && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,224,194,0.55)', fontFamily: T.font, marginBottom: 6 }}>Kiko</div>
              <div style={{ fontSize: 15, color: 'rgba(238,238,238,0.85)', lineHeight: 1.7, fontFamily: T.font, fontWeight: 400 }}>
                <span dangerouslySetInnerHTML={{ __html: md(stripToolXml(streamText)) }} />
                <span style={{ display: 'inline-block', width: 2, height: 16, background: 'rgba(255,224,194,0.4)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'kikoBlink 1s infinite' }} />
              </div>
              <button onClick={stopKiko} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,224,194,0.03)', border: '0.5px solid rgba(32,30,24,0.50)', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'currentColor', display: 'inline-block' }} /> Stop
              </button>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
      {/* Scroll-to-bottom arrow */}
      {showScrollDown && (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
          <button onClick={() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollDown(false) }}
            style={{
              position: 'absolute', bottom: 8, width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(32,30,24,0.40)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '0.5px solid rgba(255,224,194,0.15)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'all 0.2s',
              color: 'rgba(238,238,238,0.6)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.12)'; e.currentTarget.style.color = 'rgba(238,238,238,0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(32,30,24,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </button>
        </div>
      )}
      </>
      )}
      <div style={{ padding: compact ? 12 : 16 }}>
        <div style={{ maxWidth: compact ? '100%' : 720, margin: '0 auto' }}>
          {PromptBar({})}
          {dictateError && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#C62828', fontFamily: T.font, margin: '6px 0 0' }}>{dictateError}</p>
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,224,194,0.12)', fontFamily: T.font, margin: '8px 0 0', fontWeight: 300 }}>Kiko is AI and can make mistakes. Please double-check responses.</p>
        </div>
      </div>
      {/* LiveKit Voice overlay in conversation */}
      {voiceActive && <KikoVoice onClose={stopVoice} user={user} onVoiceState={handleVoiceState} />}
    </div>
    </div>
  )
}
