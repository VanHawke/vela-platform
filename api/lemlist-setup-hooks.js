// api/lemlist-setup-hooks.js — One-time setup: registers Vela webhooks with Lemlist
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const LEMLIST_KEY = process.env.LEMLIST_KEY;
  if (!LEMLIST_KEY) return res.status(500).json({ error: 'LEMLIST_KEY not set' });

  const TARGET_URL = 'https://vela-platform-one.vercel.app/api/lemlist-webhook';
  const EVENTS = [
    'emailsSent', 'emailsOpened', 'emailsClicked', 'emailsReplied',
    'emailsBounced', 'emailsUnsubscribed',
    'emailsInterested', 'emailsNotInterested',
  ];

  // First list existing hooks
  const listRes = await fetch('https://api.lemlist.com/api/hooks', {
    headers: { 'Authorization': `Basic ${Buffer.from(':' + LEMLIST_KEY).toString('base64')}` },
  });
  const existing = listRes.ok ? await listRes.json() : [];

  // Check which events already have our URL
  const existingUrls = (Array.isArray(existing) ? existing : [])
    .filter(h => h.targetUrl === TARGET_URL)
    .map(h => h.type);

  const results = [];
  for (const eventType of EVENTS) {
    if (existingUrls.includes(eventType)) {
      results.push({ event: eventType, status: 'already_registered' });
      continue;
    }
    try {
      const hookRes = await fetch('https://api.lemlist.com/api/hooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(':' + LEMLIST_KEY).toString('base64')}`,
        },
        body: JSON.stringify({ targetUrl: TARGET_URL, type: eventType }),
      });
      const data = await hookRes.json();
      results.push({ event: eventType, status: hookRes.ok ? 'registered' : 'failed', response: data });
    } catch (e) {
      results.push({ event: eventType, status: 'error', message: e.message });
    }
  }

  return res.json({
    targetUrl: TARGET_URL,
    existingHooks: existing?.length || 0,
    results,
  });
}
