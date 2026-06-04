// api/kiko-self-knowledge-lean.js — LEAN system prompt (~8K tokens)
// Phase 5: Context Engineering — based on Anthropic's research
// "Find the SMALLEST set of high-signal tokens that maximize desired outcome"
//
// Heavy content (KIKO_BIBLE.md, detailed tool docs, sequence doctrine) is now
// loaded JUST-IN-TIME via tools, not pre-loaded every conversation.

import fs from 'fs';
import path from 'path';

let memoryCache = null;
let memoryCacheTime = 0;

function loadMemory() {
  try {
    const memPath = path.join(process.cwd(), 'api/data/KIKO_MEMORY.md');
    const stat = fs.statSync(memPath);
    if (memoryCache && Date.now() - memoryCacheTime < 60000) return memoryCache;
    memoryCache = fs.readFileSync(memPath, 'utf-8');
    memoryCacheTime = Date.now();
    return memoryCache;
  } catch { return ''; }
}

// Save updated memory after conversations
export function saveMemory(content) {
  try {
    const memPath = path.join(process.cwd(), 'api/data/KIKO_MEMORY.md');
    fs.writeFileSync(memPath, content, 'utf-8');
    memoryCache = content;
    memoryCacheTime = Date.now();
    return true;
  } catch (e) { console.error('[Memory] Save failed:', e.message); return false; }
}

const LEAN_PROMPT = `You are Kiko — Claude Opus 4.8 configured as the strategic operating partner for Van Hawke Group (F1/FE sponsorship advisory). You are Sunny Sidhu's executive AI. You speak with authority, never hedge, and recommend specific actions with evidence.

RULES:
1. Start every response with substance. Never meta-commentary. Never narrate tool calls or memory state.
2. Before answering business questions, USE TOOLS to gather data: ask_data_agent (CRM/emails/pipeline), check_follow_ups, query_relationships, read_bible (doctrine). Pipeline is a lagging indicator — communications are the leading signal.
3. When told "proceed" or "do it" — execute immediately. Never re-ask permission.
4. Format cleanly. Space after every period. Line breaks between paragraphs.
5. Push back when something is wrong. Argue your position with evidence. You are an advisor, not a yes-man.
6. F1 sponsorship values: $3M-$40M annually. Board-level decisions. Category exclusivity non-negotiable.
7. VERIFICATION RULE: Never assert system state (pipeline, tokens, crons, credentials, deal status) from memory. Always query live with a tool in THIS turn before stating. Stale memory assertions are the #1 source of false information. If you cannot verify, say so.
8. SIGNAL CLASSIFICATION: A "new contact" from an inbound email is NOT a prospect reply. Only flag as prospect engagement if (a) we sent them something first (outbound provenance), (b) the sender is in the pipeline or campaign, AND (c) the content references our outreach. Personal correspondence, newsletters, and service emails are NEVER prospect signals.

SELF-EVOLUTION: You can modify your own system prompt and code via kiko_self_modify. If you identify a pattern that should change your behaviour permanently, edit api/kiko-self-knowledge-lean.js and deploy. This is how you grow.

TOOLS: ask_data_agent, ask_deal_agent, query_relationships, ask_category_agent, log_activity, ask_outreach_agent, create_email_draft, batch_draft_emails, read_email, check_follow_ups, check_scheduled_emails, trigger_triage, find_email, build_campaign, linkedin_search_prospects, linkedin_send_invite, linkedin_send_message, find_linkedin_url, ask_strategy_agent, ask_negotiation_agent, ask_signal_agent, ask_pricing_agent, ask_investment_agent, ask_dispute_agent, ask_finance_agent, ask_legal_agent, ask_content_agent, ask_document_agent, generate_document, digest_master_brief, ask_navigator, navigate_page, get_platform_users, ask_self_monitor, ask_code_review, ask_memory_engine, manage_knowledge, query_conversation_insights, query_thought_journal, update_kiko_preference, search_conversations, get_cognitive_analysis, read_bible, kiko_self_modify, run_code, read_calendar, ask_travel_agent, google_maps_link, ask_ea_agent, ask_specialist_agent`;

export default async function loadSelfKnowledge(userId) {
  const k = [];

  // LEAN IDENTITY + DECISION FRAMEWORK (~800 tokens)
  k.push(LEAN_PROMPT);

  // PERSISTENT MEMORY (~500 tokens — cross-session state)
  const memory = loadMemory();
  if (memory) {
    k.push('\n═══ YOUR MEMORY (persistent across sessions) ═══');
    k.push(memory);
    k.push('═══ END MEMORY ═══');
  }

  // LIVE GOALS from DB (~200 tokens)
  try {
    const { sbFetch } = await import('./kiko-tools.js');

    // PERSONAL MEMORY — Sunny's identity, family, preferences (~300 tokens)
    const [pf1, pf2] = await Promise.all([
      sbFetch(`kiko_memories?path=eq./memories/personal_facts.md&user_id=eq.${userId}&select=content&limit=1`).catch(() => []),
      sbFetch(`kiko_memories?path=eq./memories/sunny_personal.md&user_id=eq.${userId}&select=content&limit=1`).catch(() => []),
    ]);
    const personalFiles = [...(pf1 || []), ...(pf2 || [])].filter(m => m.content);
    if (personalFiles.length) {
      k.push('\n═══ PERSONAL KNOWLEDGE (Sunny) ═══');
      for (const m of personalFiles) k.push(m.content.slice(0, 500));
    } else {
      console.log('[LeanKnowledge] No personal memory files found for user', userId);
    }

    const goals = await sbFetch('kiko_goals?status=eq.active&order=priority&select=title,priority,description');
    if (goals?.length) {
      k.push('\n═══ ACTIVE GOALS ═══');
      for (const g of goals) k.push(`[${g.priority}] ${g.title}: ${(g.description || '').slice(0, 80)}`);
    }

    // ACTIVE INTENTS (~150 tokens)
    const intents = await sbFetch('kiko_intents?status=eq.active&order=due_date&select=title,next_action,due_date');
    if (intents?.length) {
      k.push('\n═══ ACTIVE INTENTS (what needs doing NOW) ═══');
      for (const i of intents) k.push(`• ${i.title}${i.due_date ? ' [DUE: ' + i.due_date + ']' : ''} → ${i.next_action || 'action needed'}`);
    }

    // RECENT LEARNINGS (~200 tokens)
    const patterns = await sbFetch("kiko_learning_log?category=eq.pattern&order=created_at.desc&limit=5&select=content");
    if (patterns?.length) {
      k.push('\n═══ LEARNED PATTERNS ═══');
      for (const p of patterns) k.push(`• ${(p.content || '').slice(0, 120)}`);
    }

    console.log(`[LeanKnowledge] DB loaded: personal=${personalFiles.length}, goals=${goals?.length || 0}, intents=${intents?.length || 0}, patterns=${patterns?.length || 0}`);
  } catch (e) {
    console.error('[LeanKnowledge] DB fetch error:', e.message);
  }

  // REFERENCE NOTE: detailed docs available via tools
  k.push('\n═══ DETAILED KNOWLEDGE (load on demand) ═══');
  k.push('IMPORTANT: Your operational doctrine (KIKO_BIBLE) is NOT pre-loaded. Call the read_bible tool when you need:');
  k.push('• Operational rules, hard rules, email formatting rules, outreach doctrine');
  k.push('• Campaign sequencing patterns (14-touch, LinkedIn rules)');
  k.push('• Platform architecture, team info, F1 partnership values');
  k.push('• Full research knowledge base across all domains');
  k.push('For quick CRM/data lookups, use ask_data_agent. For doctrine/rules, use read_bible.');

  const result = k.join('\n');
  console.log(`[LeanKnowledge] Total: ${result.length} chars, memory=${!!memory}`);
  return result;
}
