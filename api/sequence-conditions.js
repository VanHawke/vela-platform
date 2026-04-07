// api/sequence-conditions.js — CRUD for kiko_sequence_conditions
// Used by SequenceDetail.jsx Conditions UI to add/edit/delete trigger rules.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { sequence_id } = req.query;
      if (!sequence_id) return res.status(400).json({ error: 'sequence_id required' });
      const { data, error } = await supabase
        .from('kiko_sequence_conditions')
        .select('*')
        .eq('sequence_id', sequence_id)
        .order('step_number', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ conditions: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body;
      const row = {
        sequence_id: body.sequence_id,
        step_number: parseInt(body.step_number),
        condition_type: body.condition_type,
        operator: body.operator || 'is',
        value: body.value || null,
        reference_step: body.reference_step ? parseInt(body.reference_step) : null,
        true_next_step: body.true_next_step ? parseInt(body.true_next_step) : null,
        false_next_step: body.false_next_step ? parseInt(body.false_next_step) : null,
        wait_hours: body.wait_hours ? parseInt(body.wait_hours) : 0,
        org_id: ORG_ID,
      };
      const { data, error } = await supabase
        .from('kiko_sequence_conditions')
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ condition: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('kiko_sequence_conditions').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase
        .from('kiko_sequence_conditions')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ condition: data });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
