import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, Mic, MicOff, Paperclip, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import KikoSymbol from './KikoSymbol'

const PASSIVE_AFTER_MS = 45_000
const OFF_AFTER_MS     = 120_000
const KEYWORDS         = ['hey kiko', 'okay kiko', 'ok kiko', 'kiko']

const glass = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
}

function Equalizer({ active }) {
  const delays = [0, 0.1, 0.05, 0.15, 0.08]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5.5, height: 48 }}>
      {delays.map((d, i) => (
        <div key={i} style={{
          width: 4.5, borderRadius: 2.5, background: '#fff',
          height: active ? 24 : 5, minHeight: 5,
          animation: active ? `kikoEq 0.7s ease-in-out ${d}s infinite alternate` : 'none',
          transition: 'height 0.35s cubic-bezier(0.4,0,0.2,1)',
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user, micStream, mini = false, onShowPrompt }) {
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

  useEffect(() => { listenModeRef.current = listenMode }, [listenMode])
  useEffect(() => { connectRealtime(); return () => { cleanup(); stopKeyword(); stopLiveTranscription() } }, [])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // ── Live browser-side transcription (Web Speech API) ──
  const startLiveTranscription = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    stopLiveTranscription()
    const sr = new SR()
    sr.continuous = true
    sr.interimResults = true
    sr.lang = 'en-US'
    liveSrRef.current = sr
    let finalText = ''
    sr.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalText = t.trim()
          if (finalText) addMessage('user', finalText)
          setTranscript('')
        } else {
          interim += t
        }
      }
      if (interim) setTranscript(interim)
    }
    sr.onerror = () => {} // ignore errors, will auto-restart
    sr.onend = () => {
      // Auto-restart if still in active mode
      if (listenModeRef.current === 'active' && liveSrRef.current === sr) {
        try { sr.start() } catch {}
      }
    }
    try { sr.start() } catch {}
  }, [])

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
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'none' } } }))
    }
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
    sr.onend = () => { if (listenModeRef.current === 'off' && srRef.current === sr) { try { sr.start() } catch {} } }
    try { sr.start() } catch {}
  }, [])

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

      const stream = micStream || await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const pc = new RTCPeerConnection(); pcRef.current = pc
      const audio = document.createElement('audio'); audio.autoplay = true; audioRef.current = audio
      pc.ontrack = e => { audio.srcObject = e.streams[0] }
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const dc = pc.createDataChannel('oai-events'); dcRef.current = dc

      dc.onopen = () => {
        setStatus('live')
        // ── Session config: data channel accepts flat input_audio_transcription ──
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `You are Kiko — the intelligence layer of Vela for Van Hawke Group. Speaking with Sunny Sidhu, CEO, Weybridge UK. Sharp, warm, confident advisor. Speak naturally. Keep responses concise. All financials in USD. Use "intelligent age" not "AI generation". When hearing "Hey Kiko" in passive mode, acknowledge warmly and resume. Reference any attached documents when relevant.${memoriesContext}${platformContext}`,
            voice: voiceId,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
            tools: [
              { type: 'function', name: 'search_web', description: 'Search the internet.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
              { type: 'function', name: 'get_crm_data', description: 'Query CRM.', parameters: { type: 'object', properties: { entity: { type: 'string', enum: ['deals','contacts','companies','tasks'] }, filter: { type: 'string' } }, required: ['entity'] } }
            ],
            tool_choice: 'auto',
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

  // ── Events ───────────────────────────────────────────
  function handleEvent(ev) {
    const t = ev.type
    // Log session.updated with full detail to verify transcription config
    if (t === 'session.updated' || t === 'session.created') {
      console.log('[Kiko Voice]', t, 'input_audio_transcription:', JSON.stringify(ev.session?.input_audio_transcription))
    }
    // Debug: log all events except high-frequency audio deltas
    if (t !== 'response.output_audio_transcript.delta' && t !== 'response.audio.delta') {
      console.log('[Kiko Voice Event]', t, ev.transcript || ev.delta || ev.error || '')
    }
    if (t === 'input_audio_buffer.speech_started') {
      setTranscript(''); setKikoText(''); setSpeaking(false); setThinking(false)
      if (listenModeRef.current !== 'active') resetToActive()
      else startTimers()
    }
    if (t === 'input_audio_buffer.speech_stopped') startTimers()

    // User speech — live delta (partial transcription as user speaks)
    if (t === 'conversation.item.input_audio_transcription.delta') {
      const delta = ev.delta || ''
      if (delta) setTranscript(p => p + delta)
    }

    // User speech — completed (final transcription)
    if (t === 'conversation.item.input_audio_transcription.completed') {
      const text = ev.transcript?.trim() || ''
      if (text) {
        setTranscript(text)
        if (listenModeRef.current === 'passive') {
          if (KEYWORDS.some(kw => text.toLowerCase().includes(kw))) resetToActive()
        } else {
          addMessage('user', text)
        }
      }
    }

    // User speech transcription failed — log for debugging
    if (t === 'conversation.item.input_audio_transcription.failed') {
      console.error('[Kiko Voice] Transcription failed:', ev.error)
    }

    if (t === 'response.created') { setKikoText(''); setSpeaking(true); setThinking(false) }
    // GA event names (beta used response.audio_transcript.delta)
    if (t === 'response.audio_transcript.delta' || t === 'response.output_audio_transcript.delta') setKikoText(p => p + (ev.delta || ''))
    if (t === 'response.audio_transcript.done' || t === 'response.output_audio_transcript.done') {
      const full = ev.transcript?.trim() || ''
      if (full) addMessage('kiko', full)
    }
    if (t === 'response.done') { setSpeaking(false); setTranscript('') }
    if (t === 'response.function_call_arguments.done') handleTool(ev)
  }

  function addMessage(role, content) {
    setMessages(p => [...p, { role, content }])
    conversationRef.current.messages.push({ role: role === 'kiko' ? 'assistant' : 'user', content })
    saveConversation()
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
        const { data } = await supabase.from('conversations').insert({ user_id: user.id, org_id: orgId, title: '🎤 ' + (msgs[0]?.content || 'Voice').slice(0, 60), messages: msgs }).select('id').single()
        if (data?.id) conversationRef.current.id = data.id
      }
    } catch {}
  }

  async function handleTool(ev) {
    const { name, arguments: a, call_id } = ev
    try {
      const args = JSON.parse(a)
      const msg = name === 'search_web' ? `Search: ${args.query}` : `CRM ${args.entity}${args.filter ? ` — ${args.filter}` : ''}`
      const res = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, currentPage: 'voice' }) })
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
        dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output: (full || 'No results').slice(0, 4000) } }))
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    } catch {}
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
  function handleClose() { cleanup(); stopKeyword(); onClose() }

  // ── Derived ──────────────────────────────────────────
  const avatarAnimate = speaking ? 'none' : thinking ? 'thinking' : status === 'live' && listenMode === 'active' ? 'streaming' : 'idle'
  const showRings = status === 'live' && listenMode === 'active' && !speaking
  const avBg      = listenMode === 'off' ? 'rgba(28,28,28,0.65)' : listenMode === 'passive' ? 'rgba(55,55,55,0.55)' : '#1A1A1A'
  const avOpacity = listenMode === 'passive' ? 0.35 : 1
  const modeLabel = listenMode === 'passive' ? 'Passive · Say "Hey Kiko" to resume'
    : listenMode === 'off' ? 'Mic off · Say "Hey Kiko" to restart'
    : speaking ? 'Kiko is speaking…' : thinking ? 'Thinking…'
    : status === 'connecting' ? 'Connecting…' : status === 'error' ? (error || 'Failed') : 'Speak freely'

  // ── Mini mode ─────────────────────────────────────────
  if (mini) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={onShowPrompt} style={{ width: 52, height: 52, borderRadius: 14, border: 'none', cursor: 'pointer', background: listenMode === 'active' && status === 'live' ? 'var(--accent)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'all 0.3s' }}>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 0 : 1 }}>
            {listenMode === 'off' ? <MicOff size={20} color="var(--text-tertiary)" /> : <KikoSymbol size={26} color={status === 'live' && listenMode === 'active' ? '#fff' : 'var(--text-tertiary)'} animate={avatarAnimate} />}
          </div>
          <div style={{ position: 'absolute', transition: 'opacity 0.3s', opacity: speaking ? 1 : 0 }}><Equalizer active={speaking} /></div>
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
        <div style={{ position: 'absolute', inset: 12, zIndex: 10, borderRadius: 16, border: '2px dashed #1A1A1A', background: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8 }}>
          <Paperclip size={28} color="#1A1A1A" style={{ opacity: 0.6 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', fontFamily: 'var(--font)' }}>Drop file for Kiko to analyse</p>
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', fontFamily: 'var(--font)' }}>PDF, DOCX, PPTX, images</p>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileAttach(f); e.target.value = '' }} style={{ display: 'none' }} />

      {/* Stage */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px 32px', zIndex: 1 }}>

        <button onClick={handleClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>
          <X size={14} />
        </button>

        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 20, background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)', fontSize: 10, fontWeight: 500, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>
          {modeLabel}
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {showRings && <>
            <div style={{ position: 'absolute', inset: -13, borderRadius: 50, border: '1.5px solid rgba(0,0,0,0.08)', animation: 'pulse 2.2s ease-in-out infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: -26, borderRadius: 62, border: '1px solid rgba(0,0,0,0.04)', animation: 'pulse 2.2s ease-in-out infinite 0.5s', pointerEvents: 'none' }} />
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
          <button onClick={() => listenMode === 'off' ? reactivate() : resetToActive()} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.09)', borderRadius: 20, padding: '7px 16px', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: 24 }}>
            <Mic size={12} /> Tap to resume
          </button>
        )}

        {/* Prompt bar — exact home page pill */}
        <div style={{ ...glass, width: '100%', maxWidth: 520, borderRadius: 28, padding: '8px 8px 8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent', color: 'rgba(0,0,0,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {uploading ? <Loader2 size={16} style={{ animation: 'kikoVortexSpin 1s linear infinite' }} /> : <Paperclip size={17} />}
          </button>

          {attachedFile && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 7px', borderRadius: 20, background: attachedFile.status === 'ready' ? 'rgba(52,199,89,0.08)' : 'rgba(0,0,0,0.06)', border: `0.5px solid ${attachedFile.status === 'ready' ? 'rgba(52,199,89,0.2)' : 'rgba(0,0,0,0.09)'}`, fontSize: 11, color: attachedFile.status === 'ready' ? '#34C759' : 'rgba(0,0,0,0.5)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
              {attachedFile.status === 'uploading' && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              {attachedFile.status === 'analysing' && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#007AFF' }} />}
              {attachedFile.status === 'ready' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              {!attachedFile.status && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachedFile.status === 'uploading' ? 'Uploading…' : attachedFile.status === 'analysing' ? 'Analysing…' : attachedFile.name}</span>
              {attachedFile.category && <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.7 }}>{attachedFile.category}</span>}
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
          <button onClick={connectRealtime} style={{ marginTop: 14, padding: '7px 18px', borderRadius: 10, background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.6)', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}>Retry</button>
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
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font)' }}>Transcript</span>
            <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.2)', fontFamily: 'var(--font)' }}>{messages.length} messages</span>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {messages.length === 0
              ? <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', fontFamily: 'var(--font)', textAlign: 'center', marginTop: 40, lineHeight: 1.5 }}>Conversation appears here as you speak</p>
              : messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', fontFamily: 'var(--font)' }}>{m.role === 'user' ? 'You' : 'Kiko'}</span>
                  <div style={{ fontSize: 11, lineHeight: 1.45, padding: '7px 10px', borderRadius: 10, fontFamily: 'var(--font)', background: m.role === 'user' ? '#1A1A1A' : 'rgba(0,0,0,0.05)', color: m.role === 'user' ? '#fff' : 'rgba(0,0,0,0.55)' }}>
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
