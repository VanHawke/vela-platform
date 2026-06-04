// api/cron-inbox-triage.js — Smart Inbox Triage (multi-user)
// Runs at 7:15am Mon-Fri. Scans inbox, classifies by urgency.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat, logError } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-inbox-triage', 'started');
  const today = new Date().toISOString().split('T')[0];
  const results = [];

  try {
    const users = await getActiveUsers();
    for (const user of users) {
      try {
        const token = await getGoogleToken(user.email);
        if (!token) { results.push({ user: user.email, ok: false, error: 'no token' }); continue; }
        const r = await triageUser(user.user_id, user.email, token, today);
        results.push({ user: user.email, ...r });
      } catch (e) {
        results.push({ user: user.email, ok: false, error: e.message });
      }
    }
    await cronHeartbeat('cron-inbox-triage', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: results.length });
    return res.status(200).json({ ok: true, users: results });
  } catch (err) {
    await logError('cron:inbox-triage', err.message);
    await cronHeartbeat('cron-inbox-triage', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(200).json({ ok: false, error: err.message });
  }
}

async function triageUser(userId, email, token, today) {
    // Look back 6 hours for incremental runs, 24h for the morning run
    const lookback = (new Date().getHours() < 9) ? '1d' : '6h';
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread newer_than:${lookback} -category:promotions -category:social&maxResults=30`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    const ids = (searchData.messages || []).map(m => m.id);

    if (!ids.length) {
      await writeTriage(userId, today, 'Inbox clear — no unread emails in the lookback window.', []);
      return { ok: true, emails: 0 };
    }

    // Load known contact emails for cross-reference (Lemlist-era + Kiko-era + Pipedrive)
    const knownContactsRaw = await sbFetch(`contacts?select=id,data&data->>email=not.is.null&limit=10000`);
    const knownByEmail = new Map();
    if (Array.isArray(knownContactsRaw)) {
      for (const c of knownContactsRaw) {
        const e = (c.data?.email || '').trim().toLowerCase();
        if (e) knownByEmail.set(e, { id: c.id, name: `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.trim(), company: c.data?.company || '' });
      }
    }

    // Fetch metadata for each email
    const emails = [];
    for (const id of ids.slice(0, 25)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msg = await msgRes.json();
        const from = (msg.payload?.headers || []).find(h => h.name === 'From')?.value || '';
        const subject = (msg.payload?.headers || []).find(h => h.name === 'Subject')?.value || '';
        const snippet = msg.snippet || '';
        // Extract bare email from "Name <email@x.com>"
        const fromEmailMatch = from.match(/<([^>]+)>/);
        const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : from).trim().toLowerCase();
        const knownContact = knownByEmail.get(fromEmail);
        emails.push({ id, from: from.slice(0, 80), fromEmail, subject: subject.slice(0, 100), snippet: snippet.slice(0, 150), knownContact });
      } catch {}
    }

    // CRITICAL: For any email from a known contact, fire an alert immediately
    // This catches Lemlist-era replies that the sequence-reply-detect cron misses
    const fromKnownProspects = emails.filter(e => e.knownContact);
    for (const e of fromKnownProspects) {
      try {
        // Dedupe: don't fire alert if we already alerted for this gmail message id today
        const existingAlert = await sbFetch(`kiko_alerts?type=eq.reply_from_prospect&metadata->>gmail_id=eq.${e.id}&limit=1`);
        if (Array.isArray(existingAlert) && existingAlert.length) continue;
        await sbFetch('kiko_alerts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'reply_from_prospect',
            severity: 'high',
            title: `Reply from ${e.knownContact.name || e.fromEmail}${e.knownContact.company ? ' (' + e.knownContact.company + ')' : ''}`,
            detail: `Subject: ${e.subject}\n\nPreview: ${e.snippet}`,
            entity_type: 'contact',
            entity_name: e.knownContact.name || e.fromEmail,
            entity_id: e.knownContact.id,
            metadata: { gmail_id: e.id, from: e.fromEmail, subject: e.subject, company: e.knownContact.company },
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          })
        });
      } catch (alertErr) {
        await logError('cron:inbox-triage:alert', alertErr.message);
      }
    }

    if (!emails.length) {
      await writeTriage(userId, today, 'Found message IDs but could not fetch metadata.', []);
      return { ok: true, emails: 0 };
    }

    // Classify via Haiku
    const emailList = emails.map((e, i) => `[${i+1}] From: ${e.from} | Subject: ${e.subject} | Preview: ${e.snippet}`).join('\n');
    const triage = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514', max_tokens: 600, // Upgraded from Haiku — email triage needs context understanding
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

    await writeTriage(userId, today, summary, priorityEmails);
    return { ok: true, total_unread: emails.length, action_required: actionCount, important: importantCount };
}

async function writeTriage(userId, today, summary, priorityEmails) {
  const row = { user_id: userId, triage_date: today, priority_emails: priorityEmails || [], summary };
  try {
    const existing = await sbFetch(`kiko_inbox_triage?user_id=eq.${userId}&triage_date=eq.${today}&limit=1`);
    if (Array.isArray(existing) && existing.length) {
      await sbFetch(`kiko_inbox_triage?user_id=eq.${userId}&triage_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify(row) });
    } else {
      await sbFetch('kiko_inbox_triage', { method: 'POST', body: JSON.stringify(row) });
    }
  } catch (e) { await logError('cron:inbox-triage', `Write failed: ${e.message}`); }
}
