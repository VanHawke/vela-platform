// api/email-intel.js — Vercel proxy to Hetzner email intelligence engine

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const HETZNER = 'http://178.104.73.22:3000';
  const SECRET = process.env.KIKO_WORKER_SECRET || 'kiko-hetzner-2026-vanhawke';
  const path = req.query.path || 'find'; // find, enrich, verify, bulk
  
  try {
    const response = await fetch(`${HETZNER}/email-intel/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET}` },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
