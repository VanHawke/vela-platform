// api/cron-weekly-report.js — Weekly Pipeline Report Email
// Runs Sundays 7pm UK (19:00 UTC). Sends formatted summary email.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { getActiveUsers } from './cron-utils.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const STAGE_PROB = {
  'To revisit': 0.05, 'Contact made': 0.10, 'Qualified': 0.20,
  'In Dialogue': 0.35, 'Meeting arranged (brand x RH)': 0.50,
  'Proposal Sent': 0.60, 'Negotiation': 0.75, 'Verbal Agreement': 0.90,
  'Contract Review': 0.95
};

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-weekly-report', 'started');
  try {
    const users = await getActiveUsers();
    const email = users[0]?.email;
    if (!email) throw new Error('No active user found');

    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    // Gather all data in parallel
    const [deals, stageHistory, tasks, outreach, alerts, decisions, newPartnerships] = await Promise.all([
      sbFetch('deals?select=data&data->>status=eq.active&limit=200'),
      sbFetch(`deal_stage_history?changed_at=gt.${weekAgo}&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc`),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
      sbFetch(`outreach_scores?sent_at=gt.${weekAgo}&select=recipient_name,company,outcome,effectiveness_score&order=sent_at.desc&limit=50`),
      sbFetch(`kiko_alerts?created_at=gt.${weekAgo}&severity=in.(high,critical)&select=title,severity,created_at&order=created_at.desc&limit=10`),
      sbFetch(`kiko_learning_log?category=eq.decision&created_at=gt.${weekAgo}&select=content,entity_name,created_at&order=created_at.desc&limit=10`),
      sbFetch(`f1_partnerships?updated_at=gt.${weekAgo}&verified=eq.true&select=team_id,partner_name,category_id,tier&order=updated_at.desc&limit=10`),
    ]);

    // Calculate pipeline metrics
    const allDeals = Array.isArray(deals) ? deals : [];
    let totalRaw = 0, totalWeighted = 0;
    const staleDeals = [];
    for (const d of allDeals) {
      const data = d.data || {};
      const val = data.value || 0;
      totalRaw += val;
      totalWeighted += val * (STAGE_PROB[data.stage] || 0.1);
      const last = data.lastActivity ? new Date(data.lastActivity) : null;
      const daysSince = last ? Math.floor((now - last) / 86400000) : 999;
      if (daysSince > 7) staleDeals.push({ company: data.company, days: daysSince, stage: data.stage });
    }

    // Outreach metrics
    const outreachData = Array.isArray(outreach) ? outreach : [];
    const replied = outreachData.filter(o => o.outcome === 'replied').length;
    const outreachRate = outreachData.length ? Math.round(replied / outreachData.length * 100) : 0;

    // Tasks
    const outstanding = (Array.isArray(tasks) ? tasks : []).filter(t => !t.data?.completed);
    const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);

    // Stage movements this week
    const moves = (Array.isArray(stageHistory) ? stageHistory : []).slice(0, 10);

    // Build data for Sonnet synthesis
    const reportData = JSON.stringify({
      week_ending: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      pipeline: { total_deals: allDeals.length, raw_value: totalRaw, weighted_value: totalWeighted, stale: staleDeals.slice(0, 5) },
      stage_movements: moves.length,
      outreach: { sent: outreachData.length, replied, rate: outreachRate + '%' },
      tasks: { outstanding: outstanding.length, overdue: overdue.length },
      alerts: (Array.isArray(alerts) ? alerts : []).length,
      decisions: (Array.isArray(decisions) ? decisions : []).slice(0, 5).map(d => ({ entity: d.entity_name, summary: (d.content || '').slice(0, 100) })),
      new_partnerships: (Array.isArray(newPartnerships) ? newPartnerships : []).map(p => `${p.partner_name} → ${p.team_id} (${p.category_id})`),
    });

    // Synthesise via Sonnet
    const synthesis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: `You are Kiko, writing a weekly pipeline report for Sunny Sidhu, CEO of Van Hawke Group. Write a concise, actionable summary. Use plain text (this goes in an email). Lead with the single most important insight. Include: pipeline health, deal movements, outreach performance, key decisions made this week, and top 3 priorities for next week. All values in USD. Under 400 words. No greeting or sign-off — just the report.`,
      messages: [{ role: 'user', content: reportData }],
    });
    const reportBody = synthesis.content[0]?.text || 'Report generation failed.';

    // Send via Gmail
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken(email);
    if (!token) throw new Error('No Google token available');

    const subject = `📊 Kiko Weekly Report — w/e ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const raw = Buffer.from(
      `To: ${email}\r\nFrom: ${email}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nKIKO INTELLIGENCE OS — WEEKLY PIPELINE REPORT\n${'═'.repeat(50)}\n\n${reportBody}\n\n${'─'.repeat(50)}\nGenerated by Kiko at ${now.toLocaleString('en-GB', { timeZone: 'Europe/London' })}\nhttps://vela-platform-one.vercel.app`
    ).toString('base64url');

    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });

    const sent = gmailRes.ok;
    await cronHeartbeat('cron-weekly-report', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: allDeals.length,
    });
    return res.json({ ok: true, sent, deals: allDeals.length, weighted: totalWeighted, outreach: outreachData.length });
  } catch (err) {
    await cronHeartbeat('cron-weekly-report', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-weekly-report', err.message).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
