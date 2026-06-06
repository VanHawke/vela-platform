// api/cron-heartbeat.js — Lightweight proactive signal check
// Runs every 2 hours during business hours (8 AM - 8 PM).
// Uses Haiku (fast, cheap) to evaluate: "Should I alert Sunny?"
// Only surfaces intelligence above a confidence threshold.
// From OpenClaw's heartbeat pattern + KnowU-Bench's "know when to be silent" principle.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const start = Date.now();
  try {
    // When did the last heartbeat run?
    const { data: lastBeat } = await supabase.from('kiko_cron_heartbeats')
      .select('started_at')
      .eq('cron_name', 'heartbeat')
      .order('started_at', { ascending: false })
      .limit(1);
    const since = lastBeat?.[0]?.started_at || new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Log this heartbeat
    await supabase.from('kiko_cron_heartbeats').insert({ cron_name: 'heartbeat', status: 'running', started_at: new Date().toISOString() });

    // Collect NEW signals since last heartbeat
    const [newAlerts, newReplies, newBounces, goals] = await Promise.all([
      supabase.from('kiko_alerts').select('type, title, severity, metadata')
        .gte('created_at', since).eq('dismissed', false)
        .not('type', 'in', '(proactive_heartbeat,morning_briefing)')
        .limit(10),
      supabase.from('kiko_email_tracking').select('recipient_name, company')
        .gte('replied_at', since).limit(5),
      supabase.from('kiko_email_tracking').select('recipient_name, company')
        .gte('bounced_at', since).limit(5),
      supabase.from('kiko_goals').select('title, priority')
        .eq('status', 'active').order('priority'),
    ]);

    const signalCount = (newAlerts.data?.length || 0) + (newReplies.data?.length || 0) + (newBounces.data?.length || 0);

    // If no new signals, stay SILENT (KnowU-Bench principle: know when not to intervene)
    if (signalCount === 0) {
      console.log(`[Heartbeat] No new signals since ${since}. Staying silent.`);
      return res.json({ ok: true, action: 'silent', signals: 0, duration_ms: Date.now() - start });
    }

    // Format signals for Haiku evaluation — EXCLUDE auto-created contacts (newsletters, personal emails, etc.)
    const realAlerts = (newAlerts.data || []).filter(a => {
      // Skip auto-created contacts — these are NOT prospect signals
      if (a.type === 'new_contact' && a.metadata?.auto_created) return false;
      return true;
    });
    
    const signalSummary = [
      ...(newReplies.data || []).map(r => `🟢 REPLY: ${r.recipient_name} (${r.company}) responded`),
      ...(newBounces.data || []).map(b => `🔴 BOUNCE: ${b.recipient_name} (${b.company})`),
      ...realAlerts.map(a => `[${a.severity}] ${a.title}`),
    ].join('\n');

    const goalsSummary = (goals.data || []).map(g => `[${g.priority}] ${g.title}`).join('\n');

    // Get race context
    let raceContext = 'No race data';
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const calendar = JSON.parse(readFileSync(join(__dirname, 'data', 'race-calendars.json'), 'utf8'));
      const now = new Date();
      const next = calendar.f1_2026.filter(r => new Date(r.date) >= now)[0];
      if (next) {
        const days = Math.ceil((new Date(next.date) - now) / 86400000);
        raceContext = `Next race: ${next.name} in ${next.location} (${days} days away)`;
      }
    } catch {} 

    // Ask Haiku: "Is this worth alerting Sunny about?"
    const evaluation = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Upgraded from Haiku — signal classification needs real reasoning
      max_tokens: 400,
      messages: [{ role: 'user', content: `You are Kiko, evaluating whether new signals require Sunny's immediate attention.

ACTIVE GOALS:
${goalsSummary}

RACE CONTEXT: ${raceContext}

NEW SIGNALS (last 2 hours):
${signalSummary}

RULES:
- Score each signal 0-10 for urgency against the goals
- Only respond if ANY signal scores 7+
- If nothing scores 7+, respond with exactly: SILENT
- If something scores 7+, respond with a 1-2 sentence alert starting with "⚡"
- Be extremely selective. Most signals are routine. Only interrupt for genuine urgency.
- A reply from a prospect is ALWAYS 7+ (it's the entire goal of the campaign)
- A "New contact" alert is NOT a prospect reply — it is an auto-created record from an inbound email and is almost always a newsletter, personal service, or spam. Score these 0. NEVER treat them as prospect engagement.
- Only REPLY signals (🟢 REPLY) count as genuine prospect engagement.
- A race within 3 days with unactioned prospects is 7+` }]
    });

    const response = evaluation.content[0]?.text?.trim() || 'SILENT';

    if (response === 'SILENT' || response.startsWith('SILENT')) {
      console.log(`[Heartbeat] ${signalCount} signals evaluated. Haiku says: stay silent.`);
      return res.json({ ok: true, action: 'silent', signals: signalCount, duration_ms: Date.now() - start });
    }

    // Create a proactive alert
    await supabase.from('kiko_alerts').insert({
      type: 'proactive_heartbeat',
      severity: 'high',
      title: '⚡ Kiko detected something important',
      detail: response,
      entity_type: 'heartbeat',
      entity_name: new Date().toISOString(),
      dismissed: false,
    });

    console.log(`[Heartbeat] ALERT created: ${response.slice(0, 80)}`);
    return res.json({ ok: true, action: 'alerted', signals: signalCount, message: response.slice(0, 100), duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[Heartbeat] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}