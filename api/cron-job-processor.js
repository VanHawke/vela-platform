// api/cron-job-processor.js — Background job processor
// Picks up pending jobs from kiko_background_jobs, processes them asynchronously.
// Returns 200 IMMEDIATELY so cron scheduler's 280s timeout doesn't kill long jobs.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import crypto from 'crypto';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-job-processor', 'started');

  try {
    const jobs = await sbFetch('kiko_background_jobs?status=eq.queued&order=queued_at.asc&limit=3');
    if (!Array.isArray(jobs) || jobs.length === 0) {
      await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, processed: 0 });
    }

    // Mark all as processing BEFORE returning
    for (const job of jobs) {
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing', started_at: new Date().toISOString() }) });
    }

    // Return 200 immediately — jobs continue asynchronously
    res.json({ ok: true, processing: jobs.length, job_ids: jobs.map(j => j.id) });

    // Process each job after response sent
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        console.error(`[job-processor] Job ${job.id} (${job.job_type}) failed:`, err.message);
        await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
          status: 'failed', finished_at: new Date().toISOString(), error_message: err.message?.slice(0, 500),
        }) });
      }
    }
    await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: jobs.length });
  } catch (err) {
    console.error('[job-processor] fatal:', err);
    await cronHeartbeat('cron-job-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, error: err.message });
  }
}

// ─── Job type handlers ───
async function processJob(job) {
  if (job.job_type === 'source_companies_bg') {
    const params = job.params || {};
    const category = params.category || 'technology';
    const count = params.count || 15;
    const sequenceId = params.sequence_id;
    let campaignName = category, targetPersona = `C-suite at ${category} companies`;
    if (sequenceId) {
      const seq = await sbFetch(`kiko_sequences?id=eq.${sequenceId}&limit=1`);
      if (seq?.[0]) { campaignName = seq[0].name || category; targetPersona = seq[0].target_persona || targetPersona; }
    }

    const spRes = await fetch(`http://127.0.0.1:3000/api/source-prospects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignName, description: category, targetPersona, maxCompanies: Math.min(count, 20), contactsPerCompany: 2 }),
      signal: AbortSignal.timeout(180000),
    });
    const text = await spRes.text();
    
    // Parse ALL SSE data lines — collect prospects from every event, not just the last one
    const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
    let allProspects = [], allCompanies = [];
    for (const line of dataLines) {
      try {
        const parsed = JSON.parse(line.replace('data: ', ''));
        if (parsed.prospects?.length) allProspects.push(...parsed.prospects);
        if (parsed.companies?.length) allCompanies.push(...parsed.companies);
        // Some SSE events send individual contacts
        if (parsed.contact) allProspects.push(parsed.contact);
      } catch {}
    }
    // Dedupe by email
    const seen = new Set();
    allProspects = allProspects.filter(p => {
      const key = (p.email || `${p.first_name}_${p.last_name}_${p.company_name}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`[job-processor] source_companies_bg: ${allProspects.length} prospects from ${allCompanies.length} companies`);

    if (allProspects.length > 0 && sequenceId) {
      const existingEnrolls = await sbFetch(`kiko_sequence_enrollments?sequence_id=eq.${sequenceId}&select=contact_email`);
      const existingEmails = new Set((existingEnrolls || []).map(e => e.contact_email?.toLowerCase()).filter(Boolean));
      const existingTargets = await sbFetch(`campaign_targets?campaign_id=eq.${sequenceId}&select=decision_maker_email`);
      const existingTargetEmails = new Set((existingTargets || []).map(t => t.decision_maker_email?.toLowerCase()).filter(Boolean));
      
      let enrolled = 0, targetsAdded = 0;
      const contactsNeedingEmail = [];
      
      for (const p of allProspects) {
        const email = p.email?.toLowerCase();
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        
        // Add to campaign_targets (what the UI shows)
        if (!existingTargetEmails.has(email)) {
          await sbFetch('campaign_targets', { method: 'POST', body: JSON.stringify({
            campaign_id: sequenceId,
            company_name: p.company_name || p.company || '',
            decision_maker_name: name,
            decision_maker_title: p.title || p.job_title || 'Decision Maker',
            decision_maker_email: email || null,
            rank: (existingTargets?.length || 0) + targetsAdded + 1,
            source: 'web_search',
            enrollment_status: email ? 'sourced' : 'needs_email',
            verification_status: p.email_verified ? 'verified' : 'unverified',
          }) });
          targetsAdded++;
          if (!email) contactsNeedingEmail.push({ name, title: p.title, company: p.company_name, domain: p.domain });
        }
        
        // Add to kiko_sequence_enrollments (what powers the sequence sender)
        if (email && !existingEmails.has(email)) {
          await sbFetch('kiko_sequence_enrollments', { method: 'POST', body: JSON.stringify({
            sequence_id: sequenceId, contact_name: name,
            contact_email: email, company: p.company_name || p.company || '',
            linkedin_url: p.linkedin_url || '', status: 'paused', current_step: 1,
            enrolled_at: new Date().toISOString(),
          }) });
          enrolled++;
        }
      }
      
      // Queue email enrichment for contacts without emails
      if (contactsNeedingEmail.length > 0) {
        const enrichJobId = crypto.randomUUID();
        await sbFetch('kiko_background_jobs', { method: 'POST', body: JSON.stringify({
          id: enrichJobId, user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
          job_type: 'enrich_campaign_emails', status: 'queued',
          title: `Find emails for ${contactsNeedingEmail.length} new contacts`,
          params: { campaign_id: sequenceId, contacts: contactsNeedingEmail.map((c, i) => ({ ...c, target_rank: (existingTargets?.length || 0) + i + 1 })) },
          queued_at: new Date().toISOString(),
        }) });
      }
      
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
        status: 'completed', finished_at: new Date().toISOString(),
        result: { prospects_found: allProspects.length, enrolled, targets_added: targetsAdded, companies: allCompanies.length, emails_pending: contactsNeedingEmail.length },
      }) });
      // Alert
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'job_complete', severity: 'medium',
        title: `🎯 ${targetsAdded} prospects added to campaign`,
        detail: `${enrolled} enrolled with emails, ${contactsNeedingEmail.length} pending email enrichment.`,
        entity_name: campaignName, user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
        dismissed: false, created_at: new Date().toISOString(),
      }) });
    } else {
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
        status: 'completed', finished_at: new Date().toISOString(),
        result: { prospects_found: 0, message: 'No prospects found from source-prospects' },
      }) });
    }

  } else if (job.job_type === 'enrich_campaign_emails') {
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
        const firstName = nameParts[0], lastName = nameParts.slice(1).join(' ');
        let domain = c.domain;
        if (!domain) domain = (c.company || '').toLowerCase().replace(/[&,.'"\-()]/g, '').replace(/\s+(inc|llc|ltd|plc|corp|co|group|holdings|international|global)$/i, '').replace(/\s+/g, '') + '.com';

        const res = await fetch(emailIntelUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${emailIntelAuth}` },
          body: JSON.stringify({ firstName, lastName, company: c.company, domain }),
          signal: AbortSignal.timeout(35000),
        });
        const data = await res.json();
        const isValid = data.ok && data.email && data.email.includes('@') && !data.email.includes('&') && data.email.split('@')[1]?.length < 40;
        if (isValid && campaignId) {
          await sbFetch(`campaign_targets?campaign_id=eq.${campaignId}&decision_maker_name=eq.${encodeURIComponent(c.name)}&rank=eq.${c.target_rank}`, {
            method: 'PATCH', body: JSON.stringify({ decision_maker_email: data.email, verification_status: data.verified ? 'verified' : (data.reason || 'pattern_matched'), enrollment_status: 'sourced' }),
          });
          await sbFetch(`kiko_sequence_enrollments?sequence_id=eq.${campaignId}&company=eq.${encodeURIComponent(c.company)}&status=eq.needs_email`, {
            method: 'PATCH', body: JSON.stringify({ contact_email: data.email, status: 'paused' }),
          });
          found++;
        } else { failed++; }
      } catch { failed++; }
    }

    await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
      status: 'completed', finished_at: new Date().toISOString(), progress_pct: 100,
      progress_message: `Done: ${found} emails found, ${failed} not found`,
      result: { emails_found: found, emails_failed: failed, total: contacts.length },
    }) });
    await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
      type: 'job_complete', severity: 'medium',
      title: `✉️ Email enrichment complete: ${found}/${contacts.length} found`,
      detail: `${found} verified emails found, ${failed} not found. Contacts with emails are ready to activate.`,
      entity_name: `${contacts?.[0]?.company || 'Campaign'} + ${contacts.length - 1} more`,
      user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
      dismissed: false, created_at: new Date().toISOString(),
    }) });

  } else if (job.job_type === 'generate_document') {
    const params = job.params || {};
    await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ progress_message: 'Researching topic...', progress_pct: 20 }) });
    const docRes = await fetch(`http://127.0.0.1:3000/api/generate-document`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: params.topic, documentType: params.documentType || 'pdf', division: params.division || 'agency', purpose: params.purpose || 'report' }),
    });
    const data = await docRes.json();
    if (data.ok) {
      const publicUrl = `https://api.vanhawke.agency${data.url}`;
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
        status: 'completed', finished_at: new Date().toISOString(), progress_pct: 100,
        result: { title: data.title, type: data.type, url: publicUrl },
      }) });
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'job_complete', severity: 'medium',
        title: `📄 Document ready: ${data.title}`,
        detail: `Download: ${publicUrl}`,
        entity_name: params.topic, user_id: job.user_id || '9f486437-4bf5-4111-abfe-fe19bfa76063',
        dismissed: false, created_at: new Date().toISOString(),
      }) });
    } else {
      await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
        status: 'failed', finished_at: new Date().toISOString(), error_message: data.error || 'Document generation failed',
      }) });
    }

  } else {
    await sbFetch(`kiko_background_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
      status: 'failed', error_message: `Unknown job type: ${job.job_type}`,
    }) });
  }
}
