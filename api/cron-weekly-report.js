// api/cron-weekly-report.js — Weekly Pipeline Report Email (Option A: Clean Editorial)
// Runs Sundays 7pm UK (19:00 UTC). Sends HTML-formatted summary email.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { getActiveUsers } from './cron-utils.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function fetchLemlistCampaigns() {
  const key = process.env.LEMLIST_KEY;
  if (!key) return [];
  try {
    const res = await fetch('https://api.lemlist.com/api/campaigns', {
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(':' + key).toString('base64')}` },
    });
    if (!res.ok) return [];
    const campaigns = await res.json();
    return (Array.isArray(campaigns) ? campaigns : [])
      .filter(c => c.status === 'running' || c.status === 'paused' || c.status === 'done')
      .map(c => {
        const s = c.stats || {};
        const sent = s.emailsSent || 0;
        const opened = s.emailsOpened || 0;
        const replied = s.emailsReplied || 0;
        const clicked = s.emailsClicked || 0;
        const bounced = s.emailsBounced || 0;
        const channel = (c.name || '').toLowerCase().includes('linkedin') ? 'LinkedIn' : 'Email';
        return {
          name: c.name || 'Untitled',
          status: c.status,
          channel,
          sent,
          openRate: sent ? Math.round(opened / sent * 100) : 0,
          replyRate: sent ? Math.round(replied / sent * 100) : 0,
          clickRate: sent ? Math.round(clicked / sent * 100) : 0,
          bounceRate: sent ? Math.round(bounced / sent * 100) : 0,
          replied,
          opened,
          bounced,
        };
      })
      .sort((a, b) => b.sent - a.sent);
  } catch { return []; }
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-weekly-report', 'started');
  try {
    const users = await getActiveUsers();
    const email = users[0]?.email;
    if (!email) throw new Error('No active user found');
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    // Gather data in parallel
    const [deals, stageHistory, tasks, alerts, decisions, newPartnerships, campaigns] = await Promise.all([
      sbFetch('deals?select=data&data->>status=eq.active&limit=200'),
      sbFetch(`deal_stage_history?changed_at=gt.${weekAgo}&select=deal_id,from_stage,to_stage,changed_at&order=changed_at.desc`),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=30'),
      sbFetch(`kiko_alerts?created_at=gt.${weekAgo}&severity=in.(high,critical)&select=title,severity,created_at&order=created_at.desc&limit=10`),
      sbFetch(`kiko_learning_log?category=eq.decision&created_at=gt.${weekAgo}&select=content,entity_name,created_at&order=created_at.desc&limit=10`),
      sbFetch(`f1_partnerships?updated_at=gt.${weekAgo}&verified=eq.true&select=team_id,partner_name,category_id,tier&order=updated_at.desc&limit=10`),
      fetchLemlistCampaigns(),
    ]);

    const allDeals = Array.isArray(deals) ? deals : [];
    const staleDeals = allDeals.filter(d => {
      const data = d.data || {};
      const last = data.lastActivity ? new Date(data.lastActivity) : null;
      return !last || (now - last) / 86400000 > 7;
    });
    const outstanding = (Array.isArray(tasks) ? tasks : []).filter(t => !t.data?.completed);
    const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);
    const moves = (Array.isArray(stageHistory) ? stageHistory : []).slice(0, 10);

    // Campaign summary metrics
    const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
    const totalReplied = campaigns.reduce((s, c) => s + c.replied, 0);
    const totalOpened = campaigns.reduce((s, c) => s + c.opened, 0);
    const avgOpenRate = totalSent ? Math.round(totalOpened / totalSent * 100) : 0;
    const avgReplyRate = totalSent ? Math.round(totalReplied / totalSent * 100) : 0;

    // Synthesise narrative via Sonnet
    const reportData = JSON.stringify({
      week_ending: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      deals: allDeals.length, stale_deals: staleDeals.length,
      stage_movements: moves.length, overdue_tasks: overdue.length,
      campaigns: campaigns.slice(0, 8).map(c => ({ name: c.name, channel: c.channel, sent: c.sent, openRate: c.openRate + '%', replyRate: c.replyRate + '%', status: c.status })),
      total_outreach: { sent: totalSent, open_rate: avgOpenRate + '%', reply_rate: avgReplyRate + '%' },
      decisions: (Array.isArray(decisions) ? decisions : []).slice(0, 3).map(d => d.content?.slice(0, 80)),
      new_partnerships: (Array.isArray(newPartnerships) ? newPartnerships : []).map(p => `${p.partner_name} → ${p.team_id}`),
    });

    const synthesis = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      system: `You write the weekly report for Sunny Sidhu, CEO of Van Hawke Group. Write TWO things only:
1. INSIGHT (2-3 sentences): The single most important takeaway this week — a reply, a signal, a stale deal, a campaign performing well or badly. Be specific with names and numbers. No fluff.
2. PRIORITIES (exactly 3 numbered items): What to do Monday. Each item is one sentence with the company/person name and specific action.

Return as JSON: {"insight":"...","priorities":["1. ...","2. ...","3. ..."]}
Nothing else. No markdown. No greeting.`,
      messages: [{ role: 'user', content: reportData }],
    });

    let insight = '', priorities = [];
    try {
      const raw = synthesis.content[0]?.text?.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(raw);
      insight = parsed.insight || '';
      priorities = Array.isArray(parsed.priorities) ? parsed.priorities : [];
    } catch { insight = 'Report synthesis failed — check Kiko for details.'; }

    // Build campaign rows HTML
    const campaignRows = campaigns.slice(0, 6).map(c => {
      const replyColor = c.replyRate >= 15 ? '#34C759' : c.replyRate >= 5 ? '#FF9500' : '#FF3B30';
      const openColor = c.openRate >= 50 ? '#34C759' : c.openRate >= 25 ? '#FF9500' : '#FF3B30';
      return `<tr>
        <td style="padding:10px 12px;font-size:13px;color:#E0E0E0;border-bottom:1px solid #1A1A1E;">${c.name.length > 30 ? c.name.slice(0,28) + '…' : c.name}</td>
        <td style="padding:10px 8px;font-size:12px;color:#888;border-bottom:1px solid #1A1A1E;text-align:center;">${c.channel}</td>
        <td style="padding:10px 8px;font-size:13px;color:#CCC;border-bottom:1px solid #1A1A1E;text-align:center;">${c.sent}</td>
        <td style="padding:10px 8px;font-size:13px;color:${openColor};border-bottom:1px solid #1A1A1E;text-align:center;">${c.openRate}%</td>
        <td style="padding:10px 8px;font-size:13px;color:${replyColor};border-bottom:1px solid #1A1A1E;text-align:center;font-weight:600;">${c.replyRate}%</td>
      </tr>`;
    }).join('');

    const weekEnd = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const subject = priorities[0] 
      ? `${priorities[0].replace(/^1\.\s*/, '').slice(0, 50)} — weekly report`
      : `Your week at Van Hawke — w/e ${weekEnd}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#000000;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#0A0A0C;border-radius:12px;overflow:hidden;border:1px solid #1A1A1E;">

<!-- Header -->
<tr><td style="padding:28px 32px 20px;">
  <p style="margin:0 0 4px;font-size:11px;color:#555;letter-spacing:0.1em;text-transform:uppercase;">Kiko Intelligence OS</p>
  <p style="margin:0 0 2px;font-size:20px;font-weight:500;color:#F0F0F0;">Week in review</p>
  <p style="margin:0;font-size:12px;color:#555;">w/e ${weekEnd}</p>
</td></tr>

<!-- Insight -->
<tr><td style="padding:0 32px 20px;">
  <p style="margin:0;font-size:13px;color:#999;line-height:1.7;">${insight}</p>
</td></tr>

<!-- Metric cards -->
<tr><td style="padding:0 32px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="33%" style="padding-right:6px;">
      <div style="background:#111114;border-radius:8px;padding:14px;">
        <p style="margin:0 0 4px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.05em;">Open rate</p>
        <p style="margin:0;font-size:20px;font-weight:500;color:${avgOpenRate >= 50 ? '#34C759' : avgOpenRate >= 25 ? '#FF9500' : '#FF3B30'};">${avgOpenRate}%</p>
      </div>
    </td>
    <td width="33%" style="padding:0 3px;">
      <div style="background:#111114;border-radius:8px;padding:14px;">
        <p style="margin:0 0 4px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.05em;">Reply rate</p>
        <p style="margin:0;font-size:20px;font-weight:500;color:${avgReplyRate >= 15 ? '#34C759' : avgReplyRate >= 5 ? '#FF9500' : '#FF3B30'};">${avgReplyRate}%</p>
      </div>
    </td>
    <td width="33%" style="padding-left:6px;">
      <div style="background:#111114;border-radius:8px;padding:14px;">
        <p style="margin:0 0 4px;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.05em;">Overdue</p>
        <p style="margin:0;font-size:20px;font-weight:500;color:${overdue.length > 0 ? '#FF3B30' : '#34C759'};">${overdue.length}</p>
      </div>
    </td>
  </tr></table>
</td></tr>

<!-- Campaign performance table -->
${campaigns.length ? `<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 12px;font-size:11px;color:#555;letter-spacing:0.08em;text-transform:uppercase;">Campaign performance</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:8px 12px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1A1A1E;">Campaign</td>
      <td style="padding:8px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1A1A1E;text-align:center;">Ch.</td>
      <td style="padding:8px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1A1A1E;text-align:center;">Sent</td>
      <td style="padding:8px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1A1A1E;text-align:center;">Open</td>
      <td style="padding:8px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #1A1A1E;text-align:center;">Reply</td>
    </tr>
    ${campaignRows}
  </table>
</td></tr>` : ''}

<!-- Priorities -->
<tr><td style="padding:0 32px 24px;border-top:1px solid #1A1A1E;padding-top:20px;">
  <p style="margin:0 0 12px;font-size:13px;font-weight:500;color:#F0F0F0;">Monday priorities</p>
  ${priorities.map(p => `<p style="margin:0 0 6px;font-size:13px;color:#999;line-height:1.5;">${p}</p>`).join('')}
</td></tr>

<!-- Footer -->
<tr><td style="padding:16px 32px;border-top:1px solid #1A1A1E;text-align:center;">
  <p style="margin:0;font-size:11px;color:#333;">
    <a href="https://vela-platform-one.vercel.app" style="color:#7C5CFC;text-decoration:none;">Open Kiko</a>
    &nbsp;&middot;&nbsp; Generated ${now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK
  </p>
</td></tr>

</table></td></tr></table></body></html>`;

    // Send via Gmail as HTML
    const { getGoogleToken } = await import('./google-token.js');
    const token = await getGoogleToken(email);
    if (!token) throw new Error('No Google token available');

    const raw = Buffer.from(
      `To: ${email}\r\nFrom: ${email}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${html}`
    ).toString('base64url');

    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });

    const sent = gmailRes.ok;
    await cronHeartbeat('cron-weekly-report', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: campaigns.length,
    });
    return res.json({ ok: true, sent, campaigns: campaigns.length, deals: allDeals.length, subject });
  } catch (err) {
    await cronHeartbeat('cron-weekly-report', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    await logError('cron-weekly-report', err.message).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
