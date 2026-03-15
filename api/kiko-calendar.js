// api/kiko-calendar.js — Calendar tool handlers for Kiko

export async function getCalendar(input, userEmail) {
  const { days = 7, query } = input
  try {
    const { getGoogleToken } = await import('./google-token.js')
    const token = await getGoogleToken(userEmail)
    const now = new Date()
    const end = new Date(now.getTime() + days * 86400000)
    let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=25`
    if (query) url += `&q=${encodeURIComponent(query)}`
    const calRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const calData = await calRes.json()
    const events = (calData.items || []).map(e => {
      const s = e.start?.dateTime || e.start?.date || ''
      const startStr = s ? new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '?'
      return `• ${startStr} — ${e.summary || '(no title)'}${e.location ? ` @ ${e.location}` : ''}${e.attendees?.length ? ` (${e.attendees.length} attendees)` : ''}`
    })
    if (!events.length) return `No events in the next ${days} days${query ? ` matching "${query}"` : ''}.`
    return `${events.length} event${events.length > 1 ? 's' : ''} in the next ${days} days:\n${events.join('\n')}`
  } catch(e) { return `Calendar error: ${e.message}` }
}

export async function createCalendarEvent(input, userEmail) {
  const { summary, start, end, description, attendees, location } = input
  try {
    const { getGoogleToken } = await import('./google-token.js')
    const token = await getGoogleToken(userEmail)
    const event = {
      summary,
      start: { dateTime: start.includes('T') ? start : `${start}T00:00:00`, timeZone: 'Europe/London' },
      end: { dateTime: end.includes('T') ? end : `${end}T01:00:00`, timeZone: 'Europe/London' },
    }
    if (description) event.description = description
    if (location) event.location = location
    if (attendees) event.attendees = attendees.split(',').map(e => ({ email: e.trim() }))
    const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    })
    const created = await calRes.json()
    if (!calRes.ok) return `Failed to create event: ${JSON.stringify(created)}`
    const startStr = new Date(start).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    return `Event created: "${summary}" on ${startStr}${location ? ` at ${location}` : ''}${attendees ? `. Invites sent to: ${attendees}` : ''}.`
  } catch(e) { return `Calendar error: ${e.message}` }
}
