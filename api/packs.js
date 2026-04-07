// api/packs.js — Vertical Pack CRUD + active pack resolver
// Layer 3 of Kiko architecture. Used by every other module to determine
// "which pack am I working under?" before applying any industry logic.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';
const SUNNY_USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

// Helper used by other modules to resolve the active pack for a user.
// Falls back to the org's only active pack if no assignment exists.
export async function getActivePack(userId = SUNNY_USER_ID) {
  // Try assignment first
  const { data: assignment } = await supabase
    .from('kiko_pack_assignments')
    .select('pack_id, kiko_vertical_packs!inner(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignment?.kiko_vertical_packs) return assignment.kiko_vertical_packs;
  // Fallback: any active pack in org
  const { data: pack } = await supabase
    .from('kiko_vertical_packs')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return pack;
}


export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const action = req.query.action || 'list';

      if (action === 'list') {
        const { data, error } = await supabase
          .from('kiko_vertical_packs')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ packs: data || [] });
      }

      if (action === 'active') {
        const userId = req.query.user_id || SUNNY_USER_ID;
        const pack = await getActivePack(userId);
        if (!pack) return res.status(404).json({ error: 'No active pack' });
        // Hydrate sectors from normalised table for consistency
        const { data: sectors } = await supabase
          .from('kiko_sector_definitions')
          .select('*')
          .eq('pack_id', pack.id)
          .order('priority', { ascending: true });
        return res.status(200).json({ pack, sectors: sectors || [] });
      }

      if (action === 'sectors') {
        const { pack_id } = req.query;
        if (!pack_id) return res.status(400).json({ error: 'pack_id required' });
        const { data, error } = await supabase
          .from('kiko_sector_definitions')
          .select('*')
          .eq('pack_id', pack_id)
          .order('priority', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ sectors: data || [] });
      }

      return res.status(400).json({ error: 'invalid action' });
    }

    if (req.method === 'PATCH') {
      // Update an existing pack (weights, sectors, framework, etc)
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from('kiko_vertical_packs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ pack: data });
    }

    if (req.method === 'POST') {
      const action = req.query.action || 'assign';
      if (action === 'assign') {
        // Switch the active pack for a user
        const { user_id, pack_id } = req.body;
        // Deactivate all current assignments for this user
        await supabase.from('kiko_pack_assignments').update({ is_active: false }).eq('user_id', user_id || SUNNY_USER_ID);
        // Activate the new one (upsert)
        const { data, error } = await supabase
          .from('kiko_pack_assignments')
          .upsert({ user_id: user_id || SUNNY_USER_ID, pack_id, is_active: true, org_id: ORG_ID }, { onConflict: 'user_id,pack_id' })
          .select()
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ assignment: data });
      }
      return res.status(400).json({ error: 'invalid action' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[Packs] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
