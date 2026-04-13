// api/user-bible.js — Read/write personal Bible (Layer 3)
// GET ?user_id=<uuid> — returns user Bible content
// PATCH body: { user_id, content } — updates user Bible (own only)
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const userId = req.query?.user_id;
      if (!isUuid(userId)) return res.status(400).json({ error: 'valid user_id required' });
      const rows = await sbFetch(`user_bibles?user_id=eq.${userId}&select=content,updated_at&limit=1`);
      return res.status(200).json({ content: rows?.[0]?.content || '', updated_at: rows?.[0]?.updated_at || null });
    }

    if (req.method === 'PATCH') {
      const { user_id, content } = req.body || {};
      if (!isUuid(user_id)) return res.status(400).json({ error: 'valid user_id required' });
      if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });

      // Upsert — create if not exists
      const existing = await sbFetch(`user_bibles?user_id=eq.${user_id}&select=id&limit=1`);
      if (existing?.length) {
        await sbFetch(`user_bibles?user_id=eq.${user_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
        });
      } else {
        await sbFetch('user_bibles', {
          method: 'POST',
          body: JSON.stringify({ user_id, content }),
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'GET or PATCH only' });
  } catch (err) {
    console.error('[user-bible] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
