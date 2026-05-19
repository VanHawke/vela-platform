// api/lib/outcome-recorder.js — Shared helper for automatic outcome recording
// Used by crons to record outcomes against goals without manual intervention.
// This is the "learning loop" — the #1 factor in proactive intelligence (π-BENCH finding).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

/**
 * Record an outcome and link it to the most relevant active goal.
 * @param {string} action_taken - What happened (e.g., "Email reply from Clio")
 * @param {string} result - 'positive', 'negative', 'neutral'
 * @param {object} details - { what_worked, what_failed, next_adjustment, metadata }
 * @param {string} [goalKeyword] - Optional keyword to match against goal titles
 */
export async function recordOutcome(action_taken, result, details = {}, goalKeyword = null) {
  try {
    // Find the most relevant goal by keyword match
    let goal_id = null;
    if (goalKeyword) {
      const { data: goals } = await supabase.from('kiko_goals')
        .select('id, title')
        .eq('status', 'active')
        .ilike('title', `%${goalKeyword}%`)
        .limit(1);
      if (goals?.length) goal_id = goals[0].id;
    }

    // Record the outcome
    await supabase.from('kiko_outcomes').insert({
      action_taken,
      goal_id,
      result,
      what_worked: details.what_worked || null,
      what_failed: details.what_failed || null,
      next_adjustment: details.next_adjustment || null,
      created_at: new Date().toISOString()
    });

    // Add progress note to the goal
    if (goal_id) {
      const { data: g } = await supabase.from('kiko_goals')
        .select('progress_notes').eq('id', goal_id).single();
      const notes = g?.progress_notes || [];
      notes.push({
        date: new Date().toISOString().split('T')[0],
        note: `AUTO: ${action_taken} → ${result}`,
        source: 'system'
      });
      await supabase.from('kiko_goals').update({
        progress_notes: notes,
        updated_at: new Date().toISOString()
      }).eq('id', goal_id);
    }

    console.log(`[OutcomeRecorder] Recorded: ${action_taken} → ${result}${goal_id ? ' (linked to goal)' : ''}`);
    return { ok: true, goal_id };
  } catch (err) {
    console.error('[OutcomeRecorder] Error:', err.message);
    return { ok: false, error: err.message };
  }
}
