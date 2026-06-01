// api/calendar-webhook.js — Google Calendar push notifications (real-time sync)
// Receives notifications when calendar events change, fetches updates, stores in kiko_alerts
import { getGoogleToken } from './google-token.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // POST from Google = webhook notification
  if (req.method === 'POST') return handleNotification(req, res);
  // GET = setup or status
  if (req.method === 'GET') return handleSetup(req, res);
  return res.status(405).json({ error: 'POST or GET only' });
}

// Called by Google when calendar changes
async function handleNotification(req, res) {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];
  const resourceId = req.headers['x-goog-resource-id'];

  console.log(`[calendar-webhook] Notification: state=${resourceState}, channel=${channelId}`);

  // 'sync' = initial setup confirmation, just acknowledge
  if (resourceState === 'sync') {
    console.log('[calendar-webhook] Sync notification received — channel active');
    return res.status(200).end();
  }

  // 'exists' = something changed in the calendar
  if (resourceState === 'exists') {
    try {
      // Look up which user this channel belongs to
      const { data: channels } = await supabase
        .from('kiko_calendar_channels')
        .select('user_email')
        .eq('channel_id', channelId)
        .limit(1);

      const email = channels?.[0]?.user_email || 'sunny@vanhawke.agency';
      const accessToken = await getGoogleToken(email);
      if (!accessToken) {
        console.error('[calendar-webhook] No token for', email);
        return res.status(200).end(); // Always return 200 to Google
      }

      // Fetch recent events (last 5 minutes to catch the change)
      const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?updatedMin=${encodeURIComponent(fiveMinAgo)}&maxResults=10&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        const events = eventsData.items || [];
        console.log(`[calendar-webhook] ${events.length} recently changed events for ${email}`);

        // Check for new invites (events where user is attendee with needsAction status)
        for (const event of events) {
          const myAttendee = (event.attendees || []).find(a => a.self);
          if (myAttendee && myAttendee.responseStatus === 'needsAction') {
            // New invite! Create an alert
            await supabase.from('kiko_alerts').upsert({
              alert_type: 'calendar_invite',
              title: `New invite: ${event.summary || 'Untitled'}`,
              body: `${event.organizer?.email || 'Someone'} invited you to "${event.summary}" on ${event.start?.dateTime || event.start?.date || 'TBD'}. Open Calendar to respond.`,
              severity: 'info',
              source: 'calendar-webhook',
              metadata: { eventId: event.id, organizer: event.organizer?.email, start: event.start },
              created_at: new Date().toISOString(),
            }, { onConflict: 'alert_type,title' });
          }
        }
      }

        // Check for upcoming meetings (within 2 hours) — prepare briefs
        for (const event of events) {
          const startTime = new Date(event.start?.dateTime || event.start?.date);
          const hoursUntil = (startTime - Date.now()) / 3600000;
          if (hoursUntil > 0 && hoursUntil < 2 && event.attendees?.length > 0) {
            const attendeeNames = event.attendees.filter(a => !a.self).map(a => a.email).join(', ');
            try {
              await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/kiko`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: `MEETING PREP — You have "${event.summary}" in ${Math.round(hoursUntil * 60)} minutes with: ${attendeeNames}. Prepare a brief: (1) Who are these people? Check CRM and web. (2) What's the context — any deals, emails, or history with them? (3) Key talking points. (4) What outcome should Sunny aim for? Store the prep in manage_knowledge with domain "meeting-prep".`,
                  userEmail: email,
                  currentPage: 'calendar',
                  conversationHistory: [],
                  nostream: true, system: true,
                }),
                signal: AbortSignal.timeout(60000),
              });
              console.log('[calendar-webhook] Meeting prep triggered for:', event.summary);
            } catch (prepErr) { console.warn('[calendar-webhook] Meeting prep failed:', prepErr.message); }
          }
        }
    } catch (err) {
      console.error('[calendar-webhook] Error processing notification:', err.message);
    }
  }

  return res.status(200).end(); // Always 200 to Google
}

// Setup: create or renew watch channel
async function handleSetup(req, res) {
  const email = req.query?.email || 'sunny@vanhawke.agency';

  try {
    const accessToken = await getGoogleToken(email);
    if (!accessToken) return res.status(401).json({ error: 'No Google token' });

    const channelId = randomUUID();
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Create watch channel
    const watchRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: 'https://api.vanhawke.agency/api/calendar-webhook',
          token: `user=${email}`,
          expiration,
        }),
      }
    );

    if (!watchRes.ok) {
      const err = await watchRes.json().catch(() => ({}));
      console.error('[calendar-webhook] Watch setup failed:', err);
      return res.status(watchRes.status).json({ error: 'Watch setup failed', detail: err.error?.message });
    }

    const watchData = await watchRes.json();
    console.log('[calendar-webhook] Watch channel created:', channelId);

    // Store channel info for lookup and renewal
    // Create table if not exists — use upsert
    await supabase.from('kiko_calendar_channels').upsert({
      channel_id: channelId,
      resource_id: watchData.resourceId,
      user_email: email,
      expiration: new Date(expiration).toISOString(),
      created_at: new Date().toISOString(),
    });

    res.json({
      status: 'watching',
      channelId,
      resourceId: watchData.resourceId,
      expiration: new Date(expiration).toISOString(),
    });
  } catch (err) {
    console.error('[calendar-webhook] Setup error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
