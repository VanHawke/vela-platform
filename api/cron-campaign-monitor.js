// api/cron-campaign-monitor.js — Proactive campaign performance analysis
// Runs daily at 9 AM. Analyses open/click/reply/bounce rates across all campaigns.
// Creates actionable alerts with specific recommendations.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const start = Date.now();
  try {
    // Get all active campaigns
    const { data: sequences } = await supabase.from('kiko_sequences').select('id, name, created_at');
    if (!sequences?.length) return res.json({ ok: true, message: 'No campaigns' });

    const alerts = [];

    for (const seq of sequences) {
      // Get enrollment stats
      const { data: enrollments } = await supabase.from('kiko_sequence_enrollments')
        .select('id, status, contact_name, company')
        .eq('sequence_id', seq.id);
      const enrolled = enrollments?.length || 0;
      if (enrolled === 0) continue;

      // Get email stats
      const { data: emails } = await supabase.from('kiko_outreach_queue')
        .select('id, status, step_number, opens_count, clicks_count, reply_received_at, error, to_name, to_email, sent_at')
        .in('enrollment_id', enrollments.map(e => e.id));

      const sent = (emails || []).filter(e => e.status === 'sent');
      const failed = (emails || []).filter(e => e.status === 'failed');
      const opened = sent.filter(e => (e.opens_count || 0) > 0);
      const clicked = sent.filter(e => (e.clicks_count || 0) > 0);
      const replied = sent.filter(e => e.reply_received_at);

      const openRate = sent.length ? Math.round((opened.length / sent.length) * 100) : 0;
      const clickRate = sent.length ? Math.round((clicked.length / sent.length) * 100) : 0;
      const replyRate = sent.length ? Math.round((replied.length / sent.length) * 100) : 0;
      const failRate = (sent.length + failed.length) ? Math.round((failed.length / (sent.length + failed.length)) * 100) : 0;

      // Get LinkedIn stats
      const { data: linkedin } = await supabase.from('kiko_linkedin_queue')
        .select('status')
        .in('enrollment_id', enrollments.map(e => e.id));
      const liSent = (linkedin || []).filter(l => l.status === 'sent').length;
      const liAccepted = (linkedin || []).filter(l => l.status === 'accepted').length;
      const liRate = liSent ? Math.round((liAccepted / liSent) * 100) : 0;

      // Campaign age in days
      const ageDays = Math.floor((Date.now() - new Date(seq.created_at).getTime()) / 86400000);

      // ── ANALYSIS & RECOMMENDATIONS ──
      const insights = [];
      const recommendations = [];

      // Open rate analysis
      if (openRate >= 40) {
        insights.push(`✅ ${openRate}% open rate — subject lines are performing well`);
      } else if (openRate >= 20) {
        insights.push(`⚠️ ${openRate}% open rate — average, subject lines could improve`);
        recommendations.push('Test shorter, more specific subject lines. Try including the prospect company name.');
      } else if (sent.length > 20) {
        insights.push(`🔴 ${openRate}% open rate — emails may be landing in spam`);
        recommendations.push('Check SPF/DKIM/DMARC records. Reduce send volume. Warm up the domain. Test deliverability with mail-tester.com.');
      }

      // Click rate analysis
      if (clickRate >= 15) {
        insights.push(`✅ ${clickRate}% click rate — content is engaging`);
      } else if (clickRate >= 5) {
        insights.push(`⚠️ ${clickRate}% click rate — content could be more compelling`);
      }

      // Reply rate analysis
      if (replyRate === 0 && sent.length > 50 && ageDays > 7) {
        insights.push(`🔴 0% reply rate after ${sent.length} emails over ${ageDays} days`);
        if (openRate >= 40) {
          recommendations.push('High opens but zero replies = the CTA is too big. Stop asking for calls. Ask a simple question instead ("Is [category] something your team is exploring this year?"). Lower the commitment threshold.');
          recommendations.push('Try a different angle: instead of pitching the partnership, share a relevant insight about their industry + F1. Add value before asking for anything.');
        } else {
          recommendations.push('Low opens AND zero replies = deliverability or targeting issue. Verify email addresses. Check if emails are landing in spam.');
        }
      } else if (replyRate > 0 && replyRate < 3 && sent.length > 50) {
        insights.push(`⚠️ ${replyRate}% reply rate — below target of 3-5%`);
        recommendations.push('Review the email sequence for value proposition clarity. Are we leading with what THEY get, or what WE want?');
      } else if (replyRate >= 3) {
        insights.push(`✅ ${replyRate}% reply rate — on target`);
      }

      // Failure rate
      if (failRate > 20) {
        insights.push(`🔴 ${failRate}% email failure rate (${failed.length} failed)`);
        const mismatches = failed.filter(f => (f.error || '').includes('mismatch')).length;
        if (mismatches > 5) {
          recommendations.push(`${mismatches} name/email mismatches detected. The email enrichment pipeline returned wrong addresses for ~${Math.round(mismatches/failed.length*100)}% of contacts. Run a data quality audit on the contact list.`);
        }
      }

      // LinkedIn analysis
      if (liSent > 20 && liAccepted === 0 && ageDays > 7) {
        insights.push(`🔴 0% LinkedIn acceptance after ${liSent} invites over ${ageDays} days`);
        recommendations.push('Review the LinkedIn connection note. Keep it under 200 chars, reference something specific about the prospect. Generic notes get ignored.');
      } else if (liRate >= 20) {
        insights.push(`✅ ${liRate}% LinkedIn acceptance rate`);
      }

      // OOO detection
      const oooReplies = replied.filter(r => {
        const snippet = (r.reply_received_at || '').toLowerCase();
        return false; // We'd need to check reply_snippet
      });

      // Step progression analysis
      const steps = {};
      for (const e of sent) { steps[e.step_number] = (steps[e.step_number] || 0) + 1; }
      const stepKeys = Object.keys(steps).sort((a,b) => a-b);
      if (stepKeys.length > 1) {
        const dropoff = [];
        for (let i = 1; i < stepKeys.length; i++) {
          const prev = steps[stepKeys[i-1]];
          const curr = steps[stepKeys[i]];
          const drop = Math.round((1 - curr/prev) * 100);
          if (drop > 50) dropoff.push(`Step ${stepKeys[i-1]}→${stepKeys[i]}: ${drop}% drop`);
        }
        if (dropoff.length) {
          insights.push(`⚠️ High step dropoff: ${dropoff.join(', ')}`);
          recommendations.push('High dropoff between steps suggests contacts are being lost to failures or timing issues. Check the sequence step delays.');
        }
      }

      // Build the alert
      const severity = recommendations.length >= 3 ? 'high' : recommendations.length >= 1 ? 'medium' : 'low';
      const title = `Campaign Report: ${seq.name}`;
      const detail = [
        `📊 PERFORMANCE (${ageDays} days, ${enrolled} enrolled):`,
        `• Emails: ${sent.length} sent, ${openRate}% opened, ${clickRate}% clicked, ${replyRate}% replied`,
        `• LinkedIn: ${liSent} invites, ${liAccepted} accepted (${liRate}%)`,
        `• Failures: ${failed.length} (${failRate}%)`,
        '',
        '📋 INSIGHTS:',
        ...insights,
        '',
        recommendations.length ? '🎯 RECOMMENDATIONS:' : '✅ No action needed — campaign performing well.',
        ...recommendations.map((r, i) => `${i+1}. ${r}`),
      ].join('\n');

      // Only create alert if there are insights worth sharing
      if (insights.length > 0) {
        // Check if we already created this alert today
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase.from('kiko_alerts')
          .select('id')
          .eq('type', 'campaign_report')
          .eq('entity_name', seq.name)
          .gte('created_at', today)
          .limit(1);

        if (!existing?.length) {
          await supabase.from('kiko_alerts').insert({
            type: 'campaign_report',
            severity,
            title,
            detail,
            entity_type: 'campaign',
            entity_name: seq.name,
            dismissed: false,
            metadata: { openRate, clickRate, replyRate, failRate, liRate, sent: sent.length, enrolled, ageDays }
          });
          alerts.push({ campaign: seq.name, severity, openRate, clickRate, replyRate, recommendations: recommendations.length });
        }
      }
    }

    return res.json({ ok: true, alerts, duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[CampaignMonitor] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}