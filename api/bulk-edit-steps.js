// api/bulk-edit-steps.js — Find/replace inside step content across multiple sequences
// Sunny spec 2026-04-12 v0.0.40 (deferred from 4c).
//
// Two operations:
//
// GET ?category=<id>
//   → list sequences in this category with their step counts (for picker UI)
//   Returns: { sequences: [{id, name, is_active, step_count, steps_preview: [...] }] }
//
// POST { sequence_ids: [uuid...], find: string, replace: string, fields: ['template','subject'] }
//   → for each sequence, walk steps[] and replace `find` with `replace`
//     in the specified fields. Returns count of changes per sequence.
//   Returns: { results: [{id, name, changes}], total_changes }
//
// Safety:
//   - Empty find string → 400
//   - find === replace → 400 (no-op)
//   - Validates each sequence_id is uuid
//   - Caps sequence_ids at 50

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function categoryNameKeyword(categoryId) {
  // Map slug → keyword for ilike. The kiko_sequences.name format is
  // "<Team> F1 - <Category Name>" e.g. "Haas F1 - Cybersecurity".
  const map = {
    banking: 'Banking', fintech: 'FinTech', cybersecurity: 'Cybersecurity',
    cloud: 'Cloud', ai_data: 'AI', software: 'Software',
    semiconductors: 'Semiconductor', telecom: 'Telecom', gaming: 'Gaming',
    crypto: 'Crypto', energy: 'Energy', automotive: 'Automotive',
    hospitality: 'Hospitality', fashion: 'Fashion', watches: 'Watches',
    food_bev: 'Food', health: 'Health', logistics: 'Logistics',
    legal: 'Legal', robotics: 'Robotics',
  };
  return map[categoryId] || categoryId;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const category = req.query?.category;
      if (!category) return res.status(400).json({ error: 'category required' });
      const keyword = categoryNameKeyword(category);
      const { data, error } = await supabase
        .from('kiko_sequences')
        .select('id, name, is_active, steps')
        .ilike('name', `%${keyword}%`)
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });

      const sequences = (data || []).map(seq => ({
        id: seq.id,
        name: seq.name,
        is_active: seq.is_active,
        step_count: Array.isArray(seq.steps) ? seq.steps.length : 0,
        steps_preview: (Array.isArray(seq.steps) ? seq.steps : []).slice(0, 3).map(s => ({
          channel: s.channel || s.type || 'unknown',
          subject: (s.subject || '').slice(0, 60),
          template_preview: (s.template || '').slice(0, 100),
        })),
      }));
      return res.status(200).json({ category, sequences });
    }

    if (req.method === 'POST') {
      const { sequence_ids, find, replace, fields } = req.body || {};
      if (!Array.isArray(sequence_ids) || sequence_ids.length === 0) {
        return res.status(400).json({ error: 'sequence_ids array required' });
      }
      if (sequence_ids.length > 50) {
        return res.status(400).json({ error: 'max 50 sequences per call' });
      }
      if (!sequence_ids.every(isUuid)) {
        return res.status(400).json({ error: 'all sequence_ids must be valid uuids' });
      }
      if (typeof find !== 'string' || find.length === 0) {
        return res.status(400).json({ error: 'find string required' });
      }
      if (typeof replace !== 'string') {
        return res.status(400).json({ error: 'replace string required (can be empty)' });
      }
      if (find === replace) {
        return res.status(400).json({ error: 'find and replace are identical (no-op)' });
      }
      const targetFields = Array.isArray(fields) && fields.length > 0
        ? fields.filter(f => ['template', 'subject'].includes(f))
        : ['template', 'subject'];

      // Fetch all sequences in one query
      const { data: seqs, error: fetchErr } = await supabase
        .from('kiko_sequences')
        .select('id, name, steps')
        .in('id', sequence_ids);
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });

      const results = [];
      let totalChanges = 0;

      for (const seq of (seqs || [])) {
        if (!Array.isArray(seq.steps)) {
          results.push({ id: seq.id, name: seq.name, changes: 0, skipped: 'no steps array' });
          continue;
        }
        let changes = 0;
        const newSteps = seq.steps.map(step => {
          const newStep = { ...step };
          for (const f of targetFields) {
            if (typeof newStep[f] === 'string' && newStep[f].includes(find)) {
              const occurrences = newStep[f].split(find).length - 1;
              newStep[f] = newStep[f].split(find).join(replace);
              changes += occurrences;
            }
          }
          // Walk yes_steps / no_steps for conditional steps too
          for (const branchKey of ['yes_steps', 'no_steps']) {
            if (Array.isArray(newStep[branchKey])) {
              newStep[branchKey] = newStep[branchKey].map(branchStep => {
                const nb = { ...branchStep };
                for (const f of targetFields) {
                  if (typeof nb[f] === 'string' && nb[f].includes(find)) {
                    const occurrences = nb[f].split(find).length - 1;
                    nb[f] = nb[f].split(find).join(replace);
                    changes += occurrences;
                  }
                }
                return nb;
              });
            }
          }
          return newStep;
        });

        if (changes > 0) {
          const { error: updErr } = await supabase
            .from('kiko_sequences')
            .update({ steps: newSteps, updated_at: new Date().toISOString() })
            .eq('id', seq.id);
          if (updErr) {
            results.push({ id: seq.id, name: seq.name, changes: 0, error: updErr.message });
            continue;
          }
        }
        results.push({ id: seq.id, name: seq.name, changes });
        totalChanges += changes;
      }

      return res.status(200).json({ ok: true, results, total_changes: totalChanges });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[bulk-edit-steps] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
