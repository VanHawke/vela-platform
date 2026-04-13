// api/org-branding.js — Authenticated branding update endpoint
// PATCH body: { user_id, patch: { logo_url?, favicon_url?, platform_name?, primary_colour? } }
// Merges the patch into organisations.branding JSONB for the user's org.
// Only super_admin and admin roles can update branding.
//
// Why not JWT auth: follows the same client-sends-user_id pattern as
// api/user-bible.js, api/team-list.js, etc. Service_role via sbFetch
// bypasses RLS after role check in getUserRole.

import { sbFetch } from './kiko-tools.js';
import { getUserRole } from './_lib/get-user-role.js';

export const config = { maxDuration: 10 };

function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

// Whitelist of branding keys accepted from the client — anything else is stripped
const ALLOWED_KEYS = new Set(['logo_url', 'favicon_url', 'platform_name', 'primary_colour', 'accent_colour']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'PATCH only' });

  try {
    const { user_id, patch } = req.body || {};
    if (!isUuid(user_id)) return res.status(400).json({ error: 'valid user_id required' });
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'patch object required' });

    // Admin-only: check role via organization_members
    const role = await getUserRole(user_id);
    if (role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: 'admin or super_admin required to update branding' });
    }

    // Resolve the target organisations row (single-tenant for now: the first row, which is Van Hawke)
    const orgs = await sbFetch('organisations?select=id,branding&order=created_at.asc&limit=1');
    const org = orgs?.[0];
    if (!org) return res.status(404).json({ error: 'no organisation found to update' });

    // Whitelist + merge patch into existing branding
    const current = org.branding || {};
    const cleanPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (ALLOWED_KEYS.has(k)) cleanPatch[k] = v;
    }
    const merged = { ...current, ...cleanPatch };

    await sbFetch(`organisations?id=eq.${org.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ branding: merged }),
    });

    return res.status(200).json({ ok: true, branding: merged });
  } catch (err) {
    console.error('[org-branding] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
