import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import DOMPurify from 'dompurify'
// Design tokens — hardcoded (matching Sequences.jsx)
const C = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.14)',
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
import taskManager from '@/lib/kikoTaskManager'
import KikoVoice from './KikoVoice'
import ChatHistory from './ChatHistory'
import AllChatsView from './AllChatsView'
import KikoAvatar from './KikoAvatar'
import HomeDashboard from './HomeDashboard'
import RedesignHomeDashboard from './RedesignHomeDashboard'

// Feature flag — matches Layout.jsx USE_REDESIGN_NAV
const USE_REDESIGN_DASHBOARD = true // PERMANENT — old code paths below this flag are dead weight, scheduled for removal
// DraftPreview disabled — EmailDraft handles all email drafts
import KikoInsights, { InsightsBadge } from './KikoInsights'
import { useKikoLive } from '@/contexts/KikoLiveContext'
import EmailDraft, { isEmailDraft, extractEmailSection } from './EmailDraft'
import KikoMessage from './KikoMessage'
import KikoThinking, { getToolLabel } from './KikoThinking'
import { useDynamicChips } from '@/hooks/useDynamicChips'

// Theme imported from @/lib/theme.js

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
// md() function REMOVED — all markdown rendering handled by KikoMessage component
// which uses ReactMarkdown + remarkGfm with custom components for code blocks (copy button),
// tables, blockquotes, headings, links, and artifact rendering (interactive HTML/SVG iframes).

function getGreeting() {
  const h = new Date().getHours()
  const d = new Date().getDate()
  const timeBase = h >= 5 && h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
  const greetings = [
    [`Good ${timeBase}`],
    [`Happy ${dayName}`],
    ['Welcome back'],
    ['Great to see you'],
    [`Hope your ${timeBase} is going well`],
    ['Ready when you are'],
    ['Let\'s get to work'],
    [`Good ${timeBase}, chief`],
    ['Another day, another deal'],
    ['Back in the chair'],
  ]
  // Use date + hour so greeting changes each hour, but day is always fresh from new Date()
  const idx = (new Date().getDate() + h + Math.floor(Date.now() / 3600000)) % greetings.length
  return greetings[idx][0]
}

// Chips are now dynamic — see useDynamicChips hook

// Kiko 4-dot symbol (asymmetric diamond) with optional staggered animation
const KikoDots = ({ size = 40, color = 'rgba(0,0,0,0.03)', animated = false }) => {
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
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(90,100,112,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.06}s infinite` }} />
      ))}
    </div>
  )
}

// CTA equalizer: 5 smaller bars, always pulsing
const CtaEq = () => {
  const ctaBars = [
    { anim: 'eqBarS0', speed: '0.50s' },
    { anim: 'eqBarS1', speed: '0.42s' },
    { anim: 'eqBarS2', speed: '0.55s' },
    { anim: 'eqBarS3', speed: '0.45s' },
    { anim: 'eqBarS4', speed: '0.48s' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {ctaBars.map((b, i) => (
        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(90,100,112,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.07}s infinite` }} />
      ))}
    </div>
  )
}

export default function KikoChat({ user, compact = false, initialMessage = '' }) {
  const navigate = useNavigate()
  const outletCtx = useOutletContext() || {}
  const isMobile = outletCtx.isMobile || false
  const dynamicChips = useDynamicChips('home', false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(initialMessage)

  // ═══ CONCURRENT CHAT SESSIONS — Refs ═══
  const chatSessionsRef = useRef(new Map())
  const activeChatIdRef = useRef('default')
  const bgStreamingChats = useRef(new Set())
  // ═══ Callbacks defined after all state declarations (see below) ═══
  const [typewriterText, setTypewriterText] = useState('')
  const typewriterDone = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState(null)
  const [streamText, setStreamText] = useState('')
  const [toolStatus, setToolStatus] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editText, setEditText] = useState('')
  const editingIdxRef = useRef(null)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [showSteps, setShowSteps] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false) // Collapsed by default
  const [morningBriefing, setMorningBriefing] = useState(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const { alertCount } = useKikoLive()
  const [mobileCommandOpen, setMobileCommandOpen] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const [mobileHistoryConvos, setMobileHistoryConvos] = useState([])
  const [commandData, setCommandData] = useState({ replies: [], tasks: [], campaigns: [], recommendations: [], overdue: [] })

  // Load command centre data when bell is tapped
  const loadCommandData = useCallback(async () => {
    try {
      const [alertsRes, tasksRes, campaignsRes] = await Promise.all([
        supabase.from('kiko_alerts').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('tasks').select('*').eq('org_id', '35975d96-c2c9-4b6c-b4d4-bb947ae817d5').order('updated_at', { ascending: false }).limit(20),
        supabase.from('kiko_sequences').select('id, name, is_active, steps').eq('is_active', true).limit(10),
      ])
      // Get enrollment counts for active campaigns
      const campaignIds = (campaignsRes.data || []).map(c => c.id)
      let enrollments = []
      if (campaignIds.length) {
        const { data: enr } = await supabase.from('kiko_sequence_enrollments').select('sequence_id, status, reply_detected_at, bounce_detected_at').in('sequence_id', campaignIds)
        enrollments = enr || []
      }
      const campaigns = (campaignsRes.data || []).map(c => {
        const enrs = enrollments.filter(e => e.sequence_id === c.id)
        return { ...c, enrolled: enrs.length, replied: enrs.filter(e => e.reply_detected_at).length, bounced: enrs.filter(e => e.bounce_detected_at).length }
      })
      // Filter alerts by type
      const allAlerts = alertsRes.data || []
      const replies = allAlerts.filter(a => !a.dismissed && ['email_reply', 'email_reply_manual', 'linkedin_reply', 'linkedin_connection_accepted', 'reply_from_prospect'].includes(a.type))
      const recommendations = allAlerts.filter(a => !a.dismissed && a.type === 'proactive_recommendation')
      const tasks = (tasksRes.data || []).filter(t => !t.data?.completed).map(t => ({ ...t, ...(t.data || {}) }))
      const overdue = tasks.filter(t => { const d = t.dueDate || t.due_date; return d && new Date(d) < new Date() })
      setCommandData({ replies, tasks, campaigns, recommendations, overdue })
    } catch (err) { console.error('[MobileCommand]', err) }
  }, [])

  // Load mobile chat history
  const loadMobileHistory = useCallback(async () => {
    try {
      const orgId = user?.app_metadata?.org_id
      // Always show own conversations — super_admin oversight via Kiko on request
      const query = supabase.from('conversations').select('id, title, updated_at').eq('user_id', user?.id).neq('archived', true).order('updated_at', { ascending: false }).limit(50)
      const { data } = await query
      setMobileHistoryConvos(data || [])
    } catch (e) { console.error('[MobileHistory]', e) }
  }, [user?.id, user?.app_metadata?.org_id])

  // Sync mobile history when chats are renamed/updated
  useEffect(() => {
    const handler = () => { if (isMobile) loadMobileHistory() }
    window.addEventListener('kiko-chat-updated', handler)
    return () => window.removeEventListener('kiko-chat-updated', handler)
  }, [loadMobileHistory])

  // KikoLive context handles alert count via Realtime — no polling needed
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

  // ═══ CONCURRENT CHAT SESSIONS — Callbacks (after all state declarations) ═══
  const saveCurrentChatState = useCallback(() => {
    const chatId = activeChatIdRef.current
    chatSessionsRef.current.set(chatId, {
      messages, streamText: streamTextRef.current || '', streaming: streamingRef.current,
      toolStatus, thinkingSteps, convId: activeConvId,
    })
  }, [messages, toolStatus, thinkingSteps, activeConvId])

  const loadChatState = useCallback((chatId) => {
    const saved = chatSessionsRef.current.get(chatId)
    if (saved) {
      setMessages(saved.messages || []); setStreamText(saved.streamText || '')
      setStreaming(saved.streaming || false); streamingRef.current = saved.streaming || false
      streamTextRef.current = saved.streamText || ''; setToolStatus(saved.toolStatus || null)
      setThinkingSteps(saved.thinkingSteps || []); setActiveConvId(saved.convId || null)
    } else {
      setMessages([]); setStreamText(''); setStreaming(false); streamingRef.current = false
      streamTextRef.current = ''; setToolStatus(null); setThinkingSteps([])
    }
    activeChatIdRef.current = chatId
  }, [])

  // Auto-scroll to bottom during streaming — respects user scroll position
  const userScrolledUp = useRef(false)
  const isProgrammaticScroll = useRef(false)
  useEffect(() => {
    if (!streaming) { userScrolledUp.current = false; return }
    if (userScrolledUp.current) return
    const el = scrollContainerRef.current
    if (!el) return
    // Only auto-scroll if user is near the bottom (within 200px)
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom > 200) { userScrolledUp.current = true; return }
    isProgrammaticScroll.current = true
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight
      setTimeout(() => { isProgrammaticScroll.current = false }, 50)
    })
  }, [streamText, toolStatus, streaming])
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const transcribeRef = useRef({ media: null, recorder: null, sr: null, active: false, baseInput: '', committed: '' })
  const composingRef = useRef(false) // Track IME/macOS dictation composition
  const dragCounterRef = useRef(0)
  const [chatDragOver, setChatDragOver] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState(null) // { url, name, file }
  const [pendingAttachments, setPendingAttachments] = useState([]) // array of { type, mediaType, data, previewUrl, name, fileType, size, pages }
  const [allChatsData, setAllChatsData] = useState(null) // { convos, onSelect, onDelete }
  const [showAllMsgs, setShowAllMsgs] = useState(false)
  const abortRef = useRef(null)
  const streamTextRef = useRef('')
  const lastQueryRef = useRef('')
  const streamingRef = useRef(false)
  const queuedMessageRef = useRef(null)
  const lastActivityRef = useRef(0) // last stream activity ts (drives stuck-stream watchdog)
  
  // ── Smooth streaming buffer — renders 3 chars per frame for fluid text flow ──
  const streamBufferRef = useRef([])
  const streamRafRef = useRef(null)
  const streamDisplayRef = useRef('')
  const flushStreamBuffer = useCallback(() => {
    // Just cancel the animation loop — don't re-set streamText
    // The full response is already saved in messages array
    streamBufferRef.current = []
    streamDisplayRef.current = ''
    if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
  }, [])
  const tickStreamBuffer = useCallback(() => {
    if (streamBufferRef.current.length === 0 || !streamingRef.current) { streamRafRef.current = null; return }
    const batch = streamBufferRef.current.splice(0, 3).join('')
    streamDisplayRef.current += batch
    setStreamText(streamDisplayRef.current)
    streamRafRef.current = requestAnimationFrame(tickStreamBuffer)
  }, [])
  const pushStreamChunk = useCallback((chunk) => {
    if (!chunk) return
    streamBufferRef.current.push(...chunk.split(''))
    if (!streamRafRef.current) streamRafRef.current = requestAnimationFrame(tickStreamBuffer)
  }, [tickStreamBuffer])

  // Background task state (Phase 3)

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

  // Stuck-stream watchdog — recovers the UI even if the request never aborts (dead/stale connection).
  // If streaming is on but no chunk (delta/toolStatus) has arrived for 45s, force-clear the thinking
  // state and surface a retryable error, independent of the fetch's own abort/timeout logic.
  useEffect(() => {
    if (!streaming) return
    const wd = setInterval(() => {
      if (Date.now() - (lastActivityRef.current || 0) < 45000) return
      clearInterval(wd)
      try { if (abortRef.current) abortRef.current.abort() } catch {}
      streamingRef.current = false
      try { flushStreamBuffer() } catch {}
      setStreaming(false); setToolStatus(null); setStreamText('')
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && /did not respond|timed out|connection/i.test(last.content || '')) return prev
        return [...prev, { role: 'assistant', content: 'Kiko did not respond. The connection may have dropped. Please try again, or refresh the page if it keeps happening.' }]
      })
      try { showToast('Connection dropped — please try again', 'error') } catch {}
    }, 5000)
    return () => clearInterval(wd)
  }, [streaming])

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

  // Voice is ALWAYS fullscreen now (2026-04-09 UX decision).
  // Two entry paths tracked via voiceStartedFromConvId ref:
  //   (a) From homepage / no active chat → creates a NEW conversation on stop
  //   (b) From within an existing chat   → appends transcript to that chat on stop
  const voiceStartedFromConvId = useRef(null)

  const startVoice = async () => {
    // Mobile: navigate to standalone voice page (avoids portal/z-index/overflow issues)
    if (isMobile) {
      navigate('/voice')
      return
    }
    // Desktop: use inline KikoVoice overlay
    // Request mic FIRST — iOS Safari requires this in user gesture context
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setVoiceMicStream(stream)
    } catch (err) {
      console.error('[Voice] Mic permission denied:', err)
      alert('Microphone access is required for Kiko Voice. Please allow microphone access in your browser settings.')
      return
    }
    voiceStartedFromConvId.current = activeConvId
    setVoiceActive(true)
    setVoiceMessages([])
    window.dispatchEvent(new CustomEvent('kiko_voice_fullscreen', { detail: { active: true } }))
  }

  const stopVoice = async () => {
    setVoiceActive(false)
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
    window.dispatchEvent(new CustomEvent('kiko_voice_fullscreen', { detail: { active: false } }))
    window.__kikoAudioEnergy = 0
    window.__kikoAudioPitch = 0

    const startedFromConvId = voiceStartedFromConvId.current
    voiceStartedFromConvId.current = null

    if (voiceMessages.length > 0) {
      const mapped = voiceMessages.map(m => ({ role: m.role === 'kiko' ? 'assistant' : 'user', content: m.content }))

      if (startedFromConvId) {
        // APPEND to existing chat
        try {
          const { data: existing } = await supabase
            .from('conversations').select('messages').eq('id', startedFromConvId).single()
          const prior = Array.isArray(existing?.messages) ? existing.messages : []
          const combined = [...prior, ...mapped]
          await supabase.from('conversations')
            .update({ messages: combined, updated_at: new Date().toISOString() })
            .eq('id', startedFromConvId)
          setMessages(combined)  // reflect merged chat in UI
        } catch (e) { console.warn('Failed to append voice to existing chat:', e) }
      } else {
        // CREATE new conversation from home
        try {
          const firstUserMsg = voiceMessages.find(m => m.role === 'user')
          const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
            : 'Voice conversation'
          const { data: newConv } = await supabase.from('conversations').insert({
            user_id: user?.id, org_id: user?.app_metadata?.org_id, title, messages: mapped,
          }).select().single()
          if (newConv?.id) {
            setActiveConvId(newConv.id)
            setMessages(mapped)
          }
        } catch (e) { console.warn('Failed to save voice transcript:', e) }
      }
    } else if (!startedFromConvId) {
      // Empty voice session from home — stay on home
      setMessages([])
    }
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
      // Web Speech API unavailable (Safari/Firefox without flag) — graceful fail
      // Whisper fallback removed: /api/voice endpoint never existed and silently 404'd
      setDictateError('Voice dictation requires Chrome, Edge, or a Chromium browser. Try clicking the EQ button instead for full voice mode.')
      setTranscribing(false)
    }
  }
  const stopTranscribe = () => {
    transcribeRef.current.active = false
    if (transcribeRef.current.sr) { try { transcribeRef.current.sr.stop() } catch {} transcribeRef.current.sr = null }
    if (transcribeRef.current.recorder?.state === 'recording') transcribeRef.current.recorder.stop()
    if (transcribeRef.current.media) { transcribeRef.current.media.getTracks().forEach(t => t.stop()); transcribeRef.current.media = null }
    setTranscribing(false)
  }

  const loadConversation = async (conv) => {
    if (!conv?.id) return
    // ── CONCURRENT: Save current chat state before switching ──
    saveCurrentChatState()
    if (streaming) bgStreamingChats.current.add(activeChatIdRef.current)
    activeChatIdRef.current = conv.id // switch active chat ID

    let msgs = conv.messages
    if (!msgs || msgs.length === 0) {
      const { data } = await supabase.from('conversations').select('messages, title').eq('id', conv.id).single()
      msgs = data?.messages || []
      if (!conv.title && data?.title) conv.title = data.title
    }
    // Check if this chat has saved background state
    const saved = chatSessionsRef.current.get(conv.id)
    if (saved && saved.streaming) {
      // Restore background streaming state + reset buffer refs to prevent display sync issues
      setMessages(saved.messages || msgs.map(m => ({ role: m.role, content: m.content })))
      setStreamText(saved.streamText || '')
      setStreaming(true)
      streamingRef.current = true
      streamTextRef.current = saved.streamText || ''
      streamBufferRef.current = []
      streamDisplayRef.current = saved.streamText || ''
      if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
      setToolStatus(saved.toolStatus || null)
      setThinkingSteps(saved.thinkingSteps || [])
    } else if (saved && !saved.streaming) {
      // Background chat completed — restore final state
      setMessages(saved.messages || msgs.map(m => ({ role: m.role, content: m.content })))
      setStreamText(''); setStreaming(false)
      streamingRef.current = false; streamTextRef.current = ''
      setToolStatus(null); setThinkingSteps([])
      chatSessionsRef.current.delete(conv.id) // Clean up completed session
    } else {
      justLoadedRef.current = true
      setMessages(msgs.map(m => ({ role: m.role, content: m.content })))
      setStreamText(''); setStreaming(false)
      streamingRef.current = false; streamTextRef.current = ''
      setToolStatus(null); setThinkingSteps([])
    }
    setActiveConvId(conv.id)
    if (conv.title) setConvTitle(conv.title)
    setShowAllMsgs(false)
  }

  // Listen for cross-thread switch events from ThreadIndicator
  // Sunny spec 2026-04-12: clicking a thread in the multi-conv dropdown
  // should immediately load that thread's messages into the active chat.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) loadConversation(e.detail)
    }
    window.addEventListener('kiko_load_conversation', handler)
    return () => window.removeEventListener('kiko_load_conversation', handler)
  }, [])

  // Phase 3: Listen for background task results from BackgroundTasksPanel
  useEffect(() => {
    const handler = (e) => {
      const { task_id, conversation_id, result_text } = e.detail || {}
      if (!result_text) return
      const bgMsg = { role: 'assistant', content: result_text, meta: { fromBackgroundTask: true, taskId: task_id } }
      if (conversation_id && conversation_id === activeConvId) {
        // Same conversation — insert directly
        setMessages(prev => [...prev, bgMsg])
      } else if (conversation_id) {
        // Different conversation — load it then insert
        supabase.from('conversations').select('messages, title').eq('id', conversation_id).single().then(({ data }) => {
          const prior = Array.isArray(data?.messages) ? data.messages : []
          const merged = [...prior, bgMsg]
          setMessages(merged.map(m => ({ role: m.role, content: m.content, meta: m.meta })))
          setActiveConvId(conversation_id)
          setConvTitle(data?.title || 'Background task')
          setStreamText(''); setStreaming(false)
          // Persist the inserted message
          supabase.from('conversations').update({ messages: merged, updated_at: new Date().toISOString() }).eq('id', conversation_id).then(() => {})
        })
      } else {
        // No conversation — insert into current chat
        setMessages(prev => [...prev, bgMsg])
      }
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    window.addEventListener('kiko_open_task_result', handler)
    return () => window.removeEventListener('kiko_open_task_result', handler)
  }, [activeConvId])

  // Phase 3: Run query in background
  // runInBackground REMOVED — was legacy Vercel code (kiko-task-create.js deleted)

  const startNewChat = () => {
    // ── CONCURRENT: Save current chat state before creating new chat ──
    saveCurrentChatState()
    if (streaming) bgStreamingChats.current.add(activeChatIdRef.current)
    const newChatId = 'new_' + Date.now()
    activeChatIdRef.current = newChatId
    setMessages([]); setActiveConvId(null); setStreamText(''); setStreaming(false); setInput('')
    streamingRef.current = false; streamTextRef.current = ''
    streamBufferRef.current = []; streamDisplayRef.current = ''
    if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
    setToolStatus(null); setThinkingSteps([])
    setVoiceActive(false); setVoiceMessages([])
    if (voiceMicStream) { voiceMicStream.getTracks().forEach(t => t.stop()); setVoiceMicStream(null) }
    inputRef.current?.focus()
  }

  // Listen for "Today" nav click when already on home — reset chat to welcome state
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.path === '/' || e.detail?.id === 'home') startNewChat()
    }
    window.addEventListener('kiko_nav_same_tab', handler)
    return () => window.removeEventListener('kiko_nav_same_tab', handler)
  }, [])

  useEffect(() => { if (initialMessage && !messages.length) handleSubmit(initialMessage) }, [])

  // Listen for priority action clicks that prefill and auto-submit
  useEffect(() => {
    const handler = (e) => {
      const text = e.detail?.text
      if (text) {
        setInput(text)
        setTimeout(() => handleSubmit(text), 100)
      }
    }
    window.addEventListener('kiko_prefill', handler)
    return () => window.removeEventListener('kiko_prefill', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ KEYBOARD SHORTCUTS — Cmd+N new chat, Cmd+K toggle sidebar ═══
  useEffect(() => {
    const handler = (e) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); startNewChat() }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); toggleHistory() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [startNewChat])

  // Fetch morning briefing on mount
  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await supabase.from('kiko_alerts')
          .select('detail')
          .eq('type', 'morning_briefing')
          .eq('dismissed', false)
          .gte('created_at', today)
          .order('created_at', { ascending: false })
          .limit(1)
        if (data?.[0]?.detail) setMorningBriefing(data[0].detail)
      } catch {} 
    })()
  }, [])
  const justLoadedRef = useRef(false)
  useEffect(() => {
    if (justLoadedRef.current) {
      // Instant scroll on conversation load — no animation
      scrollRef.current?.scrollIntoView({ behavior: 'instant' })
      justLoadedRef.current = false
    } else if (!(streaming && userScrolledUp.current)) {
      // Don't yank the user to the bottom if they scrolled up to read while Kiko is streaming
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
    const phrase = 'Ask Kiko anything — deals, contacts, drafts, strategy…'
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
    window.dispatchEvent(new Event('kiko-chat-updated'))
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
        const tr = await fetch('https://api.vanhawke.agency/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: userMsg, response: (kikoResponse || '').slice(0, 300) }) })
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
    const allAttachments = [...fileAttachments, ...pendingAttachments]
    if ((!msg && !allAttachments.length) || streaming) return
    // ── CONCURRENT: Track which chat this submit belongs to ──
    const thisChatId = activeChatIdRef.current
    const isActiveChat = () => activeChatIdRef.current === thisChatId
    // Stop dictation on submit
    if (transcribing) { transcribeRef.current.active = false; if (transcribeRef.current.sr) { try { transcribeRef.current.sr.stop() } catch {} transcribeRef.current.sr = null }; setTranscribing(false) }
    const effectiveMsg = msg || (allAttachments.length ? `Analyse this file: "${allAttachments[0].name || 'uploaded file'}"` : '')
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setPendingAttachments([])
    // Build file context from pending file attachments
    const fileAtts = allAttachments.filter(a => a.type === 'file')
    const fileNames = fileAtts.map(f => f.name).join(', ')
    const displayMsg = fileAtts.length > 0 ? `📎 ${fileNames} — ${effectiveMsg}` : effectiveMsg
    // Don't duplicate file content in apiMsg — it's already in attachments
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
    lastActivityRef.current = Date.now(); setStreaming(true); setStreamText(''); setToolStatus(null); setThinkingSteps([]); setShowSteps(true)
    streamingRef.current = true; streamTextRef.current = ''; lastQueryRef.current = msg || ''
    streamBufferRef.current = []; streamDisplayRef.current = ''; if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }

    // AbortController for stop/halt
    const controller = new AbortController()
    abortRef.current = controller
    // Hard timeout — if Kiko doesn't respond within 110s, abort
    const hardTimeout = setTimeout(() => { try { controller.abort() } catch {} }, 110000)

    let inactivityCheckId = null

    try {
      // Page context — tells Kiko what page user is viewing
      const pageCtx = window.kikoPageContext || { page: window.location.pathname.replace('/', '') || 'home' }

      // Detect deep research queries — route to parallel multi-agent endpoint
      const KIKO_HOST = import.meta.env.VITE_KIKO_API_HOST || 'https://api.vanhawke.agency'
      const apiUrl = `${KIKO_HOST}/api/kiko`

      const res = await fetch(apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: apiMsg, userEmail: user?.email,
          attachments: allAttachments,
          conversationHistory: messages.slice(allAttachments.length > 0 ? -6 : -10).map(m => {
            if (typeof m.content === 'string') return { role: m.role, content: m.content.slice(0, 1500) }
            if (Array.isArray(m.content)) {
              const textParts = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
              return { role: m.role, content: (textParts || '[file attachment]').slice(0, 1500) }
            }
            return { role: m.role, content: '[previous message]' }
          }),
          currentPage: pageCtx.page || (window.location.pathname.replace('/', '') || 'home'),
          pageContext: pageCtx,
          pageEntity: (() => {
            const path = window.location.pathname; const params = new URLSearchParams(window.location.search)
            if (path.startsWith('/contacts/')) return { type: 'contact', id: path.split('/contacts/')[1] }
            if (params.get('org')) return { type: 'company', id: params.get('org') }
            return null
          })(),
          personality: (() => { try { const s = JSON.parse(localStorage.getItem('kiko_settings') || '{}'); return s.kiko_personality || 'executive' } catch { return 'executive' } })(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language || 'en-GB',
        }),
      })
      const reader = res.body.getReader(); const dec = new TextDecoder()
      let full = '', buf = '', pendingNav = null
      let lastDataTime = Date.now()
      // Inactivity check — if no data received for 45s, abort
      inactivityCheckId = setInterval(() => {
        if (Date.now() - lastDataTime > 45000) { clearInterval(inactivityCheckId); try { controller.abort() } catch {} }
      }, 5000)
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        lastDataTime = Date.now(); lastActivityRef.current = lastDataTime
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6); if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; if (isActiveChat()) { pushStreamChunk(j.delta) }; streamTextRef.current = full }
            if (j.thinking && isActiveChat()) { setThinkingSteps(prev => prev.some(s => s.label === 'Reasoning...') ? prev : [...prev, { label: 'Reasoning...', time: Date.now() }]) }
            if (j.toolStatus !== undefined && isActiveChat()) { setToolStatus(j.toolStatus); if (j.toolStatus && j.toolStatus !== 'Connecting...' && j.toolStatus !== 'Composing response...') setThinkingSteps(prev => prev.some(s => s.label === j.toolStatus) ? prev : [...prev, { label: j.toolStatus, time: Date.now() }]) }
            // ── CONCURRENT: Update background session ref if user switched away ──
            if (!isActiveChat()) { chatSessionsRef.current.set(thisChatId, { messages: [...messages, userMsg], streamText: full, streaming: true, toolStatus: j.toolStatus, thinkingSteps: [], convId: activeConvId }) }
            if (j.navigate) pendingNav = j.navigate
          } catch {}
        }
      }
      clearInterval(inactivityCheckId)
      const responseContent = full.trim() || 'Something went wrong — please try again.'
      if (!full.trim()) console.warn('[KikoChat] Empty response from API — stream may have dropped')
      const kikoMsg = { role: 'assistant', content: responseContent, timestamp: Date.now(), steps: thinkingSteps.length > 0 ? [...thinkingSteps] : undefined }
      const updated = [...messages, userMsg, kikoMsg]

      // ── CONCURRENT: Handle completion for active vs background chat ──
      if (isActiveChat()) {
        setMessages(prev => [...prev, kikoMsg]); setStreamText(''); setToolStatus(null)
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else {
        // Streaming completed in background — save final state to ref
        chatSessionsRef.current.set(thisChatId, { messages: updated, streamText: '', streaming: false, toolStatus: null, thinkingSteps: [], convId: activeConvId })
        bgStreamingChats.current.delete(thisChatId)
        // Dispatch event so sidebar can show completion indicator
        window.dispatchEvent(new CustomEvent('kiko-chat-updated'))
      }
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
        // User stopped Kiko or timeout — save partial response
        if (streamText) setMessages(prev => [...prev, { role: 'assistant', content: streamText + '\n\n*[Stopped]*' }])
        else setMessages(prev => [...prev, { role: 'assistant', content: 'Request timed out. Try a shorter question or break it into parts.' }])
      } else {
        const isNetwork = err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('failed to fetch')
        const friendlyMsg = isNetwork ? 'Connection issue — the message may have been too large. Try again with a shorter prompt or fewer attachments.' : `Error: ${err.message}`
        setMessages(prev => [...prev, { role: 'assistant', content: friendlyMsg }])
        showToast(err.message?.includes('token') ? 'Session expired — please refresh' : 'Kiko encountered an error', 'error')
      }
      setStreamText('')
    }
    finally { clearTimeout(hardTimeout); try { clearInterval(inactivityCheckId) } catch {}; if (isActiveChat()) { flushStreamBuffer(); setStreaming(false); setToolStatus(null); setStreamText('') }; streamingRef.current = false; bgStreamingChats.current.delete(thisChatId); if (isActiveChat() && queuedMessageRef.current) { const qm = queuedMessageRef.current; queuedMessageRef.current = null; setQueuedMessage(null); setTimeout(() => handleSubmit(qm), 100); } }
  }, [input, streaming, messages, user, activeConvId, pendingAttachments])

  const processFileForKiko = async (file) => {
    if (!file || fileUploading || streaming) return
    setFileUploading(true)
    try {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      const isText = file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|js|jsx|ts|py|html|css|xml|yaml|yml)$/i)

      if (isText) {
        // Text files: store as pending attachment — user continues typing their prompt
        const text = await file.text()
        setPendingAttachments(prev => [...prev, { type: 'file', name: file.name, data: text.slice(0, 50000), fileType: 'text', size: file.size }])
        setFileUploading(false)
        return // Don't auto-submit — let user continue their prompt
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
          setPendingAttachments(prev => [...prev, { type: 'image', mediaType: file.type, data: base64, previewUrl, name: file.name }])
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
              const res = await fetch('https://api.vanhawke.agency/api/file-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: extractBody
              })
              const result = await res.json()
              if (!res.ok) throw new Error(result.error || 'Extraction failed')
              const meta = result.metadata || {}
              // Store as pending attachment — user continues typing their prompt
              setPendingAttachments(prev => [...prev, { type: 'file', name: file.name, data: (result.text || '').slice(0, 80000), fileType: meta.type || 'document', size: file.size, pages: meta.pages }])
              setFileUploading(false)
              return // Don't auto-submit
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

  const handleFileDrop = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setChatDragOver(false); const files = e.dataTransfer.files; if (files) { for (const f of files) processFileForKiko(f) } }
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
    const hasContent = input.trim() || pendingAttachments.length > 0
    const [promptFocused, setPromptFocused] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [shimmerDone, setShimmerDone] = useState(false)
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
      <div ref={barRef} onMouseMove={isMobile ? undefined : handleBarMouseMove} style={{
        display: 'flex', flexDirection: 'column',
        background: isMobile ? '#F5F4F1' : '#FFFFFF',
        backdropFilter: 'none', WebkitBackdropFilter: 'none',
        borderRadius: isMobile ? 28 : (welcome ? 9999 : 9999),
        padding: isMobile ? '10px 10px 10px 22px' : (welcome ? ('0') : '0'),
        minHeight: isMobile ? 52 : (welcome ? 48 : undefined),
        position: 'relative',
        border: isMobile ? '1px solid rgba(0,0,0,0.10)' : `1px solid ${promptFocused ? 'rgba(0,0,0,0.18)' : transcribing ? 'rgba(34,197,94,0.4)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: isMobile ? '0 1px 4px rgba(0,0,0,0.06)' : (promptFocused
          ? '0 0 0 3px rgba(10,10,10,0.04), 0 1px 2px rgba(0,0,0,0.04)'
          : '0 1px 2px rgba(0,0,0,0.04)'),
        transition: isMobile ? 'none' : `all 400ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`,
        maxWidth: welcome ? (isMobile ? '100%' : 680) : (compact ? '100%' : (isMobile ? '100%' : 680)),
        width: '100%', margin: '0 auto',
        overflow: 'visible',
      }}>
        {/* Peach cursor-following glow */}
        {promptFocused && <div style={{ position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none', background: `radial-gradient(circle 140px at ${mousePos.x}% ${mousePos.y}%, rgba(0,0,0,0.04) 0%, transparent 70%)`, transition: `opacity 300ms ${'cubic-bezier(0.25, 0.1, 0.25, 1)'}`, opacity: 1, zIndex: 0 }} />}
        {/* Shimmer edge on focus — plays once then settles */}
        {promptFocused && <div onAnimationEnd={() => setShimmerDone(true)} style={{ position: 'absolute', inset: -1, borderRadius: 25, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.05) 75%, transparent 100%)', backgroundSize: '200% 100%', animation: shimmerDone ? 'none' : 'glowShimmer 1.5s linear forwards', opacity: shimmerDone ? 0.15 : 0.6, transition: 'opacity 600ms ease', zIndex: 0 }} />}
        {/* Pending attachments display — clean thumbnail cards (file-type badge + name + size + private lock) */}
        {pendingAttachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 0 10px', marginBottom: 8 }}>
            {pendingAttachments.map((att, ai) => {
              const ext = (att.name?.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
              const kind = (att.fileType === 'image' || att.previewUrl) ? 'image'
                : /^pdf$/.test(ext) ? 'pdf'
                : /^(xlsx?|xlsm|csv)$/.test(ext) ? 'sheet'
                : /^docx?$/.test(ext) ? 'doc'
                : /^pptx?$/.test(ext) ? 'ppt'
                : 'file';
              const palette = ({
                pdf:   { bg: '#FBEAEA', fg: '#A32D2D', label: 'PDF' },
                sheet: { bg: '#EAF3DE', fg: '#3B6D11', label: 'XLSX' },
                doc:   { bg: '#E6F1FB', fg: '#185FA5', label: 'DOCX' },
                ppt:   { bg: '#FAEEDA', fg: '#854F0B', label: 'PPTX' },
                image: { bg: '#F1EFE8', fg: '#5F5E5A', label: 'IMG' },
                file:  { bg: '#F1EFE8', fg: '#5F5E5A', label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE' },
              })[kind];
              const typeName = ({ pdf: 'PDF', sheet: 'Spreadsheet', doc: 'Document', ppt: 'Presentation', image: 'Image', file: 'File' })[kind];
              const sizeStr = att.size ? (att.size < 1048576 ? Math.round(att.size / 1024) + ' KB' : (att.size / 1048576).toFixed(1) + ' MB') : '';
              const meta = [typeName, sizeStr, att.pages ? `${att.pages}p` : ''].filter(Boolean).join(' · ');
              return (
                <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 10px', borderRadius: 12, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', minWidth: 210, maxWidth: 280 }}>
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600, color: palette.fg, fontFamily: C.font, letterSpacing: 0.3 }}>{palette.label}</div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: C.font }}>{att.name}</div>
                    <div style={{ fontSize: 11, color: '#9A9A9A', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                      <span>{meta}</span>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>Private</span>
                    </div>
                  </div>
                  <button onClick={() => { setPendingAttachments(prev => prev.filter((_, i) => i !== ai)); if (att.previewUrl) setImagePreview(null) }} aria-label="Remove file" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0B0B0', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* Queued follow-up — auto-sends when Kiko finishes (she is never interrupted) */}
        {queuedMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', marginBottom: 6, borderRadius: 10, background: 'rgba(232,112,10,0.06)', border: '1px solid rgba(232,112,10,0.16)' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#B45A28" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span style={{ fontSize: 12, color: '#B45A28', fontFamily: C.font, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sends when Kiko finishes: "{queuedMessage}"</span>
            <button onClick={() => { queuedMessageRef.current = null; setQueuedMessage(null) }} aria-label="Cancel queued message" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45A28', padding: 2, display: 'flex', flexShrink: 0 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {/* File processing indicator */}
        {fileUploading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 6, borderRadius: 8, background: 'rgba(180,90,40,0.04)', border: '1px solid rgba(180,90,40,0.1)' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(180,90,40,0.2)', borderTopColor: '#B45A28', animation: 'kikoSpin 0.8s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#B45A28', fontFamily: C.font }}>Processing file...</span>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx" multiple onChange={e => { const files = e.target.files; if (files) { for (const f of files) processFileForKiko(f) }; e.target.value = '' }} style={{ display: 'none' }} />

        {welcome ? (
        /* ── HOMEPAGE: Single row [+menu] [textarea] [mic] [EQ] [send] ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, position: 'relative', zIndex: 2, padding: '14px 14px 14px 20px' }}>
          {!isMobile && <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(!menuOpen)} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${menuOpen ? 'rgba(90,100,112,0.2)' : C.border}`, color: '#0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`, transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A2A30'; e.currentTarget.style.color = '#b4b4b4'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)' }}
              onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = '#555558' } e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 || 12, padding: 4, minWidth: 170, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' || '0 8px 32px rgba(0,0,0,0.5)', animation: 'enterScale 180ms cubic-bezier(0.34,1.56,0.64,1)', zIndex: 30 }}>
                {[
                  { id: 'attach', label: 'Attach files', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> },
                  { id: 'research', label: 'Deep research', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                  { id: 'brief', label: 'Brief me', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/></svg> },
                ].map(m => (
                  <button key={m.id} onClick={() => { setMenuOpen(false); if (m.id === 'attach') fileInputRef.current?.click(); else if (m.id === 'research') { setInput('Deep research: '); inputRef.current?.focus(); } else if (m.id === 'brief') { setInput('Brief me on '); inputRef.current?.focus(); } }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#6B6B6B', fontSize: 13, fontFamily: C.font, cursor: 'pointer', borderRadius: 8, transition: 'background 150ms ease' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {m.icon}<span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <textarea ref={inputRef} value={input} dir="ltr" onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (streaming) { const qt = input.trim(); if (qt) { queuedMessageRef.current = qt; setQueuedMessage(qt); setInput(''); if (inputRef.current) inputRef.current.style.height = 'auto'; } } else { handleSubmit(); } } }}
              onPaste={e => { 
                // Handle pasted images (Cmd+V screenshots)
                const items = e.clipboardData?.items
                if (items) {
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (file) processFileForKiko(file)
                      return
                    }
                  }
                }
                setTimeout(() => { if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px' } }, 0) 
              }}
              onFocus={() => setPromptFocused(true)} onBlur={() => setTimeout(() => setPromptFocused(false), 150)}
              placeholder="" autoFocus rows={1}
              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: isMobile ? 17 : 15, color: '#0A0A0A', fontFamily: C.font, minHeight: 24, maxHeight: 200, fontWeight: 400, resize: 'none', lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', verticalAlign: 'middle', display: 'block', position: 'relative', zIndex: 2 }} />
            {!input && !fileUploading && !pendingAttachments.length && typewriterText && (
              <div style={{ position: 'absolute', top: 4, left: 0, fontSize: 15, color: '#A0A0A0', fontFamily: C.font, fontWeight: 400, pointerEvents: 'none', lineHeight: '24px' }}>
                {typewriterText}<span style={{ opacity: typewriterText.length < 19 ? 1 : 0, animation: typewriterText.length < 19 ? 'kikoBreathe 0.6s step-end infinite' : 'none' }}>|</span>
              </div>
            )}
          </div>
          {voiceActive ? (
            <button onClick={stopVoice} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (<>
            {isMobile && (
              <button onClick={() => fileInputRef.current?.click()} style={{ width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </button>
            )}
            {!isMobile && <>
            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(0,0,0,0.08)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : '#6B6B6B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
              onMouseEnter={e => { if (!transcribing) { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; e.currentTarget.style.color = '#b4b4b4' }}}
              onMouseLeave={e => { if (!transcribing) { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#6B6B6B' }}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </button>
            <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(90,100,112,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'scale(1)' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(90,100,112,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(90,100,112,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(90,100,112,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(90,100,112,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(90,100,112,0.6)" /></svg>
            </button>
          </>}</>)}
          {streaming ? (
            <button onClick={stopKiko} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (
            <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: isMobile ? 38 : 30, height: isMobile ? 38 : 30, borderRadius: 9999, background: hasContent ? '#E8700A' : '#0A0A0A', border: 'none', color: '#FFFFFF', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 1, boxShadow: hasContent ? '0 4px 16px rgba(232,112,10,0.3)' : '0 1px 3px rgba(0,0,0,0.2)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
        </div>
        ) : (
        /* ── CONVERSATION: Single row matching homepage [+menu] [textarea] [mic] [EQ] [send] ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, position: 'relative', zIndex: 2, padding: '14px 14px 14px 20px' }}>
          {!isMobile && <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(!menuOpen)} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${menuOpen ? 'rgba(90,100,112,0.2)' : C.border}`, color: '#0A0A0A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`, transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A2A30'; e.currentTarget.style.color = '#b4b4b4'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)' }}
              onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = '#555558' } e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 || 12, padding: 4, minWidth: 170, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' || '0 8px 32px rgba(0,0,0,0.5)', animation: 'enterScale 180ms cubic-bezier(0.34,1.56,0.64,1)', zIndex: 30 }}>
                {[
                  { id: 'attach', label: 'Attach files', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> },
                  { id: 'research', label: 'Deep research', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                  { id: 'brief', label: 'Brief me', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/></svg> },
                ].map(m => (
                  <button key={m.id} onClick={() => { setMenuOpen(false); if (m.id === 'attach') fileInputRef.current?.click(); else if (m.id === 'research') { setInput('Deep research: '); inputRef.current?.focus(); } else if (m.id === 'brief') { setInput('Brief me on '); inputRef.current?.focus(); } }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#6B6B6B', fontSize: 13, fontFamily: C.font, cursor: 'pointer', borderRadius: 8, transition: 'background 150ms ease' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {m.icon}<span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <textarea ref={inputRef} value={input} dir="ltr" onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (streaming) { const qt = input.trim(); if (qt) { queuedMessageRef.current = qt; setQueuedMessage(qt); setInput(''); if (inputRef.current) inputRef.current.style.height = 'auto'; } } else { handleSubmit(); } } }}
              onPaste={e => { 
                // Handle pasted images (Cmd+V screenshots)
                const items = e.clipboardData?.items
                if (items) {
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (file) processFileForKiko(file)
                      return
                    }
                  }
                }
                setTimeout(() => { if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px' } }, 0) 
              }}
              onFocus={() => setPromptFocused(true)} onBlur={() => setTimeout(() => setPromptFocused(false), 150)}
              placeholder={fileUploading ? "Processing file..." : pendingAttachments.length > 0 ? "Add a comment about your files..." : "Ask Kiko anything — deals, contacts, drafts, strategy…"}
              autoFocus rows={1}
              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: isMobile ? 17 : 15, color: '#0A0A0A', fontFamily: C.font, minHeight: 24, maxHeight: 200, fontWeight: 400, resize: 'none', lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', verticalAlign: 'middle', display: 'block', position: 'relative', zIndex: 2 }} />
          </div>
          {voiceActive ? (
            <button onClick={stopVoice} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (<>
            {isMobile && (
              <button onClick={() => fileInputRef.current?.click()} style={{ width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </button>
            )}
            {!isMobile && <>
            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(0,0,0,0.08)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : '#6B6B6B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
              onMouseEnter={e => { if (!transcribing) { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; e.currentTarget.style.color = '#b4b4b4' }}}
              onMouseLeave={e => { if (!transcribing) { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#6B6B6B' }}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              {transcribing && <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: 'rgba(34,197,94,0.9)' }} />}
            </button>
            <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(90,100,112,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'scale(1)' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(90,100,112,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(90,100,112,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(90,100,112,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(90,100,112,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(90,100,112,0.6)" /></svg>
            </button>
          </>}</>)}
          {/* Run-in-background button REMOVED — was legacy Vercel code importing @vercel/functions */}
          {streaming ? (
            <button onClick={stopKiko} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}><div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /></button>
          ) : (
            <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: isMobile ? 38 : 30, height: isMobile ? 38 : 30, borderRadius: 9999, background: hasContent ? '#E8700A' : '#0A0A0A', border: 'none', color: '#FFFFFF', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 1, boxShadow: hasContent ? '0 4px 16px rgba(232,112,10,0.3)' : '0 1px 3px rgba(0,0,0,0.2)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
        </div>
        )}
      </div>
    )
  }

  // ── Render message bubbles (shared between text and voice) ──
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text.replace(/<[^>]+>/g, '')); }
  const editAndResend = (idx) => { setEditingIdx(idx); setEditText(messages[idx]?.content || ''); }
  const stopKiko = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setStreaming(false); streamingRef.current = false; setToolStatus(null); setThinkingSteps([])
    // Save partial response if any
    if (streamTextRef.current) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamTextRef.current + '\n\n*[Stopped]*' }])
      setStreamText('')
      streamTextRef.current = ''
    }
  }
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
        {/* Kiko label with animated waveform avatar */}
        {isKiko && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: isMobile ? 32 : 28, height: isMobile ? 32 : 28, borderRadius: 10, background: '#FFFFFF', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
            <KikoAvatar size={16} state="idle" />
          </div>
          <span style={{ fontSize: isMobile ? 14 : 12, fontWeight: 500, color: 'rgba(90,100,112,0.55)', fontFamily: C.font }}>Kiko</span>
          {msg.meta?.fromBackgroundTask && <span style={{ fontSize: 9, fontWeight: 500, color: C.textTer, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 50, padding: '1px 8px', marginLeft: 4 }}>background task</span>}
        </div>}
        {/* Collapsible reasoning steps on completed messages */}
        {isKiko && msg.steps?.length > 0 && (() => {
          const isOpen = expandedSteps === i
          const completedCount = msg.steps.filter(s => !s.label?.includes('...')).length
          const totalCount = msg.steps.length
          return (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setExpandedSteps(isOpen ? null : i)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                fontSize: 12, color: 'rgba(90,100,112,0.55)', background: isOpen ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)',
                backdropFilter: isOpen ? 'blur(16px)' : 'none', WebkitBackdropFilter: isOpen ? 'blur(16px)' : 'none',
                border: `1px solid ${isOpen ? 'rgba(26,26,30,0.80)' : 'rgba(0,0,0,0.05)'}`,
                borderRadius: isOpen ? '8px 8px 0 0' : 8,
                cursor: 'pointer', fontFamily: C.font, padding: '8px 12px', fontWeight: 500,
                boxShadow: isOpen ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2" style={{ transition: 'transform 0.3s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}><path d="M6 9l6 6 6-6"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.purple }}>Kiko's reasoning</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#6B6B6B', fontWeight: 500 }}>{completedCount}/{totalCount} steps</span>
                  <div style={{ width: 48, height: 3, borderRadius: 9999, background: '#222222', overflow: 'hidden' }}>
                    <div style={{ width: `${(completedCount / totalCount) * 100}%`, height: '100%', borderRadius: 9999, background: C.purple, transition: `width 400ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }} />
                  </div>
                </div>
              </button>
              {isOpen && (
                <div style={{
                  background: 'rgba(0,0,0,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${'rgba(26,26,30,0.80)'}`, borderTop: 'none',
                  borderRadius: '0 0 8px 8px', padding: '6px 0', overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}>
                  <div style={{ padding: '0 6px' }}>
                    {msg.steps.map((step, si) => {
                      const isAgent = step.label?.includes('Agent') || step.label?.includes('agent')
                      return (
                        <div key={si} style={{ display: 'flex', gap: 10, padding: '5px 8px', borderRadius: 6 }}>
                          <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="5" fill={isAgent ? C.purple : 'rgba(90,100,112,0.4)'} opacity="0.8" />
                            </svg>
                            {si < msg.steps.length - 1 && <span style={{ flex: 1, width: 1, background: 'rgba(0,0,0,0.04)', marginTop: 3 }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: '#6B6B6B', fontFamily: C.font, fontWeight: 400, lineHeight: 1.5 }}>{step.label}</span>
                            {step.tools && <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                              {(Array.isArray(step.tools) ? step.tools : []).map((tool, ti) => (
                                <span key={ti} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#6B6B6B' }}>{tool}</span>
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
        <div style={isMobile ? {
          maxWidth: isUser ? '80%' : '85%',
          padding: '14px 18px',
          borderRadius: isUser ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
          background: isUser ? '#0A0A0A' : '#F5F4F1',
          color: isUser ? '#FEFEFC' : '#0A0A0A',
          fontSize: 16, lineHeight: 1.5, fontFamily: C.font, fontWeight: 400,
        } : {
          maxWidth: isUser ? '65%' : '100%',
          padding: isUser ? '13px 20px' : '0',
          borderRadius: isUser ? '8px 8px 4px 8px' : 0,
          background: isUser ? 'rgba(0,0,0,0.03)' : 'transparent',
          border: isUser ? `0.5px solid ${C.border}` : 'none',
          color: '#0A0A0A',
          fontSize: 15, lineHeight: 1.7, fontFamily: C.font, fontWeight: 400,
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
                  {pre && <KikoMessage content={pre} isStreaming={false} role="assistant" />}
                  {emailOnly && <EmailDraft text={emailOnly} />}
                  {postEmail && <KikoMessage content={postEmail} isStreaming={false} role="assistant" />}
                </>
              }
            }
            return displayText ? <KikoMessage content={displayText} isStreaming={false} role="assistant" /> : null
          })()}
          {/* DraftPreview DISABLED — EmailDraft handles all email rendering */}
        </div>
        </div>
        {/* Timestamp + action buttons — single row. Kiko ribbon sits left of icons. */}
        {!streaming && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginTop: 6, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {/* Timestamp */}
            <span style={{ fontSize: 11, color: '#A0A0A0', fontFamily: C.font, marginRight: 4 }}>
              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            {(() => {
              const abtn = (onClick, title, children) => (
                <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B6B6B', transition: 'all 0.12s', padding: 0 }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(90,100,112,0.1)'; e.currentTarget.style.color = '#0A0A0A' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B6B6B' }}
                >{children}</button>
              )
              const iconSz = { width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
              const CopyIcon = <svg {...iconSz} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              const EditIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              const ThumbUpIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
              const ThumbDownIcon = <svg {...iconSz} viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
              const RetryIcon = <svg {...iconSz} viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
              if (isUser) return <>{abtn(() => editAndResend(i), 'Edit', EditIcon)}{abtn(() => copyToClipboard(msg.content), 'Copy', CopyIcon)}{abtn(() => { setMessages(prev => prev.slice(0, i)); handleSubmit(msg.content.replace(/^📎[^—]*— /, '')) }, 'Retry', RetryIcon)}</>
              if (isKiko) return <>{abtn(() => copyToClipboard(msg.content), 'Copy', CopyIcon)}{abtn(() => {}, 'Good', ThumbUpIcon)}{abtn(() => {}, 'Bad', ThumbDownIcon)}{abtn(() => regenerateResponse(i), 'Retry', RetryIcon)}</>
              return null
            })()}
          </div>
        )}
        {/* Kiko Waveform signature removed — was showing persistent dots below every response */}
      </div>
    )
  })

  // ── Mobile header — approved render: serif "Kiko" + mic + bell (command centre) ──
  const MobileHeader = () => isMobile ? (
    <div style={{ padding: '10px 20px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { if (voiceActive) stopVoice(); setMobileHistoryOpen(!mobileHistoryOpen); setMobileCommandOpen(false); if (!mobileHistoryOpen) loadMobileHistory() }}
          style={{ width: 40, height: 40, borderRadius: '50%', background: mobileHistoryOpen ? '#0A0A0A' : '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mobileHistoryOpen ? '#FEFEFC' : '#6B6B6B'} strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>
        </button>
        <div onClick={startNewChat} style={{ fontFamily: "'Source Serif 4', 'Source Serif Pro', Georgia, serif", fontSize: 30, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-0.02em', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Kiko</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => { setMobileHistoryOpen(false); setMobileCommandOpen(false); navigate('/voice') }}
          style={{ width: 44, height: 44, borderRadius: '50%', background: voiceActive ? 'radial-gradient(circle at 40% 35%, rgba(35,28,55,1), rgba(15,13,22,1))' : '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: voiceActive ? '0 0 6px rgba(124,92,252,0.25)' : 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={voiceActive ? '#FFFFFF' : '#6B6B6B'} strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </button>
        <button onClick={() => { if (voiceActive) stopVoice(); setMobileCommandOpen(!mobileCommandOpen); setMobileHistoryOpen(false); if (!mobileCommandOpen) loadCommandData() }}
          style={{ width: 44, height: 44, borderRadius: '50%', background: mobileCommandOpen ? '#0A0A0A' : '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={mobileCommandOpen ? '#FEFEFC' : '#6B6B6B'} strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {alertCount > 0 && <div style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#B8643E', border: '1.5px solid #FFFFFF' }} />}
        </button>
      </div>
    </div>
  ) : null

  // ── Mobile Command Centre panel (bell icon) ──
  const MobileCommandCentre = () => {
    if (!isMobile || !mobileCommandOpen) return null
    const { replies, tasks, campaigns, recommendations, overdue } = commandData
    const timeAgo = (d) => { if (!d) return ''; const s = Math.floor((Date.now() - new Date(d)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` }
    const Sect = ({ label, icon }) => <div style={{ fontSize: 11, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 500, padding: '14px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#FFFFFF', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden', overscrollBehavior: 'none' }}>
        <div style={{ padding: '10px 20px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div onClick={() => { setMobileCommandOpen(false); startNewChat() }} style={{ fontFamily: "'Source Serif 4', 'Source Serif Pro', Georgia, serif", fontSize: 30, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-0.02em', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Kiko</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setMobileCommandOpen(false); navigate('/voice') }} style={{ width: 44, height: 44, borderRadius: '50%', background: '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </button>
            <button onClick={() => setMobileCommandOpen(false)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#0A0A0A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FEFEFC" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, padding: '4px 18px 8px', overflow: 'hidden' }}>
          {replies.length > 0 && <div style={{ padding: '5px 14px', borderRadius: 20, background: '#0A0A0A', color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</div>}
          {overdue.length > 0 && <div style={{ padding: '5px 14px', borderRadius: 20, background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{overdue.length} overdue</div>}
          {campaigns.length > 0 && <div style={{ padding: '5px 14px', borderRadius: 20, background: '#F5F4F1', color: '#6B6B6B', fontSize: 12, whiteSpace: 'nowrap' }}>{campaigns[0]?.enrolled || 0} active</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 24px', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>

          {/* Immediate action — replies */}
          {replies.length > 0 && (<>
            <Sect label="Immediate action" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C4723A" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>} />
            {replies.map(r => (
              <div key={r.id} onClick={() => { setMobileCommandOpen(false); handleSubmit(`REPLY ANALYSIS — ${r.entity_name || 'prospect'} has replied.\n\nAlert: "${r.title}"\nSnippet: "${(r.detail || '').slice(0, 200)}"\n\nRespond with: 1. LAST CORRESPONDENCE 2. WHAT THEY SAID 3. DEFINITIVE NEXT STEP 4. DRAFT REPLY`) }} style={{ background: '#fff', borderLeft: '3px solid #C4723A', padding: '14px 16px', marginBottom: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#0A0A0A' }}>{r.entity_name || r.title || 'Reply'}</div>
                  <span style={{ fontSize: 11, color: '#C4723A', fontWeight: 500 }}>Reply</span>
                </div>
                <div style={{ fontSize: 12, color: '#A0A0A0', marginTop: 2 }}>{r.title?.replace(/^Reply from /, '') || ''} · {timeAgo(r.created_at)}</div>
                {r.detail && <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{r.detail.slice(0, 120)}{r.detail.length > 120 ? '...' : ''}"</div>}
              </div>
            ))}
          </>)}

          {/* Follow-ups due */}
          {overdue.length > 0 && (<>
            <Sect label="Follow-ups due" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
            {overdue.slice(0, 4).map(t => (
              <div key={t.id} onClick={() => { setMobileCommandOpen(false); handleSubmit(`I need to follow up with ${t.contact || t.title || 'this person'} at ${t.company || 'their company'}. Give me: 1. LAST CORRESPONDENCE 2. WHY NO REPLY 3. DEFINITIVE NEXT STEP 4. DRAFT FOLLOW-UP EMAIL`) }} style={{ background: '#fff', borderLeft: '3px solid #DC2626', padding: '12px 16px', marginBottom: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>Due: follow_up — {t.company || t.contact || ''}</div>
                  <span style={{ fontSize: 11, color: '#C4723A', fontWeight: 500 }}>Task</span>
                </div>
                <div style={{ fontSize: 12, color: '#A0A0A0', marginTop: 2 }}>{t.contact || ''} · {t.dueDate ? `${Math.ceil((new Date() - new Date(t.dueDate)) / 86400000)}d overdue` : 'overdue'}</div>
              </div>
            ))}
            {overdue.length > 4 && <div onClick={() => { setMobileCommandOpen(false); navigate('/command-centre') }} style={{ textAlign: 'center', padding: '8px 0', cursor: 'pointer' }}><span style={{ fontSize: 12, color: '#C4723A', fontWeight: 500 }}>View all {overdue.length} overdue →</span></div>}
          </>)}

          {/* Campaign activity */}
          {campaigns.length > 0 && (<>
            <Sect label="Campaign activity" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>} />
            {campaigns.map(c => (
              <div key={c.id} onClick={() => { setMobileCommandOpen(false); navigate('/campaigns') }} style={{ background: '#fff', borderLeft: '3px solid #0A0A0A', padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', marginBottom: 10 }}>{c.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <div style={{ background: '#F8F7F4', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#A0A0A0' }}>Active</div><div style={{ fontSize: 18, fontWeight: 500, color: '#0A0A0A' }}>{c.enrolled}</div></div>
                  <div style={{ background: '#F8F7F4', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#A0A0A0' }}>Replied</div><div style={{ fontSize: 18, fontWeight: 500, color: '#0A0A0A' }}>{c.replied}</div></div>
                  <div style={{ background: '#F8F7F4', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#A0A0A0' }}>Bounced</div><div style={{ fontSize: 18, fontWeight: 500, color: c.bounced === 0 ? '#16A34A' : '#DC2626' }}>{c.bounced}</div></div>
                  <div style={{ background: '#F8F7F4', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#A0A0A0' }}>Steps</div><div style={{ fontSize: 18, fontWeight: 500, color: '#0A0A0A' }}>{c.steps?.length || '—'}</div></div>
                </div>
              </div>
            ))}
          </>)}

          {/* Kiko recommends */}
          {recommendations.length > 0 && (<>
            <Sect label="Kiko recommends" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C4723A" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-1.006 0-1.916.44-2.535 1.137l-.005.006"/></svg>} />
            {recommendations.slice(0, 2).map(r => (
              <div key={r.id} onClick={() => { setMobileCommandOpen(false); handleSubmit(`${r.entity_name || 'This prospect'} opened my email but hasn't replied. Draft a short, direct follow-up email for them. Include: 1. CONTEXT 2. DEFINITIVE NEXT STEP 3. DRAFT EMAIL`) }} style={{ background: '#fff', borderLeft: '3px solid #C4723A', padding: '14px 16px', marginBottom: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{r.entity_name || r.title}</div>
                <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4, lineHeight: 1.4 }}>{(r.detail || '').slice(0, 100)}{(r.detail || '').length > 100 ? '...' : ''}</div>
                <div style={{ marginTop: 10 }}><span style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 6, background: '#0A0A0A', color: '#fff', fontSize: 12, fontWeight: 500 }}>Draft follow-up</span></div>
              </div>
            ))}
          </>)}

          {/* Empty state */}
          {replies.length === 0 && overdue.length === 0 && recommendations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0A0A0' }}>
              <div style={{ fontSize: 14 }}>All clear — no immediate actions</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Kiko is monitoring your campaigns</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Mobile Chat History panel ──
  const MobileChatHistory = () => {
    if (!isMobile || !mobileHistoryOpen) return null
    const fmtTime = (d) => {
      if (!d) return ''
      const date = new Date(d), now = new Date()
      const isToday = date.toDateString() === now.toDateString()
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
      const isYesterday = date.toDateString() === yesterday.toDateString()
      const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      if (isToday) return time + ' today'
      if (isYesterday) return time + ' yesterday'
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + time
    }
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#FFFFFF', zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden', overscrollBehavior: 'none', touchAction: 'none' }}>
        <div style={{ padding: '10px 20px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMobileHistoryOpen(false)}
              style={{ width: 44, height: 44, borderRadius: '50%', background: '#0A0A0A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FEFEFC" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>
            </button>
            <div onClick={() => { setMobileHistoryOpen(false); startNewChat() }} style={{ fontFamily: "'Source Serif 4', 'Source Serif Pro', Georgia, serif", fontSize: 30, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-0.02em', cursor: 'pointer' }}>Kiko</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setMobileHistoryOpen(false); navigate('/voice') }} style={{ width: 44, height: 44, borderRadius: '50%', background: '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </button>
            <button onClick={() => { setMobileHistoryOpen(false); setMobileCommandOpen(true); loadCommandData() }} style={{ width: 44, height: 44, borderRadius: '50%', background: '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
          </div>
        </div>
        <div style={{ padding: '4px 20px 10px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>Recent conversations</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 18px 24px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
          {mobileHistoryConvos.length === 0 && <div style={{ fontSize: 14, color: '#A0A0A0', padding: '20px 0', textAlign: 'center' }}>No conversations yet</div>}
          {mobileHistoryConvos.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4 }}>
              <button onClick={async () => { 
                const { data } = await supabase.from('conversations').select('id, title, messages, updated_at').eq('id', c.id).single()
                if (data) { setMobileHistoryOpen(false); loadConversation(data) }
              }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '14px 14px', borderRadius: '12px 0 0 12px', background: c.id === activeConvId ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent', minWidth: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#0A0A0A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</div>
                  <div style={{ fontSize: 12, color: '#A0A0A0', marginTop: 2 }}>{fmtTime(c.updated_at)}</div>
                </div>
              </button>
              <button onClick={async () => {
                if (confirm('Delete this conversation?')) {
                  await supabase.from('conversations').delete().eq('id', c.id)
                  setMobileHistoryConvos(prev => prev.filter(x => x.id !== c.id))
                  if (c.id === activeConvId) startNewChat()
                }
              }} style={{ width: 44, height: 44, borderRadius: '0 12px 12px 0', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0C0C0" strokeWidth="1.8"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          ))}
          {mobileHistoryConvos.length > 0 && (
            <button onClick={() => { setMobileHistoryOpen(false); setAllChatsData({ convos: mobileHistoryConvos, onSelect: loadConversation, onDelete: async (c) => { await supabase.from('conversations').delete().eq('id', c.id); if (c.id === activeConvId) startNewChat() } }) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '16px 0', marginTop: 8, borderRadius: 12, background: 'rgba(0,0,0,0.03)', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B6B6B', fontFamily: "'Inter', system-ui, sans-serif", WebkitTapHighlightColor: 'transparent' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              All chats
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── ALL CHATS — rendered as fixed overlay below ──

  // ── WELCOME STATE (no text messages, not in voice mode) ──
  if (!hasMessages && !compact) {
    return (
      <div style={isMobile ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#FFFFFF', zIndex: 50 } : { display: 'flex', flex: 1, height: '100%', minHeight: 0, position: 'relative' }}>
      {!compact && !isMobile && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} onShowAllChats={(convos, onSelect, onDelete) => setAllChatsData({ convos, onSelect, onDelete })} />}
      <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: isMobile ? '#FFFFFF' : 'transparent', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {MobileHeader()}
        {MobileCommandCentre()}
        {MobileChatHistory()}
        {chatDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(90,100,112,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(90,100,112,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(90,100,112,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
            <p style={{ fontSize: 13, color: '#A0A0A0', fontFamily: C.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
          </div>
        )}

        {/* Center content */}
        <div id="kikoHomeContent" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: trans, minHeight: 0, padding: isMobile ? '0 24px' : '20px 32px 40px' }}>

          {/* Top spacer — desktop only, mobile content is naturally centred */}
          {!isMobile && <div style={{ flex: voiceActive ? 1 : (0.3), transition: 'flex 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />}

          {/* Wave — hidden in redesign mode, carried over from past iteration */}
          {!USE_REDESIGN_DASHBOARD && <div id="kikoWaveHome" style={{
            marginBottom: voiceActive ? 0 : (isMobile ? 20 : 28), overflow: 'visible', padding: isMobile ? '8px 0' : '16px 0',
            cursor: voiceActive ? 'default' : 'pointer',
            transform: voiceActive ? 'scale(1.15)' : 'scale(1)',
            transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
          }}>
            <KikoAvatar size={isMobile ? 40 : 64} state={voiceActive ? (voiceState.speaking ? 'responding' : 'thinking') : 'idle'} onClick={voiceActive ? undefined : () => startVoice()} />
          </div>}

          {/* Voice controls — desktop only, mobile uses fullscreen KikoVoice */}
          {!isMobile && <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            opacity: voiceActive ? 1 : 0, maxHeight: voiceActive ? 200 : 0,
            transform: voiceActive ? 'translateY(0)' : 'translateY(-20px)',
            transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
            overflow: 'hidden', pointerEvents: voiceActive ? 'auto' : 'none',
          }}>
            {/* Status bar — amber connecting, green live, red error */}
            <div style={{ width: 280, height: 3, borderRadius: 50, overflow: 'hidden', opacity: voiceState.speaking ? 0 : 1, transition: 'opacity 0.5s' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 50, background: voiceState.status === 'error' ? 'linear-gradient(90deg, transparent, rgba(255,80,80,0.5), transparent)' : voiceState.status === 'connecting' ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' : 'linear-gradient(90deg, transparent, rgba(90,100,112,0.5), transparent)', animation: 'kikoListenPulse 2s ease-in-out infinite' }} />
            </div>
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 300, fontFamily: C.font, color: voiceState.status === 'error' ? 'rgba(255,80,80,0.4)' : voiceState.status === 'connecting' ? 'rgba(245,158,11,0.3)' : voiceState.speaking ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.08)', transition: 'color 0.3s' }}>
              {voiceState.status === 'error' ? 'Connection failed' : voiceState.status === 'connecting' ? 'Connecting...' : voiceState.speaking ? 'Kiko is speaking...' : 'Listening...'}
            </div>
            <button onClick={stopVoice} style={{
              marginTop: 24, padding: '10px 28px', borderRadius: 50,
              background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.08)',
              fontSize: 13, color: '#A0A0A0', cursor: 'pointer', fontFamily: C.font,
              fontWeight: 300, transition: 'all 0.3s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,80,80,0.15)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#A0A0A0' }}
            >Goodbye Kiko</button>
          </div>}

          {/* Greeting — on desktop fades in voice mode, on mobile always visible */}
          <div id="kikoGreeting" style={isMobile ? { textAlign: 'center' } : {
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 140,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1)',
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: 36, fontWeight: 300, color: '#0A0A0A', margin: '0 0 6px', fontFamily: "'Source Serif 4', Georgia, serif", letterSpacing: '-0.018em', textAlign: 'center', lineHeight: 1.1 }}>
              {getGreeting()}, {firstName}
            </div>
            <p style={{ color: '#6B6B6B', fontSize: 13, margin: '0 0 28px', fontWeight: 450, textAlign: 'center' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          {/* Daily Briefing Card — hidden when redesign dashboard is active (replaced by priority actions) */}
          {!voiceActive && morningBriefing && !USE_REDESIGN_DASHBOARD && (
            <div style={{
              width: '100%', maxWidth: 680, margin: '20px auto 0',
              background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 12, transition: 'all 0.2s',
            }}>
              <div onClick={() => setBriefingExpanded(!briefingExpanded)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', cursor: 'pointer', borderBottom: briefingExpanded ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <span style={{ fontSize: 15 }}>📋</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A', fontFamily: C.font, letterSpacing: '0.04em' }}>DAILY BRIEFING</span>
                <span style={{ fontSize: 11, color: '#A0A0A0', fontFamily: C.font, marginLeft: 'auto' }}>{briefingExpanded ? '▲ Collapse' : '▼ Expand'}</span>
              </div>
              {!briefingExpanded && (
                <div onClick={() => setBriefingExpanded(true)} style={{ padding: '0 20px 16px', cursor: 'pointer' }}>
                  <p style={{ fontSize: 13, color: '#3A3A3A', fontFamily: C.font, lineHeight: 1.6, margin: 0, fontWeight: 400 }}>
                    {morningBriefing.slice(0, 180).replace(/^[\s\S]*?(?=Campaign|Alpine|Canadian|HEADLINE|Today)/, '')}...
                  </p>
                </div>
              )}
              {briefingExpanded && (
                <div style={{ maxHeight: 360, overflowY: 'auto', padding: '12px 20px 20px', WebkitOverflowScrolling: 'touch' }}>
                  <div style={{ fontSize: 13, color: '#2A2A2A', fontFamily: C.font, lineHeight: 1.75 }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(morningBriefing
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/^## (.+)$/gm, '<div style="font-size:13px;font-weight:700;margin:18px 0 6px;color:#0A0A0A;text-transform:uppercase;letter-spacing:0.04em">$1</div>')
                      .replace(/^# (.+)$/gm, '<div style="font-size:14px;font-weight:700;margin:14px 0 8px;color:#0A0A0A">$1</div>')
                      .replace(/^(\d+)\.\s/gm, '<strong>$1.</strong> ')
                      .replace(/^•\s/gm, '· ')
                      .replace(/\n/g, '<br/>')) }} />
                </div>
              )}
            </div>
          )}

          {/* Prompt bar — on mobile: rendered OUTSIDE kikoHomeContent (at bottom). On desktop: here */}
          {!isMobile && <div id="kikoPromptWrap" style={{
            width: '100%', maxWidth: 720, marginBottom: 14, marginTop: 48,
            opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 300,
            transform: voiceActive ? 'translateY(40px)' : 'translateY(0)',
            transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.05s',
            overflow: voiceActive ? 'hidden' : 'visible', pointerEvents: voiceActive ? 'none' : 'auto',
          }}>
                {PromptBar({ welcome: true })}
                {dictateError && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,80,80,0.7)', fontFamily: C.font, margin: '8px 0 0', animation: 'fadeIn 0.2s' }}>{dictateError}</p>
                )}
              </div>}

              {/* Alerts pill (permanent sage, left) + 4 dynamic chips — hidden on mobile */}
              {!isMobile && <div id="kikoChipsWrap" style={{
                display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center',
                flexWrap: 'wrap',
                width: '100%', maxWidth: 660,
                marginBottom: voiceActive ? 0 : 20,
                paddingTop: 4,
                opacity: voiceActive ? 0 : 1, maxHeight: voiceActive ? 0 : 80,
                transform: voiceActive ? 'translateY(30px)' : 'translateY(0)',
                transition: 'all 0.5s cubic-bezier(0.4,0,0,1) 0.1s',
                overflow: voiceActive ? 'hidden' : 'visible', pointerEvents: voiceActive ? 'none' : 'auto',
              }}>
                {/* Alerts pill — hidden when redesign dashboard is active (replaced by priority actions) */}
                {alertCount > 0 && !USE_REDESIGN_DASHBOARD && <button onClick={() => window.location.href = '/command-centre'} style={{
                  padding: '6px 14px', borderRadius: 50,
                  background: alertCount > 0 ? '#E8700A' : 'rgba(184,100,62,0.10)',
                  border: alertCount > 0 ? '1px solid #E8700A' : '1px solid rgba(184,100,62,0.20)',
                  color: alertCount > 0 ? '#FFFFFF' : '#B8643E',
                  fontSize: 12, fontWeight: alertCount > 0 ? 600 : 500,
                  cursor: 'pointer', fontFamily: C.font,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  animation: alertCount > 0 ? 'pulse-alert 2s ease-in-out infinite' : 'none',
                  transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; if (alertCount > 0) e.currentTarget.style.background = '#D4600A' }}
                  onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; if (alertCount > 0) e.currentTarget.style.background = '#E8700A' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                  {alertCount || 0} {alertCount === 1 ? 'action needed' : 'actions needed'}
                </button>}
                {/* Dynamic chips removed — only alert pill shown */}
                {USE_REDESIGN_DASHBOARD && dynamicChips.map(chip => (
                  <button key={chip.label || chip} onClick={() => { const prompt = chip.prompt || chip.label || chip; setInput(prompt); handleSubmit(prompt) }} style={{
                    padding: '5px 14px', borderRadius: 50,
                    border: '1px solid rgba(0,0,0,0.08)', background: '#fff',
                    fontSize: 12, color: '#6B6B6B', cursor: 'pointer',
                    fontFamily: C.font, fontWeight: 450,
                    transition: 'all 150ms ease', whiteSpace: 'nowrap',
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'none' }}
                  >{chip.label || chip}</button>
                ))}
              </div>}

          {/* Redesign: Priority Actions + Bento Stats + Calendar + Next Race */}
          {!isMobile && !voiceActive && USE_REDESIGN_DASHBOARD && (
            <RedesignHomeDashboard user={user} onPromptClick={(msg) => { setInput(msg); handleSubmit(msg) }} />
          )}

          {/* Bottom spacer — desktop only, mobile has prompt bar at bottom */}
          {!isMobile && <div style={{ flex: voiceActive ? 1 : 0.5, transition: 'flex 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />}
        </div>

        {/* Voice overlay — always fullscreen, captures transcript via onMessage */}
        {voiceActive && <KikoVoice onClose={stopVoice} user={user} onVoiceState={handleVoiceState} onMessage={handleVoiceMessage} micStream={voiceMicStream} />}

        {/* Notifications panel — slides from right */}
        {/* KikoInsights sidebar removed — alerts now link to Command Centre */}

        {/* Mobile prompt bar — pinned to bottom, outside centered content */}
        {isMobile && !voiceActive && (
          <div style={{ flexShrink: 0, padding: '10px 18px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
            {PromptBar({ welcome: true })}
          </div>
        )}
      </div>

      {/* All Chats overlay — fixed position, works in welcome state */}
      {allChatsData && (
        <div style={{ position: 'fixed', top: isMobile ? 0 : 60, left: 0, right: 0, bottom: 0, zIndex: isMobile ? 300 : 260, background: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
          <AllChatsView
            convos={allChatsData.convos}
            userId={user?.id}
            onSelect={(conv) => { allChatsData.onSelect(conv); setAllChatsData(null) }}
            onDelete={(conv) => { allChatsData.onDelete(conv); setAllChatsData(d => d ? { ...d, convos: d.convos.filter(c => c.id !== conv.id) } : null) }}
            onClose={() => setAllChatsData(null)}
          />
        </div>
      )}
      </div>
    )
  }

  // ── CONVERSATION STATE (text messages) ──
  return (
    <div style={isMobile ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#FFFFFF', zIndex: 50 } : { display: 'flex', flex: 1, height: '100%', minHeight: 0, position: 'relative' }}>
      {!compact && !isMobile && <ChatHistory user={user} open={historyOpen} onToggle={() => toggleHistory()} onSelectConversation={loadConversation} onNewChat={startNewChat} activeConvId={activeConvId} onShowAllChats={(convos, onSelect, onDelete) => setAllChatsData({ convos, onSelect, onDelete })} />}
    <div onDragEnter={handleFileDragEnter} onDragLeave={handleFileDragLeave} onDragOver={handleFileDragOver} onDrop={handleFileDrop}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: isMobile ? '#FFFFFF' : 'transparent', position: 'relative', overflow: 'hidden' }}>
      {MobileHeader()}
      {MobileCommandCentre()}
      {MobileChatHistory()}
      {chatDragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(90,100,112,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
          <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(90,100,112,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(90,100,112,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: '#0A0A0A', fontFamily: C.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 13, color: '#A0A0A0', fontFamily: C.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
        </div>
      )}
      <>
      {/* Chat title bar with dropdown */}
      {activeConvId && convTitle && !isMobile && (
        <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', flexShrink: 0 }}>
          {isRenaming ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <input value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setIsRenaming(false) }} autoFocus
                style={{ flex: 1, border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, background: 'rgba(0,0,0,0.03)', padding: '5px 10px', fontSize: 13, color: C.text, fontFamily: C.font, outline: 'none' }} />
              <button onClick={confirmRename} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(90,100,112,0.3)', background: 'rgba(90,100,112,0.1)', color: C.purple, cursor: 'pointer', fontFamily: C.font }}>Save</button>
            </div>
          ) : (
            <button onClick={() => setTitleMenuOpen(!titleMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, color: C.text, fontFamily: C.font, fontSize: 13, fontWeight: 500, maxWidth: '70%' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {isStarred && <span style={{ color: '#F59E0B', fontSize: 12 }}>★</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convTitle}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.4, transform: titleMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6"/></svg>
            </button>
          )}
          {/* Dropdown menu */}
          {titleMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 16, zIndex: 50, minWidth: 160, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
              <button onClick={toggleStar} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: C.text, fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <span style={{ fontSize: 14 }}>{isStarred ? '★' : '☆'}</span> {isStarred ? 'Unstar' : 'Star'}
              </button>
              <button onClick={startRename} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: C.text, fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg> Rename
              </button>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.04)', margin: '4px 8px' }} />
              <button onClick={deleteConversation} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,80,80,0.8)', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Delete
              </button>
            </div>
          )}
        </div>
      )}
      <div ref={scrollContainerRef} onScroll={(e) => {
        if (isProgrammaticScroll.current) return // Don't update scroll state during auto-scroll
        const el = e.currentTarget
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
        setShowScrollDown(!atBottom)
        if (streaming && !atBottom) userScrolledUp.current = true
        if (streaming && atBottom) userScrolledUp.current = false
      }} style={{ flex: 1, overflowY: 'auto', padding: compact ? 16 : (isMobile ? 16 : 24), position: 'relative' }}>
        <div style={{ maxWidth: compact ? '100%' : (isMobile ? '100%' : 680), margin: '0 auto', width: '100%' }}>
          {messages.length > 40 && !showAllMsgs && (
            <button onClick={() => setShowAllMsgs(true)} style={{ display: 'block', margin: '0 auto 16px', padding: '6px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.14)', color: '#A0A0A0', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
              Show {messages.length - 40} earlier messages
            </button>
          )}
          {renderMessages(showAllMsgs ? messages : messages.slice(-40))}
          {/* Thinking indicator — glass panel with animated waveform */}
          {streaming && !streamText && (
            <div style={{ marginBottom: 24, padding: '12px 0' }}>
              <div style={{ maxWidth: isMobile ? '85%' : 480 }}>
                <div style={isMobile ? {
                  padding: '14px 18px', borderRadius: '20px 20px 20px 4px',
                  background: '#F5F4F1',
                } : {
                  padding: '16px 20px', borderRadius: 16,
                  background: '#FFFFFF', backdropFilter: 'blur(20px) saturate(1.3)', WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
                  border: '0.5px solid rgba(0,0,0,0.08)',
                  borderTop: '0.5px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(0,0,0,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <KikoAvatar size={16} state="thinking" />
                    </div>
                    <span style={{ fontSize: 14, color: 'rgba(90,100,112,0.75)', fontFamily: C.font, fontWeight: 400, flex: 1 }}>
                      {toolStatus || 'Kiko is thinking...'}
                    </span>
                    <button onClick={stopKiko} style={{ padding: '5px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#A0A0A0', fontSize: 12, cursor: 'pointer', fontFamily: C.font, flexShrink: 0, transition: 'all 0.15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = '#6B6B6B' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#A0A0A0' }}
                    >Stop</button>
                  </div>
                  {/* Progress shimmer bar */}
                  <div style={{ height: 2, borderRadius: 9999, background: 'rgba(0,0,0,0.04)', marginTop: 12, overflow: 'hidden' }}>
                    <div style={{ width: '40%', height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg, rgba(90,100,112,0.3), rgba(90,100,112,0.6), rgba(90,100,112,0.3))', backgroundSize: '200% 100%', animation: 'glowShimmer 2s linear infinite' }} />
                  </div>
                </div>
                {thinkingSteps.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <button onClick={() => setShowSteps(!showSteps)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      fontSize: 12, color: '#0A0A0A',
                      background: '#FFFFFF',
                      border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
                      cursor: 'pointer', fontFamily: C.font, padding: '9px 12px', fontWeight: 500,
                      transition: 'border-color 0.15s, background 0.15s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)' }}
                    >
                      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid rgba(125,138,100,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7d8a64" strokeWidth="2.5"><path d={showSteps ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}/></svg>
                      </span>
                      <span>Kiko's plan</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A0A0A0', fontVariantNumeric: 'tabular-nums' }}>
                        {streaming ? `${thinkingSteps.length} steps` : `${thinkingSteps.length} steps · done`}
                      </span>
                    </button>
                    <div style={{ display: showSteps ? 'block' : 'none' }}>
                      <div style={{ padding: '10px 0 4px 6px' }}>
                        {thinkingSteps.map((step, si) => {
                          const isLast = si === thinkingSteps.length - 1
                          const isInProgress = isLast && streaming
                          const isDone = !isInProgress
                          return (
                            <div key={si} style={{ display: 'flex', gap: 10, padding: '5px 0' }}>
                              <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                {/* Status icon */}
                                {isInProgress ? (
                                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(125,138,100,0.35)', borderTopColor: '#7d8a64', flexShrink: 0, animation: 'spinSlow 0.8s linear infinite' }} />
                                ) : isDone ? (
                                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(125,138,100,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#5a6644" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  </span>
                                ) : (
                                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
                                )}
                                {!isLast && <span style={{ flex: 1, width: 1, background: 'rgba(0,0,0,0.06)', marginTop: 4, minHeight: 10 }} />}
                              </div>
                              <span style={{
                                fontSize: 12.5,
                                color: isInProgress ? '#0A0A0A' : '#6B6B6B',
                                fontFamily: C.font, fontWeight: isInProgress ? 500 : 400, lineHeight: 1.5,
                              }}>{step.label}</span>
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
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(90,100,112,0.55)', fontFamily: C.font, marginBottom: 6 }}>Kiko</div>
              <KikoMessage content={stripToolXml(streamText)} isStreaming={true} role="assistant" />
              <button onClick={stopKiko} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#A0A0A0', fontSize: 12, cursor: 'pointer', fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
              background: 'rgba(0,0,0,0.14)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '0.5px solid rgba(0,0,0,0.08)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'all 0.2s',
              color: '#6B6B6B',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#0A0A0A' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.14)'; e.currentTarget.style.color = '#6B6B6B' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </button>
        </div>
      )}
      </>
      <div style={{ padding: compact ? 12 : (isMobile ? '8px 16px' : 16), paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : undefined, flexShrink: 0 }}>
        <div style={{ maxWidth: compact ? '100%' : (isMobile ? '100%' : 680), margin: '0 auto' }}>
          {PromptBar({})}
          {!isMobile && dictateError && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#C62828', fontFamily: C.font, margin: '6px 0 0' }}>{dictateError}</p>
          )}
          {!isMobile && <p style={{ textAlign: 'center', fontSize: 11, color: '#A0A0A0', fontFamily: C.font, margin: '8px 0 0', fontWeight: 300 }}>Kiko is AI and can make mistakes. Please double-check responses.</p>}
        </div>
      </div>
      {/* Voice overlay — always fullscreen, captures transcript via onMessage */}
      {voiceActive && <KikoVoice onClose={stopVoice} user={user} onVoiceState={handleVoiceState} onMessage={handleVoiceMessage} micStream={voiceMicStream} />}

      {/* All Chats overlay — fixed position, guaranteed to render on top */}
      {allChatsData && (
        <div style={{ position: 'fixed', top: isMobile ? 0 : 60, left: 0, right: 0, bottom: 0, zIndex: isMobile ? 300 : 260, background: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
          <AllChatsView
            convos={allChatsData.convos}
            userId={user?.id}
            onSelect={(conv) => { allChatsData.onSelect(conv); setAllChatsData(null) }}
            onDelete={(conv) => { allChatsData.onDelete(conv); setAllChatsData(d => d ? { ...d, convos: d.convos.filter(c => c.id !== conv.id) } : null) }}
            onClose={() => setAllChatsData(null)}
          />
        </div>
      )}
    </div>
    </div>
  )
}
