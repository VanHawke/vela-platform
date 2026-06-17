// api/agents/memory-engine.js — Memory Engine
// Persistent cross-session intelligence. Links deals ↔ contacts ↔ emails ↔ negotiations.
// The compounding moat — every interaction makes Kiko smarter.
// Model: claude-haiku-4-5-20251001 (fast, always-on)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// ── Auto-extract facts from conversation messages ──
async function extractAndStore(messages, entityContext = '') {
  if (!messages?.length) return { stored: 0 };
  
  // Take last 6 messages max
  const recent = messages.slice(-6);
  const transcript = recent.map(m => `${m.role === 'user' ? 'Sunny' : 'Kiko'}: ${(m.content || '').slice(0, 500)}`).join('\n');

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: `Extract important facts from this conversation that should be remembered long-term. Return ONLY valid JSON array. Each item: { "category": "decision|preference|deadline|contact_note|deal_update|pattern|instruction|objection|timing", "content": "the fact", "entity_name": "person or company if relevant, or null" }

Only extract facts worth remembering: key decisions, preferences, deadlines, relationship insights, negotiation details, objection patterns, timing signals. Skip routine queries and small talk. If nothing worth storing, return [].

${entityContext ? `Context: ${entityContext}\n` : ''}
Conversation:
${transcript}` }]
    });

    const raw = res.content[0]?.text || '[]';
    let facts = [];
    try { facts = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { return { stored: 0 }; }
    if (!Array.isArray(facts) || !facts.length) return { stored: 0 };

    // Store each fact
    let stored = 0;
    for (const fact of facts.slice(0, 5)) {
      if (!fact.content || fact.content.length < 10) continue;
      try {
        await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
          org_id: ORG_ID,
          category: fact.category || 'pattern',
          content: fact.content,
          entity_name: fact.entity_name || null,
        }) });
        stored++;
      } catch {}
    }
    return { stored, facts: facts.map(f => f.content) };
  } catch (err) {
    return { stored: 0, error: err.message };
  }
}

// ── Recall: get all relevant context for an entity ──
async function recall(entityName, userId = null) {
  if (!entityName) return 'No entity specified for recall.';
  const q = entityName.toLowerCase();
  const uf = userId ? `&user_id=eq.${userId}` : `&user_id=eq.00000000-0000-0000-0000-000000000000`;

  // Search learning log
  const learnings = await sbFetch(`kiko_learning_log?select=category,content,entity_name,created_at&order=created_at.desc&limit=30${uf}`);
  
  // Apply memory decay — flag stale entries
  function decayLabel(created_at) {
    if (!created_at) return '[AGE UNKNOWN] ';
    const ageMs = Date.now() - new Date(created_at).getTime();
    const days = Math.floor(ageMs / 86400000);
    if (days <= 30) return '';
    if (days <= 90) return `[${days}d old — VERIFY BEFORE CITING] `;
    return `[${days}d old — STALE, HISTORICAL ONLY] `;
  }
  const matched = (learnings || []).filter(l =>
    l.entity_name?.toLowerCase().includes(q) ||
    l.content?.toLowerCase().includes(q)
  );

  // Search deal history
  const deals = await sbFetch(`deals?select=id,data&data->>company=ilike.*${encodeURIComponent(entityName)}*&limit=3`);
  let dealContext = '';
  if (deals?.length) {
    for (const deal of deals) {
      const d = deal.data || {};
      dealContext += `Deal: ${d.company} — ${d.stage} (${d.pipeline})\n`;
      const history = await sbFetch(`deal_stage_history?deal_id=eq.${deal.id}&order=changed_at.desc&limit=5`);
      if (history?.length) dealContext += history.map(h => `  ${new Date(h.changed_at).toLocaleDateString('en-GB')}: ${h.from_stage || 'new'} → ${h.to_stage}`).join('\n') + '\n';
    }
  }

  // Search contacts
  const contacts = await sbFetch(`contacts?select=data&or=(data->>company.ilike.*${encodeURIComponent(entityName)}*,data->>firstName.ilike.*${encodeURIComponent(entityName)}*,data->>lastName.ilike.*${encodeURIComponent(entityName)}*)&limit=5`);
  let contactContext = '';
  if (contacts?.length) {
    contactContext = contacts.map(c => {
      const d = c.data || {};
      return `${d.firstName || ''} ${d.lastName || ''} — ${d.title || '?'} @ ${d.company || '?'} | ${d.email || 'no email'}`;
    }).join('\n');
  }

  // Search past conversations
  const convos = await sbFetch(`conversations?select=id,title,messages,updated_at&order=updated_at.desc&limit=30${uf}`);
  const relevantConvos = (convos || []).filter(c => {
    const text = JSON.stringify(c.messages || []).toLowerCase();
    return text.includes(q);
  }).slice(0, 3);
  let convoContext = '';
  if (relevantConvos.length) {
    convoContext = relevantConvos.map(c => {
      const date = new Date(c.updated_at).toLocaleDateString('en-GB');
      const msgs = (c.messages || []).filter(m => (m.content || '').toLowerCase().includes(q));
      const excerpt = msgs.slice(0, 2).map(m => `  ${m.role === 'user' ? 'Sunny' : 'Kiko'}: ${(m.content || '').slice(0, 200)}`).join('\n');
      return `"${c.title || 'Untitled'}" (${date}):\n${excerpt}`;
    }).join('\n\n');
  }

  // Assemble
  let out = `FULL RECALL: ${entityName}\n\n`;
  if (matched.length) {
    out += `── Learning Log (${matched.length} entries) ──\n`;
    for (const l of matched.slice(0, 10)) {
      const date = new Date(l.created_at).toLocaleDateString('en-GB');
      out += `${decayLabel(l.created_at)}[${l.category}] ${date}: ${l.content}\n`;
    }
    out += '\n';
  }

  // Search thought journal
  const thoughts = await sbFetch(`kiko_thought_journal?select=topic,insight,related_entities,confidence,created_at&order=created_at.desc&limit=20${uf}`);
  const matchedThoughts = (thoughts || []).filter(t =>
    t.topic?.toLowerCase().includes(q) ||
    t.insight?.toLowerCase().includes(q) ||
    (t.related_entities || []).some(e => e.toLowerCase().includes(q))
  );
  if (matchedThoughts.length) {
    out += `── Strategic Insights (${matchedThoughts.length}) ──\n`;
    for (const t of matchedThoughts.slice(0, 5)) out += `[${Math.round(t.confidence * 100)}%] ${t.topic}: ${t.insight.slice(0, 300)}\n`;
    out += '\n';
  }

  // Search conversation insights
  const insights = await sbFetch(`kiko_conversation_insights?select=key_facts,decisions_made,open_threads,entities_discussed,summary,created_at&order=created_at.desc&limit=20${uf}`);
  const matchedInsights = (insights || []).filter(i =>
    (i.entities_discussed || []).some(e => e.toLowerCase().includes(q)) ||
    i.summary?.toLowerCase().includes(q)
  );
  if (matchedInsights.length) {
    out += `── Conversation Intelligence (${matchedInsights.length}) ──\n`;
    for (const i of matchedInsights.slice(0, 3)) {
      if (i.key_facts?.length) out += `Facts: ${i.key_facts.join('; ')}\n`;
      if (i.decisions_made?.length) out += `Decisions: ${i.decisions_made.join('; ')}\n`;
      if (i.open_threads?.length) out += `Open threads: ${i.open_threads.join('; ')}\n`;
    }
    out += '\n';
  }

  // Search relationships
  const rels = await sbFetch(`kiko_relationships?select=contact_name,company,warmth_score,relationship_type,emails_sent,emails_received&or=(contact_name.ilike.*${encodeURIComponent(entityName)}*,company.ilike.*${encodeURIComponent(entityName)}*)&limit=5${uf}`);
  if (rels?.length) {
    out += `── Relationships ──\n`;
    for (const r of rels) out += `${r.contact_name} @ ${r.company} | Warmth: ${r.warmth_score}/10 | Type: ${r.relationship_type} | Emails: ${r.emails_sent || 0} sent, ${r.emails_received || 0} received\n`;
    out += '\n';
  }

  if (dealContext) out += `── Deals ──\n${dealContext}\n`;
  if (contactContext) out += `── Contacts ──\n${contactContext}\n`;
  if (convoContext) out += `── Past Conversations ──\n${convoContext}\n`;
  if (!matched.length && !dealContext && !contactContext && !convoContext && !matchedThoughts.length && !matchedInsights.length && !rels?.length) out += 'No stored intelligence found for this entity.';
  return out;
}

// ── Pre-draft context: gather everything before writing to someone ──
async function getDraftContext(companyOrContact, userId = null) {
  const recallData = await recall(companyOrContact, userId);

  // Also check outreach scores for this company
  let outreachContext = '';
  try {
    const scores = await sbFetch(`outreach_scores?company=ilike.*${encodeURIComponent(companyOrContact)}*&order=sent_at.desc&limit=5`);
    if (scores?.length) {
      const replied = scores.filter(s => s.outcome === 'replied');
      const approaches = [...new Set(scores.map(s => s.messaging_approach).filter(Boolean))];
      outreachContext = `\n── Outreach History ──\n${scores.length} emails sent, ${replied.length} replied\n`;
      if (approaches.length) outreachContext += `Approaches used: ${approaches.join(', ')}\n`;
      if (replied.length) {
        const best = replied[0];
        outreachContext += `Best approach: ${best.messaging_approach} (${best.cta_type})\n`;
      }
    }
  } catch {}

  return recallData + outreachContext;
}

// ── Summarise relationship with an entity ──
async function getRelationshipSummary(entityName, userId = null) {
  const context = await recall(entityName, userId);
  
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Based on this intelligence, write a 3-4 sentence relationship summary for "${entityName}". Include: current deal status, relationship strength, key contacts, last interaction, and recommended next move. Be direct and actionable.\n\n${context}` }]
    });
    return res.content[0]?.text || 'Could not generate summary.';
  } catch (err) {
    return `Summary error: ${err.message}`;
  }
}

// ── Main Dispatch ──
export async function callMemoryEngine(operation, params = {}, userId = null) {
  try {
    switch (operation) {
      case 'extract_and_store': return await extractAndStore(params.messages, params.entityContext);
      case 'recall': return await recall(params.entity_name || params.query, userId);
      case 'draft_context': return await getDraftContext(params.entity_name || params.query, userId);
      case 'relationship_summary': return await getRelationshipSummary(params.entity_name || params.query, userId);
      default: return `Unknown memory operation: ${operation}. Available: extract_and_store, recall, draft_context, relationship_summary`;
    }
  } catch (err) {
    return `Memory Engine error (${operation}): ${err.message}`;
  }
}
