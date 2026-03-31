// api/ping.js — Ultra-lightweight uptime endpoint
// For Better Stack, Uptime Robot, or any external monitor
// Zero API calls, zero DB reads — just confirms the serverless function is alive
// Expected response time: <50ms

export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'kiko-intelligence-os',
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown',
  });
}
