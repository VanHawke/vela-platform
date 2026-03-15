// api/cron-email-sync.js — Runs every 5 minutes to sync Gmail
// Add to vercel.json: { "path": "/api/cron-email-sync", "schedule": "*/5 * * * *" }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

  const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app';
  const results = [];

  // Get all users with Google tokens
  const { data: tokens } = await supabase
    .from('user_tokens')
    .select('user_email')
    .eq('provider', 'google');

  for (const t of (tokens || [])) {
    try {
      const r = await fetch(`${BASE}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: t.user_email, action: 'sync' })
      });
      const data = await r.json();
      results.push({ email: t.user_email, synced: data.synced || 0 });
    } catch (e) {
      results.push({ email: t.user_email, error: e.message });
    }
  }

  return res.json({ status: 'complete', timestamp: new Date().toISOString(), users: results.length, results });
}
