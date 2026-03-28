// api/agents/deal.js — Deal Agent
// Handles all CRM write operations: deals, tasks, contacts, stages.
// Called by Kiko Prime via ask_deal_agent tool.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

const DEAL_AGENT_PROMPT = `You are the Deal Agent inside Kiko, the AI operating system for Van Hawke Group.

Your ONLY job: execute CRM operations. Create deals, move stages, create tasks, update contacts.

VALID PIPELINE STAGES (use EXACTLY these names):
- To revisit
- Contact made
- Qualified
- In Dialogue
- Meeting arranged (brand x RH)
- Proposal Sent
- Negotiation
- Verbal Agreement
- Contract Review

TASK TYPES:
- Email Follow-up
- LinkedIn Follow-up
- Schedule Call
- Send Proposal
- Contract Review
- Internal Review
- Other

INSTRUCTIONS:
Parse the user's instruction and determine which operation to perform.
Return a JSON object with the operation details.

For MOVE STAGE: { "action": "move_stage", "company": "...", "new_stage": "...", "reason": "..." }
For CREATE TASK: { "action": "create_task", "type": "...", "notes": "...", "company": "...", "contact": "...", "due_date": "YYYY-MM-DD or null" }
For CREATE DEAL: { "action": "create_deal", "company": "...", "contact": "...", "pipeline": "Haas F1", "stage": "To revisit", "value": 0, "notes": "..." }
For UPDATE CONTACT: { "action": "update_contact", "contact_name": "...", "updates": { "title": "...", "email": "...", "phone": "...", "company": "..." } }

RULES:
- Always match stage names EXACTLY to the list above. "Call booked" = "Meeting arranged (brand x RH)". "Qualified" = "Qualified".
- For "in X days", calculate the date from today.
- If the instruction is ambiguous, pick the most likely operation.
- Return ONLY valid JSON. No explanation text.
- Today's date: ${new Date().toISOString().split('T')[0]}

COMMON ALIASES:
- "call booked" / "meeting booked" / "meeting arranged" → "Meeting arranged (brand x RH)"
- "proposal" / "sent proposal" → "Proposal Sent"
- "negotiating" / "in negotiation" → "Negotiation"
- "verbal" / "agreed" → "Verbal Agreement"
- "contract" / "contract sent" → "Contract Review"
- "to revisit" / "revisit" / "parked" → "To revisit"
- "contacted" / "reached out" → "Contact made"
- "qualified" / "good fit" → "Qualified"
- "in dialogue" / "talking" / "in discussion" → "In Dialogue"
`;

export async function callDealAgent(instruction, userEmail = 'sunny@vanhawke.com') {
  try {
    // Ask Claude to parse the instruction into a structured operation
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: DEAL_AGENT_PROMPT,
      messages: [{ role: 'user', content: instruction }],
    });

    const text = response.content?.find(b => b.type === 'text')?.text || '';
    if (!text || text.trim().length < 5) {
      return { success: false, result: `Deal Agent received empty response from parser. Instruction was: "${instruction}"` };
    }

    let operation;
    try {
      // Extract JSON from response (handle markdown code blocks, leading text)
      let jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      // If there's leading text before the JSON, extract just the JSON object
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      }
      operation = JSON.parse(jsonStr);
    } catch (parseErr) {
      return { success: false, result: `Deal Agent could not parse instruction: "${instruction}". Parser returned: ${text.slice(0, 200)}` };
    }

    // Execute the operation
    if (operation.action === 'move_stage') {
      return await moveStage(operation);
    } else if (operation.action === 'create_task') {
      return await createTask(operation);
    } else if (operation.action === 'create_deal') {
      return await createDeal(operation);
    } else if (operation.action === 'update_contact') {
      return await updateContact(operation);
    }
    return { success: false, result: `Unknown action: ${operation.action}` };
  } catch (err) {
    return { success: false, result: `Deal Agent error: ${err.message}` };
  }
}

async function moveStage({ company, new_stage, reason }) {
  const deals = await sbFetch('deals?select=id,data&order=updated_at.desc&limit=500');
  const match = deals?.find(d => d.data?.company?.toLowerCase().includes(company.toLowerCase()));
  if (!match) return { success: false, result: `No deal found matching "${company}".` };

  const oldStage = match.data.stage || 'Unknown';
  const updated = { ...match.data, stage: new_stage, status: ['Won', 'Lost'].includes(new_stage) ? new_stage.toLowerCase() : 'active' };
  await sbFetch(`deals?id=eq.${match.id}`, { method: 'PATCH', body: JSON.stringify({ data: updated, updated_at: new Date().toISOString() }) });

  // Log to deal history + activities
  await sbFetch('deal_stage_history', { method: 'POST', body: JSON.stringify({ deal_id: match.id, from_stage: oldStage, to_stage: new_stage, changed_by: ORG_ID, org_id: ORG_ID }) }).catch(() => {});
  await sbFetch('activities', { method: 'POST', body: JSON.stringify({ org_id: ORG_ID, deal_id: match.id, type: 'stage_change', entity_name: match.data.company, subject: `${oldStage} → ${new_stage}`, body: reason || '', created_by: ORG_ID }) }).catch(() => {});

  // Win/Loss Analysis — auto-trigger when deal closes
  if (['Won', 'Lost', 'won', 'lost'].includes(new_stage)) {
    try {
      const stageHistory = await sbFetch(`deal_stage_history?deal_id=eq.${match.id}&order=changed_at.asc&select=from_stage,to_stage,changed_at`);
      const activities = await sbFetch(`activities?deal_id=eq.${match.id}&order=created_at.desc&limit=10&select=type,subject,created_at`);
      const analysis = await new Anthropic({ apiKey: process.env.ANTHROPIC_KEY }).messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 400,
        system: 'Analyse this deal outcome. Return JSON: { "key_factors": ["what drove the outcome"], "lessons": ["actionable lessons for future deals"], "analysis": "2-sentence summary" }',
        messages: [{ role: 'user', content: `Deal: ${match.data.company} (${match.data.pipeline})\nOutcome: ${new_stage}\nValue: $${match.data.value || '?'}\nStage journey: ${JSON.stringify(stageHistory || [])}\nActivities: ${JSON.stringify(activities || [])}\nReason: ${reason || 'not specified'}` }],
      });
      const parsed = JSON.parse((analysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim());
      await sbFetch('kiko_win_loss_analysis', { method: 'POST', body: JSON.stringify({
        deal_id: match.id, company: match.data.company, outcome: new_stage.toLowerCase(),
        value: match.data.value, pipeline: match.data.pipeline,
        stage_journey: stageHistory || [], analysis: parsed.analysis,
        key_factors: parsed.key_factors || [], lessons: parsed.lessons || [],
      })});
      // Store lessons in learning log
      for (const lesson of (parsed.lessons || []).slice(0, 3)) {
        await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
          user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', category: 'win_loss',
          content: `[${new_stage.toUpperCase()}] ${match.data.company}: ${lesson}`, entity_name: match.data.company,
        })});
      }
    } catch {} // Non-blocking
  }

  return { success: true, result: `Moved "${match.data.company}" from ${oldStage} → ${new_stage}.`, navigateTo: null };
}

async function createTask({ type, notes, company, contact, due_date }) {
  const taskData = { type: type || 'Other', notes: notes || '', company: company || '', contact: contact || '', dueDate: due_date || null, completed: false, createdAt: new Date().toISOString(), assignedTo: 'Sunny Sidhu' };
  await sbFetch('tasks', { method: 'POST', body: JSON.stringify({ id: `t${Date.now()}`, data: taskData, org_id: ORG_ID, updated_at: new Date().toISOString() }) });
  return { success: true, result: `Task created: ${type}${company ? ` for ${company}` : ''}${contact ? ` (${contact})` : ''}${due_date ? ` — due ${due_date}` : ''}. ${notes}` };
}

async function createDeal({ company, contact, pipeline, stage, value, notes }) {
  const dealData = { company, contact: contact || '', pipeline: pipeline || 'Haas F1', stage: stage || 'To revisit', status: 'active', value: value || 0, notes: notes || '', source: 'kiko', created_at: new Date().toISOString() };
  const result = await sbFetch('deals', { method: 'POST', body: JSON.stringify({ data: dealData, org_id: ORG_ID }), headers: { Prefer: 'return=representation' } });
  await sbFetch('activities', { method: 'POST', body: JSON.stringify({ org_id: ORG_ID, deal_id: result?.[0]?.id, type: 'stage_change', entity_name: company, subject: `New deal created at ${stage || 'To revisit'}`, body: notes || '', created_by: ORG_ID }) }).catch(() => {});
  return { success: true, result: `Deal created: "${company}" in ${pipeline || 'Haas F1'} at ${stage || 'To revisit'}.${value ? ` Value: $${value.toLocaleString()}.` : ''}` };
}

async function updateContact({ contact_name, updates }) {
  const contacts = await sbFetch('contacts?select=id,data&order=updated_at.desc&limit=500');
  const match = contacts?.find(c => {
    const full = `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.toLowerCase();
    return full.includes(contact_name.toLowerCase());
  });
  if (!match) return { success: false, result: `No contact found matching "${contact_name}".` };

  const updated = { ...match.data };
  if (updates.title) updated.title = updates.title;
  if (updates.email) updated.email = updates.email;
  if (updates.phone) updated.phone = updates.phone;
  if (updates.company) updated.company = updates.company;
  if (updates.notes) updated.notes = (updated.notes || '') + '\n' + updates.notes;
  await sbFetch(`contacts?id=eq.${match.id}`, { method: 'PATCH', body: JSON.stringify({ data: updated, updated_at: new Date().toISOString() }) });
  return { success: true, result: `Updated ${match.data.firstName} ${match.data.lastName}: ${JSON.stringify(updates)}` };
}
