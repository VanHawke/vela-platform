// api/calendar-events.js — Fetch Google Calendar events for the authenticated user
import { getGoogleToken } from './google-token.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.response && body.eventId) return respondToInvite(req, res); // Accept/decline invite
    return createEvent(req, res);
  }
  if (req.method === 'PATCH' || req.method === 'PUT') return updateEvent(req, res);
  if (req.method === 'DELETE') return deleteEvent(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET, POST, PATCH, DELETE supported' });

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


async function createEvent(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { email, title, start, end, description, location, attendees } = body;

  if (!email) return res.status(400).json({ error: 'email required' });
  if (!title || !start) return res.status(400).json({ error: 'title and start required' });

  try {
    const accessToken = await getGoogleToken(email);

    // Build event object
    const event = {
      summary: title,
      start: start.includes('T')
        ? { dateTime: start, timeZone: 'Europe/London' }
        : { date: start },
      end: end
        ? (end.includes('T') ? { dateTime: end, timeZone: 'Europe/London' } : { date: end })
        : start.includes('T')
          ? { dateTime: new Date(new Date(start).getTime() + 30 * 60000).toISOString(), timeZone: 'Europe/London' }
          : { date: start },
    };
    if (description) event.description = description;
    if (location) event.location = location;
    if (attendees?.length) event.attendees = attendees.map(a => typeof a === 'string' ? { email: a } : a);

    // Auto-add Google Meet link if addMeet flag is true or attendees are present
    const addMeet = body.addMeet !== false && (body.addMeet || attendees?.length > 0);
    if (addMeet) {
      event.conferenceData = {
        createRequest: {
          conferenceSolutionKey: { type: 'hangoutsMeet' },
          requestId: `kiko-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      };
    }

    const gcalUrl = addMeet
      ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1'
      : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    const gcalRes = await fetch(gcalUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!gcalRes.ok) {
      const err = await gcalRes.json().catch(() => ({}));
      return res.status(gcalRes.status).json({ error: 'Failed to create event', detail: err.error?.message });
    }

    const created = await gcalRes.json();
    const meetLink = created.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
    res.json({
      id: created.id,
      title: created.summary,
      start: created.start?.dateTime || created.start?.date,
      end: created.end?.dateTime || created.end?.date,
      link: created.htmlLink,
      meetLink: meetLink || null,
      status: 'created',
    });
  } catch (err) {
    console.error('[calendar-events] Create failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function updateEvent(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { email, eventId, title, start, end, description, location, attendees } = body;

  if (!email || !eventId) return res.status(400).json({ error: 'email and eventId required' });

  try {
    const accessToken = await getGoogleToken(email);
    const patch = {};
    if (title) patch.summary = title;
    if (description !== undefined) patch.description = description;
    if (location !== undefined) patch.location = location;
    if (start) patch.start = start.includes('T') ? { dateTime: start, timeZone: 'Europe/London' } : { date: start };
    if (end) patch.end = end.includes('T') ? { dateTime: end, timeZone: 'Europe/London' } : { date: end };
    if (attendees?.length) patch.attendees = attendees.map(a => typeof a === 'string' ? { email: a } : a);

    const gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!gcalRes.ok) {
      const err = await gcalRes.json().catch(() => ({}));
      return res.status(gcalRes.status).json({ error: 'Failed to update event', detail: err.error?.message });
    }

    const updated = await gcalRes.json();
    res.json({ id: updated.id, title: updated.summary, status: 'updated' });
  } catch (err) {
    console.error('[calendar-events] Update failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function deleteEvent(req, res) {
  const { email, eventId } = req.query || {};
  if (!email || !eventId) return res.status(400).json({ error: 'email and eventId required' });

  try {
    const accessToken = await getGoogleToken(email);
    const gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!gcalRes.ok && gcalRes.status !== 204) {
      const err = await gcalRes.json().catch(() => ({}));
      return res.status(gcalRes.status).json({ error: 'Failed to delete event', detail: err.error?.message });
    }

    res.json({ eventId, status: 'deleted' });
  } catch (err) {
    console.error('[calendar-events] Delete failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// Accept/decline calendar invite
async function respondToInvite(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { email, eventId, response } = body; // response: 'accepted', 'declined', 'tentative'

  if (!email || !eventId || !response) return res.status(400).json({ error: 'email, eventId, and response required' });
  if (!['accepted', 'declined', 'tentative'].includes(response)) return res.status(400).json({ error: 'response must be: accepted, declined, or tentative' });

  try {
    const accessToken = await getGoogleToken(email);

    // Get current event to find attendee list
    const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!getRes.ok) return res.status(getRes.status).json({ error: 'Event not found' });
    const event = await getRes.json();

    // Update my response status
    const attendees = (event.attendees || []).map(a => {
      if (a.self) return { ...a, responseStatus: response };
      return a;
    });

    const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendees }),
    });

    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      return res.status(patchRes.status).json({ error: 'Failed to respond', detail: err.error?.message });
    }

    res.json({ eventId, response, status: 'responded', title: event.summary });
  } catch (err) {
    console.error('[calendar-events] Respond failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}
