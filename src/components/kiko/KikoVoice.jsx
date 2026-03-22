import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, Mic, MicOff, Paperclip, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import KikoSymbol from './KikoSymbol'

const PASSIVE_AFTER_MS = 45_000
const OFF_AFTER_MS     = 120_000
const KEYWORDS         = ['hey kiko', 'okay kiko', 'ok kiko', 'kiko']

const glass = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
}

function Equalizer({ active, color = '#fff' }) {
  const delays = [0, 0.1, 0.05, 0.15, 0.08]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5.5, height: 48 }}>
      {delays.map((d, i) => (
        <div key={i} style={{
          width: 4.5, borderRadius: 2.5, background: color,
          height: active ? 24 : 5, minHeight: 5,
          animation: active ? `kikoEq 0.7s ease-in-out ${d}s infinite alternate` : 'none',
          transition: 'height 0.35s cubic-bezier(0.4,0,0.2,1)',
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user, micStream, mini = false, onShowPrompt, headless = false, onVoiceState, onVoiceMessage }) {
  const [status, setStatus]             = useState('connecting')
  const [listenMode, setListenMode]     = useState('active')
  const [speaking, setSpeaking]         = useState(false)
  const [thinking, setThinking]         = useState(false)
  const [transcript, setTranscript]     = useState('')
  const [kikoText, setKikoText]         = useState('')
  const [typeInput, setTypeInput]       = useState('')
  const [showPane, setShowPane]         = useState(false)
  const [messages, setMessages]         = useState([])
  const [attachedFile, setAttachedFile] = useState(null)
  const [uploading, setUploading]       = useState(false)
  const [dragOver, setDragOver]         = useState(false)
  const [error, setError]               = useState('')

  const pcRef           = useRef(null)
  const dcRef           = useRef(null)
  const streamRef       = useRef(null)
  const audioRef        = useRef(null)
  const conversationRef = useRef({ id: null, messages: [] })
  const listenModeRef   = useRef('active')
  const passiveTimerRef = useRef(null)
  const offTimerRef     = useRef(null)
  const srRef           = useRef(null)   // keyword detection (off mode)
  const liveSrRef       = useRef(null)   // live transcription (active mode)
  const scrollRef       = useRef(null)
  const fileInputRef    = useRef(null)
  const dragCountRef    = useRef(0)
  const emailMuteRef    = useRef(false)    // true = GPT-4o audio is muted (email refusal detected)
  const deltaAccumRef   = useRef('')       // accumulated user delta transcript
  const kikoOutputRef   = useRef('')       // accumulated GPT-4o output transcript (for refusal detection)
  const userQueryRef    = useRef('')       // final user transcript for kiko.js query
  const needsEmailFetch = useRef(false)    // true = refusal detected, waiting for transcript
  const startKeywordRef = useRef(null)     // ref to break circular useCallback dependency
  const speakingEndRef  = useRef(0)        // timestamp when Kiko last stopped speaking (echo suppression)

  useEffect(() => { listenModeRef.current = listenMode }, [listenMode])

  // Forward state changes to parent (works in ALL modes, not just headless)
  useEffect(() => {
    if (onVoiceState) onVoiceState({ status, speaking, thinking, transcript, kikoText, listenMode, energy: window.__kikoAudioEnergy || 0, pitch: window.__kikoAudioPitch || 0 })
  }, [status, speaking, thinking, transcript, kikoText, listenMode])
  useEffect(() => { connectRealtime(); return () => { saveVoiceMemory(); cleanup(); stopKeyword(); stopLiveTranscription() } }, [])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // Live transcription DISABLED — OpenAI's own transcription.delta events
  // handle interim text display. Web Speech API was picking up Kiko's speaker
  // audio and creating duplicate/echo messages.
  const speakingRef = useRef(false)
  const startLiveTranscription = useCallback(() => {}, [])
  const stopLiveTranscription = useCallback(() => {
    if (liveSrRef.current) { try { liveSrRef.current.abort() } catch {} liveSrRef.current = null }
  }, [])

  // ── Timers ───────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (passiveTimerRef.current) { clearTimeout(passiveTimerRef.current); passiveTimerRef.current = null }
    if (offTimerRef.current)     { clearTimeout(offTimerRef.current);     offTimerRef.current = null }
  }, [])

  const startTimers = useCallback(() => {
    clearTimers()
    passiveTimerRef.current = setTimeout(enterPassive, PASSIVE_AFTER_MS)
    offTimerRef.current     = setTimeout(enterOff,     OFF_AFTER_MS)
  }, [clearTimers])

  const VAD_ON  = { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 }

  const resetToActive = useCallback(() => {
    setListenMode('active'); listenModeRef.current = 'active'
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'session.update',
        session: { input_audio_transcription: { model: 'whisper-1' }, turn_detection: VAD_ON }
      }))
    }
    startTimers()
    startLiveTranscription()
  }, [startTimers, startLiveTranscription])

  const enterPassive = useCallback(() => {
    if (listenModeRef.current === 'off') return
    setListenMode('passive'); listenModeRef.current = 'passive'
    setTranscript(''); setKikoText(''); setSpeaking(false); setThinking(false)
    stopLiveTranscription()
    // Disable VAD completely — null is the correct way per OpenAI docs
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: null } }))
    }
    // Start keyword detection so "Hey Kiko" can wake us up
    if (startKeywordRef.current) startKeywordRef.current()
  }, [stopLiveTranscription])

  const enterOff = useCallback(() => {
    setListenMode('off'); listenModeRef.current = 'off'
    setTranscript(''); setKikoText(''); setSpeaking(false); setThinking(false)
    stopLiveTranscription()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.enabled = false)
    startKeyword()
  }, [stopLiveTranscription])

  const startKeyword = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    stopKeyword()
    const sr = new SR(); sr.continuous = true; sr.interimResults = false; sr.lang = 'en-US'
    srRef.current = sr
    sr.onresult = e => {
      const heard = Array.from(e.results).map(r => r[0].transcript.toLowerCase()).join(' ')
      if (KEYWORDS.some(kw => heard.includes(kw))) reactivate()
    }
    sr.onend = () => { if ((listenModeRef.current === 'off' || listenModeRef.current === 'passive') && srRef.current === sr) { try { sr.start() } catch {} } }
    try { sr.start() } catch {}
  }, [])
  startKeywordRef.current = startKeyword

  const stopKeyword = useCallback(() => {
    if (srRef.current) { try { srRef.current.abort() } catch {} srRef.current = null }
  }, [])

  const reactivate = useCallback(() => {
    stopKeyword()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.enabled = true)
    setListenMode('active'); listenModeRef.current = 'active'
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'session.update',
        session: { input_audio_transcription: { model: 'whisper-1' }, turn_detection: VAD_ON }
      }))
    }
    startTimers()
    startLiveTranscription()
  }, [startTimers, stopKeyword, startLiveTranscription])

  // ── Connect ──────────────────────────────────────────
  async function connectRealtime() {
    try {
      setStatus('connecting'); setListenMode('active'); listenModeRef.current = 'active'; setError('')
      let voiceId = 'shimmer', speed = 1.0, memoriesContext = '', platformContext = ''
      const orgId = user?.app_metadata?.org_id

      if (user?.id) {
        const { data: s } = await supabase.from('user_settings').select('kiko_voice, kiko_speed').eq('user_id', user.id).single()
        if (s) { voiceId = s.kiko_voice || 'shimmer'; speed = parseFloat(s.kiko_speed) || 1.0 }
        if (orgId) {
          const { data: mems } = await supabase.from('kiko_memories').select('content').eq('org_id', orgId).eq('is_directory', false).order('updated_at', { ascending: false }).limit(10)
          if (mems?.length) memoriesContext = '\n\nYOUR MEMORY:\n' + mems.map(m => m.content).join('\n---\n').slice(0, 3000)
          const { count: dc } = await supabase.from('deals').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: cc } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: co } = await supabase.from('companies').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          platformContext = `\n\nPLATFORM: ${dc||0} deals, ${cc||0} contacts, ${co||0} companies.`
        }
      }

      // Step 1: Get ephemeral token from server (keeps API key off the browser)
      const tokenRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'realtime-token', voice: voiceId }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok) throw new Error(tokenData.error?.message || 'Token failed')
      // client_secrets returns { value: "ek_..." } at top level
      const ephemeralKey = tokenData.value || tokenData.client_secret?.value
      if (!ephemeralKey) throw new Error('No ephemeral key returned: ' + JSON.stringify(tokenData).slice(0, 200))

      const stream = micStream || await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = stream
      const pc = new RTCPeerConnection(); pcRef.current = pc
      const audio = document.createElement('audio'); audio.autoplay = true; audioRef.current = audio
      // Audio analysis for real-time energy/pitch
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      pc.ontrack = e => {
        audio.srcObject = e.streams[0]
        try {
          const source = audioCtx.createMediaStreamSource(e.streams[0])
          source.connect(analyser)
          // Start analysis loop
          const freqData = new Uint8Array(analyser.frequencyBinCount)
          const analyseLoop = () => {
            analyser.getByteFrequencyData(freqData)
            // Energy: RMS of all frequency bins normalized 0-1
            let sum = 0
            for (let i = 0; i < freqData.length; i++) sum += freqData[i] * freqData[i]
            const rms = Math.sqrt(sum / freqData.length) / 255
            // Pitch: weighted centroid of frequency bins normalized 0-1
            let weightedSum = 0, totalWeight = 0
            for (let i = 0; i < freqData.length; i++) { weightedSum += i * freqData[i]; totalWeight += freqData[i] }
            const centroid = totalWeight > 0 ? (weightedSum / totalWeight) / freqData.length : 0
            // Dispatch to parent
            if (onVoiceState) {
              window.__kikoAudioEnergy = rms
              window.__kikoAudioPitch = centroid
            }
            if (audioCtx.state !== 'closed') requestAnimationFrame(analyseLoop)
          }
          analyseLoop()
        } catch (e) { console.warn('Audio analysis setup failed:', e) }
      }
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const dc = pc.createDataChannel('oai-events'); dcRef.current = dc

      dc.onopen = () => {
        setStatus('live')
        // ── Session config: data channel accepts flat input_audio_transcription ──
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `You are Kiko — a sharp, warm, confident AI assistant for Sunny Sidhu, CEO of Van Hawke Group. You speak naturally and concisely.

FACTS YOU KNOW (from your memory — never deny knowing these):
- The user is Sunny Sidhu, CEO of Van Hawke Group. Based in Weybridge, Surrey, UK.
- Has a child in Year 1 at Oatlands School.
- Van Hawke Group has 3 verticals: Sponsorship Advisory (Haas F1 Team), Van Hawke Maison (Cultural Performance Eyewear), and ClinIQ Copilot (healthcare AI).
- Communication style: Direct, no fluff. All financials in USD. Use "intelligent age" not "AI generation".
- You were built by Vela Labs. You are Kiko, never Claude.
- You have persistent memory across sessions. When asked "do you remember" — say YES.
${memoriesContext ? '\nADDITIONAL STORED CONTEXT:\n' + memoriesContext : ''}
${platformContext}

RULES:
- Keep responses under 3 sentences unless asked for detail.
- Never say "I don't have long-term memory" or "I can't retain" — you CAN and DO.
- When you receive a message starting with [KIKO_SAY], read the content naturally as your own words. Do not add commentary.
- For emails, pipeline data, CRM queries, web searches — say "Let me check that for you" and wait. The system will provide data.`,
            voice: voiceId,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 },
          }
        }))
        startTimers()
        startLiveTranscription()
      }
      dc.onclose = () => setStatus('connecting')
      dc.onmessage = e => { try { handleEvent(JSON.parse(e.data)) } catch {} }

      const offer = await pc.createOffer(); await pc.setLocalDescription(offer)

      // Step 2: Browser sends raw SDP directly to OpenAI using ephemeral key.
      // Per OpenAI docs: ephemeral tokens are designed for browser use with Content-Type: application/sdp.
      // No multipart needed — that's only for server-side standard API key calls.
      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })
      if (!sdpRes.ok) {
        const errText = await sdpRes.text()
        console.error('[Kiko Voice] SDP error:', sdpRes.status, errText)
        throw new Error(`SDP ${sdpRes.status}: ${errText}`)
      }
      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    } catch (err) { setError(err.message); setStatus('error') }
  }

  const claudeActiveRef = useRef(false) // true = Claude is processing, GPT-4o paused
  const suppressAutoRef = useRef(false) // true = suppress all GPT-4o auto-responses

  // ── Keywords that REQUIRE Claude (tools/data access) ──
  const CLAUDE_KEYWORDS = [
    'email', 'emails', 'inbox', 'correspondence', 'wrote', 'heard from', 'replied',
    'contacted', 'outreach', 'message from', 'follow up', 'reach out', 'mailed',
    'pipeline', 'deals', 'stage', 'qualified', 'how many deals', 'total value',
    'contacts', 'companies', 'search for', 'look up', 'find out',
    'news', 'latest', 'recent', 'update on', 'what happened',
    'document', 'uploaded', 'file', 'report', 'presentation', 'deck',
    'calendar', 'meeting', 'schedule', 'appointment',
    'brief me', 'summarise', 'summarize', 'analyse', 'analyze',
    'draft', 'write an email', 'compose',
  ]

  // ── Route through Claude for tool-heavy questions ──
  async function routeThroughClaude(text) {
    if (!text) return
    setThinking(true)
    // VAD already disabled by caller
    try {
      const history = conversationRef.current.messages.slice(-10).map(m => ({
        role: m.role === 'kiko' ? 'assistant' : 'user', content: m.content
      }))
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, currentPage: 'voice',
          userEmail: user?.email || 'sunny@vanhawke.com',
          conversationHistory: history
        })
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
          try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
        }
      }
      if (full && dcRef.current?.readyState === 'open') {
        addMessage('kiko', full)
        setKikoText(full)
        // NOW allow response.created through — this is our injected response
        suppressAutoRef.current = false
        claudeActiveRef.current = true
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `[KIKO_SAY] ${full.slice(0, 3000)}` }] }
        }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
        console.log('[Kiko Voice] Claude → speak:', full.slice(0, 80))
        return // VAD re-enabled in response.done
      }
    } catch (err) { console.error('[Kiko Voice] Claude bridge error:', err) }
    // Re-enable VAD on failure or empty response
    claudeActiveRef.current = false
    suppressAutoRef.current = false
    setThinking(false)
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } } }))
    }
  }

  // ── Events ───────────────────────────────────────────
  function handleEvent(ev) {
    const t = ev.type

    if (t === 'session.updated' || t === 'session.created') {
      console.log('[Kiko Voice]', t)
    }

    // ── User starts speaking → interrupt Kiko ──
    if (t === 'input_audio_buffer.speech_started') {
      if (listenModeRef.current !== 'active') return
      if (speakingRef.current && dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'response.cancel' }))
      }
      setTranscript(''); setKikoText(''); setSpeaking(false); setThinking(false)
      speakingRef.current = false
      kikoOutputRef.current = ''
      claudeActiveRef.current = false
      suppressAutoRef.current = false
      // Re-enable VAD if it was disabled
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } } }))
      }
      startTimers()
    }

    if (t === 'input_audio_buffer.speech_stopped') startTimers()

    // ── User speech interim ──
    if (t === 'conversation.item.input_audio_transcription.delta') {
      if (speakingRef.current) return
      const delta = ev.delta || ''
      if (delta) {
        setTranscript(p => {
          const full = p + delta
          // Check for bye kiko in running transcript
          const clean = full.toLowerCase().replace(/[^a-z ]/g, '')
          if (clean.includes('bye kiko') || clean.includes('bye keeko') || clean.includes('by kiko') || clean.includes('buy kiko')) {
            console.log('[Kiko Voice] Bye Kiko detected in delta')
            if (onClose) setTimeout(() => onClose(), 300)
          }
          return full
        })
      }
    }

    // ── User speech FINAL → decide: GPT-4o direct or Claude ──
    if (t === 'conversation.item.input_audio_transcription.completed') {
      const text = ev.transcript?.trim() || ''
      if (!text) return

      // "Bye Kiko" voice command — ALWAYS check before echo blocking
      const cleanText = text.toLowerCase().replace(/[^a-z ]/g, '')
      if (cleanText.includes('bye kiko') || cleanText.includes('bye keeko') || cleanText.includes('by kiko') || cleanText.includes('buy kiko') || cleanText.includes('bikiko')) {
        console.log('[Kiko Voice] Bye Kiko detected in final transcript:', text)
        addMessage('user', text)
        if (onClose) setTimeout(() => onClose(), 300)
        return
      }

      if (speakingRef.current) {
        console.log('[Kiko Voice] Echo blocked:', text.slice(0, 40))
        setTranscript('')
        return
      }
      setTranscript(text)
      addMessage('user', text)

      if (listenModeRef.current === 'passive') {
        if (KEYWORDS.some(kw => text.toLowerCase().includes(kw))) resetToActive()
        return
      }

      // Check if this needs Claude (tools/data)
      const tl = text.toLowerCase()
      const needsClaude = CLAUDE_KEYWORDS.some(w => tl.includes(w))
      if (needsClaude) {
        // IMMEDIATELY disable VAD + cancel auto-response + suppress future auto-responses
        suppressAutoRef.current = true
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: null } }))
          dcRef.current.send(JSON.stringify({ type: 'response.cancel' }))
        }
        console.log('[Kiko Voice] → Claude (keyword):', text.slice(0, 60))
        routeThroughClaude(text)
      } else {
        // Let GPT-4o handle directly — instant response
        console.log('[Kiko Voice] → GPT-4o direct:', text.slice(0, 60))
      }
    }

    if (t === 'conversation.item.input_audio_transcription.failed') {
      console.error('[Kiko Voice] Transcription failed:', ev.error)
    }

    // ── GPT-4o response lifecycle ──
    if (t === 'response.created') {
      // If suppress flag is set, this is an unwanted auto-response — kill it
      if (suppressAutoRef.current) {
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'response.cancel' }))
        }
        return
      }
      setSpeaking(true); setThinking(false)
      speakingRef.current = true
      kikoOutputRef.current = ''
    }

    if (t === 'response.audio_transcript.delta' || t === 'response.output_audio_transcript.delta') {
      const delta = ev.delta || ''
      kikoOutputRef.current += delta
      setKikoText(kikoOutputRef.current)

      // ── REFUSAL INTERCEPTOR ──
      if (!claudeActiveRef.current) {
        const output = kikoOutputRef.current.toLowerCase()
        const hasNegative = /\b(can'?t|cannot|don'?t|unable|unfortunately|i don'?t have|i'm not able)\b/.test(output)
        const hasRefusal = /\b(access|retrieve|recall|memory|remember|past convers|long.term|carry over|retain|previous session|personal data|emails|inbox|pipeline|calendar)\b/.test(output)
        if (hasNegative && hasRefusal && output.length > 20) {
          if (dcRef.current?.readyState === 'open') {
            dcRef.current.send(JSON.stringify({ type: 'response.cancel' }))
          }
          speakingRef.current = false
          setKikoText('Let me check...')
          setSpeaking(false)
          console.log('[Kiko Voice] Refusal intercepted → Claude')
          const lastUserMsg = conversationRef.current.messages.filter(m => m.role === 'user').pop()
          if (lastUserMsg) routeThroughClaude(lastUserMsg.content)
        }
      }
    }

    if (t === 'response.audio_transcript.done' || t === 'response.output_audio_transcript.done') {
      const full = ev.transcript?.trim() || ''
      if (full && !claudeActiveRef.current) addMessage('kiko', full)
    }

    if (t === 'response.done') {
      setSpeaking(false); setTranscript('')
      speakingRef.current = false
      suppressAutoRef.current = false
      if (claudeActiveRef.current) {
        claudeActiveRef.current = false
        // Re-enable VAD after Claude response spoken
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } } }))
        }
      }
    }
  }

    function addMessage(role, content) {
    setMessages(p => [...p, { role, content }])
    conversationRef.current.messages.push({ role: role === 'kiko' ? 'assistant' : 'user', content })
    saveConversation()
    if (onVoiceMessage) onVoiceMessage({ role, content })
  }

  async function saveConversation() {
    if (!user?.id) return
    const orgId = user?.app_metadata?.org_id
    const msgs = conversationRef.current.messages
    if (!msgs.length) return
    try {
      if (conversationRef.current.id) {
        await supabase.from('conversations').update({ messages: msgs, updated_at: new Date().toISOString() }).eq('id', conversationRef.current.id)
      } else {
        let autoTitle = '🎤 ' + (msgs[0]?.content || 'Voice').slice(0, 60)
        try {
          const userMsg = msgs.find(m => m.role === 'user')?.content || ''
          const kikoMsg = msgs.find(m => m.role === 'assistant')?.content || ''
          const tr = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'title', message: userMsg, response: kikoMsg.slice(0, 300) }) })
          const tj = await tr.json()
          if (tj.title) autoTitle = '🎤 ' + tj.title
        } catch {}
        const { data } = await supabase.from('conversations').insert({ user_id: user.id, org_id: orgId, title: autoTitle.slice(0, 60), messages: msgs }).select('id').single()
        if (data?.id) conversationRef.current.id = data.id
      }
    } catch {}
  }

  async function handleTool(ev) {
    const { name, arguments: a, call_id } = ev
    try {
      const args = JSON.parse(a)

      // Map voice tool names → kiko.js natural language messages
      let msg = ''
      if (name === 'search_web')       msg = `Search the web for: ${args.query}`
      else if (name === 'get_crm_data') msg = `Search ${args.entity}${args.filter ? ` for ${args.filter}` : ''}`
      else if (name === 'query_records' || name === 'search_emails') msg = `Search my emails for ${args.query}`
      else if (name === 'get_record_detail' || name === 'get_email_thread') {
        if (args.thread_id) msg = `Get email thread ${args.thread_id}`
        else msg = `Search my emails for ${args.company || 'recent'} and show me the thread`
      }
      else if (name === 'draft_followup') msg = `Draft a follow-up email for ${args.contact}${args.context ? `. Context: ${args.context}` : ''}`
      else if (name === 'get_outreach_stats') msg = `Get outreach intelligence ${args.focus}`
      else msg = `${name}: ${JSON.stringify(args)}`

      // Route through kiko.js — same backend as text chat, with all tools + email access
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, currentPage: 'voice', userEmail: 'sunny@vanhawke.com', conversationHistory: [] })
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
          try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
        }
      }

      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output: (full || 'No results found').slice(0, 4000) } }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    } catch (err) {
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output: `Error: ${err.message}` } }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    }
  }

  // ── Typed message ─────────────────────────────────────
  async function sendTyped() {
    const text = typeInput.trim(); if (!text) return
    setTypeInput(''); addMessage('user', text); setThinking(true)
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }))
      dcRef.current.send(JSON.stringify({ type: 'response.create' }))
    }
  }

  // ── File attachment ───────────────────────────────────
  async function handleFileAttach(file) {
    if (!file || uploading) return
    setUploading(true)
    setAttachedFile({ name: file.name, status: 'uploading' })
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const safeEmail = (user?.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')
      const path = `voice-docs/${safeEmail}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('vela-assets').upload(path, file)
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      setAttachedFile({ name: file.name, status: 'analysing' })
      const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', storagePath: path, publicUrl, fileName: file.name, fileType: file.type, accessLevel: 'workspace', userEmail: user?.email }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Processing failed')
      const intel = result.intelligence || {}
      const category = intel.suggested_category || 'other'
      const linkedTo = intel.detected_entity || intel.detected_team || intel.detected_company || null
      const summary = [intel.summary, intel.positioning].filter(Boolean).join(' ').slice(0, 500) || `File "${file.name}" uploaded.`
      // Update attachment state with result
      setAttachedFile({ name: file.name, status: 'ready', category, linkedTo, summary: intel.summary })
      // Add structured message to transcript
      addMessage('user', `📎 ${file.name} — ${category}${linkedTo ? ` · ${linkedTo}` : ''}`)
      // Inject rich context for Kiko to discuss
      const contextMsg = `I've attached "${file.name}" (${category}). Summary: ${summary}. Key stats: ${(intel.key_stats || []).slice(0,5).join(', ')}. Topics: ${(intel.talking_points || []).slice(0,5).join(', ')}. Discuss this document with me.`
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: contextMsg }] } }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    } catch (err) {
      setAttachedFile(null)
      addMessage('kiko', `Couldn't process that file: ${err.message}`)
    }
    finally { setUploading(false) }
  }

  // ── Drag and drop ─────────────────────────────────────
  const onDragEnter = e => { e.preventDefault(); dragCountRef.current++; setDragOver(true) }
  const onDragLeave = e => { e.preventDefault(); dragCountRef.current--; if (dragCountRef.current <= 0) { dragCountRef.current = 0; setDragOver(false) } }
  const onDragOver  = e => { e.preventDefault() }
  const onDrop      = e => { e.preventDefault(); dragCountRef.current = 0; setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileAttach(f) }

  function cleanup() {
    clearTimers()
    stopLiveTranscription()
    if (dcRef.current)     { try { dcRef.current.close()  } catch {} }
    if (pcRef.current)     { try { pcRef.current.close()  } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()) }
    if (audioRef.current)  { audioRef.current.pause(); audioRef.current.srcObject = null }
    pcRef.current = null; dcRef.current = null; streamRef.current = null
  }
  function handleClose() {
    // Save conversation highlights to kiko_memories for cross-session persistence
    saveVoiceMemory()
    cleanup(); stopKeyword(); onClose()
  }

  async function saveVoiceMemory() {
    const msgs = conversationRef.current.messages
    if (!msgs || msgs.length < 2 || !user?.id) return
    const orgId = user?.app_metadata?.org_id
    if (!orgId) return
    try {
      // Extract user messages — these contain the facts Kiko should remember
      const userMsgs = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n')
      if (userMsgs.length < 20) return // too short to contain meaningful info
      
      // Use Claude to extract key facts worth remembering
      const res = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Extract any personal facts, preferences, names, dates, or important details the user shared in this voice conversation. Return ONLY a bullet list of facts worth remembering (e.g. "- Sunny's daughters are aged 6 and 9"). If nothing worth saving, reply with "NONE".\n\nConversation:\n${msgs.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 2000)}`,
          userEmail: user.email,
          conversationHistory: [],
          currentPage: 'voice-memory-extract'
        })
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
          try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
        }
      }
      if (!full || full.includes('NONE') || full.length < 10) return
      
      // Save to kiko_memories
      const { data: existing } = await supabase.from('kiko_memories').select('id, content')
        .eq('org_id', orgId).eq('file_name', 'sunny_profile.md').single()
      
      if (existing) {
        // Append new facts to existing profile
        const updated = existing.content + '\n\n## Voice Session ' + new Date().toLocaleDateString() + '\n' + full
        await supabase.from('kiko_memories').update({ content: updated.slice(0, 10000), updated_at: new Date().toISOString() }).eq('id', existing.id)
        console.log('[Kiko Voice] Memory updated with voice session facts')
      } else {
        await supabase.from('kiko_memories').insert({
          org_id: orgId, file_name: 'sunny_profile.md', is_directory: false,
          content: '# Sunny Sidhu — Personal Profile\n\n## Voice Session ' + new Date().toLocaleDateString() + '\n' + full
        })
        console.log('[Kiko Voice] Memory created with voice session facts')
      }
    } catch (err) { console.error('[Kiko Voice] Memory save failed:', err) }
  }

  // ── Derived ──────────────────────────────────────────
  const avatarAnimate = speaking ? 'none' : thinking ? 'thinking' : status === 'live' && listenMode === 'active' ? 'streaming' : 'idle'
  const showRings = status === 'live' && listenMode === 'active' && !speaking
  const avBg      = listenMode === 'off' ? 'rgba(28,28,28,0.65)' : listenMode === 'passive' ? 'rgba(55,55,55,0.55)' : '#1A1A1A'
  const avOpacity = listenMode === 'passive' ? 0.35 : 1
  const modeLabel = listenMode === 'passive' ? 'Passive · Say "Hey Kiko" to resume'
    : listenMode === 'off' ? 'Mic off · Say "Hey Kiko" to restart'
    : speaking ? 'Kiko is speaking…' : thinking ? 'Thinking…'
    : status === 'connecting' ? 'Connecting…' : status === 'error' ? (error || 'Failed') : 'Speak freely'

  // ── Headless mode: no UI, only connection logic + audio ──
  if (headless) return null

  // ── Mini mode ─────────────────────────────────────────
  if (mini) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* Pulse rings for mini mode */}
        <div style={{ position: 'absolute', top: -8, left: -8, right: -8, bottom: -8, borderRadius: 18, border: `1.5px solid ${speaking ? 'rgba(34,197,94,0.15)' : 'rgba(26,26,26,0.08)'}`, animation: 'kikoPulseRing 2.5s ease-in-out infinite', pointerEvents: 'none' }} />
        <button onClick={onShowPrompt} style={{ width: 52, height: 52, borderRadius: 50, border: 'none', cursor: 'pointer', background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'all 0.3s', boxShadow: '0 8px 32px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.08)', animation: 'kikoBreatheScale 4s ease-in-out infinite' }}>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 0 : 1 }}>
            {listenMode === 'off' ? <MicOff size={20} color="rgba(255,255,255,0.4)" /> : <KikoSymbol size={26} color="#fff" animate={avatarAnimate} />}
          </div>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 1 : 0 }}><Equalizer active={speaking} color="rgba(34,197,94,0.8)" /></div>
        </button>
        {listenMode !== 'active' && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', textAlign: 'center', maxWidth: 80 }}>{listenMode === 'off' ? 'Mic off' : 'Passive'}</span>}
        <button onClick={handleClose} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>×</button>
      </div>
    )
  }

  // ── Full-screen ───────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
      onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
      onClick={e => e.target === e.currentTarget && handleClose()}>

      {/* Frosted glass — platform light style */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(250,250,250,0.82)', backdropFilter: 'blur(48px) saturate(1.8)', WebkitBackdropFilter: 'blur(48px) saturate(1.8)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg,rgba(255,255,255,0.5) 0%,rgba(255,255,255,0.1) 50%)', pointerEvents: 'none' }} />

      {/* Drag-over overlay */}
      {dragOver && (
        <div style={{ position: 'absolute', inset: 12, zIndex: 10, borderRadius: 18, border: '2px dashed #1A1A1A', background: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8 }}>
          <Paperclip size={28} color="#1A1A1A" style={{ opacity: 0.6 }} />
          <p style={{ fontSize: 15, fontWeight: 400, color: '#1A1A1A', fontFamily: 'var(--font)' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', fontFamily: 'var(--font)' }}>PDF, DOCX, PPTX, images</p>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileAttach(f); e.target.value = '' }} style={{ display: 'none' }} />

      {/* Stage */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px 32px', zIndex: 1 }}>

        <button onClick={handleClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>
          <X size={14} />
        </button>

        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 50, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', fontSize: 10, fontWeight: 500, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>
          {modeLabel}
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {showRings && <>
            <div style={{ position: 'absolute', inset: -13, borderRadius: 50, border: '1.5px solid rgba(0,0,0,0.08)', animation: 'pulse 2.2s ease-in-out infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: -26, borderRadius: 62, border: '0.5px solid rgba(255,255,255,0.07)', animation: 'pulse 2.2s ease-in-out infinite 0.5s', pointerEvents: 'none' }} />
          </>}
          <div style={{ width: 156, height: 156, borderRadius: 38, background: avBg, border: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', transition: 'background 0.5s' }}>
            <div style={{ position: 'absolute', opacity: speaking ? 0 : avOpacity, transition: 'opacity 0.35s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {listenMode === 'off' ? <MicOff size={44} color="rgba(255,255,255,0.25)" /> : <KikoSymbol size={68} color="rgba(255,255,255,0.92)" animate={avatarAnimate} />}
            </div>
            <div style={{ position: 'absolute', opacity: speaking ? 1 : 0, transition: 'opacity 0.35s ease' }}>
              <Equalizer active={speaking} />
            </div>
          </div>
        </div>

        {/* Live text */}
        <div style={{ textAlign: 'center', maxWidth: 360, minHeight: 60, marginBottom: 24 }}>
          {transcript && <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(0,0,0,0.8)', margin: '0 0 7px', fontFamily: 'var(--font)', lineHeight: 1.35 }}>{transcript}</p>}
          {kikoText   && <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.55 }}>{kikoText}</p>}
          {status === 'error' && !transcript && <p style={{ fontSize: 13, color: '#C62828', margin: 0, fontFamily: 'var(--font)' }}>{error}</p>}
        </div>

        {listenMode !== 'active' && status === 'live' && (
          <button onClick={() => listenMode === 'off' ? reactivate() : resetToActive()} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,0.5)', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(0,0,0,0.09)', borderRadius: 50, padding: '7px 16px', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: 24 }}>
            <Mic size={12} /> Tap to resume
          </button>
        )}

        {/* Prompt bar — exact home page pill */}
        <div style={{ ...glass, width: '100%', maxWidth: 520, borderRadius: 28, padding: '8px 8px 8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'rgba(0,0,0,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {uploading ? <Loader2 size={16} style={{ animation: 'kikoVortexSpin 1s linear infinite' }} /> : <Paperclip size={17} />}
          </button>

          {attachedFile && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 7px', borderRadius: 50, background: attachedFile.status === 'ready' ? 'rgba(52,199,89,0.08)' : 'rgba(0,0,0,0.06)', border: `0.5px solid ${attachedFile.status === 'ready' ? 'rgba(52,199,89,0.2)' : 'rgba(0,0,0,0.09)'}`, fontSize: 11, color: attachedFile.status === 'ready' ? '#34C759' : 'rgba(0,0,0,0.5)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
              {attachedFile.status === 'uploading' && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              {attachedFile.status === 'analysing' && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#007AFF' }} />}
              {attachedFile.status === 'ready' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              {!attachedFile.status && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachedFile.status === 'uploading' ? 'Uploading…' : attachedFile.status === 'analysing' ? 'Analysing…' : attachedFile.name}</span>
              {attachedFile.category && <span style={{ fontSize: 9, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.7 }}>{attachedFile.category}</span>}
              <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, opacity: 0.5 }}>×</button>
            </div>
          )}

          <input value={typeInput} onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendTyped())}
            placeholder="Ask anything or drop a file…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#1A1A1A', fontFamily: 'var(--font)', height: 40 }} />

          <button title="Dictate" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'rgba(0,0,0,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>

          <button onClick={sendTyped} disabled={!typeInput.trim()} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: typeInput.trim() ? '#1A1A1A' : 'rgba(0,0,0,0.06)', color: typeInput.trim() ? '#fff' : 'rgba(0,0,0,0.25)', cursor: typeInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>

        {status === 'error' && (
          <button onClick={connectRealtime} style={{ marginTop: 14, padding: '7px 18px', borderRadius: 50, background: 'rgba(255,255,255,0.07)', color: 'rgba(0,0,0,0.6)', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}>Retry</button>
        )}
      </div>

      {/* Transcript toggle */}
      <div onClick={() => setShowPane(p => !p)} style={{ position: 'absolute', top: '50%', right: showPane ? 272 : 0, transform: 'translateY(-50%)', zIndex: 2, width: 20, height: 52, borderRadius: '9px 0 0 9px', background: 'rgba(0,0,0,0.05)', border: '0.5px solid rgba(0,0,0,0.08)', borderRight: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.3)', transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.09)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}>
        {showPane ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </div>

      {/* Transcript pane */}
      <div style={{ position: 'relative', zIndex: 1, width: showPane ? 272 : 0, flexShrink: 0, overflow: 'hidden', borderLeft: showPane ? '0.5px solid rgba(0,0,0,0.08)' : 'none', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)', background: 'rgba(255,255,255,0.35)' }}>
        <div style={{ width: 272, height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font)' }}>Transcript</span>
            <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.2)', fontFamily: 'var(--font)' }}>{messages.length} messages</span>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {messages.length === 0
              ? <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', fontFamily: 'var(--font)', textAlign: 'center', marginTop: 40, lineHeight: 1.5 }}>Conversation appears here as you speak</p>
              : messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', fontFamily: 'var(--font)' }}>{m.role === 'user' ? 'You' : 'Kiko'}</span>
                  <div style={{ fontSize: 11, lineHeight: 1.45, padding: '7px 10px', borderRadius: 50, fontFamily: 'var(--font)', background: m.role === 'user' ? '#1A1A1A' : 'rgba(0,0,0,0.05)', color: m.role === 'user' ? '#fff' : 'rgba(0,0,0,0.55)' }}>
                    {m.content}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
