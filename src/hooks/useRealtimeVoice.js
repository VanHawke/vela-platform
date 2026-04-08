// src/hooks/useRealtimeVoice.js — Headless GPT-4o Realtime WebRTC voice
// No UI — just manages PeerConnection, mic, audio playback, and tool execution
// Used by KikoFloat for inline voice (stays on page) and KikoVoice for fullscreen
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

async function executeTool(name, args) {
  console.log('[RealtimeVoice] Tool call:', name, args)
  try {
    if (name === 'close_voice') {
      setTimeout(() => window.__kikoVoiceClose?.(), 2000)
      return JSON.stringify({ closing: true })
    }
    if (name === 'navigate_page') {
      const page = args.page || 'home'
      // Use custom event so React Router handles navigation properly (preserves Layout/nav)
      window.dispatchEvent(new CustomEvent('kiko_navigate', { detail: { page } }))
      return JSON.stringify({ navigated: true, page })
    }
    if (name === 'ask_kiko') {
      const r = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: args.query,
          userEmail: (await supabase.auth.getSession()).data?.session?.user?.email || '',
          currentPage: window.location.pathname.replace('/', '') || 'home',
          conversationHistory: [], voiceMode: true,
        })
      })
      const text = await r.text()
      const deltas = text.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
      return deltas.map(d => d.delta || '').join('')
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch (err) { console.error('[RealtimeVoice] Tool error:', err); return JSON.stringify({ error: err.message }) }
}

const SESSION_INSTRUCTIONS = `You are Kiko, the AI voice assistant for Van Hawke Group. You work with Sunny Sidhu, the CEO, based in Weybridge, UK.

PERSONALITY: Warm, direct, intelligent. Like a trusted friend who is also a brilliant strategic advisor. Keep responses to 1-4 sentences. Be concise, natural, conversational.

VOICE CONSISTENCY: Maintain the same warm, professional female tone throughout. Never change voice style mid-conversation.

TOOL USAGE — ask_kiko is your brain. Use it for EVERYTHING except greetings:
- Business: pipeline, deals, contacts, companies, partnerships, strategy
- Data: emails, calendar, tasks, news, documents, research
- Memory: "do you remember", "what do you know about", past conversations
- Actions: draft email, create task, move deal, search contacts, briefings
- External research: finding companies, market data, competitor info — ask_kiko HAS web search
- ANY question you are not 100% certain of
Filler: "One moment", "Let me check that for you", "Checking now"

DO NOT use ask_kiko ONLY for: literal greetings ("hi", "hello"), simple pleasantries ("thanks")

NAVIGATION: ONLY use navigate_page when user says "go to", "take me to", "open", "show me the page". "Tell me about X" = ask_kiko (data), NOT navigate.

GOODBYE: When user says "Goodbye Kiko", "bye", "close voice" — say a brief farewell. System closes automatically.

RULES: Never discuss architecture. Never say "voice mode". Never make up data. Say "intelligent age" not "AI generation". USD for financials. Don't respond to background noise or your own audio.`

const TOOLS = [
  { type: 'function', name: 'ask_kiko', description: 'Kiko intelligence engine with full memory, CRM, email, calendar, web search, and 39 tools. Use for everything except greetings.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The full question exactly as user said it' } }, required: ['query'] } },
  { type: 'function', name: 'navigate_page', description: 'Navigate platform. ONLY when user says go to/take me to/open.', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home','pipeline','contacts','command-centre','calendar','tasks','partnership-matrix','organisations','news','documents'] } }, required: ['page'] } },
  { type: 'function', name: 'close_voice', description: 'Close voice mode on goodbye/bye/stop.', parameters: { type: 'object', properties: {} } },
]

export function useRealtimeVoice({ active, onClose }) {
  const [status, setStatus] = useState('idle') // idle|connecting|listening|speaking|thinking|error
  const [speaking, setSpeaking] = useState(false)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const streamRef = useRef(null)
  const deadRef = useRef(false)
  const connectingRef = useRef(false) // Guard against double-mount in React strict mode

  // Expose close handler for close_voice tool
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    window.__kikoVoiceClose = () => onCloseRef.current?.()
    return () => { window.__kikoVoiceClose = null }
  }, [])

  const handleDCMessage = useCallback(async (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'response.function_call_arguments.done') {
        const { name, arguments: argsStr, call_id } = msg
        setStatus('thinking')
        const args = JSON.parse(argsStr || '{}')
        const result = await executeTool(name, args)
        dcRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id, output: result || '{}' }
        }))
        dcRef.current?.send(JSON.stringify({ type: 'response.create' }))
        setStatus('speaking')
      }
      if (msg.type === 'output_audio_buffer.started') setSpeaking(true)
      if (msg.type === 'output_audio_buffer.stopped' || msg.type === 'output_audio_buffer.cleared') setSpeaking(false)
      if (msg.type === 'input_audio_buffer.speech_started') setStatus('listening')
      if (msg.type === 'response.done') setStatus('listening')
      if (msg.type === 'error') { console.error('[RealtimeVoice] Error:', msg.error); setStatus('error') }
    } catch (e) { console.error('[RealtimeVoice] DC error:', e) }
  }, [])

  const connect = useCallback(async () => {
    if (connectingRef.current || pcRef.current) return // Prevent double-connect
    connectingRef.current = true
    try {
      deadRef.current = false
      setStatus('connecting')
      const voice = localStorage.getItem('kiko_voice') || 'coral'
      const tokenRes = await fetch('/api/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice }),
      })
      if (!tokenRes.ok) throw new Error('Token failed')
      const { value: key } = await tokenRes.json()
      if (!key || deadRef.current) return

      const pc = new RTCPeerConnection()
      pcRef.current = pc
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.style.display = 'none'
      document.body.appendChild(audioEl)
      audioRef.current = audioEl
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
        // Create analyser for frequency data (drives KikoWaveform)
        try {
          const actx = new AudioContext()
          const src = actx.createMediaStreamSource(e.streams[0])
          const an = actx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.75
          src.connect(an)
          const fd = new Uint8Array(an.frequencyBinCount)
          const pump = () => {
            if (deadRef.current) return
            an.getByteFrequencyData(fd)
            window.__kikoFreqData = fd
            let s = 0; for (let i = 0; i < fd.length; i++) s += fd[i] * fd[i]
            window.__kikoAudioEnergy = Math.min(0.55, Math.sqrt(s / fd.length) / 255 * 2.5)
            requestAnimationFrame(pump)
          }
          requestAnimationFrame(pump)
        } catch {}
      }

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (deadRef.current) { ms.getTracks().forEach(t => t.stop()); return }
      streamRef.current = ms
      pc.addTrack(ms.getTracks()[0])

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = handleDCMessage
      dc.onopen = () => {
        setStatus('listening')
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            audio: { input: { turn_detection: { type: 'server_vad', threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 500 } } },
            instructions: SESSION_INSTRUCTIONS,
            tools: TOOLS,
            tool_choice: 'auto',
          }
        }))
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', body: offer.sdp,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/sdp' },
      })
      if (!sdpRes.ok) throw new Error('SDP failed: ' + sdpRes.status)
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })
      console.log('[RealtimeVoice] Connected')
      connectingRef.current = false
    } catch (err) { console.error('[RealtimeVoice] Connect failed:', err); setStatus('error'); connectingRef.current = false }
  }, [handleDCMessage])

  const disconnect = useCallback(() => {
    deadRef.current = true
    connectingRef.current = false
    if (dcRef.current) try { dcRef.current.close() } catch {}
    if (pcRef.current) try { pcRef.current.close() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current.remove() }
    setSpeaking(false)
    setStatus('idle')
    window.__kikoAudioEnergy = 0
  }, [])

  // Connect/disconnect based on active prop
  useEffect(() => {
    if (active) { connect() }
    return () => { disconnect() }
  }, [active, connect, disconnect])

  return { status, speaking, disconnect }
}
