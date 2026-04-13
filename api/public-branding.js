// api/public-branding.js — Public (unauthenticated) branding endpoint
// GET — returns the branding JSONB of the default organisation
//
// Why unauthenticated: the login page needs to render branding (logo, favicon,
// platform name, primary colour) BEFORE the user has signed in. Branding is
// effectively public information anyway (logos, colours, platform name), so
// there is no security risk.
//
// "Default organisation" currently means "the first organisation ever created",
// which for kiko.vanhawke.agency is Van Hawke. If/when Kiko supports multiple
// white-labelled deployments keyed by domain, this can be extended to look up
// by req.headers.host or a custom_domain match on the organisations table.

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 5 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Short cache — branding changes rarely, and we want quick invalidation
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const rows = await sbFetch('organisations?select=id,name,branding&order=created_at.asc&limit=1');
    const org = rows?.[0];
    if (!org) return res.status(200).json({ branding: {}, org_id: null });
    return res.status(200).json({
      org_id: org.id,
      org_name: org.name,
      branding: org.branding || {},
    });
  } catch (err) {
    console.error('[public-branding] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
