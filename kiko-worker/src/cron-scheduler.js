// kiko-worker/src/cron-scheduler.js
// Cron scheduler for Hetzner worker. Calls Vercel API endpoints on schedule.
// This is the SIMPLEST migration path: Hetzner schedules, Vercel executes.
// Phase 2 (future): port actual cron logic to run natively on Hetzner.
//
// INSTALL: npm install node-cron node-fetch
// USAGE: import { startScheduler } from './cron-scheduler.js'
//        startScheduler()

import cron from 'node-cron'

const VERCEL_URL = process.env.VERCEL_URL || 'https://kiko.vanhawke.agency'
const CRON_SECRET = process.env.CRON_SECRET || ''

// All 43 crons from vercel.json — schedule + endpoint
const SCHEDULES = [
  // Daily
  { schedule: '0 3 * * *',      path: '/api/cron-background-task-cleanup', name: 'bg-task-cleanup' },
  { schedule: '30 2 * * *',     path: '/api/cron-self-awareness',          name: 'self-awareness' },
  { schedule: '0 4 * * *',      path: '/api/cron-compute-outreach-windows', name: 'outreach-windows' },
  { schedule: '0 6 * * *',      path: '/api/cron-health-check',            name: 'health-check' },

  // Weekdays (Mon-Fri)
  { schedule: '0 6 * * 1-5',    path: '/api/cron-health-watcher',          name: 'health-watcher' },
  { schedule: '0 6 * * 1-5',    path: '/api/cron-sequence-enqueue',        name: 'seq-enqueue' },
  { schedule: '30 6 * * 1-5',   path: '/api/cron-task-automation',         name: 'task-automation' },
  { schedule: '0 7 * * 1-5',    path: '/api/cron-segment-enroller',        name: 'seg-enroller' },
  { schedule: '0 7 * * 1-5',    path: '/api/cron-proactive',              name: 'proactive' },
  { schedule: '0 7 * * 1-5',    path: '/api/cron-meeting-prep',            name: 'meeting-prep' },
  { schedule: '15 7 * * 1-5',   path: '/api/cron-inbox-triage',            name: 'inbox-triage' },
  { schedule: '30 7 * * 1-5',   path: '/api/cron-morning-intelligence',    name: 'morning-intel' },
  { schedule: '45 7 * * 1-5',   path: '/api/cron-morning-email',           name: 'morning-email' },
  { schedule: '30 8 * * 1-5',   path: '/api/cron-task-executor',           name: 'task-executor' },
  { schedule: '0 8,13,18 * * 1-5', path: '/api/cron-selfcheck-watcher',   name: 'selfcheck' },
  { schedule: '0 6-22 * * 1-5', path: '/api/cron-sequence-sender',         name: 'seq-sender' },
  { schedule: '0 22 * * 1-5',   path: '/api/cron-edit-delta',              name: 'edit-delta' },
  { schedule: '30 22 * * 1-5',  path: '/api/cron-deal-attribution',        name: 'deal-attribution' },

  // Every 15 min during business hours
  { schedule: '*/15 8-19 * * 1-5', path: '/api/cron-jobs-worker',          name: 'jobs-worker' },

  // Every 4 hours weekdays
  { schedule: '0 */4 * * 1-5',  path: '/api/cron-sequence-reply-detect',   name: 'reply-detect' },

  // Weekly (Monday)
  { schedule: '0 2 * * *',      path: '/api/cron-competitive-intel',       name: 'competitive-intel' },
  { schedule: '0 3 * * *',      path: '/api/cron-learning-director',       name: 'learning-director' },
  { schedule: '30 3 * * *',     path: '/api/cron-knowledge-seed?domains=f1-sponsorship,insolvency-bbls,cross-border-tax', name: 'knowledge-seed-1' },
  { schedule: '35 3 * * *',     path: '/api/cron-knowledge-seed?domains=luxury-fashion,gaming-esports,ai-saas', name: 'knowledge-seed-2' },
  { schedule: '40 3 * * *',     path: '/api/cron-knowledge-seed?domains=sports-entertainment-law,uk-property,hr-employment', name: 'knowledge-seed-3' },
  { schedule: '45 3 * * *',     path: '/api/cron-knowledge-seed?domains=fundraising-vc,hedge-funds-trading,kyc-aml-compliance', name: 'knowledge-seed-4' },
  { schedule: '50 3 * * *',     path: '/api/cron-knowledge-seed?domains=financial-regulation,contract-disputes,retail-consumer', name: 'knowledge-seed-5' },
  { schedule: '0 5 * * *',      path: '/api/ingest-knowledge',             name: 'ingest-knowledge' },
  { schedule: '0 5 * * *',      path: '/api/cron-score-companies',         name: 'score-companies' },
  { schedule: '0 6 * * *',      path: '/api/cron-enrich',                  name: 'enrich' },
  { schedule: '0 7 * * 1-5',    path: '/api/cron-partnership-scan',        name: 'partnership-scan' },
  { schedule: '0 8 * * *',      path: '/api/news-agent',                   name: 'news-agent' },
  { schedule: '15 8 * * *',     path: '/api/cron-news-classify',           name: 'news-classify' },
  { schedule: '0 9 * * 1-5',    path: '/api/cron-outreach-score',          name: 'outreach-score' },

  // Weekly (Sunday)
  { schedule: '0 3 * * 0',      path: '/api/cron-rule-promotion',          name: 'rule-promotion' },
  { schedule: '0 4 * * *',      path: '/api/cron-profile-synthesis',       name: 'profile-synthesis' },
  { schedule: '0 4 * * 0,3',    path: '/api/cron-email-voice-learning',    name: 'email-voice' },
  { schedule: '0 4 * * *',      path: '/api/cron-job-cleanup',             name: 'job-cleanup' },
  { schedule: '30 4 * * *',     path: '/api/cron-company-enrich',          name: 'company-enrich' },
  { schedule: '45 4 * * *',     path: '/api/linkedin-enrich',              name: 'linkedin-enrich' },
  { schedule: '0 5 * * *',      path: '/api/embed',                        name: 'embed-knowledge', method: 'POST', body: '{"mode":"embed"}' },
  { schedule: '0 5 * * *',      path: '/api/cron-relationship-intel',      name: 'relationship-intel' },
  { schedule: '0 5 * * *',      path: '/api/cron-partnership-verify',      name: 'partnership-verify' },
  { schedule: '30 5 * * 1-5',   path: '/api/cron-people-verify',           name: 'people-verify' },
  { schedule: '0 6 * * *',      path: '/api/cron-document-scan',           name: 'document-scan' },
  { schedule: '0 6 * * *',      path: '/api/cron-preference-synthesis',    name: 'pref-synthesis' },
  { schedule: '0 6 * * 1-5',    path: '/api/cron-partner-reconcile',       name: 'partner-reconcile' },
  { schedule: '30 6 * * 0',     path: '/api/cron-pipeline-hygiene',        name: 'pipeline-hygiene' },
  { schedule: '0 10 * * 0',     path: '/api/cron-email-template-learning', name: 'email-template' },
  { schedule: '0 19 * * 0',     path: '/api/cron-weekly-report',           name: 'weekly-report' },

  // LOCAL crons — run against the Hetzner worker itself (not Vercel)
  { schedule: '*/30 9-18 * * 1-5', path: '/linkedin-queue/process', name: 'linkedin-queue', local: true },
  { schedule: '0 8 * * *',         path: '/linkedin-queue/sync-cookies', name: 'linkedin-sync', local: true },
  { schedule: '0 10,14,17 * * 1-5', path: '/linkedin-queue/check-replies', name: 'linkedin-replies', local: true },
]

async function callEndpoint(job) {
  const url = job.local
    ? `http://127.0.0.1:${process.env.PORT || 3000}${job.path}`
    : `${VERCEL_URL}${job.path}`
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (job.local) {
      headers['Authorization'] = `Bearer ${process.env.KIKO_WORKER_SECRET || 'dev-secret-change-me'}`
    } else if (CRON_SECRET) {
      headers['Authorization'] = `Bearer ${CRON_SECRET}`
    }
    const res = await fetch(url, { method: 'POST', headers, body: job.body || undefined, signal: AbortSignal.timeout(280000) })
    console.log(`[cron] ${job.name} → ${res.status} (${url})`)
  } catch (err) {
    console.error(`[cron] ${job.name} FAILED: ${err.message}`)
  }
}

export function startScheduler() {
  console.log(`[cron-scheduler] Starting ${SCHEDULES.length} cron jobs → ${VERCEL_URL}`)
  for (const job of SCHEDULES) {
    cron.schedule(job.schedule, () => callEndpoint(job), { timezone: 'UTC' })
    console.log(`  ✓ ${job.name} [${job.schedule}]`)
  }
}
