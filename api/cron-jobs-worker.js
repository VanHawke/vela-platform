// api/cron-jobs-worker.js — processes kiko_background_jobs queue
// Runs every 5 minutes. Picks oldest queued job, runs it, writes result.
// Keeps individual jobs under 45s to fit within serverless limit.

import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { callDataAgent } from './agents/data.js';

export const config = { maxDuration: 60 };

async function processJob(job) {
  // Mark as running
  await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'running', started_at: new Date().toISOString(), progress_message: 'Starting...', progress_pct: 5 }),
  });

  try {
    let result;
    switch (job.job_type) {
      case 'source_companies_bg': {
        const { category, count = 20 } = job.params || {};
        if (!category) throw new Error('category required');
        await patchProgress(job.id, 30, `Sourcing ${count} ${category} prospects...`);
        const out = await callDataAgent('source_companies', { category, count }, 'sunny@vanhawke.com');
        result = { text: typeof out === 'string' ? out : JSON.stringify(out).slice(0, 4000) };
        break;
      }
      case 'enrich_batch': {
        const { companies = [] } = job.params || {};
        if (!companies.length) throw new Error('companies array required');
        const results = [];
        for (let i = 0; i < companies.slice(0, 10).length; i++) {
          await patchProgress(job.id, 10 + (i * 85 / companies.length), `Enriching ${companies[i]}...`);
          const out = await callDataAgent('enrich_company', { company: companies[i] }, 'sunny@vanhawke.com');
          results.push({ company: companies[i], ok: typeof out === 'string' && !out.toLowerCase().includes('error') });
        }
        result = { enriched: results };
        break;
      }
      case 'voice_relearn': {
        await patchProgress(job.id, 30, 'Triggering voice learning cron...');
        const res = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://vela-platform-one.vercel.app'}/api/cron-email-voice-learning`, { method: 'GET' });
        result = await res.json();
        break;
      }
      case 'campaign_draft': {
        const { category, persona } = job.params || {};
        if (!category) throw new Error('category required');
        await patchProgress(job.id, 40, `Drafting ${category} campaign...`);
        const out = await callDataAgent('create_campaign', { category, persona }, 'sunny@vanhawke.com');
        result = { text: typeof out === 'string' ? out : JSON.stringify(out).slice(0, 4000) };
        break;
      }
      case 'deep_research': {
        const { topic } = job.params || {};
        if (!topic) throw new Error('topic required');
        await patchProgress(job.id, 20, `Researching ${topic}...`);
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
        const out = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Deep research on: ${topic}. Run 5-8 web searches. Synthesise into structured brief with key findings, sources, and strategic implications for Van Hawke (F1/FE sponsorship advisory).` }],
        });
        const text = out.content.filter(b => b.type === 'text').map(b => b.text).join('');
        result = { text: text.slice(0, 6000) };
        break;
      }
      default:
        throw new Error(`unknown job_type: ${job.job_type}`);
    }

    await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', finished_at: new Date().toISOString(), result, progress_pct: 100, progress_message: 'Done' }),
    });

    // Surface result as alert
    try {
      await sbFetch('kiko_alerts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'background_job_complete',
          severity: 'medium',
          title: `Kiko finished: ${job.title}`,
          detail: typeof result === 'string' ? result.slice(0, 400) : (result?.text || JSON.stringify(result)).slice(0, 400),
          entity_type: 'job',
          entity_id: job.id,
          metadata: { job_type: job.job_type },
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    } catch {}

    return { ok: true };
  } catch (err) {
    await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', finished_at: new Date().toISOString(), error_message: err.message, progress_pct: 100, progress_message: 'Failed' }),
    });
    return { ok: false, error: err.message };
  }
}

async function patchProgress(jobId, pct, message) {
  try {
    await sbFetch(`kiko_background_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ progress_pct: Math.round(pct), progress_message: message }),
    });
  } catch {}
}

export default async function handler(req, res) {
  const hbStart = Date.now();
  const hbId = await cronHeartbeat('cron-jobs-worker', 'started');
  try {
    const queued = await sbFetch('kiko_background_jobs?status=eq.queued&order=queued_at.asc&limit=3');
    const processed = [];
    for (const job of (queued || [])) {
      const r = await processJob(job);
      processed.push({ id: job.id, title: job.title, ...r });
    }
    await cronHeartbeat('cron-jobs-worker', 'finished', { heartbeatId: hbId, durationMs: Date.now() - hbStart, recordsProcessed: processed.length });
    return res.status(200).json({ ok: true, processed });
  } catch (err) {
    await logError('cron:jobs-worker', err.message);
    await cronHeartbeat('cron-jobs-worker', 'error', { heartbeatId: hbId, errorMessage: err.message });
    return res.status(200).json({ ok: false, error: err.message });
  }
}
