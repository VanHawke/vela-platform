// api/voice.js — 100% isolated from kiko.js
// Handles: Whisper transcription (Mode 2) and Realtime session tokens (Mode 3)

export const config = { supportsResponseStreaming: true };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action } = req.body;

  // Voice preview — short sample via OpenAI TTS
  if (action === 'preview-voice') {
    const { voice } = req.body;
    if (!voice) return res.status(400).json({ error: 'voice required' });
    try {
      const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: voice,
          input: 'Hello Sunny. I\'m Kiko, your strategic partner at Van Hawke. How can I help today?',
          response_format: 'mp3',
        }),
      });
      if (!ttsRes.ok) {
        const err = await ttsRes.text();
        return res.status(ttsRes.status).json({ error: err });
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      const reader = ttsRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    return;
  }

  // Mode 2 — Whisper transcription
  if (action === 'transcribe') {
    // Expects base64-encoded audio in req.body.audio
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'audio required' });

    try {
      const { default: OpenAI, toFile } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

      const audioBuffer = Buffer.from(audio, 'base64');
      const file = await toFile(audioBuffer, 'audio.webm', { type: 'audio/webm' });

      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: 'en',
      });

      return res.status(200).json({ text: transcription.text });
    } catch (err) {
      console.error('[Voice] Transcription error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Mode 3 — Ephemeral token for Realtime API (GA, WebRTC)
  // Matches OpenAI's official realtime-console implementation exactly.
  // Endpoint: POST /v1/realtime/client_secrets
  // Body: { session: { type, model, audio config } }
  // Response: { value: "<ephemeral_key>", ... }
  if (action === 'realtime-token') {
    const voiceId = req.body.voice || 'shimmer';
    try {
      // POST /v1/realtime/client_secrets — returns { value: "ek_...", ... }
      // The ephemeral key (value) is used by the browser to call /v1/realtime/calls directly
      // with Content-Type: application/sdp. Ephemeral keys are designed for browser use.
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: 'gpt-realtime',
            audio: {
              output: { voice: voiceId },
            },
          }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('[Voice] client_secrets error:', response.status, JSON.stringify(data));
        return res.status(response.status).json(data);
      }
      console.log('[Voice] client_secrets success, key prefix:', data.value?.slice(0, 8));
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Voice] Realtime token error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Mode 3b — SDP proxy: NOT USED in current architecture.
  // Current flow: browser gets ephemeral token via realtime-token, then calls
  // OpenAI /v1/realtime/calls directly with Content-Type: application/sdp.
  // This server-side proxy route is kept as a fallback only.
  if (action === 'realtime-sdp') {
    return res.status(400).json({ error: 'Use realtime-token flow: get ephemeral key, call OpenAI directly from browser.' });
  }

  // Mem0 — store voice exchange in memory
  if (action === 'mem0') {
    console.log('[Voice API] Mem0 action received — userText:', req.body.userText?.slice(0, 50), 'kikoText:', req.body.kikoText?.slice(0, 50));
    const { userText, kikoText } = req.body;
    if (!userText || !kikoText) return res.status(400).json({ error: 'userText and kikoText required' });

    const key = process.env.MEM0_API_KEY;
    if (!key) {
      console.warn('[Voice API] No MEM0_API_KEY — skipping');
      return res.status(200).json({ ok: true, skipped: 'no MEM0_API_KEY' });
    }

    try {
      console.log('[Voice API] Sending to Mem0...');
      const mem0Res = await fetch('https://api.mem0.ai/v1/memories/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token ${key}` },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: userText },
            { role: 'assistant', content: kikoText },
          ],
          user_id: 'sunny',
        }),
      });
      const mem0Data = await mem0Res.json();
      console.log('[Voice API] Mem0 response:', mem0Res.status, JSON.stringify(mem0Data).slice(0, 200));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[Voice API] Mem0 error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // TTS — ElevenLabs text-to-speech streaming
  if (action === 'tts') {
    const { text, voice_id } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return res.status(500).json({ error: 'No ELEVENLABS_API_KEY configured' });

    // Default: British female voice. Rachel = 21m00Tcm4TlvDq8ikWAM, Charlotte = XB0fDUnXU5powFXDhCwa
    const vid = voice_id || 'XB0fDUnXU5powFXDhCwa';

    try {
      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
        }),
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        console.error('[Voice] ElevenLabs TTS error:', ttsRes.status, errText);
        return res.status(ttsRes.status).json({ error: `ElevenLabs ${ttsRes.status}: ${errText}` });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = ttsRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err) {
      console.error('[Voice] TTS error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    return;
  }

  return res.status(400).json({ error: 'Invalid action. Use: transcribe | realtime-token | realtime-sdp | mem0 | tts' });
}
