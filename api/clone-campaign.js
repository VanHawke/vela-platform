// api/clone-campaign.js — Duplicate an existing kiko_sequence as a new draft
// Sunny spec 2026-04-12 v0.0.39: clones the sequence + its targets so the user
// can iterate on a copy without disturbing the original. The clone:
//  - is_active=false (must be manually activated)
//  - name = "<original> (Copy)"
//  - copies all sequence steps verbatim
//  - copies campaign_targets with enrollment_status='sourced' (re-enrol from scratch)
//
// POST { sequence_id }
// Returns: { ok, new_sequence_id, target_count }

import { sbFetch } from './kiko-tools.js';


function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { sequence_id } = req.body || {};
    if (!isUuid(sequence_id)) return res.status(400).json({ error: 'invalid sequence_id' });

    // 1. Fetch original sequence
    const seqRows = await sbFetch(`kiko_sequences?id=eq.${sequence_id}&select=*`);
    if (!Array.isArray(seqRows) || seqRows.length === 0) {
      return res.status(404).json({ error: 'sequence not found' });
    }
    const original = seqRows[0];

    // 2. Insert a new sequence as a copy
    const { id: _omitId, created_at: _omitCreated, updated_at: _omitUpdated, ...rest } = original;
    const cloneData = {
      ...rest,
      name: `${original.name} (Copy)`,
      is_active: false,
      description: `${original.description || ''}\n\nCloned from sequence ${sequence_id} at ${new Date().toISOString()}`.trim(),
    };

    const newSeqRows = await sbFetch('kiko_sequences', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(cloneData),
    });
    if (!Array.isArray(newSeqRows) || newSeqRows.length === 0) {
      return res.status(500).json({ error: 'failed to insert clone' });
    }
    const newSeq = newSeqRows[0];

    // 3. Fetch original campaign_targets
    const targetRows = await sbFetch(
      `campaign_targets?campaign_id=eq.${sequence_id}&select=*&limit=1000`
    );

    let inserted_target_count = 0;
    if (Array.isArray(targetRows) && targetRows.length > 0) {
      // Reset targets for the clone: new campaign_id, new id, sourced status, no enrollment ts
      const cloneTargets = targetRows.map(t => {
        const { id: _tid, created_at: _tc, updated_at: _tu, enrolled_at: _te, ...trest } = t;
        return {
          ...trest,
          campaign_id: newSeq.id,
          enrollment_status: 'sourced',
        };
      });

      // Chunk inserts in 50s
      for (let i = 0; i < cloneTargets.length; i += 50) {
        const chunk = cloneTargets.slice(i, i + 50);
        try {
          const ins = await sbFetch('campaign_targets', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(chunk),
          });
          if (Array.isArray(ins)) inserted_target_count += ins.length;
        } catch (chunkErr) {
          console.warn('[clone-campaign] chunk insert failed:', chunkErr?.message);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      new_sequence_id: newSeq.id,
      new_sequence_name: newSeq.name,
      target_count: inserted_target_count,
      original_target_count: targetRows?.length || 0,
    });
  } catch (err) {
    console.error('[clone-campaign] error:', err);
    return res.status(500).json({ error: err?.message || 'unknown' });
  }
}
