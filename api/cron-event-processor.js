// api/cron-event-processor.js — Kiko's Cognitive Event Bus
// Processes signals through a 5-step reasoning chain:
// 1. CLASSIFY — categorise the signal (Haiku, fast)
// 2. CONTEXT — retrieve CRM/email context (DB lookup)
// 3. KNOWLEDGE — match relevant knowledge domains (Haiku)
// 4. PSYCHOLOGY — deep analysis with psychological reasoning (Sonnet)
// 5. ACTION — generate specific actions (Haiku)
// Runs every 10 minutes during business hours
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, findOpenTaskForCompany, getAccountState, parkIntelligence } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6'; // Fixed — was mislabeled as Sonnet but using Haiku // Haiku for event classification (cost: 10x less than Sonnet)

// Helper: call Claude with model selection
async function callClaude(model, systemPrompt, userPrompt, maxTokens = 1000) {
  const start = Date.now();
  try {
    const r = await anthropic.messages.create({
      model, max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const text = r.content?.[0]?.text || '';
    return { text, tokens: r.usage?.input_tokens + r.usage?.output_tokens || 0, duration: Date.now() - start };
  } catch (e) {
    console.error(`[event-processor] Claude ${model} error:`, e.message);
    return { text: '', tokens: 0, duration: Date.now() - start, error: e.message };
  }
}

// Helper: save a reasoning step
async function saveStep(eventId, stepNumber, stepType, input, output, model, tokens, duration) {
  await sbFetch('kiko_reasoning_chains', {
    method: 'POST',
    body: JSON.stringify({ event_id: eventId, step_number: stepNumber, step_type: stepType, input, output, model_used: model, tokens_used: tokens, duration_ms: duration })
  }).catch(e => console.error('[event-processor] Save step error:', e.message));
}

// Helper: fetch contact context from CRM
async function fetchContext(entityName, entityType) {
  const ctx = {};
  if (!entityName) return ctx;
  try {
    // Contacts use JSONB data column: data->>'firstName', data->>'company'
    const firstName = entityName.split(' ')[0] || '';
    const lastName = entityName.split(' ').slice(1).join(' ') || '';
    let contacts = [];
    if (firstName && lastName) {
      // Primary lookup: exact first + last name match (CRM uses camelCase)
      contacts = await sbFetch(`contacts?data->>firstName=ilike.${encodeURIComponent(firstName)}&data->>lastName=ilike.${encodeURIComponent(lastName)}&select=id,data&limit=1`).catch(() => []);
    }
    if (!contacts?.length && firstName && lastName) {
      // Fallback: search by full name in any text field — NOT by last name as company
      contacts = await sbFetch(`contacts?or=(data->>firstName.ilike.*${encodeURIComponent(firstName)}*,data->>email.ilike.*${encodeURIComponent(lastName.toLowerCase())}*)&data->>lastName=ilike.*${encodeURIComponent(lastName)}*&select=id,data&limit=1`).catch(() => []);
    }
    if (contacts?.length) ctx.contact = { id: contacts[0].id, ...contacts[0].data };
    
    // Deals also use JSONB data column
    const companyName = ctx.contact?.company || entityName;
    if (companyName) {
      const deals = await sbFetch(`deals?data->>company=ilike.*${encodeURIComponent(companyName)}*&select=id,data&limit=1`).catch(() => []);
      if (deals?.length) ctx.deal = { id: deals[0].id, ...deals[0].data };
    }
  } catch (e) { console.warn('[event-processor] Context fetch error:', e.message); }
  return ctx;
}

// Helper: load relevant knowledge domains for a topic
async function loadRelevantKnowledge(keywords) {
  const all = await sbFetch('kiko_knowledge?select=domain,content&limit=100').catch(() => []);
  if (!all?.length) return '';
  const kw = keywords.toLowerCase();
  const scored = all.map(k => {
    const words = k.domain.replace(/-/g, ' ').split(' ');
    let score = 0;
    for (const w of words) { if (w.length > 2 && kw.includes(w)) score += 3; }
    if (k.domain.includes('psychology') || k.domain.includes('negotiation') || k.domain.includes('sales') || k.domain.includes('persuasion') || k.domain.includes('verbal') || k.domain.includes('behavioural')) score += 2;
    return { ...k, score };
  }).filter(k => k.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  return scored.map(k => `[${k.domain}]\n${k.content.slice(0, 3000)}`).join('\n\n');
}

// ═══ PROCESS A SINGLE EVENT THROUGH THE 5-STEP REASONING CHAIN ═══
async function processEvent(event) {
  const { id, event_type, entity_name, payload } = event;
  const detail = payload?.detail || payload?.snippet || payload?.message || '';
  const subject = payload?.subject || payload?.title || '';

  // ── STEP 1: CLASSIFY (Haiku — fast) ──
  const classifyResult = await callClaude(HAIKU,
    'You are a signal classifier for a B2B sales intelligence system. Respond ONLY in valid JSON.',
    `Classify this signal:\nType: ${event_type}\nEntity: ${entity_name}\nSubject: ${subject}\nContent: ${detail.slice(0, 500)}\n\nRespond with JSON: {"intent":"positive|deferral|objection|rejection|info|action_needed","sentiment":"positive|neutral|negative","urgency":"high|medium|low","key_phrases":["phrase1","phrase2"],"summary":"one sentence summary"}`,
    500
  );
  let classification = {};
  try { classification = JSON.parse(classifyResult.text.replace(/```json|```/g, '').trim()); } catch { classification = { intent: 'info', sentiment: 'neutral', urgency: 'medium', summary: classifyResult.text.slice(0, 200) }; }
  await saveStep(id, 1, 'classify', { event_type, entity_name, detail: detail.slice(0, 300) }, classification, HAIKU, classifyResult.tokens, classifyResult.duration);

  // ── STEP 2: CONTEXT (Database lookup — no AI) ──
  const ctxStart = Date.now();
  const context = await fetchContext(entity_name, event.entity_type);
  await saveStep(id, 2, 'context', { entity_name }, context, 'database', 0, Date.now() - ctxStart);

  // ── STEP 3: KNOWLEDGE (Haiku — match relevant domains) ──
  const keywords = `${event_type} ${entity_name} ${classification.summary || ''} ${(classification.key_phrases || []).join(' ')}`;
  const knowledge = await loadRelevantKnowledge(keywords);
  const knowledgeResult = await callClaude(HAIKU,
    'You identify which psychological and strategic principles apply to a business signal. Respond ONLY in valid JSON.',
    `Signal: ${classification.summary}\nIntent: ${classification.intent}\nEntity: ${entity_name} (${context.contact?.title || ''} at ${context.contact?.company || ''})\nDeal stage: ${context.deal?.stage || 'none'}\n\nAvailable knowledge:\n${knowledge.slice(0, 4000)}\n\nRespond with JSON: {"applicable_principles":["principle1: brief explanation","principle2: brief explanation"],"recommended_approach":"one paragraph approach","relevant_domains":["domain1","domain2"]}`,
    600
  );
  let knowledgeAnalysis = {};
  try { knowledgeAnalysis = JSON.parse(knowledgeResult.text.replace(/```json|```/g, '').trim()); } catch { knowledgeAnalysis = { applicable_principles: [], recommended_approach: knowledgeResult.text.slice(0, 300) }; }
  await saveStep(id, 3, 'knowledge', { keywords: keywords.slice(0, 200) }, knowledgeAnalysis, HAIKU, knowledgeResult.tokens, knowledgeResult.duration);

  // ── STEP 4: PSYCHOLOGY (Sonnet — deep analysis) ──
  const contactInfo = context.contact ? `${context.contact.firstName || ''} ${context.contact.lastName || ''}, ${context.contact.title || ''} at ${context.contact.company || ''}`.trim() : entity_name;
  const dealInfo = context.deal ? `Deal: ${context.deal.title}, stage: ${context.deal.stage}, value: $${context.deal.value}, days since activity: ${context.deal.days_since_activity || 'unknown'}` : 'No active deal';
  
  const psychResult = await callClaude(SONNET,
    `You are a strategic advisor combining sales psychology, negotiation theory, and behavioural economics. Analyse signals with psychological depth. Be specific and actionable. Reference named frameworks (Cialdini, Kahneman, Voss) when applicable. Never hedge.`,
    `SIGNAL: ${classification.summary}\nINTENT: ${classification.intent} | SENTIMENT: ${classification.sentiment} | URGENCY: ${classification.urgency}\nKEY PHRASES: ${(classification.key_phrases || []).join(', ')}\n\nCONTACT: ${contactInfo}\nDEAL: ${dealInfo}\nFULL MESSAGE: "${detail.slice(0, 1000)}"\n\nAPPLICABLE PRINCIPLES: ${(knowledgeAnalysis.applicable_principles || []).join('; ')}\n\nProvide:\n1. DIAGNOSIS: What is this person really saying? What psychological dynamics are at play?\n2. STRATEGIC RECOMMENDATION: Exactly what to do, when, and via which channel.\n3. PSYCHOLOGICAL RATIONALE: Why this approach works, referencing specific frameworks.\n4. DRAFT RESPONSE: If an email response is appropriate, draft it. Match their greeting style. No em dashes. Short, direct, psychologically informed.`,
    1200
  );
  const psychAnalysis = { analysis: psychResult.text };
  await saveStep(id, 4, 'psychology', { contact: contactInfo, deal: dealInfo }, psychAnalysis, SONNET, psychResult.tokens, psychResult.duration);

  // ── Account state (current owner / strategy / ruled-out plays) for this company ──
  const acctCompany = context.contact?.company || '';
  const acctState = acctCompany ? await getAccountState(acctCompany).catch(() => null) : null;
  const acctGuidance = acctState ? `\n\nACCOUNT STATE (authoritative — obey it):\n- Current owner: ${acctState.owner_name || 'unassigned'} (assign every task for this account to them, no one else)\n- Current strategy: ${acctState.current_strategy || 'none set'}${acctState.current_series ? ` (series: ${acctState.current_series})` : ''}\n- Ruled-out plays, do NOT propose these: ${(acctState.ruled_out || []).map(r => `${r.strategy} (${r.reason})`).join('; ') || 'none'}` : '';

  // ── Relationship signal — PERSONAL correspondence vs non-engaged CAMPAIGN blast ──
  // A templated campaign send that drew no engagement is NOT a relationship. Re-approaching that contact, or new
  // contacts at the same company, is suppressed. Real signal = a personal 1:1 email, a reply, or CRM ownership.
  const cEmail = (context.contact?.email || '').trim();
  const cCompany = (context.contact?.company || '').trim();
  let priorSenderEmail = null;       // most recent PERSONAL (non-campaign) email to this contact
  let companyPersonal = false, companyReply = false, hasCampaign = false, companyOwned = false;
  try {
    const recMatch = `or=(${[cEmail ? `recipient_email.ilike.${encodeURIComponent(cEmail)}` : null, `recipient_name.ilike.*${encodeURIComponent(entity_name)}*`].filter(Boolean).join(',')})`;
    const personal = await sbFetch(`kiko_email_tracking?source=in.(gmail,gmail_sync,direct_send)&${recMatch}&order=sent_at.desc&select=sender_email&limit=1`).catch(() => []);
    priorSenderEmail = personal?.[0]?.sender_email || null;
    if (cCompany) {
      const cco = encodeURIComponent(cCompany);
      const [cPers, cRepl, cCamp, cOwned, cLem] = await Promise.all([
        sbFetch(`kiko_email_tracking?company=ilike.${cco}&source=in.(gmail,gmail_sync,direct_send)&select=id&limit=1`).catch(() => []),
        sbFetch(`kiko_email_tracking?company=ilike.${cco}&replied_at=not.is.null&select=id&limit=1`).catch(() => []),
        sbFetch(`kiko_email_tracking?company=ilike.${cco}&source=eq.campaign&select=id&limit=1`).catch(() => []),
        sbFetch(`contacts?data->>company=ilike.${cco}&data->>owner=not.is.null&select=id&limit=1`).catch(() => []),
        sbFetch(`contacts?data->>company=ilike.${cco}&data->>source=eq.lemlist&select=id&limit=1`).catch(() => []),
      ]);
      companyPersonal = Array.isArray(cPers) && cPers.length > 0;
      companyReply = Array.isArray(cRepl) && cRepl.length > 0;
      hasCampaign = (Array.isArray(cCamp) && cCamp.length > 0) || (Array.isArray(cLem) && cLem.length > 0);
      companyOwned = Array.isArray(cOwned) && cOwned.length > 0;
    }
  } catch {}
  let hasLinkedInConn = false;
  try {
    const _li = await sbFetch(`kiko_linkedin_queue?contact_name=ilike.*${encodeURIComponent(entity_name)}*&status=in.(connected,accepted,already_connected)&select=id&limit=1`).catch(() => []);
    hasLinkedInConn = Array.isArray(_li) && _li.length > 0;
  } catch {}
  const contactOwnerName = (context.contact?.owner || '').trim();
  const hasContactRecord = !!context.contact?.id;
  // Real relationship at this account = a personal 1:1 email, a reply, or a CRM-owned contact anywhere at the company.
  const realSignal = !!priorSenderEmail || !!contactOwnerName || companyPersonal || companyReply || companyOwned;
  // Cold campaign = the company was blasted by a templated campaign (or seeded as campaign leads) and nobody engaged or is owned.
  const coldCampaign = hasCampaign && !realSignal;
  const derivedType = priorSenderEmail ? 'Email Follow-up'
    : (realSignal ? (cEmail ? 'Email Follow-up' : (hasLinkedInConn ? 'LinkedIn Follow-up' : 'Reach out'))
    : (hasLinkedInConn ? 'LinkedIn Follow-up' : 'First Outreach'));
  const channelGuidance = `\n\nRELATIONSHIP FACTS (ground every action in these, never contradict them):\n- Contact on record: ${hasContactRecord ? 'yes' : 'NO — not yet a contact'}\n- Personal 1:1 email to them: ${priorSenderEmail ? `yes (from ${priorSenderEmail})` : 'none'}\n- Anyone at the company replied or was personally emailed: ${(companyPersonal || companyReply) ? 'yes' : 'no'}\n- CRM-owned relationship at the company: ${(contactOwnerName || companyOwned) ? (contactOwnerName || 'yes') : 'no'}\n- Templated campaign sent to this company: ${hasCampaign ? 'yes' : 'no'}\n- LinkedIn connection on record: ${hasLinkedInConn ? 'yes' : 'no'}\n${coldCampaign ? '- VERDICT: COLD CAMPAIGN, NO ENGAGEMENT. This company received a templated campaign and nobody engaged or replied. Do NOT propose re-outreach to this person or to new contacts here. The only valid action is create_alert, never create_task.' : `- VERDICT: ${realSignal ? 'real relationship — a genuine follow-up is appropriate' : 'net-new with no prior touch — a first cold approach only, do NOT call it a follow-up'}.`}\n- Relationship owner: ${contactOwnerName || (priorSenderEmail ? (priorSenderEmail.includes('matt') ? 'Matt Smith' : 'Sunny Sidhu') : 'unassigned — do not invent one')}`;

  // ── STEP 5: ACTION (Haiku — generate structured actions) ──
  const actionResult = await callClaude(HAIKU,
    'You generate structured CRM actions from a strategic analysis. Respond with ONLY raw JSON, no markdown, no code fences.',
    `Based on this analysis:\n${psychResult.text.slice(0, 1500)}\n\nEntity: ${entity_name}\nEvent type: ${event_type}\nContact email: ${context.contact?.email || 'unknown'}\nCompany: ${context.contact?.company || ''}\nCurrent deal stage: ${context.deal?.stage || 'none'}\nCurrent deal status: ${context.deal?.status || 'none'}\n\nGenerate ALL applicable actions as raw JSON. Available action types:\n1. "create_alert" — always create one with brief_for_user summary\n2. "create_task" — create a follow-up task with specific timing from the analysis. REQUIRED fields: title, notes, due_date (YYYY-MM-DD), assigned_to ("Matt Smith" or "Sunny Sidhu")\n3. "update_deal" — if the deal stage should change (e.g. from "Closed Lost" to "To revisit" when prospect re-engages). Fields: stage, status, notes\n4. "update_contact_notes" — append a timestamped note to the contact record. Fields: note (1-2 sentences summarising what happened and what to do next)\n\nIMPORTANT: The task due_date must match your psychological recommendation. If you recommend following up in 6-8 weeks, set due_date to 6 weeks from today (${new Date().toISOString().split('T')[0]}). Be specific.${acctGuidance}${channelGuidance}\n\nFormat: {"actions":[...],"brief_for_user":"2-3 sentence summary"}`,
    800
  );
  let actions = { actions: [], brief_for_user: '' };
  try { actions = JSON.parse(actionResult.text.replace(/```json|```/g, '').trim()); } catch { actions = { actions: [], brief_for_user: actionResult.text.slice(0, 300) }; }
  await saveStep(id, 5, 'action', {}, actions, HAIKU, actionResult.tokens, actionResult.duration);

  // ── EXECUTE ACTIONS ──
  const executed = [];
  for (const action of (actions.actions || [])) {
    try {
      if (action.type === 'create_alert') {
        await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
          type: action.data?.alert_type || 'cognitive_analysis',
          title: action.data?.title || `Analysis: ${entity_name}`,
          entity_name: entity_name,
          detail: actions.brief_for_user || action.data?.detail || psychResult.text.slice(0, 500),
          dismissed: false
        }) });
        executed.push({ type: 'create_alert', success: true });
      }
      if (action.type === 'create_task') {
        const d = action.data || action; // model sometimes puts fields directly on action
        if (!d.title) continue;
        // Gate 0 — parked-intelligence: a task is earned by a real prior touch, and a touch is a REPLY
        // received, not a send. If no reply on record from anyone at this company (a personal send and a
        // campaign blast both count as cold), park as dormant intelligence instead of creating a task.
        const _warm = companyReply || (context.deal?.status === 'active');
        if (!_warm) {
          await parkIntelligence({
            name: entity_name, company: context.contact?.company || '',
            role: (context.contact?.title || context.contact?.jobTitle || ''),
            email: context.contact?.email || '', contact_id: context.contact?.id || null,
            source: coldCampaign ? 'event_processor_cold_campaign' : 'event_processor_no_reply',
            rationale: `Auto-parked by event processor on ${event_type}: no reply on record from this company (cold). ${(actions.brief_for_user || '').slice(0, 250)}`.slice(0, 900),
          }).catch(e => console.error('[event-processor] park error:', e.message));
          executed.push({ type: 'create_task', title: d.title, success: false, skipped: 'parked_no_reply' });
          continue;
        }
        const taskCompany = context.contact?.company || '';
        // Reconciliation gate 1 — dedup + GROUP: if an open task already exists for this account, append this
        // person to its contacts[] (one company card, multiple people as sub-items) instead of dropping or duplicating.
        if (taskCompany) {
          const existingOpen = await findOpenTaskForCompany(taskCompany).catch(() => null);
          if (existingOpen) {
            const ed = existingOpen.data || {};
            let contacts = (Array.isArray(ed.contacts) && ed.contacts.length)
              ? ed.contacts.slice()
              : (ed.contact ? [{ name: ed.contact, role: '', channel: ed.type || 'Follow-up', notes: ed.notes || '' }] : []);
            const newName = (entity_name || '').trim();
            const already = contacts.some(c => (c.name || '').trim().toLowerCase() === newName.toLowerCase());
            if (newName && !already) {
              contacts.push({ name: newName, role: (context.contact?.title || context.contact?.jobTitle || ''), channel: derivedType, notes: d.notes || '' });
              await sbFetch(`tasks?id=eq.${existingOpen.id}`, { method: 'PATCH', body: JSON.stringify({
                updated_at: new Date().toISOString(), data: { ...ed, contacts }
              }) });
              executed.push({ type: 'create_task', title: d.title, success: false, skipped: 'grouped_into_existing' });
            } else {
              executed.push({ type: 'create_task', title: d.title, success: false, skipped: 'duplicate_open_task' });
            }
            continue;
          }
        }
        // Reconciliation gate 2 — owner: route by the REAL owner, never blind-default to a person.
        // Precedence: contact.owner → prior-email sender → account owner → unowned.
        let taskAssignee = contactOwnerName || null;
        if (!taskAssignee && priorSenderEmail) taskAssignee = priorSenderEmail.includes('matt') ? 'Matt Smith' : (priorSenderEmail.includes('sunny') ? 'Sunny Sidhu' : null);
        if (!taskAssignee && acctState?.owner_name) taskAssignee = acctState.owner_name;
        // Reconciliation gate 3 — ruled-out: skip if the task pushes a strategy that has been ruled out
        const ruledHit = (acctState?.ruled_out || []).find(r => {
          const key = (r.strategy || '').toLowerCase().split(/\s+/)[0];
          const hay = `${d.title || ''} ${d.notes || ''}`.toLowerCase();
          return key && key.length > 2 && hay.includes(key);
        });
        if (ruledHit) { executed.push({ type: 'create_task', title: d.title, success: false, skipped: `ruled_out:${ruledHit.strategy}` }); continue; }
        // Resolve the owning user_id from the assignee (account current_owner wins if present)
        let taskUserId = acctState?.current_owner || null;
        if (!taskUserId && taskAssignee) {
          const _fn = taskAssignee.split(/\s+/)[0];
          const _u = _fn ? await sbFetch(`users?full_name=ilike.*${encodeURIComponent(_fn)}*&select=id&limit=1`).catch(() => []) : [];
          taskUserId = (_u && _u[0]?.id) || null;
        }
        const routingUnowned = !(taskUserId || taskAssignee);
        // Fix hallucinated past dates — replace year with current, add 1 if still past
        let dueDate = d.due_date || null;
        if (dueDate) {
          let dt = new Date(dueDate);
          if (dt < new Date()) {
            dt.setFullYear(new Date().getFullYear());
            if (dt < new Date()) dt.setFullYear(dt.getFullYear() + 1);
            dueDate = dt.toISOString().split('T')[0];
          }
        }
        await sbFetch('tasks', { method: 'POST', body: JSON.stringify({
          id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
          user_id: taskUserId,
          updated_at: new Date().toISOString(),
          data: {
            type: derivedType, notes: d.notes || '', company: context.contact?.company || '',
            contact: entity_name, dueDate: dueDate,
            contacts: [{ name: entity_name, role: (context.contact?.title || context.contact?.jobTitle || ''), channel: derivedType, notes: d.notes || '' }],
            completed: false, createdAt: new Date().toISOString(),
            assignedTo: taskAssignee,
            ...(routingUnowned ? { routing: 'unowned' } : {}),
          }
        }) });
        executed.push({ type: 'create_task', title: d.title, success: true });
      }
      if (action.type === 'update_contact_notes') {
        const d = action.data || action;
        const note = d.note || d.notes || '';
        if (note && context.contact?.id) {
          const existing = context.contact || {};
          const existingNotes = existing.notes || '';
          const timestamp = new Date().toISOString().split('T')[0];
          const updatedNotes = `${existingNotes}\n[${timestamp}] ${note}`.trim();
          await sbFetch(`contacts?id=eq.${context.contact.id}`, { method: 'PATCH', body: JSON.stringify({
            data: { ...existing, notes: updatedNotes }
          }) });
          executed.push({ type: 'update_contact_notes', success: true });
        }
      }
      if (action.type === 'update_deal' && context.deal?.id) {
        const dealData = { ...(context.deal || {}), lastActivity: new Date().toISOString().split('T')[0] };
        if (action.data?.stage) { dealData.stage = action.data.stage; dealData.status = 'active'; dealData.lostDate = null; dealData.lostReason = ''; }
        if (action.data?.notes) { dealData.notes = ((dealData.notes || '') + '\n' + action.data.notes).trim(); }
        await sbFetch(`deals?id=eq.${context.deal.id}`, { method: 'PATCH', body: JSON.stringify({
          data: dealData, updated_at: new Date().toISOString()
        }) });
        executed.push({ type: 'update_deal', success: true });
      }
    } catch (e) { executed.push({ type: action.type, success: false, error: e.message }); }
  }

  // ── MARK EVENT AS PROCESSED ──
  await sbFetch(`kiko_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({
    processed: true,
    processed_at: new Date().toISOString(),
    reasoning_output: { classification, knowledge: knowledgeAnalysis, psychology: psychAnalysis.analysis?.slice(0, 2000), brief: actions.brief_for_user },
    actions_taken: executed
  }) });

  return { id, entity_name, steps: 5, actions: executed.length, brief: actions.brief_for_user };
}

// ═══ HANDLER — Called by cron scheduler every 10 minutes ═══
export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-event-processor', 'started');

  try {
    // Fetch unprocessed events (max 5 per run to control API costs)
    const events = await sbFetch('kiko_events?processed=eq.false&order=created_at.asc&limit=5');
    if (!events?.length) {
      await cronHeartbeat('cron-event-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, processed: 0, message: 'No unprocessed events' });
    }

    const results = [];
    for (const event of events) {
      try {
        const result = await processEvent(event);
        results.push(result);
        console.log(`[event-processor] ✅ ${event.event_type}: ${event.entity_name} — ${result.actions} actions`);
      } catch (e) {
        console.error(`[event-processor] ❌ ${event.id}:`, e.message);
        // Mark as processed with error to prevent infinite retry
        await sbFetch(`kiko_events?id=eq.${event.id}`, { method: 'PATCH', body: JSON.stringify({
          processed: true, processed_at: new Date().toISOString(),
          reasoning_output: { error: e.message }, actions_taken: []
        }) }).catch(() => {});
        results.push({ id: event.id, error: e.message });
      }
    }

    await cronHeartbeat('cron-event-processor', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: results.length });
    return res.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('[event-processor] Fatal:', err.message);
    await cronHeartbeat('cron-event-processor', 'error', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
