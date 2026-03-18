// CommercialCalendar.jsx — agenda/timeline layout
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif"

// F1 logo SVG (lightning bolt style)
const F1Logo = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M14 3L5 14h7l-1 7 9-11h-7l1-7z" fill="#fff"/>
  </svg>
)

// Formula E logo SVG
const FELogo = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M14 3L5 14h7l-1 7 9-11h-7l1-7z" fill="#5AC8FF"/>
  </svg>
)

// ── Race data ─────────────────────────────────────────────
const F1_2026 = [
  { round: 1,  name: 'Australian Grand Prix',        city: 'Melbourne',   country: 'Australia',    date: '2026-03-06', end: '2026-03-08' },
  { round: 2,  name: 'Chinese Grand Prix',           city: 'Shanghai',    country: 'China',        date: '2026-03-13', end: '2026-03-15', sprint: true },
  { round: 3,  name: 'Japanese Grand Prix',          city: 'Suzuka',      country: 'Japan',        date: '2026-03-27', end: '2026-03-29' },
  { round: 4,  name: 'Miami Grand Prix',             city: 'Miami',       country: 'USA',          date: '2026-05-01', end: '2026-05-03', sprint: true },
  { round: 5,  name: 'Canadian Grand Prix',          city: 'Montréal',    country: 'Canada',       date: '2026-05-22', end: '2026-05-24', sprint: true },
  { round: 6,  name: 'Monaco Grand Prix',            city: 'Monte Carlo', country: 'Monaco',       date: '2026-06-05', end: '2026-06-07' },
  { round: 7,  name: 'Barcelona-Catalunya GP',       city: 'Barcelona',   country: 'Spain',        date: '2026-06-12', end: '2026-06-14' },
  { round: 8,  name: 'Austrian Grand Prix',          city: 'Spielberg',   country: 'Austria',      date: '2026-06-26', end: '2026-06-28' },
  { round: 9,  name: 'British Grand Prix',           city: 'Silverstone', country: 'UK',           date: '2026-07-03', end: '2026-07-05', sprint: true },
  { round: 10, name: 'Belgian Grand Prix',           city: 'Spa',         country: 'Belgium',      date: '2026-07-17', end: '2026-07-19' },
  { round: 11, name: 'Hungarian Grand Prix',         city: 'Budapest',    country: 'Hungary',      date: '2026-07-24', end: '2026-07-26' },
  { round: 12, name: 'Dutch Grand Prix',             city: 'Zandvoort',   country: 'Netherlands',  date: '2026-08-21', end: '2026-08-23', sprint: true },
  { round: 13, name: 'Italian Grand Prix',           city: 'Monza',       country: 'Italy',        date: '2026-09-04', end: '2026-09-06' },
  { round: 14, name: 'Madrid Grand Prix',            city: 'Madrid',      country: 'Spain',        date: '2026-09-11', end: '2026-09-13' },
  { round: 15, name: 'Azerbaijan Grand Prix',        city: 'Baku',        country: 'Azerbaijan',   date: '2026-09-25', end: '2026-09-26', saturday: true },
  { round: 16, name: 'Singapore Grand Prix',         city: 'Singapore',   country: 'Singapore',    date: '2026-10-09', end: '2026-10-11', sprint: true },
  { round: 17, name: 'United States Grand Prix',     city: 'Austin',      country: 'USA',          date: '2026-10-23', end: '2026-10-25' },
  { round: 18, name: 'Mexico City Grand Prix',       city: 'Mexico City', country: 'Mexico',       date: '2026-10-30', end: '2026-11-01' },
  { round: 19, name: 'São Paulo Grand Prix',         city: 'São Paulo',   country: 'Brazil',       date: '2026-11-06', end: '2026-11-08', sprint: true },
  { round: 20, name: 'Las Vegas Grand Prix',         city: 'Las Vegas',   country: 'USA',          date: '2026-11-19', end: '2026-11-21', saturday: true },
  { round: 21, name: 'Qatar Grand Prix',             city: 'Lusail',      country: 'Qatar',        date: '2026-11-27', end: '2026-11-29' },
  { round: 22, name: 'Abu Dhabi Grand Prix',         city: 'Abu Dhabi',   country: 'UAE',          date: '2026-12-04', end: '2026-12-06' },
]

const FE_S12 = [
  { round: 1,  name: 'São Paulo E-Prix',    city: 'São Paulo',   country: 'Brazil',       date: '2025-12-06', end: '2025-12-06' },
  { round: 2,  name: 'Mexico City E-Prix',  city: 'Mexico City', country: 'Mexico',       date: '2026-01-10', end: '2026-01-10' },
  { round: 3,  name: 'Miami E-Prix',        city: 'Miami',       country: 'USA',          date: '2026-01-31', end: '2026-01-31' },
  { round: 4,  name: 'Jeddah E-Prix 1',     city: 'Jeddah',      country: 'Saudi Arabia', date: '2026-02-13', end: '2026-02-13' },
  { round: 5,  name: 'Jeddah E-Prix 2',     city: 'Jeddah',      country: 'Saudi Arabia', date: '2026-02-14', end: '2026-02-14' },
  { round: 6,  name: 'Madrid E-Prix',       city: 'Madrid',      country: 'Spain',        date: '2026-03-21', end: '2026-03-21' },
  { round: 7,  name: 'Berlin E-Prix 1',     city: 'Berlin',      country: 'Germany',      date: '2026-05-02', end: '2026-05-02' },
  { round: 8,  name: 'Berlin E-Prix 2',     city: 'Berlin',      country: 'Germany',      date: '2026-05-03', end: '2026-05-03' },
  { round: 9,  name: 'Monaco E-Prix 1',     city: 'Monaco',      country: 'Monaco',       date: '2026-05-16', end: '2026-05-16' },
  { round: 10, name: 'Monaco E-Prix 2',     city: 'Monaco',      country: 'Monaco',       date: '2026-05-17', end: '2026-05-17' },
  { round: 11, name: 'Sanya E-Prix',        city: 'Sanya',       country: 'China',        date: '2026-06-20', end: '2026-06-20' },
  { round: 12, name: 'Shanghai E-Prix 1',   city: 'Shanghai',    country: 'China',        date: '2026-07-04', end: '2026-07-04' },
  { round: 13, name: 'Shanghai E-Prix 2',   city: 'Shanghai',    country: 'China',        date: '2026-07-05', end: '2026-07-05' },
  { round: 14, name: 'Tokyo E-Prix 1',      city: 'Tokyo',       country: 'Japan',        date: '2026-07-25', end: '2026-07-25' },
  { round: 15, name: 'Tokyo E-Prix 2',      city: 'Tokyo',       country: 'Japan',        date: '2026-07-26', end: '2026-07-26' },
  { round: 16, name: 'London E-Prix 1',     city: 'London',      country: 'UK',           date: '2026-08-15', end: '2026-08-15' },
  { round: 17, name: 'London E-Prix 2',     city: 'London',      country: 'UK',           date: '2026-08-16', end: '2026-08-16' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function daysUntil(dateStr) {
  const today = toDateStr(new Date())
  const diff = Math.ceil((new Date(dateStr) - new Date(today)) / 86400000)
  return diff
}

function formatDateRange(date, end) {
  const d = new Date(date + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const dM = d.getMonth(), eM = e.getMonth()
  const dD = d.getDate(), eD = e.getDate()
  if (date === end) return `${dD} ${MONTHS[dM]}`
  if (dM === eM) return `${dD}–${eD} ${MONTHS[dM]}`
  return `${dD} ${MONTHS[dM]} – ${eD} ${MONTHS[eM]}`
}

// 14–21 days before an F1 race weekend = prime outreach window
function isOutreachWindow(dateStr) {
  return F1_2026.some(e => {
    const diff = Math.ceil((new Date(e.date) - new Date(dateStr)) / 86400000)
    return diff >= 14 && diff <= 21
  })
}

// ── Row component ─────────────────────────────────────────
function EventRow({ event, isF1, todayStr }) {
  const isPast = event.end < todayStr
  const isToday = event.date <= todayStr && event.end >= todayStr
  const days = daysUntil(event.date)
  const isWindow = !isPast && !isToday && isOutreachWindow(event.date)

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      borderBottom: '0.5px solid rgba(0,0,0,0.06)',
      opacity: isPast ? 0.38 : 1,
      background: isToday ? 'rgba(0,85,204,0.04)' : 'transparent',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
    onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = 'transparent' }}>

      {/* Date column */}
      <div style={{
        width: 80, flexShrink: 0, padding: '14px 16px 14px 20px',
        borderRight: '0.5px solid rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, lineHeight: 1, fontFamily: FONT }}>
          {MONTHS[parseInt(event.date.slice(5,7)) - 1]}
        </p>
        <p style={{ fontSize: 18, fontWeight: 500, color: isPast ? '#ABABAB' : '#1A1A1A', margin: '3px 0 0', lineHeight: 1, fontFamily: FONT }}>
          {formatDateRange(event.date, event.end)}
        </p>
      </div>

      {/* Icon + details */}
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Series icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: isF1 ? '#E10600' : '#0A1628',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isF1 ? <F1Logo size={14} /> : <FELogo size={13} />}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', margin: 0, lineHeight: 1.3, fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.name}
          </p>
          <p style={{ fontSize: 11, color: '#ABABAB', margin: '2px 0 0', fontFamily: FONT }}>
            {event.city} · {isF1 ? `R${event.round}` : `S12 R${event.round}`}
            {event.sprint ? ' · Sprint' : ''}
            {event.saturday ? ' · Saturday' : ''}
          </p>
        </div>

        {/* Right badges */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          {isToday && (
            <span style={{ fontSize: 9, fontWeight: 600, color: '#0C447C', background: '#E6F1FB', border: '0.5px solid #85B7EB', padding: '3px 8px', borderRadius: 4, letterSpacing: '0.04em', fontFamily: FONT }}>
              NOW
            </span>
          )}
          {isWindow && (
            <span style={{ fontSize: 9, fontWeight: 500, color: '#633806', background: '#FAEEDA', border: '0.5px solid #EF9F27', padding: '3px 8px', borderRadius: 4, fontFamily: FONT }}>
              Outreach window
            </span>
          )}
          {!isPast && !isToday && days <= 7 && days >= 0 && (
            <span style={{ fontSize: 9, fontWeight: 500, color: '#3C3489', background: '#EEEDFE', border: '0.5px solid #AFA9EC', padding: '3px 8px', borderRadius: 4, fontFamily: FONT }}>
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Month group header ────────────────────────────────────
function MonthHeader({ label, count }) {
  return (
    <div style={{
      padding: '8px 20px',
      background: 'rgba(0,0,0,0.02)',
      borderBottom: '0.5px solid rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 10, fontWeight: 500, color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: '#ABABAB', fontFamily: FONT }}>{count} {count === 1 ? 'event' : 'events'}</span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function CommercialCalendar() {
  const today = new Date()
  const todayStr = toDateStr(today)

  const [showF1, setShowF1] = useState(true)
  const [showFE, setShowFE] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [scrollToToday, setScrollToToday] = useState(0)

  // Merge + sort all events
  const allEvents = useMemo(() => {
    const events = []
    if (showF1) F1_2026.forEach(e => events.push({ ...e, series: 'f1' }))
    if (showFE) FE_S12.forEach(e => events.push({ ...e, series: 'fe' }))
    return events.sort((a, b) => a.date.localeCompare(b.date))
  }, [showF1, showFE])

  const filtered = useMemo(() => {
    if (showPast) return allEvents
    return allEvents.filter(e => e.end >= todayStr)
  }, [allEvents, showPast, todayStr])

  // Group by month
  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(e => {
      const key = e.date.slice(0, 7) // YYYY-MM
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    return groups
  }, [filtered])

  // Stats
  const upcomingF1 = F1_2026.filter(e => e.date >= todayStr).length
  const upcomingFE = FE_S12.filter(e => e.date >= todayStr).length
  const nextRace = [...F1_2026, ...FE_S12].filter(e => e.date >= todayStr).sort((a,b) => a.date.localeCompare(b.date))[0]
  const nextDays = nextRace ? daysUntil(nextRace.date) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT, background: '#FAFAFA', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        background: '#fff', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', marginRight: 4 }}>2026 season</span>

        {/* Series toggles */}
        {[
          { id: 'f1', label: 'F1', bg: '#E10600', val: showF1, set: setShowF1 },
          { id: 'fe', label: 'Formula E', bg: '#0A1628', val: showFE, set: setShowFE },
        ].map(({ id, label, bg, val, set }) => (
          <button key={id} onClick={() => set(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px 4px 7px', borderRadius: 6,
            border: `0.5px solid ${val ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.06)'}`,
            background: val ? bg : 'transparent',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {id === 'f1'
              ? <div style={{ width: 16, height: 16, borderRadius: 4, background: val ? 'rgba(255,255,255,0.2)' : '#E10600', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><F1Logo size={10} /></div>
              : <div style={{ width: 16, height: 16, borderRadius: 4, background: val ? 'rgba(255,255,255,0.15)' : '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FELogo size={10} /></div>
            }
            <span style={{ fontSize: 11, fontWeight: 500, color: val ? '#fff' : '#6B6B6B', fontFamily: FONT }}>{label}</span>
          </button>
        ))}

        <div style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.08)' }} />

        {/* Past toggle */}
        <button onClick={() => setShowPast(v => !v)} style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          border: `0.5px solid ${showPast ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.06)'}`,
          background: showPast ? 'rgba(0,0,0,0.06)' : 'transparent',
          color: '#6B6B6B', fontFamily: FONT, transition: 'all 0.15s',
        }}>Show past</button>

        <div style={{ flex: 1 }} />

        {/* Quick stats */}
        {[
          { val: upcomingF1, label: 'F1 remaining', color: '#E10600' },
          { val: upcomingFE, label: 'FE remaining', color: '#0A1628' },
          { val: nextDays !== null ? (nextDays === 0 ? 'Today' : `${nextDays}d`) : '—', label: 'next race', color: '#1A1A1A' },
        ].map(({ val, label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 500, color, lineHeight: 1, fontFamily: FONT }}>{val}</span>
            <span style={{ fontSize: 10, color: '#ABABAB', fontFamily: FONT }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Agenda list ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#ABABAB', fontFamily: FONT }}>
            No events to show
          </div>
        ) : (
          Object.entries(grouped).map(([monthKey, events]) => {
            const [yr, mo] = monthKey.split('-')
            const label = `${MONTH_FULL[parseInt(mo) - 1]} ${yr}`
            return (
              <div key={monthKey}>
                <MonthHeader label={label} count={events.length} />
                {events.map((event, i) => (
                  <EventRow key={`${event.series}-${event.round}-${i}`} event={event} isF1={event.series === 'f1'} todayStr={todayStr} />
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
