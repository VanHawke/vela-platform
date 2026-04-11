// api/kiko-voice.js — LIGHT endpoint for voice mode tool calls.
// Voice queries need to come back in < 3 seconds. The full /api/kiko endpoint
// loads classifier + sub-agents + intelligence layer + memory and takes 5-15s
// which is unusable for voice. This endpoint:
//   - Loads ONLY the bare facts the question needs (deals, tasks, weather)
//   - Skips the classifier
//   - Skips memory loading
//   - Returns plain text in one Claude Haiku call (fastest model)
//
// POST { query, userEmail }   →  { text: '<short answer>' }

import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const STAGE_PROB = { lead: 0.05, qualified: 0.15, meeting: 0.30, proposal: 0.50, negotiation: 0.70, won: 1.0, lost: 0 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { query, userEmail } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    // Build minimal context. NO heavy fetches unless query mentions the keyword.
    const lower = query.toLowerCase();
    const ctx = {};

    if (/deal|pipeline|prospect|client|sponsorship/.test(lower)) {
      const deals = await sbFetch('deals?select=data&data->>status=eq.active&limit=20');
      const list = (deals || []).slice(0, 10).map(d => {
        const data = d.data || {};
        return { company: data.company, stage: data.stage, value: data.value, contact: data.contactName };
      });
      ctx.deals = list;
      const totalWeighted = (deals || []).reduce((s, d) => {
        const data = d.data || {};
        return s + (data.value || 0) * (STAGE_PROB[data.stage] || 0.1);
      }, 0);
      ctx.pipeline_weighted_total = `$${(totalWeighted / 1000000).toFixed(1)}M`;
      ctx.active_deal_count = (deals || []).length;
    }

    if (/task|todo|to do|to-do|priorit/.test(lower)) {
      const tasks = await sbFetch('tasks?select=data&order=updated_at.desc&limit=20');
      ctx.tasks = (tasks || []).filter(t => !t.data?.completed).slice(0, 8).map(t => ({
        title: t.data?.notes || t.data?.title,
        company: t.data?.company,
        dueDate: t.data?.dueDate,
      }));
    }

    if (/weather|temperature|rain|forecast/.test(lower)) {
      // Simple Open-Meteo call for Weybridge UK (no API key needed)
      try {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.3676&longitude=-0.4535&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=Europe%2FLondon&forecast_days=3');
        if (r.ok) {
          const w = await r.json();
          ctx.weather = {
            now: `${Math.round(w.current?.temperature_2m)}°C`,
            today_high: `${Math.round(w.daily?.temperature_2m_max?.[0])}°C`,
            today_low: `${Math.round(w.daily?.temperature_2m_min?.[0])}°C`,
            today_rain: `${w.daily?.precipitation_probability_max?.[0]}%`,
            tomorrow_high: `${Math.round(w.daily?.temperature_2m_max?.[1])}°C`,
            tomorrow_low: `${Math.round(w.daily?.temperature_2m_min?.[1])}°C`,
            tomorrow_rain: `${w.daily?.precipitation_probability_max?.[1]}%`,
          };
        }
      } catch {}
    }

    if (/race|f1|formula|grand prix|gp\b/.test(lower)) {
      const races = await sbFetch('race_calendar?select=name,date,city&order=date.asc&limit=5');
      ctx.upcoming_races = (races || []).filter(r => new Date(r.date) > new Date()).slice(0, 3);
    }

    // One Haiku call for the answer
    const sysPrompt = `You are Kiko, Sunny Sidhu's AI assistant. Voice mode. Reply in 1-3 short sentences MAX. No preamble. No "let me check". Just the answer. If context is empty, say you don't have that info to hand.

CONTEXT:
${JSON.stringify(ctx, null, 2)}`;

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: sysPrompt,
      messages: [{ role: 'user', content: query }],
    });
    const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[kiko-voice] error:', err);
    return res.status(200).json({ text: `Sorry, I had trouble with that. ${err.message?.slice(0, 80) || ''}` });
  }
}
