// api/calendar-events.js — Fetch Google Calendar events for the authenticated user
import { getGoogleToken } from './google-token.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const userEmail = req.query.email;
  if (!userEmail) return res.status(400).json({ error: 'email required' });

  // Date range: default 7 days back, 14 days forward
  const now = new Date();
  const timeMin = req.query.from || new Date(now.getTime() - 7 * 86400000).toISOString();
  const timeMax = req.query.to || new Date(now.getTime() + 14 * 86400000).toISOString();

  try {
    const accessToken = await getGoogleToken(userEmail);

    // Fetch from Google Calendar API — primary calendar
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '50');

    const gcalRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!gcalRes.ok) {
      const err = await gcalRes.json().catch(() => ({}));
      console.error('[calendar-events] Google API error:', gcalRes.status, err);
      return res.status(gcalRes.status).json({ error: 'Google Calendar API failed', detail: err.error?.message });
    }

    const gcalData = await gcalRes.json();
    const events = (gcalData.items || []).map(ev => ({
      id: ev.id,
      title: ev.summary || '(No title)',
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !!ev.start?.date && !ev.start?.dateTime,
      location: ev.location || null,
      description: ev.description ? ev.description.slice(0, 200) : null,
      attendees: (ev.attendees || []).slice(0, 5).map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
      meetLink: ev.hangoutLink || ev.conferenceData?.entryPoints?.[0]?.uri || null,
      status: ev.status,
      organizer: ev.organizer?.email,
    }));

    res.json({ events, count: events.length });
  } catch (err) {
    console.error('[calendar-events]', err.message);
    res.status(500).json({ error: err.message });
  }
}
