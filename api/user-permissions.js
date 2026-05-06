// api/user-permissions.js — Read/write per-user page permissions
// GET ?user_id=<uuid>&organization_id=<uuid> → { role, overrides, effective }
// PATCH body: { user_id, organization_id, page_key, can_view, caller_id } → upsert override
// DELETE body: { user_id, organization_id, page_key, caller_id } → remove override (fall back to role default)
import { sbFetch } from './kiko-tools.js';
import { ROLE_DEFAULTS, computeEffective } from './_lib/page-permissions.js';


function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

async function getRole(userId, orgId) {
  const rows = await sbFetch(`organization_members?user_id=eq.${userId}&organization_id=eq.${orgId}&select=role&limit=1`);
  return rows?.[0]?.role || null;
}

async function getOverrides(userId, orgId) {
  const rows = await sbFetch(`user_page_permissions?user_id=eq.${userId}&organization_id=eq.${orgId}&select=page_key,can_view`);
  const map = {};
  for (const r of (rows || [])) map[r.page_key] = r.can_view;
  return map;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const userId = req.query?.user_id;
      const orgId = req.query?.organization_id;
      if (!isUuid(userId) || !isUuid(orgId)) return res.status(400).json({ error: 'valid user_id + organization_id required' });

      const role = await getRole(userId, orgId);
      if (!role) return res.status(404).json({ error: 'user not in this org' });

      const overrides = await getOverrides(userId, orgId);
      const effective = computeEffective(role, overrides);

      return res.status(200).json({ role, overrides, effective });
    }

    if (req.method === 'PATCH') {
      const { user_id, organization_id, page_key, can_view, caller_id } = req.body || {};
      if (!isUuid(user_id) || !isUuid(organization_id) || !isUuid(caller_id) || !page_key) {
        return res.status(400).json({ error: 'user_id, organization_id, page_key, caller_id required' });
      }

      // Caller must be super_admin
      const callerRole = await getRole(caller_id, organization_id);
      if (callerRole !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });

      // Cannot restrict super_admin targets
      const targetRole = await getRole(user_id, organization_id);
      if (targetRole === 'super_admin' && can_view === false) {
        return res.status(400).json({ error: 'cannot restrict super_admin page access' });
      }

      // Upsert
      await sbFetch('user_page_permissions', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id, organization_id, page_key, can_view, updated_at: new Date().toISOString(), updated_by: caller_id }),
      });

      const overrides = await getOverrides(user_id, organization_id);
      const effective = computeEffective(targetRole, overrides);
      return res.status(200).json({ ok: true, effective });
    }

    if (req.method === 'DELETE') {
      const { user_id, organization_id, page_key, caller_id } = req.body || {};
      if (!isUuid(user_id) || !isUuid(organization_id) || !isUuid(caller_id) || !page_key) {
        return res.status(400).json({ error: 'user_id, organization_id, page_key, caller_id required' });
      }

      const callerRole = await getRole(caller_id, organization_id);
      if (callerRole !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });

      await sbFetch(`user_page_permissions?user_id=eq.${user_id}&organization_id=eq.${organization_id}&page_key=eq.${encodeURIComponent(page_key)}`, { method: 'DELETE' });

      const targetRole = await getRole(user_id, organization_id);
      const overrides = await getOverrides(user_id, organization_id);
      const effective = computeEffective(targetRole || 'user', overrides);
      return res.status(200).json({ ok: true, effective });
    }

    return res.status(405).json({ error: 'GET, PATCH, or DELETE' });
  } catch (err) {
    console.error('[user-permissions] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
