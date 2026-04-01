// src/hooks/useKikoVoice.js — Kiko Voice: clean architecture
// Mic → Deepgram STT → /api/kiko → collect full response → ONE TTS call → play
import { useState, useRef, useEffect, useCallback } from 'react';
import { getAudioContext, calculateRMS, createAnalyser } from '@/lib/audio-utils';

export function useKikoVoice({ user, onClose }) {
  const [status, setStatus] = useState('connecting');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [response, setResponse] = useState('');
  const [micEnergy, setMicEnergy] = useState(0);
  const [speakEnergy, setSpeakEnergy] = useState(0);

  const sttWS = useRef(null);
  const mediaStream = useRef(null);
  const mediaRecorder = useRef(null);
  const micAnalyserRef = useRef(null);
  const energyRAF = useRef(null);
  const speakRAF = useRef(null);
  const deadRef = useRef(false);
  const transcriptRef = useRef('');
  const tokenRef = useRef(null);
  const currentSource = useRef(null);
  const ttsAnalyser = useRef(null);
  const ttsCtx = useRef(null);
  const sendToKikoRef = useRef(null);

  const dispatchVoiceState = useCallback((detail) => {
    window.dispatchEvent(new CustomEvent('kiko_voice_state', {
      detail: { active: true, speaking: false, thinking: false, ...detail },
    }));
  }, []);

  const startMicEnergyPump = useCallback((analyser) => {
    const pump = () => {
      if (deadRef.current) return;
      const rms = calculateRMS(analyser);
      setMicEnergy(rms);
      energyRAF.current = requestAnimationFrame(pump);
    };
    energyRAF.current = requestAnimationFrame(pump);
  }, []);

  const getToken = useCallback(async () => {
    if (tokenRef.current && Date.now() - tokenRef.current.ts < 20000) return tokenRef.current.token;
    const res = await fetch('/api/voice-token');
    const { token } = await res.json();
    tokenRef.current = { token, ts: Date.now() };
    return token;
  }, []);

  // ── Play text as speech — ONE clean TTS call, ONE clean audio buffer ──
  const speakText = useCallback(async (text) => {
    if (deadRef.current || !text) return;
    try {
      const token = await getToken();
      const url = 'wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=24000';
      const chunks = [];
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(url, ['token', token]);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'Speak', text }));
          ws.send(JSON.stringify({ type: 'Flush' }));
          ws.send(JSON.stringify({ type: 'Close' }));
        };
        ws.onmessage = (evt) => {
          if (evt.data instanceof ArrayBuffer && evt.data.byteLength > 0) chunks.push(new Uint8Array(evt.data));
        };
        ws.onclose = () => resolve();
        ws.onerror = () => reject(new Error('TTS WebSocket error'));
        setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 15000);
      });
      if (deadRef.current || chunks.length === 0) return;

      // Combine all chunks into one buffer
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }
      const int16 = new Int16Array(combined.buffer);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;

      // Play one clean audio buffer
      if (!ttsCtx.current) ttsCtx.current = new AudioContext({ sampleRate: 24000 });
      if (ttsCtx.current.state === 'suspended') await ttsCtx.current.resume();
      const buf = ttsCtx.current.createBuffer(1, f32.length, 24000);
      buf.copyToChannel(f32, 0);
      if (!ttsAnalyser.current) {
        ttsAnalyser.current = ttsCtx.current.createAnalyser();
        ttsAnalyser.current.fftSize = 256;
        ttsAnalyser.current.smoothingTimeConstant = 0.75;
        ttsAnalyser.current.connect(ttsCtx.current.destination);
      }
      // Stop any previous playback
      if (currentSource.current) { try { currentSource.current.stop(); } catch {} }
      const src = ttsCtx.current.createBufferSource();
      src.buffer = buf;
      src.connect(ttsAnalyser.current);
      currentSource.current = src;

      setStatus('speaking');
      dispatchVoiceState({ speaking: true, status: 'Speaking' });
      // Energy pump for waveform
      const pump = () => {
        if (deadRef.current) return;
        const rms = ttsAnalyser.current ? calculateRMS(ttsAnalyser.current) : 0;
        setSpeakEnergy(rms);
        window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5);
        speakRAF.current = requestAnimationFrame(pump);
      };
      speakRAF.current = requestAnimationFrame(pump);

      await new Promise((resolve) => {
        src.onended = resolve;
        src.start(0);
      });

      // Done speaking
      currentSource.current = null;
      cancelAnimationFrame(speakRAF.current);
      setSpeakEnergy(0);
      window.__kikoAudioEnergy = 0;
      if (!deadRef.current) {
        setStatus('listening');
        dispatchVoiceState({ speaking: false, status: 'Listening' });
      }
    } catch (e) {
      console.error('[Voice] TTS error:', e);
      if (!deadRef.current) { setStatus('listening'); dispatchVoiceState({ status: 'Listening' }); }
    }
  }, [getToken, dispatchVoiceState]);

  // ── Send to brain, collect full response, then speak ──
  const sendToKiko = useCallback(async (text) => {
    if (!text || text.trim().length < 2) return;
    setStatus('thinking');
    setResponse('');
    dispatchVoiceState({ thinking: true, status: 'Thinking' });

    try {
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          userEmail: user?.email || '',
          currentPage: window.location.pathname.replace(/^\//, '') || 'home',
          conversationHistory: [],
          voiceMode: true,
        }),
      });

      // Collect full SSE response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) { fullResponse += parsed.delta; setResponse(fullResponse); }
            if (parsed.navigate) {
              window.history.pushState({}, '', `/${parsed.navigate}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          } catch {}
        }
      }

      // Speak the complete response as one clean audio
      if (fullResponse.trim() && !deadRef.current) {
        // Strip markdown artifacts that sound bad when spoken
        const spoken = fullResponse.replace(/\*\*/g, '').replace(/[#*_`]/g, '').replace(/\n+/g, ' ').trim();
        await speakText(spoken);
      } else if (!deadRef.current) {
        setStatus('listening');
        dispatchVoiceState({ status: 'Listening' });
      }
    } catch (err) {
      console.error('[Voice] Kiko error:', err);
      if (!deadRef.current) { setStatus('listening'); dispatchVoiceState({ status: 'Listening' }); }
    }
  }, [user, speakText, dispatchVoiceState]);

  sendToKikoRef.current = sendToKiko;

  // ── STT message handler ──
  const handleSTTMessage = useCallback((data) => {
    if (data.type === 'Results') {
      const alt = data.channel?.alternatives?.[0];
      if (!alt || !alt.transcript) return;
      if (data.is_final) {
        transcriptRef.current = (transcriptRef.current + ' ' + alt.transcript).trim();
        setTranscript(transcriptRef.current);
        setInterimText('');
      } else {
        setInterimText(alt.transcript);
      }
    }
    if (data.type === 'UtteranceEnd') {
      const finalText = transcriptRef.current.trim();
      if (finalText.length > 1) {
        // Stop any current playback (interruption)
        if (currentSource.current) { try { currentSource.current.stop(); } catch {} currentSource.current = null; }
        sendToKikoRef.current?.(finalText);
        transcriptRef.current = '';
        setTranscript('');
        setInterimText('');
      }
    }
  }, []);

  // ── Init ──
  const start = useCallback(async () => {
    try {
      setStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (deadRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      mediaStream.current = stream;

      const ctx = getAudioContext();
      const micSource = ctx.createMediaStreamSource(stream);
      const { analyser, cleanup } = createAnalyser(micSource);
      micAnalyserRef.current = { analyser, cleanup };
      startMicEnergyPump(analyser);

      const token = await getToken();
      const sttParams = new URLSearchParams({
        model: 'nova-3', language: 'en',
        interim_results: 'true', utterance_end_ms: '1000',
        vad_events: 'true', smart_format: 'true', punctuate: 'true',
      });
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${sttParams}`, ['token', token]);
      sttWS.current = ws;

      ws.onopen = () => {
        if (deadRef.current) { ws.close(); return; }
        setStatus('listening');
        dispatchVoiceState({ active: true, status: 'Listening' });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorder.current = recorder;
        recorder.ondataavailable = (e) => { if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
        recorder.start(250);
      };
      ws.onmessage = (evt) => { try { handleSTTMessage(JSON.parse(evt.data)); } catch {} };
      ws.onerror = () => setStatus('error');
      ws.onclose = (evt) => { if (!deadRef.current && evt.code !== 1000) setStatus('error'); };
    } catch (err) { console.error('[Voice] Init failed:', err); setStatus('error'); }
  }, [handleSTTMessage, startMicEnergyPump, getToken, dispatchVoiceState]);

  const stop = useCallback(() => {
    deadRef.current = true;
    cancelAnimationFrame(energyRAF.current);
    cancelAnimationFrame(speakRAF.current);
    micAnalyserRef.current?.cleanup?.();
    try { mediaRecorder.current?.stop(); } catch {}
    mediaStream.current?.getTracks().forEach(t => t.stop());
    try { sttWS.current?.close(); } catch {}
    if (currentSource.current) { try { currentSource.current.stop(); } catch {} }
    window.__kikoAudioEnergy = 0;
    dispatchVoiceState({ active: false, status: 'Off' });
    setStatus('idle');
  }, [dispatchVoiceState]);

  useEffect(() => {
    deadRef.current = false;
    start();
    return () => {
      deadRef.current = true;
      cancelAnimationFrame(energyRAF.current);
      cancelAnimationFrame(speakRAF.current);
      micAnalyserRef.current?.cleanup?.();
      try { mediaRecorder.current?.stop(); } catch {}
      mediaStream.current?.getTracks().forEach(t => t.stop());
      try { sttWS.current?.close(); } catch {}
      if (currentSource.current) { try { currentSource.current.stop(); } catch {} }
      window.__kikoAudioEnergy = 0;
    };
  }, []);

  return { status, transcript, interimText, response, micEnergy, speakEnergy, stop };
}
