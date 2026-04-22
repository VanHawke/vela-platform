// api/hygiene.js — Contacts hygiene stats for the Leads page panel
// GET /api/hygiene → { total, reachable, fresh, recent, stale, ancient, withEmail, withLinkedin, dnc }
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const { data, error } = await supabase.rpc('contacts_hygiene_stats');
    if (error) {
      // Fallback: query directly if RPC missing
      const { data: rows } = await supabase
        .from('contacts')
        .select('reachable, staleness_score, data')
        .limit(50000);
      const stats = { total: 0, reachable: 0, fresh: 0, recent: 0, stale: 0, ancient: 0, withEmail: 0, withLinkedin: 0, dnc: 0 };
      (rows || []).forEach(r => {
        stats.total++;
        if (r.reachable) stats.reachable++;
        if (r.staleness_score === 0) stats.fresh++;
        else if (r.staleness_score === 1) stats.recent++;
        else if (r.staleness_score === 2) stats.stale++;
        else stats.ancient++;
        if (r.data?.email) stats.withEmail++;
        if (r.data?.linkedin) stats.withLinkedin++;
        if (r.data?.dnc === true || r.data?.dnc === 'true') stats.dnc++;
      });
      return res.json(stats);
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
