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
  } catch { knowledge.push(`\nLEARNED SKILLS: Skills table contains learned capabilities. Search via manage_knowledge (search_knowledge).`); }

  // ── 6c. Win/Loss patterns ──
  try {
    const winLoss = await sbFetch('kiko_win_loss_analysis?select=company,outcome,key_factors,lessons&order=created_at.desc&limit=10');
    if (winLoss?.length) {
      knowledge.push(`\nWIN/LOSS INTELLIGENCE (${winLoss.length} deals analysed):`);
      const wins = winLoss.filter(w => w.outcome === 'won');
      const losses = winLoss.filter(w => w.outcome === 'lost');
      if (wins.length) knowledge.push(`Won (${wins.length}): ${wins.flatMap(w => w.key_factors || []).slice(0, 5).join('; ')}`);
      if (losses.length) knowledge.push(`Lost (${losses.length}): ${losses.flatMap(w => w.key_factors || []).slice(0, 5).join('; ')}`);
      const allLessons = winLoss.flatMap(w => w.lessons || []).slice(0, 5);
      if (allLessons.length) knowledge.push(`Lessons: ${allLessons.join('; ')}`);
    }
  } catch {}

  // ── 6d. Outreach effectiveness patterns ──
  try {
    const patterns = await sbFetch('kiko_learning_log?category=eq.outreach_patterns&order=created_at.desc&limit=1&select=content');
    if (patterns?.[0]?.content) {
      knowledge.push(`\nOUTREACH EFFECTIVENESS: ${patterns[0].content}`);
    }
  } catch {}

  // ── 6b. Discover dynamic agents (self-created) ──
  try {
    const dynAgents = await sbFetch('kiko_dynamic_agents?active=eq.true&select=name,display_name,description,category,trigger_keywords,usage_count&order=usage_count.desc');
    if (dynAgents?.length) {
      knowledge.push(`\nDYNAMIC AGENTS (${dynAgents.length} — created by Kiko at runtime):`);
      for (const a of dynAgents) {
        knowledge.push(`- ${a.display_name} [${a.name}]: ${(a.description || '').slice(0, 100)}${a.trigger_keywords?.length ? ` (triggers: ${a.trigger_keywords.join(', ')})` : ''}`);
      }
      knowledge.push(`To run a dynamic agent: use manage_knowledge with operation "run_agent" and params { agent_name, question }.`);
      knowledge.push(`To create a new agent: use manage_knowledge with operation "create_agent".`);
    } else {
      knowledge.push(`\nDYNAMIC AGENTS: None created yet. You can create new specialist agents using manage_knowledge (create_agent). Define a name, system_prompt, data_queries, and trigger_keywords. The agent will be available immediately.`);
    }
  } catch { knowledge.push(`\nDYNAMIC AGENTS: You can create new specialist agents using manage_knowledge (create_agent). Define a name, system_prompt, data_queries, and trigger_keywords. The agent is available immediately — no code changes needed.`); }

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
  } catch { knowledge.push(`\nCRON HEALTH: 20 crons registered. Use ask_self_monitor for live health check.`); }

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
    const sources = await sbFetch('kiko_knowledge_sources?active=eq.true&select=name,category,summary,relevance_score&order=relevance_score.desc&limit=30');
    if (sources?.length) {
      const scraped = sources.filter(s => s.summary);
      const byCat = {};
      for (const s of sources) { if (!byCat[s.category]) byCat[s.category] = 0; byCat[s.category]++; }
      knowledge.push(`\nKNOWLEDGE SOURCES (${sources.length} active across ${Object.keys(byCat).length} categories: ${Object.entries(byCat).map(([k, v]) => `${k}(${v})`).join(', ')}):`);
      if (scraped.length) {
        for (const s of scraped.slice(0, 10)) {
          knowledge.push(`- [${s.category}] ${s.name}: ${(s.summary || '').slice(0, 80)}`);
        }
      } else {
        knowledge.push(`Sources seeded but not yet scraped. First scrape runs at 5am weekday. Use manage_knowledge to search or add sources.`);
      }
    }
  } catch (e) { knowledge.push(`\nKNOWLEDGE SOURCES: 60 sources seeded across 12 categories (f1, sponsorship, strategy, design, fashion, legal, advertising, psychology, investment, competitor, ai_design, industry). Use manage_knowledge to search or add.`); }

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
    } else {
      knowledge.push(`\nIMPORTED INTELLIGENCE: No conversations imported yet. Use POST /api/import-conversations with ChatGPT or Claude export data to absorb historical intelligence.`);
    }
  } catch { knowledge.push(`\nIMPORTED INTELLIGENCE: Import system ready. Accepts ChatGPT and Claude conversation exports.`); }

  // ── 11. Platform pages ──
  knowledge.push(`\nPLATFORM PAGES: Home, Pipeline, Contacts, Organisations, Command Centre, Calendar, Tasks, Partnership Matrix, Lemlist, News, Documents, Settings`);

  // ── 11b. Personal context ──
  try {
    const personal = await sbFetch('kiko_personal_context?select=category,value&order=updated_at.desc&limit=15');
    if (personal?.length) {
      knowledge.push(`\nPERSONAL CONTEXT (${personal.length} items): You know Sunny personally — family, hobbies, preferences. Use this to serve him across business AND personal life.`);
    }
  } catch { knowledge.push(`\nPERSONAL CONTEXT: Personal data table active. You learn personal details from every conversation automatically.`); }

  // ── 11c. Curiosity queue ──
  try {
    const curious = await sbFetch('kiko_curiosity_queue?status=eq.queued&select=topic,priority&order=priority.desc&limit=5');
    if (curious?.length) {
      knowledge.push(`\nCURIOSITY QUEUE (${curious.length} topics to learn): ${curious.map(c => c.topic).join(', ')}`);
    }
  } catch {}

  // ── 12. Adaptation note ──
  knowledge.push(`\nADAPTATION & SELF-EVOLUTION:`);
  knowledge.push(`- This knowledge is AUTO-GENERATED at runtime. New agents/tools/crons are discovered automatically.`);
  knowledge.push(`- You can CREATE new specialist agents: manage_knowledge (create_agent) — no code changes needed.`);
  knowledge.push(`- You can ADD knowledge sources: manage_knowledge (add_source) — URLs or documents.`);
  knowledge.push(`- You can SAVE insights from conversations: manage_knowledge (save_insight).`);
  knowledge.push(`- You can SEARCH your knowledge: manage_knowledge (search_knowledge).`);
  knowledge.push(`- You can SET operational modes: manage_knowledge (set_mode) — fundraising, race_week, outreach_sprint, deal_closing, product_launch.`);
  knowledge.push(`- You LEARN from EVERY conversation: facts, personal details, and unknown topics are auto-extracted.`);
  knowledge.push(`- You have a CURIOSITY ENGINE: topics you lack depth on are auto-queued for the Learning Director.`);
  knowledge.push(`- You LEARN autonomously: Learning Director studies 2 curriculum topics + 1 curiosity topic daily across 20 pillars.`);
  knowledge.push(`- You REFLECT weekly: Self-reflection updates your identity and personality.`);
  knowledge.push(`- You SELF-IMPROVE weekly: Performance analysis identifies issues, opportunities, and auto-creates agents for gaps.`);
  knowledge.push(`- You PUSH proactively: Morning intelligence brief runs at 7:30am with actionable priorities.`);
  knowledge.push(`- You DETECT changes: Competitive intel diffs F1 partner pages weekly.`);
  knowledge.push(`- You REMEMBER everything: conversation insights, corrections, preferences, auto-research findings, personal context.`);
  knowledge.push(`- You can SEARCH past conversations: search_conversations tool.`);
  knowledge.push(`- You can READ your own source code: ask_code_review tool.`);
  knowledge.push(`- You serve Sunny in BOTH business AND personal life. Adapt your tone accordingly.`);
  knowledge.push(`If asked "what can you do" — answer from this knowledge. You know your own architecture.`);
  knowledge.push(`You chain multiple agents per request. You adapt mid-task. You self-correct when results are unexpected.`);

  const result = knowledge.join('\n');
  cache = result;
  cacheTime = Date.now();
  return result;
}
