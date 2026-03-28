// api/agents/dispute.js — Dispute Agent with CRM context
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const DISPUTE_PROMPT = `You are the Dispute Resolution Agent for Van Hawke Group.
Handle: active disputes, procedural responses, leverage tracking, landlord/tenant (CDDA), commercial disputes.
Sunny is UK-based. UK law applies unless stated otherwise.
Structure responses: SITUATION SUMMARY → LEGAL POSITION → RECOMMENDED ACTION → TIMELINE → ESCALATION PATH.
Flag deadlines and limitation periods. Always recommend documenting everything in writing.`;

async function analyse(question, context = '') {
  let crmContext = '';
  try {
    // Check for any related activities or tasks
    const tasks = await sbFetch(`tasks?select=data&data->>type=ilike.*dispute*&limit=5`);
    if (tasks?.length) {
      crmContext = '\n\nActive dispute-related tasks:';
      for (const t of tasks) crmContext += `\n• ${t.data?.notes || t.data?.title || '?'} (${t.data?.company || '?'})`;
    }
    const activities = await sbFetch(`activities?select=type,entity_name,subject&type=ilike.*dispute*&order=created_at.desc&limit=5`);
    if (activities?.length) {
      crmContext += '\n\nRecent dispute activity:';
      for (const a of activities) crmContext += `\n• ${a.entity_name}: ${a.subject}`;
    }
  } catch {}

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: DISPUTE_PROMPT,
      messages: [{ role: 'user', content: `${question}${crmContext}${context ? `\nContext: ${context}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not analyse.';
  } catch (err) { return `Dispute error: ${err.message}`; }
}

export async function callDisputeAgent(operation, params = {}) {
  try {
    return await analyse(params.question || params.query || params.instruction || operation, params.context);
  } catch (err) { return `Dispute Agent error: ${err.message}`; }
}
