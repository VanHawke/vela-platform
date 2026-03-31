// api/alert-utils.js — Notification helpers for monitoring
// Sends alerts via Gmail (primary) and kiko_alerts table (in-app)
// Used by: cron-health-check, any cron on failure

import { sbFetch } from './kiko-tools.js';

/**
 * Send an alert notification
 * @param {string} title - Alert title (e.g., "HEALTH CHECK FAILED")
 * @param {string} body - Alert detail
 * @param {'critical'|'warning'|'info'} severity
 */
export async function sendAlert(title, body, severity = 'warning') {
  const sent = [];

  // 1. Send Gmail notification to primary user
  try {
    const { getGoogleToken } = await import('./google-token.js');
    const { getActiveUsers } = await import('./cron-utils.js');
    const users = await getActiveUsers();
    const email = users[0]?.email;
    if (email) {
      const token = await getGoogleToken(email);
      if (token) {
        const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : 'ℹ️';
        const subject = `${emoji} [Kiko OS] ${severity.toUpperCase()}: ${title}`;
        const raw = Buffer.from(
          `To: ${email}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\n\nTimestamp: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}\nService: Kiko Intelligence OS\nURL: https://vela-platform-one.vercel.app`
        ).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        });
        if (res.ok) sent.push('gmail');
      }
    }
  } catch (e) {
    console.error('[alert] Gmail failed:', e.message);
  }

  // 2. Always write to kiko_alerts (in-app visibility)
  try {
    await sbFetch('kiko_alerts', {
      method: 'POST',
      body: JSON.stringify({
        type: 'monitoring',
        severity: severity === 'critical' ? 'critical' : 'high',
        title, detail: body,
        entity_type: 'system', entity_name: 'Monitoring',
        metadata: { channels: sent },
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      }),
    });
    sent.push('kiko_alerts');
  } catch {}

  return { sent, title, severity };
}

/**
 * Check cron heartbeats for missing or failed runs
 * Returns list of problems found
 */
export async function checkCronHealth() {
  const problems = [];
  const now = new Date();
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  const hour = now.getUTCHours();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

  // Expected weekday crons (UTC hours)
  const weekdayCrons = [
    { name: 'cron-proactive', afterUTC: 7 },
    { name: 'cron-inbox-triage', afterUTC: 7 },
    { name: 'cron-morning-intelligence', afterUTC: 8 },
    { name: 'news-agent', afterUTC: 8 },
    { name: 'cron-partnership-scan', afterUTC: 7 },
  ];

  // Check today's heartbeats
  const todayHeartbeats = await sbFetch(
    `kiko_cron_heartbeats?started_at=gt.${todayStart.toISOString()}&select=cron_name,status,started_at,error_message&order=started_at.desc`
  ).catch(() => []);

  const hbMap = {};
  for (const hb of (Array.isArray(todayHeartbeats) ? todayHeartbeats : [])) {
    if (!hbMap[hb.cron_name]) hbMap[hb.cron_name] = hb;
  }

  // Check weekday crons
  if (isWeekday) {
    for (const cron of weekdayCrons) {
      if (hour >= cron.afterUTC + 1) {
        const hb = hbMap[cron.name];
        if (!hb) {
          problems.push({ cron: cron.name, issue: 'missing', detail: `Expected by ${cron.afterUTC}:00 UTC, no heartbeat today` });
        } else if (hb.status === 'error') {
          problems.push({ cron: cron.name, issue: 'error', detail: hb.error_message || 'Unknown error' });
        }
      }
    }
  }

  // Check hourly cron (meeting-prep) — should have run in last 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
  const meetingPrepRecent = await sbFetch(
    `kiko_cron_heartbeats?cron_name=eq.cron-meeting-prep&started_at=gt.${twoHoursAgo}&limit=1`
  ).catch(() => []);
  if (!(Array.isArray(meetingPrepRecent) && meetingPrepRecent.length > 0) && hour >= 1) {
    problems.push({ cron: 'cron-meeting-prep', issue: 'missing', detail: 'No heartbeat in last 2 hours (runs hourly)' });
  }

  return problems;
}
