// api/cron-linkedin-accept-check.js — Check for LinkedIn connection acceptances
// Checks Matt's LinkedIn for new connections and creates alerts
import 'dotenv/config';

export default async function handler(req, res) {
  try {
    const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // Call the LinkedIn worker's connection check endpoint
    const workerRes = await fetch('http://127.0.0.1:3000/linkedin/check-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WORKER_SECRET || 'kiko-hetzner-2026-vanhawke'}` },
    }).catch(() => null);
    
    if (workerRes?.ok) {
      const data = await workerRes.json().catch(() => ({}));
      console.log('[cron-linkedin-accept] Connection check completed:', data);
      return res.json({ ok: true, ...data });
    }
    
    // Fallback: just log that it ran
    console.log('[cron-linkedin-accept] LinkedIn worker not available, skipping');
    return res.json({ ok: true, skipped: true });
  } catch (err) {
    console.error('[cron-linkedin-accept] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
