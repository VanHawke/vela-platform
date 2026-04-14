// api/cron-linkedin-auth-check.js — Daily LinkedIn cookie health check
// Runs once per day at 7am UTC. Calls linkedinTestAuth().
// If cookies expired: fires high-severity kiko_alert + Gmail alert.
// If healthy: writes heartbeat row to indicate last-known-good state.

import { linkedinTestAuth } from './linkedin-client.js';
import { sendAlert } from './alert-utils.js';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-auth-check', 'started');
  try {
    const result = await linkedinTestAuth();

    if (result.authenticated) {
      await cronHeartbeat('cron-linkedin-auth-check', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 1 });
      return res.status(200).json({ ok: true, authenticated: true, profile: result.profile });
    }

    const alertTitle = '🚨 LinkedIn cookies expired — re-extraction needed';
    const alertBody = [
      `LinkedIn auth check failed at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}.`,
      `Error: ${result.error}`, '',
      'ALL Kiko LinkedIn activity (sequences, search, manual actions) will fail until cookies are refreshed.', '',
      'TO FIX:', '1. Open Chrome, go to linkedin.com (log in if needed)',
      '2. Right-click → Inspect → Application tab → Cookies → https://www.linkedin.com',
      '3. Copy li_at value (long string)', '4. Copy JSESSIONID value (includes surrounding quotes)',
      '5. Open Vercel env vars and update LINKEDIN_LI_AT + LINKEDIN_JSESSIONID',
      '6. Redeploy: npx vercel --prod --yes',
      '7. Verify: curl https://kiko.vanhawke.agency/api/linkedin-test',
    ].join('\n');

    await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({ type: 'linkedin_auth_failed', severity: 'high', title: alertTitle, detail: alertBody, entity_type: 'system', entity_name: 'LinkedIn Auth', created_at: new Date().toISOString() }) }).catch(() => {});
    await sendAlert(alertTitle, alertBody, 'critical').catch(() => {});

    await cronHeartbeat('cron-linkedin-auth-check', 'error', { heartbeatId: __hbId, errorMessage: result.error, durationMs: Date.now() - __hbStart });
    return res.status(200).json({ ok: false, authenticated: false, error: result.error, alertSent: true });
  } catch (err) {
    console.error('[LinkedInAuthCheck] Fatal:', err.message);
    await cronHeartbeat('cron-linkedin-auth-check', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
