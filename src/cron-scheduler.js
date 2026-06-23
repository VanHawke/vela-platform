// kiko-worker/src/cron-scheduler.js — CLEANED for Opus 4.8 backbone
// Opus reasons in real-time — crons only for infrastructure that MUST run on schedule.
// Last audit: Session 68 (2026-06-01)

import cron from 'node-cron'

const LOCAL_URL = `http://127.0.0.1:${process.env.PORT || 3000}`
const SECRET = process.env.KIKO_WORKER_SECRET || 'dev-secret-change-me'

const SCHEDULES = [
  // ═══ INFRASTRUCTURE (must run on schedule) ═══
  { schedule: '*/5 * * * *',       path: '/api/cron-job-processor',       name: 'job-processor' },
  { schedule: '*/30 7-22 * * *',   path: '/api/cron-gmail-sync',          name: 'gmail-sync' },
  { schedule: '0 8-20/2 * * *',    path: '/api/cron-heartbeat',           name: 'heartbeat' },
  { schedule: '0 */6 * * *',       path: '/api/cron-linkedin-keepalive',  name: 'linkedin-keepalive' },
  { schedule: '*/30 8-20 * * 1-5', path: '/api/cron-linkedin-monitor',    name: 'linkedin-monitor' },
  // REMOVED S70: crm-enrich (3am, 955 AI calls/run) — was claimed disabled Jun 9 but schedule entry survived. Killed for real Jun 10.
  { schedule: '0 8 * * *',         path: '/linkedin-queue/sync-cookies',  name: 'linkedin-sync', local: true },

  // ═══ CAMPAIGN ENGINE (sends emails + LinkedIn on schedule) ═══
  { schedule: '*/30 6-22 * * 1-5', path: '/api/cron-sequence-sender',     name: 'seq-sender' },
  { schedule: '0 8-20/2 * * 1-5',  path: '/api/cron-sequence-reply-detect', name: 'seq-reply' },
  { schedule: '0 6 * * 1-5',       path: '/api/cron-sequence-enqueue',    name: 'seq-enqueue' },
  { schedule: '*/30 9-18 * * 1-5', path: '/linkedin-queue/process',       name: 'linkedin-queue', local: true },
  { schedule: '0 10,14,17 * * 1-5', path: '/linkedin-queue/check-replies', name: 'linkedin-replies', local: true },

  // ═══ INTELLIGENCE (consolidated — replaces morning-synthesis, partnership-scan, prospect-intel, evening-summary) ═══
  { schedule: '0 6 * * *',         path: '/api/cron-daily-intelligence',  name: 'daily-intelligence' },
  { schedule: '0 7 * * 1',         path: '/api/cron-partnership-scan',    name: 'partnership-scan' }, // weekly trigger; fortnightly via ISO-week parity gate inside the handler
  { schedule: '0 8 * * 1-5',       path: '/api/cron-selfcheck-watcher',   name: 'selfcheck' },
  { schedule: '0 9 * * 1-5',       path: '/api/cron-campaign-monitor',    name: 'campaign-monitor' },
  { schedule: '0 3 * * 0',          path: '/api/cron-conversation-learning', name: 'conv-learning' },

  // ═══ INTEGRATIONS (external API sync) ═══
  { schedule: '0 19 * * 1-5',      path: '/api/meeting-transcripts',      name: 'meeting-transcripts', method: 'POST', body: '{"email":"sunny@vanhawke.com","days":1}' },
  { schedule: '0 6 * * 1',         path: '/api/calendar-webhook?email=sunny@vanhawke.agency', name: 'calendar-watch-renew', method: 'GET' },
  // REMOVED S70: linkedin-enrich nightly sweep (5 Sonnet+websearch calls/night). Route kept for on-demand use.

  // ═══ REMOVED (Opus 4.8 handles on demand) ═══
  // weekly-learning — Opus reasons in real-time from memory
  // event-processor — Opus processes events in conversation
  // news-agent — Opus searches web on demand
  // ingest-knowledge — read_bible tool loads on demand
  // embed-knowledge — Opus uses read_bible, not embeddings
  // race-week-intel — Opus knows race calendar from memory
  // inbox-triage — Opus triages in conversation
  // task-executor — Opus executes tasks directly
  // contact-reenrich — Opus enriches on demand
  // pipeline-hygiene — Opus evaluates pipeline in conversation
  // enrich — general enrichment done on demand
]

async function callEndpoint(job) {
  const url = `${LOCAL_URL}${job.path}`
  try {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET}` }
    const res = await fetch(url, {
      method: job.method || 'POST',
      headers,
      body: job.body || undefined,
      signal: AbortSignal.timeout(280000)
    })
    console.log(`[cron] ${job.name} → ${res.status}`)
  } catch (err) {
    console.error(`[cron] ${job.name} FAILED: ${err.message}`)
  }
}

export function startScheduler() {
  console.log(`[cron-scheduler] Starting ${SCHEDULES.length} cron jobs (cleaned for Opus 4.8)`)
  for (const job of SCHEDULES) {
    cron.schedule(job.schedule, () => callEndpoint(job), { timezone: 'UTC' })
  }
  console.log(`[cron-scheduler] ${SCHEDULES.length} jobs registered`)
}
