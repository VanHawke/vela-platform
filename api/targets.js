// api/targets.js — Ranked targets API
// Reads from kiko_company_scores joined with companies for the Targets page.
// Filters by tier (priority/outreach/below) and sector.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const tier = req.query.tier || 'all'; // all | priority | outreach | below
    const sector = req.query.sector || null;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    // Get active pack to resolve thresholds
    const { data: pack } = await supabase
      .from('kiko_vertical_packs')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!pack) return res.status(404).json({ error: 'no active pack' });

    const { data: thresholds } = await supabase
      .from('kiko_scoring_thresholds')
      .select('threshold_name, min_score')
      .eq('pack_id', pack.id);
    const thrMap = Object.fromEntries((thresholds || []).map(t => [t.threshold_name, parseFloat(t.min_score)]));
    const outreachMin = thrMap.outreach_min || 65;
    const priorityMin = thrMap.priority_alert || 85;

    let query = supabase
      .from('kiko_company_scores')
      .select('*')
      .eq('pack_id', pack.id)
      .order('composite_score', { ascending: false })
      .limit(limit);

    if (tier === 'priority') query = query.gte('composite_score', priorityMin);
    else if (tier === 'outreach') query = query.gte('composite_score', outreachMin).lt('composite_score', priorityMin);
    else if (tier === 'below') query = query.lt('composite_score', outreachMin);
    if (sector) query = query.eq('matched_sector_id', sector);

    const { data: scores, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Hydrate company data
    const ids = (scores || []).map(s => s.company_id);
    const { data: companies } = await supabase
      .from('companies')
      .select('id, data')
      .in('id', ids);
    const cmap = Object.fromEntries((companies || []).map(c => [c.id, c.data || {}]));

    const enriched = (scores || []).map(s => ({
      ...s,
      company: cmap[s.company_id] || {},
      tier: s.composite_score >= priorityMin ? 'priority' : s.composite_score >= outreachMin ? 'outreach' : 'below',
    }));

    return res.status(200).json({ targets: enriched, thresholds: { outreachMin, priorityMin }, total: enriched.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
