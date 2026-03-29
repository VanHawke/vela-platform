// api/agents/code-review.js — Kiko Code Self-Awareness Agent
// Reads Kiko's own source code and analyses it for improvements.
// This is what enables self-improvement recommendations.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function readOwnCode(filename) {
  try {
    const filePath = path.join(process.cwd(), 'api', filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch { return null; }
}

async function analyseArchitecture() {
  try {
    const agentDir = path.join(process.cwd(), 'api', 'agents');
    const cronFiles = fs.readdirSync(path.join(process.cwd(), 'api')).filter(f => f.startsWith('cron-'));
    const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
    
    let analysis = `KIKO CODEBASE ANALYSIS:\n\n`;
    analysis += `Core files: kiko.js, kiko-tools.js, kiko-self-knowledge.js\n`;
    analysis += `Agent files: ${agentFiles.length} (${agentFiles.join(', ')})\n`;
    analysis += `Cron files: ${cronFiles.length}\n\n`;

    // Analyse each agent for complexity and data access
    for (const f of agentFiles) {
      const code = fs.readFileSync(path.join(agentDir, f), 'utf-8');
      const lines = code.split('\n').length;
      const sbCalls = (code.match(/sbFetch/g) || []).length;
      const operations = (code.match(/case '/g) || []).length;
      analysis += `${f}: ${lines} lines, ${sbCalls} data queries, ${operations} operations\n`;
    }
    return analysis;
  } catch (e) { return `Architecture analysis error: ${e.message}`; }
}

async function reviewFile(filename) {
  const code = await readOwnCode(filename);
  if (!code) return `File not found: ${filename}`;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: `You are reviewing Kiko's own source code. Kiko is an AI operating system for Van Hawke Group. Analyse this file for:
1. BUGS: Anything that could fail silently, missing error handling, logic errors
2. PERFORMANCE: Unnecessary queries, slow patterns, missing caching
3. MISSING FEATURES: What this file should do but doesn't
4. IMPROVEMENTS: Specific code changes that would make it better
Be specific — reference line patterns, function names, variable names. Output actionable recommendations.`,
      messages: [{ role: 'user', content: `File: ${filename}\nLines: ${code.split('\n').length}\n\n${code.slice(0, 12000)}` }],
    });
    return `CODE REVIEW: ${filename}\n\n${res.content[0]?.text || 'No analysis generated.'}`;
  } catch (e) { return `Review error: ${e.message}`; }
}

async function getPerformanceAnalytics() {
  try {
    const [outputs, errors, heartbeats] = await Promise.all([
      sbFetch('kiko_output_tracking?select=agent,intent,created_at&order=created_at.desc&limit=200'),
      sbFetch('kiko_error_log?select=component,severity,created_at&order=created_at.desc&limit=50'),
      sbFetch('kiko_cron_heartbeats?select=cron_name,status,duration_ms,started_at&order=started_at.desc&limit=50'),
    ]);

    let report = 'KIKO PERFORMANCE ANALYTICS:\n\n';

    // Agent usage distribution
    const agentCounts = {};
    for (const o of (outputs || [])) { agentCounts[o.agent || o.intent] = (agentCounts[o.agent || o.intent] || 0) + 1; }
    const sorted = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]);
    report += `AGENT USAGE (last 200 interactions):\n`;
    for (const [agent, count] of sorted) report += `  ${agent}: ${count} (${(count / (outputs || []).length * 100).toFixed(0)}%)\n`;

    // Error rates
    const errorCounts = {};
    for (const e of (errors || [])) { errorCounts[e.component] = (errorCounts[e.component] || 0) + 1; }
    if (Object.keys(errorCounts).length) {
      report += `\nERROR HOTSPOTS:\n`;
      for (const [comp, count] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
        report += `  ${comp}: ${count} errors\n`;
      }
    } else { report += '\nNo errors logged.\n'; }

    // Cron performance
    if (heartbeats?.length) {
      report += `\nCRON PERFORMANCE:\n`;
      const cronStats = {};
      for (const h of heartbeats) {
        if (!cronStats[h.cron_name]) cronStats[h.cron_name] = { runs: 0, errors: 0, avgMs: 0, totalMs: 0 };
        cronStats[h.cron_name].runs++;
        if (h.status === 'error') cronStats[h.cron_name].errors++;
        if (h.duration_ms) { cronStats[h.cron_name].totalMs += h.duration_ms; }
      }
      for (const [name, stats] of Object.entries(cronStats)) {
        const avg = stats.totalMs ? Math.round(stats.totalMs / stats.runs) : '?';
        report += `  ${name}: ${stats.runs} runs, ${stats.errors} errors, avg ${avg}ms\n`;
      }
    }
    return report;
  } catch (e) { return `Analytics error: ${e.message}`; }
}

async function suggestImprovements() {
  try {
    const [arch, perf] = await Promise.all([analyseArchitecture(), getPerformanceAnalytics()]);
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      system: `You are Kiko analysing your own architecture and performance data. Identify the TOP 5 improvements that would make you more useful to Sunny (CEO of Van Hawke Group, F1 sponsorship advisory + luxury eyewear). Rank by impact. For each: PROBLEM → SOLUTION → EXPECTED IMPACT. Be specific and technical.`,
      messages: [{ role: 'user', content: `${arch}\n\n${perf}` }],
    });
    return `KIKO SELF-IMPROVEMENT RECOMMENDATIONS:\n\n${res.content[0]?.text || 'No recommendations generated.'}`;
  } catch (e) { return `Improvement analysis error: ${e.message}`; }
}

export async function callCodeReviewAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'architecture': return await analyseArchitecture();
      case 'review': return await reviewFile(params.filename || params.file || 'kiko.js');
      case 'performance': return await getPerformanceAnalytics();
      case 'suggest': return await suggestImprovements();
      case 'read': {
        const code = await readOwnCode(params.filename || params.file);
        return code ? `FILE: ${params.filename || params.file}\n${code.slice(0, 6000)}` : 'File not found.';
      }
      default: return await suggestImprovements();
    }
  } catch (e) { return `Code review error: ${e.message}`; }
}
