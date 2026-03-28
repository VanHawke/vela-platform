// api/cron-inbox-triage.js — Smart Inbox Triage (fixed)
// Runs at 7:15am Mon-Fri. Scans inbox, classifies by urgency.
// Always writes a triage record, even if inbox is clear.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';
const USER_EMAIL = 'sunny@vanhawke.com';

async function getGoogleToken() {
  const { getGoogleToken: gt } = await import('./google-token.js');
  return gt(USER_EMAIL);
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-inbox-triage', 'started');
  const today = new Date().toISOString().split('T')[0];

  try {
    let token;
    try { token = await getGoogleToken(); } catch (e) {
      await logError('cron:inbox-triage', `Google token failed: ${e.message}`);
      await writeTriage(today, 'Google connection expired. Cannot triage inbox.', []);
      await cronHeartbeat('cron-inbox-triage', 'error', { heartbeatId: __hbId, errorMessage: e.message });
      return res.status(200).json({ ok: false, error: 'Google token expired' });
    }

    // Search: unread from last 24h + any starred
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread newer_than:1d -category:promotions -category:social&maxResults=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    const ids = (searchData.messages || []).map(m => m.id);

    if (!ids.length) {
      await writeTriage(today, 'Inbox clear — no unread emails in the last 24 hours.', []);
      await cronHeartbeat('cron-inbox-triage', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'Inbox clear', emails: 0 });
    }

    // Fetch metadata for each email
    const emails = [];
    for (const id of ids.slice(0, 15)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msg = await msgRes.json();
        const from = (msg.payload?.headers || []).find(h => h.name === 'From')?.value || '';
        const subject = (msg.payload?.headers || []).find(h => h.name === 'Subject')?.value || '';
        const snippet = msg.snippet || '';
        emails.push({ id, from: from.slice(0, 80), subject: subject.slice(0, 100), snippet: snippet.slice(0, 150) });
      } catch {}
    }

    if (!emails.length) {
      await writeTriage(today, 'Found message IDs but could not fetch metadata.', []);
      await cronHeartbeat('cron-inbox-triage', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart });
      return res.status(200).json({ ok: true, message: 'No metadata', emails: 0 });
    }

    // Classify via Haiku
    const emailList = emails.map((e, i) => `[${i+1}] From: ${e.from} | Subject: ${e.subject} | Preview: ${e.snippet}`).join('\n');
    const triage = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      system: 'You triage a CEO\'s inbox. Classify each email: ACTION_REQUIRED (needs response today), IMPORTANT (should read), or SKIP. Return ONLY valid JSON array: [{ "index": 1, "priority": "ACTION_REQUIRED|IMPORTANT|SKIP", "reason": "brief why" }]. Max 10 emails.',
      messages: [{ role: 'user', content: `Triage ${emails.length} unread emails:\n\n${emailList}` }],
    });

    let classifications = [];
    try { classifications = JSON.parse((triage.content[0]?.text || '[]').replace(/```json|```/g, '').trim()); } catch {}

    const priorityEmails = (Array.isArray(classifications) ? classifications : [])
      .filter(c => c.priority !== 'SKIP')
      .sort((a, b) => (a.priority === 'ACTION_REQUIRED' ? 0 : 1) - (b.priority === 'ACTION_REQUIRED' ? 0 : 1))
      .slice(0, 5)
      .map(c => { const email = emails[c.index - 1]; return email ? { ...email, priority: c.priority, reason: c.reason } : null; })
      .filter(Boolean);

    const actionCount = priorityEmails.filter(e => e.priority === 'ACTION_REQUIRED').length;
    const importantCount = priorityEmails.filter(e => e.priority === 'IMPORTANT').length;
    const summary = `${emails.length} unread: ${actionCount} need action, ${importantCount} important, ${emails.length - actionCount - importantCount} can wait.`;

    await writeTriage(today, summary, priorityEmails);
    await cronHeartbeat('cron-inbox-triage', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: emails.length });
    return res.status(200).json({ ok: true, total_unread: emails.length, action_required: actionCount, important: importantCount });
  } catch (err) {
    await logError('cron:inbox-triage', err.message);
    await cronHeartbeat('cron-inbox-triage', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(200).json({ ok: false, error: err.message });
  }
}

async function writeTriage(today, summary, priorityEmails) {
  const row = { user_id: USER_ID, triage_date: today, priority_emails: priorityEmails || [], summary };
  try {
    const existing = await sbFetch(`kiko_inbox_triage?user_id=eq.${USER_ID}&triage_date=eq.${today}&limit=1`);
    if (Array.isArray(existing) && existing.length) {
      await sbFetch(`kiko_inbox_triage?user_id=eq.${USER_ID}&triage_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify(row) });
    } else {
      await sbFetch('kiko_inbox_triage', { method: 'POST', body: JSON.stringify(row) });
    }
  } catch (e) { await logError('cron:inbox-triage', `Write failed: ${e.message}`); }
}
