// monitors/scheduler.js — Registers all monitors with node-cron + Realtime
import cron from 'node-cron';
import { runPipelineMonitor } from './pipeline-monitor.js';
import { runEmailMonitor } from './email-monitor.js';
import { runFollowUpMonitor } from './follow-up-monitor.js';
import { runScheduledSender } from './scheduled-sender.js';
import { runProactiveIntel } from './proactive-intel.js';
import { runCompetitiveDiscovery } from './competitive-discovery.js';
import { startRealtimeListener } from './realtime-listener.js';

export function startMonitors() {
  console.log('[monitors] Starting scheduled monitors...');

  // Pipeline health — every 30 min, weekdays
  cron.schedule('*/30 * * * 1-5', async () => {
    try { await runPipelineMonitor(); } catch (e) { console.error('[cron] pipeline-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  // Email replies — every 2 min, weekdays 7am-9pm (near-instant detection without Pub/Sub)
  cron.schedule('*/2 7-21 * * 1-5', async () => {
    try { await runEmailMonitor(); } catch (e) { console.error('[cron] email-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  // Follow-up monitor — every 2 hours, weekdays 8am-8pm
  cron.schedule('0 8-20/2 * * 1-5', async () => {
    try { await runFollowUpMonitor(); } catch (e) { console.error('[cron] follow-up-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  console.log('[monitors] Pipeline: every 30min (Mon-Fri)');
  console.log('[monitors] Email: every 2min (Mon-Fri, 7am-9pm)');
  console.log('[monitors] Follow-ups: every 2hrs (Mon-Fri, 8am-8pm)');
  console.log('[monitors] Scheduled sender: every 5min (Mon-Fri, 7am-9pm)');
  // Re-enabled: proactive-intel creates partnership_gap and category_recommendation alerts
  // that the Partnership Matrix reads. Heartbeat/morning-synthesis do NOT create these.
  // DISABLED: proactive-intel overlaps with daily-intelligence. Saves 4 Sonnet calls/day.
  // const proactiveJob = cron.schedule('0 8,14 * * 1-5', async () => {
  // try { await runProactiveIntel(); } catch (e) { console.error('[monitors] proactive-intel failed:', e.message); }
  // }, { timezone: 'UTC' });
  console.log('[monitors] Proactive intel: DISABLED (replaced by daily-intelligence)');
  console.log('[monitors] Competitive discovery: Sunday 5am');

  // Proactive intelligence — DISABLED: overlaps with heartbeat cron (every 2h) + morning-synthesis (7am daily)
  // Both are better designed (multi-pass, evaluator-optimizer) and cheaper (Haiku vs Sonnet)
  // cron.schedule('0 8,14 * * 1-5', async () => {
  //   try { await runProactiveIntel(); } catch (e) { console.error('[cron] proactive-intel:', e.message); }
  // }, { timezone: 'Europe/London' });

  // Competitive self-discovery — weekly, Sunday 5am
  cron.schedule('0 5 * * 0', async () => {
    try { await runCompetitiveDiscovery(); } catch (e) { console.error('[cron] competitive-discovery:', e.message); }
  }, { timezone: 'Europe/London' });

  // Scheduled email sender — every 5 min, weekdays 7am-9pm
  cron.schedule('*/5 7-21 * * 1-5', async () => {
    try { await runScheduledSender(); } catch (e) { console.error('[cron] scheduled-sender:', e.message); }
  }, { timezone: 'Europe/London' });

  // Start Supabase Realtime listener
  startRealtimeListener().catch(e => console.error('[monitors] Realtime listener failed:', e.message));

  // Initial scan on startup (delayed 10s)
  setTimeout(async () => {
    console.log('[monitors] Running initial scan...');
    try { await runPipelineMonitor(); } catch (e) { console.error('[monitors] Pipeline:', e.message); }
    try { await runEmailMonitor(); } catch (e) { console.error('[monitors] Email:', e.message); }
    try { await runFollowUpMonitor(); } catch (e) { console.error('[monitors] Follow-up:', e.message); }
  }, 10000);
}
