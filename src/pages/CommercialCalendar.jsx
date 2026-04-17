// CommercialCalendarLegora.jsx
// Mockup-faithful React port of kiko-calendar.html (Option C — race spine + outreach intelligence)
// Uses real F1_2026 / FE_2026 / MGP_2026 / WEC_2026 data from CommercialCalendar.jsx
// outreachTarget() rule (14-21 days before race) drives PEAK badge + sidebar callout

import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import './CommercialCalendar.css'

// ── Race data (mirror of CommercialCalendar.jsx) ──
const F1_2026 = [
  { round: 1,  name: 'Australian Grand Prix',       city: 'Melbourne',    date: '2026-03-06', end: '2026-03-08', flag: '🇦🇺' },
  { round: 2,  name: 'Chinese Grand Prix',          city: 'Shanghai',     date: '2026-03-13', end: '2026-03-15', flag: '🇨🇳', sprint: true },
  { round: 3,  name: 'Japanese Grand Prix',         city: 'Suzuka',       date: '2026-03-27', end: '2026-03-29', flag: '🇯🇵' },
  { round: 4,  name: 'Miami Grand Prix',            city: 'Miami',        date: '2026-05-01', end: '2026-05-03', flag: '🇺🇸', sprint: true },
  { round: 5,  name: 'Canadian Grand Prix',         city: 'Montréal',     date: '2026-05-22', end: '2026-05-24', flag: '🇨🇦', sprint: true },
  { round: 6,  name: 'Monaco Grand Prix',           city: 'Monte Carlo',  date: '2026-06-05', end: '2026-06-07', flag: '🇲🇨' },
  { round: 7,  name: 'Barcelona-Catalunya GP',      city: 'Barcelona',    date: '2026-06-12', end: '2026-06-14', flag: '🇪🇸' },
  { round: 8,  name: 'Austrian Grand Prix',         city: 'Spielberg',    date: '2026-06-26', end: '2026-06-28', flag: '🇦🇹' },
  { round: 9,  name: 'British Grand Prix',          city: 'Silverstone',  date: '2026-07-03', end: '2026-07-05', flag: '🇬🇧', sprint: true },
  { round: 10, name: 'Belgian Grand Prix',          city: 'Spa',          date: '2026-07-17', end: '2026-07-19', flag: '🇧🇪' },
  { round: 11, name: 'Hungarian Grand Prix',        city: 'Budapest',     date: '2026-07-24', end: '2026-07-26', flag: '🇭🇺' },
  { round: 12, name: 'Dutch Grand Prix',            city: 'Zandvoort',    date: '2026-08-21', end: '2026-08-23', flag: '🇳🇱', sprint: true },
  { round: 13, name: 'Italian Grand Prix',          city: 'Monza',        date: '2026-09-04', end: '2026-09-06', flag: '🇮🇹' },
  { round: 14, name: 'Spanish Grand Prix',          city: 'Madrid',       date: '2026-09-11', end: '2026-09-13', flag: '🇪🇸' },
  { round: 15, name: 'Azerbaijan Grand Prix',       city: 'Baku',         date: '2026-09-24', end: '2026-09-26', flag: '🇦🇿' },
  { round: 16, name: 'Singapore Grand Prix',        city: 'Singapore',    date: '2026-10-09', end: '2026-10-11', flag: '🇸🇬', sprint: true },
  { round: 17, name: 'United States Grand Prix',    city: 'Austin',       date: '2026-10-23', end: '2026-10-25', flag: '🇺🇸' },
  { round: 18, name: 'Mexico City Grand Prix',      city: 'Mexico City',  date: '2026-10-30', end: '2026-11-01', flag: '🇲🇽' },
  { round: 19, name: 'São Paulo Grand Prix',        city: 'São Paulo',    date: '2026-11-06', end: '2026-11-08', flag: '🇧🇷' },
  { round: 20, name: 'Las Vegas Grand Prix',        city: 'Las Vegas',    date: '2026-11-19', end: '2026-11-21', flag: '🇺🇸' },
  { round: 21, name: 'Qatar Grand Prix',            city: 'Lusail',       date: '2026-11-27', end: '2026-11-29', flag: '🇶🇦' },
  { round: 22, name: 'Abu Dhabi Grand Prix',        city: 'Abu Dhabi',    date: '2026-12-04', end: '2026-12-06', flag: '🇦🇪' },
]

const FE_2026 = [
  { round: 1,  name: 'São Paulo ePrix',    city: 'São Paulo',   date: '2025-12-06', end: '2025-12-06', flag: '⚡' },
  { round: 2,  name: 'Mexico City ePrix',  city: 'Mexico City', date: '2026-01-10', end: '2026-01-10', flag: '⚡' },
  { round: 3,  name: 'Miami ePrix',        city: 'Miami',       date: '2026-01-31', end: '2026-01-31', flag: '⚡' },
  { round: 4,  name: 'Jeddah ePrix I',     city: 'Jeddah',      date: '2026-02-13', end: '2026-02-13', flag: '⚡' },
  { round: 5,  name: 'Jeddah ePrix II',    city: 'Jeddah',      date: '2026-02-14', end: '2026-02-14', flag: '⚡' },
  { round: 6,  name: 'Madrid ePrix',       city: 'Madrid',      date: '2026-03-21', end: '2026-03-21', flag: '⚡' },
  { round: 7,  name: 'Berlin ePrix I',     city: 'Berlin',      date: '2026-05-02', end: '2026-05-02', flag: '⚡' },
  { round: 8,  name: 'Berlin ePrix II',    city: 'Berlin',      date: '2026-05-03', end: '2026-05-03', flag: '⚡' },
  { round: 9,  name: 'Monaco ePrix I',     city: 'Monaco',      date: '2026-05-16', end: '2026-05-16', flag: '⚡' },
  { round: 10, name: 'Monaco ePrix II',    city: 'Monaco',      date: '2026-05-17', end: '2026-05-17', flag: '⚡' },
  { round: 11, name: 'Sanya ePrix',        city: 'Sanya',       date: '2026-06-20', end: '2026-06-20', flag: '⚡' },
  { round: 12, name: 'Shanghai ePrix I',   city: 'Shanghai',    date: '2026-07-04', end: '2026-07-04', flag: '⚡' },
  { round: 13, name: 'Shanghai ePrix II',  city: 'Shanghai',    date: '2026-07-05', end: '2026-07-05', flag: '⚡' },
  { round: 14, name: 'Tokyo ePrix I',      city: 'Tokyo',       date: '2026-07-25', end: '2026-07-25', flag: '⚡' },
  { round: 15, name: 'Tokyo ePrix II',     city: 'Tokyo',       date: '2026-07-26', end: '2026-07-26', flag: '⚡' },
  { round: 16, name: 'London ePrix I',     city: 'London',      date: '2026-08-15', end: '2026-08-15', flag: '⚡' },
  { round: 17, name: 'London ePrix II',    city: 'London',      date: '2026-08-16', end: '2026-08-16', flag: '⚡' },
]

const MGP_2026 = [
  { round: 1,  name: 'Thai GP',           city: 'Buriram',     date: '2026-02-27', end: '2026-03-01', flag: '🏍️' },
  { round: 2,  name: 'Brazilian GP',      city: 'Goiânia',     date: '2026-03-20', end: '2026-03-22', flag: '🏍️' },
  { round: 3,  name: 'Americas GP',       city: 'Austin',      date: '2026-03-27', end: '2026-03-29', flag: '🏍️' },
  { round: 4,  name: 'Spanish GP',        city: 'Jerez',       date: '2026-04-24', end: '2026-04-26', flag: '🏍️' },
  { round: 5,  name: 'French GP',         city: 'Le Mans',     date: '2026-05-08', end: '2026-05-10', flag: '🏍️' },
  { round: 6,  name: 'Catalan GP',        city: 'Barcelona',   date: '2026-05-15', end: '2026-05-17', flag: '🏍️' },
  { round: 7,  name: 'Italian GP',        city: 'Mugello',     date: '2026-05-29', end: '2026-05-31', flag: '🏍️' },
  { round: 8,  name: 'Hungarian GP',      city: 'Balaton Park', date: '2026-06-05', end: '2026-06-07', flag: '🏍️' },
  { round: 9,  name: 'Czech GP',          city: 'Brno',        date: '2026-06-19', end: '2026-06-21', flag: '🏍️' },
  { round: 10, name: 'Dutch GP',          city: 'Assen',       date: '2026-06-26', end: '2026-06-28', flag: '🏍️' },
  { round: 11, name: 'German GP',         city: 'Sachsenring', date: '2026-07-10', end: '2026-07-12', flag: '🏍️' },
  { round: 12, name: 'British GP',        city: 'Silverstone', date: '2026-08-14', end: '2026-08-16', flag: '🏍️' },
  { round: 13, name: 'Austrian GP',       city: 'Spielberg',   date: '2026-09-04', end: '2026-09-06', flag: '🏍️' },
  { round: 14, name: 'San Marino GP',     city: 'Misano',      date: '2026-09-11', end: '2026-09-13', flag: '🏍️' },
  { round: 15, name: 'Indonesian GP',     city: 'Mandalika',   date: '2026-09-25', end: '2026-09-27', flag: '🏍️' },
  { round: 16, name: 'Japanese GP',       city: 'Motegi',      date: '2026-10-02', end: '2026-10-04', flag: '🏍️' },
  { round: 17, name: 'Australian GP',     city: 'Phillip Island', date: '2026-10-16', end: '2026-10-18', flag: '🏍️' },
  { round: 18, name: 'Malaysian GP',      city: 'Sepang',      date: '2026-10-23', end: '2026-10-25', flag: '🏍️' },
  { round: 19, name: 'Qatar GP',          city: 'Lusail',      date: '2026-11-08', end: '2026-11-08', flag: '🏍️' },
  { round: 20, name: 'Portuguese GP',     city: 'Portimão',    date: '2026-11-15', end: '2026-11-15', flag: '🏍️' },
  { round: 21, name: 'Valencian GP',      city: 'Valencia',    date: '2026-11-22', end: '2026-11-22', flag: '🏍️' },
]

const WEC_2026 = [
  { round: 1, name: '6H of Imola',         city: 'Imola',          date: '2026-04-19', end: '2026-04-19', flag: '🏎️' },
  { round: 2, name: '6H of Spa',           city: 'Spa',            date: '2026-05-09', end: '2026-05-09', flag: '🏎️' },
  { round: 3, name: '24H of Le Mans',      city: 'Le Mans',        date: '2026-06-13', end: '2026-06-14', flag: '🏎️' },
  { round: 4, name: '6H of São Paulo',     city: 'São Paulo',      date: '2026-07-12', end: '2026-07-12', flag: '🏎️' },
  { round: 5, name: '6H of Austin',        city: 'Austin',         date: '2026-09-06', end: '2026-09-06', flag: '🏎️' },
  { round: 6, name: '6H of Fuji',          city: 'Fuji',           date: '2026-09-20', end: '2026-09-20', flag: '🏎️' },
  { round: 7, name: '1812km of Qatar',     city: 'Lusail',         date: '2026-10-24', end: '2026-10-24', flag: '🏎️' },
  { round: 8, name: '8H of Bahrain',       city: 'Sakhir',         date: '2026-11-07', end: '2026-11-07', flag: '🏎️' },
]

function daysUntil(targetDate, fromDate) {
  const t = new Date(targetDate)
  const f = new Date(fromDate)
  return Math.round((t - f) / 86400000)
}

function outreachTarget(dateStr) {
  return F1_2026.find(e => {
    const d = daysUntil(e.date, dateStr)
    return d >= 14 && d <= 21
  })
}


export default function CommercialCalendar({ user }) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Check if current user is super_admin (controls Team/All filter visibility)
  useEffect(() => {
    if (!user?.email) return
    ;(async () => {
      const { data } = await supabase.from('kiko_user_config').select('role').eq('email', user.email).maybeSingle()
      if (data?.role === 'super_admin') setIsSuperAdmin(true)
    })()
  }, [user?.email])
  const today = new Date().toISOString().slice(0, 10)
  const [selectedRound, setSelectedRound] = useState(() => {
    // Default to next race in peak window or just next race
    const peak = outreachTarget(today)
    if (peak) return `f1-${peak.round}`
    const next = F1_2026.find(e => e.date >= today)
    return next ? `f1-${next.round}` : 'f1-4'
  })
  const [seriesFilter, setSeriesFilter] = useState({ f1: true, fe: true, motogp: false, wec: false })
  const [privacyFilter, setPrivacyFilter] = useState('mine')
  const [liveWindows, setLiveWindows] = useState([])
  const [livePerProspect, setLivePerProspect] = useState([])
  const [calEvents, setCalEvents] = useState([])
  const [calLoading, setCalLoading] = useState(true)

  // Fetch Google Calendar events
  useEffect(() => {
    if (!user?.email) { setCalLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/calendar-events?email=${encodeURIComponent(user.email)}`)
        if (!res.ok) { setCalLoading(false); return }
        const data = await res.json()
        if (!cancelled) setCalEvents(data.events || [])
      } catch (e) {
        console.warn('[Calendar] Failed to fetch events:', e.message)
      }
      if (!cancelled) setCalLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.email])
  // Load live outreach intelligence from Supabase (computed nightly cron)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: windows } = await supabase
        .from('outreach_window_suggestions')
        .select('*')
        .order('rank', { ascending: true })
        .limit(4)
      const { data: perProspect } = await supabase
        .from('optimum_outreach_windows')
        .select('*, contacts(name, company)')
        .order('confidence', { ascending: false })
        .limit(5)
      if (cancelled) return
      setLiveWindows(windows || [])
      setLivePerProspect(perProspect || [])
    })()
    return () => { cancelled = true }
  }, [])

  // Build combined chronological round list
  const allRounds = useMemo(() => {
    const list = []
    if (seriesFilter.f1) F1_2026.forEach(r => list.push({ ...r, series: 'f1', id: `f1-${r.round}` }))
    if (seriesFilter.fe) FE_2026.forEach(r => list.push({ ...r, series: 'fe', id: `fe-${r.round}` }))
    if (seriesFilter.motogp) MGP_2026.forEach(r => list.push({ ...r, series: 'motogp', id: `mgp-${r.round}` }))
    if (seriesFilter.wec) WEC_2026.forEach(r => list.push({ ...r, series: 'wec', id: `wec-${r.round}` }))
    return list.sort((a, b) => a.date.localeCompare(b.date))
  }, [seriesFilter])

  const selectedRace = allRounds.find(r => r.id === selectedRound) || F1_2026.find(r => r.round === 4)
  const peakWindow = outreachTarget(today)
  const isPeakRace = peakWindow && selectedRace?.series === 'f1' && selectedRace?.round === peakWindow.round
  const daysToSelected = selectedRace ? daysUntil(selectedRace.date, today) : 0
  const racedCount = F1_2026.filter(r => r.date < today).length
  const nextF1 = F1_2026.find(r => r.date >= today)
  const daysToNextF1 = nextF1 ? daysUntil(nextF1.date, today) : 0

  // Format date range as "1—3 May" or "16 May"
  const fmtRange = (start, end) => {
    const s = new Date(start), e = new Date(end)
    const month = s.toLocaleString('en-GB', { month: 'short' })
    if (start === end) return `${s.getDate()} ${month}`
    return `${s.getDate()}—${e.getDate()} ${month}`
  }

  return (
    <div className="cclg">

      {/* HEAD */}
      <div className="cclg-head">
        <div className="cclg-head-row">
          <div>
            <div className="cclg-eyebrow"><span className="cat">SCHEDULE</span><span className="sep">/</span>2026 motorsport season</div>
            <h1 className="cclg-title">Calendar</h1>
          </div>
          <div className="cclg-filters">
            <div className="cclg-seg">
              <button className={privacyFilter === 'mine' ? 'active' : ''} onClick={() => setPrivacyFilter('mine')}>Mine</button>
              {isSuperAdmin && <>
                <button className={privacyFilter === 'team' ? 'active' : ''} onClick={() => setPrivacyFilter('team')}>Team</button>
                <button className={privacyFilter === 'all' ? 'active' : ''} onClick={() => setPrivacyFilter('all')}>All</button>
              </>}
            </div>
            <button className={`cclg-chip ${seriesFilter.f1 ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, f1: !s.f1 }))}>F1</button>
            <button className={`cclg-chip ${seriesFilter.fe ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, fe: !s.fe }))}>FE</button>
            <button className={`cclg-chip ${seriesFilter.motogp ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, motogp: !s.motogp }))}>MotoGP</button>
            <button className={`cclg-chip ${seriesFilter.wec ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, wec: !s.wec }))}>WEC</button>
          </div>
        </div>
      </div>


      {/* RACE SPINE — horizontal scrolling rounds */}
      <div className="cclg-spine-wrap">
        <div className="cclg-spine-h">
          <div className="lbl"><strong>F1 2026</strong> · 22 rounds · {racedCount} raced{nextF1 ? ` · next round ${nextF1.city} in ${daysToNextF1}d` : ''}</div>
          <div className="lbl">Scroll →</div>
        </div>
        <div className="cclg-spine">
          {allRounds.map(r => {
            const isPast = r.date < today
            const isPeak = peakWindow && r.series === 'f1' && r.round === peakWindow.round
            const isSelected = r.id === selectedRound
            const days = daysUntil(r.date, today)
            return (
              <div
                key={r.id}
                className={`cclg-round ${isPast ? 'past' : ''} ${isPeak ? 'peak' : ''} ${isSelected ? 'selected' : ''} ${r.series === 'fe' ? 'fe-round' : ''}`}
                onClick={() => setSelectedRound(r.id)}
              >
                <div className="rf">{r.flag}</div>
                <div className="rn">{r.series === 'f1' ? `R${r.round}` : `FE${r.round}`}</div>
                <div className="rname">{r.city}</div>
                <div className="rdate">{fmtRange(r.date, r.end)}</div>
                {!isPast && (
                  <div className={`rcount ${isPeak ? 'peak' : ''}`}>in {days}d</div>
                )}
              </div>
            )
          })}
        </div>
      </div>


      {/* AGENDA + RIGHT PANEL */}
      <div className="cclg-body-grid">
        <main className="cclg-agenda">
          <div className="cclg-agenda-h">
            <div className="lbl">This week</div>
            <div className="meta">
              <strong>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}—Sun</strong> · {peakWindow ? `${daysToNextF1}d to ${nextF1.city}` : 'no race weekend'} · 9 events
            </div>
          </div>

          {(() => {
            // Group events by day and show next 7 days
            const days = []
            for (let i = 0; i < 7; i++) {
              const d = new Date(new Date().getTime() + i * 86400000)
              const dateKey = d.toISOString().split('T')[0]
              const dayEvents = calEvents.filter(ev => {
                const evDate = (ev.start || '').split('T')[0]
                return evDate === dateKey
              })
              const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              days.push({ date: d, dateKey, dayName, events: dayEvents, isToday: i === 0 })
            }
            return days.map(day => (
              <div key={day.dateKey} className="cclg-day-block">
                <div className={`cclg-day-h ${day.isToday ? 'today' : ''}`}>
                  <div className="num">{day.date.getDate()}</div>
                  <div className="day-name">{day.date.toLocaleDateString('en-GB', { weekday: 'short' })} · {day.dayName}</div>
                </div>
                <div className="cclg-day-events">
                  {calLoading ? (
                    <div style={{ padding: '12px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>Loading calendar…</div>
                  ) : day.events.length === 0 ? (
                    <div style={{ padding: '12px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                      {day.isToday ? 'No events today' : 'No events'}
                    </div>
                  ) : day.events.map(ev => (
                    <div key={ev.id} className="cclg-ev team" style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <div className="t" style={{ fontSize: 11, color: '#6B6B6B', fontFamily: 'Inter, system-ui, sans-serif', minWidth: 50, flexShrink: 0 }}>
                        {ev.allDay ? 'All day' : new Date(ev.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {!ev.allDay && ev.end && <span style={{ display: 'block', fontSize: 10, color: '#A0A0A0' }}>{Math.round((new Date(ev.end) - new Date(ev.start)) / 60000)} min</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 450, color: '#0A0A0A', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                        {ev.attendees?.length > 0 && (
                          <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2, fontFamily: 'Inter, system-ui, sans-serif' }}>
                            {ev.attendees.slice(0, 3).map(a => a.name || a.email?.split('@')[0]).join(', ')}
                            {ev.attendees.length > 3 && ` +${ev.attendees.length - 3}`}
                          </div>
                        )}
                        {ev.location && <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 1, fontFamily: 'Inter, system-ui, sans-serif' }}>{ev.location.slice(0, 50)}</div>}
                      </div>
                      {ev.meetLink && (
                        <a href={ev.meetLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#06a87d', textDecoration: 'none', flexShrink: 0, alignSelf: 'center' }}>Join</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          })()}
        </main>


        {/* RIGHT SIDEBAR */}
        <aside className="cclg-side">

          {/* Selected race detail */}
          <div className="cclg-side-section">
            <h4>Selected race</h4>
            <div className="cclg-race-detail">
              <div className="race-eyebrow">{selectedRace?.series === 'f1' ? `F1 Round ${selectedRace?.round}` : `Formula E Round ${selectedRace?.round}`} · {daysToSelected > 0 ? `in ${daysToSelected} days` : daysToSelected === 0 ? 'today' : 'past'}</div>
              <div className="race-title">{selectedRace?.flag} {selectedRace?.name}</div>
              <div className="race-meta">{selectedRace?.city} · {fmtRange(selectedRace?.date, selectedRace?.end)}{selectedRace?.sprint ? ' · Sprint weekend' : ''}</div>

              <div className="session-row"><div className="name">Practice</div><div className="when">Fri</div></div>
              <div className="session-row"><div className="name">Qualifying</div><div className="when">Sat</div></div>
              <div className="session-row"><div className="name">Race</div><div className="when">Sun</div></div>

              {isPeakRace && (
                <div className="ow-callout">
                  <div className="ow-callout-h">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    Peak outreach window
                  </div>
                  <div className="ow-window">14—21 days before race</div>
                  <div className="ow-reason">Brand committees finalise activation budgets in this window. Prioritise Haas pipeline follow-ups before the {selectedRace.city} media cycle.</div>
                </div>
              )}
            </div>
          </div>


          {/* Optimum outreach windows */}
          <div className="cclg-side-section">
            <h4>Outreach intelligence</h4>

            {liveWindows.length > 0 ? liveWindows.map((w, i) => (
              <div key={i} className="ow-card">
                <div className="ow-card-h">
                  <div className="ow-when">{w.window_label || 'Window'}</div>
                  <div className="ow-stars">{'★'.repeat(Math.min(w.confidence_stars || 3, 5))}</div>
                </div>
                <div className="ow-context">{w.context || ''}</div>
                <div className="ow-stat">{w.description || ''}</div>
              </div>
            )) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                No outreach intelligence yet — data populates as campaigns run
              </div>
            )}
          </div>

          {/* Briefs ready */}
          <div className="cclg-side-section">
            <h4>Briefs</h4>
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
              No upcoming briefs — Kiko will auto-prep before scheduled meetings
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}
