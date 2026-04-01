// src/hooks/useKikoVoice.js — Kiko Voice (final)
// Mic → Deepgram STT → /api/kiko (SSE) → sentence-by-sentence TTS REST → play
// Each sentence: POST to Deepgram REST → get complete audio → play immediately
import { useState, useRef, useEffect, useCallback } from 'react';
import { getAudioContext, calculateRMS, createAnalyser } from '@/lib/audio-utils';

export function useKikoVoice({ user, onClose }) {
  const [status, setStatus] = useState('connecting');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [response, setResponse] = useState('');
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
  const sendToKikoRef = useRef(null);
  // Audio queue: sentences line up, play one after another
  const audioQueue = useRef([]);
  const isPlayingRef = useRef(false);
  const currentSource = useRef(null);
  const ttsCtx = useRef(null);
  const ttsAnalyser = useRef(null);
  const abortRef = useRef(false); // Abort flag for interruption

  const dispatchVoiceState = useCallback((d) => {
    window.dispatchEvent(new CustomEvent('kiko_voice_state', {
      detail: { active: true, speaking: false, thinking: false, ...d },
    }));
  }, []);

  const getToken = useCallback(async () => {
    if (tokenRef.current && Date.now() - tokenRef.current.ts < 50000) return tokenRef.current.token;
    const r = await fetch('/api/voice-token');
    const { token } = await r.json();
    tokenRef.current = { token, ts: Date.now() };
    return token;
  }, []);

  // ── TTS: convert text to AudioBuffer via Deepgram REST (one clean call) ──
  const textToAudio = useCallback(async (text) => {
    const token = await getToken();
    const res = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=24000', {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS failed: ' + res.status);
    const ab = await res.arrayBuffer();
    if (!ttsCtx.current) ttsCtx.current = new AudioContext({ sampleRate: 24000 });
    if (ttsCtx.current.state === 'suspended') await ttsCtx.current.resume();
    const int16 = new Int16Array(ab);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buf = ttsCtx.current.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    return buf;
  }, [getToken]);

  // ── Audio queue: play buffers one after another, interruptible ──
  const playNext = useCallback(() => {
    if (abortRef.current || audioQueue.current.length === 0) {
      isPlayingRef.current = false;
      cancelAnimationFrame(speakRAF.current);
      setSpeakEnergy(0);
      window.__kikoAudioEnergy = 0;
      if (!deadRef.current && !abortRef.current) {
        setStatus('listening');
        dispatchVoiceState({ speaking: false, status: 'Listening' });
      }
      return;
    }
    isPlayingRef.current = true;
    const buf = audioQueue.current.shift();
    const ctx = ttsCtx.current;
    if (!ttsAnalyser.current) {
      ttsAnalyser.current = ctx.createAnalyser();
      ttsAnalyser.current.fftSize = 256;
      ttsAnalyser.current.smoothingTimeConstant = 0.75;
      ttsAnalyser.current.connect(ctx.destination);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ttsAnalyser.current);
    currentSource.current = src;
    src.onended = () => { currentSource.current = null; playNext(); };
    src.start(0);
  }, [dispatchVoiceState]);

  // ── Queue a sentence for speaking (non-blocking) ──
  const queueSpeak = useCallback(async (text) => {
    if (deadRef.current || abortRef.current || !text?.trim()) return;
    try {
      const buf = await textToAudio(text.trim());
      if (deadRef.current || abortRef.current) return;
      audioQueue.current.push(buf);
      if (!isPlayingRef.current) {
        setStatus('speaking');
        dispatchVoiceState({ speaking: true, status: 'Speaking' });
        // Start energy pump
        const pump = () => {
          if (!isPlayingRef.current || deadRef.current) { setSpeakEnergy(0); window.__kikoAudioEnergy = 0; return; }
          const rms = ttsAnalyser.current ? calculateRMS(ttsAnalyser.current) : 0;
          setSpeakEnergy(rms);
          window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5);
          speakRAF.current = requestAnimationFrame(pump);
        };
        speakRAF.current = requestAnimationFrame(pump);
        playNext();
      }
    } catch (e) { console.error('[Voice] TTS error:', e); }
  }, [textToAudio, playNext, dispatchVoiceState]);

  // ── Interrupt: stop speaking immediately ──
  const interrupt = useCallback(() => {
    abortRef.current = true;
    audioQueue.current = [];
    if (currentSource.current) { try { currentSource.current.stop(); } catch {} currentSource.current = null; }
    isPlayingRef.current = false;
    cancelAnimationFrame(speakRAF.current);
    setSpeakEnergy(0);
    window.__kikoAudioEnergy = 0;
  }, []);

  // ── Send to brain, stream sentences to TTS as they complete ──
  const sendToKiko = useCallback(async (text) => {
    if (!text || text.trim().length < 2) return;
    abortRef.current = false;
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
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let sentenceBuffer = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abortRef.current) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) {
              const clean = parsed.delta.replace(/\*\*/g, '').replace(/[#*_`]/g, '');
              fullResponse += parsed.delta;
              sentenceBuffer += clean;
              setResponse(fullResponse);
              // Check for sentence boundary
              const match = sentenceBuffer.match(/^(.*?[.!?])\s/s);
              if (match) {
                const sentence = match[1].trim();
                sentenceBuffer = sentenceBuffer.slice(match[0].length);
                if (sentence.length > 3) queueSpeak(sentence);
              }
            }
            if (parsed.navigate) {
              window.history.pushState({}, '', `/${parsed.navigate}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          } catch {}
        }
      }
      // Flush remaining text
      if (sentenceBuffer.trim().length > 3 && !abortRef.current) queueSpeak(sentenceBuffer.trim());
    } catch (err) {
      console.error('[Voice] Kiko error:', err);
      if (!deadRef.current) { setStatus('listening'); dispatchVoiceState({ status: 'Listening' }); }
    }
  }, [user, queueSpeak, dispatchVoiceState]);

  sendToKikoRef.current = sendToKiko;

  // ── STT handler with interruption ──
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
        interrupt();
        sendToKikoRef.current?.(finalText);
        transcriptRef.current = '';
        setTranscript('');
        setInterimText('');
      }
    }
    // Instant interruption when user starts speaking during playback
    if (data.type === 'SpeechStarted' && isPlayingRef.current) {
      interrupt();
      setStatus('listening');
      dispatchVoiceState({ speaking: false, status: 'Listening' });
    }
  }, [interrupt, dispatchVoiceState]);

  // ── Init ──
  const start = useCallback(async () => {
    try {
      setStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (deadRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      mediaStream.current = stream;
      const ctx = getAudioContext();
      const { analyser, cleanup } = createAnalyser(ctx.createMediaStreamSource(stream));
      micAnalyserRef.current = { analyser, cleanup };
      // Mic energy pump (for future use — not driving waveform)
      const pump = () => { if (!deadRef.current) energyRAF.current = requestAnimationFrame(pump); };
      energyRAF.current = requestAnimationFrame(pump);

      const token = await getToken();
      const p = new URLSearchParams({
        model: 'nova-3', language: 'en', interim_results: 'true',
        utterance_end_ms: '1000', vad_events: 'true', smart_format: 'true', punctuate: 'true',
      });
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${p}`, ['token', token]);
      sttWS.current = ws;
      ws.onopen = () => {
        if (deadRef.current) { ws.close(); return; }
        setStatus('listening');
        dispatchVoiceState({ active: true, status: 'Listening' });
        const mt = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const rec = new MediaRecorder(stream, { mimeType: mt });
        mediaRecorder.current = rec;
        rec.ondataavailable = (e) => { if (e.data.size > 0 && ws.readyState === 1) ws.send(e.data); };
        rec.start(250);
      };
      ws.onmessage = (e) => { try { handleSTTMessage(JSON.parse(e.data)); } catch {} };
      ws.onerror = () => setStatus('error');
      ws.onclose = (e) => { if (!deadRef.current && e.code !== 1000) setStatus('error'); };
    } catch (err) { console.error('[Voice] Init:', err); setStatus('error'); }
  }, [handleSTTMessage, getToken, dispatchVoiceState]);

  const stop = useCallback(() => {
    deadRef.current = true;
    abortRef.current = true;
    cancelAnimationFrame(energyRAF.current);
    cancelAnimationFrame(speakRAF.current);
    micAnalyserRef.current?.cleanup?.();
    try { mediaRecorder.current?.stop(); } catch {}
    mediaStream.current?.getTracks().forEach(t => t.stop());
    try { sttWS.current?.close(); } catch {}
    if (currentSource.current) { try { currentSource.current.stop(); } catch {} }
    audioQueue.current = [];
    window.__kikoAudioEnergy = 0;
    dispatchVoiceState({ active: false, status: 'Off' });
    setStatus('idle');
  }, [dispatchVoiceState]);

  useEffect(() => {
    deadRef.current = false;
    abortRef.current = false;
    start();
    return () => {
      deadRef.current = true;
      abortRef.current = true;
      cancelAnimationFrame(energyRAF.current);
      cancelAnimationFrame(speakRAF.current);
      micAnalyserRef.current?.cleanup?.();
      try { mediaRecorder.current?.stop(); } catch {}
      mediaStream.current?.getTracks().forEach(t => t.stop());
      try { sttWS.current?.close(); } catch {}
      if (currentSource.current) { try { currentSource.current.stop(); } catch {} }
      audioQueue.current = [];
      window.__kikoAudioEnergy = 0;
    };
  }, []);

  return { status, transcript, interimText, response, speakEnergy, stop };
}
