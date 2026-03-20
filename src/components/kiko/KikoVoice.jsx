import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, X, MessageSquare } from 'lucide-react'
import KikoSymbol from './KikoSymbol'

// ── ARCHITECTURE ──
// STT: Web Speech API (free, instant, browser-native)
// Brain: Claude via /api/kiko (memory, tools, CRM, everything)
// TTS: OpenAI TTS API via /api/tts (shimmer voice — Kiko's identity)
// No GPT-4o. No WebRTC. No echo loops. No safety protocol fights.

const VOICE_ID = 'shimmer' // Kiko's voice — consistent across all sessions

export default function KikoVoice({ onClose, user, headless, mini, onVoiceState, onVoiceMessage, onShowPrompt, micStream }) {
  const [status, setStatus] = useState('idle') // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState('')
  const [kikoText, setKikoText] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const abortRef = useRef(null)
  const messagesRef = useRef([])
  const isMountedRef = useRef(true)
  const pausedForTTSRef = useRef(false)

  // Broadcast state to parent
  const broadcastState = useCallback((s) => {
    onVoiceState?.({ speaking: s === 'speaking', thinking: s === 'thinking', status: s === 'listening' ? 'Listening' : s === 'thinking' ? 'Thinking...' : s === 'speaking' ? 'Kiko is speaking' : 'Ready' })
  }, [onVoiceState])

  useEffect(() => { broadcastState(status) }, [status, broadcastState])
  useEffect(() => { return () => { isMountedRef.current = false; cleanup() } }, [])

  // ── CLEANUP ──
  function cleanup() {
    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch {} recognitionRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
  }

  // ── START: Initialize speech recognition ──
  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Speech recognition not supported in this browser'); return }

    cleanup()
    const sr = new SR()
    sr.continuous = true
    sr.interimResults = true
    sr.lang = 'en-US'
    recognitionRef.current = sr

    sr.onresult = (e) => {
      if (pausedForTTSRef.current) return // ignore while Kiko speaks
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (final) {
        setTranscript(final)
        setStatus('thinking')
        // Stop recognition while Claude processes
        pausedForTTSRef.current = true
        try { sr.stop() } catch {}
        routeThroughClaude(final.trim())
      } else if (interim) {
        setTranscript(interim)
        if (status !== 'listening') setStatus('listening')
      }
    }

    sr.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.error('[Kiko Voice] SR error:', e.error)
    }

    sr.onend = () => {
      // Auto-restart unless we're in TTS playback or unmounted
      if (isMountedRef.current && !pausedForTTSRef.current) {
        try { sr.start() } catch {}
      }
    }

    try { sr.start(); setStatus('listening'); setError(null) }
    catch (err) { setError('Could not start microphone: ' + err.message) }
  }, [])

  // ── CLAUDE BRIDGE: Send user speech to Claude, get response ──
  async function routeThroughClaude(text) {
    if (!text) return
    setKikoText('')
    messagesRef.current.push({ role: 'user', content: text })
    onVoiceMessage?.({ role: 'user', content: text })

    try {
      const history = messagesRef.current.slice(-10).map(m => ({
        role: m.role === 'kiko' ? 'assistant' : m.role, content: m.content
      }))
      abortRef.current = new AbortController()
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentPage: 'voice',
          userEmail: user?.email || 'sunny@vanhawke.com',
          conversationHistory: history
        }),
        signal: abortRef.current.signal,
      })

      // Parse SSE stream from Claude
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = '', buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6); if (d === '[DONE]') continue
          try { const j = JSON.parse(d); if (j.delta) full += j.delta } catch {}
        }
      }

      if (!full || !isMountedRef.current) return
      setKikoText(full)
      messagesRef.current.push({ role: 'kiko', content: full })
      onVoiceMessage?.({ role: 'kiko', content: full })

      // ── SPEAK via OpenAI TTS ──
      await speakText(full)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('[Kiko Voice] Claude error:', err)
      setError('Failed to get response')
    } finally {
      resumeListening()
    }
  }

  // ── TTS: Send text to OpenAI TTS and play audio ──
  async function speakText(text) {
    if (!text || !isMountedRef.current) return
    setStatus('speaking')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4096), voice: VOICE_ID }),
      })
      if (!res.ok) throw new Error('TTS failed: ' + res.status)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      return new Promise((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve() }
        audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
        audio.play().catch(() => resolve())
      })
    } catch (err) {
      console.error('[Kiko Voice] TTS error:', err)
    }
  }

  // ── Resume listening after Kiko finishes speaking ──
  function resumeListening() {
    if (!isMountedRef.current) return
    pausedForTTSRef.current = false
    setStatus('listening')
    setTranscript('')
    const sr = recognitionRef.current
    if (sr) { try { sr.start() } catch {} }
    else start()
  }

  // ── Interrupt: Stop Kiko speaking when user starts talking ──
  function interrupt() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setStatus('listening')
    setKikoText('')
  }

  // ── Close voice mode ──
  function handleClose() {
    cleanup()
    onClose?.()
  }

  // Auto-start on mount
  useEffect(() => { start() }, [start])

  // ── HEADLESS MODE: no UI ──
  if (headless) return null

  // ── MINI MODE (KikoFloat) ──
  if (mini) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: status === 'speaking' ? '#22c55e' : status === 'thinking' ? '#1A1A1A' : '#1A1A1A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: status === 'speaking' ? 'kikoBreatheScale 1.5s ease-in-out infinite' : status === 'thinking' ? 'kikoBreatheScale 2s ease-in-out infinite' : 'none',
            cursor: 'pointer', transition: 'all 0.3s',
          }} onClick={status === 'speaking' ? interrupt : handleClose}>
            {status === 'listening' ? <Mic size={22} color="#fff" /> : <KikoSymbol size={24} color="#fff" animated={status === 'thinking'} />}
          </div>
        </div>
        {transcript && <div style={{ maxWidth: 200, padding: '6px 12px', borderRadius: 10, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', fontSize: 12, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif" }}>{transcript}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="#6B6B6B" /></button>
          {onShowPrompt && <button onClick={onShowPrompt} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageSquare size={14} color="#6B6B6B" /></button>}
        </div>
      </div>
    )
  }

  // ── FULL MODE (standalone — not typically used, voice lives in chat) ──
  return null
}
