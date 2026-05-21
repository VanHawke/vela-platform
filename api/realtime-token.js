// api/realtime-token.js — Generate ephemeral key for GPT-4o Realtime WebRTC
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENAI_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_KEY not configured' });

  // Accept voice preference from client (default: coral)
  let voice = 'coral';
  try { const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; if (body?.voice) voice = body.voice; } catch {}

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime-2',
          audio: { output: { voice } },
        }
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[realtime-token] OpenAI error:', r.status, err);
      return res.status(r.status).json({ error: 'Token failed', detail: err });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('[realtime-token] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
