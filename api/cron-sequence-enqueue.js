// api/cron-sequence-enqueue.js — Sequence Email Generator
// Runs daily at 6am. For active enrollments due today, generates
// personalised emails using company intelligence and queues them.
// STANDALONE — if this fails, nothing else breaks.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { wrapEmailBody, loadUserSignatures, loadVoiceProfile, voiceProfileToPrompt } from './lib/email-format.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ═══ TIMEZONE HELPERS — prospect location → UTC offset ═══
// Maps company HQ / prospect location to approximate UTC offset for send timing
function getTimezoneOffset(company, companyIntel, contactEmail) {
  // Check company_intelligence for HQ location
  const hq = (companyIntel?.hq_location || companyIntel?.headquarters || '').toLowerCase();
  const domain = (companyIntel?.domain || '').toLowerCase();
  const companyLower = (company || '').toLowerCase();
  // Pull email TLD from recipient email (e.g. john@acme.co.uk → .co.uk)
  const emailDomain = (contactEmail || '').toLowerCase().split('@')[1] || '';
  const text = `${hq} ${domain} ${companyLower} ${emailDomain}`;
  
  // UK first — most explicit signals (Sunny is UK-based, many targets are EU)
  if (/london|uk\b|united kingdom|britain|british|england|english|scotland|wales|manchester|cambridge|oxford|weybridge|edinburgh|glasgow|birmingham|leeds|bristol|liverpool|van hawke|vanhawke|\.co\.uk|\.uk\b/.test(text)) return 0; // GMT/BST
  // Europe
  if (/paris|berlin|amsterdam|munich|zurich|stockholm|madrid|rome|milan|frankfurt|vienna|brussels|dublin|\.de\b|\.fr\b|\.nl\b|\.es\b|\.it\b|\.ie\b|\.ch\b|\.at\b|\.be\b|\.se\b/.test(text)) return 1; // CET
  if (/helsinki|athens|bucharest|istanbul|warsaw|prague|\.fi\b|\.gr\b|\.pl\b|\.cz\b/.test(text)) return 2; // EET
  // Middle East
  if (/dubai|abu dhabi|riyadh|saudi|uae|qatar|bahrain|tel aviv|israel|\.ae\b|\.sa\b|\.il\b/.test(text)) return 4; // GST
  // Asia
  if (/mumbai|bangalore|india|hyderabad|delhi|\.in\b/.test(text)) return 5.5; // IST
  if (/singapore|hong kong|beijing|shanghai|taipei|seoul|\.sg\b|\.hk\b|\.cn\b|\.tw\b|\.kr\b/.test(text)) return 8; // SGT/HKT
  if (/tokyo|japan|osaka|\.jp\b/.test(text)) return 9; // JST
  if (/sydney|melbourne|australia|brisbane|perth|\.au\b/.test(text)) return 10; // AEST
  // US — most common B2B target geography
  if (/new york|nyc|boston|washington|dc\b|philadelphia|charlotte|atlanta|miami|florida|east coast|\.us\b/.test(text)) return -5; // ET
  if (/chicago|dallas|houston|austin|denver|nashville|minneapolis|central time/.test(text)) return -6; // CT
  if (/phoenix|salt lake|mountain time/.test(text)) return -7; // MT
  if (/san francisco|sf\b|los angeles|la\b|seattle|portland|silicon valley|palo alto|menlo park|california|pacific/.test(text)) return -8; // PT
  // .com fallback — most US tech but ambiguous
  if (/\.com$/.test(emailDomain)) return -5; // ET (US-biased B2B default)
  // Final default: UK time (Sunny operates from Weybridge; safer than guessing US)
  return 0;
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

// ═══ TRIGGER CONDITIONS ENGINE ═══
// Evaluates a single condition row against the current enrollment state.
// Returns true / false. Used by the per-step pre-send check in the main loop.
async function evaluateCondition(cond, enrollment, sbFetch) {
  const refStep = cond.reference_step || 1;
  try {
    switch (cond.condition_type) {
      case 'opened':
      case 'not_opened': {
        const rows = await sbFetch(
          `kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&step_number=eq.${refStep}&status=eq.sent&opened_at=not.is.null&select=id&limit=1`
        );
        const wasOpened = Array.isArray(rows) && rows.length > 0;
        return cond.condition_type === 'opened' ? wasOpened : !wasOpened;
      }
      case 'clicked':
      case 'not_clicked': {
        const rows = await sbFetch(
          `kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&step_number=eq.${refStep}&status=eq.sent&clicked_at=not.is.null&select=id&limit=1`
        );
        const wasClicked = Array.isArray(rows) && rows.length > 0;
        return cond.condition_type === 'clicked' ? wasClicked : !wasClicked;
      }
      case 'replied':
      case 'not_replied': {
        const isReplied = enrollment.status === 'replied';
        return cond.condition_type === 'replied' ? isReplied : !isReplied;
      }
      case 'days_since_last_action': {
        const lastSent = await sbFetch(
          `kiko_outreach_queue?enrollment_id=eq.${enrollment.id}&status=eq.sent&order=sent_at.desc&limit=1&select=sent_at`
        );
        if (!lastSent?.[0]?.sent_at) return false;
        const daysSince = (Date.now() - new Date(lastSent[0].sent_at).getTime()) / 86400000;
        const threshold = parseFloat(cond.value || '0');
        if (cond.operator === 'gt' || cond.operator === 'gte') return daysSince >= threshold;
        if (cond.operator === 'lt' || cond.operator === 'lte') return daysSince <= threshold;
        return Math.round(daysSince) === Math.round(threshold);
      }
      case 'company_attribute': {
        const ci = enrollment.company_intel || {};
        const fieldVal = String(ci[cond.value?.split(':')[0] || 'industry'] || '').toLowerCase();
        const target = (cond.value?.split(':')[1] || '').toLowerCase();
        if (cond.operator === 'is') return fieldVal === target;
        if (cond.operator === 'is_not') return fieldVal !== target;
        if (cond.operator === 'contains') return fieldVal.includes(target);
        return false;
      }
      case 'has_meeting': {
        const meetings = await sbFetch(
          `kiko_meeting_prep?contact_email=eq.${encodeURIComponent(enrollment.contact_email)}&select=id&limit=1`
        );
        return Array.isArray(meetings) && meetings.length > 0;
      }
      default:
        return false;
    }
  } catch (e) {
    console.error(`[Conditions] eval failed for ${cond.condition_type}:`, e.message);
    return false;
  }
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-sequence-enqueue', 'started');
  try {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Load Sunny's voice profile + signatures ONCE for this run
    // Voice profile = patterns learned from his actual sent emails (Sun 4am cron)
    // Signatures = pulled live from Gmail API (native sendAs signature) — no Settings UI needed
    const SUNNY_USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';
    const SUNNY_EMAIL = 'sunny@vanhawke.agency';
    const FROM_ADDRESS = 'sunny@vanhawke.agency';
    const { getGoogleToken } = await import('./google-token.js');
    const accessToken = await getGoogleToken(SUNNY_EMAIL).catch(() => null);
    const [voiceProfile, signatures] = await Promise.all([
      loadVoiceProfile(sbFetch, SUNNY_USER_ID),
      loadUserSignatures(sbFetch, SUNNY_USER_ID, accessToken, FROM_ADDRESS),
    ]);
    console.log(`[cron-sequence-enqueue] signature source: ${signatures.source}`);
    const voicePromptInjection = voiceProfileToPrompt(voiceProfile);

    // Get active enrollments due today
    const enrollments = await sbFetch(
      `kiko_sequence_enrollments?status=eq.active&next_send_at=lte.${todayEnd.toISOString()}&contact_email=not.is.null&contact_email=not.like.*needs-enrichment*&contact_email=not.like.*pending.*&order=next_send_at&limit=25`
    );
    const safe = Array.isArray(enrollments) ? enrollments : [];
    if (!safe.length) {
      await cronHeartbeat('cron-sequence-enqueue', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'No enrollments due', queued: 0 });
    }

    let queued = 0;

    // ═══ PERFORMANCE LEARNING ═══
    // Load top-performing (approach × psychology) patterns from past sends.
    // Falls back to empty array silently when there's no data yet — the Haiku
    // refine call below just omits the "PROVEN PATTERNS" section in that case.
    let topPatterns = [];
    try {
      const patternRows = await sbFetch(`rpc/get_top_email_patterns`, {
        method: 'POST',
        body: JSON.stringify({ min_sample_size: 3, max_results: 5 }),
      });
      if (Array.isArray(patternRows)) topPatterns = patternRows;
      console.log(`[SeqEnqueue] Loaded ${topPatterns.length} top patterns from learning loop`);
    } catch (e) {
      console.log(`[SeqEnqueue] Pattern learning unavailable: ${e.message} — using default prompt`);
    }
    // Format patterns into a string the Haiku model can actually use.
    // Empty string when no data → behaves identically to the old prompt.
    const patternGuidance = topPatterns.length > 0
      ? `\n\nPROVEN PATTERNS (from real send data — these have been measured to perform well):\n${topPatterns.map((p, i) =>
          `${i + 1}. ${p.approach} approach + ${p.psychology} psychology on ${p.channel}: ${p.open_rate}% open, ${p.click_rate}% click, ${p.reply_rate}% reply (n=${p.sample_size})${p.example_subject ? ` — top subject: "${p.example_subject}"` : ''}`
        ).join('\n')}\n\nLean toward these patterns when refining. Match their tone, cadence, and specificity level.`
      : '';

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

        // ═══ TRIGGER CONDITIONS ENGINE ═══
        // Check kiko_sequence_conditions for rules attached to this step.
        // If conditions exist, evaluate them BEFORE sending. The first matching
        // condition jumps to true_next_step or false_next_step. If no condition
        // matches and there's no default, the step proceeds normally.
        const conditions = await sbFetch(
          `kiko_sequence_conditions?sequence_id=eq.${enrollment.sequence_id}&step_number=eq.${enrollment.current_step}&order=created_at.asc`
        ).catch(() => []);

        if (Array.isArray(conditions) && conditions.length > 0) {
          let jumpToStep = null;
          let conditionsAllPassed = true;

          for (const cond of conditions) {
            const result = await evaluateCondition(cond, enrollment, sbFetch);
            if (result === true && cond.true_next_step !== null && cond.true_next_step !== undefined) {
              jumpToStep = cond.true_next_step;
              break;
            }
            if (result === false && cond.false_next_step !== null && cond.false_next_step !== undefined) {
              jumpToStep = cond.false_next_step;
              conditionsAllPassed = false;
              break;
            }
            if (result === false) conditionsAllPassed = false;
          }

          // If a jump was set, advance enrollment and skip this step's send
          if (jumpToStep !== null) {
            const targetStep = steps.find(s => s.step === jumpToStep);
            const waitMs = (conditions[0]?.wait_hours || 0) * 3600000;
            await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                current_step: jumpToStep,
                next_send_at: new Date(now.getTime() + waitMs).toISOString(),
                status: targetStep ? 'active' : 'completed',
                completed_at: targetStep ? null : now.toISOString(),
              }),
            });
            await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
              category: 'sequence_trigger', entity_name: enrollment.company || enrollment.contact_email,
              content: `Step ${enrollment.current_step} conditions evaluated → jumped to step ${jumpToStep} for ${enrollment.contact_name || enrollment.contact_email}`
            }) }).catch(() => {});
            continue;
          }

          // If all conditions evaluated false and no jump set, pause the lead
          if (!conditionsAllPassed) {
            await sbFetch(`kiko_sequence_enrollments?id=eq.${enrollment.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'paused', paused_reason: 'condition_not_met' }),
            });
            continue;
          }
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
        // NEW MODEL: if step has condition:"connection_accepted", check first
        if (actualStep.channel === 'linkedin') {
          let shouldQueue = true;
          
          // Guard: empty template creates an alert instead of an empty LinkedIn message
          if (!actualStep.template && !actualStep.body) {
            await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
              type: 'campaign_error', severity: 'high',
              title: `⚠️ LinkedIn step ${actualStep.step || enrollment.current_step} has no template`,
              detail: `Campaign "${sequence.name}" — step ${actualStep.step || enrollment.current_step} for ${enrollment.contact_name || enrollment.contact_email} has no message template. This contact was advanced past the step but no LinkedIn message was sent. Write the template to resume LinkedIn outreach.`,
              entity_type: 'contact', entity_name: enrollment.contact_name || enrollment.contact_email, dismissed: false
            }) }).catch(() => {});
            shouldQueue = false;
          }

          if (actualStep.condition === 'connection_accepted') {
            // Check if prospect is connected on LinkedIn
            const accepted = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${enrollment.id}&action=eq.invite&result=eq.accepted&limit=1`).catch(() => []);
            const alreadyConn = await sbFetch(`kiko_linkedin_queue?enrollment_id=eq.${enrollment.id}&result=eq.already_connected&limit=1`).catch(() => []);
            const isConnected = (accepted?.length > 0) || (alreadyConn?.length > 0);
            if (!isConnected) {
              shouldQueue = false;
              console.log(`[seq-enqueue] Skipping LinkedIn step ${actualStep.step || enrollment.current_step} — not connected (${enrollment.contact_name})`);
              await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
                type: 'linkedin_skip', severity: 'medium',
                title: `LinkedIn step skipped — ${enrollment.contact_name} not connected`,
                detail: `Campaign "${sequence.name}" step ${actualStep.step || enrollment.current_step} requires LinkedIn connection to ${enrollment.contact_name} (${enrollment.company}) but they're not connected. Connection request may need to be sent first.`,
                entity_type: 'contact', entity_name: enrollment.contact_name, dismissed: false
              }) }).catch(() => {});
            }
          }
          
          if (shouldQueue) {
            await sbFetch('kiko_linkedin_queue', { method: 'POST', body: JSON.stringify({
              enrollment_id: enrollment.id, contact_name: enrollment.contact_name || '', company: enrollment.company || '',
              linkedin_url: enrollment.linkedin_url || null,
              message_type: actualStep.action || 'connection', message: actualStep.template || '', context: `Sequence: ${sequence.name}, Step ${actualStep.step || enrollment.current_step}`,
              priority: 8, status: 'pending'
            }) });
            await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
              type: 'linkedin_action', severity: 'medium', entity_name: enrollment.company,
              title: `LinkedIn: ${actualStep.action || 'Connect'} with ${enrollment.contact_name || enrollment.contact_email}`,
              detail: `Campaign "${sequence.name}" requires a LinkedIn ${actualStep.action || 'connection request'} to ${enrollment.contact_name} at ${enrollment.company}. Message: "${(actualStep.template || '').slice(0, 150)}"`,
              dismissed: false, expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }) }).catch(() => {});
          }
          // Always advance past LinkedIn steps (they don't block email progression)
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
        const nameParts = (enrollment.contact_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || 'there';
        const lastName = nameParts.slice(1).join(' ') || '';
        const vars = {
          firstName,
          lastName,
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
          signature: '', // signature appended separately by wrapEmailBody
        };

        // Personalise template with Haiku
        // ═══ A/B VARIANT SELECTION ═══
        // If the step has variants, pick one weighted-randomly. Falls through
        // to the base subject/template if no variants exist.
        let chosenVariant = null;
        let stepSubject = actualStep.subject || '';
        let stepTemplate = actualStep.template || '';
        if (Array.isArray(actualStep.variants) && actualStep.variants.length > 0) {
          const totalWeight = actualStep.variants.reduce((sum, v) => sum + (v.weight || 1), 0);
          let pick = Math.random() * totalWeight;
          for (const v of actualStep.variants) {
            pick -= (v.weight || 1);
            if (pick <= 0) { chosenVariant = v; break; }
          }
          if (!chosenVariant) chosenVariant = actualStep.variants[0];
          stepSubject = chosenVariant.subject || stepSubject;
          stepTemplate = chosenVariant.template || stepTemplate;
        }

        let subject = stepSubject.replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        let bodyPlain = stepTemplate.replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
        
        // Use Sonnet to refine the email with company intelligence + voice profile
        try {
          const refine = await anthropic.messages.create({
            model: 'claude-sonnet-4-6', max_tokens: 800,
            system: `You are an elite sales copywriter who personalises outreach for $3M-$40M F1 sponsorship partnerships. The recipient is "${firstName}" at ${vars.company} in the ${vars.category} sector.

RULES:
- Start with "Dear ${firstName}," — use EXACTLY this name
- Keep to 50-100 words. Every word must earn its place.
- Write like a senior advisor addressing a board member
- Reference something SPECIFIC about ${vars.company} or their sector position
- No sign-off (signature appended separately)
- No dashes (em or en). No bullet points. No "I wanted to reach out." No "I hope this finds you well."
- If you know their revenue is ${vars.revenue_estimate}, their CEO is ${vars.ceo}, their funding is ${vars.funding_round} — USE that intelligence naturally

Return ONLY the refined email body starting with "Dear ${firstName}," — nothing else.
` + voicePromptInjection + patternGuidance,
            messages: [{ role: 'user', content: `Refine this email for ${vars.name} at ${vars.company} (${vars.category}):\n\n${bodyPlain}\n\nCompany intel: Revenue ${vars.revenue_estimate}, ${vars.employee_count} employees, CEO ${vars.ceo}, funding ${vars.funding_round}\n\nThis step uses approach=${actualStep.approach || 'authority-led'}, psychology=${actualStep.psychology || 'reciprocity'}.` }]
          });
          const refined = refine.content[0]?.text?.trim();
          if (refined && refined.length > 50) bodyPlain = refined;
        } catch {}

        // Post-process: strip dashes and banned phrases from generated content
        bodyPlain = bodyPlain.replace(/[\u2014\u2013]/g, ',');
        bodyPlain = bodyPlain
          .replace(/I wanted to ensure/gi, 'This is to ensure')
          .replace(/I wanted to reach out/gi, 'This note concerns')
          .replace(/I am reaching out/gi, 'This concerns')
          .replace(/I wanted to/gi, 'This is to')
          .replace(/I'm writing to/gi, 'This note concerns')
          .replace(/Just checking in/gi, '')
          .replace(/Following up on my last email/gi, '')
          .replace(/Bumping this/gi, '');
        subject = subject.replace(/[\u2014\u2013]/g, ' x ').replace(/\s+/g, ' ').trim();

        // Wrap with Helvetica 12 / line-height 1.5 / black, inject correct signature
        // contactStatus: 'cold' for steps 1-2 (text-only sig), 'warm' for steps 3+ (full sig)
        const contactStatus = (enrollment.current_step <= 2) ? 'cold' : 'warm';
        const wrapped = wrapEmailBody(bodyPlain, { contactStatus, signature: signatures.signature, coldSignature: signatures.coldSignature });
        const bodyHtml = wrapped.html;
        bodyPlain = wrapped.text;

        // ═══ TIMEZONE-AWARE SEND TIMING ═══
        // Target: 9-10am in the prospect's local timezone for maximum open rate
        // Best days: Tue-Thu (highest open rates), Mon/Fri acceptable, never Sat/Sun
        // NOTE: Vercel runs in UTC. setUTCHours() writes UTC. We compute the UTC
        // hour that corresponds to 9-10am in the prospect's local zone.
        // The sender cron now runs every hour Mon-Fri (was 8am-6pm UK), so we
        // no longer clamp to UK working hours — prospects in Tokyo/Sydney/SF
        // get scheduled at their actual 9-10am local, picked up by the next
        // hourly sender tick.
        const prospectTz = getTimezoneOffset(enrollment.company, ci, enrollment.contact_email);
        // Target 9-10am in PROSPECT local timezone
        const targetLocalHour = 9 + (Math.random() > 0.5 ? 1 : 0); // 9 or 10am local
        const targetMinute = Math.floor(Math.random() * 45) + 5; // 5-50 min (looks natural)
        // Convert prospect local time to UTC: UTC = local - prospectTz
        let targetUTC = targetLocalHour - prospectTz;
        // Wrap into 0-23 if negative or >24
        let dayOffset = 0;
        while (targetUTC < 0) { targetUTC += 24; dayOffset -= 1; }
        while (targetUTC >= 24) { targetUTC -= 24; dayOffset += 1; }

        let sendAt = new Date(now);
        if (dayOffset !== 0) sendAt.setUTCDate(sendAt.getUTCDate() + dayOffset);
        sendAt.setUTCHours(targetUTC, targetMinute, 0, 0);
        // Skip weekends in PROSPECT local time — move to next Tue
        const localDay = new Date(sendAt.getTime() + prospectTz * 3600000).getUTCDay();
        if (localDay === 0) sendAt.setUTCDate(sendAt.getUTCDate() + 2); // Sun → Tue
        else if (localDay === 6) sendAt.setUTCDate(sendAt.getUTCDate() + 3); // Sat → Tue
        // If window already passed today, push to tomorrow (still skip weekends)
        if (sendAt < now) {
          sendAt.setUTCDate(sendAt.getUTCDate() + 1);
          const newLocalDay = new Date(sendAt.getTime() + prospectTz * 3600000).getUTCDay();
          if (newLocalDay === 0) sendAt.setUTCDate(sendAt.getUTCDate() + 1);
          if (newLocalDay === 6) sendAt.setUTCDate(sendAt.getUTCDate() + 2);
        }

        // Queue the email
        await sbFetch('kiko_outreach_queue', { method: 'POST', body: JSON.stringify({
          enrollment_id: enrollment.id, to_email: enrollment.contact_email,
          to_name: enrollment.contact_name, company: enrollment.company,
          subject, body_html: bodyHtml, body_plain: bodyPlain,
          channel: 'email', step_number: enrollment.current_step,
          variant_id: chosenVariant?.id || null,
          variant_label: chosenVariant?.label || chosenVariant?.id || null,
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
