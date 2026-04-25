// api/cron-job-processor.js — Background job processor
// Picks up pending jobs from kiko_background_jobs, processes them, updates status
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-job-processor', 'started');

  try {
    // Get pending jobs (oldest first, max 3 per run)
    const jobs = await sbFetch('kiko_background_jobs?status=eq.queued&order=queued_at.asc&limit=3');
    if (!Array.isArray(jobs) || jobs.length === 0) {
      await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, processed: 0 });
    }

    let processed = 0;
    for (const job of jobs) {
      // Mark as processing
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing', started_at: new Date().toISOString() }) });

      try {
        if (job.job_type === 'source_companies_bg') {
          // Source prospects in background
          const params = job.params || {};
          const category = params.category || 'technology';
          const count = params.count || 15;
          const sequenceId = params.sequence_id;

          // Get the sequence details
          let campaignName = category;
          let targetPersona = `C-suite at ${category} companies`;
          if (sequenceId) {
            const seq = await sbFetch(`kiko_sequences?id=eq.${sequenceId}&limit=1`);
            if (seq?.[0]) { campaignName = seq[0].name || category; targetPersona = seq[0].target_persona || targetPersona; }
          }

          // Call source-prospects with timeout — it's an SSE endpoint so must abort after reasonable time
          const spRes = await fetch(`${process.env.HETZNER_URL || 'http://127.0.0.1:3000'}/api/source-prospects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignName, description: category, targetPersona, maxCompanies: Math.min(count, 20), contactsPerCompany: 2 }),
            signal: AbortSignal.timeout(180000), // 3 min max
          });

          // Read the SSE stream to get final results
          const text = await spRes.text();
          const lines = text.split('\n').filter(l => l.startsWith('data: '));
          const lastLine = lines[lines.length - 1];
          let result = {};
          try { result = JSON.parse(lastLine.replace('data: ', '')); } catch {}

          if (result.prospects?.length > 0 && sequenceId) {
            // Auto-enroll prospects into the campaign
            const existingEnrolls = await sbFetch(`kiko_sequence_enrollments?sequence_id=eq.${sequenceId}&select=contact_email`);
            const existingEmails = new Set((existingEnrolls || []).map(e => e.contact_email?.toLowerCase()).filter(Boolean));
            let enrolled = 0;
            for (const p of result.prospects) {
              if (existingEmails.has(p.email?.toLowerCase())) continue;
              await sbFetch('kiko_sequence_enrollments', { method: 'POST', body: JSON.stringify({
                sequence_id: sequenceId, contact_name: `${p.first_name} ${p.last_name}`,
                contact_email: p.email, company: p.company_name,
                linkedin_url: p.linkedin_url || '', status: 'active', current_step: 1,
                enrolled_at: new Date().toISOString(),
                email_verified: p.email_verified || false,
                email_confidence: p.email_confidence || 0,
                email_source: p.email_source || 'ai_generated',
              }) });
              enrolled++;
            }
            await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
              status: 'completed', finished_at: new Date().toISOString(),
              result: { prospects_found: result.prospects.length, enrolled, companies: result.companies?.length || 0 },
            }) });
          } else {
            await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
              status: 'completed', finished_at: new Date().toISOString(),
              result: { prospects_found: 0, message: 'No prospects found' },
            }) });
          }
        } else if (job.job_type === 'enrich_campaign_emails') {
          // Email enrichment for campaign contacts — runs cascade per contact
          const params = job.params || {};
          const contacts = params.contacts || [];
          const campaignId = params.campaign_id;
          const emailIntelUrl = 'http://127.0.0.1:3000/email-intel/find';
          const emailIntelAuth = process.env.KIKO_WORKER_SECRET || 'kiko-hetzner-2026-vanhawke';

          let found = 0, failed = 0;
          for (let i = 0; i < contacts.length; i++) {
            const c = contacts[i];
            await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
              progress_pct: Math.round(((i + 1) / contacts.length) * 100),
              progress_message: `Enriching ${i + 1}/${contacts.length}: ${c.name} at ${c.company}`,
            }) });

            try {
              const nameParts = (c.name || '').trim().split(/\s+/);
              if (nameParts.length < 2) { failed++; continue; }
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');
              let domain = c.domain;
              if (!domain) {
                domain = (c.company || '').toLowerCase().replace(/[&,.'"\-()]/g, '').replace(/\s+(inc|llc|ltd|plc|corp|co|group|holdings|international|global)$/i, '').replace(/\s+/g, '') + '.com';
              }

              const res = await fetch(emailIntelUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${emailIntelAuth}` },
                body: JSON.stringify({ firstName, lastName, company: c.company, domain }),
                signal: AbortSignal.timeout(35000),
              });
              const data = await res.json();

              // Validate the email before saving
              const isValid = data.ok && data.email && data.email.includes('@') && !data.email.includes('&') && !data.email.includes(',') && data.email.split('@')[1]?.length < 40;

              if (isValid) {
                // Update campaign_targets with the found email
                if (campaignId) {
                  await sbFetch(`campaign_targets?campaign_id=eq.${campaignId}&decision_maker_name=eq.${encodeURIComponent(c.name)}&rank=eq.${c.target_rank}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      decision_maker_email: data.email,
                      verification_status: data.verified ? 'verified' : (data.reason || 'pattern_matched'),
                      enrollment_status: 'sourced',
                    }),
                  });
                  // Also update enrollment if it exists
                  await sbFetch(`kiko_sequence_enrollments?sequence_id=eq.${campaignId}&company=eq.${encodeURIComponent(c.company)}&status=eq.needs_email`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      contact_email: data.email,
                      status: 'paused',
                    }),
                  });
                }
                found++;
              } else { failed++; }
            } catch { failed++; }
          }

          await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
            status: 'completed', finished_at: new Date().toISOString(), progress_pct: 100,
            progress_message: `Done: ${found} emails found, ${failed} not found`,
            result: { emails_found: found, emails_failed: failed, total: contacts.length },
          }) });
          // Alert the user
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
            type: 'job_complete', severity: 'medium',
            title: `✉️ Email enrichment complete: ${found}/${contacts.length} found`,
            detail: `Campaign email enrichment finished.\n${found} verified emails found, ${failed} not found.\nContacts with emails are ready to activate.`,
            entity_name: `${params.contacts?.[0]?.company || 'Campaign'} + ${contacts.length - 1} more`,
            user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
            dismissed: false, created_at: new Date().toISOString(),
          }) });

        } else if (job.job_type === 'generate_document') {
          // Document generation in background
          const params = job.params || {};
          await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ progress_message: 'Researching topic...', progress_pct: 20 }) });

          const baseUrl = process.env.HETZNER_URL || 'http://127.0.0.1:3000';
          const docRes = await fetch(`${baseUrl}/api/generate-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: params.topic, documentType: params.documentType || 'pdf', division: params.division || 'agency', purpose: params.purpose || 'report' }),
          });
          const data = await docRes.json();

          if (data.ok) {
            const publicUrl = `https://api.vanhawke.agency${data.url}`;
            await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
              status: 'completed', finished_at: new Date().toISOString(), progress_pct: 100, progress_message: 'Done',
              result: { title: data.title, type: data.type, url: publicUrl, sections: data.sections, slides: data.slides, duration: data.duration },
            }) });
            // Alert so user sees it via KikoLiveContext
            await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
              type: 'job_complete', severity: 'medium',
              title: `📄 Document ready: ${data.title}`,
              detail: `${data.type === 'pptx' ? 'Presentation' : 'Report'} generated in ${Math.round((data.duration || 0) / 1000)}s.\n→ Download: ${publicUrl}`,
              entity_name: params.topic, user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
              dismissed: false, created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            }) });
          } else {
            await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
              status: 'failed', finished_at: new Date().toISOString(), error_message: data.error || 'Document generation failed',
            }) });
          }
        } else {
          // Unknown job type — mark as failed
          await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error_message: `Unknown job type: ${job.job_type}` }) });
        }
        processed++;
      } catch (jobErr) {
        await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error_message: jobErr.message, finished_at: new Date().toISOString() }) });
      }
    }

    await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: processed });
    return res.json({ ok: true, processed });
  } catch (err) {
    await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, error: err.message });
    return res.json({ ok: false, error: err.message });
  }
}
