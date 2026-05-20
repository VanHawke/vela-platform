// api/signal-evaluator.js — Real-time signal evaluation against goals
// Called by other crons when they detect a signal change (reply, bounce, metric shift).
// Uses Haiku (fast, cheap) to score: "Is this relevant to an active goal?"
// Only creates alerts for signals scoring >= 7.
// From π-BENCH: "proactivity requires continuous monitoring, not scheduled crons"
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

/**
 * Evaluate a signal against active goals.
 * @param {string} signal - Description of what happened
 * @param {string} source - Where it came from (gmail, campaign, news, linkedin)
 * @param {object} metadata - Additional context
 */
export async function evaluateSignal(signal, source, metadata = {}) {
  try {
    // Load active goals
    const { data: goals } = await supabase.from('kiko_goals')
      .select('title, priority').eq('status', 'active');
    if (!goals?.length) return { action: 'silent', reason: 'no goals' };

    // Load race context
    let raceContext = '';
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const calendar = JSON.parse(readFileSync(join(__dirname, 'data', 'race-calendars.json'), 'utf8'));
      const now = new Date();
      const allRaces = [
        ...(calendar.f1_2026 || []).map(r => ({ ...r, series: 'F1' })),
        ...(calendar.formula_e_2026 || []).map(r => ({ ...r, series: 'Formula E' })),
        ...(calendar.motogp_2026 || []).map(r => ({ ...r, series: 'MotoGP' })),
      ];
      const next = allRaces.filter(r => new Date(r.date) >= now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      if (next) {
        const days = Math.ceil((new Date(next.date) - now) / 86400000);
        raceContext = `Next race: [${next.series}] ${next.name} in ${next.location} (${days} days)`;
      }
    } catch {}

    const goalsText = goals.map(g => `[${g.priority}] ${g.title}`).join('\n');

    // Ask Haiku to score this signal
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: `You evaluate business signals for urgency. Score this signal 0-10 against these goals.

GOALS:
${goalsText}

RACE CONTEXT: ${raceContext}

SIGNAL [${source}]: ${signal}

RULES:
- Reply from a campaign prospect = ALWAYS 10
- Bounce = 5 (data quality, not urgent)
- Race within 3 days + unactioned prospects = 8
- News about a competitor deal = 7
- Routine metric = 2
- Score 0-6 = respond ONLY with: SILENT
- Score 7+ = respond with the score number, then a one-sentence alert starting with ⚡

Example responses:
SILENT
8 ⚡ Clio replied to the Alpine F1 campaign — first positive response, act immediately` }]
    });

    const result = resp.content[0]?.text?.trim() || 'SILENT';

    if (result === 'SILENT' || result.startsWith('SILENT')) {
      return { action: 'silent', signal, source };
    }

    // Extract score and message
    const scoreMatch = result.match(/^(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const message = result.replace(/^\d+\s*/, '').trim();

    if (score >= 7 && message.length > 5) {
      await supabase.from('kiko_alerts').insert({
        type: 'proactive_signal',
        severity: score >= 9 ? 'critical' : 'high',
        title: message.slice(0, 200),
        detail: `Signal: ${signal}\nSource: ${source}\nScore: ${score}/10\n\n${message}`,
        entity_type: source,
        entity_name: metadata.contact || metadata.company || source,
        dismissed: false,
        verified: source !== 'test',
        source: `signal-evaluator-${source}`,
      });
      console.log(`[SignalEvaluator] ALERT (${score}/10): ${message.slice(0, 80)}`);
      return { action: 'alerted', score, message, signal, source };
    }

    return { action: 'silent', score, signal, source };
  } catch (err) {
    console.error('[SignalEvaluator] Error:', err.message);
    return { action: 'error', error: err.message };
  }
}

// HTTP handler for direct calls
export default async function handler(req, res) {
  const { signal, source, metadata } = req.body || {};
  if (!signal) return res.status(400).json({ error: 'signal required' });
  const result = await evaluateSignal(signal, source || 'unknown', metadata || {});
  return res.json(result);
}
