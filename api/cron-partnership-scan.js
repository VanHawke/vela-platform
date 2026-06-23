// api/cron-partnership-scan.js — Fortnightly F1 partnership detection (HOLD-for-confirm)
// Registered WEEKLY in cron-scheduler but runs only on EVEN ISO weeks (effective fortnightly,
// deterministic, survives pm2 restarts — unlike a 14-day interval timer).
// Detects newly announced sponsors per team via web_search and lands them as UNVERIFIED
// pending rows (verified=false, status='pending'), then raises ONE info alert.
// It NEVER writes a confirmed partnership and NEVER fires a category-conflict alert.
// Confirmation on the Matrix page is what flips verified=true and runs the conflict check,
// so a web rumour can never pause a live campaign.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const VALID_CATS = ['banking','fintech','cybersecurity','cloud','ai_data','software','semiconductors','telecom','gaming','crypto','energy','automotive','hospitality','fashion','watches','food_bev','health','logistics','legal','robotics','whiskey'];

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}

export default async function handler(req, res) {
  // Fortnightly via ISO-week parity. ?force=1 runs it regardless (manual test / first run).
  const force = req.query?.force === '1' || req.body?.force === true;
  const wk = isoWeek();
  if (!force && wk % 2 !== 0) return res.json({ ok: true, skipped: 'off-week', isoWeek: wk });

  try {
    const { data: teams } = await supabase.from('f1_teams').select('id, name, full_name').order('sort_order');
    if (!teams?.length) return res.json({ ok: false, error: 'no teams' });

    const detected = [];
    for (const team of teams) {
      const teamName = team.full_name || team.name;
      let resp;
      try {
        resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `You are a Formula 1 sponsorship intelligence system. Search the web for sponsorship or partnership deals announced by the F1 team "${teamName}" in the LAST 14 DAYS ONLY. Only genuinely NEW announcements — not existing or historical partners.

For each new partnership, output an object with:
- "partner_name": the sponsor company name
- "category_id": the single best match from this exact list, or null if none fit: ${VALID_CATS.join(', ')}
- "source_url": the announcement URL
- "tier": "title", "principal", or "partner" if discernible, else "partner"

Respond with ONLY a raw JSON array, no markdown, no code fences, no prose. If nothing was announced in the last 14 days, respond with exactly []` }]
        });
      } catch (e) { console.error(`[partnership-scan] ${teamName} search failed: ${e.message}`); continue; }

      let text = '';
      for (const b of resp.content) if (b.type === 'text') text += b.text;
      let rows = [];
      try { const m = text.match(/\[[\s\S]*\]/); rows = m ? JSON.parse(m[0]) : []; } catch { rows = []; }

      for (const r of (Array.isArray(rows) ? rows : [])) {
        const partner = (r.partner_name || '').trim();
        if (!partner) continue;
        const cat = VALID_CATS.includes(r.category_id) ? r.category_id : null;
        // Idempotency: skip if ANY row (confirmed, pending, or rejected) already exists for team+partner,
        // so a re-scan never stacks a duplicate pending for the same announcement.
        const { data: exists } = await supabase.from('f1_partnerships')
          .select('id').eq('team_id', team.id).ilike('partner_name', partner).limit(1);
        if (exists?.length) continue;
        const { error } = await supabase.from('f1_partnerships').insert({
          team_id: team.id, partner_name: partner, category_id: cat,
          tier: ['title','principal','partner'].includes(r.tier) ? r.tier : 'partner',
          status: 'pending', verified: false,
          source_url: r.source_url || null,
          notes: `Auto-detected ${new Date().toISOString().split('T')[0]} via fortnightly scan. Unconfirmed — awaiting review.`,
          related_categories: cat ? [cat] : null,
          updated_at: new Date().toISOString(),
        });
        if (!error) detected.push({ team: teamName, partner, category: cat, source_url: r.source_url || null });
      }
    }

    // ONE info alert as the notification. Confirmation happens on the Matrix page, not here.
    if (detected.length) {
      await supabase.from('kiko_alerts').insert({
        type: 'partnerships_detected', severity: 'info',
        title: `${detected.length} new partnership${detected.length > 1 ? 's' : ''} detected — review on the Matrix`,
        detail: `The fortnightly scan found ${detected.length} newly announced partnership${detected.length > 1 ? 's' : ''} awaiting confirmation:\n` + detected.map(d => `• ${d.partner} (${d.team})${d.category ? ` — ${d.category}` : ''}`).join('\n') + `\n\nConfirm or reject each on the Partnership Matrix. Confirming a partnership runs the live-campaign conflict check.`,
        entity_type: 'partnership_scan', entity_name: 'fortnightly-scan',
        metadata: { count: detected.length, link: '/partnership-matrix', section: 'pending' },
        dismissed: false,
      });
    }

    return res.json({ ok: true, isoWeek: wk, detected: detected.length, items: detected });
  } catch (err) {
    console.error('[partnership-scan] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}
