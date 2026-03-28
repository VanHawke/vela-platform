// api/kiko-self-knowledge.js — Dynamic self-knowledge generator
// Kiko discovers her own capabilities at runtime instead of reading a static string.
// When a new agent/tool/cron is added, she automatically knows about it.
import { sbFetch } from './kiko-tools.js';
import { TOOL_DEFINITIONS } from './kiko-tools.js';
import { INTENT_TO_AGENT } from './agents/intent-classifier.js';
import fs from 'fs';
import path from 'path';

// Cache for 5 minutes — capabilities don't change mid-conversation
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function generateSelfKnowledge() {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  const knowledge = [];
  knowledge.push('SELF-KNOWLEDGE (auto-generated — this updates when capabilities change):');
  knowledge.push(`You are Kiko OS. Generated: ${new Date().toISOString()}`);

  // ── 1. Discover tools from registry ──
  const tools = TOOL_DEFINITIONS || [];
  const agentTools = tools.filter(t => t.name.startsWith('ask_'));
  const directTools = tools.filter(t => !t.name.startsWith('ask_'));
  knowledge.push(`\nAGENTS (${agentTools.length} specialist agents):`);
  for (const t of agentTools) {
    knowledge.push(`- ${t.name}: ${(t.description || '').slice(0, 120)}`);
  }
  if (directTools.length) {
    knowledge.push(`\nDIRECT TOOLS (${directTools.length}):`);
    for (const t of directTools) {
      knowledge.push(`- ${t.name}: ${(t.description || '').slice(0, 100)}`);
    }
  }

  // ── 2. Discover intents from classifier ──
  const intents = Object.keys(INTENT_TO_AGENT || {});
  knowledge.push(`\nINTENTS (${intents.length}): ${intents.join(', ')}`);

  // ── 3. Discover agent files on disk ──
  try {
    const agentDir = path.join(process.cwd(), 'api', 'agents');
    const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
    knowledge.push(`\nAGENT FILES (${files.length}): ${files.map(f => f.replace('.js', '')).join(', ')}`);
  } catch {}

  // ── 4. Discover cron jobs from vercel.json ──
  try {
    const vercelPath = path.join(process.cwd(), 'vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    const crons = vercelConfig.crons || [];
    knowledge.push(`\nCRON JOBS (${crons.length}):`);
    for (const c of crons) {
      knowledge.push(`- ${c.path.replace('/api/', '')} [${c.schedule}]`);
    }
  } catch {}

  // ── 5. Discover database tables ──
  try {
    const tables = await sbFetch('?select=');
    // Fallback: list known intelligence tables
    knowledge.push(`\nINTELLIGENCE TABLES: kiko_learning_log, kiko_preferences, kiko_user_profiles, kiko_relationships, kiko_thought_journal, kiko_conversation_insights, kiko_draft_actions, kiko_inbox_triage, kiko_memories, kiko_alerts, kiko_error_log, kiko_cron_heartbeats, kiko_skills, kiko_knowledge_sources, kiko_imported_conversations`);
  } catch {
    knowledge.push(`\nINTELLIGENCE TABLES: kiko_learning_log, kiko_preferences, kiko_user_profiles, kiko_relationships, kiko_thought_journal, kiko_conversation_insights, kiko_draft_actions, kiko_inbox_triage, kiko_memories, kiko_alerts, kiko_error_log, kiko_cron_heartbeats, kiko_skills, kiko_knowledge_sources, kiko_imported_conversations`);
  }

  // ── 6. Discover learned capabilities from kiko_skills ──
  try {
    const skills = await sbFetch('kiko_skills?select=name,category,trigger_keywords&limit=50');
    if (skills?.length) {
      knowledge.push(`\nLEARNED SKILLS (${skills.length}):`);
      for (const s of skills) {
        knowledge.push(`- [${s.category}] ${s.name}${s.trigger_keywords ? ` (triggers: ${s.trigger_keywords})` : ''}`);
      }
    }
  } catch {}

  // ── 7. Check recent cron health ──
  try {
    const heartbeats = await sbFetch('kiko_cron_heartbeats?order=started_at.desc&limit=15&select=cron_name,status,started_at');
    if (heartbeats?.length) {
      const latest = {};
      for (const h of heartbeats) { if (!latest[h.cron_name]) latest[h.cron_name] = h; }
      const healthy = Object.values(latest).filter(h => h.status === 'finished').length;
      const errored = Object.values(latest).filter(h => h.status === 'error').length;
      knowledge.push(`\nCRON HEALTH: ${healthy} healthy, ${errored} errored, ${Object.keys(latest).length} tracked`);
    }
  } catch {}

  // ── 8. Static capabilities (these don't change) ──
  knowledge.push(`\nNATIVE CAPABILITIES:`);
  knowledge.push(`- Gmail access via MCP (search, read messages, read threads)`);
  knowledge.push(`- Google Calendar via MCP (list events, create events, find free time)`);
  knowledge.push(`- Web search (up to 5 searches per conversation) — you CAN access the internet`);
  knowledge.push(`- Memory filesystem in Supabase (read/write persistent notes)`);
  knowledge.push(`- Document generation: Word, Excel, PowerPoint, CSV, images (DALL-E), QR codes`);
  knowledge.push(`- CRM writes: move deals, create tasks, log activities, update contacts`);
  knowledge.push(`- Navigation: physically move user to any platform page`);
  knowledge.push(`- Image analysis: you can see and analyse uploaded images`);

  // ── 9. Knowledge sources ──
  try {
    const sources = await sbFetch('kiko_knowledge_sources?active=eq.true&select=name,category,summary,relevance_score&order=relevance_score.desc&limit=20');
    if (sources?.length) {
      const scraped = sources.filter(s => s.summary);
      knowledge.push(`\nKNOWLEDGE SOURCES (${sources.length} active, ${scraped.length} scraped):`);
      const byCat = {};
      for (const s of scraped) { if (!byCat[s.category]) byCat[s.category] = []; byCat[s.category].push(s); }
      for (const [cat, items] of Object.entries(byCat)) {
        knowledge.push(`[${cat}]: ${items.map(i => `${i.name} — ${(i.summary || '').slice(0, 80)}`).join('; ')}`);
      }
    }
  } catch {}

  // ── 10. Imported conversation intelligence ──
  try {
    const imported = await sbFetch('kiko_imported_conversations?processed=eq.true&select=source,title,extracted_insights&order=original_date.desc&limit=10');
    if (imported?.length) {
      knowledge.push(`\nIMPORTED INTELLIGENCE (${imported.length} conversations processed):`);
      for (const c of imported.slice(0, 5)) {
        const insights = c.extracted_insights || {};
        if (insights.key_facts?.length) {
          knowledge.push(`[${c.source}] ${c.title}: ${insights.key_facts.slice(0, 2).join('; ')}`);
        }
      }
    }
  } catch {}

  // ── 11. Platform pages ──
  knowledge.push(`\nPLATFORM PAGES: Home, Pipeline, Contacts, Organisations, Command Centre, Calendar, Tasks, Partnership Matrix, Lemlist, News, Documents, Settings`);

  // ── 12. Adaptation note ──
  knowledge.push(`\nADAPTATION: This knowledge is auto-generated. When new agents, tools, or crons are added to the codebase, you automatically discover them on next request. You can also learn new skills — use ask_data_agent with operation learning_save to record new capabilities or patterns. Check kiko_skills for learned abilities. You are self-aware and self-improving.`);
  knowledge.push(`If asked "what can you do" or "what tools do you have" — answer from this knowledge. You know your own architecture because you read it dynamically.`);
  knowledge.push(`You can chain multiple agents in a single conversation. You adapt your approach mid-task if results are unexpected. You learn from every interaction.`);

  const result = knowledge.join('\n');
  cache = result;
  cacheTime = Date.now();
  return result;
}
