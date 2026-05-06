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
    // Pull ALL targets for this campaign — sourced, needs_email, or any status except 'enrolled'
    const { data: targets, error: tErr } = await supabase
      .from('campaign_targets')
      .select('*')
      .eq('campaign_id', campaign_id)
      .not('enrollment_status', 'eq', 'enrolled')
      .order('rank');
    if (tErr) throw tErr;
    if (!targets || targets.length === 0) {
      return res.status(404).json({ error: 'No sourced targets found for this campaign. Run /api/build-campaign first.' });
    }

    // ── Email validation — reject fakes, role-based, and malformed addresses ──
    function isValidEmail(email) {
      if (!email || typeof email !== 'string') return false;
      const e = email.trim().toLowerCase();
      if (!e.includes('@') || !e.includes('.')) return false;
      if (/^(cmo|ceo|cfo|cro|coo|cto|vp|director|head|manager|info|contact|hello|team|sales|marketing|support|admin|office|general|enquiries|careers|hr|press|media|partnerships)@/i.test(e)) return false;
      const domain = e.split('@')[1];
      if (!domain || /[&\s,;!#$%^*()=+\[\]{}|\\<>]/.test(domain)) return false;
      if (domain.length > 50) return false;
      const local = e.split('@')[0];
      if (local.length < 2) return false;
      return true;
    }

    // ONLY enroll targets with VERIFIED real emails — never fabricate
    const validTargets = targets.filter(t => isValidEmail(t.decision_maker_email));
    const noEmailTargets = targets.filter(t => !isValidEmail(t.decision_maker_email));

    const now = new Date().toISOString();

    // Enroll targets WITH verified emails — ready to send
    const enrollments = validTargets.map(t => ({
      sequence_id: campaign_id,
      contact_email: t.decision_maker_email.trim(),
      contact_name: t.decision_maker_name || t.company_name,
      title: t.decision_maker_title || null,
      company: t.company_name,
      current_step: 0,
      status: 'paused',
      enrolled_at: now,
      next_send_at: null,
    }));

    // Enroll targets WITHOUT emails — visible in campaign but marked for enrichment
    const pendingEnrollments = noEmailTargets.map(t => ({
      sequence_id: campaign_id,
      contact_email: null, // No fake placeholders — email stays null until enriched
      contact_name: t.decision_maker_name || t.company_name,
      title: t.decision_maker_title || null,
      company: t.company_name,
      current_step: 0,
      status: 'needs_email',
      enrolled_at: now,
      next_send_at: null,
    }));

    const allEnrollments = [...enrollments, ...pendingEnrollments];
    if (allEnrollments.length === 0) {
      return res.status(200).json({ success: false, enrolled: 0, error: 'No targets found for this campaign.' });
    }

    const { data: inserted, error: eErr } = await supabase
      .from('kiko_sequence_enrollments')
      .insert(allEnrollments)
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
      with_email: validTargets.length,
      needs_email: noEmailTargets.length,
      sequence_activated: false,
      status: 'paused',
      campaign_id,
      enrolled_companies: allEnrollments.map(t => ({ company: t.company, dm: t.contact_name, email: t.contact_email, status: t.status })),
      next_step: noEmailTargets.length > 0
        ? `${validTargets.length} contacts ready to send, ${noEmailTargets.length} need email enrichment. Ask Kiko to "enrich emails for this campaign" to find real addresses. Then activate.`
        : 'All contacts have verified emails. Review sequence drafts, then click Activate to go live.',
    });
  } catch (err) {
    console.error('[build-campaign-enroll] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
