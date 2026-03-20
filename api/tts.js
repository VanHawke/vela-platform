// api/tts.js — ElevenLabs TTS streaming proxy
// Accepts text, returns streaming audio bytes as Serafina's voice
// Hides API key server-side. Client sends text, receives audio/mpeg stream.

export const config = { supportsResponseStreaming: true, maxDuration: 15 };

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const SERAFINA_VOICE_ID = '4tRn1lSkEn13EVTuqb0g';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text, voice_id } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!ELEVENLABS_KEY) {
    console.error('[TTS] Missing ELEVENLABS_API_KEY');
    return res.status(500).json({ error: 'TTS not configured' });
  }

  const voiceId = voice_id || SERAFINA_VOICE_ID;

  try {
    // Call ElevenLabs streaming TTS
    // Model: eleven_flash_v2_5 — lowest latency (75ms TTFB)
    // Format: mp3_22050_32 — small, fast, all browsers support it
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32&optimize_streaming_latency=4`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            speed: 1.05,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => 'Unknown error');
      console.error('[TTS] ElevenLabs error:', ttsRes.status, errText.slice(0, 200));
      return res.status(ttsRes.status).json({ error: 'TTS generation failed', detail: errText.slice(0, 100) });
    }

    // Stream audio bytes directly to client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reader = ttsRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();

  } catch (err) {
    console.error('[TTS] Error:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'TTS error', detail: err.message });
    } else {
      res.end();
    }
  }
}
