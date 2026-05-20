// api/cron-race-week-intel.js — Race calendar + strategic outreach intelligence
// Runs daily at 7 AM. Checks if a race is within 7 days. If so, generates
// market-specific prospect intelligence and outreach recommendations.
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

// Load the hardcoded race calendar — F1, Formula E, MotoGP
function getUpcomingRaces() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const calendarPath = join(__dirname, 'data', 'race-calendars.json');
  const calendar = JSON.parse(readFileSync(calendarPath, 'utf8'));
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  const allRaces = [
    ...(calendar.f1_2026 || []).map(r => ({ ...r, series: 'F1' })),
    ...(calendar.formula_e_2026 || []).map(r => ({ ...r, series: 'Formula E' })),
    ...(calendar.motogp_2026 || []).map(r => ({ ...r, series: 'MotoGP' })),
  ];
  
  return allRaces
    .filter(r => new Date(r.date) >= new Date(todayStr))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
}

export default async function handler(req, res) {
  try {
    // Step 1: Get upcoming races from hardcoded calendar
    const races = getUpcomingRaces();

    if (!races.length) {
      return res.json({ ok: true, message: 'No upcoming races in calendar', races: [] });
    }

    console.log(`[RaceWeekIntel] Next races:`, races.map(r => `${r.name} (${r.date})`).join(', '));

    const alerts = [];
    const now = new Date();

    for (const race of races) {
      const raceDate = new Date(race.date);
      const daysUntil = Math.ceil((raceDate - now) / 86400000);

      // Only process races within 10 days
      if (daysUntil > 10 || daysUntil < -1) continue;

      // Check if we already created an alert for this race
      const { data: existing } = await supabase.from('kiko_alerts')
        .select('id')
        .eq('type', 'race_week_intel')
        .eq('entity_name', race.name)
        .eq('dismissed', false)
        .limit(1);
      if (existing?.length) continue;

      // Step 2: Get all active campaign prospects
      const { data: enrollments } = await supabase.from('kiko_sequence_enrollments')
        .select('contact_name, contact_email, company')
        .eq('status', 'active');

      // Step 3: Use Claude to generate strategic race-week intelligence
      const companyList = (enrollments || []).map(e => `${e.contact_name} — ${e.company}`).join('\n');

      const intelResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `You are Kiko, a Formula One sponsorship intelligence system for Van Hawke Group.

CONTEXT: The ${race.name} takes place in ${race.location} on ${race.date} (${daysUntil} days from now).

ACTIVE CAMPAIGN PROSPECTS (Alpine F1 — Legal AI category):
${companyList}

TASK: Generate race-week strategic intelligence. For each section below, search the web for current information:

1. MARKET ANALYSIS: What is ${race.location}'s significance for the legal AI / enterprise tech sector? Which companies on the prospect list have offices, customers, or strategic interest in this market?

2. PROSPECT PRIORITISATION: Which 3-5 prospects should receive race-week outreach? Consider: headquarters location, market presence in ${race.location.split(',')[1]?.trim() || race.location}, company stage, and timing signals.

3. OUTREACH ANGLES: For each prioritised prospect, suggest a specific race-week angle (e.g., "With the ${race.name} this weekend and [company]'s strong [market] presence, the timing aligns for a conversation about category positioning").

4. COMPETITOR WATCH: Are any competing legal AI / enterprise tech companies activating at this race? Any new sponsorship announcements?

5. TIMING RECOMMENDATION: When should outreach go out this week for maximum impact — before, during, or after the race?

Be specific. Use real data. This is for a senior commercial advisor, not a marketing intern.` }]
      });

      let intel = '';
      for (const block of intelResp.content) {
        if (block.type === 'text') intel += block.text;
      }

      if (intel.length > 100) {
        const severity = daysUntil <= 3 ? 'critical' : daysUntil <= 7 ? 'high' : 'medium';
        await supabase.from('kiko_alerts').insert({
          type: 'race_week_intel',
          severity,
          title: `🏎️ ${race.name} — ${daysUntil} days away | Outreach window open`,
          detail: intel,
          entity_type: 'race_week',
          entity_name: race.name,
          dismissed: false,
          metadata: { race_date: race.date, location: race.location, days_until: daysUntil, prospects_analysed: enrollments?.length || 0 }
        });
        alerts.push({ race: race.name, daysUntil, severity });
        console.log(`[RaceWeekIntel] Created alert for ${race.name} (${daysUntil} days away)`);
      }
    }

    return res.json({ ok: true, races, alerts, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[RaceWeekIntel] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}