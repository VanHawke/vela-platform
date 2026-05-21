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

  // Outgoing ring — UK-style double ring: ring-ring... pause... ring-ring...
  ringOutgoing() {
    this.stop()
    const play = () => {
      const ctx = this.init()
      if (ctx.state === 'suspended') ctx.resume()
      this._tone(440, 0.8, 0.25); this._tone(480, 0.8, 0.22)
      setTimeout(() => { this._tone(440, 0.8, 0.25); this._tone(480, 0.8, 0.22) }, 1000)
    }
    play()
    this.loopTimer = setInterval(play, 4000)
  }

  // Incoming ring — ascending three-tone chime (louder)
  ringIncoming() {
    this.stop()
    const play = () => {
      const ctx = this.init()
      if (ctx.state === 'suspended') ctx.resume()
      this._tone(523, 0.5, 0.3)
      setTimeout(() => this._tone(659, 0.5, 0.3), 300)
      setTimeout(() => this._tone(784, 0.6, 0.25), 600)
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
  const [callError, setCallError] = useState(null)
  const [callEndReason, setCallEndReason] = useState(null) // ended, missed, declined, no_answer
  const [isVideoCall, setIsVideoCall] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)

  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
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
      if (e.track.kind === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0]
      } else if (e.track.kind === 'audio' && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0]
      }
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

  // Get media (audio + optional video)
  const getMedia = useCallback(async (withVideo = false) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo ? { width: 640, height: 480, facingMode: 'user' } : false })
    localStreamRef.current = stream
    if (withVideo && localVideoRef.current) { localVideoRef.current.srcObject = stream }
    return stream
  }, [])

  // Start call (caller side) — pass video=true for video call
  const startCall = useCallback(async (recipientId, recipientName, video = false) => {
    if (callState !== 'idle') return
    setCallState('calling'); setRemoteName(recipientName); setCallDuration(0); setCallError(null)
    setIsVideoCall(video); setIsVideoEnabled(video)
    tones.ringOutgoing()
    try {
      const stream = await getMedia(video)
      console.log(`[VoiceCall] Media acquired (video=${video})`)
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

      // Broadcast offer on channel-specific AND recipient-specific channels
      ch.send({ type: 'broadcast', event: 'offer', payload: { offer, from: userId, callerName: userName, callId: data.callId, channelId, timestamp: Date.now() } })
      // Also notify recipient globally (for when they're not on Messages page)
      const globalCh = supabase.channel(`call-notify-${recipientId}`)
      await globalCh.subscribe()
      globalCh.send({ type: 'broadcast', event: 'incoming-call', payload: { from: userId, callerName: userName, callId: data.callId, channelId, timestamp: Date.now() } })
      setTimeout(() => supabase.removeChannel(globalCh), 2000)

      // Auto-end after 30s if no answer
      setTimeout(() => { if (callState === 'calling') endCall('missed') }, 30000)
    } catch (e) { 
      console.error('[VoiceCall] Start failed:', e)
      tones.stop()
      if (e.name === 'NotAllowedError') {
        setCallError('Microphone access denied. Click the lock icon in your browser address bar → Site Settings → Microphone → Allow')
      } else if (e.name === 'NotFoundError') {
        setCallError('No microphone found. Please connect a microphone and try again.')
      } else {
        setCallError(`Call failed: ${e.message}`)
      }
      setCallState('idle')
    }
  }, [callState, channelId, userId, userName, createPC, getMedia])

  // Answer call (recipient side)
  const answerCall = useCallback(async (offer, callerName, incomingCallId) => {
    setCallState('connected'); setRemoteName(callerName); setCallDuration(0)
    tones.connected() // Stop ringing, play connect pip
    callIdRef.current = incomingCallId; setCallId(incomingCallId)
    try {
      const stream = await getMedia(isVideoCall)
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
  }, [channelId, userId, createPC, getMedia])

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
    // ALWAYS stop tones first — unconditional, prevents stuck ringing
    tones.stop()
    
    // Play appropriate end tone
    if (callStateRef.current !== 'idle') {
      if (reason === 'missed' || reason === 'declined') tones.busy()
      else if (reason === 'ended' && callStateRef.current === 'connected') tones.ended()
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
    // Post missed/ended call message in chat
    if (channelId && (reason === 'missed' || reason === 'declined' || (reason === 'ended' && callDuration > 0))) {
      const callMsg = reason === 'missed' ? `📞 Missed call` : reason === 'declined' ? `📞 Call declined` : `📞 Call ended · ${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')}`
      fetch(`${API}/api/team-messages?action=send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, fromUserId: userId, fromName: userName, content: callMsg, messageType: 'system' }) }).catch(() => {})
    }
    // Show "call ended" summary for 3 seconds before returning to idle
    setCallEndReason(reason)
    setCallState('ended')
    setIsMuted(false); setCallId(null)
    setTimeout(() => { setCallState('idle'); setCallDuration(0); setCallEndReason(null) }, 3000)
  }, [userId, callDuration])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled) }
    }
  }, [])

  // Toggle video on/off during call
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return
    const videoTrack = localStreamRef.current.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsVideoEnabled(videoTrack.enabled)
    } else if (pcRef.current) {
      // No video track yet — add one
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
        const newTrack = videoStream.getVideoTracks()[0]
        localStreamRef.current.addTrack(newTrack)
        pcRef.current.addTrack(newTrack, localStreamRef.current)
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
        setIsVideoEnabled(true); setIsVideoCall(true)
      } catch (e) { console.error('[VoiceCall] Failed to enable video:', e.message) }
    }
  }, [])

  // Screen sharing
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef(null)

  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current || !localStreamRef.current) return
    if (isScreenSharing) {
      // Stop screen share — revert to camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }
      const senders = pcRef.current.getSenders()
      const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
          const camTrack = camStream.getVideoTracks()[0]
          await videoSender.replaceTrack(camTrack)
          localStreamRef.current.getVideoTracks().forEach(t => { t.stop(); localStreamRef.current.removeTrack(t) })
          localStreamRef.current.addTrack(camTrack)
          if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
        } catch (e) { console.error('[VoiceCall] Revert camera failed:', e.message) }
      }
      setIsScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]
        const senders = pcRef.current.getSenders()
        const videoSender = senders.find(s => s.track?.kind === 'video')
        if (videoSender) { await videoSender.replaceTrack(screenTrack) }
        else { pcRef.current.addTrack(screenTrack, localStreamRef.current) }
        if (localVideoRef.current) { localVideoRef.current.srcObject = new MediaStream([screenTrack]) }
        setIsScreenSharing(true); setIsVideoCall(true); setIsVideoEnabled(true)
        screenTrack.onended = () => { toggleScreenShare() }
      } catch (e) { console.error('[VoiceCall] Screen share failed:', e.message); setIsScreenSharing(false) }
    }
  }, [isScreenSharing])

  // Listen for incoming calls — DO NOT include callState in deps (cleanup kills tones)
  const callStateRef = useRef(callState)
  callStateRef.current = callState

  useEffect(() => {
    if (!channelId) return
    const ch = supabase.channel(`call-${channelId}`)
    ch.on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (payload.from !== userId && callStateRef.current === 'idle') {
        const offerAge = Date.now() - (payload.timestamp || 0)
        if (offerAge > 30000) return
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
    }
  }, [channelId, userId]) // NO callState — cleanup would kill tones

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
    callState, callDuration, remoteName, isMuted, callId, callError, callEndReason,
    isVideoCall, isVideoEnabled, isScreenSharing,
    startCall, answerCall, declineCall, endCall, toggleMute, toggleVideo, toggleScreenShare,
    remoteAudioRef, localVideoRef, remoteVideoRef,
  }
}
