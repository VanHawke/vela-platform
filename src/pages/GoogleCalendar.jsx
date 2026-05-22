// GoogleCalendar.jsx — Personal Google Calendar (Phase 1 of Calendar Integration)
// Fetches events from /api/calendar-events, displays in FullCalendar
// Matches Legora design system: Source Serif 4 title, white cards, subtle borders

import { useState, useEffect, useRef, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import PageHeader from '@/components/layout/PageHeader'
import { T, glass } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { Calendar, Clock, MapPin, Users, Video, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'https://api.vanhawke.agency'

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Event detail panel
function EventDetail({ event, onClose }) {
  if (!event) return null
  const ext = event.extendedProps || {}
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '90vw', background: T.card, borderLeft: `1px solid ${T.border}`, boxShadow: T.glassShadowFloat, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: T.font }}>
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.textSecondary }}>Event Detail</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 4 }}><X size={16} /></button>
      </div>
      <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
        <h2 style={{ fontSize: 22, fontWeight: 400, fontFamily: T.fontDisplay, color: T.text, margin: '0 0 16px', letterSpacing: '-0.01em' }}>{event.title}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.textSecondary, fontSize: 13 }}>
            <Clock size={14} />
            <span>{event.allDay ? 'All day' : `${formatTime(event.startStr)} – ${formatTime(event.endStr)}`}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.textSecondary, fontSize: 13 }}>
            <Calendar size={14} />
            <span>{formatDate(event.startStr)}</span>
          </div>
          {ext.location && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: T.textSecondary, fontSize: 13 }}>
              <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{ext.location}</span>
            </div>
          )}
          {ext.meetLink && (
            <a href={ext.meetLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: T.accentSoft, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 13, fontWeight: 500, textDecoration: 'none', marginTop: 4, width: 'fit-content' }}>
              <Video size={14} /> Join Google Meet <ExternalLink size={12} />
            </a>
          )}
          {ext.attendees?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSecondary, marginBottom: 8 }}>Attendees</div>
              {ext.attendees.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: T.text }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: T.textSecondary, flexShrink: 0 }}>
                    {(a.name || a.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 450 }}>{a.name || a.email}</div>
                    {a.name && <div style={{ fontSize: 12, color: T.textSecondary }}>{a.email}</div>}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: a.status === 'accepted' ? T.success : a.status === 'declined' ? T.danger : T.textTertiary }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
          {ext.description && (
            <div style={{ marginTop: 12, padding: 12, background: T.surfaceAlt, borderRadius: T.radiusSm, fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>{ext.description}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GoogleCalendarPage({ user }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [viewTitle, setViewTitle] = useState('')
  const calendarRef = useRef(null)

  const fetchEvents = useCallback(async (from, to) => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email || 'sunny@vanhawke.com'
      const params = new URLSearchParams({ email })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`${API}/api/calendar-events?${params}`)
      if (!res.ok) throw new Error(`Calendar API error: ${res.status}`)
      const data = await res.json()
      setEvents((data.events || []).map(ev => ({
        id: ev.id,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay,
        backgroundColor: ev.meetLink ? 'rgba(125,138,100,0.12)' : 'rgba(10,10,10,0.06)',
        borderColor: ev.meetLink ? 'rgba(125,138,100,0.3)' : 'rgba(10,10,10,0.12)',
        textColor: T.text,
        extendedProps: { location: ev.location, description: ev.description, attendees: ev.attendees, meetLink: ev.meetLink, organizer: ev.organizer, status: ev.status },
      })))
      setError(null)
    } catch (err) {
      console.error('[GoogleCalendar]', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()
    fetchEvents(from, to)
  }, [fetchEvents])

  const handleDatesSet = (info) => {
    setViewTitle(info.view.title)
    fetchEvents(info.startStr, info.endStr)
  }

  const todayCount = events.filter(e => {
    const d = new Date(e.start)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  const weekCount = events.filter(e => {
    const d = new Date(e.start)
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return d >= now && d <= weekEnd
  }).length

  const meetCount = events.filter(e => e.extendedProps?.meetLink).length

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: '100vh', background: T.bg }}>
      <PageHeader
        eyebrowCategory="SCHEDULE"
        eyebrowSuffix="Calendar"
        title="Calendar"
        stats={[
          { value: String(todayCount), label: 'Today' },
          { value: String(weekCount), label: 'This week' },
          { value: String(meetCount), label: 'With Meet' },
        ]}
      />

      <div style={{ padding: '0 44px 44px' }}>
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(184,100,62,0.08)', border: '1px solid rgba(184,100,62,0.2)', borderRadius: T.radiusSm, color: T.danger, fontSize: 13, marginBottom: 16 }}>
            {error}. Check Google account connection in Settings.
          </div>
        )}

        <div style={{ ...glass, padding: 24, position: 'relative' }}>
          {loading && events.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: T.textSecondary, fontSize: 13 }}>Loading calendar...</div>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            }}
            buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day', list: 'List' }}
            events={events}
            eventClick={(info) => { info.jsEvent.preventDefault(); setSelectedEvent(info.event) }}
            datesSet={handleDatesSet}
            height="auto"
            dayMaxEvents={4}
            nowIndicator={true}
            firstDay={1}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventDisplay="block"
            eventBorderColor="transparent"
          />
        </div>
      </div>

      {selectedEvent && (
        <>
          <div onClick={() => setSelectedEvent(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 999 }} />
          <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        </>
      )}

      <style>{`
        .fc { font-family: ${T.font}; font-size: 13px; }
        .fc .fc-toolbar-title { font-family: ${T.fontDisplay}; font-weight: 300; font-size: 22px; letter-spacing: -0.01em; color: ${T.text}; }
        .fc .fc-button { background: ${T.card}; border: 1px solid ${T.border}; color: ${T.text}; font-size: 12px; font-weight: 450; padding: 6px 12px; border-radius: ${T.radiusSm}px; box-shadow: none; text-transform: none; }
        .fc .fc-button:hover { background: ${T.surfaceHover}; border-color: ${T.borderHover}; }
        .fc .fc-button-active, .fc .fc-button:active { background: ${T.text} !important; color: ${T.card} !important; border-color: ${T.text} !important; }
        .fc .fc-button-primary:not(:disabled).fc-button-active { background: ${T.text}; color: ${T.card}; border-color: ${T.text}; }
        .fc td, .fc th { border-color: ${T.border}; }
        .fc .fc-scrollgrid { border-color: ${T.border}; }
        .fc .fc-col-header-cell { background: ${T.surfaceAlt}; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: ${T.textSecondary}; padding: 8px 0; }
        .fc .fc-daygrid-day-number { font-size: 13px; font-weight: 400; color: ${T.textSecondary}; padding: 6px 8px; }
        .fc .fc-daygrid-day.fc-day-today { background: rgba(10,10,10,0.02); }
        .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number { color: ${T.text}; font-weight: 600; }
        .fc .fc-event { cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
        .fc .fc-daygrid-event { margin: 1px 4px; }
        .fc .fc-timegrid-slot { height: 48px; }
        .fc .fc-timegrid-slot-label { font-size: 11px; color: ${T.textTertiary}; }
        .fc .fc-list-event:hover td { background: ${T.surfaceHover}; }
        .fc .fc-list-day-cushion { background: ${T.surfaceAlt}; font-weight: 500; }
        .fc .fc-now-indicator-line { border-color: ${T.danger}; }
        .fc .fc-now-indicator-arrow { border-color: ${T.danger}; }
        .fc .fc-more-link { color: ${T.textSecondary}; font-size: 11px; }
        .fc .fc-popover { border-radius: ${T.radiusSm}px; box-shadow: ${T.glassShadowHover}; border: 1px solid ${T.border}; }
        .fc .fc-popover-header { background: ${T.surfaceAlt}; font-size: 12px; font-weight: 500; }
      `}</style>
    </div>
  )
}
