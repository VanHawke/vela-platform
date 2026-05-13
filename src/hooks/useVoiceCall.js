// src/hooks/useVoiceCall.js — WebRTC voice calling via Supabase Realtime signaling
import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const API = 'https://api.vanhawke.agency'
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
      ch.send({ type: 'broadcast', event: 'offer', payload: { offer, from: userId, callerName: userName, callId: data.callId } })

      // Auto-end after 30s if no answer
      setTimeout(() => { if (callState === 'calling') endCall('missed') }, 30000)
    } catch (e) { console.error('[VoiceCall] Start failed:', e); endCall() }
  }, [callState, channelId, userId, userName, createPC, getMicrophone])

  // Answer call (recipient side)
  const answerCall = useCallback(async (offer, callerName, incomingCallId) => {
    setCallState('connected'); setRemoteName(callerName); setCallDuration(0)
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
        signalingRef.current = ch
        setCallState('ringing')
        setRemoteName(payload.callerName || 'Unknown')
        callIdRef.current = payload.callId
        setCallId(payload.callId)
        // Store offer for answering
        window.__incomingOffer = payload.offer
        window.__incomingCallerName = payload.callerName
        window.__incomingCallId = payload.callId
      }
    })
    ch.subscribe()
    return () => { if (callState === 'idle') supabase.removeChannel(ch) }
  }, [channelId, userId, callState])

  // Cleanup on unmount
  useEffect(() => { return () => { endCall() } }, [])

  return {
    callState, callDuration, remoteName, isMuted, callId,
    startCall, answerCall, declineCall, endCall, toggleMute,
    remoteAudioRef,
  }
}
