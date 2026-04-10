// api/activate-campaign.js — Explicit user action to flip a paused campaign to live.
//
// Required flow per Sunny's operating doctrine:
//   1. Build button creates sequence (paused) + drafts + sources companies
//   2. build-campaign-enroll adds top 8 as PAUSED enrollments
//   3. User opens sequence, reviews drafts, refines via feedback loop, sends test
//   4. User clicks "Activate Campaign" → calls THIS endpoint
//   5. Sequence flips is_active=true, all paused enrollments flip to active
//   6. next_send_at set to respect business hours (9am UK for now, timezone-aware later)
//
// No email sends until this endpoint is called. Zero chance of accidental launch.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { campaign_id, sequence_id } = req.body || {};
  const id = campaign_id || sequence_id;
  if (!id) return res.status(400).json({ error: 'campaign_id or sequence_id required' });

  try {
    // 1. Confirm sequence exists
    const { data: seq, error: seqErr } = await supabase
      .from('kiko_sequences')
      .select('id, name, is_active, steps')
      .eq('id', id)
      .single();
    if (seqErr || !seq) return res.status(404).json({ error: 'Campaign not found' });

    // 2. Sanity check — steps must have real content, not placeholders
    const steps = Array.isArray(seq.steps) ? seq.steps : [];
    if (steps.length === 0) {
      return res.status(400).json({ error: 'Campaign has no steps. Add at least one step before activating.' });
    }
    const blankSteps = steps.filter(s => {
      const body = s.template || s.body || '';
      return !body.trim() || body.trim().length < 20 || /to be customised|placeholder|intro — to be/i.test(body);
    });
    if (blankSteps.length > 0) {
      return res.status(400).json({
        error: 'Cannot activate — some steps have blank or placeholder content',
        blank_step_count: blankSteps.length,
        total_steps: steps.length,
        message: 'Use the "Ask Kiko to write this step" button and the refine loop to draft each step before activating.',
      });
    }

    // 3. Flip sequence to active
    const { error: updSeqErr } = await supabase
      .from('kiko_sequences')
      .update({ is_active: true })
      .eq('id', id);
    if (updSeqErr) throw updSeqErr;

    // 4. Flip all paused enrollments for this sequence to active
    // Schedule first send for 9am UK tomorrow (timezone-aware sender comes in Phase 5)
    const tomorrow9amUk = new Date();
    tomorrow9amUk.setUTCDate(tomorrow9amUk.getUTCDate() + 1);
    tomorrow9amUk.setUTCHours(8, 0, 0, 0);  // 9am UK = 8am UTC (BST handled by sender cron)
    const nextSendAt = tomorrow9amUk.toISOString();

    const { data: activated, error: enrErr } = await supabase
      .from('kiko_sequence_enrollments')
      .update({ status: 'active', next_send_at: nextSendAt })
      .eq('sequence_id', id)
      .eq('status', 'paused')
      .select('id, contact_email, company');
    if (enrErr) throw enrErr;

    return res.status(200).json({
      success: true,
      sequence_id: id,
      sequence_name: seq.name,
      sequence_activated: true,
      enrollments_activated: activated?.length || 0,
      first_send_at: nextSendAt,
      activated_companies: (activated || []).map(e => ({ company: e.company, email: e.contact_email })),
      message: `Campaign live. ${activated?.length || 0} enrollments will start sending at ${nextSendAt} (9am UK).`,
    });
  } catch (err) {
    console.error('[activate-campaign] error:', err);
    return res.status(500).json({ error: err.message || 'activation failed' });
  }
}
