// api/voice-preview.js — Generate short TTS preview for voice selection
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENAI_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_KEY not configured' });
  const { voice = 'coral' } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: 'Hello Sunny, this is how I sound. What do you think?',
        response_format: 'mp3',
      }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'TTS failed' });
    res.setHeader('Content-Type', 'audio/mpeg');
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).json({ error: err.message }); }
}
