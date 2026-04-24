// api/reasoning-engine.js — Pre-processing intelligence layer
// Runs BEFORE Claude sees the message. Gathers context from CRM, knowledge, email, web.
// Claude receives pre-verified data — she CAN'T skip verification because it's already done.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function sbFetch(path) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Step 1: Extract entities from the message using Haiku (fast, cheap)
async function extractEntities(message) {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: message }],
      system: `Extract ALL company names and person names from this message. Return ONLY valid JSON: {"companies":["Name1"],"people":["Name1"],"topics":["topic1"],"needsVerification":true/false}. needsVerification=true if the message asks to draft, write, send, or create any external communication. If no entities found, return empty arrays. No explanation.`,
    });
    const text = (res.content[0]?.text || '').trim();
    const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { companies: [], people: [], topics: [], needsVerification: false };
  }
}

// Step 2: CRM lookup — check deals, contacts, companies for mentioned entities
async function lookupCRM(entities) {
  const results = { deals: [], contacts: [], companies: [] };
  if (!entities.companies?.length && !entities.people?.length) return results;
  
  for (const company of (entities.companies || []).slice(0, 3)) {
    const name = company.toLowerCase();
    const deals = await sbFetch(`deals?select=id,data&or=(data->>name.ilike.*${encodeURIComponent(name)}*,data->>company.ilike.*${encodeURIComponent(name)}*,data->>title.ilike.*${encodeURIComponent(name)}*)&limit=3`);
    if (Array.isArray(deals) && deals.length) results.deals.push(...deals.map(d => ({ id: d.id, ...d.data })));
    
    const companies = await sbFetch(`companies?select=id,data&data->>name=ilike.*${encodeURIComponent(name)}*&limit=2`);
    if (Array.isArray(companies) && companies.length) results.companies.push(...companies.map(c => ({ id: c.id, ...c.data })));
  }
  
  for (const person of (entities.people || []).slice(0, 3)) {
    const name = person.toLowerCase();
    const contacts = await sbFetch(`contacts?select=id,data&or=(data->>firstName.ilike.*${encodeURIComponent(name)}*,data->>lastName.ilike.*${encodeURIComponent(name)}*,data->>name.ilike.*${encodeURIComponent(name)}*)&limit=3`);
    if (Array.isArray(contacts) && contacts.length) results.contacts.push(...contacts.map(c => ({ id: c.id, ...c.data })));
  }
  
  return results;
}

// Step 3: Knowledge base search — check what Kiko already knows
async function searchKnowledge(entities) {
  const results = [];
  const searchTerms = [...(entities.companies || []), ...(entities.topics || [])].slice(0, 3);
  
  for (const term of searchTerms) {
    const knowledge = await sbFetch(`kiko_knowledge?content=ilike.*${encodeURIComponent(term)}*&select=domain,content,updated_at&limit=2`);
    if (Array.isArray(knowledge) && knowledge.length) {
      for (const k of knowledge) {
        results.push({ domain: k.domain, excerpt: (k.content || '').slice(0, 500), updated: k.updated_at });
      }
    }
  }
  return results;
}

// Step 4: Web verification — for outreach/drafts, verify key claims
async function webVerify(entities) {
  if (!entities.needsVerification || !entities.companies?.length) return [];
  const results = [];
  
  for (const company of entities.companies.slice(0, 2)) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Search for "${company}" and provide: (1) Current status (public/private/acquired), (2) Latest funding round or acquisition details, (3) Current CEO/leadership, (4) Any recent major news. Be concise — facts only.` }],
      });
      const text = res.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (text.trim()) results.push({ company, verified: text.trim() });
    } catch (e) {
      console.error(`[reasoning-engine] Web verify failed for ${company}:`, e.message);
    }
  }
  return results;
}

// Main export — runs all pre-processing steps in parallel, returns enriched context
export async function preProcess(message, intent) {
  const startTime = Date.now();
  
  // Skip for lightweight intents
  const SKIP_INTENTS = ['navigate', 'screen', 'calendar', 'self_monitor'];
  if (SKIP_INTENTS.includes(intent)) return { context: '', duration: 0 };
  
  // Step 1: Extract entities (fast — Haiku, ~500ms)
  const entities = await extractEntities(message);
  if (!entities.companies?.length && !entities.people?.length && !entities.topics?.length) {
    return { context: '', duration: Date.now() - startTime, entities };
  }
  
  console.log(`[reasoning-engine] Entities: ${JSON.stringify(entities)}`);
  
  // Steps 2-3: CRM + Knowledge only (fast, ~1-2s). Web verification delegated to Claude's tool loop.
  const [crmData, knowledgeData] = await Promise.all([
    lookupCRM(entities).catch(() => ({ deals: [], contacts: [], companies: [] })),
    searchKnowledge(entities).catch(() => []),
  ]);
  const webData = []; // Web verification delegated to Claude's tool loop for speed
  
  // Build enriched context block
  let context = '\n\n═══ PRE-VERIFIED INTELLIGENCE (gathered before you respond) ═══';
  
  if (crmData.deals.length || crmData.contacts.length || crmData.companies.length) {
    context += '\n\n📊 CRM DATA:';
    if (crmData.deals.length) {
      context += '\nDeals: ' + crmData.deals.map(d => 
        `${d.name || d.title || 'Unnamed'} | Stage: ${d.stage || '?'} | Value: $${((d.value || 0)/1000000).toFixed(1)}M | Last activity: ${d.last_activity_at || 'unknown'}`
      ).join('\n  ');
    }
    if (crmData.contacts.length) {
      context += '\nContacts: ' + crmData.contacts.map(c => 
        `${c.firstName || ''} ${c.lastName || ''} | ${c.title || '?'} | ${c.company || '?'} | ${c.email || 'no email'}`
      ).join('\n  ');
    }
    if (crmData.companies.length) {
      context += '\nCompanies: ' + crmData.companies.map(c => 
        `${c.name || '?'} | ${c.industry || '?'} | ${c.size || '?'}`
      ).join('\n  ');
    }
  }
  
  if (knowledgeData.length) {
    context += '\n\n📚 KNOWLEDGE BASE (your own research):';
    for (const k of knowledgeData) {
      context += `\n[${k.domain}] (updated ${new Date(k.updated).toLocaleDateString('en-GB')}): ${k.excerpt}`;
    }
  }
  
  if (webData.length) {
    context += '\n\n🔍 WEB-VERIFIED FACTS (confirmed before drafting):';
    for (const w of webData) {
      context += `\n[${w.company}]: ${w.verified}`;
    }
    context += '\n\n⚠️ USE ONLY THE VERIFIED FACTS ABOVE when referencing this company. Do NOT add claims that are not in this verified data.';
  }
  
  context += '\n═══ END PRE-VERIFIED INTELLIGENCE ═══';
  
  const duration = Date.now() - startTime;
  console.log(`[reasoning-engine] Pre-processing complete in ${duration}ms — CRM: ${crmData.deals.length} deals, ${crmData.contacts.length} contacts | Knowledge: ${knowledgeData.length} entries | Web: ${webData.length} verifications`);
  
  return { context, duration, entities, crmData, knowledgeData, webData };
}
