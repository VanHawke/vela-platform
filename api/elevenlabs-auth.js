// api/elevenlabs-auth.js — Generate signed URL for ElevenLabs Conversational AI client
// The frontend calls this to get a secure WebSocket URL without exposing the API key

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    console.error('[ElevenLabs Auth] Missing ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY');
    return res.status(500).json({ error: 'ElevenLabs not configured' });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ElevenLabs Auth] API error:', response.status, errText);
      return res.status(response.status).json({ error: 'Failed to get signed URL' });
    }

    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ signedUrl: data.signed_url });
  } catch (err) {
    console.error('[ElevenLabs Auth] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
