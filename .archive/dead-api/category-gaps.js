// api/category-gaps.js — DETERMINISTIC category gap analysis.
// No LLM involvement. Queries f1_partnerships + category_overlaps directly.
// Returns for each category: which teams have a partner, which don't, recommended target.
// This endpoint is what Kiko should redirect to when the user asks "what sector should
// we target" or "which categories are open for X team".

import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const team = (req.query?.team || req.body?.team || '').toLowerCase().trim();

    // Fetch all active partnerships with related_categories
    const partnerships = await sbFetch('f1_partnerships?select=team_id,partner_name,category_id,related_categories,tier&status=eq.active');
    // Fetch category overlaps (bidirectional neighbourhoods)
    const overlaps = await sbFetch('category_overlaps?select=primary_category,blocking_category');
    // Fetch category list
    const categories = await sbFetch('sponsor_categories?select=id,name&order=name.asc');
    // Fetch teams
    const teams = await sbFetch('f1_teams?select=id,name&order=name.asc');

    // Build bidirectional overlap map
    const overlapMap = new Map();
    for (const o of (overlaps || [])) {
      const a = o.primary_category, b = o.blocking_category;
      if (!a || !b) continue;
      if (!overlapMap.has(a)) overlapMap.set(a, new Set());
      if (!overlapMap.has(b)) overlapMap.set(b, new Set());
      overlapMap.get(a).add(b);
      overlapMap.get(b).add(a);
    }
    // A category's "blocking set" = itself + overlap neighbours
    const expandCategory = (catId) => {
      const set = new Set([catId]);
      for (const n of (overlapMap.get(catId) || [])) set.add(n);
      return set;
    };

    // For each category, compute which teams are BLOCKED (have a partner in the expanded set)
    const teamIds = (teams || []).map(t => t.id);
    const result = [];
    for (const cat of (categories || [])) {
      const expandedSet = expandCategory(cat.id);
      const blockedTeams = new Map(); // team_id -> [partner names]
      for (const p of (partnerships || [])) {
        if (!p.team_id || !p.partner_name) continue;
        // Check primary category
        const primary = p.category_id && expandedSet.has(p.category_id);
        // Check related_categories array
        const related = Array.isArray(p.related_categories)
          && p.related_categories.some(rc => expandedSet.has(rc));
        if (primary || related) {
          if (!blockedTeams.has(p.team_id)) blockedTeams.set(p.team_id, []);
          blockedTeams.get(p.team_id).push(p.partner_name);
        }
      }
      const openTeams = teamIds.filter(tid => !blockedTeams.has(tid));
      result.push({
        category_id: cat.id,
        category_name: cat.name,
        open_teams: openTeams,
        open_count: openTeams.length,
        blocked_teams: Array.from(blockedTeams.entries()).map(([tid, partners]) => ({ team_id: tid, partners })),
        recommended_team: openTeams[0] || null,
        urgency_score: openTeams.length === 0 ? 0 : (11 - openTeams.length),
      });
    }

    // Sort: highest urgency first (fewest open slots but at least 1)
    result.sort((a, b) => {
      if (a.open_count === 0 && b.open_count > 0) return 1;
      if (b.open_count === 0 && a.open_count > 0) return -1;
      return b.urgency_score - a.urgency_score;
    });

    // If team filter supplied, return only categories where that team is currently OPEN
    if (team) {
      const teamFiltered = result.filter(r => r.open_teams.includes(team));
      return res.status(200).json({
        team,
        open_categories: teamFiltered,
        total_open: teamFiltered.length,
      });
    }

    return res.status(200).json({
      categories: result,
      total_categories: result.length,
      summary: {
        high_urgency: result.filter(r => r.open_count > 0 && r.open_count <= 3).length,
        medium_urgency: result.filter(r => r.open_count >= 4 && r.open_count <= 6).length,
        low_urgency: result.filter(r => r.open_count >= 7).length,
        fully_saturated: result.filter(r => r.open_count === 0).length,
      },
    });
  } catch (err) {
    console.error('[category-gaps] error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
