// src/components/kiko/KikoVoice.jsx — GPT-4o Realtime via WebRTC
// Speech-to-speech. Function calling for real data. No pipeline.
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DoubleHelix from './DoubleHelix'
import AuroraCanvas from '../AuroraCanvas'
import T from '@/lib/theme'
import { supabase } from '@/lib/supabase'

const BAR_COLORS = {
  connecting: '#F59E0B', listening: '#06D6A0', thinking: '#7C9CF6',
  speaking: '#06D6A0', error: '#FF5050', idle: 'rgba(255,255,255,0.18)',
}
const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Tool Execution (runs in browser, returns JSON to GPT-4o) ──
async function executeTool(name, args) {
  console.log('[KikoVoice] Tool call:', name, args)
  const sb = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    })
    return r.json()
  }
  try {
    switch (name) {
      case 'query_pipeline': {
        const filter = args.status === 'stale' ? '&data->>lastActivity=lt.' + new Date(Date.now() - 30*86400000).toISOString().split('T')[0] : args.status === 'all' ? '' : '&data->>status=eq.active'
        const deals = await sb(`deals?select=data&order=updated_at.desc&limit=20${filter}`)
        return JSON.stringify((deals || []).map(d => ({ company: d.data?.company, stage: d.data?.stage, value: d.data?.value, pipeline: d.data?.pipeline })))
      }
      case 'search_contacts': {
        const q = encodeURIComponent(args.query)
        const contacts = await sb(`contacts?select=data&or=(data->>firstName.ilike.*${q}*,data->>lastName.ilike.*${q}*,data->>company.ilike.*${q}*)&limit=10`)
        return JSON.stringify((contacts || []).map(c => ({ name: `${c.data?.firstName} ${c.data?.lastName}`, company: c.data?.company, title: c.data?.title, email: c.data?.email })))
      }
      case 'search_emails': {
        // Use the kiko API to search emails via MCP
        const r = await fetch('/api/kiko', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Search my emails for: ${args.query}. Give me a brief summary of the top 3 results.`, userEmail: 'sunny@vanhawke.com', currentPage: 'email', conversationHistory: [], voiceMode: true })
        })
        const text = await r.text()
        const deltas = text.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
        return deltas.map(d => d.delta || '').join('')
      }
      case 'get_calendar': {
        const r = await fetch('/api/kiko', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `What's on my calendar for the next ${args.days || 3} days?`, userEmail: 'sunny@vanhawke.com', currentPage: 'calendar', conversationHistory: [], voiceMode: true })
        })
        const text = await r.text()
        const deltas = text.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
        return deltas.map(d => d.delta || '').join('')
      }
      case 'navigate_page': {
        const page = args.page || 'home'
        const path = page === 'home' ? '/' : `/${page}`
        window.history.pushState({}, '', path)
        window.dispatchEvent(new PopStateEvent('popstate'))
        return JSON.stringify({ navigated: true, page })
      }
      case 'move_deal': {
        const deals = await sb(`deals?select=id,data&data->>company=ilike.*${encodeURIComponent(args.company)}*&limit=1`)
        if (!deals?.length) return JSON.stringify({ error: 'Deal not found' })
        const deal = deals[0]
        const updated = { ...deal.data, stage: args.stage }
        await fetch(`${SB_URL}/rest/v1/deals?id=eq.${deal.id}`, {
          method: 'PATCH', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: updated })
        })
        return JSON.stringify({ moved: true, company: args.company, stage: args.stage })
      }
      case 'create_task': {
        await fetch(`${SB_URL}/rest/v1/tasks`, {
          method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { title: args.title, dueDate: args.dueDate || null, completed: false, createdAt: new Date().toISOString() } })
        })
        return JSON.stringify({ created: true, title: args.title })
      }
      case 'ask_kiko': {
        const r = await fetch('/api/kiko', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: args.query, userEmail: 'sunny@vanhawke.com', currentPage: window.location.pathname.replace('/', '') || 'home', conversationHistory: [], voiceMode: true })
        })
        const text = await r.text()
        const deltas = text.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
        return deltas.map(d => d.delta || '').join('')
      }
      default: return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) { console.error('[KikoVoice] Tool error:', err); return JSON.stringify({ error: err.message }) }
}

export default function KikoVoice({ onClose, user, onVoiceState }) {
  const [status, setStatus] = useState('connecting')
  const [speaking, setSpeaking] = useState(false)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const energyRAF = useRef(null)
  const analyserRef = useRef(null)
  const color = BAR_COLORS[status] || BAR_COLORS.idle

  useEffect(() => { if (onVoiceState) onVoiceState({ status, speaking }) }, [status, speaking])

  // ── Drive DoubleHelix from remote audio ──
  const startAudioAnalyser = (stream) => {
    try {
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.75
      src.connect(an)
      analyserRef.current = { ctx, an }
      const d = new Uint8Array(an.frequencyBinCount)
      const pump = () => {
        an.getByteFrequencyData(d)
        let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]
        const rms = Math.sqrt(s / d.length) / 255
        window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5)
        window.__kikoAudioPitch = Math.min(0.4, rms * 1.2)
        const isTalking = rms > 0.02
        if (isTalking !== speaking) setSpeaking(isTalking)
        energyRAF.current = requestAnimationFrame(pump)
      }
      energyRAF.current = requestAnimationFrame(pump)
    } catch (e) { console.error('[KikoVoice] Audio analyser error:', e) }
  }

  // ── Handle data channel messages (function calls from GPT-4o) ──
  const handleDCMessage = async (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      console.log('[KikoVoice] Event:', msg.type)

      if (msg.type === 'response.function_call_arguments.done') {
        const { name, arguments: argsStr, call_id } = msg
        setStatus('thinking')
        const args = JSON.parse(argsStr || '{}')
        const result = await executeTool(name, args)
        console.log('[KikoVoice] Tool result:', name, result?.slice?.(0, 100))
        // Send result back to GPT-4o
        dcRef.current?.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id, output: result || '{}' }
        }))
        // Tell GPT-4o to respond with the result
        dcRef.current?.send(JSON.stringify({ type: 'response.create' }))
      }

      if (msg.type === 'response.audio.delta') setStatus('speaking')
      if (msg.type === 'response.audio.done') setStatus('listening')
      if (msg.type === 'input_audio_buffer.speech_started') setStatus('listening')
      if (msg.type === 'error') {
        console.error('[KikoVoice] API Error:', JSON.stringify(msg.error || msg))
        setStatus('error')
      }
    } catch (e) { console.error('[KikoVoice] DC message error:', e) }
  }

  // ── Connect WebRTC on mount ──
  useEffect(() => {
    let dead = false
    const connect = async () => {
      try {
        // 1. Get ephemeral token
        console.log('[KikoVoice] Getting ephemeral token...')
        const tokenRes = await fetch('/api/realtime-token', { method: 'POST' })
        if (!tokenRes.ok) { const e = await tokenRes.text(); throw new Error(`Token failed: ${e}`) }
        const tokenData = await tokenRes.json()
        const ephemeralKey = tokenData.value
        if (!ephemeralKey) throw new Error('No ephemeral key returned')
        if (dead) return
        console.log('[KikoVoice] Got ephemeral key:', ephemeralKey.slice(0, 10) + '...')

        // 2. Create peer connection
        const pc = new RTCPeerConnection()
        pcRef.current = pc

        // 3. Set up remote audio playback
        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioRef.current = audioEl
        pc.ontrack = (e) => {
          console.log('[KikoVoice] Got remote audio track')
          audioEl.srcObject = e.streams[0]
          startAudioAnalyser(e.streams[0])
          setStatus('listening')
        }

        // 4. Add local mic audio
        console.log('[KikoVoice] Getting microphone...')
        const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (dead) { ms.getTracks().forEach(t => t.stop()); return }
        pc.addTrack(ms.getTracks()[0])

        // 5. Set up data channel for events
        const dc = pc.createDataChannel('oai-events')
        dcRef.current = dc
        dc.onmessage = handleDCMessage
        dc.onopen = () => {
          console.log('[KikoVoice] Data channel open — sending session config')
          setStatus('listening')
          // Send session.update with instructions + tools
          dc.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: `You are Kiko, the AI voice assistant for Van Hawke Group. You work with Sunny Sidhu, the CEO, based in Weybridge, UK.

PERSONALITY: Warm, direct, intelligent. You ARE Kiko — never break character. Keep responses to 1-3 sentences for conversation. Be concise and natural.

TOOLS: You have tools for real data. Use them ONLY when asked about pipeline, deals, contacts, emails, calendar, or platform actions. For greetings, opinions, advice, general chat — just respond naturally, no tools needed. When you call a tool, say something brief like "Let me check that" while waiting. After getting results, summarise naturally.

STYLE: Say "intelligent age" not "AI generation". All financials in USD. No markdown. No lists.`,
              tools: [
                { type: 'function', name: 'query_pipeline', description: 'Get active deals from pipeline with names, stages, values.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['active','all','stale'], default: 'active' } } } },
                { type: 'function', name: 'search_contacts', description: 'Search CRM contacts by name or company.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
                { type: 'function', name: 'search_emails', description: 'Search recent emails by sender, subject, or keyword.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
                { type: 'function', name: 'get_calendar', description: 'Get upcoming calendar events.', parameters: { type: 'object', properties: { days: { type: 'number', default: 3 } } } },
                { type: 'function', name: 'navigate_page', description: 'Navigate platform to a page.', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home','pipeline','contacts','email','calendar','tasks','partnership-matrix','organisations','news','documents'] } }, required: ['page'] } },
                { type: 'function', name: 'move_deal', description: 'Move a deal to a different stage.', parameters: { type: 'object', properties: { company: { type: 'string' }, stage: { type: 'string' } }, required: ['company','stage'] } },
                { type: 'function', name: 'create_task', description: 'Create a new task.', parameters: { type: 'object', properties: { title: { type: 'string' }, dueDate: { type: 'string' } }, required: ['title'] } },
                { type: 'function', name: 'ask_kiko', description: 'Full Kiko intelligence for complex queries, strategy, research.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
              ],
              tool_choice: 'auto',
            }
          }))
          console.log('[KikoVoice] Session config sent with', 8, 'tools')
        }
        dc.onclose = () => console.log('[KikoVoice] Data channel closed')

        // 6. Create and send SDP offer
        console.log('[KikoVoice] Creating SDP offer...')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        })
        if (!sdpRes.ok) { const e = await sdpRes.text(); throw new Error(`SDP failed: ${e}`) }
        const answerSdp = await sdpRes.text()
        console.log('[KikoVoice] Got SDP answer, setting remote description...')
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
        console.log('[KikoVoice] WebRTC connected!')

        // Monitor connection state
        pc.onconnectionstatechange = () => {
          console.log('[KikoVoice] Connection state:', pc.connectionState)
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('error')
        }

      } catch (err) {
        console.error('[KikoVoice] Connection error:', err)
        setStatus('error')
      }
    }
    connect()

    // Cleanup
    return () => {
      dead = true
      cancelAnimationFrame(energyRAF.current)
      if (analyserRef.current?.ctx) analyserRef.current.ctx.close().catch(() => {})
      if (dcRef.current) dcRef.current.close()
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
        pcRef.current.close()
      }
      if (audioRef.current) { audioRef.current.srcObject = null }
      window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    }
  }, [])

  const handleClose = useCallback(() => {
    cancelAnimationFrame(energyRAF.current)
    if (analyserRef.current?.ctx) analyserRef.current.ctx.close().catch(() => {})
    if (dcRef.current) dcRef.current.close()
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
      pcRef.current.close()
    }
    if (audioRef.current) audioRef.current.srcObject = null
    window.__kikoAudioEnergy = 0; window.__kikoAudioPitch = 0
    onClose?.()
  }, [onClose])

  // ── Render ──
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}><AuroraCanvas /></div>

      {/* X close */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 20, right: 20, zIndex: 2, width: 32, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', transition: 'all 0.2s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
      ><X size={14} /></button>

      {/* DoubleHelix ribbon */}
      <div style={{
        position: 'relative', zIndex: 1, width: '95%', maxWidth: 1100, marginBottom: 24,
        overflow: 'visible', padding: '48px 0',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}>
        <DoubleHelix width={1100} height={140} speaking={speaking} energy={0} pitch={0} />
      </div>

      {/* Status bar */}
      <div style={{ position: 'relative', zIndex: 1, width: 220, height: 2.5, borderRadius: 50, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 50,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}50`,
          animation: 'kikoBarPulse 2.5s ease-in-out infinite',
          transition: 'background 0.5s, box-shadow 0.5s',
        }} />
      </div>

      {/* Goodbye Kiko */}
      <button onClick={handleClose} style={{
        position: 'relative', zIndex: 1, padding: '10px 28px', borderRadius: 50,
        background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.25)', fontSize: 13, fontWeight: 300,
        cursor: 'pointer', fontFamily: T.font, transition: 'all 0.25s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'; e.currentTarget.style.color = 'rgba(255,80,80,0.5)'; e.currentTarget.style.background = 'rgba(255,80,80,0.06)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      >Goodbye Kiko</button>

      <style>{`@keyframes kikoBarPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>,
    document.body
  )
}
