// monitors/scheduler.js — Registers all monitors with node-cron
import cron from 'node-cron';
import { runPipelineMonitor } from './pipeline-monitor.js';
import { runEmailMonitor } from './email-monitor.js';

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

  console.log('[monitors] Pipeline: every 30min (Mon-Fri)');
  console.log('[monitors] Email: every 15min (Mon-Fri, 7am-9pm)');

  // Run once on startup (delayed 10s)
  setTimeout(async () => {
    console.log('[monitors] Running initial scan...');
    try { await runPipelineMonitor(); } catch (e) { console.error('[monitors] Pipeline:', e.message); }
    try { await runEmailMonitor(); } catch (e) { console.error('[monitors] Email:', e.message); }
  }, 10000);
}
