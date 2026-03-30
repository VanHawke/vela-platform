// api/cron-meeting-prep.js — Meeting Prep Auto-Generation (multi-user)
// Runs hourly. Scans calendar for meetings in next 2 hours.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 45 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  try {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('cron-meeting-prep', 'started');
    const users = await getActiveUsers();
    const results = [];
    for (const user of users) {
    try {
    const token = await getGoogleToken(user.email);
    if (!token) { results.push({ user: user.email, ok: false }); continue; }
    const USER_ID = user.user_id;

    // Get events in next 2 hours
    const now = new Date();
    const twoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${twoHours.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=5`;
    const calRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!calRes.ok) return res.status(200).json({ ok: false, error: 'Calendar fetch failed' });
    const calData = await calRes.json();
    const events = (calData.items || []).filter(e => e.attendees?.length > 0);
    if (!events.length) return res.status(200).json({ ok: true, message: 'No upcoming meetings with attendees', preps: 0 });

    // Check which events already have prep generated
    const existingPreps = await sbFetch(`kiko_meeting_prep?user_id=eq.${USER_ID}&event_time=gte.${now.toISOString()}&select=calendar_event_id`);
    const existingIds = new Set((Array.isArray(existingPreps) ? existingPreps : []).map(p => p.calendar_event_id));

    let generated = 0;
    for (const event of events) {
      if (existingIds.has(event.id)) continue; // Already prepped

      const attendeeEmails = (event.attendees || []).filter(a => !a.self).map(a => a.email);
      if (!attendeeEmails.length) continue;

      // Enrich: pull CRM contacts, relationships, deals for each attendee
      let enrichment = '';
      for (const email of attendeeEmails.slice(0, 3)) {
        try {
          const [contacts, relationships] = await Promise.all([
            sbFetch(`contacts?select=data&data->>email=ilike.${encodeURIComponent(email)}&limit=1`).catch(() => []),
            sbFetch(`kiko_relationships?contact_email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`).catch(() => []),
          ]);

          const contact = Array.isArray(contacts) && contacts[0]?.data;
          const rel = Array.isArray(relationships) && relationships[0];
          if (contact) {
            enrichment += `\nATTENDEE: ${contact.firstName || ''} ${contact.lastName || ''} — ${contact.title || '?'} @ ${contact.company || '?'} | ${email}`;
            // Pull company deals
            if (contact.company) {
              const deals = await sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(contact.company)}*&limit=2`).catch(() => []);
              if (Array.isArray(deals) && deals.length) {
                enrichment += `\n  DEAL: ${deals.map(d => `${d.data.company} — ${d.data.stage}`).join('; ')}`;
              }
            }
            if (rel) {
              enrichment += `\n  RELATIONSHIP: ${rel.warmth_score > 0.6 ? 'WARM' : rel.warmth_score > 0.35 ? 'LUKEWARM' : 'COLD'} | ${rel.emails_sent} sent, ${rel.emails_received} received | Type: ${rel.relationship_type}`;
            }
          } else {
            enrichment += `\nATTENDEE: ${email} (not in CRM)`;
          }
        } catch {}
      }


      // Check thought journal for past reasoning about these entities
      let pastThoughts = '';
      try {
        const entities = attendeeEmails.map(e => e.split('@')[1]?.split('.')[0]).filter(Boolean);
        if (entities.length) {
          const thoughts = await sbFetch(`kiko_thought_journal?order=created_at.desc&limit=5&select=topic,insight`);
          const relevant = (Array.isArray(thoughts) ? thoughts : []).filter(t => entities.some(e => (t.topic || '').toLowerCase().includes(e) || (t.insight || '').toLowerCase().includes(e)));
          if (relevant.length) pastThoughts = `\nPAST REASONING:\n${relevant.slice(0, 2).map(t => `• ${(t.insight || '').slice(0, 150)}`).join('\n')}`;
        }
      } catch {}

      // Generate prep via Haiku (fast + cheap)
      const prepResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        system: 'You generate concise meeting prep briefs for a CEO. Include: who they are, deal status, relationship warmth, what to know going in, and 2-3 suggested talking points. Be direct and actionable. Under 200 words.',
        messages: [{ role: 'user', content: `Meeting: "${event.summary || 'Untitled'}" at ${event.start?.dateTime || event.start?.date}\n${enrichment}${pastThoughts}` }],
      });
      const brief = prepResponse.content[0]?.text || 'Prep generation failed.';

      // Save
      await sbFetch('kiko_meeting_prep', {
        method: 'POST', body: JSON.stringify({
          user_id: USER_ID, calendar_event_id: event.id, event_title: event.summary || 'Untitled',
          event_time: event.start?.dateTime || event.start?.date, attendees: attendeeEmails,
          prep_brief: brief, status: 'generated',
        })
      });
      generated++;
    }
    results.push({ user: user.email, ok: true, preps: generated, events: events.length });
    } catch (e) { results.push({ user: user.email, ok: false, error: e.message }); }
    } // end user loop
    await cronHeartbeat('cron-meeting-prep', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: results.length });
    return res.status(200).json({ ok: true, users: results });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message }); }
}
