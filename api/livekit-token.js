// api/livekit-token.js — Generate LiveKit room tokens for voice agent
import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(500).json({ error: 'LiveKit credentials not configured' });
  }

  const roomName = `kiko-voice-${Date.now()}`;
  const participantName = 'sunny';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: 'Sunny Sidhu',
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  res.json({ token, url: wsUrl, roomName });
}
