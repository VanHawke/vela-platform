// api/health.js — Kiko health check endpoint
// GET /api/health — tests every critical system and returns pass/fail
// Use this to verify Kiko is working before and after any deploy
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError } from './kiko-tools.js';
import { classifyIntent } from './agents/intent-classifier.js';
import { generateSelfKnowledge } from './kiko-self-knowledge.js';

export const config = { maxDuration: 30 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const start = Date.now();
  const results = [];
  const check = async (name, fn) => {
    const t = Date.now();
    try {
      const r = await fn();
      results.push({ name, ok: true, ms: Date.now() - t, detail: r });
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t, error: e.message?.slice(0, 100) });
    }
  };

  // 1. Supabase connection
  await check('supabase', async () => {
    const r = await sbFetch('kiko_error_log?select=id&limit=1');
    return Array.isArray(r) ? 'connected' : 'unexpected response';
  });

  // 2. Anthropic API
  await check('anthropic_api', async () => {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 10,
      messages: [{ role: 'user', content: 'Say OK' }],
    });
    return r.content?.[0]?.text?.slice(0, 20) || 'no response';
  });

  // 3. Intent classifier
  await check('intent_classifier', async () => {
    const { intent } = await classifyIntent('check my email');
    return intent === 'email_read' ? 'correct' : `wrong: ${intent}`;
  });

  // 4. Self-knowledge generator
  await check('self_knowledge', async () => {
    const sk = await generateSelfKnowledge();
    return `${sk.length} chars, ${(sk.match(/AGENTS/g) || []).length > 0 ? 'has sections' : 'MISSING sections'}`;
  });

  // 5. Google token (email/calendar dependency)
  await check('google_token', async () => {
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken('sunny@vanhawke.com');
    return token ? `valid (${token.slice(0, 10)}...)` : 'no token';
  });

  // 6. Gmail API
  await check('gmail_api', async () => {
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken('sunny@vanhawke.com');
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    return data.emailAddress || `error: ${r.status}`;
  });

  // 7. Calendar API
  await check('calendar_api', async () => {
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken('sunny@vanhawke.com');
    const now = new Date().toISOString();
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&maxResults=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.ok ? 'connected' : `error: ${r.status}`;
  });

  // 8. Key database tables have data
  await check('database_tables', async () => {
    const [deals, contacts, insights, personal] = await Promise.all([
      sbFetch('deals?select=id&limit=1'),
      sbFetch('contacts?select=id&limit=1'),
      sbFetch('kiko_conversation_insights?select=id&limit=1'),
      sbFetch('kiko_personal_context?select=id&limit=1'),
    ]);
    return `deals:${deals?.length || 0} contacts:${contacts?.length || 0} insights:${insights?.length || 0} personal:${personal?.length || 0}`;
  });

  // 9. Cron heartbeats (are crons actually running?)
  await check('cron_health', async () => {
    const recent = await sbFetch('kiko_cron_heartbeats?order=started_at.desc&limit=5&select=cron_name,status,started_at');
    if (!recent?.length) return 'NO cron heartbeats — crons may not be running';
    const latest = new Date(recent[0].started_at);
    const hoursAgo = Math.round((Date.now() - latest.getTime()) / 3600000);
    return `${recent.length} recent, last: ${recent[0].cron_name} (${hoursAgo}h ago) ${recent[0].status}`;
  });

  // 10. Full Kiko endpoint (the actual thing that matters)
  await check('kiko_endpoint', async () => {
    const r = await fetch('https://vela-platform-one.vercel.app/api/kiko', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping', conversationHistory: [], currentPage: 'home', userEmail: 'sunny@vanhawke.com' }),
    });
    const text = await r.text();
    const hasContent = text.includes('"delta"');
    const hasDone = text.includes('[DONE]');
    const hasError = text.includes('Something went wrong');
    return hasError ? `ERROR in response` : (hasContent && hasDone ? 'responding + completing' : `status:${r.status} content:${hasContent} done:${hasDone}`);
  });

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  const totalMs = Date.now() - start;

  res.status(failed.length > 0 ? 207 : 200).json({
    status: failed.length === 0 ? 'healthy' : 'degraded',
    passed, failed: failed.length, total: results.length,
    duration_ms: totalMs,
    checks: results,
    timestamp: new Date().toISOString(),
  });
}
