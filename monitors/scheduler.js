// monitors/scheduler.js — Registers all monitors with node-cron + Realtime
import cron from 'node-cron';
import { runPipelineMonitor } from './pipeline-monitor.js';
import { runEmailMonitor } from './email-monitor.js';
import { runFollowUpMonitor } from './follow-up-monitor.js';
import { runScheduledSender } from './scheduled-sender.js';
import { startRealtimeListener } from './realtime-listener.js';

export function startMonitors() {
  console.log('[monitors] Starting scheduled monitors...');

  // Pipeline health — every 30 min, weekdays
  cron.schedule('*/30 * * * 1-5', async () => {
    try { await runPipelineMonitor(); } catch (e) { console.error('[cron] pipeline-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  // Email replies — every 15 min, weekdays 7am-9pm
  cron.schedule('*/15 7-21 * * 1-5', async () => {
    try { await runEmailMonitor(); } catch (e) { console.error('[cron] email-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  // Follow-up monitor — every 2 hours, weekdays 8am-8pm
  cron.schedule('0 8-20/2 * * 1-5', async () => {
    try { await runFollowUpMonitor(); } catch (e) { console.error('[cron] follow-up-monitor:', e.message); }
  }, { timezone: 'Europe/London' });

  console.log('[monitors] Pipeline: every 30min (Mon-Fri)');
  console.log('[monitors] Email: every 15min (Mon-Fri, 7am-9pm)');
  console.log('[monitors] Follow-ups: every 2hrs (Mon-Fri, 8am-8pm)');
  console.log('[monitors] Scheduled sender: every 5min (Mon-Fri, 7am-9pm)');

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
