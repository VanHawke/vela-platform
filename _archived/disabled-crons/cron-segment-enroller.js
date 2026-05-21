// api/cron-segment-enroller.js — Daily 7am MF auto-enrollment
// For each segment with auto_enroll=true and a sequence_id, finds matching
// contacts not already enrolled in that sequence and enrolls them.
import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat, logError } from './kiko-tools.js';
import { matchSegment } from './segments.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-segment-enroller', 'started');
  try {
    const { data: segments } = await supabase
      .from('kiko_lead_segments')
      .select('*')
      .eq('auto_enroll', true)
      .not('sequence_id', 'is', null);

    const safe = Array.isArray(segments) ? segments : [];
    let totalEnrolled = 0;
    const results = [];

    for (const segment of safe) {
      try {
        const matches = await matchSegment(segment.criteria, 5000, parseFloat(segment.min_score) || 0);
        if (matches.length === 0) {
          await supabase.from('kiko_lead_segments').update({
            last_run_at: new Date().toISOString(),
            last_match_count: 0,
          }).eq('id', segment.id);
          results.push({ segment: segment.name, matched: 0, enrolled: 0 });
          continue;
        }

        // Check which contacts are already enrolled in this sequence
        const matchEmails = matches.map(c => c.data?.email).filter(Boolean);
        const { data: existing } = await supabase
          .from('kiko_sequence_enrollments')
          .select('contact_email')
          .eq('sequence_id', segment.sequence_id)
          .in('contact_email', matchEmails);

        const existingSet = new Set((existing || []).map(e => e.contact_email));
        const newMatches = matches.filter(c => c.data?.email && !existingSet.has(c.data.email));

        if (newMatches.length === 0) {
          await supabase.from('kiko_lead_segments').update({
            last_run_at: new Date().toISOString(),
            last_match_count: matches.length,
          }).eq('id', segment.id);
          results.push({ segment: segment.name, matched: matches.length, enrolled: 0 });
          continue;
        }

        // Enroll the new matches
        const enrollmentRows = newMatches.map(c => ({
          sequence_id: segment.sequence_id,
          contact_email: c.data?.email,
          contact_name: c.data?.name || c.data?.first_name || '',
          company: c.data?.company || c.company_data?.name || '',
          status: 'active',
          current_step: 1,
          next_send_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1hr from now
          enrolled_via: 'segment',
          source_segment_id: segment.id,
          org_id: ORG_ID,
        }));

        const { error: insErr } = await supabase.from('kiko_sequence_enrollments').insert(enrollmentRows);
        if (insErr) {
          console.error(`[SegmentEnroller] Insert failed for ${segment.name}:`, insErr.message);
          results.push({ segment: segment.name, matched: matches.length, enrolled: 0, error: insErr.message });
          continue;
        }

        await supabase.from('kiko_lead_segments').update({
          last_run_at: new Date().toISOString(),
          last_match_count: matches.length,
          total_enrolled: (segment.total_enrolled || 0) + newMatches.length,
        }).eq('id', segment.id);

        // Create alert
        await supabase.from('kiko_alerts').insert({
          type: 'segment_enrollment',
          severity: 'medium',
          title: `${newMatches.length} leads auto-enrolled: ${segment.name}`,
          detail: `Segment "${segment.name}" matched ${matches.length} contacts; ${newMatches.length} new leads enrolled into sequence.`,
          entity_type: 'segment',
          entity_name: segment.name,
          metadata: { segment_id: segment.id, sequence_id: segment.sequence_id, matched: matches.length, enrolled: newMatches.length },
        });

        totalEnrolled += newMatches.length;
        results.push({ segment: segment.name, matched: matches.length, enrolled: newMatches.length });
      } catch (segErr) {
        console.error(`[SegmentEnroller] Segment ${segment.name} failed:`, segErr.message);
        results.push({ segment: segment.name, error: segErr.message });
      }
    }

    await cronHeartbeat('cron-segment-enroller', 'finished', {
      heartbeatId: __hbId,
      durationMs: Date.now() - __hbStart,
      recordsProcessed: totalEnrolled,
    });
    return res.status(200).json({ ok: true, segments: safe.length, total_enrolled: totalEnrolled, results });
  } catch (err) {
    console.error('[SegmentEnroller] Fatal:', err.message);
    await cronHeartbeat('cron-segment-enroller', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-segment-enroller', err.message).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
