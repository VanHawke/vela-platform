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
    const jobs = await sbFetch('kiko_background_jobs?status=eq.queued&order=created_at.asc&limit=3');
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

          // Call source-prospects (same logic but via internal fetch)
          const spRes = await fetch(`${process.env.HETZNER_URL || 'https://api.vanhawke.agency'}/api/source-prospects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignName, description: category, targetPersona, maxCompanies: Math.min(count, 20), contactsPerCompany: 2 }),
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
