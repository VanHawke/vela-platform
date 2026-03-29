// api/cron-self-improvement.js — Kiko Self-Improvement Analysis
// Runs weekly. Analyses performance data, identifies weaknesses, writes recommendations.
// The recommendations are stored and Sunny can review them.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';
import fs from 'fs';
import path from 'path';

export const config = { maxDuration: 90 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-self-improvement', 'started');
  try {
    // Gather performance data
    const [outputs, errors, corrections, heartbeats, winLoss] = await Promise.all([
      sbFetch('kiko_output_tracking?select=agent,intent,created_at&order=created_at.desc&limit=200'),
      sbFetch('kiko_error_log?select=component,message,severity,created_at&order=created_at.desc&limit=30'),
      sbFetch('kiko_learning_log?category=eq.correction&order=created_at.desc&limit=20&select=content'),
      sbFetch('kiko_cron_heartbeats?select=cron_name,status,duration_ms&order=started_at.desc&limit=50'),
      sbFetch('kiko_win_loss_analysis?select=lessons&order=created_at.desc&limit=10'),
    ]);

    // Build analysis context
    let context = 'KIKO PERFORMANCE DATA:\n\n';

    // Agent usage
    const agentCounts = {};
    for (const o of (outputs || [])) { agentCounts[o.agent || o.intent] = (agentCounts[o.agent || o.intent] || 0) + 1; }
    context += `AGENT USAGE:\n${Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).map(([a, c]) => `  ${a}: ${c}`).join('\n')}\n`;

    // Errors
    const errorCounts = {};
    for (const e of (errors || [])) { errorCounts[e.component] = (errorCounts[e.component] || 0) + 1; }
    context += `\nERRORS:\n${Object.entries(errorCounts).map(([c, n]) => `  ${c}: ${n}`).join('\n') || '  None'}\n`;
    if (errors?.length) context += `Recent: ${errors.slice(0, 5).map(e => `[${e.component}] ${e.message?.slice(0, 80)}`).join('; ')}\n`;

    // Corrections (user rephrased)
    if (corrections?.length) {
      context += `\nCORRECTIONS (${corrections.length} — user had to rephrase):\n`;
      for (const c of corrections.slice(0, 10)) context += `  ${c.content.slice(0, 150)}\n`;
    }

    // Cron health
    const cronStats = {};
    for (const h of (heartbeats || [])) {
      if (!cronStats[h.cron_name]) cronStats[h.cron_name] = { runs: 0, errors: 0 };
      cronStats[h.cron_name].runs++;
      if (h.status === 'error') cronStats[h.cron_name].errors++;
    }
    const failingCrons = Object.entries(cronStats).filter(([, s]) => s.errors > 0);
    if (failingCrons.length) context += `\nFAILING CRONS: ${failingCrons.map(([n, s]) => `${n} (${s.errors}/${s.runs} failed)`).join(', ')}\n`;

    // Win/loss lessons
    const lessons = (winLoss || []).flatMap(w => w.lessons || []);
    if (lessons.length) context += `\nWIN/LOSS LESSONS: ${[...new Set(lessons)].slice(0, 10).join('; ')}\n`;

    // Scan codebase for architecture context
    try {
      const agentDir = path.join(process.cwd(), 'api', 'agents');
      const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
      context += `\nARCHITECTURE: ${agentFiles.length} agents, `;
      const cronFiles = fs.readdirSync(path.join(process.cwd(), 'api')).filter(f => f.startsWith('cron-'));
      context += `${cronFiles.length} crons\n`;
    } catch {}

    // Generate improvement recommendations
    const analysis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: `You are Kiko, an AI OS, analysing your own performance data to identify improvements. You run an F1 sponsorship advisory + luxury eyewear business for Sunny Sidhu.

Generate a self-improvement report with:
1. TOP 3 ISSUES: What's broken or underperforming, with specific evidence from the data
2. TOP 3 OPPORTUNITIES: New capabilities or patterns that would help based on usage data
3. AGENT GAPS: Are there query types being routed to "general" that should have a specialist agent? If so, define what agent to create.
4. CRON HEALTH: Any crons failing that need attention
5. LEARNING GAPS: Based on corrections, what does Kiko misunderstand that needs training?

Be specific and actionable. Reference actual data points.

Return JSON: { "issues": [{ "title": "...", "evidence": "...", "fix": "..." }], "opportunities": [{ "title": "...", "description": "...", "impact": "high|medium|low" }], "suggested_agents": [{ "name": "...", "description": "...", "trigger_keywords": ["..."] }], "cron_issues": ["..."], "learning_gaps": ["..."] }`,
      messages: [{ role: 'user', content: context }],
    });

    try {
      const parsed = JSON.parse((analysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim());

      // Store recommendations in memories
      const reportContent = `# Kiko Self-Improvement Report — ${new Date().toISOString().split('T')[0]}\n\n## Issues\n${(parsed.issues || []).map(i => `### ${i.title}\n${i.evidence}\n**Fix:** ${i.fix}`).join('\n\n')}\n\n## Opportunities\n${(parsed.opportunities || []).map(o => `### ${o.title} [${o.impact}]\n${o.description}`).join('\n\n')}\n\n## Learning Gaps\n${(parsed.learning_gaps || []).join('\n- ')}`;

      await sbFetch('kiko_memories?path=eq./memories/self_improvement.md', {
        method: 'PATCH', body: JSON.stringify({ content: reportContent, updated_at: new Date().toISOString() })
      }).catch(async () => {
        await sbFetch('kiko_memories', { method: 'POST', body: JSON.stringify({
          path: '/memories/self_improvement.md', content: reportContent,
          is_directory: false, org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
        })});
      });

      // Auto-create suggested dynamic agents
      let agentsCreated = 0;
      for (const agent of (parsed.suggested_agents || []).slice(0, 2)) {
        if (!agent.name || !agent.description) continue;
        try {
          const { createDynamicAgent } = await import('./agents/dynamic-runner.js');
          const result = await createDynamicAgent({
            name: agent.name.toLowerCase().replace(/\s+/g, '_'),
            display_name: agent.name,
            description: agent.description,
            system_prompt: `You are a specialist agent for: ${agent.description}. Provide specific, actionable answers for Van Hawke Group.`,
            trigger_keywords: agent.trigger_keywords || [],
            category: 'auto_created',
          });
          if (result.success) agentsCreated++;
        } catch {}
      }

      // Write improvement alert
      await sbFetch('kiko_alerts', { method: 'POST', body: JSON.stringify({
        type: 'self_improvement', severity: 'medium',
        title: `Kiko Self-Improvement: ${(parsed.issues || []).length} issues, ${(parsed.opportunities || []).length} opportunities`,
        detail: `Issues: ${(parsed.issues || []).map(i => i.title).join(', ')}. Opportunities: ${(parsed.opportunities || []).map(o => o.title).join(', ')}.${agentsCreated ? ` Auto-created ${agentsCreated} new agent(s).` : ''}`,
        entity_type: 'system', entity_name: 'Kiko Self-Improvement',
        metadata: { ...parsed, agents_created: agentsCreated },
        expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      })});

      // Store lessons in learning log
      for (const gap of (parsed.learning_gaps || []).slice(0, 3)) {
        await sbFetch('kiko_learning_log', { method: 'POST', body: JSON.stringify({
          user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063', category: 'self_improvement',
          content: `Learning gap identified: ${gap}`, entity_name: 'kiko',
        })});
      }

      await cronHeartbeat('cron-self-improvement', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: (parsed.issues || []).length + (parsed.opportunities || []).length });
      return res.status(200).json({ ok: true, issues: (parsed.issues || []).length, opportunities: (parsed.opportunities || []).length, agents_created: agentsCreated });
    } catch {
      await cronHeartbeat('cron-self-improvement', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart });
      return res.status(200).json({ ok: true, message: 'Analysis ran but parse failed' });
    }
  } catch (err) {
    await logError('cron:self-improvement', err.message);
    await cronHeartbeat('cron-self-improvement', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
