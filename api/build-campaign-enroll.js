// api/build-campaign-enroll.js
// Companion to build-campaign. Takes a sequence_id and enrolls all sourced targets.
// Separate endpoint so the user reviews before activation.

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 120 };

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { campaign_id } = req.body || {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

  try {
    // Pull ALL sourced targets for this campaign (no cap — Sunny's spec).
    // Volume is fine because cron-sequence-sender staggers sends per-contact timezone
    // across business hours, not all at once. Whatever volume is sourced gets enrolled.
    const { data: targets, error: tErr } = await supabase
      .from('campaign_targets')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('enrollment_status', 'sourced')
      .order('rank');
    if (tErr) throw tErr;
    if (!targets || targets.length === 0) {
      return res.status(404).json({ error: 'No sourced targets found for this campaign. Run /api/build-campaign first.' });
    }

    // Insert into kiko_sequence_enrollments — one row per target
    // PAUSED BY DEFAULT — user must explicitly activate via /api/activate-campaign
    // after reviewing drafts and sending a test email.
    // This was the bug Sunny hit: campaigns were going live immediately after build.
    const now = new Date().toISOString();
    const enrollments = targets.map(t => ({
      sequence_id: campaign_id,
      contact_email: t.decision_maker_email || `${(t.decision_maker_name || 'unknown').toLowerCase().replace(/\s+/g, '.')}@${(t.company_name || 'unknown').toLowerCase().replace(/\s+/g, '')}.com`,
      contact_name: t.decision_maker_name || t.company_name,
      title: t.decision_maker_title || null,  // Title from sourcing — surfaces on Campaigns page
      company: t.company_name,
      current_step: 0,
      status: 'paused',  // PAUSED — will flip to 'active' on explicit user activation
      enrolled_at: now,
      next_send_at: null,  // No send scheduled until activation
    }));

    const { data: inserted, error: eErr } = await supabase
      .from('kiko_sequence_enrollments')
      .insert(enrollments)
      .select();
    if (eErr) throw eErr;

    // Update the targets to mark them enrolled (but not yet live)
    const targetIds = targets.map(t => t.id);
    await supabase
      .from('campaign_targets')
      .update({ enrollment_status: 'enrolled', enrolled_at: now })
      .in('id', targetIds);

    // DO NOT activate the sequence — stays is_active=false until explicit user activation
    // await supabase.from('kiko_sequences').update({ is_active: true }).eq('id', campaign_id);

    return res.status(200).json({
      success: true,
      enrolled: inserted?.length || 0,
      sequence_activated: false,  // Paused — user must explicitly activate
      status: 'paused',
      campaign_id,
      enrolled_companies: targets.map(t => ({ rank: t.rank, company: t.company_name, dm: t.decision_maker_name })),
      next_step: 'Review sequence drafts, refine messaging, send test email to yourself, then click Activate to go live.',
    });
  } catch (err) {
    console.error('[build-campaign-enroll] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
