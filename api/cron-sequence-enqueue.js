// api/cron-sequence-enqueue.js — Sequence Email Generator
// Runs daily at 6am. For active enrollments due today, generates
// personalised emails using company intelligence and queues them.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ═══ TIMEZONE HELPERS — prospect location → UTC offset ═══
// Maps company HQ / prospect location to approximate UTC offset for send timing
function getTimezoneOffset(company, companyIntel) {
  // Check company_intelligence for HQ location
  const hq = (companyIntel?.hq_location || companyIntel?.headquarters || '').toLowerCase();
  const domain = (companyIntel?.domain || '').toLowerCase();
  const companyLower = (company || '').toLowerCase();
  const text = `${hq} ${domain} ${companyLower}`;
  
  // US timezones (most common targets)
  if (/new york|nyc|boston|washington|dc|philadelphia|charlotte|atlanta|miami|florida|east coast|\.us$/.test(text)) return -5; // ET
  if (/chicago|dallas|houston|austin|denver|nashville|minneapolis|central/.test(text)) return -6; // CT
  if (/phoenix|salt lake|mountain/.test(text)) return -7; // MT
  if (/san francisco|sf|los angeles|la|seattle|portland|silicon valley|palo alto|menlo park|california|pacific|\.com$/.test(text) && !/uk|london/.test(text)) return -8; // PT (default for .com US tech)
  // UK
  if (/london|uk|united kingdom|england|manchester|cambridge|oxford|weybridge|\.co\.uk/.test(text)) return 0; // GMT/BST
  // Europe
  if (/paris|berlin|amsterdam|munich|zurich|stockholm|madrid|rome|milan|frankfurt|\.de$|\.fr$|\.nl$/.test(text)) return 1; // CET
  if (/helsinki|athens|bucharest|istanbul|\.fi$/.test(text)) return 2; // EET
  // Middle East
  if (/dubai|abu dhabi|riyadh|saudi|uae|qatar|bahrain/.test(text)) return 4; // GST
  // Asia
  if (/mumbai|bangalore|india|hyderabad|\.in$/.test(text)) return 5.5; // IST
  if (/singapore|hong kong|beijing|shanghai|taipei|\.sg$|\.hk$|\.cn$/.test(text)) return 8; // SGT/HKT
  if (/tokyo|japan|\.jp$/.test(text)) return 9; // JST
  if (/sydney|melbourne|australia|\.au$/.test(text)) return 10; // AEST
  // Default: assume US East Coast (most B2B targets)
  return -5;
}

function isDST(date) {
  // Approximate UK DST: last Sunday of March → last Sunday of October
  const year = date.getFullYear();
  const marchLast = new Date(year, 2, 31);
  const dstStart = new Date(year, 2, 31 - marchLast.getDay(), 1);
  const octLast = new Date(year, 9, 31);
  const dstEnd = new Date(year, 9, 31 - octLast.getDay(), 1);
  return date >= dstStart && date < dstEnd;
}

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
        if (!sequence.is_active) continue; // Skip draft/paused campaigns — nothing sends until launched
        const steps = sequence.steps || [];
        const step = steps.find(s => s.step === enrollment.current_step);
        if (!step) { 
          await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', completed_at: now.toISOString() }) });
          continue; 
        }

        // ═══ CONDITIONAL BRANCHING ═══
        // If step is a condition, evaluate and resolve to the actual step to execute
        let actualStep = step;
        if (step.type === 'condition') {
          let conditionMet = false;
          const cp = step.condition_params || {};
          switch (step.condition_type) {
            case 'no_reply': {
              // Check if lead has NOT replied within X days of a specific step
              const checkStep = cp.after_step || enrollment.current_step - 1;
              conditionMet = enrollment.status === 'active'; // Still active = no reply
              break;
            }
            case 'has_linkedin': {
              // Check if lead has a LinkedIn URL
              const contacts = await sbFetch(`contacts?select=data&data->>email=eq.${encodeURIComponent(enrollment.contact_email)}&limit=1`);
              conditionMet = !!(contacts?.[0]?.data?.linkedin);
              break;
            }
            case 'has_email': {
              conditionMet = !!(enrollment.contact_email && enrollment.contact_email.includes('@'));
              break;
            }
            case 'email_opened': {
              // Check if any prior email in this enrollment was opened
              const prior = await sbFetch(`kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&channel=eq.email&status=eq.sent&opened_at=not.is.null&select=id&limit=1`);
              conditionMet = Array.isArray(prior) && prior.length > 0;
              break;
            }
            default: conditionMet = false;
          }
          // Select the appropriate branch
          const branch = conditionMet ? (step.yes_steps || []) : (step.no_steps || []);
          if (branch.length > 0) {
            actualStep = branch[0]; // Execute first step of the chosen branch
          } else {
            // No steps in this branch — advance to next main step
            const nextMainStep = steps.find(s => s.step === enrollment.current_step + 1);
            if (nextMainStep) {
              await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({
                current_step: enrollment.current_step + 1,
                next_send_at: new Date(now.getTime() + (nextMainStep.delay_days || 3) * 86400000).toISOString()
              }) });
            } else {
              await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', completed_at: now.toISOString() }) });
            }
            continue;
          }
          // Log the branch decision
          await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
            category: 'sequence_branch', entity_name: enrollment.company,
            content: `Condition "${step.condition_type}" → ${conditionMet ? 'YES' : 'NO'} branch for ${enrollment.contact_name} at step ${step.step}`
          }) }).catch(() => {});
        }

        // Skip LinkedIn steps — those go to linkedin_queue separately
        if (actualStep.channel === 'linkedin') {
          await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
            enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
            message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
            priority: 8, status: 'pending'
          }) });
          // Alert for LinkedIn action
          await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
            type: 'linkedin_action', severity: 'medium', entity_name: enrollment.company,
            title: `LinkedIn: ${actualStep.action || 'Connect'} with ${enrollment.contact_name || enrollment.contact_email}`,
            detail: `Campaign "${sequence.name}" requires a LinkedIn ${actualStep.action || 'connection request'} to ${enrollment.contact_name} at ${enrollment.company}. Message: "${(actualStep.template || '').slice(0, 150)}"`,
            dismissed: false, expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }) }).catch(() => {});
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
        let subject = (actualStep.subject || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        let bodyPlain = (actualStep.template || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        
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

        // ═══ TIMEZONE-AWARE SEND TIMING ═══
        // Target: 9-10am in the prospect's local timezone for maximum open rate
        // Best days: Tue-Thu (highest open rates), Mon/Fri acceptable, never Sat/Sun
        const prospectTz = getTimezoneOffset(enrollment.company, ci);
        const ukOffsetHours = isDST(now) ? 1 : 0; // BST = UTC+1, GMT = UTC+0
        // Target 9-10am local for the prospect
        const targetLocalHour = 9 + (Math.random() > 0.5 ? 1 : 0); // 9 or 10am local
        const targetMinute = Math.floor(Math.random() * 45) + 5; // 5-50 min (looks natural)
        // Convert prospect local time to UTC: UTC = local - offset
        const targetUTC = targetLocalHour - prospectTz;
        // Convert UTC to UK time: UK = UTC + ukOffset
        const targetUKHour = targetUTC + ukOffsetHours;
        
        let sendAt = new Date(now);
        sendAt.setHours(Math.max(8, Math.min(18, targetUKHour)), targetMinute, 0, 0);
        // If target UK hour is outside 8am-6pm window, clamp to nearest edge
        if (targetUKHour < 8) sendAt.setHours(8, targetMinute, 0, 0);
        if (targetUKHour > 18) sendAt.setHours(17, targetMinute, 0, 0);
        // Skip weekends — move to next Tue-Thu
        const day = sendAt.getDay();
        if (day === 0) sendAt.setDate(sendAt.getDate() + 2); // Sun → Tue
        else if (day === 6) sendAt.setDate(sendAt.getDate() + 3); // Sat → Tue
        // If window already passed today, push to tomorrow (still skip weekends)
        if (sendAt < now) {
          sendAt.setDate(sendAt.getDate() + 1);
          const newDay = sendAt.getDay();
          if (newDay === 0) sendAt.setDate(sendAt.getDate() + 1);
          if (newDay === 6) sendAt.setDate(sendAt.getDate() + 2);
        }

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
