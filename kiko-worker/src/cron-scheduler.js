// kiko-worker/src/cron-scheduler.js
// Cron scheduler for Hetzner worker — calls LOCAL API endpoints.
// Only includes crons NOT already handled by Supabase pg_cron.
//
// Supabase pg_cron handles (DO NOT DUPLICATE — verified empty 2026-04-25, kept for reference):
//   Previously: cron-job-processor, cron-sequence-sender, cron-sequence-reply-detect,
//   cron-inbox-triage, cron-learning-director, cron-morning-email,
//   cron-morning-intelligence, cron-proactive, cron-rule-promotion,
//   cron-self-awareness, cron-company-monitor
//   NOW: All moved to this scheduler or monitors/scheduler.js
//
// monitors/scheduler.js handles (DO NOT DUPLICATE):
//   pipeline-monitor, email-monitor, follow-up-monitor, scheduled-sender,
//   proactive-intel, competitive-discovery, realtime-listener

import cron from 'node-cron'

const LOCAL_URL = `http://127.0.0.1:${process.env.PORT || 3000}`
const SECRET = process.env.KIKO_WORKER_SECRET || 'dev-secret-change-me'

// Only crons with REAL files that are NOT handled by Supabase pg_cron or monitors
const SCHEDULES = [
  // Every 5 minutes
  { schedule: '*/5 * * * *',    path: '/api/cron-job-processor',           name: 'job-processor' },

  // Sequence engine (previously pg_cron — verified empty 2026-04-25)
  { schedule: '*/30 6-22 * * 1-5', path: '/api/cron-sequence-sender',         name: 'seq-sender' },
  { schedule: '0 8-20/2 * * 1-5', path: '/api/cron-sequence-reply-detect', name: 'seq-reply' },
  { schedule: '*/30 7-22 * * *', path: '/api/cron-gmail-sync', name: 'gmail-sync' },
  { schedule: '0 6 * * 1-5',    path: '/api/cron-sequence-enqueue',        name: 'seq-enqueue' },

  // Intelligence (previously pg_cron)
  { schedule: '0 3 * * *',      path: '/api/cron-learning-director',       name: 'learning-director' },
  { schedule: '0 7,14 * * 1-5', path: '/api/cron-proactive',              name: 'proactive-convergence' },
  { schedule: '30 7 * * 1-5',   path: '/api/cron-proactive-recommendations', name: 'proactive-recommendations' },

  // Cognitive Architecture (Phase 2)
  { schedule: '*/10 7-22 * * 1-5', path: '/api/cron-event-processor',     name: 'event-processor' },
  { schedule: '0 23 * * 1-5',   path: '/api/cron-cognitive-synthesis',     name: 'cognitive-synthesis' },
  { schedule: '0 0 * * 2-6',    path: '/api/cron-personamail-loop',        name: 'personamail-loop' },
  // DISABLED by Sunny — unnecessary token burn
  // { schedule: '0 6 * * 1-5',    path: '/api/cron-morning-intelligence',    name: 'morning-intel' },
  // { schedule: '30 6 * * 1-5',   path: '/api/cron-morning-email',           name: 'morning-email' },
  { schedule: '0 4 * * 1-5',    path: '/api/cron-inbox-triage',            name: 'inbox-triage' },
  { schedule: '0 5 * * 0',      path: '/api/cron-rule-promotion',          name: 'rule-promotion' },
  { schedule: '0 3 * * 0',      path: '/api/cron-contact-reenrich',        name: 'contact-reenrich' },
  { schedule: '0 2 * * *',      path: '/api/cron-self-awareness',          name: 'self-awareness' },
  { schedule: '0 6 * * 1-5',    path: '/api/cron-company-monitor',         name: 'company-monitor' },

  // Weekday business
  { schedule: '0 7 * * 1-5',    path: '/api/cron-segment-enroller',        name: 'seg-enroller' },
  { schedule: '30 8 * * 1-5',   path: '/api/cron-task-executor',           name: 'task-executor' },
  { schedule: '0 8,13,18 * * 1-5', path: '/api/cron-selfcheck-watcher',   name: 'selfcheck' },
  { schedule: '0 12 * * 1-5',      path: '/api/cron-linkedin-social-listen', name: 'linkedin-social-listen' },
  { schedule: '0 9 * * 1-5',    path: '/api/cron-outreach-score',          name: 'outreach-score' },
  { schedule: '0 7 * * 1-5',    path: '/api/cron-partnership-scan',        name: 'partnership-scan' },

  // Daily
  { schedule: '0 5 * * *',      path: '/api/cron-score-companies',         name: 'score-companies' },
  { schedule: '0 6 * * *',      path: '/api/cron-enrich',                  name: 'enrich' },
  { schedule: '0 7 * * *',      path: '/api/cron-race-week-intel',        name: 'race-week-intel' },
  { schedule: '0 9 * * 1-5',    path: '/api/cron-campaign-monitor',      name: 'campaign-monitor' },
  { schedule: '0 8 * * *',      path: '/api/news-agent',                   name: 'news-agent' },
  { schedule: '0 5 * * *',      path: '/api/ingest-knowledge',             name: 'ingest-knowledge' },
  { schedule: '0 5 * * *',      path: '/api/embed',                        name: 'embed-knowledge', method: 'POST', body: '{"mode":"embed"}' },

  // Weekly
  { schedule: '30 4 * * *',     path: '/api/cron-company-enrich',          name: 'company-enrich' },
  { schedule: '45 4 * * *',     path: '/api/linkedin-enrich',              name: 'linkedin-enrich' },
  { schedule: '0 4 * * 0',      path: '/api/cron-profile-synthesis',       name: 'profile-synthesis' },
  { schedule: '0 4 * * 0,3',    path: '/api/cron-email-voice-learning',    name: 'email-voice' },
  { schedule: '0 5 * * *',      path: '/api/cron-relationship-intel',      name: 'relationship-intel' },
  { schedule: '30 6 * * 0',     path: '/api/cron-pipeline-hygiene',        name: 'pipeline-hygiene' },
  // DISABLED by Sunny — unnecessary token burn
  // { schedule: '0 19 * * 0',     path: '/api/cron-weekly-report',           name: 'weekly-report' },

  // LinkedIn local — already handled correctly
  { schedule: '*/30 9-18 * * 1-5', path: '/linkedin-queue/process', name: 'linkedin-queue', local: true },
  { schedule: '0 */6 * * *',        path: '/api/cron-linkedin-keepalive', name: 'linkedin-keepalive' },
  { schedule: '0 8 * * *',         path: '/linkedin-queue/sync-cookies', name: 'linkedin-sync', local: true },
  { schedule: '0 10,14,17 * * 1-5', path: '/linkedin-queue/check-replies', name: 'linkedin-replies', local: true },
]

async function callEndpoint(job) {
  const url = job.local
    ? `${LOCAL_URL}${job.path}`
    : `${LOCAL_URL}${job.path}`
  try {
    const headers = { 'Content-Type': 'application/json' }
    // All calls are local — no auth needed, but add it for safety
    headers['Authorization'] = `Bearer ${SECRET}`
    const res = await fetch(url, {
      method: job.method || 'POST',
      headers,
      body: job.body || undefined,
      signal: AbortSignal.timeout(280000)
    })
    console.log(`[cron] ${job.name} → ${res.status} (local)`)
  } catch (err) {
    console.error(`[cron] ${job.name} FAILED: ${err.message}`)
  }
}

export function startScheduler() {
  console.log(`[cron-scheduler] Starting ${SCHEDULES.length} local cron jobs`)
  for (const job of SCHEDULES) {
    cron.schedule(job.schedule, () => callEndpoint(job), { timezone: 'UTC' })
  }
  console.log(`[cron-scheduler] ${SCHEDULES.length} jobs registered (all calling localhost:${process.env.PORT || 3000})`)
}
