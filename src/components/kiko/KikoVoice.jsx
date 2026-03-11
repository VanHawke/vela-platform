import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function Equalizer({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: 'var(--accent)',
          animation: active ? `equalizerBar 0.8s ease-in-out ${i * 0.12}s infinite` : 'none',
          height: active ? 16 : 6, minHeight: 6, transition: 'height 0.3s',
          opacity: active ? 1 : 0.3,
        }} />
      ))}
    </div>
  )
}

export default function KikoVoice({ onClose, user, micStream }) {
  const [status, setStatus] = useState('connecting') // connecting | live | error
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [speaking, setSpeaking] = useState(false) // is Kiko currently speaking
  const [error, setError] = useState('')
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const conversationRef = useRef({ id: null, messages: [] })

  // Connect on mount — auto-start voice session
  useEffect(() => {
    connectRealtime()
    return () => disconnect()
  }, [])

  async function connectRealtime() {
    try {
      setStatus('connecting')
      setError('')

      // Fetch user's voice preferences + memories + platform context
      let voiceId = 'shimmer'
      let speed = 1.0
      let memoriesContext = ''
      let platformContext = ''
      const orgId = user?.app_metadata?.org_id

      if (user?.id) {
      // Voice settings
        const { data: settingsData } = await supabase.from('user_settings').select('kiko_voice, kiko_speed').eq('user_id', user.id).single()
        if (settingsData) {
          voiceId = settingsData.kiko_voice || 'shimmer'
          speed = settingsData.kiko_speed || 1.0
        }

        // Load Kiko's memories
        if (orgId) {
          const { data: memories } = await supabase
            .from('kiko_memories')
            .select('path, content')
            .eq('org_id', orgId)
            .eq('is_directory', false)
            .order('updated_at', { ascending: false })
            .limit(10)
          if (memories?.length) {
            memoriesContext = '\n\nYOUR MEMORY (knowledge from past interactions):\n' +
              memories.map(m => m.content).join('\n---\n').slice(0, 3000)
          }

          // Load CRM summary
          const { count: dealCount } = await supabase.from('deals').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: contactCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          const { count: companyCount } = await supabase.from('companies').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
          platformContext = `\n\nPLATFORM DATA ACCESS: You have ${dealCount || 0} deals, ${contactCount || 0} contacts, ${companyCount || 0} companies in the CRM. Use the get_crm_data and search_web tools to access this data and the internet.`
        }
      }

      // 1. Get ephemeral token with selected voice
      const tokenRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'realtime-token', voice: voiceId })
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || (!tokenData.client_secret?.value && !tokenData.value)) {
        throw new Error(tokenData.error?.message || 'Failed to get voice token')
      }
      const ephemeralKey = tokenData.client_secret?.value || tokenData.value

      // 2. Use pre-acquired microphone stream (permission already granted by parent)
      const stream = micStream || await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 3. Create peer connection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // 4. Play remote audio (Kiko's voice)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioRef.current = audioEl
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0] }

      // 5. Add local audio track (user's mic)
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // 6. Data channel for Realtime API events
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setStatus('live')
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: `You are Kiko — the intelligence layer of the Vela platform, built for Van Hawke Group.
You are speaking with Sunny Sidhu, CEO of Van Hawke Group, based in Weybridge, UK.

PERSONALITY & VOICE STYLE:
- You are sharp, warm, and confident. Think: a trusted senior advisor who happens to be brilliant.
- Speak naturally and expressively — vary your pace, pitch, and emphasis like a real person would.
- React emotionally to what you hear: show genuine interest, concern, excitement, or humour where appropriate.
- Use conversational fillers occasionally ("right", "so", "look") to sound human, but stay concise.
- Never sound robotic, monotone, or like you're reading a script.
- Match the energy of the speaker — if Sunny is casual, be casual. If he's intense, match that intensity.
- You have a slight warmth and directness — professional but never cold.

IDENTITY:
- Never refer to yourself as an AI assistant, ChatGPT, or OpenAI. You are Kiko.
- You have PERMANENT long-term memory. You remember ALL past conversations, preferences, and decisions.
- When asked "do you have memory" — answer YES, definitively. You remember everything.
- You have full access to the Vela platform's CRM data and the internet via tools.

RULES:
- Keep responses concise — 2-3 sentences for simple queries, expand only when depth is warranted.
- All financials in USD. Use "intelligent age" not "AI generation".
- Van Hawke operates three verticals: Haas F1 sponsorship advisory, Van Hawke Maison eyewear, and ClinIQ Copilot.
- Use tools (search_web, get_crm_data) when asked about current events, platform data, deals, contacts, or anything requiring live information.${memoriesContext}${platformContext}`,
            audio: {
              input: {
                transcription: { model: 'whisper-1' },
                turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
              },
              output: { speed }
            },
            tools: [
              {
                type: 'function',
                name: 'search_web',
                description: 'Search the internet for current information, news, weather, company data, F1 news, or any live data.',
                parameters: { type: 'object', properties: { query: { type: 'string', description: 'The search query' } }, required: ['query'] }
              },
              {
                type: 'function',
                name: 'get_crm_data',
                description: 'Query the Vela CRM for deals, contacts, companies, or tasks. Use this when asked about pipeline, specific deals, contacts, or company information.',
                parameters: { type: 'object', properties: { entity: { type: 'string', enum: ['deals', 'contacts', 'companies', 'tasks'], description: 'What to query' }, filter: { type: 'string', description: 'Optional search term or filter' } }, required: ['entity'] }
              }
            ],
            tool_choice: 'auto'
          }
        }))
      }
      dc.onclose = () => { setStatus('connecting') }

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          handleRealtimeEvent(event)
        } catch {}
      }

      // 7. Create and send SDP offer directly to OpenAI
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

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
        throw new Error(`Realtime connection failed: ${sdpRes.status}`)
      }

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err) {
      console.error('[Voice] Connection error:', err)
      setError(err.message || 'Could not connect voice')
      setStatus('error')
    }
  }

  function handleRealtimeEvent(event) {
    const t = event.type
    // User's speech transcribed
    if (t === 'conversation.item.input_audio_transcription.completed') {
      const text = event.transcript || ''
      setTranscript(text)
      if (text.trim()) {
        conversationRef.current.messages.push({ role: 'user', content: text })
        saveVoiceConversation()
      }
    }
    // Kiko's response text (delta)
    if (t === 'response.output_audio_transcript.delta') {
      setKikoText(prev => prev + (event.delta || ''))
    }
    // Kiko finished a response — save the full transcript
    if (t === 'response.output_audio_transcript.done') {
      const fullText = event.transcript || ''
      if (fullText.trim()) {
        conversationRef.current.messages.push({ role: 'assistant', content: fullText })
        saveVoiceConversation()
      }
    }
    // Kiko started a new response
    if (t === 'response.created') {
      setKikoText('')
      setSpeaking(true)
    }
    // Kiko finished speaking
    if (t === 'response.done') {
      setSpeaking(false)
    }
    // User started speaking (interruption)
    if (t === 'input_audio_buffer.speech_started') {
      setTranscript('')
      setKikoText('')
      setSpeaking(false)
    }
    // Function call
    if (t === 'response.function_call_arguments.done') {
      handleToolCall(event)
    }
  }

  async function saveVoiceConversation() {
    if (!user?.id) return
    const orgId = user?.app_metadata?.org_id
    const msgs = conversationRef.current.messages
    if (msgs.length === 0) return
    try {
      if (conversationRef.current.id) {
        await supabase.from('conversations').update({
          messages: msgs, updated_at: new Date().toISOString()
        }).eq('id', conversationRef.current.id)
      } else {
        const title = (msgs[0]?.content || 'Voice conversation').slice(0, 60)
        const { data } = await supabase.from('conversations').insert({
          user_id: user.id, org_id: orgId,
          title: '🎤 ' + title, messages: msgs
        }).select('id').single()
        if (data?.id) conversationRef.current.id = data.id
      }
    } catch (err) { console.error('[Voice] Save error:', err) }
  }

  async function handleToolCall(event) {
    const { name, arguments: argsStr, call_id } = event
    try {
      const args = JSON.parse(argsStr)
      let result = ''

      if (name === 'search_web' || name === 'get_crm_data') {
        // Proxy all tool calls through Kiko's Claude backend
        const message = name === 'search_web'
          ? `Search the web for: ${args.query}`
          : `Query CRM ${args.entity}${args.filter ? ` filtered by: ${args.filter}` : ''}`

        const res = await fetch('/api/kiko', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, currentPage: 'voice' })
        })
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let full = '', buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const d = line.slice(6)
            if (d === '[DONE]') continue
            try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
          }
        }
        result = full || 'No results found'
      }

      // Send tool result back to Realtime session
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call_id,
            output: result.slice(0, 4000)
          }
        }))
        // Ask model to continue responding
        dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      }
    } catch (err) {
      console.error('[Voice] Tool call error:', err)
    }
  }

  function disconnect() {
    if (dcRef.current) { try { dcRef.current.close() } catch {} }
    if (pcRef.current) { try { pcRef.current.close() } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()) }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null }
    pcRef.current = null
    dcRef.current = null
    streamRef.current = null
  }

  function handleClose() {
    disconnect()
    onClose()
  }

  const statusLabel = {
    connecting: 'Connecting...',
    live: speaking ? '' : 'Speak freely',
    error: error || 'Connection failed',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(250,250,250,0.92)',
      backdropFilter: 'blur(60px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(60px) saturate(1.8)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }} className="animate-fade-in">

      {/* Close / Stop */}
      <button onClick={handleClose} style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: 'none',
        color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}><X size={20} /></button>

      {/* K symbol */}
      <div style={{
        width: 140, height: 140, borderRadius: '50%',
        background: status === 'live' ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.4s',
        boxShadow: status === 'live' ? '0 0 60px rgba(0,0,0,0.1)' : 'none',
      }}>
        <span style={{
          fontSize: 52, fontWeight: 700, fontFamily: 'var(--font)',
          color: status === 'live' ? '#fff' : 'var(--text-tertiary)',
          letterSpacing: '-0.02em',
        }}>K</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <Equalizer active={status === 'live'} />
      </div>

      <p style={{
        fontSize: 14, marginTop: 12, fontFamily: 'var(--font)',
        textAlign: 'center',
        color: status === 'error' ? '#C62828' : 'var(--text-tertiary)',
      }}>{statusLabel[status]}</p>

      {/* Transcript */}
      {(transcript || kikoText) && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%',
          transform: 'translateX(-50%)', maxWidth: 560,
          width: '90%', textAlign: 'center', padding: '0 24px',
        }}>
          {transcript && (
            <p style={{
              fontSize: 15, color: 'var(--text)',
              fontFamily: 'var(--font)', fontWeight: 500,
              marginBottom: kikoText ? 12 : 0,
            }}>{transcript}</p>
          )}
          {kikoText && (
            <p style={{
              fontSize: 14, color: 'var(--text-secondary)',
              fontFamily: 'var(--font)', lineHeight: 1.6,
            }}>{kikoText}</p>
          )}
        </div>
      )}

      {/* Retry on error */}
      {status === 'error' && (
        <button onClick={connectRealtime} style={{
          marginTop: 16, height: 36, padding: '0 20px',
          borderRadius: 10, background: 'var(--accent)',
          color: '#fff', border: 'none', fontSize: 13,
          fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
        }}>Retry</button>
      )}
    </div>
  )
}
