// api/lib/memory-retrieval.js — Global memory search across outcomes and learned patterns
// This is Layer 3 of the three-layer memory hierarchy (from PASK research).
// Layer 1 (User Memory): goals, preferences, style — loaded into system prompt
// Layer 2 (Workspace Memory): current conversation context window
// Layer 3 (Global Memory): THIS — semantic search over past outcomes and learning log
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

/**
 * Search global memory for relevant past context.
 * @param {string} query - What we're looking for (e.g., "how did we handle CTA changes before?")
 * @param {number} limit - Max results per source
 * @returns {object} - { outcomes: [], learnings: [], intents: [] }
 */
export async function searchMemory(query, limit = 3) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5);
  if (!keywords.length) return { outcomes: [], learnings: [], intents: [] };

  const results = { outcomes: [], learnings: [], intents: [] };

  try {
    // Search outcomes — what worked and what didn't
    for (const kw of keywords.slice(0, 3)) {
      const { data } = await supabase.from('kiko_outcomes')
        .select('action_taken, result, what_worked, what_failed, next_adjustment, created_at')
        .or(`action_taken.ilike.%${kw}%,what_worked.ilike.%${kw}%,what_failed.ilike.%${kw}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (data?.length) {
        for (const d of data) {
          if (!results.outcomes.find(o => o.action_taken === d.action_taken)) {
            results.outcomes.push(d);
          }
        }
      }
    }

    // Search learning log — patterns from past sessions
    for (const kw of keywords.slice(0, 3)) {
      const { data } = await supabase.from('kiko_learning_log')
        .select('topic, content, confidence, created_at')
        .or(`topic.ilike.%${kw}%,content.ilike.%${kw}%`)
        .order('confidence', { ascending: false })
        .limit(limit);
      if (data?.length) {
        for (const d of data) {
          if (!results.learnings.find(l => l.topic === d.topic)) {
            results.learnings.push(d);
          }
        }
      }
    }

    // Search completed intents — what actions we've taken before
    for (const kw of keywords.slice(0, 2)) {
      const { data } = await supabase.from('kiko_intents')
        .select('title, status, context, next_action, last_actioned_at')
        .eq('status', 'completed')
        .ilike('title', `%${kw}%`)
        .order('last_actioned_at', { ascending: false })
        .limit(limit);
      if (data?.length) {
        for (const d of data) {
          if (!results.intents.find(i => i.title === d.title)) {
            results.intents.push(d);
          }
        }
      }
    }
  } catch (err) {
    console.error('[MemoryRetrieval] Error:', err.message);
  }

  // Deduplicate and limit
  results.outcomes = results.outcomes.slice(0, limit);
  results.learnings = results.learnings.slice(0, limit);
  results.intents = results.intents.slice(0, limit);

  return results;
}

/**
 * Format memory results for injection into a prompt.
 */
export function formatMemoryContext(memory) {
  const parts = [];
  if (memory.outcomes?.length) {
    parts.push('PAST OUTCOMES:');
    for (const o of memory.outcomes) {
      parts.push(`• ${o.action_taken} → ${o.result}${o.what_worked ? ' (worked: ' + o.what_worked.slice(0, 60) + ')' : ''}`);
    }
  }
  if (memory.learnings?.length) {
    parts.push('\nLEARNED PATTERNS:');
    for (const l of memory.learnings) {
      parts.push(`• [${l.topic}] ${(l.content || '').slice(0, 100)}`);
    }
  }
  if (memory.intents?.length) {
    parts.push('\nPAST ACTIONS TAKEN:');
    for (const i of memory.intents) {
      parts.push(`• ${i.title} → ${i.status}`);
    }
  }
  return parts.join('\n');
}
