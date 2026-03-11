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
              output: {
                voice: 'shimmer'
              }
            },
            tools: [
              {
                type: 'function',
                name: 'get_realtime_data',
                description: 'Get current weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['weather'] },
                    location: { type: 'string', description: 'City name' }
                  },
                  required: ['type', 'location']
                }
              },
              {
                type: 'function',
                name: 'search_web',
                description: 'Search the web for current information',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                  required: ['query']
                }
              }
            ],
            tool_choice: 'auto'
          }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('[Voice] client_secrets error:', response.status, data);
        return res.status(response.status).json(data);
      }
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
