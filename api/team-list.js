// api/team-list.js — List org members for current user's org
// GET ?user_id=<uuid> — returns org members with roles
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export default async function handler(req, res) {
  // CORS handled by nginx — do NOT set Access-Control-Allow-Origin here
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.query?.user_id;
  if (!isUuid(userId)) return res.status(400).json({ error: 'valid user_id required' });

  try {
    // Find user's org
    const membership = await sbFetch(`organization_members?user_id=eq.${userId}&select=organization_id,role&limit=1`);
    if (!membership?.length) return res.status(200).json({ members: [], org: null, role: null });

    const orgId = membership[0].organization_id;
    const myRole = membership[0].role;

    // Get org info
    const orgs = await sbFetch(`organizations?id=eq.${orgId}&select=id,name,slug&limit=1`);

    // Get all members with their config info
    const members = await sbFetch(`organization_members?organization_id=eq.${orgId}&select=id,user_id,role,joined_at&order=joined_at.asc`);

    // Enrich with display names from kiko_user_config
    const enriched = [];
    for (const m of (members || [])) {
      let config = null;
      try {
        const configs = await sbFetch(`kiko_user_config?user_id=eq.${m.user_id}&select=email,display_name,job_title,location&limit=1`);
        config = configs?.[0];
      } catch {}
      enriched.push({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        email: config?.email || '',
        display_name: config?.display_name || '',
        job_title: config?.job_title || '',
        location: config?.location || '',
      });
    }

    return res.status(200).json({
      members: enriched,
      org: orgs?.[0] || null,
      role: myRole,
    });
  } catch (err) {
    console.error('[team-list] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
