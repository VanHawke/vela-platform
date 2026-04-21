// api/linkedin-trigger.js — Proxy to trigger Hetzner LinkedIn worker
// Called from browser after queuing a LinkedIn test. Proxies to the local worker on Hetzner.
export const config = { maxDuration: 120 };

const HETZNER_URL = 'http://178.104.73.22/linkedin-queue/process';
const WORKER_SECRET = process.env.KIKO_WORKER_SECRET || 'kiko-hetzner-2026-vanhawke';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110000);
    const r = await fetch(HETZNER_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WORKER_SECRET}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await r.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
