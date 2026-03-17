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
  let existing = [];
  if (listRes.ok) {
    try { existing = await listRes.json(); } catch (e) { existing = []; }
  }

  // Return full details of existing hooks for debugging
  const existingDetails = (Array.isArray(existing) ? existing : []).map(h => ({
    id: h._id, url: h.targetUrl, type: h.type, created: h.createdAt
  }));

  // Check which events already have our URL
  const existingUrls = (Array.isArray(existing) ? existing : [])
    .filter(h => h.targetUrl === TARGET_URL)
    .map(h => h.type || 'unknown');

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
      let data;
      try { data = await hookRes.json(); } catch (e) { data = { raw: await hookRes.text?.() || hookRes.status }; }
      results.push({ event: eventType, status: hookRes.ok ? 'registered' : `failed_${hookRes.status}`, response: data });
    } catch (e) {
      results.push({ event: eventType, status: 'error', message: e.message });
    }
  }

  return res.json({
    targetUrl: TARGET_URL,
    existingHooks: existingDetails,
    results,
  });
}
