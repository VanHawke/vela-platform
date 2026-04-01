// src/hooks/useKikoVoice.js — Kiko Voice: streaming architecture
// Mic → Deepgram STT (browser WS) → /api/kiko (SSE) → Deepgram TTS (browser WS) → Speaker
// Key: LLM tokens stream sentence-by-sentence into TTS — no waiting for full response
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  getAudioContext, calculateRMS, createAnalyser,
  StreamingAudioPlayer, SentenceChunker,
} from '@/lib/audio-utils';

// Filler phrases spoken instantly while brain processes (kills dead silence)
const FILLERS = [
  'One moment.',
  'Let me check.',
  'On it.',
  'Checking now.',
];
const randomFiller = () => FILLERS[Math.floor(Math.random() * FILLERS.length)];

export function useKikoVoice({ user, onClose }) {
  const [status, setStatus] = useState('connecting');
  // 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [response, setResponse] = useState('');
  const [micEnergy, setMicEnergy] = useState(0);
  const [speakEnergy, setSpeakEnergy] = useState(0);

  // Refs
  const sttWS = useRef(null);           // Deepgram STT WebSocket
  const ttsWS = useRef(null);           // Deepgram TTS WebSocket
  const mediaStream = useRef(null);
  const mediaRecorder = useRef(null);
  const audioPlayer = useRef(null);
  const micAnalyserRef = useRef(null);
  const energyRAF = useRef(null);
  const speakRAF = useRef(null);
  const deadRef = useRef(false);
  const transcriptRef = useRef('');
  const tokenRef = useRef(null);        // Cached Deepgram temp token
  const isSpeakingRef = useRef(false);  // Track TTS state for interruption

  // ── Dispatch voice state (green pill + float glow) ──
  const dispatchVoiceState = useCallback((detail) => {
    window.dispatchEvent(new CustomEvent('kiko_voice_state', {
      detail: { active: true, speaking: false, thinking: false, ...detail },
    }));
  }, []);

  // ── Mic energy pump ──
  const startMicEnergyPump = useCallback((analyser) => {
    const pump = () => {
      if (deadRef.current) return;
      const rms = calculateRMS(analyser);
      setMicEnergy(rms);
      window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5);
      energyRAF.current = requestAnimationFrame(pump);
    };
    energyRAF.current = requestAnimationFrame(pump);
  }, []);

  // ── Speak energy pump (drives waveform during TTS playback) ──
  const startSpeakEnergyPump = useCallback(() => {
    const pump = () => {
      if (deadRef.current || !audioPlayer.current?.isPlaying()) {
        setSpeakEnergy(0);
        window.__kikoAudioEnergy = 0;
        return;
      }
      const an = audioPlayer.current.getAnalyser();
      const rms = an ? calculateRMS(an) : 0;
      setSpeakEnergy(rms);
      window.__kikoAudioEnergy = Math.min(0.55, rms * 2.5);
      speakRAF.current = requestAnimationFrame(pump);
    };
    speakRAF.current = requestAnimationFrame(pump);
  }, []);

  // ── Get temporary Deepgram token ──
  const getToken = useCallback(async () => {
    // Reuse if fresh (tokens last 30s, we refresh at 20s)
    if (tokenRef.current && Date.now() - tokenRef.current.ts < 20000) {
      return tokenRef.current.token;
    }
    const res = await fetch('/api/voice-token');
    if (!res.ok) throw new Error('Token fetch failed');
    const { token } = await res.json();
    tokenRef.current = { token, ts: Date.now() };
    return token;
  }, []);

  // ── Open TTS WebSocket (browser → Deepgram direct) ──
  const openTTSSocket = useCallback(async () => {
    if (ttsWS.current?.readyState === WebSocket.OPEN) return ttsWS.current;
    const token = await getToken();
    const url = 'wss://api.deepgram.com/v1/speak?' + new URLSearchParams({
      model: 'aura-2-thalia-en',
      encoding: 'linear16',
      sample_rate: '24000',
    });
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, ['token', token]);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { ttsWS.current = ws; resolve(ws); };
      ws.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer && evt.data.byteLength > 44) {
          // Audio chunk — enqueue for playback
          if (!audioPlayer.current) {
            audioPlayer.current = new StreamingAudioPlayer();
            audioPlayer.current.onEnd = () => {
              isSpeakingRef.current = false;
              if (!deadRef.current) {
                setStatus('listening');
                setSpeakEnergy(0);
                dispatchVoiceState({ speaking: false, status: 'Listening' });
              }
            };
          }
          audioPlayer.current.enqueue(evt.data);
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setStatus('speaking');
            dispatchVoiceState({ speaking: true, status: 'Speaking' });
            startSpeakEnergyPump();
          }
        }
        // Text messages are metadata — ignore
      };
      ws.onerror = (e) => { console.error('[Voice] TTS WS error:', e); reject(e); };
      ws.onclose = () => { ttsWS.current = null; };
    });
  }, [getToken, dispatchVoiceState, startSpeakEnergyPump]);

  // ── Send text to TTS WebSocket ──
  const sendToTTS = useCallback(async (text) => {
    try {
      const ws = await openTTSSocket();
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'Speak', text }));
      ws.send(JSON.stringify({ type: 'Flush' }));
    } catch (e) {
      console.error('[Voice] TTS send error:', e);
    }
  }, [openTTSSocket]);

  // ── Send transcript to /api/kiko brain (STREAMING) ──
  const sendToKiko = useCallback(async (text) => {
    if (!text || text.trim().length < 2) return;
    setStatus('thinking');
    setResponse('');
    dispatchVoiceState({ thinking: true, status: 'Thinking' });

    // Instant filler — speak immediately while brain processes
    await sendToTTS(randomFiller());

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

      // Stream LLM tokens → sentence chunks → TTS WebSocket
      const chunker = new SentenceChunker((sentence) => {
        // Each complete sentence gets spoken immediately
        sendToTTS(sentence);
      });

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
            if (parsed.delta) {
              fullResponse += parsed.delta;
              setResponse(fullResponse);
              // Feed token to sentence chunker → fires sendToTTS per sentence
              chunker.add(parsed.delta);
            }
            if (parsed.navigate) {
              window.history.pushState({}, '', `/${parsed.navigate}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          } catch {}
        }
      }

      // Flush remaining buffered text to TTS
      chunker.flush();

    } catch (err) {
      console.error('[Voice] Kiko error:', err);
      if (!deadRef.current) {
        setStatus('listening');
        dispatchVoiceState({ status: 'Listening' });
      }
    }
  }, [user, sendToTTS, dispatchVoiceState]);

  // ── Handle Deepgram STT messages ──
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
        sendToKiko(finalText);
        transcriptRef.current = '';
        setTranscript('');
        setInterimText('');
      }
    }

    // Interruption: user spoke while Kiko was talking
    if (data.type === 'SpeechStarted' && isSpeakingRef.current) {
      audioPlayer.current?.stop();
      cancelAnimationFrame(speakRAF.current);
      isSpeakingRef.current = false;
      setSpeakEnergy(0);
      // Close and reopen TTS WS (clears Deepgram's text buffer)
      if (ttsWS.current) { try { ttsWS.current.close(); } catch {} ttsWS.current = null; }
      setStatus('listening');
      dispatchVoiceState({ speaking: false, status: 'Listening' });
    }
  }, [sendToKiko, dispatchVoiceState]);

  // ── Initialise the full voice pipeline ──
  const start = useCallback(async () => {
    try {
      setStatus('connecting');

      // 1. Mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (deadRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      mediaStream.current = stream;

      // 2. Mic analyser for waveform
      const ctx = getAudioContext();
      const micSource = ctx.createMediaStreamSource(stream);
      const { analyser, cleanup } = createAnalyser(micSource);
      micAnalyserRef.current = { analyser, cleanup };
      startMicEnergyPump(analyser);

      // 3. Get Deepgram temporary token
      const token = await getToken();

      // 4. Open STT WebSocket (browser → Deepgram direct)
      const sttParams = new URLSearchParams({
        model: 'nova-3', language: 'en',
        interim_results: 'true', utterance_end_ms: '1000',
        vad_events: 'true', smart_format: 'true',
        punctuate: 'true',
      });
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${sttParams}`,
        ['token', token]
      );
      sttWS.current = ws;

      ws.onopen = () => {
        if (deadRef.current) { ws.close(); return; }
        console.log('[Voice] STT connected');
        setStatus('listening');
        dispatchVoiceState({ active: true, status: 'Listening' });

        // Start sending mic audio chunks
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorder.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
      };

      ws.onmessage = (evt) => {
        try { handleSTTMessage(JSON.parse(evt.data)); } catch {}
      };
      ws.onerror = (err) => {
        console.error('[Voice] STT error:', err);
        setStatus('error');
      };
      ws.onclose = (evt) => {
        console.log('[Voice] STT closed:', evt.code);
        if (!deadRef.current && evt.code !== 1000) setStatus('error');
      };

      // 5. Pre-open TTS WebSocket (ready for instant filler)
      openTTSSocket().catch(() => {});

      // 6. Init audio player with onEnd callback
      audioPlayer.current = new StreamingAudioPlayer();
      audioPlayer.current.onEnd = () => {
        isSpeakingRef.current = false;
        if (!deadRef.current) {
          setStatus('listening');
          setSpeakEnergy(0);
          dispatchVoiceState({ speaking: false, status: 'Listening' });
        }
      };

    } catch (err) {
      console.error('[Voice] Init failed:', err);
      setStatus('error');
    }
  }, [handleSTTMessage, startMicEnergyPump, getToken, openTTSSocket, dispatchVoiceState]);

  // ── Cleanup ──
  const stop = useCallback(() => {
    deadRef.current = true;
    cancelAnimationFrame(energyRAF.current);
    cancelAnimationFrame(speakRAF.current);
    micAnalyserRef.current?.cleanup?.();
    try { mediaRecorder.current?.stop(); } catch {}
    mediaStream.current?.getTracks().forEach(t => t.stop());
    try { sttWS.current?.close(); } catch {}
    try { ttsWS.current?.close(); } catch {}
    audioPlayer.current?.stop();
    window.__kikoAudioEnergy = 0;
    window.__kikoAudioPitch = 0;
    dispatchVoiceState({ active: false, status: 'Off' });
    setStatus('idle');
  }, [dispatchVoiceState]);

  // ── Lifecycle ──
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
      try { ttsWS.current?.close(); } catch {}
      audioPlayer.current?.stop();
      window.__kikoAudioEnergy = 0;
    };
  }, []);

  return { status, transcript, interimText, response, micEnergy, speakEnergy, stop };
}
