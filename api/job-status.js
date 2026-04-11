// api/job-status.js — Poll a kiko_active_jobs row for live progress
// Sunny spec 2026-04-12 v0.0.38: powers BuildingProgress real-time stages
// instead of timer estimation. Frontend polls this every 1.5s during a build.
//
// GET /api/job-status?id=<uuid>
// Returns: { id, status, current_stage, total_stages, stage_label, stage_detail,
//            started_at, updated_at, completed_at, result, error }

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  try {
    const id = req.query?.id || req.body?.id;
    if (!id) {
      return res.status(400).json({ error: 'missing id' });
    }
    // Validate uuid shape so we don't pass garbage to PostgREST
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const rows = await sbFetch(`kiko_active_jobs?id=eq.${id}&select=*&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'not found', id });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('[job-status] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
