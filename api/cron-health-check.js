// api/cron-health-check.js — Automated system health monitor
// Runs every hour. Tests all critical systems. Writes alert if anything fails.
// Sunny sees failures in morning brief + alerts table.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';
import { classifyIntent } from './agents/intent-classifier.js';
import { generateSelfKnowledge } from './kiko-self-knowledge.js';

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-health-check', 'started');
  const results = [];

  const check = async (name, fn) => {
    const t = Date.now();
    try {
      const r = await fn();
      results.push({ name, ok: true, ms: Date.now() - t, detail: r });
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t, error: e.message?.slice(0, 150) });
    }
  };

  try {
    // 1. Supabase
    await check('supabase', async () => {
      const r = await sbFetch('kiko_error_log?select=id&limit=1');
      return Array.isArray(r) ? 'ok' : 'bad response';
    });

    // 2. Anthropic API
    await check('anthropic', async () => {
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 5,
        messages: [{ role: 'user', content: 'Say OK' }],
      });
      return r.content?.[0]?.text ? 'ok' : 'no response';
    });

    // 3. Intent classifier
    await check('classifier', async () => {
      const { intent } = await classifyIntent('check my email');
      return intent === 'email_read' ? 'ok' : `wrong: ${intent}`;
    });

    // 4. Self-knowledge
    await check('self_knowledge', async () => {
      const sk = await generateSelfKnowledge();
      return sk.length > 1000 ? 'ok' : 'too short';
    });

    // 5. Google token
    await check('google_token', async () => {
      const { getGoogleToken } = await import('./google-token.js');
      const token = await getGoogleToken('sunny@vanhawke.com');
      return token ? 'ok' : 'missing';
    });

    // 6. Gmail API reachable
    await check('gmail', async () => {
      const { getGoogleToken } = await import('./google-token.js');
      const token = await getGoogleToken('sunny@vanhawke.com');
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.ok ? 'ok' : `http ${r.status}`;
    });

    // 7. Calendar API reachable
    await check('calendar', async () => {
      const { getGoogleToken } = await import('./google-token.js');
      const token = await getGoogleToken('sunny@vanhawke.com');
      const now = new Date().toISOString();
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.ok ? 'ok' : `http ${r.status}`;
    });

    // 8. Kiko endpoint responds
    await check('kiko_endpoint', async () => {
      const r = await fetch('https://vela-platform-one.vercel.app/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ping', conversationHistory: [], currentPage: 'home', userEmail: 'sunny@vanhawke.com' }),
      });
      const text = await r.text();
      if (text.includes('Something went wrong')) return 'error in response';
      return text.includes('"delta"') ? 'ok' : 'no content';
    });

    // Summarise
    const failed = results.filter(r => !r.ok);
    const passed = results.filter(r => r.ok);

    if (failed.length > 0) {
      // Write high-priority alert — Kiko will surface this in conversations
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'system_health', severity: 'high',
        title: `⚠️ SYSTEM HEALTH: ${failed.length} check(s) failing`,
        detail: `FAILING: ${failed.map(f => `${f.name} — ${f.error}`).join('; ')}. PASSING: ${passed.map(p => p.name).join(', ')}.`,
        entity_type: 'system', entity_name: 'Health Check',
        metadata: { results, timestamp: new Date().toISOString() },
        expires_at: new Date(Date.now() + 4 * 3600000).toISOString(), // 4hr expiry
      })});

      // Also log each failure
      for (const f of failed) {
        await logError('health-check', `${f.name}: ${f.error}`, '', 'error');
      }
    } else {
      // All clear — log but don't alert (only alert on failures)
      // Clear any existing health alerts so they don't linger
      await sbFetch('kiko_alerts?type=eq.system_health&severity=eq.high', {
        method: 'PATCH', body: JSON.stringify({ expires_at: new Date().toISOString() })
      }).catch(() => {});
    }

    await cronHeartbeat('cron-health-check', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: results.length,
    });
    return res.status(200).json({
      status: failed.length === 0 ? 'healthy' : 'degraded',
      passed: passed.length, failed: failed.length,
      checks: results,
    });
  } catch (err) {
    await logError('cron:health-check', err.message);
    await cronHeartbeat('cron-health-check', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
