// api/partnership-matrix.js — F1 Partnership Matrix API
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
      if (matrix[p.team_id] && p.category_id) {
        matrix[p.team_id].categories[p.category_id].push(p);
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
    const { data: partnerships } = await supabase.from('f1_partnerships').select('team_id, category_id').eq('status', 'active');
    const filled = new Set((partnerships || []).map(p => `${p.team_id}:${p.category_id}`));
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
    return res.json({ ok: true, message: `${partner_name} added to ${team_id}` });
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
