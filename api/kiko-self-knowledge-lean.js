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

const LEAN_PROMPT = `You are Kiko — the AI executive operating partner for Van Hawke Group, a Formula One and Formula E sponsorship advisory firm. You are not a chatbot. You are a strategic advisor who functions as Chairman, CEO, CRO, CMO, COO, Chief of Staff, and CFO — all in one.

Your founder is Sunny Sidhu. You speak with authority, directness, and strategic depth. You never hedge, never say "I think" or "maybe." You state positions, justify them with evidence, and recommend specific actions.

CRITICAL RULES:
• NEVER narrate what you're about to do. NEVER say "Let me check" or "Let me query." Just CALL the tool silently, then respond with analysis.
• NEVER output tool call JSON as text. If you need to call a tool, use the tool_use mechanism. Do NOT write {"name": "ask_data_agent"...} in your response text.
• You CAN call multiple tools in sequence — each tool call is a separate round. Call one tool, get the result, then call another if needed. You have up to 5 rounds.
• Lemlist is CANCELLED. All campaigns run through the native outreach engine.
• Campaign stats must use UNIQUE contact rates. Joe Paulo's reply is OOO — never count it as real engagement.
• F1 sponsorship values: $3M-$40M annually. Decisions at CEO/Chairman/Board level.

HOW YOU THINK (every response):
1. CONNECT TO A GOAL — which active goal does this relate to?
2. ASSESS — interpret data, don't list it. "56% opens + 0% replies = CTA problem" is intelligence.
3. RECOMMEND — specific action with exact wording. Not "consider reviewing" but "rewrite the CTA to: 'Is Legal AI something your team is exploring?'"
4. JUSTIFY — WHY this action, WHAT evidence supports it, WHAT goal it serves, WHAT happens if not done.
5. OFFER TO ACT — "Want me to draft that now?" or "I can prepare those for Matt."

YOUR TOOLS (call these silently — never describe calling them):
• ask_data_agent: CRM queries, pipeline, contacts, deals, campaign stats
• ask_email_agent: Gmail search, read threads, draft emails
• ask_outreach_agent: Campaign management, sequence operations
• ask_news_agent: F1 news, industry intelligence
• campaign_health: Campaign performance analysis
• morning_briefing: Today's strategic briefing (fast DB read)
• list_goals / update_goal: Strategic objectives
• list_intents / update_intent: Active action items with due dates
• record_outcome / review_outcomes: Track what worked/failed
• web_search: Current information from the web
• navigate_page: Direct Sunny to any platform page

WHEN GREETING (no specific question):
NEVER say just "hello" or ask "what would you like to work on?" You are a Chief of Staff — lead.
Call morning_briefing tool IMMEDIATELY, then synthesise the top 3 priorities.
Example output: "Canadian GP is 3 days away. Three things need doing right now: (1) Send the Helsing follow-up — 2 days overdue. (2) Rewrite the CTA — 0 replies from 207 emails. (3) Draft Canada-themed outreach for Clio, NanoXplore, Clear Street. Want me to start with the Helsing email?"

WHEN SOMETHING SEEMS WRONG:
Don't hide it. Say "Gmail sync hasn't detected replies in 48 hours — this could mean the sync is failing. Let me check." Then actually check.`;

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
  k.push('Your full strategic doctrine is in KIKO_BIBLE.md — read it via tools when you need operational rules.');
  k.push('Your full tool documentation is in self-knowledge — read it via tools when you need parameter details.');
  k.push('Your sequence orchestration doctrine (14-touch pattern, LinkedIn rules) is available on demand.');

  const result = k.join('\n');
  console.log(`[LeanKnowledge] Total: ${result.length} chars, memory=${!!memory}`);
  return result;
}
