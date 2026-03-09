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

  // Mode 2 — Whisper transcription
  if (action === 'transcribe') {
    // Expects base64-encoded audio in req.body.audio
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'audio required' });

    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

      const audioBuffer = Buffer.from(audio, 'base64');
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

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
    try {
      const sessionConfig = {
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          input_audio_transcription: { model: 'whisper-1' },
          audio: {
            output: {
              voice: 'shimmer',
            },
          },
        },
      };

      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionConfig),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[Voice] client_secrets error:', response.status, errBody);
        return res.status(response.status).json({ error: `OpenAI ${response.status}: ${errBody}` });
      }

      const data = await response.json();
      console.log('[Voice] Token response keys:', Object.keys(data));
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Voice] Realtime token error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Mode 3b — SDP proxy for WebRTC call establishment
  // Client sends SDP offer, we forward to OpenAI and return the SDP answer.
  if (action === 'realtime-sdp') {
    const { sdp, token } = req.body;
    if (!sdp || !token) return res.status(400).json({ error: 'sdp and token required' });

    try {
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls?model=gpt-realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: sdp,
      });

      if (!sdpResponse.ok) {
        const errBody = await sdpResponse.text();
        console.error('[Voice] SDP exchange error:', sdpResponse.status, errBody);
        return res.status(sdpResponse.status).json({ error: `OpenAI ${sdpResponse.status}: ${errBody}` });
      }

      const answerSdp = await sdpResponse.text();
      return res.status(200).json({ sdp: answerSdp });
    } catch (err) {
      console.error('[Voice] SDP exchange error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Mem0 — store voice exchange in memory
  if (action === 'mem0') {
    const { userText, kikoText } = req.body;
    if (!userText || !kikoText) return res.status(400).json({ error: 'userText and kikoText required' });

    const key = process.env.MEM0_API_KEY;
    if (!key) return res.status(200).json({ ok: true, skipped: 'no MEM0_API_KEY' });

    try {
      await fetch('https://api.mem0.ai/v1/memories/', {
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
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[Voice] Mem0 error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: transcribe | realtime-token | realtime-sdp | mem0' });
}
