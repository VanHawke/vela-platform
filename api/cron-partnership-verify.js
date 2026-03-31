// api/cron-partnership-verify.js — Weekly partnership verification via web search
// Runs Sundays 5am UTC. Picks 2 teams per run, web-searches their partner pages,
// marks verified partnerships as verified:true, flags expired ones.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat, logError } from './kiko-tools.js';

export const config = { maxDuration: 120 };
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const TEAMS = [
  { id: 'haas', name: 'Haas F1 Team' },
  { id: 'red_bull', name: 'Red Bull Racing' },
  { id: 'ferrari', name: 'Scuderia Ferrari' },
  { id: 'mclaren', name: 'McLaren F1 Team' },
  { id: 'mercedes', name: 'Mercedes-AMG F1' },
  { id: 'aston_martin', name: 'Aston Martin F1' },
  { id: 'alpine', name: 'Alpine F1 Team' },
  { id: 'williams', name: 'Williams Racing' },
  { id: 'racing_bulls', name: 'Racing Bulls' },
  { id: 'audi', name: 'Audi F1 Team' },
  { id: 'cadillac', name: 'Cadillac F1 Team' },
];

async function verifyTeam(team) {
  // Get current partnerships for this team
  const { data: current } = await supabase.from('f1_partnerships')
    .select('id, partner_name, category_id, tier, verified')
    .eq('team_id', team.id).eq('status', 'active');
  if (!current?.length) return { team: team.id, verified: 0, expired: 0, added: 0 };

  // Web search for current partners
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `Search for the CURRENT 2025-2026 F1 sponsors and partners for ${team.name}. Find their official partners page and list ALL current sponsors/partners.

For each partner provide: partner_name, category (one of: fintech, cloud, ai_data, cybersecurity, banking, energy, telecom, automotive, fashion, food_bev, watches, crypto, software, legal, hospitality, gaming, health, logistics, semiconductors, robotics), tier (title/principal/official/technical/partner/supplier).

Respond with ONLY a JSON array: [{"partner_name":"...","category":"...","tier":"..."}]`
    }],
  });

  let responseText = '';
  for (const block of res.content) {
    if (block.type === 'text') responseText += block.text;
  }
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return { team: team.id, error: 'No JSON in response' };

  let webPartners;
  try { webPartners = JSON.parse(jsonMatch[0]); } catch { return { team: team.id, error: 'JSON parse failed' }; }
  if (!Array.isArray(webPartners)) return { team: team.id, error: 'Not an array' };

  const webNames = new Set(webPartners.map(p => p.partner_name?.toLowerCase()).filter(Boolean));
  const now = new Date().toISOString();
  let verified = 0, expired = 0, added = 0;

  // Verify existing: if found in web results, mark verified. If not, flag.
  for (const p of current) {
    const nameLC = p.partner_name.toLowerCase();
    if (webNames.has(nameLC)) {
      await supabase.from('f1_partnerships').update({
        verified: true, last_verified_at: now, updated_at: now,
      }).eq('id', p.id);
      verified++;
    } else {
      // Not found — could be expired or just not listed. Mark unverified.
      await supabase.from('f1_partnerships').update({
        verified: false, updated_at: now,
      }).eq('id', p.id);
      expired++;
    }
  }

  // Add new partners found in web but not in DB
  const currentNames = new Set(current.map(p => p.partner_name.toLowerCase()));
  for (const wp of webPartners) {
    if (!wp.partner_name || currentNames.has(wp.partner_name.toLowerCase())) continue;
    await supabase.from('f1_partnerships').upsert({
      team_id: team.id, partner_name: wp.partner_name,
      category_id: wp.category || null, tier: wp.tier || 'partner',
      status: 'active', verified: true,
      last_verified_at: now, updated_at: now,
    }, { onConflict: 'team_id,partner_name' });
    added++;
  }

  return { team: team.id, existing: current.length, verified, expired, added };
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-partnership-verify', 'started');
  try {
    // Rotate 2 teams per run — full cycle every ~6 weeks
    const weekNum = Math.floor(Date.now() / (7 * 86400000));
    const offset = (weekNum * 2) % TEAMS.length;
    const teamsThisRun = [TEAMS[offset], TEAMS[(offset + 1) % TEAMS.length]];

    const results = [];
    for (const team of teamsThisRun) {
      console.log(`[PartnerVerify] Verifying ${team.name}...`);
      const r = await verifyTeam(team);
      results.push(r);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await cronHeartbeat('cron-partnership-verify', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: results.reduce((s, r) => s + (r.verified || 0) + (r.added || 0), 0),
    });
    return res.json({ ok: true, teams: teamsThisRun.map(t => t.name), results });
  } catch (err) {
    await cronHeartbeat('cron-partnership-verify', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-partnership-verify', err.message).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
