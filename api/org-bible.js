// api/org-bible.js — Read/write organisation Bible (Layer 2)
// GET ?org_id=<uuid> — returns org Bible content
// PATCH body: { org_id, content } — updates org Bible (super_admin only)
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

async function getUserRole(userId, orgId) {
  const rows = await sbFetch(`organization_members?user_id=eq.${userId}&organization_id=eq.${orgId}&select=role&limit=1`);
  return rows?.[0]?.role || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const orgId = req.query?.org_id;
      if (!isUuid(orgId)) return res.status(400).json({ error: 'valid org_id required' });
      const rows = await sbFetch(`org_bibles?organization_id=eq.${orgId}&select=content,updated_at&limit=1`);
      return res.status(200).json({ content: rows?.[0]?.content || '', updated_at: rows?.[0]?.updated_at || null });
    }

    if (req.method === 'PATCH') {
      const { org_id, content, user_id } = req.body || {};
      if (!isUuid(org_id) || !isUuid(user_id)) return res.status(400).json({ error: 'valid org_id + user_id required' });
      if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });

      const role = await getUserRole(user_id, org_id);
      if (role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });

      await sbFetch(`org_bibles?organization_id=eq.${org_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'GET or PATCH only' });
  } catch (err) {
    console.error('[org-bible] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
