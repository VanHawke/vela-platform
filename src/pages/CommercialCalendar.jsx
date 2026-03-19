// CommercialCalendar.jsx — C1 split layout: compact grid + contextual detail panel
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ── Platform tokens (matching index.css exactly) ──────────
const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  // F1
  f1: '#E10600', f1Light: '#FEF2F2', f1Border: '#F7C1C1', f1Dark: '#791F1F',
  // Formula E
  fe: '#0055CC', feLight: '#EBF3FF', feBorder: '#B5D4F4', feDark: '#0C447C',
  // Outreach
  amber: '#B86000', amberLight: '#FFF7ED', amberBorder: '#FAC775',
}

// ── Series icons ──────────────────────────────────────────
const Bolt = ({ fill = '#fff', size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M14 3L5 14h7l-1 7 9-11h-7l1-7z" fill={fill} />
  </svg>
)
const F1Icon = ({ size = 20 }) => (
  <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), background: T.f1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <Bolt fill="#fff" size={Math.round(size * 0.55)} />
  </div>
)
const FEIcon = ({ size = 20 }) => (
  <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), background: T.fe, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <Bolt fill="#fff" size={Math.round(size * 0.52)} />
  </div>
)

// ── Race data (verified from formula1.com + fiaformulae.com) ─
const F1_2026 = [
  { round: 1,  name: 'Australian Grand Prix',    city: 'Melbourne',   date: '2026-03-06', end: '2026-03-08' },
  { round: 2,  name: 'Chinese Grand Prix',       city: 'Shanghai',    date: '2026-03-13', end: '2026-03-15', sprint: true },
  { round: 3,  name: 'Japanese Grand Prix',      city: 'Suzuka',      date: '2026-03-27', end: '2026-03-29' },
  { round: 4,  name: 'Miami Grand Prix',         city: 'Miami',       date: '2026-05-01', end: '2026-05-03', sprint: true },
  { round: 5,  name: 'Canadian Grand Prix',      city: 'Montréal',    date: '2026-05-22', end: '2026-05-24', sprint: true },
  { round: 6,  name: 'Monaco Grand Prix',        city: 'Monte Carlo', date: '2026-06-05', end: '2026-06-07' },
  { round: 7,  name: 'Barcelona-Catalunya GP',   city: 'Barcelona',   date: '2026-06-12', end: '2026-06-14' },
  { round: 8,  name: 'Austrian Grand Prix',      city: 'Spielberg',   date: '2026-06-26', end: '2026-06-28' },
  { round: 9,  name: 'British Grand Prix',       city: 'Silverstone', date: '2026-07-03', end: '2026-07-05', sprint: true },
  { round: 10, name: 'Belgian Grand Prix',       city: 'Spa',         date: '2026-07-17', end: '2026-07-19' },
  { round: 11, name: 'Hungarian Grand Prix',     city: 'Budapest',    date: '2026-07-24', end: '2026-07-26' },
  { round: 12, name: 'Dutch Grand Prix',         city: 'Zandvoort',   date: '2026-08-21', end: '2026-08-23', sprint: true },
  { round: 13, name: 'Italian Grand Prix',       city: 'Monza',       date: '2026-09-04', end: '2026-09-06' },
  { round: 14, name: 'Madrid Grand Prix',        city: 'Madrid',      date: '2026-09-11', end: '2026-09-13' },
  { round: 15, name: 'Azerbaijan Grand Prix',    city: 'Baku',        date: '2026-09-25', end: '2026-09-26', saturday: true },
  { round: 16, name: 'Singapore Grand Prix',     city: 'Singapore',   date: '2026-10-09', end: '2026-10-11', sprint: true },
  { round: 17, name: 'United States Grand Prix', city: 'Austin',      date: '2026-10-23', end: '2026-10-25' },
  { round: 18, name: 'Mexico City Grand Prix',   city: 'Mexico City', date: '2026-10-30', end: '2026-11-01' },
  { round: 19, name: 'São Paulo Grand Prix',     city: 'São Paulo',   date: '2026-11-06', end: '2026-11-08', sprint: true },
  { round: 20, name: 'Las Vegas Grand Prix',     city: 'Las Vegas',   date: '2026-11-19', end: '2026-11-21', saturday: true },
  { round: 21, name: 'Qatar Grand Prix',         city: 'Lusail',      date: '2026-11-27', end: '2026-11-29' },
  { round: 22, name: 'Abu Dhabi Grand Prix',     city: 'Abu Dhabi',   date: '2026-12-04', end: '2026-12-06' },
]
const FE_S12 = [
  { round: 1,  name: 'São Paulo E-Prix',   city: 'São Paulo',   date: '2025-12-06', end: '2025-12-06' },
  { round: 2,  name: 'Mexico City E-Prix', city: 'Mexico City', date: '2026-01-10', end: '2026-01-10' },
  { round: 3,  name: 'Miami E-Prix',       city: 'Miami',       date: '2026-01-31', end: '2026-01-31' },
  { round: 4,  name: 'Jeddah E-Prix 1',   city: 'Jeddah',      date: '2026-02-13', end: '2026-02-13' },
  { round: 5,  name: 'Jeddah E-Prix 2',   city: 'Jeddah',      date: '2026-02-14', end: '2026-02-14' },
  { round: 6,  name: 'Madrid E-Prix',     city: 'Madrid',      date: '2026-03-21', end: '2026-03-21' },
  { round: 7,  name: 'Berlin E-Prix 1',   city: 'Berlin',      date: '2026-05-02', end: '2026-05-02' },
  { round: 8,  name: 'Berlin E-Prix 2',   city: 'Berlin',      date: '2026-05-03', end: '2026-05-03' },
  { round: 9,  name: 'Monaco E-Prix 1',   city: 'Monaco',      date: '2026-05-16', end: '2026-05-16' },
  { round: 10, name: 'Monaco E-Prix 2',   city: 'Monaco',      date: '2026-05-17', end: '2026-05-17' },
  { round: 11, name: 'Sanya E-Prix',      city: 'Sanya',       date: '2026-06-20', end: '2026-06-20' },
  { round: 12, name: 'Shanghai E-Prix 1', city: 'Shanghai',    date: '2026-07-04', end: '2026-07-04' },
  { round: 13, name: 'Shanghai E-Prix 2', city: 'Shanghai',    date: '2026-07-05', end: '2026-07-05' },
  { round: 14, name: 'Tokyo E-Prix 1',    city: 'Tokyo',       date: '2026-07-25', end: '2026-07-25' },
  { round: 15, name: 'Tokyo E-Prix 2',    city: 'Tokyo',       date: '2026-07-26', end: '2026-07-26' },
  { round: 16, name: 'London E-Prix 1',   city: 'London',      date: '2026-08-15', end: '2026-08-15' },
  { round: 17, name: 'London E-Prix 2',   city: 'London',      date: '2026-08-16', end: '2026-08-16' },
]

// ── Helpers ───────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT   = ['M','T','W','T','F','S','S']

function pad(n) { return String(n).padStart(2, '0') }
function toStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}` }
function todayStr() {
  const n = new Date()
  return toStr(n.getFullYear(), n.getMonth(), n.getDate())
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1 }

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000)
  return diff
}
function fmtDateRange(date, end) {
  const d = new Date(date + 'T12:00:00'), e = new Date(end + 'T12:00:00')
  if (date === end) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  if (d.getMonth() === e.getMonth()) return `${d.getDate()}–${e.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`
}
function fmtLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// 14–21 days before any F1 race start = prime outreach window
function isOutreachWindow(dateStr) {
  return F1_2026.some(e => {
    const diff = daysUntil(e.date) - daysUntil(dateStr)
    const d = Math.ceil((new Date(e.date + 'T12:00:00') - new Date(dateStr + 'T12:00:00')) / 86400000)
    return d >= 14 && d <= 21
  })
}
function getNextOutreachRace(dateStr) {
  return F1_2026.find(e => {
    const d = Math.ceil((new Date(e.date + 'T12:00:00') - new Date(dateStr + 'T12:00:00')) / 86400000)
    return d >= 14 && d <= 21
  })
}

// Classify a date cell
function classifyDate(dateStr, showF1, showFE) {
  const f1Events = showF1 ? F1_2026.filter(e => dateStr >= e.date && dateStr <= e.end) : []
  const feEvents = showFE ? FE_S12.filter(e => dateStr >= e.date && dateStr <= e.end) : []
  const isRaceDay = f1Events.some(e => e.end === dateStr)
  const isFeRace  = feEvents.length > 0
  const isWindow  = !f1Events.length && !feEvents.length && isOutreachWindow(dateStr)
  return { f1Events, feEvents, isRaceDay, isFeRace, isWindow }
}

// ── Grid cell ─────────────────────────────────────────────
function Cell({ dateStr, isCurrent, isSelected, today, showF1, showFE, onClick }) {
  const day = parseInt(dateStr.split('-')[2])
  const isToday = dateStr === today
  const { f1Events, feEvents, isRaceDay, isFeRace, isWindow } = classifyDate(dateStr, showF1, showFE)
  const hasF1 = f1Events.length > 0
  const hasEvent = hasF1 || feEvents.length > 0

  // Pick cell background
  let bg = T.surface, borderColor = T.border
  if (isSelected)      { bg = T.text;        borderColor = T.text }
  else if (isRaceDay)  { bg = T.f1;          borderColor = T.f1 }
  else if (hasF1)      { bg = T.f1Light;     borderColor = T.f1Border }
  else if (isFeRace)   { bg = T.feLight;     borderColor = T.feBorder }
  else if (isWindow)   { bg = T.amberLight;  borderColor = T.amberBorder }

  const dayColor = isSelected ? '#fff' : isRaceDay ? '#fff' : hasF1 ? T.f1Dark : isFeRace ? T.feDark : isWindow ? T.amber : T.text
  const opacity  = isCurrent ? 1 : 0.22

  return (
    <div
      onClick={() => isCurrent && onClick(dateStr)}
      style={{
        borderRadius: 6, padding: '5px 6px',
        background: bg,
        border: isToday ? `1.5px solid ${T.text}` : `0.5px solid ${borderColor}`,
        minHeight: 52, display: 'flex', flexDirection: 'column', gap: 2,
        cursor: isCurrent ? 'pointer' : 'default',
        opacity, transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={e => { if (isCurrent && !isSelected) e.currentTarget.style.borderColor = T.borderHover }}
      onMouseLeave={e => { if (isCurrent && !isSelected) e.currentTarget.style.borderColor = borderColor }}
    >
      <span style={{ fontSize: 11, fontWeight: isToday ? 600 : 400, color: dayColor, lineHeight: 1, fontFamily: T.font }}>
        {day}
      </span>
      {/* Event indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' }}>
        {hasF1 && f1Events.slice(0,1).map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 11, height: 11, borderRadius: 3, background: isSelected || isRaceDay ? 'rgba(255,255,255,0.22)' : T.f1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bolt fill="#fff" size={6} />
            </div>
            <span style={{ fontSize: 8, color: isSelected ? 'rgba(255,255,255,0.75)' : isRaceDay ? 'rgba(255,255,255,0.85)' : T.f1Dark, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
              {isRaceDay ? 'Race' : e.city.slice(0,3).toUpperCase()}{e.sprint ? '⚡' : ''}
            </span>
          </div>
        ))}
        {feEvents.length > 0 && feEvents.slice(0,1).map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 11, height: 11, borderRadius: 3, background: isSelected ? 'rgba(255,255,255,0.22)' : T.fe, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bolt fill="#fff" size={6} />
            </div>
            <span style={{ fontSize: 8, color: isSelected ? 'rgba(255,255,255,0.75)' : T.feDark, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
              {e.city.slice(0,3).toUpperCase()}
            </span>
          </div>
        ))}
        {isWindow && !hasEvent && (
          <div style={{ width: 6, height: 6, borderRadius: 1, background: T.amber }} />
        )}
      </div>
    </div>
  )
}

// ── Detail pane ───────────────────────────────────────────
function DetailPane({ selectedDate, today, showF1, showFE }) {
  const allUpcoming = useMemo(() => {
    const evts = []
    if (showF1) F1_2026.forEach(e => evts.push({ ...e, series: 'f1' }))
    if (showFE) FE_S12.forEach(e => evts.push({ ...e, series: 'fe' }))
    return evts.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  }, [today, showF1, showFE])

  const { f1Events, feEvents, isWindow } = selectedDate
    ? classifyDate(selectedDate, showF1, showFE)
    : { f1Events: [], feEvents: [], isWindow: false }
  const outreachRace = selectedDate && isWindow ? getNextOutreachRace(selectedDate) : null

  // Events in the same month as selected (or today's month)
  const refDate = selectedDate || today
  const monthKey = refDate.slice(0, 7)
  const monthEvts = useMemo(() => {
    const evts = []
    if (showF1) F1_2026.forEach(e => { if (e.date.startsWith(monthKey)) evts.push({ ...e, series: 'f1' }) })
    if (showFE) FE_S12.forEach(e => { if (e.date.startsWith(monthKey)) evts.push({ ...e, series: 'fe' }) })
    return evts.sort((a, b) => a.date.localeCompare(b.date))
  }, [monthKey, showF1, showFE])

  const hasSelected = !!selectedDate
  const hasEvents = f1Events.length > 0 || feEvents.length > 0
  const allEvents = [...f1Events.map(e => ({ ...e, series: 'f1' })), ...feEvents.map(e => ({ ...e, series: 'fe' }))].sort((a,b) => a.date.localeCompare(b.date))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface }}>
      {/* Pane header */}
      <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: T.text, fontFamily: T.font }}>
          {hasSelected ? fmtLong(selectedDate) : 'Select a date'}
        </span>
        {hasSelected && selectedDate === today && (
          <span style={{ fontSize: 9, fontWeight: 600, color: '#1565C0', background: '#E3F2FD', border: '0.5px solid #B5D4F4', padding: '2px 8px', borderRadius: 4, fontFamily: T.font }}>Today</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Selected date events */}
        {hasSelected && hasEvents && allEvents.map((event, i) => {
          const isF1 = event.series === 'f1'
          return (
            <div key={i} style={{ padding: '11px 13px', borderRadius: 10, background: isF1 ? T.f1Light : T.feLight, border: `0.5px solid ${isF1 ? T.f1Border : T.feBorder}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {isF1 ? <F1Icon size={32} /> : <FEIcon size={32} />}
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: isF1 ? T.f1Dark : T.feDark, margin: 0, fontFamily: T.font }}>{event.name}</p>
                <p style={{ fontSize: 11, color: isF1 ? T.f1 : T.fe, margin: '2px 0 0', fontFamily: T.font }}>
                  {event.city} · {isF1 ? `R${event.round}` : `S12 R${event.round}`}
                  {event.sprint ? ' · Sprint' : ''}{event.saturday ? ' · Saturday' : ''}
                </p>
              </div>
            </div>
          )
        })}

        {/* No event on selected date */}
        {hasSelected && !hasEvents && (
          <p style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.font }}>No race events on this date.</p>
        )}

        {/* Outreach nudge */}
        {hasSelected && isWindow && outreachRace && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: T.amberLight, border: `0.5px solid ${T.amberBorder}` }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: T.amber, margin: 0, fontFamily: T.font }}>
              Outreach window · {outreachRace.name} in {daysUntil(outreachRace.date)}d
            </p>
            <p style={{ fontSize: 10, color: T.textSecondary, margin: '3px 0 0', lineHeight: 1.5, fontFamily: T.font }}>
              14–21 days before a race is peak window for sponsor decisions. Send Haas pipeline follow-ups now.
            </p>
          </div>
        )}

        {/* This month */}
        {monthEvts.length > 0 && (
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: T.font }}>
              {MONTHS_FULL[parseInt(monthKey.slice(5,7)) - 1]} {monthKey.slice(0,4)}
            </p>
            {monthEvts.map((e, i) => {
              const isF1 = e.series === 'f1'
              const isPast = e.end < today
              const isActive = selectedDate && e.date <= selectedDate && e.end >= selectedDate
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `0.5px solid ${T.border}`, opacity: isPast ? 0.38 : 1 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 1, background: isF1 ? T.f1 : T.fe, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400, color: T.text, fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}{e.sprint ? ' ⚡' : ''}
                  </span>
                  <span style={{ fontSize: 10, color: isActive ? (isF1 ? T.f1 : T.fe) : T.textTertiary, flexShrink: 0, fontFamily: T.font }}>
                    {isActive ? 'Today' : isPast ? fmtDateRange(e.date, e.end) + ' ✓' : fmtDateRange(e.date, e.end)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Next up */}
        {allUpcoming.length > 0 && (
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: T.font }}>Next up</p>
            {allUpcoming.slice(0, 4).map((e, i) => {
              const isF1 = e.series === 'f1'
              const days = daysUntil(e.date)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `0.5px solid ${T.border}` }}>
                  {isF1 ? <F1Icon size={22} /> : <FEIcon size={22} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font }}>{e.name}</p>
                    <p style={{ fontSize: 10, color: T.textTertiary, margin: '1px 0 0', fontFamily: T.font }}>
                      {e.city} · {isF1 ? `R${e.round}` : `S12 R${e.round}`}{e.sprint ? ' · Sprint' : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, color: T.textTertiary, flexShrink: 0, fontFamily: T.font }}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function CommercialCalendar() {
  const now = todayStr()
  const todayYear  = parseInt(now.slice(0, 4))
  const todayMonth = parseInt(now.slice(5, 7)) - 1

  const [viewYear,  setViewYear]  = useState(todayYear)
  const [viewMonth, setViewMonth] = useState(todayMonth)
  const [selected,  setSelected]  = useState(null)
  const [showF1,    setShowF1]    = useState(true)
  const [showFE,    setShowFE]    = useState(true)

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const goToday   = () => { setViewYear(todayYear); setViewMonth(todayMonth) }

  const dim       = daysInMonth(viewYear, viewMonth)
  const firstDay  = firstWeekday(viewYear, viewMonth)
  const prevDim   = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1)

  // Build 42-cell grid
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = viewMonth === 0 ? 11 : viewMonth - 1
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ date: toStr(py, pm, prevDim - i), current: false })
  }
  for (let d = 1; d <= dim; d++) cells.push({ date: toStr(viewYear, viewMonth, d), current: true })
  while (cells.length < 42) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({ date: toStr(ny, nm, cells.length - dim - firstDay + 1), current: false })
  }

  // Stats
  const remF1 = F1_2026.filter(e => e.date >= now).length
  const remFE = FE_S12.filter(e => e.date >= now).length
  const nextEvt = [...(showF1 ? F1_2026 : []), ...(showFE ? FE_S12 : [])].filter(e => e.date >= now).sort((a,b) => a.date.localeCompare(b.date))[0]
  const nextD   = nextEvt ? daysUntil(nextEvt.date) : null

  const handleCellClick = (dateStr) => setSelected(s => s === dateStr ? null : dateStr)

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: T.font, background: T.bg, overflow: 'hidden' }}>

      {/* ── Left: grid ── */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `0.5px solid ${T.border}`, background: T.bg }}>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: `0.5px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <button onClick={prevMonth} style={{ width: 26, height: 26, borderRadius: 7, border: `0.5px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary, cursor: 'pointer' }}>
            <ChevronLeft size={12} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.font }}>
            {MONTHS_FULL[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{ width: 26, height: 26, borderRadius: 7, border: `0.5px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary, cursor: 'pointer' }}>
            <ChevronRight size={12} />
          </button>
          <div style={{ width: '0.5px', height: 14, background: T.border, margin: '0 2px' }} />
          <button onClick={goToday} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `0.5px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font }}>Today</button>
        </div>

        {/* Series toggles row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderBottom: `0.5px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          {[
            { id: 'f1', label: 'F1', on: showF1, set: setShowF1, bg: T.f1, icon: <Bolt fill="#fff" size={9} /> },
            { id: 'fe', label: 'Formula E', on: showFE, set: setShowFE, bg: T.fe, icon: <Bolt fill="#fff" size={9} /> },
          ].map(({ id, label, on, set, bg, icon }) => (
            <button key={id} onClick={() => set(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 6px', borderRadius: 5, border: `0.5px solid ${on ? bg + '60' : T.border}`, background: on ? bg : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: on ? 'rgba(255,255,255,0.2)' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
              <span style={{ fontSize: 10, fontWeight: 500, color: on ? '#fff' : T.textSecondary, fontFamily: T.font }}>{label}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {/* Stats inline */}
          {[
            { val: remF1, color: T.f1 },
            { val: remFE, color: T.fe },
            { val: nextD !== null ? (nextD === 0 ? 'Today' : `${nextD}d`) : '—', color: T.text, label: 'next' },
          ].map(({ val, color, label }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color, fontFamily: T.font }}>{val}</span>
              {label && <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>{label}</span>}
            </div>
          ))}
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '6px 10px 3px', gap: 2, flexShrink: 0, background: T.surface }}>
          {DAYS_SHORT.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 9, color: T.textTertiary, padding: '2px 0', letterSpacing: '0.03em', fontFamily: T.font }}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, padding: '0 10px 10px', flex: 1 }}>
          {cells.map((cell, idx) => (
            <Cell key={idx} dateStr={cell.date} isCurrent={cell.current} isSelected={selected === cell.date} today={now} showF1={showF1} showFE={showFE} onClick={handleCellClick} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ padding: '7px 14px', borderTop: `0.5px solid ${T.border}`, display: 'flex', gap: 12, background: T.surface, flexShrink: 0 }}>
          {[{ bg: T.f1, label: 'F1' }, { bg: T.fe, label: 'Formula E' }, { bg: T.amber, label: 'Outreach' }].map(({ bg, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: 1, background: bg }} />
              <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <DetailPane selectedDate={selected} today={now} showF1={showF1} showFE={showFE} />
    </div>
  )
}
