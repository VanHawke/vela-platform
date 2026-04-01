// api/voice-token.js — Issue Deepgram auth token for browser-side STT/TTS
// Tries temporary JWT first (requires Member scope), falls back to API key
export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('[voice-token] DEEPGRAM_API_KEY not set');
    return res.status(500).json({ error: 'Voice not configured' });
  }

  // Try temporary token (30s JWT — ideal, requires Member scope)
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      return res.status(200).json({
        token: data.access_token,
        expires_in: data.expires_in || 30,
        type: 'jwt',
      });
    }
  } catch {}

  // Fallback: return the API key itself for Sec-WebSocket-Protocol auth
  // This is Deepgram's documented browser pattern when temp tokens aren't available
  // TODO: Upgrade Deepgram key to Member scope to enable temporary tokens
  return res.status(200).json({
    token: apiKey,
    expires_in: 86400,
    type: 'api_key',
  });
}
