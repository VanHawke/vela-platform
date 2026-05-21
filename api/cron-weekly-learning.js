// api/cron-weekly-learning.js — Phase 4: Outcome Learning
// Runs weekly (Sunday 8 PM). Analyses all outcomes from the past 7 days,
// identifies patterns, and stores learnings in kiko_learning_log.
// These learnings are then used by the morning synthesis and signal evaluator.
// From π-BENCH: "prior interaction history significantly aids proactive intent resolution"
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const start = Date.now();
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Gather all outcomes from the past week
    const [outcomes, campaignMetrics, goalProgress] = await Promise.all([
      supabase.from('kiko_outcomes')
        .select('action_taken, result, what_worked, what_failed, next_adjustment, created_at')
        .gte('created_at', since).order('created_at', { ascending: false }),
      // Campaign performance this week
      supabase.from('kiko_outreach_queue')
        .select('step_number, opens_count, clicks_count, reply_received_at, reply_type, sent_at')
        .eq('status', 'sent').gte('sent_at', since),
      // Goal updates this week
      supabase.from('kiko_goals')
        .select('title, priority, progress_notes, updated_at')
        .eq('status', 'active'),
    ]);

    const outcomesText = (outcomes.data || []).map(o =>
      `${o.created_at?.split('T')[0]}: ${o.action_taken} → ${o.result}${o.what_worked ? ' | Worked: ' + o.what_worked : ''}${o.what_failed ? ' | Failed: ' + o.what_failed : ''}`
    ).join('\n') || 'No outcomes recorded this week';

    const campaignData = campaignMetrics.data || [];
    const totalSent = campaignData.length;
    const totalOpened = campaignData.filter(e => e.opens_count > 0).length;
    const totalClicked = campaignData.filter(e => e.clicks_count > 0).length;
    const realReplies = campaignData.filter(e => e.reply_received_at && e.reply_type !== 'ooo').length;
    const oooReplies = campaignData.filter(e => e.reply_type === 'ooo').length;

    const goalsText = (goalProgress.data || []).map(g => {
      const recentNotes = (g.progress_notes || []).filter(n => new Date(n.date) >= new Date(since));
      return `${g.title} [${g.priority}]: ${recentNotes.length} updates this week${recentNotes.length ? ' — ' + recentNotes.map(n => n.note).join('; ') : ''}`;
    }).join('\n');

    // Ask Claude to identify patterns and learnings
    const analysisResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: `You are analysing one week of operational data for a Formula One sponsorship advisory firm to extract LEARNINGS — patterns that should change future behaviour.

OUTCOMES THIS WEEK:
${outcomesText}

CAMPAIGN PERFORMANCE THIS WEEK:
${totalSent} emails sent, ${totalOpened} opened (${totalSent ? Math.round(totalOpened/totalSent*100) : 0}%), ${totalClicked} clicked (${totalSent ? Math.round(totalClicked/totalSent*100) : 0}%), ${realReplies} real replies, ${oooReplies} OOO

GOAL PROGRESS:
${goalsText}

Extract 3-5 specific learnings in this EXACT format (one per line):
TOPIC: [short category] | LEARNING: [what we learned] | CONFIDENCE: [high/medium/low] | ACTION: [what to do differently next time]

Examples:
TOPIC: CTA Strategy | LEARNING: "Worth a brief conversation?" gets 0% reply rate despite 56% opens — prospects open but the ask is too aggressive | CONFIDENCE: high | ACTION: Switch to low-friction question CTA
TOPIC: Race Week Timing | LEARNING: Outreach sent 3 days before a race gets higher engagement than week-of | CONFIDENCE: medium | ACTION: Schedule race-week outreach for T-3 days

Only include learnings supported by the data. Do not fabricate patterns.` }]
    });

    const learningsText = analysisResp.content[0]?.text || '';
    console.log(`[WeeklyLearning] Analysis: ${learningsText.length} chars`);

    // Parse and store learnings
    const learnings = learningsText.split('\n').filter(l => l.includes('TOPIC:') && l.includes('LEARNING:'));
    let stored = 0;
    for (const line of learnings) {
      const topicMatch = line.match(/TOPIC:\s*([^|]+)/);
      const learningMatch = line.match(/LEARNING:\s*([^|]+)/);
      const confidenceMatch = line.match(/CONFIDENCE:\s*(\w+)/);
      const actionMatch = line.match(/ACTION:\s*(.+)/);

      if (topicMatch && learningMatch) {
        await supabase.from('kiko_learning_log').insert({
          category: 'pattern',
          content: `[${topicMatch[1].trim()}] ${learningMatch[1].trim()}${actionMatch ? ' | ACTION: ' + actionMatch[1].trim() : ''}`,
          entity_name: `weekly-learning-${new Date().toISOString().split('T')[0]}`,
          created_at: new Date().toISOString()
        });
        stored++;
      }
    }

    console.log(`[WeeklyLearning] ${stored} learnings stored (${Date.now() - start}ms)`);

    // DREAMING: Update KIKO_MEMORY.md with new patterns + prune stale entries
    try {
      const fs = await import('fs');
      const path = await import('path');
      const memPath = path.join(process.cwd(), 'api/data/KIKO_MEMORY.md');
      let mem = fs.readFileSync(memPath, 'utf-8');

      // Get the latest 5 patterns from DB
      const { data: latestPatterns } = await supabase.from('kiko_learning_log')
        .select('content').eq('category', 'pattern')
        .order('created_at', { ascending: false }).limit(5);

      if (latestPatterns?.length) {
        // Replace the LEARNED PATTERNS section
        const startMarker = '## LEARNED PATTERNS';
        const endMarker = '## RECENT DECISIONS';
        const startIdx = mem.indexOf(startMarker);
        const endIdx = mem.indexOf(endMarker);
        if (startIdx >= 0 && endIdx > startIdx) {
          const newPatterns = latestPatterns.map(p => `- ${(p.content || '').slice(0, 150)}`).join('\n');
          mem = mem.slice(0, startIdx) + `${startMarker}\n${newPatterns}\n\n` + mem.slice(endIdx);
        }
      }

      // Update timestamp
      mem = mem.replace(/Last updated: .*/, `Last updated: ${new Date().toISOString()}`);
      fs.writeFileSync(memPath, mem, 'utf-8');
      console.log(`[WeeklyLearning] KIKO_MEMORY.md updated with ${latestPatterns?.length || 0} patterns`);
    } catch (e) {
      console.error('[WeeklyLearning] Memory update error:', e.message);
    }

    return res.json({ ok: true, learnings_stored: stored, duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[WeeklyLearning] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}
