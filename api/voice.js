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

  // Mode 3 — Get ephemeral Realtime API client secret (GA endpoint)
  if (action === 'realtime-token') {
    try {
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[Voice] Realtime client_secrets error:', response.status, errBody);
        return res.status(response.status).json({ error: `OpenAI ${response.status}: ${errBody}` });
      }

      const data = await response.json();
      console.log('[Voice] Client secret response keys:', Object.keys(data));
      return res.status(200).json(data);
    } catch (err) {
      console.error('[Voice] Realtime token error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: transcribe | realtime-token' });
}
