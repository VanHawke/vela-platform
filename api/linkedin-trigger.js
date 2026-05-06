// api/linkedin-trigger.js — Instantly process LinkedIn queue
// Called from browser test button. Processes pending items immediately.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const r = await fetch('http://127.0.0.1:3000/linkedin-queue/process', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer kiko-hetzner-2026-vanhawke', 'Content-Type': 'application/json' },
    });
    const data = await r.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
