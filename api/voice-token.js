// api/voice-token.js — Issue short-lived Deepgram JWT for browser-side STT
// Returns 30-second temporary token so API key never leaves the server
export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('[voice-token] DEEPGRAM_API_KEY not set');
    return res.status(500).json({ error: 'Voice not configured' });
  }

  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Default 30s TTL
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[voice-token] Deepgram error:', response.status, errText);
      return res.status(502).json({ error: 'Token generation failed' });
    }

    const data = await response.json();
    return res.status(200).json({
      token: data.access_token,
      expires_in: data.expires_in || 30,
    });
  } catch (err) {
    console.error('[voice-token] Error:', err.message);
    return res.status(500).json({ error: 'Token generation failed' });
  }
}
