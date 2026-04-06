// api/cron-sequence-enqueue.js — Sequence Email Generator
// Runs daily at 6am. For active enrollments due today, generates
// personalised emails using company intelligence and queues them.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-sequence-enqueue', 'started');
  try {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Get active enrollments due today
    const enrollments = await sbFetch(
      `kiko_sequence_enrollments?status=eq.active&next_send_at=lte.${todayEnd.toISOString()}&order=next_send_at&limit=10`
    );
    const safe = Array.isArray(enrollments) ? enrollments : [];
    if (!safe.length) {
      await cronHeartbeat('cron-sequence-enqueue', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No enrollments due', queued: 0 });
    }

    let queued = 0;
    for (const enrollment of safe) {
      try {
        // Get the sequence
        const seqs = await sbFetch(`kiko_sequences?id=eq.${enrollment.sequence_id}&limit=1`);
        if (!seqs?.length) continue;
        const sequence = seqs[0];
        const steps = sequence.steps || [];
        const step = steps.find(s => s.step === enrollment.current_step);
        if (!step) { 
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', completed_at: now.toISOString() }) });
          continue; 
        }

        // Skip LinkedIn steps — those go to linkedin_queue separately
        if (step.channel === 'linkedin') {
          await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
            enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
            message_type: 'connection', message: step.template || '', context: `Sequence: ${sequence.name}, Step ${step.step}`,
            priority: 8, status: 'pending'
          }) });
          // Advance to next step
          const nextStep = steps.find(s => s.step === enrollment.current_step + 1);
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
            current_step: enrollment.current_step + 1,
            next_send_at: nextStep ? new Date(now.getTime() + (nextStep.delay_days || 3) * 86400000).toISOString() : null,
            status: nextStep ? 'active' : 'completed', completed_at: nextStep ? null : now.toISOString()
          }) });
          queued++;
          continue;
        }

        // Get company intelligence for personalisation
        const intel = await sbFetch(`company_intelligence?company_name=ilike.*${encodeURIComponent(enrollment.company || '')}*&limit=1`);
        const ci = intel?.[0] || {};
        
        // Get previous email thread ID for Re: threading
        const prevQueue = await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.sent&order=step_number.desc&limit=1`);
        const prevThreadId = prevQueue?.[0]?.gmail_thread_id;
        const prevSubject = prevQueue?.[0]?.subject;

        // Build personalisation context
        const vars = {
          name: enrollment.contact_name || 'there',
          company: enrollment.company || '',
          category: ci.industry || ci.sub_sector || 'technology',
          sub_sector: ci.sub_sector || ci.industry || '',
          revenue_estimate: ci.revenue_estimate || '',
          employee_count: ci.employee_count || '',
          ceo: ci.ceo || '', cmo: ci.cmo || '', cto: ci.cto || '',
          funding_round: ci.last_funding_round || '',
          competitor_ref: (ci.competitors || [])[0] || '',
          competitor_team: 'Mercedes',
          recent_news: '', recent_news_hook: '', competitive_intel: '',
          prev_subject: prevSubject || '',
        };

        // Personalise template with Haiku
        let subject = (step.subject || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        let bodyPlain = (step.template || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        
        // Use Haiku to refine the email with real context
        try {
          const refine = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001', max_tokens: 600,
            system: 'You refine outreach email drafts. Keep the structure and approach intact but make it feel natural and specific. Replace any remaining {placeholder} tokens with intelligent defaults. Keep to 2 paragraphs max. No sign-off or name. Return ONLY the refined email body, nothing else.',
            messages: [{ role: 'user', content: `Refine this email for ${vars.name} at ${vars.company} (${vars.category}):\n\n${bodyPlain}\n\nCompany intel: Revenue ${vars.revenue_estimate}, ${vars.employee_count} employees, CEO ${vars.ceo}, funding ${vars.funding_round}` }]
          });
          const refined = refine.content[0]?.text?.trim();
          if (refined && refined.length > 50) bodyPlain = refined;
        } catch {}

        const bodyHtml = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12pt;color:#333">${bodyPlain.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</div>`;

        // Calculate optimal send time (Tue-Thu 8-10am UK, skip Mon/Fri/weekend)
        let sendAt = new Date(now);
        sendAt.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 45), 0, 0);
        const day = sendAt.getDay();
        if (day === 0) sendAt.setDate(sendAt.getDate() + 2); // Sun → Tue
        else if (day === 1) sendAt.setDate(sendAt.getDate() + 1); // Mon → Tue
        else if (day === 5) sendAt.setDate(sendAt.getDate() + 4); // Fri → Tue
        else if (day === 6) sendAt.setDate(sendAt.getDate() + 3); // Sat → Tue
        if (sendAt < now) sendAt.setDate(sendAt.getDate() + 1); // If today's window passed, tomorrow

        // Queue the email
        await sbFetch('kiko_outreach_queue', { method: 'POST', body: JSON.stringify({
          enrollment_id: enrollment.id, to_email: enrollment.contact_email,
          to_name: enrollment.contact_name, company: enrollment.company,
          subject, body_html: bodyHtml, body_plain: bodyPlain,
          channel: 'email', step_number: enrollment.current_step,
          scheduled_for: sendAt.toISOString(), status: 'queued'
        }) });

        // Advance enrollment to next step
        const nextStep = steps.find(s => s.step === enrollment.current_step + 1);
        const nextSendAt = nextStep ? new Date(sendAt.getTime() + (nextStep.delay_days || 3) * 86400000).toISOString() : null;
        await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
          next_send_at: nextSendAt || sendAt.toISOString()
        }) });
        queued++;
      } catch (err) { console.error(`[SeqEnqueue] ❌ ${enrollment.company}:`, err.message); }
    }

    await cronHeartbeat('cron-sequence-enqueue', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: queued });
    return res.status(200).json({ ok: true, enrollments_checked: safe.length, queued });
  } catch (err) {
    console.error('[SeqEnqueue] Fatal:', err.message);
    await cronHeartbeat('cron-sequence-enqueue', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
