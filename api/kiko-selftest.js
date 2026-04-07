// api/kiko-selftest.js — Internal system checker
// Verifies every component is plugged in correctly. Returns pass/fail per check.
// Hit before any deploy. Kiko can call it via ask_self_monitor.

import { sbFetch } from './kiko-tools.js';
import fs from 'fs';
import path from 'path';

const checks = [];

function addCheck(name, pass, detail) {
  checks.push({ name, pass, detail: String(detail).slice(0, 300) });
}

export default async function handler(req, res) {
  checks.length = 0;

  // 1. Environment variables
  addCheck('env.ANTHROPIC_KEY', !!process.env.ANTHROPIC_KEY, process.env.ANTHROPIC_KEY ? 'set' : 'MISSING');
  addCheck('env.SUPABASE_URL', !!process.env.SUPABASE_URL, process.env.SUPABASE_URL ? 'set' : 'MISSING');
  addCheck('env.SUPABASE_SERVICE_ROLE_KEY', !!process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING');

  // 2. Core tables exist
  const coreTables = [
    'contacts', 'companies', 'deals', 'activities', 'tasks',
    'kiko_alerts', 'kiko_user_config', 'kiko_cron_heartbeats',
    'kiko_inbox_triage', 'kiko_memories', 'kiko_personal_context',
    'kiko_sequence_enrollments', 'kiko_background_jobs', 'kiko_sent_email_analysis',
    'kiko_company_scores', 'kiko_sector_definitions',
  ];
  for (const t of coreTables) {
    try {
      const r = await sbFetch(`${t}?select=*&limit=1`);
      addCheck(`table.${t}`, Array.isArray(r), Array.isArray(r) ? `${r.length >= 0 ? 'accessible' : 'empty'}` : 'not accessible');
    } catch (e) {
      addCheck(`table.${t}`, false, `error: ${e.message}`);
    }
  }

  // 3. New schema additions (voice + signature + jobs)
  try {
    const cfg = await sbFetch('kiko_user_config?select=email_voice_profile,email_signature_html,email_signature_cold_html,voice_last_learned,sent_emails_analyzed&limit=1');
    const cols = cfg?.[0] ? Object.keys(cfg[0]) : [];
    addCheck('schema.email_voice_profile', cols.includes('email_voice_profile'), 'column exists');
    addCheck('schema.email_signature_html', cols.includes('email_signature_html'), 'column exists');
    addCheck('schema.email_signature_cold_html', cols.includes('email_signature_cold_html'), 'column exists');
    addCheck('schema.voice_last_learned', cols.includes('voice_last_learned'), 'column exists');
  } catch (e) {
    addCheck('schema.voice_signature_columns', false, `error: ${e.message}`);
  }

  // 4. Voice profile state
  try {
    const cfg = await sbFetch('kiko_user_config?select=email_voice_profile,voice_last_learned,sent_emails_analyzed&limit=1');
    if (cfg?.[0]) {
      const hasVoice = cfg[0].email_voice_profile && Object.keys(cfg[0].email_voice_profile || {}).length > 0;
      addCheck('kiko.voice_profile_loaded', hasVoice, hasVoice ? `${cfg[0].sent_emails_analyzed || 0} emails analysed` : 'not yet learned — POST /api/cron-email-voice-learning to populate');
    }
  } catch (e) {
    addCheck('kiko.voice_profile_loaded', false, e.message);
  }

  // 5. Background jobs queue operational
  try {
    const jobs = await sbFetch('kiko_background_jobs?select=id,status&limit=5');
    addCheck('kiko.background_jobs_queue', Array.isArray(jobs), `${jobs?.length || 0} total jobs in queue`);
  } catch (e) {
    addCheck('kiko.background_jobs_queue', false, e.message);
  }

  // 6. Cron heartbeats recent (system is alive)
  try {
    const recent = await sbFetch('kiko_cron_heartbeats?order=started_at.desc&limit=10&select=cron_name,status,started_at');
    const latestRun = recent?.[0];
    const okCount = (recent || []).filter(h => h.status === 'finished').length;
    const errCount = (recent || []).filter(h => h.status === 'error').length;
    addCheck('crons.recent_runs', (recent?.length || 0) > 0, `last 10: ${okCount} OK, ${errCount} error, latest: ${latestRun?.cron_name || 'none'}`);
  } catch (e) {
    addCheck('crons.recent_runs', false, e.message);
  }

  // 7. Vercel cron schedules configured
  try {
    const vc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8'));
    const crons = vc.crons || [];
    const expected = ['cron-inbox-triage', 'cron-morning-intelligence', 'cron-proactive', 'cron-email-voice-learning', 'cron-jobs-worker'];
    const cronPaths = crons.map(c => c.path);
    for (const e of expected) {
      addCheck(`cron.${e}`, cronPaths.some(p => p.includes(e)), cronPaths.some(p => p.includes(e)) ? 'scheduled' : 'NOT SCHEDULED');
    }
  } catch (e) {
    addCheck('crons.vercel_config', false, e.message);
  }

  // 8. Critical endpoints reachable (self-reference)
  addCheck('endpoint.kiko-selftest', true, 'you are here');

  // Summary
  const allPassing = checks.every(c => c.pass);
  const failures = checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`);

  // Record run
  try {
    await sbFetch('kiko_selftest_runs', {
      method: 'POST',
      body: JSON.stringify({ all_passing: allPassing, checks, failures }),
    });
  } catch {}

  return res.status(200).json({
    ok: true,
    all_passing: allPassing,
    total: checks.length,
    passed: checks.filter(c => c.pass).length,
    failed: checks.filter(c => !c.pass).length,
    failures,
    checks,
    timestamp: new Date().toISOString(),
  });
}
