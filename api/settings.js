// api/settings.js — User settings CRUD
// GET /api/settings?id=... — fetch settings by user_id
// PATCH /api/settings — update settings (body: { id, ...fields })

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const userId = req.query?.id;
    if (!userId) return res.status(400).json({ error: 'id required' });

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || {});
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required in body' });

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: id,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
