// src/hooks/useVoiceCall.js — WebRTC voice calling via Supabase Realtime signaling
import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const API = 'https://api.vanhawke.agency'

// Call tones — Web Audio API (no external files)
class CallTones {
  constructor() { this.ctx = null; this.activeOsc = []; this.loopTimer = null }
  
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); return this.ctx }
  
  stop() {
    this.activeOsc.forEach(o => { try { o.stop(); o.disconnect() } catch(e) {} })
    this.activeOsc = []
    if (this.loopTimer) { clearInterval(this.loopTimer); this.loopTimer = null }
  }
  
  _tone(freq, duration, vol = 0.15) {
    const ctx = this.init()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.type = 'sine'; osc.frequency.value = freq
    gain.gain.value = vol
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); this.activeOsc.push(osc)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.stop(ctx.currentTime + duration)
    setTimeout(() => { this.activeOsc = this.activeOsc.filter(o => o !== osc) }, duration * 1000 + 50)
  }

  // Outgoing ring — UK-style double ring: brr-brr... pause... brr-brr...
  ringOutgoing() {
    this.stop()
    const play = () => {
      this._tone(440, 0.4, 0.12); this._tone(480, 0.4, 0.12)
      setTimeout(() => { this._tone(440, 0.4, 0.12); this._tone(480, 0.4, 0.12) }, 500)
    }
    play()
    this.loopTimer = setInterval(play, 3000)
  }

  // Incoming ring — ascending two-tone chime
  ringIncoming() {
    this.stop()
    const play = () => {
      this._tone(523, 0.3, 0.18)
      setTimeout(() => this._tone(659, 0.3, 0.18), 200)
      setTimeout(() => this._tone(784, 0.4, 0.15), 400)
    }
    play()
    this.loopTimer = setInterval(play, 2500)
  }

  // Connected — brief rising pip
  connected() {
    this.stop()
    this._tone(440, 0.1, 0.1)
    setTimeout(() => this._tone(660, 0.15, 0.1), 100)
  }

  // Ended/hangup — three descending tones
  ended() {
    this.stop()
    this._tone(480, 0.2, 0.12)
    setTimeout(() => this._tone(400, 0.2, 0.12), 250)
    setTimeout(() => this._tone(320, 0.35, 0.1), 500)
  }

  // Busy/declined — fast repetitive beeps
  busy() {
    this.stop()
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this._tone(480, 0.15, 0.1), i * 300)
    }
  }
}

const tones = new CallTones()
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function useVoiceCall({ userId, userName, channelId }) {
  const [callState, setCallState] = useState('idle') // idle, calling, ringing, connected, ended
  const [callDuration, setCallDuration] = useState(0)
  const [remoteName, setRemoteName] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [callId, setCallId] = useState(null)

  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const signalingRef = useRef(null)
  const durationTimerRef = useRef(null)
  const callIdRef = useRef(null)

  // Create peer connection
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (e) => {
      if (e.candidate && signalingRef.current) {
        signalingRef.current.send({ type: 'broadcast', event: 'ice-candidate', payload: { candidate: e.candidate, from: userId } })
      }
    }
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = e.streams[0] }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected')
        tones.connected() // Brief pip sound on connect
        durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
        // Update call history
        if (callIdRef.current) {
          fetch(`${API}/api/team-messages?action=call-connected`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: callIdRef.current }) }).catch(() => {})
        }
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) { endCall() }
    }
    pcRef.current = pc
    return pc
  }, [userId])

  // Get microphone
  const getMicrophone = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    return stream
  }, [])

  // Start call (caller side)
  const startCall = useCallback(async (recipientId, recipientName) => {
    if (callState !== 'idle') return
    setCallState('calling'); setRemoteName(recipientName); setCallDuration(0)
    tones.ringOutgoing() // Caller hears ringing sound
    try {
      const stream = await getMicrophone()
      const pc = createPC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Create signaling channel
      const ch = supabase.channel(`call-${channelId}`)
      signalingRef.current = ch

      // Listen for answer + ICE candidates
      ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.from !== userId) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer))
        }
      })
      ch.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from !== userId && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {})
        }
      })
      ch.on('broadcast', { event: 'hangup' }, ({ payload }) => {
        if (payload.from !== userId) endCall()
      })
      await ch.subscribe()

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Log call to history
      const res = await fetch(`${API}/api/team-messages?action=call-start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, callerId: userId, callerName: userName, recipientId, recipientName })
      })
      const data = await res.json()
      callIdRef.current = data.callId; setCallId(data.callId)

      // Broadcast offer
      ch.send({ type: 'broadcast', event: 'offer', payload: { offer, from: userId, callerName: userName, callId: data.callId, timestamp: Date.now() } })

      // Auto-end after 30s if no answer
      setTimeout(() => { if (callState === 'calling') endCall('missed') }, 30000)
    } catch (e) { console.error('[VoiceCall] Start failed:', e); endCall() }
  }, [callState, channelId, userId, userName, createPC, getMicrophone])

  // Answer call (recipient side)
  const answerCall = useCallback(async (offer, callerName, incomingCallId) => {
    setCallState('connected'); setRemoteName(callerName); setCallDuration(0)
    tones.connected() // Stop ringing, play connect pip
    callIdRef.current = incomingCallId; setCallId(incomingCallId)
    try {
      const stream = await getMicrophone()
      const pc = createPC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Set remote offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      // Listen for ICE + hangup
      const ch = signalingRef.current || supabase.channel(`call-${channelId}`)
      signalingRef.current = ch
      ch.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from !== userId && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {})
        }
      })
      ch.on('broadcast', { event: 'hangup' }, ({ payload }) => {
        if (payload.from !== userId) endCall()
      })
      if (!ch.state || ch.state === 'closed') await ch.subscribe()

      // Create answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      ch.send({ type: 'broadcast', event: 'answer', payload: { answer, from: userId } })
    } catch (e) { console.error('[VoiceCall] Answer failed:', e); endCall() }
  }, [channelId, userId, createPC, getMicrophone])

  // Decline call
  const declineCall = useCallback(() => {
    tones.busy() // Busy/declined beeps
    if (signalingRef.current) {
      signalingRef.current.send({ type: 'broadcast', event: 'hangup', payload: { from: userId, reason: 'declined' } })
    }
    setCallState('idle'); setRemoteName('')
    if (callIdRef.current) {
      fetch(`${API}/api/team-messages?action=call-end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: callIdRef.current, status: 'declined', duration: 0 }) }).catch(() => {})
    }
  }, [userId])

  // End call
  const endCall = useCallback((reason = 'ended') => {
    // Only play tones if we were actually in a call
    if (callState !== 'idle') {
      if (reason === 'missed' || reason === 'declined') tones.busy()
      else if (reason === 'ended' && callState === 'connected') tones.ended()
      else tones.stop()
    }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null }
    if (signalingRef.current) {
      signalingRef.current.send({ type: 'broadcast', event: 'hangup', payload: { from: userId, reason } }).catch(() => {})
      supabase.removeChannel(signalingRef.current); signalingRef.current = null
    }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null }
    // Log end
    if (callIdRef.current) {
      fetch(`${API}/api/team-messages?action=call-end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: callIdRef.current, status: reason, duration: callDuration }) }).catch(() => {})
      callIdRef.current = null
    }
    setCallState('idle'); setCallDuration(0); setIsMuted(false); setCallId(null)
  }, [userId, callDuration])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled) }
    }
  }, [])

  // Listen for incoming calls
  useEffect(() => {
    if (!channelId) return
    const ch = supabase.channel(`call-${channelId}`)
    ch.on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (payload.from !== userId && callState === 'idle') {
        // Verify this is a recent offer (within last 30 seconds)
        const offerAge = Date.now() - (payload.timestamp || 0)
        if (offerAge > 30000) return // Ignore stale offers
        signalingRef.current = ch
        setCallState('ringing')
        setRemoteName(payload.callerName || 'Unknown')
        tones.ringIncoming()
        callIdRef.current = payload.callId
        setCallId(payload.callId)
        window.__incomingOffer = payload.offer
        window.__incomingCallerName = payload.callerName
        window.__incomingCallId = payload.callId
      }
    })
    ch.subscribe()
    return () => { 
      supabase.removeChannel(ch)
      tones.stop() // Always stop tones on cleanup
    }
  }, [channelId, userId, callState])

  // Cleanup on unmount — stop everything
  useEffect(() => { 
    return () => { 
      tones.stop()
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null }
      if (signalingRef.current) { supabase.removeChannel(signalingRef.current); signalingRef.current = null }
      if (durationTimerRef.current) { clearInterval(durationTimerRef.current) }
    }
  }, [])

  return {
    callState, callDuration, remoteName, isMuted, callId,
    startCall, answerCall, declineCall, endCall, toggleMute,
    remoteAudioRef,
  }
}
