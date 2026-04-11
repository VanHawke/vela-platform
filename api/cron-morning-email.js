// api/cron-morning-email.js — Daily campaign performance email to Sunny
// Runs 7:45 AM Mon-Fri (15 min after cron-morning-intelligence so the
// in-app brief is fresh in kiko_alerts when the email links to it).
//
// REPLACES the old "Kiko Alert convergences detected" + "system health WARNING"
// emails which were killed in v0.0.26. This is the ONE morning email you receive.
//
// Content: campaign performance dashboard (sent / replied / reply rate),
// best/worst campaigns, priority tasks, partner announcements, race week.

import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-morning-email', 'started');
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString();
    const today = now.toISOString().split('T')[0];

    // Pull all the data we need in parallel
    const [
      sequences, sentLast7, sentPrev7, repliedLast7, repliedPrev7,
      tasks, deals, alerts, signals, races
    ] = await Promise.all([
      sbFetch('kiko_sequences?select=id,name,is_active'),
      sbFetch(`kiko_outreach_queue?status=eq.sent&sent_at=gte.${sevenDaysAgo}&select=enrollment_id,sequence_id,sent_at`),
      sbFetch(`kiko_outreach_queue?status=eq.sent&sent_at=gte.${fourteenDaysAgo}&sent_at=lt.${sevenDaysAgo}&select=enrollment_id`),
      sbFetch(`kiko_outreach_queue?status=eq.replied&sent_at=gte.${sevenDaysAgo}&select=enrollment_id,sequence_id`),
      sbFetch(`kiko_outreach_queue?status=eq.replied&sent_at=gte.${fourteenDaysAgo}&sent_at=lt.${sevenDaysAgo}&select=enrollment_id`),
      sbFetch('tasks?select=data&order=updated_at.desc&limit=50'),
      sbFetch('deals?select=data&data->>status=eq.active&limit=200'),
      sbFetch(`kiko_alerts?type=eq.morning_brief&created_at=gte.${new Date(now - 86400000).toISOString()}&order=created_at.desc&limit=1&select=detail`),
      sbFetch(`news_articles?is_processed=eq.true&deal_signal=eq.true&published_at=gte.${sevenDaysAgo}&order=published_at.desc&limit=8&select=title,matched_companies,published_at,url`),
      sbFetch(`race_calendar?select=name,date,city,series&order=date.asc&limit=20`),
    ]);

    // ── Campaign performance metrics ──
    const sentList = Array.isArray(sentLast7) ? sentLast7 : [];
    const sentPrevList = Array.isArray(sentPrev7) ? sentPrev7 : [];
    const repliedList = Array.isArray(repliedLast7) ? repliedLast7 : [];
    const repliedPrevList = Array.isArray(repliedPrev7) ? repliedPrev7 : [];
    const sequencesList = Array.isArray(sequences) ? sequences : [];
    const sentCount = sentList.length;
    const sentPrevCount = sentPrevList.length;
    const repliedCount = repliedList.length;
    const repliedPrevCount = repliedPrevList.length;
    const replyRate = sentCount > 0 ? (repliedCount / sentCount * 100) : 0;
    const replyRatePrev = sentPrevCount > 0 ? (repliedPrevCount / sentPrevCount * 100) : 0;
    const sentDelta = sentCount - sentPrevCount;
    const repliedDelta = repliedCount - repliedPrevCount;
    const replyRateDelta = replyRate - replyRatePrev;
    const activeCampaigns = sequencesList.filter(s => s.is_active).length;

    // ── Per-campaign breakdown for best/worst ──
    const seqMap = new Map(sequencesList.map(s => [s.id, s]));
    const perCampaign = new Map();
    for (const r of sentList) {
      if (!r.sequence_id) continue;
      const c = perCampaign.get(r.sequence_id) || { sent: 0, replied: 0 };
      c.sent++;
      perCampaign.set(r.sequence_id, c);
    }
    for (const r of repliedList) {
      if (!r.sequence_id) continue;
      const c = perCampaign.get(r.sequence_id) || { sent: 0, replied: 0 };
      c.replied++;
      perCampaign.set(r.sequence_id, c);
    }
    const campaignStats = Array.from(perCampaign.entries())
      .map(([id, stats]) => ({
        id, name: seqMap.get(id)?.name || 'Unknown',
        sent: stats.sent, replied: stats.replied,
        rate: stats.sent > 0 ? (stats.replied / stats.sent * 100) : 0,
      }))
      .filter(c => c.sent >= 5);  // Only consider campaigns with at least 5 sends
    const bestCampaign = campaignStats.length ? [...campaignStats].sort((a, b) => b.rate - a.rate)[0] : null;
    const worstCampaign = campaignStats.length > 1 ? [...campaignStats].sort((a, b) => a.rate - b.rate)[0] : null;

    // ── Priority tasks (overdue + due today, top 5) ──
    const tasksList = Array.isArray(tasks) ? tasks : [];
    const dealsList = Array.isArray(deals) ? deals : [];
    const signalsList = Array.isArray(signals) ? signals : [];
    const racesList = Array.isArray(races) ? races : [];
    const outstanding = tasksList.filter(t => !t.data?.completed);
    const overdue = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);
    const dueToday = outstanding.filter(t => t.data?.dueDate && new Date(t.data.dueDate).toDateString() === now.toDateString());
    const priorityTasks = [...overdue, ...dueToday].slice(0, 5).map(t => ({
      title: t.data?.notes || t.data?.title || 'Untitled task',
      company: t.data?.company || null,
      overdue: t.data?.dueDate && new Date(t.data.dueDate) < now,
      daysOver: t.data?.dueDate ? Math.floor((now - new Date(t.data.dueDate)) / 86400000) : 0,
    }));

    // ── Stale high-value deals ──
    const staleDeals = dealsList.map(d => {
      const data = d.data || {};
      const last = data.lastActivity ? new Date(data.lastActivity) : null;
      const daysSince = last ? Math.floor((now - last) / 86400000) : null;
      return { company: data.company, value: data.value || 0, stage: data.stage, daysSince };
    }).filter(d => d.daysSince > 30 && d.value > 100000)
      .sort((a, b) => b.value - a.value).slice(0, 3);

    // ── Partner announcements (de-duped by title) ──
    const seenTitles = new Set();
    const announcements = [];
    for (const s of signalsList) {
      const key = (s.title || '').toLowerCase().slice(0, 60);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      announcements.push(s);
      if (announcements.length >= 5) break;
    }

    // ── Race week ──
    const raceThisWeek = racesList.filter(r => {
      const d = new Date(r.date);
      return d > now && d < new Date(now.getTime() + 7 * 86400000);
    })[0];
    const nextRace = racesList.filter(r => new Date(r.date) > now)[0];

    // Build the HTML email
    const html = buildHtml({
      today, sentCount, sentDelta, repliedCount, repliedDelta,
      replyRate, replyRateDelta, activeCampaigns,
      bestCampaign, worstCampaign, priorityTasks, staleDeals,
      announcements, raceThisWeek, nextRace,
    });

    // Plain text fallback
    const text = buildText({
      today, sentCount, repliedCount, replyRate, activeCampaigns,
      bestCampaign, worstCampaign, priorityTasks, staleDeals,
      announcements, raceThisWeek, nextRace,
    });

    const subject = `☀ Morning Brief — ${formatDate(now)} — ${priorityTasks.length} priority item${priorityTasks.length === 1 ? '' : 's'}`;

    // Send to all active users
    const users = await getActiveUsers();
    let sentEmails = 0;
    for (const u of users) {
      try {
        const token = await getGoogleToken(u.email);
        if (!token) continue;
        const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let mime = `To: ${u.email}\r\nFrom: ${u.email}\r\nSubject: ${subject}\r\n`;
        mime += `MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
        mime += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${text}\r\n`;
        mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n`;
        mime += `--${boundary}--`;
        const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        });
        if (r.ok) sentEmails++;
        else console.error('[MorningEmail] Send failed:', u.email, r.status, await r.text());
      } catch (err) {
        console.error('[MorningEmail] User loop error:', u.email, err.message);
      }
    }

    await cronHeartbeat('cron-morning-email', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: sentEmails });
    return res.status(200).json({ ok: true, sent: sentEmails, users: users.length });
  } catch (err) {
    console.error('[MorningEmail] Fatal:', err.message);
    await cronHeartbeat('cron-morning-email', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart });
    return res.status(200).json({ ok: false, error: err.message });
  }
}

function formatDate(d) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function arrow(delta) {
  if (delta > 0) return `<span style="color:#06D6A0">↑ +${delta}</span>`;
  if (delta < 0) return `<span style="color:#EF4444">↓ ${delta}</span>`;
  return `<span style="color:#888">→ 0</span>`;
}
function arrowPct(delta) {
  if (delta > 0.1) return `<span style="color:#06D6A0">↑ +${delta.toFixed(1)}pt</span>`;
  if (delta < -0.1) return `<span style="color:#EF4444">↓ ${delta.toFixed(1)}pt</span>`;
  return `<span style="color:#888">→ flat</span>`;
}

// ─────────────────────────────────────────────────────────────────
// HTML EMAIL TEMPLATE — Claude.ai-style warm dark with KPI cards,
// best/worst campaign panels, priority tasks, partner news, race week.
// Uses table-based layout for Gmail compatibility (no flex/grid).
// ─────────────────────────────────────────────────────────────────
function buildHtml(d) {
  const baseUrl = 'https://vela-platform-one.vercel.app';
  const dateStr = formatDate(new Date());
  const raceLabel = d.raceThisWeek
    ? `🏁 Race week: ${d.raceThisWeek.name} (${d.raceThisWeek.city})`
    : (d.nextRace ? `Next race: ${d.nextRace.name} — ${formatDate(new Date(d.nextRace.date))}` : '');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Kiko Morning Brief</title></head>
<body style="margin:0;padding:0;background:#1a1a18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e8e8e6;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a18">
<tr><td align="center" style="padding:32px 16px">
<table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#262624;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">

<!-- Header -->
<tr><td style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
  <div style="font-size:11px;color:#9b9b96;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;font-weight:500">Kiko Morning Brief</div>
  <div style="font-size:22px;font-weight:600;color:#fff;margin-bottom:4px">${dateStr}</div>
  ${raceLabel ? `<div style="font-size:13px;color:#A78BFA;margin-top:6px">${raceLabel}</div>` : ''}
</td></tr>

<!-- KPI Cards -->
<tr><td style="padding:24px 32px 8px">
  <div style="font-size:11px;color:#9b9b96;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:12px;font-weight:500">⚡ Campaign Performance — Last 7 Days</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="33%" style="padding:0 6px 0 0">
        <div style="background:#1F1F1D;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:10px;color:#9b9b96;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Sent</div>
          <div style="font-size:28px;font-weight:600;color:#fff;line-height:1">${d.sentCount}</div>
          <div style="font-size:11px;margin-top:6px">${arrow(d.sentDelta)}</div>
        </div>
      </td>
      <td width="33%" style="padding:0 3px">
        <div style="background:#1F1F1D;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:10px;color:#9b9b96;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Replies</div>
          <div style="font-size:28px;font-weight:600;color:#fff;line-height:1">${d.repliedCount}</div>
          <div style="font-size:11px;margin-top:6px">${arrow(d.repliedDelta)}</div>
        </div>
      </td>
      <td width="33%" style="padding:0 0 0 6px">
        <div style="background:#1F1F1D;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:10px;color:#9b9b96;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Reply Rate</div>
          <div style="font-size:28px;font-weight:600;color:#2DD4BF;line-height:1">${d.replyRate.toFixed(1)}%</div>
          <div style="font-size:11px;margin-top:6px">${arrowPct(d.replyRateDelta)}</div>
        </div>
      </td>
    </tr>
  </table>
  <div style="font-size:11px;color:#9b9b96;margin-top:12px;text-align:center">Across ${d.activeCampaigns} active campaign${d.activeCampaigns === 1 ? '' : 's'}</div>
</td></tr>

${d.bestCampaign ? `
<!-- Best campaign -->
<tr><td style="padding:20px 32px 8px">
  <div style="background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.18);border-left:3px solid #2DD4BF;border-radius:8px;padding:16px">
    <div style="font-size:10px;color:#2DD4BF;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:6px;font-weight:600">🔥 Best Performing</div>
    <div style="font-size:15px;color:#fff;font-weight:500;margin-bottom:4px">${escapeHtml(d.bestCampaign.name)}</div>
    <div style="font-size:12px;color:#c8c8c4">${d.bestCampaign.sent} sent · ${d.bestCampaign.replied} replies · <span style="color:#2DD4BF;font-weight:600">${d.bestCampaign.rate.toFixed(1)}% reply rate</span></div>
  </div>
</td></tr>` : ''}

${d.worstCampaign && d.worstCampaign.id !== d.bestCampaign?.id ? `
<!-- Worst campaign -->
<tr><td style="padding:8px 32px">
  <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.18);border-left:3px solid #FBBF24;border-radius:8px;padding:16px">
    <div style="font-size:10px;color:#FBBF24;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:6px;font-weight:600">⚠ Needs Work</div>
    <div style="font-size:15px;color:#fff;font-weight:500;margin-bottom:4px">${escapeHtml(d.worstCampaign.name)}</div>
    <div style="font-size:12px;color:#c8c8c4;margin-bottom:8px">${d.worstCampaign.sent} sent · ${d.worstCampaign.replied} replies · <span style="color:#FBBF24;font-weight:600">${d.worstCampaign.rate.toFixed(1)}% reply rate</span></div>
    <div style="font-size:11px;color:#9b9b96;font-style:italic">${
      d.worstCampaign.rate === 0
        ? 'Zero replies — review subject lines and step 1 hook. Consider tightening the first email or pausing.'
        : 'Reply rate trailing other campaigns — review opening line and CTA.'
    }</div>
  </div>
</td></tr>` : ''}

${d.priorityTasks.length > 0 ? `
<!-- Priority tasks -->
<tr><td style="padding:24px 32px 8px">
  <div style="font-size:11px;color:#9b9b96;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:12px;font-weight:500">📋 Priority Tasks (${d.priorityTasks.length})</div>
  ${d.priorityTasks.map(t => `
    <div style="padding:12px 14px;background:#1F1F1D;border:1px solid rgba(255,255,255,0.05);border-left:3px solid ${t.overdue ? '#EF4444' : '#FBBF24'};border-radius:6px;margin-bottom:6px">
      <div style="font-size:13px;color:#fff;font-weight:500;margin-bottom:2px">${escapeHtml(t.title.slice(0, 100))}</div>
      <div style="font-size:11px;color:#9b9b96">${t.company ? escapeHtml(t.company) + ' · ' : ''}${t.overdue ? `<span style="color:#EF4444;font-weight:500">${t.daysOver}d overdue</span>` : '<span style="color:#FBBF24">Due today</span>'}</div>
    </div>
  `).join('')}
</td></tr>` : ''}

${d.staleDeals.length > 0 ? `
<!-- Stale high-value deals -->
<tr><td style="padding:8px 32px">
  <div style="font-size:11px;color:#9b9b96;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:12px;font-weight:500">💰 Stale High-Value Deals</div>
  ${d.staleDeals.map(deal => `
    <div style="padding:10px 14px;background:#1F1F1D;border:1px solid rgba(255,255,255,0.05);border-radius:6px;margin-bottom:6px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:13px;color:#fff;font-weight:500">${escapeHtml(deal.company || '?')}</td>
          <td align="right" style="font-size:12px;color:#A78BFA;font-weight:600">$${(deal.value / 1000).toFixed(0)}k</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:11px;color:#9b9b96;padding-top:2px">${escapeHtml(deal.stage || 'unknown stage')} · <span style="color:#EF4444">${deal.daysSince}d since activity</span></td>
        </tr>
      </table>
    </div>
  `).join('')}
</td></tr>` : ''}

${d.announcements.length > 0 ? `
<!-- Partner announcements -->
<tr><td style="padding:24px 32px 8px">
  <div style="font-size:11px;color:#9b9b96;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:12px;font-weight:500">📡 Partner Announcements (Picked up this week)</div>
  ${d.announcements.map(a => `
    <div style="padding:10px 14px;background:#1F1F1D;border:1px solid rgba(255,255,255,0.05);border-radius:6px;margin-bottom:6px">
      <div style="font-size:12px;color:#e8e8e6;font-weight:500;margin-bottom:3px">${escapeHtml((a.title || '').slice(0, 110))}</div>
      ${a.matched_companies && a.matched_companies.length ? `<div style="font-size:10px;color:#A78BFA">${a.matched_companies.slice(0, 3).map(escapeHtml).join(' · ')}</div>` : ''}
    </div>
  `).join('')}
</td></tr>` : ''}

<!-- CTAs -->
<tr><td style="padding:28px 32px 32px;border-top:1px solid rgba(255,255,255,0.06);margin-top:16px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="50%" style="padding-right:6px">
        <a href="${baseUrl}/command-centre" style="display:block;text-align:center;padding:12px 16px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.25);border-radius:8px;color:#A78BFA;text-decoration:none;font-size:13px;font-weight:500">Open Command Centre →</a>
      </td>
      <td width="50%" style="padding-left:6px">
        <a href="${baseUrl}/campaigns" style="display:block;text-align:center;padding:12px 16px;background:rgba(45,212,191,0.10);border:1px solid rgba(45,212,191,0.22);border-radius:8px;color:#2DD4BF;text-decoration:none;font-size:13px;font-weight:500">Open Campaigns →</a>
      </td>
    </tr>
  </table>
  <div style="font-size:10px;color:#6b6b66;text-align:center;margin-top:20px">Generated by Kiko · ${new Date().toISOString()}</div>
</td></tr>

</table></td></tr></table></body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain text fallback
function buildText(d) {
  const lines = [];
  lines.push(`KIKO MORNING BRIEF — ${formatDate(new Date())}`);
  lines.push('');
  lines.push(`CAMPAIGN PERFORMANCE (Last 7 days)`);
  lines.push(`  Sent: ${d.sentCount}   Replies: ${d.repliedCount}   Reply Rate: ${d.replyRate.toFixed(1)}%`);
  lines.push(`  Across ${d.activeCampaigns} active campaign${d.activeCampaigns === 1 ? '' : 's'}`);
  lines.push('');
  if (d.bestCampaign) {
    lines.push(`BEST: ${d.bestCampaign.name} — ${d.bestCampaign.sent} sent, ${d.bestCampaign.replied} replies (${d.bestCampaign.rate.toFixed(1)}%)`);
  }
  if (d.worstCampaign && d.worstCampaign.id !== d.bestCampaign?.id) {
    lines.push(`NEEDS WORK: ${d.worstCampaign.name} — ${d.worstCampaign.sent} sent, ${d.worstCampaign.replied} replies (${d.worstCampaign.rate.toFixed(1)}%)`);
  }
  if (d.priorityTasks.length) {
    lines.push('');
    lines.push(`PRIORITY TASKS (${d.priorityTasks.length}):`);
    for (const t of d.priorityTasks) {
      lines.push(`  • ${t.title.slice(0, 80)}${t.company ? ' (' + t.company + ')' : ''}${t.overdue ? ` — ${t.daysOver}d overdue` : ' — due today'}`);
    }
  }
  if (d.staleDeals.length) {
    lines.push('');
    lines.push('STALE HIGH-VALUE DEALS:');
    for (const deal of d.staleDeals) {
      lines.push(`  • ${deal.company} — $${(deal.value / 1000).toFixed(0)}k — ${deal.daysSince}d since activity`);
    }
  }
  if (d.announcements.length) {
    lines.push('');
    lines.push('PARTNER ANNOUNCEMENTS:');
    for (const a of d.announcements) lines.push(`  • ${(a.title || '').slice(0, 100)}`);
  }
  if (d.raceThisWeek) {
    lines.push('');
    lines.push(`RACE WEEK: ${d.raceThisWeek.name} (${d.raceThisWeek.city}) on ${formatDate(new Date(d.raceThisWeek.date))}`);
  }
  lines.push('');
  lines.push('Open Command Centre: https://vela-platform-one.vercel.app/command-centre');
  lines.push('Open Campaigns: https://vela-platform-one.vercel.app/campaigns');
  return lines.join('\n');
}
