// src/pages/MobileVoicePage.jsx — Standalone fullscreen voice page for mobile
// Avoids all portal/z-index/overflow issues by being a clean separate route
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import KikoAvatar from '../components/kiko/KikoAvatar'
import { fetchVoiceProfile, buildVoiceInstructions } from '../lib/buildVoiceInstructions'

const BAR_COLORS = {
  connecting: '#f59e0b', reconnecting: '#f59e0b', listening: '#22c55e',
  thinking: '#8b5cf6', speaking: '#22c55e', error: '#f87171', idle: '#A0A0A0',
}

export default function MobileVoicePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('connecting')
  const [errorMsg, setErrorMsg] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [voiceEnergy, setVoiceEnergy] = useState(0)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioRef = useRef(null)
  const micTrackRef = useRef(null)
  const color = BAR_COLORS[status] || BAR_COLORS.idle

  const handleClose = useCallback(() => {
    // Cleanup WebRTC
    if (dcRef.current) try { dcRef.current.close() } catch(e) {}
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
      try { pcRef.current.close() } catch(e) {}
    }
    if (audioRef.current) try { audioRef.current.remove() } catch(e) {}
    navigate(-1)
  }, [navigate])

  useEffect(() => {
    let dead = false
    const connect = async () => {
      try {
        setStatus('connecting')
        // Get mic
        const ms = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        })
        if (dead) { ms.getTracks().forEach(t => t.stop()); return }

        // Get voice profile
        const voiceProfile = await fetchVoiceProfile(supabase)
        const sessionInstructions = buildVoiceInstructions(voiceProfile)

        // Get ephemeral token
        const voice = localStorage.getItem('kiko_voice') || 'coral'
        const tokenRes = await fetch('/api/realtime-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice }),
        })
        if (!tokenRes.ok) throw new Error(`Token failed: ${await tokenRes.text()}`)
        const { value: ephemeralKey } = await tokenRes.json()
        if (!ephemeralKey) throw new Error('No ephemeral key')
        if (dead) return

        // WebRTC
        const pc = new RTCPeerConnection()
        pcRef.current = pc

        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioEl.style.display = 'none'
        document.body.appendChild(audioEl)
        audioRef.current = audioEl

        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0]
          setStatus('listening')
        }

        pc.addTrack(ms.getTracks()[0])
        micTrackRef.current = ms.getTracks()[0]

        const dc = pc.createDataChannel('oai-events')
        dcRef.current = dc
        dc.onopen = () => {
          dc.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              audio: {
                input: {
                  turn_detection: { type: 'server_vad', threshold: 0.8, prefix_padding_ms: 300, silence_duration_ms: 800 },
                  transcription: { model: 'whisper-1' },
                },
                output: { voice },
              },
              instructions: sessionInstructions,
              tools: [
                { type: 'function', name: 'ask_kiko', description: 'MANDATORY for every user query. Access Kiko intelligence: pipeline, deals, contacts, tasks, memory, news, web search, strategy.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The full question or request' } }, required: ['query'] } },
                { type: 'function', name: 'close_voice', description: 'Close the voice session. Call this when the user says goodbye, bye, stop, end, close, or any variation of ending the conversation like "goodbye kiko", "bye kiko", "that will be all", "thanks kiko goodbye".', parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: [] } },
              ],
              tool_choice: 'auto',
            }
          }))
        }
        dc.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            // Mute mic while Kiko speaks to prevent feedback loop
            if (msg.type === 'response.audio.delta') {
              setSpeaking(true)
              if (micTrackRef.current) micTrackRef.current.enabled = false
            }
            if (msg.type === 'response.audio.done' || msg.type === 'response.done') {
              setSpeaking(false)
              // Re-enable mic after a short delay to avoid picking up tail audio
              setTimeout(() => { if (micTrackRef.current) micTrackRef.current.enabled = true }, 400)
            }
            if (msg.type === 'input_audio_buffer.speech_started') { setSpeaking(false); setStatus('listening') }
            if (msg.type === 'input_audio_buffer.speech_stopped') setStatus('thinking')
            // Handle close_voice tool call (user said "goodbye kiko")
            if (msg.type === 'response.function_call_arguments.done' && msg.name === 'close_voice') {
              handleClose()
            }
          } catch(e) {}
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
          method: 'POST',
          headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        })
        if (!sdpRes.ok) throw new Error(`SDP failed: ${sdpRes.status}`)
        const answer = { type: 'answer', sdp: await sdpRes.text() }
        await pc.setRemoteDescription(answer)

      } catch (err) {
        console.error('[MobileVoice] Error:', err)
        setStatus('error')
        setErrorMsg(err.message || 'Connection failed')
      }
    }
    connect()
    return () => {
      dead = true
      if (dcRef.current) try { dcRef.current.close() } catch(e) {}
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
        try { pcRef.current.close() } catch(e) {}
      }
      if (audioRef.current) try { audioRef.current.remove() } catch(e) {}
    }
  }, [])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#FEFEFC', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 30, fontWeight: 400, color: '#0A0A0A' }}>Kiko</div>
        <button onClick={handleClose} style={{ width: 44, height: 44, borderRadius: '50%', background: '#F5F4F1', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Centre */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <KikoAvatar size={80} state={speaking ? 'responding' : (status === 'listening' ? 'thinking' : 'idle')} energy={voiceEnergy} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: '#0A0A0A', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}60` }} />
          <span>{status === 'connecting' ? 'Connecting...' : status === 'listening' ? 'Listening' : status === 'thinking' ? 'Thinking...' : status === 'error' ? 'Connection failed' : 'Starting...'}</span>
        </div>
        {errorMsg && <div style={{ fontSize: 13, color: '#B8432E', textAlign: 'center', padding: '0 32px' }}>{errorMsg}</div>}
      </div>

      {/* Bottom */}
      <div style={{ padding: '16px 20px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <button onClick={handleClose} style={{ padding: '14px 40px', borderRadius: 50, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.12)', fontSize: 17, color: '#6B6B6B', fontFamily: 'inherit' }}>Goodbye Kiko</button>
      </div>
    </div>
  )
}
