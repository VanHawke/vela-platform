// api/partnership-matrix.js — F1 Partnership Matrix API
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Category-conflict detection ───────────────────────────────────────────────
// When a partnership is CONFIRMED in a category, alert Sunny immediately if a LIVE
// campaign is running in that same (or an overlapping) category — the slot may now be
// taken at that team, so the campaign needs a pause/re-target decision. Adjacency comes
// from category_overlaps (e.g. ai_data blocks cloud), not exact match. Uses the standard
// one-pending-alert-per-pair guard, which re-raises naturally once a stale alert is dismissed.
export async function checkCategoryConflict({ team_id, partner_name, category_id }) {
  if (!category_id) return { conflicts: [] };
  // Expand the category through the overlap table (both directions + itself).
  const [{ data: ov1 }, { data: ov2 }] = await Promise.all([
    supabase.from('category_overlaps').select('blocking_category').eq('primary_category', category_id),
    supabase.from('category_overlaps').select('primary_category').eq('blocking_category', category_id),
  ]);
  const expanded = new Set([category_id, ...(ov1 || []).map(o => o.blocking_category), ...(ov2 || []).map(o => o.primary_category)].filter(Boolean));
  // Display names for the name fallback (legacy campaigns store their category only in their name).
  const { data: catRows } = await supabase.from('sponsor_categories').select('id, name').in('id', [...expanded]);
  const expandedNames = (catRows || []).map(c => (c.name || '').toLowerCase()).filter(Boolean);
  const triggerCatName = (catRows || []).find(c => c.id === category_id)?.name || category_id;
  // Live campaigns only (active and not archived).
  const { data: campaigns } = await supabase.from('kiko_sequences')
    .select('id, name, metadata, is_active, archived').eq('is_active', true);
  const matches = (campaigns || []).filter(c => {
    if (c.archived === true) return false;
    const metaCat = c.metadata?.category_id;
    const nameLc = (c.name || '').toLowerCase();
    return (metaCat && expanded.has(metaCat)) || expandedNames.some(n => n && nameLc.includes(n));
  });
  if (!matches.length) return { conflicts: [] };
  const { data: teamRow } = await supabase.from('f1_teams').select('name').eq('id', team_id).maybeSingle();
  const teamName = teamRow?.name || team_id;
  const pairEntity = `${team_id}:${partner_name}`;
  const fired = [];
  for (const c of matches) {
    // One pending alert per partnership+campaign pair; a dismissed one re-raises next time.
    const { data: existing } = await supabase.from('kiko_alerts')
      .select('id').eq('type', 'category_conflict').eq('entity_id', pairEntity)
      .eq('metadata->>campaign_id', c.id).eq('dismissed', false).limit(1);
    if (existing && existing.length) continue;
    await supabase.from('kiko_alerts').insert({
      type: 'category_conflict', severity: 'critical',
      title: `Category taken: ${partner_name} (${teamName}) collides with your live ${triggerCatName} campaign`,
      detail: `${partner_name} was just added as a ${triggerCatName} partner for ${teamName}. You have a live campaign "${c.name}" running in that category space. That slot may now be closed at ${teamName} — review and pause or re-target the campaign before sending more.`,
      entity_type: 'partnership', entity_id: pairEntity, entity_name: partner_name,
      metadata: { team_id, team_name: teamName, partner_name, category_id, campaign_id: c.id, campaign_name: c.name, action: 'pause_campaign' },
      dismissed: false,
    });
    fired.push(c.name);
  }
  return { conflicts: fired };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  const action = req.query?.action || req.body?.action;

  // GET MATRIX — full grid data
  if (action === 'matrix' || (!action && req.method === 'GET')) {
    const { data: teams } = await supabase.from('f1_teams').select('*').order('sort_order');
    const { data: categories } = await supabase.from('sponsor_categories').select('*').order('sort_order');
    const { data: partnerships } = await supabase.from('f1_partnerships').select('*').eq('status', 'active').order('tier');

    // Build matrix: team → category → partners
    const matrix = {};
    for (const team of (teams || [])) {
      matrix[team.id] = { team, categories: {} };
      for (const cat of (categories || [])) { matrix[team.id].categories[cat.id] = []; }
    }
    for (const p of (partnerships || [])) {
      if (!matrix[p.team_id]) continue;
      // Index under primary category_id
      if (p.category_id && matrix[p.team_id].categories[p.category_id]) {
        matrix[p.team_id].categories[p.category_id].push(p);
      }
      // ALSO index under related_categories — e.g. RebelDot is software but also cybersecurity
      // This is why Racing Bulls was incorrectly showing as "no cybersecurity partner"
      if (Array.isArray(p.related_categories)) {
        for (const rc of p.related_categories) {
          if (rc === p.category_id) continue;  // already added above
          if (matrix[p.team_id].categories[rc]) {
            matrix[p.team_id].categories[rc].push(p);
          }
        }
      }
    }

    // Gap analysis
    const gaps = {};
    for (const cat of (categories || [])) {
      const teamsWithout = (teams || []).filter(t => !matrix[t.id]?.categories[cat.id]?.length);
      if (teamsWithout.length > 0) gaps[cat.id] = { category: cat, teams: teamsWithout.map(t => t.name) };
    }

    return res.json({ teams, categories, partnerships, matrix, gaps, lastUpdated: new Date().toISOString() });
  }

  // GAPS — show empty category slots per team
  if (action === 'gaps') {
    const { data: teams } = await supabase.from('f1_teams').select('id, name').order('sort_order');
    const { data: categories } = await supabase.from('sponsor_categories').select('id, name').order('sort_order');
    const { data: partnerships } = await supabase.from('f1_partnerships').select('team_id, category_id, related_categories').eq('status', 'active');
    // Honor related_categories — a partner tagged as both software + cybersecurity fills BOTH slots
    const filled = new Set();
    for (const p of (partnerships || [])) {
      if (p.category_id) filled.add(`${p.team_id}:${p.category_id}`);
      if (Array.isArray(p.related_categories)) {
        for (const rc of p.related_categories) filled.add(`${p.team_id}:${rc}`);
      }
    }
    const gaps = [];
    for (const t of (teams || [])) {
      for (const c of (categories || [])) {
        if (!filled.has(`${t.id}:${c.id}`)) gaps.push({ team: t.name, teamId: t.id, category: c.name, categoryId: c.id });
      }
    }
    return res.json({ gaps, total: gaps.length });
  }

  // ADD — manual partnership entry
  if (action === 'add' && req.method === 'POST') {
    const { team_id, partner_name, category_id, tier, deal_value, notes } = req.body;
    if (!team_id || !partner_name) return res.status(400).json({ error: 'team_id and partner_name required' });
    const { data, error } = await supabase.from('f1_partnerships').upsert({
      team_id, partner_name, category_id: category_id || null,
      tier: tier || 'partner', deal_value, notes, status: 'active', verified: true,
      last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id,partner_name' });
    if (error) return res.status(500).json({ error: error.message });
    // Confirmed partnership (manual adds are verified) → check for live-campaign conflicts and alert.
    let conflictNote = '';
    try {
      const { conflicts } = await checkCategoryConflict({ team_id, partner_name, category_id });
      if (conflicts.length) conflictNote = ` Conflict alert raised: collides with live campaign(s) ${conflicts.join(', ')}.`;
    } catch (e) { console.error('[partnership-matrix] conflict check failed:', e.message); }
    return res.json({ ok: true, message: `${partner_name} added to ${team_id}.${conflictNote}` });
  }

  // REMOVE — remove a partnership
  if (action === 'remove' && req.method === 'POST') {
    const { id } = req.body;
    await supabase.from('f1_partnerships').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', id);
    return res.json({ ok: true });
  }

  // ACTIVITY — recent partnership changes from Kiko alerts
  if (action === 'activity') {
    const { data: alerts } = await supabase.from('kiko_alerts')
      .select('*')
      .eq('type', 'new_partnership')
      .order('created_at', { ascending: false })
      .limit(20);
    // Also get recently updated partnerships
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase.from('f1_partnerships')
      .select('team_id, partner_name, category_id, tier, updated_at, verified')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(20);
    return res.json({ alerts: alerts || [], recent: recent || [] });
  }

  // STATS — summary for dashboard widgets
  if (action === 'stats') {
    const { data: teams } = await supabase.from('f1_teams').select('id, name').order('sort_order');
    const { data: partnerships } = await supabase.from('f1_partnerships').select('team_id, category_id, tier').eq('status', 'active');
    const { data: categories } = await supabase.from('sponsor_categories').select('id, name');
    const byTeam = {};
    for (const t of (teams || [])) byTeam[t.id] = { name: t.name, count: 0, categories: new Set() };
    for (const p of (partnerships || [])) {
      if (byTeam[p.team_id]) { byTeam[p.team_id].count++; if (p.category_id) byTeam[p.team_id].categories.add(p.category_id); }
    }
    const totalGaps = Object.values(byTeam).reduce((a, t) => a + ((categories || []).length - t.categories.size), 0);
    return res.json({
      totalPartnerships: (partnerships || []).length,
      totalTeams: (teams || []).length,
      totalCategories: (categories || []).length,
      totalGaps,
      byTeam: Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, { ...v, categories: v.categories.size, gaps: (categories || []).length - v.categories.size }])),
    });
  }

  return res.status(400).json({ error: 'action required: matrix|gaps|add|remove|activity|stats' });
}
