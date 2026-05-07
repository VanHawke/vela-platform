// api/cron-event-processor.js — Kiko's Cognitive Event Bus
// Processes signals through a 5-step reasoning chain:
// 1. CLASSIFY — categorise the signal (Haiku, fast)
// 2. CONTEXT — retrieve CRM/email context (DB lookup)
// 3. KNOWLEDGE — match relevant knowledge domains (Haiku)
// 4. PSYCHOLOGY — deep analysis with psychological reasoning (Sonnet)
// 5. ACTION — generate specific actions (Haiku)
// Runs every 10 minutes during business hours
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-20250514';

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
    `Signal: ${classification.summary}\nIntent: ${classification.intent}\nEntity: ${entity_name} (${context.contact?.job_title || ''} at ${context.contact?.company || ''})\nDeal stage: ${context.deal?.stage || 'none'}\n\nAvailable knowledge:\n${knowledge.slice(0, 4000)}\n\nRespond with JSON: {"applicable_principles":["principle1: brief explanation","principle2: brief explanation"],"recommended_approach":"one paragraph approach","relevant_domains":["domain1","domain2"]}`,
    600
  );
  let knowledgeAnalysis = {};
  try { knowledgeAnalysis = JSON.parse(knowledgeResult.text.replace(/```json|```/g, '').trim()); } catch { knowledgeAnalysis = { applicable_principles: [], recommended_approach: knowledgeResult.text.slice(0, 300) }; }
  await saveStep(id, 3, 'knowledge', { keywords: keywords.slice(0, 200) }, knowledgeAnalysis, HAIKU, knowledgeResult.tokens, knowledgeResult.duration);

  // ── STEP 4: PSYCHOLOGY (Sonnet — deep analysis) ──
  const contactInfo = context.contact ? `${context.contact.first_name} ${context.contact.last_name}, ${context.contact.job_title} at ${context.contact.company}` : entity_name;
  const dealInfo = context.deal ? `Deal: ${context.deal.title}, stage: ${context.deal.stage}, value: $${context.deal.value}, days since activity: ${context.deal.days_since_activity || 'unknown'}` : 'No active deal';
  
  const psychResult = await callClaude(SONNET,
    `You are a strategic advisor combining sales psychology, negotiation theory, and behavioural economics. Analyse signals with psychological depth. Be specific and actionable. Reference named frameworks (Cialdini, Kahneman, Voss) when applicable. Never hedge.`,
    `SIGNAL: ${classification.summary}\nINTENT: ${classification.intent} | SENTIMENT: ${classification.sentiment} | URGENCY: ${classification.urgency}\nKEY PHRASES: ${(classification.key_phrases || []).join(', ')}\n\nCONTACT: ${contactInfo}\nDEAL: ${dealInfo}\nFULL MESSAGE: "${detail.slice(0, 1000)}"\n\nAPPLICABLE PRINCIPLES: ${(knowledgeAnalysis.applicable_principles || []).join('; ')}\n\nProvide:\n1. DIAGNOSIS: What is this person really saying? What psychological dynamics are at play?\n2. STRATEGIC RECOMMENDATION: Exactly what to do, when, and via which channel.\n3. PSYCHOLOGICAL RATIONALE: Why this approach works, referencing specific frameworks.\n4. DRAFT RESPONSE: If an email response is appropriate, draft it. Match their greeting style. No em dashes. Short, direct, psychologically informed.`,
    1200
  );
  const psychAnalysis = { analysis: psychResult.text };
  await saveStep(id, 4, 'psychology', { contact: contactInfo, deal: dealInfo }, psychAnalysis, SONNET, psychResult.tokens, psychResult.duration);

  // ── STEP 5: ACTION (Haiku — generate structured actions) ──
  const actionResult = await callClaude(HAIKU,
    'You generate structured actions from a strategic analysis. Respond with ONLY raw JSON, no markdown, no code fences, no backticks.',
    `Based on this analysis:\n${psychResult.text.slice(0, 1500)}\n\nEntity: ${entity_name}\nEvent type: ${event_type}\nContact email: ${context.contact?.email || 'unknown'}\nCompany: ${context.contact?.company || ''}\n\nGenerate actions as raw JSON (NO markdown, NO code fences):\n{"actions":[{"type":"create_alert","data":{"alert_type":"cognitive_analysis","title":"brief title","detail":"2 sentences"}}],"brief_for_user":"2-3 sentence summary of what happened and why the recommended approach works psychologically"}`,
    600
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
      if (action.type === 'create_task' && action.data?.title) {
        await sbFetch('tasks', { method: 'POST', body: JSON.stringify({
          org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
          data: { title: action.data.title, company: context.contact?.company, contact: entity_name, dueDate: action.data.due_date, notes: action.data.notes, type: 'follow_up' }
        }) });
        executed.push({ type: 'create_task', success: true });
      }
      if (action.type === 'update_deal' && context.deal?.id) {
        await sbFetch(`deals?id=eq.${context.deal.id}`, { method: 'PATCH', body: JSON.stringify({
          stage: action.data?.stage || context.deal.stage,
          notes: action.data?.notes,
          updated_at: new Date().toISOString()
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
