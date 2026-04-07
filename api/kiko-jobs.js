// api/kiko-jobs.js — Background job queue for Kiko multi-tasking
// POST to queue a job, GET to list jobs, GET /:id to check status
// Worker cron (cron-jobs-worker) picks up queued jobs and processes them

import { sbFetch } from './kiko-tools.js';

const VALID_JOB_TYPES = ['source_companies_bg', 'enrich_batch', 'voice_relearn', 'campaign_draft', 'deep_research'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.query.user_id || req.body?.user_id;

  if (req.method === 'GET') {
    // List active + recent jobs
    try {
      const uf = userId ? `&user_id=eq.${userId}` : '';
      const jobs = await sbFetch(`kiko_background_jobs?order=queued_at.desc&limit=20${uf}`);
      return res.status(200).json({ ok: true, jobs: jobs || [] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { job_type, title, params = {}, related_entity_type, related_entity_id } = req.body || {};
    if (!job_type || !VALID_JOB_TYPES.includes(job_type)) {
      return res.status(400).json({ ok: false, error: `invalid job_type. Valid: ${VALID_JOB_TYPES.join(', ')}` });
    }
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    if (!userId) return res.status(400).json({ ok: false, error: 'user_id required' });

    try {
      const row = {
        user_id: userId,
        job_type,
        status: 'queued',
        title: title.slice(0, 200),
        params,
        related_entity_type: related_entity_type || null,
        related_entity_id: related_entity_id || null,
      };
      const result = await sbFetch('kiko_background_jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return res.status(200).json({ ok: true, job: result?.[0] || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
