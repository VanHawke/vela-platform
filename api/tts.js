// OpenAI TTS API — streams audio back to client
// Voice: shimmer (Kiko's identity)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text, voice = 'shimmer' } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text.slice(0, 4096),
        voice,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error('[TTS] OpenAI error:', ttsRes.status, err);
      return res.status(502).json({ error: 'TTS failed' });
    }

    // Stream audio directly to client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = ttsRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('[TTS] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
