// api/calendar.js — Calendar operations via Google Calendar API + Supabase cache

import { createClient } from '@supabase/supabase-js';
import { getGoogleToken } from './google-token.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const email = req.query?.email || req.body?.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  let token;
  try {
    token = await getGoogleToken(email);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const action = req.body?.action || req.query?.action;

  try {
    // LIST events from cache
    if (req.method === 'GET' && !action) {
      const start = req.query?.start || new Date().toISOString();
      const end = req.query?.end || new Date(Date.now() + 90 * 86400000).toISOString();

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_email', email)
        .gte('start_time', start)
        .lte('start_time', end)
        .order('start_time', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ events: data || [] });
    }

    // SYNC from Google Calendar
    if (action === 'sync') {
      return await syncCalendar(email, token, res);
    }

    // CREATE event
    if (action === 'create') {
      const { title, start_time, end_time, description, location, attendees, add_meet_link, all_day } = req.body;
      if (!title || !start_time || !end_time) {
        return res.status(400).json({ error: 'title, start_time, end_time required' });
      }

      const event = {
        summary: title,
        description: description || '',
        location: location || '',
        start: all_day
          ? { date: start_time.split('T')[0] }
          : { dateTime: start_time, timeZone: 'Europe/London' },
        end: all_day
          ? { date: end_time.split('T')[0] }
          : { dateTime: end_time, timeZone: 'Europe/London' },
        reminders: { useDefault: true },
      };

      if (attendees?.length > 0) {
        event.attendees = attendees.map(a => typeof a === 'string' ? { email: a } : a);
      }

      if (add_meet_link) {
        event.conferenceData = {
          createRequest: {
            requestId: `vela-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const url = `${GCAL_BASE}/events${add_meet_link ? '?conferenceDataVersion=1' : ''}`;
      const gcalRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      });
      const gcalData = await gcalRes.json();

      if (!gcalRes.ok) {
        console.error('[Calendar] Create error:', gcalData);
        return res.status(gcalRes.status).json(gcalData);
      }

      // Cache in Supabase
      const cached = parseGoogleEvent(gcalData, email);
      await supabase.from('calendar_events').upsert(cached, { onConflict: 'user_email,google_event_id' });

      return res.status(200).json({
        ok: true,
        event: cached,
        meet_link: gcalData.hangoutLink || null,
      });
    }

    // UPDATE event
    if (action === 'update') {
      const { event_id, updates } = req.body;
      if (!event_id) return res.status(400).json({ error: 'event_id required' });

      // Fetch current from Google
      const getRes = await fetch(`${GCAL_BASE}/events/${event_id}`, { headers });
      const current = await getRes.json();
      if (!getRes.ok) return res.status(getRes.status).json(current);

      // Apply updates
      if (updates.title) current.summary = updates.title;
      if (updates.description !== undefined) current.description = updates.description;
      if (updates.location !== undefined) current.location = updates.location;
      if (updates.start_time) current.start = { dateTime: updates.start_time, timeZone: 'Europe/London' };
      if (updates.end_time) current.end = { dateTime: updates.end_time, timeZone: 'Europe/London' };
      if (updates.attendees) current.attendees = updates.attendees.map(a => typeof a === 'string' ? { email: a } : a);

      const patchRes = await fetch(`${GCAL_BASE}/events/${event_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(current),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) return res.status(patchRes.status).json(patchData);

      const cached = parseGoogleEvent(patchData, email);
      await supabase.from('calendar_events').upsert(cached, { onConflict: 'user_email,google_event_id' });

      return res.status(200).json({ ok: true, event: cached });
    }

    // DELETE event
    if (action === 'delete') {
      const { event_id } = req.body;
      if (!event_id) return res.status(400).json({ error: 'event_id required' });

      await fetch(`${GCAL_BASE}/events/${event_id}`, { method: 'DELETE', headers });
      await supabase.from('calendar_events').delete().eq('user_email', email).eq('google_event_id', event_id);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[Calendar] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function syncCalendar(userEmail, token, res) {
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch events from -7 days to +90 days
  const timeMin = new Date(Date.now() - 7 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();

  let allEvents = [];
  let pageToken = null;

  do {
    const url = new URL(`${GCAL_BASE}/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('maxResults', '250');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const gcalRes = await fetch(url.toString(), { headers });
    const data = await gcalRes.json();

    if (!gcalRes.ok) {
      console.error('[CalSync] Error:', data);
      return res.status(gcalRes.status).json(data);
    }

    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  // Upsert all events
  let synced = 0;
  for (const event of allEvents) {
    if (event.status === 'cancelled') continue;
    const parsed = parseGoogleEvent(event, userEmail);
    const { error } = await supabase.from('calendar_events').upsert(parsed, { onConflict: 'user_email,google_event_id' });
    if (!error) synced++;
  }

  console.log(`[CalSync] Synced ${synced} events for ${userEmail}`);
  return res.status(200).json({ synced, total: allEvents.length });
}

function parseGoogleEvent(event, userEmail) {
  return {
    user_email: userEmail,
    google_event_id: event.id,
    title: event.summary || '(No title)',
    description: event.description || '',
    location: event.location || '',
    start_time: event.start?.dateTime || `${event.start?.date}T00:00:00Z`,
    end_time: event.end?.dateTime || `${event.end?.date}T23:59:59Z`,
    all_day: !!event.start?.date,
    attendees: event.attendees || null,
    meet_link: event.hangoutLink || null,
    conference_data: event.conferenceData || null,
    calendar_id: 'primary',
    recurrence: event.recurrence || null,
    status: event.status || 'confirmed',
    updated_at: new Date().toISOString(),
  };
}
