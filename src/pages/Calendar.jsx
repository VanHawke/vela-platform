import { useState, useEffect, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, X, RefreshCw, Video, MapPin, Users, Clock,
  Loader2, ExternalLink
} from 'lucide-react'

const CATEGORY_COLORS = {
  meeting: '#3b82f6',
  f1: '#8b5cf6',
  investor: '#eab308',
  personal: '#22c55e',
  deadline: '#ef4444',
  default: '#6b7280',
}

export default function Calendar({ user }) {
  const [events, setEvents] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createData, setCreateData] = useState({ title: '', start_time: '', end_time: '', description: '', location: '', attendees: '', add_meet_link: false })
  const [creating, setCreating] = useState(false)
  const calRef = useRef(null)
  const email = user?.email

  useEffect(() => {
    if (email) fetchEvents()
  }, [email])

  const fetchEvents = async () => {
    try {
      const start = new Date(Date.now() - 30 * 86400000).toISOString()
      const end = new Date(Date.now() + 90 * 86400000).toISOString()
      const res = await fetch(`/api/calendar?email=${encodeURIComponent(email)}&start=${start}&end=${end}`)
      const data = await res.json()
      if (data.events) {
        setEvents(data.events.map(e => ({
          id: e.google_event_id || e.id,
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          allDay: e.all_day,
          extendedProps: { ...e },
          backgroundColor: classifyEventColor(e),
          borderColor: classifyEventColor(e),
        })))
      }
    } catch (err) {
      console.error('[Calendar] Fetch error:', err)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'sync' }),
      })
      await fetchEvents()
    } catch (err) {
      console.error('[Calendar] Sync error:', err)
    } finally {
      setSyncing(false)
    }
  }

  const handleEventClick = (info) => {
    setSelectedEvent(info.event.extendedProps)
    setShowCreate(false)
  }

  const handleDateClick = (info) => {
    const start = info.dateStr.includes('T') ? info.dateStr : `${info.dateStr}T09:00`
    const endDate = new Date(new Date(start).getTime() + 3600000)
    const end = endDate.toISOString().slice(0, 16)
    setCreateData(prev => ({ ...prev, start_time: start, end_time: end }))
    setShowCreate(true)
    setSelectedEvent(null)
  }

  const handleCreate = async () => {
    if (!createData.title || !createData.start_time || !createData.end_time) return
    setCreating(true)
    try {
      const attendees = createData.attendees
        ? createData.attendees.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          action: 'create',
          ...createData,
          attendees,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowCreate(false)
        setCreateData({ title: '', start_time: '', end_time: '', description: '', location: '', attendees: '', add_meet_link: false })
        await fetchEvents()
      }
    } catch (err) {
      console.error('[Calendar] Create error:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (eventId) => {
    try {
      await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'delete', event_id: eventId }),
      })
      setSelectedEvent(null)
      await fetchEvents()
    } catch (err) {
      console.error('[Calendar] Delete error:', err)
    }
  }

  return (
    <div className="flex h-full">
      {/* Calendar */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setShowCreate(true); setSelectedEvent(null) }}
              size="sm"
              className="bg-white text-black hover:bg-white/90"
            >
              <Plus className="h-4 w-4 mr-1" /> New Event
            </Button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-white/30 hover:text-white/60 transition-colors p-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-48px)] vela-calendar">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            editable={false}
            selectable={true}
            nowIndicator={true}
            height="100%"
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            firstDay={1}
            eventDisplay="block"
          />
        </div>
      </div>

      {/* Right panel — event detail or create */}
      {(selectedEvent || showCreate) && (
        <div className="w-[340px] border-l border-white/8 flex flex-col flex-shrink-0 overflow-y-auto">
          {showCreate ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">New Event</h3>
                <button onClick={() => setShowCreate(false)} className="text-white/30 hover:text-white/60">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Title</label>
                <Input
                  value={createData.title}
                  onChange={(e) => setCreateData(d => ({ ...d, title: e.target.value }))}
                  className="h-9 text-sm bg-white/5 border-white/10 text-white"
                  placeholder="Meeting title"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={createData.start_time}
                    onChange={(e) => setCreateData(d => ({ ...d, start_time: e.target.value }))}
                    className="w-full h-9 px-2 text-xs rounded-md bg-white/5 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={createData.end_time}
                    onChange={(e) => setCreateData(d => ({ ...d, end_time: e.target.value }))}
                    className="w-full h-9 px-2 text-xs rounded-md bg-white/5 border border-white/10 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Location</label>
                <Input
                  value={createData.location}
                  onChange={(e) => setCreateData(d => ({ ...d, location: e.target.value }))}
                  className="h-9 text-sm bg-white/5 border-white/10 text-white"
                  placeholder="Office / Zoom / etc."
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Attendees (comma-separated emails)</label>
                <Input
                  value={createData.attendees}
                  onChange={(e) => setCreateData(d => ({ ...d, attendees: e.target.value }))}
                  className="h-9 text-sm bg-white/5 border-white/10 text-white"
                  placeholder="john@example.com, jane@example.com"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Description</label>
                <textarea
                  value={createData.description}
                  onChange={(e) => setCreateData(d => ({ ...d, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md bg-white/5 border border-white/10 text-white placeholder:text-white/20 outline-none resize-none"
                  placeholder="Meeting notes..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createData.add_meet_link}
                  onChange={(e) => setCreateData(d => ({ ...d, add_meet_link: e.target.checked }))}
                  className="accent-white"
                />
                <span className="text-xs text-white/50">Add Google Meet link</span>
              </label>
              <Button onClick={handleCreate} disabled={creating || !createData.title} className="w-full bg-white text-black hover:bg-white/90">
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Create Event
              </Button>
            </div>
          ) : selectedEvent && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-white">{selectedEvent.title}</h3>
                <button onClick={() => setSelectedEvent(null)} className="text-white/30 hover:text-white/60">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2 text-white/50">
                  <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{new Date(selectedEvent.start_time).toLocaleString()}</p>
                    <p className="text-white/30">to {new Date(selectedEvent.end_time).toLocaleString()}</p>
                  </div>
                </div>
                {selectedEvent.location && (
                  <div className="flex items-center gap-2 text-white/50">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.meet_link && (
                  <a
                    href={selectedEvent.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                  >
                    <Video className="h-4 w-4" />
                    <span>Join Google Meet</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selectedEvent.attendees?.length > 0 && (
                  <div className="flex items-start gap-2 text-white/50">
                    <Users className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      {selectedEvent.attendees.map((a, i) => (
                        <p key={i} className="text-xs">
                          {a.displayName || a.email}
                          <span className="text-white/20 ml-1">
                            {a.responseStatus === 'accepted' ? '(accepted)' : a.responseStatus === 'declined' ? '(declined)' : '(pending)'}
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedEvent.description && (
                  <div className="text-xs text-white/40 whitespace-pre-wrap mt-2 p-3 bg-white/5 rounded-lg">
                    {selectedEvent.description}
                  </div>
                )}
              </div>
              <Button
                onClick={() => handleDelete(selectedEvent.google_event_id)}
                variant="outline"
                size="sm"
                className="border-red-500/20 text-red-400 hover:bg-red-500/10 w-full mt-4"
              >
                Delete Event
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function classifyEventColor(event) {
  const title = (event.title || '').toLowerCase()
  if (title.includes('f1') || title.includes('formula') || title.includes('race')) return CATEGORY_COLORS.f1
  if (title.includes('investor') || title.includes('board')) return CATEGORY_COLORS.investor
  if (title.includes('personal') || title.includes('gym') || title.includes('lunch')) return CATEGORY_COLORS.personal
  if (title.includes('deadline') || title.includes('due')) return CATEGORY_COLORS.deadline
  return CATEGORY_COLORS.meeting
}
